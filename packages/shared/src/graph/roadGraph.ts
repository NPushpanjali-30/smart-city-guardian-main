import { RoadAccessibility, RoadSegment } from '../types/index.js';

export interface GraphNode {
  id: string;
  name?: string;
  latitude: number;
  longitude: number;
  elevationMeters?: number;
}

export interface GraphEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  name: string;
  roadClass: 'primary' | 'secondary' | 'residential' | 'highway';
  lengthMeters: number;
  speedLimitKmh: number;
  currentSpeedKmh: number;
  freeFlowSpeedKmh: number;
  trafficScore: number;
  floodScore: number;
  compositeRisk: number;
  accessibilityState: RoadAccessibility;
  waterDepthCm?: number;
  blockageReason?: string | null;
  coordinates: [number, number][];
  capacityVehiclesPerHour: number;
  currentVolume: number;
}

/**
 * Calculates great-circle distance between two geographic coordinates using the Haversine formula.
 */
export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * High-performance spatial adjacency-list graph representing metropolitan road network.
 */
export class RoadNetworkGraph {
  public nodes: Map<string, GraphNode> = new Map();
  public outgoingEdges: Map<string, GraphEdge[]> = new Map();
  public incomingEdges: Map<string, GraphEdge[]> = new Map();
  public edgeMap: Map<string, GraphEdge> = new Map();

  public addNode(node: GraphNode): void {
    this.nodes.set(node.id, node);
    if (!this.outgoingEdges.has(node.id)) {
      this.outgoingEdges.set(node.id, []);
    }
    if (!this.incomingEdges.has(node.id)) {
      this.incomingEdges.set(node.id, []);
    }
  }

  public addEdge(edge: GraphEdge, bidirectional = true): void {
    this.edgeMap.set(edge.id, edge);

    if (!this.outgoingEdges.has(edge.fromNodeId)) {
      this.outgoingEdges.set(edge.fromNodeId, []);
    }
    this.outgoingEdges.get(edge.fromNodeId)!.push(edge);

    if (!this.incomingEdges.has(edge.toNodeId)) {
      this.incomingEdges.set(edge.toNodeId, []);
    }
    this.incomingEdges.get(edge.toNodeId)!.push(edge);

    // If bidirectional, add reverse edge with distinct id
    if (bidirectional) {
      const reverseEdge: GraphEdge = {
        ...edge,
        id: `${edge.id}-rev`,
        fromNodeId: edge.toNodeId,
        toNodeId: edge.fromNodeId,
        coordinates: [...edge.coordinates].reverse(),
      };
      this.edgeMap.set(reverseEdge.id, reverseEdge);

      if (!this.outgoingEdges.has(reverseEdge.fromNodeId)) {
        this.outgoingEdges.set(reverseEdge.fromNodeId, []);
      }
      this.outgoingEdges.get(reverseEdge.fromNodeId)!.push(reverseEdge);

      if (!this.incomingEdges.has(reverseEdge.toNodeId)) {
        this.incomingEdges.set(reverseEdge.toNodeId, []);
      }
      this.incomingEdges.get(reverseEdge.toNodeId)!.push(reverseEdge);
    }
  }

  public getAllNodes(): GraphNode[] {
    return Array.from(this.nodes.values());
  }

  public getAllEdges(): GraphEdge[] {
    return Array.from(this.edgeMap.values());
  }

  public getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  public getEdge(id: string): GraphEdge | undefined {
    return this.edgeMap.get(id);
  }

  public getOutgoingEdges(nodeId: string): GraphEdge[] {
    return this.outgoingEdges.get(nodeId) || [];
  }

  public getIncomingEdges(nodeId: string): GraphEdge[] {
    return this.incomingEdges.get(nodeId) || [];
  }

  /**
   * Snaps an arbitrary GPS coordinate to the nearest road network node.
   */
  public findNearestNode(
    latitude: number,
    longitude: number
  ): { node: GraphNode; distanceMeters: number } | null {
    let nearestNode: GraphNode | null = null;
    let minDistance = Infinity;

    for (const node of this.nodes.values()) {
      const dist = haversineDistanceMeters(latitude, longitude, node.latitude, node.longitude);
      if (dist < minDistance) {
        minDistance = dist;
        nearestNode = node;
      }
    }

    if (!nearestNode) return null;
    return { node: nearestNode, distanceMeters: Math.round(minDistance) };
  }

  /**
   * Updates real-time conditions (flood, traffic, accessibility) for a specific road edge.
   */
  public updateEdgeConditions(edgeId: string, updates: Partial<GraphEdge>): void {
    const edge = this.edgeMap.get(edgeId);
    if (edge) {
      Object.assign(edge, updates);
    }
    const revEdge = this.edgeMap.get(`${edgeId}-rev`);
    if (revEdge) {
      Object.assign(revEdge, updates);
    }
  }

  /**
   * Factory method to build a graph from road segments.
   * Derives nodes from segment start and end coordinates, snapping nearby endpoints within 30m.
   */
  public static fromRoadSegments(segments: RoadSegment[]): RoadNetworkGraph {
    const graph = new RoadNetworkGraph();
    const nodeCoordsMap = new Map<string, string>(); // 'lat,lon' -> nodeId
    let nodeCounter = 1;

    function getOrCreateNode(coord: [number, number], label?: string): string {
      const key = `${coord[1].toFixed(5)},${coord[0].toFixed(5)}`;
      if (nodeCoordsMap.has(key)) {
        return nodeCoordsMap.get(key)!;
      }

      // Check if within 30m of an existing node to fuse into a single intersection
      for (const existingNode of graph.getAllNodes()) {
        const dist = haversineDistanceMeters(coord[1], coord[0], existingNode.latitude, existingNode.longitude);
        if (dist <= 30) {
          nodeCoordsMap.set(key, existingNode.id);
          return existingNode.id;
        }
      }

      const nodeId = `node-${nodeCounter++}`;
      graph.addNode({
        id: nodeId,
        name: label || `Intersection ${nodeId}`,
        latitude: coord[1],
        longitude: coord[0],
      });
      nodeCoordsMap.set(key, nodeId);
      return nodeId;
    }

    for (const seg of segments) {
      if (!seg.coordinates || seg.coordinates.length < 2) continue;
      const startCoord = seg.coordinates[0];
      const endCoord = seg.coordinates[seg.coordinates.length - 1];

      const fromNodeId = getOrCreateNode(startCoord, `${seg.name} (Start)`);
      const toNodeId = getOrCreateNode(endCoord, `${seg.name} (End)`);

      const edge: GraphEdge = {
        id: seg.id,
        fromNodeId,
        toNodeId,
        name: seg.name,
        roadClass: seg.roadClass,
        lengthMeters: seg.lengthMeters,
        speedLimitKmh: seg.speedLimitKmh,
        currentSpeedKmh: seg.speedLimitKmh * (1 - (seg.trafficScore / 100) * 0.7),
        freeFlowSpeedKmh: seg.speedLimitKmh,
        trafficScore: seg.trafficScore,
        floodScore: seg.floodScore,
        compositeRisk: seg.compositeRisk,
        accessibilityState: seg.accessibilityState,
        blockageReason: seg.blockageReason,
        coordinates: seg.coordinates,
        capacityVehiclesPerHour: seg.roadClass === 'highway' ? 2400 : seg.roadClass === 'primary' ? 1600 : 900,
        currentVolume: 200,
      };

      graph.addEdge(edge, true);
    }

    return graph;
  }
}
