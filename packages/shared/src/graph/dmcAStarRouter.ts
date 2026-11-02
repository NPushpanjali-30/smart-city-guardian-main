import { GraphEdge, GraphNode, RoadNetworkGraph, haversineDistanceMeters } from './roadGraph.js';
import { PriorityQueue } from './priorityQueue.js';
import { RoadAccessibility } from '../types/index.js';

export interface DMCAStarRoutingParams {
  alphaTimeWeight: number;      // default: 1.0
  betaTrafficWeight: number;    // default: 2.0
  gammaFloodWeight: number;     // default: 40.0
  deltaIncidentWeight: number;  // default: 20.0
  capacityFlowWeight: number;   // default: 1.0
  maxSpeedMetersPerSec: number; // default: 28 m/s (~100 km/h) for admissible heuristic
}

export const DEFAULT_DMC_PARAMS: DMCAStarRoutingParams = {
  alphaTimeWeight: 1.0,
  betaTrafficWeight: 2.0,
  gammaFloodWeight: 40.0,
  deltaIncidentWeight: 20.0,
  capacityFlowWeight: 1.0,
  maxSpeedMetersPerSec: 28.0,
};

export interface PathSearchResult {
  success: boolean;
  edges: GraphEdge[];
  nodeIds: string[];
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  totalCost: number;
  averageRisk: number;
  isBlocked: boolean;
  nodesExpanded: number;
}

export interface KDiverseRoutesResult {
  primaryRoute: PathSearchResult;
  alternativeRoutes: PathSearchResult[];
  allRoutes: PathSearchResult[];
}

/**
 * Dynamic Multi-Criteria Bi-Directional A* Router (DMC-A*)
 * Features:
 * - Simultaneous forward and backward search with admissible Haversine-temporal heuristic
 * - Instant infinite-cost pruning of submerged/blocked segments
 * - Multi-criteria objective: time + traffic congestion + flood hazard + link capacity
 * - K-diverse path finding via structural edge penalties
 * - BPR volume-to-capacity dynamic flow balancing
 */
export class DMCAStarRouter {
  private graph: RoadNetworkGraph;
  private params: DMCAStarRoutingParams;

  constructor(graph: RoadNetworkGraph, params: Partial<DMCAStarRoutingParams> = {}) {
    this.graph = graph;
    this.params = { ...DEFAULT_DMC_PARAMS, ...params };
  }

  /**
   * Computes the generalized multi-criteria traversal cost of an edge.
   */
  public calculateEdgeCost(
    edge: GraphEdge,
    structuralPenaltyMultiplier = 1.0
  ): number {
    // HARD BLOCK RULE: Blocked or submerged edges receive infinite cost and are pruned immediately
    if (edge.accessibilityState === 'BLOCKED') {
      return Infinity;
    }

    // 1. Base travel time (seconds)
    const effectiveSpeedKmh = Math.max(5, edge.currentSpeedKmh || edge.speedLimitKmh);
    const speedMs = (effectiveSpeedKmh * 1000) / 3600;
    const baseTravelTimeSeconds = edge.lengthMeters / speedMs;

    // 2. Traffic congestion delay
    const congestionFactor = edge.trafficScore / 100;
    const trafficDelay = baseTravelTimeSeconds * congestionFactor * this.params.betaTrafficWeight;

    // 3. Flood hazard impedance
    let floodSeverityMultiplier = 0.5;
    if (edge.accessibilityState === 'HIGH_RISK') floodSeverityMultiplier = 10.0;
    else if (edge.accessibilityState === 'CAUTION') floodSeverityMultiplier = 2.0;

    const floodPenalty = (edge.floodScore / 100) * this.params.gammaFloodWeight * 60 * floodSeverityMultiplier;

    // 4. BPR Network Capacity Impedance: t = t0 * [1 + 0.15 * (V/C)^4]
    const volumeToCapacity = edge.capacityVehiclesPerHour > 0
      ? edge.currentVolume / edge.capacityVehiclesPerHour
      : 0;
    const capacityPenalty = baseTravelTimeSeconds * 0.15 * Math.pow(Math.min(2.0, volumeToCapacity), 4) * this.params.capacityFlowWeight;

    // Composite cost scaled by structural alternative penalty
    const rawCost =
      this.params.alphaTimeWeight * baseTravelTimeSeconds +
      trafficDelay +
      floodPenalty +
      capacityPenalty;

    return rawCost * structuralPenaltyMultiplier;
  }

  /**
   * Admissible spatial-temporal heuristic: straight-line distance divided by maximum network speed.
   */
  private heuristic(fromNode: GraphNode, toNode: GraphNode): number {
    const distMeters = haversineDistanceMeters(
      fromNode.latitude,
      fromNode.longitude,
      toNode.latitude,
      toNode.longitude
    );
    return distMeters / this.params.maxSpeedMetersPerSec;
  }

  /**
   * Finds the optimal path using Bi-Directional Multi-Criteria A*.
   */
  public findOptimalPath(
    sourceNodeId: string,
    targetNodeId: string,
    edgePenalties: Map<string, number> = new Map()
  ): PathSearchResult {
    const sourceNode = this.graph.getNode(sourceNodeId);
    const targetNode = this.graph.getNode(targetNodeId);

    if (!sourceNode || !targetNode) {
      return {
        success: false,
        edges: [],
        nodeIds: [],
        totalDistanceMeters: 0,
        totalDurationSeconds: 0,
        totalCost: Infinity,
        averageRisk: 100,
        isBlocked: true,
        nodesExpanded: 0,
      };
    }

    if (sourceNodeId === targetNodeId) {
      return {
        success: true,
        edges: [],
        nodeIds: [sourceNodeId],
        totalDistanceMeters: 0,
        totalDurationSeconds: 0,
        totalCost: 0,
        averageRisk: 0,
        isBlocked: false,
        nodesExpanded: 0,
      };
    }

    // Priority Queues for Forward and Backward search
    const pqForward = new PriorityQueue<string>();
    const pqBackward = new PriorityQueue<string>();

    // g-scores (exact cumulative cost from source/target)
    const gForward = new Map<string, number>();
    const gBackward = new Map<string, number>();

    // Predecessor pointers for path reconstruction
    const parentForward = new Map<string, { edge: GraphEdge; prevNode: string }>();
    const parentBackward = new Map<string, { edge: GraphEdge; nextNode: string }>();

    // Visited sets
    const visitedForward = new Set<string>();
    const visitedBackward = new Set<string>();

    // Initialize source & target
    gForward.set(sourceNodeId, 0);
    gBackward.set(targetNodeId, 0);

    pqForward.push(sourceNodeId, this.heuristic(sourceNode, targetNode));
    pqBackward.push(targetNodeId, this.heuristic(targetNode, sourceNode));

    let bestMeetingNode: string | null = null;
    let minCombinedCost = Infinity;
    let nodesExpanded = 0;

    while (!pqForward.isEmpty && !pqBackward.isEmpty) {
      // 1. Forward Search Step
      const currF = pqForward.pop()!;
      const u = currF.item;
      nodesExpanded++;

      if (!visitedForward.has(u)) {
        visitedForward.add(u);

        // Check meeting with backward search
        if (visitedBackward.has(u)) {
          const cost = (gForward.get(u) || 0) + (gBackward.get(u) || 0);
          if (cost < minCombinedCost) {
            minCombinedCost = cost;
            bestMeetingNode = u;
          }
        }

        const uNode = this.graph.getNode(u);
        const gU = gForward.get(u)!;

        // Early stopping if heuristic lower-bound exceeds best known meeting
        if (gU + (uNode ? this.heuristic(uNode, targetNode) : 0) < minCombinedCost) {
          for (const edge of this.graph.getOutgoingEdges(u)) {
            const v = edge.toNodeId;
            if (visitedForward.has(v)) continue;

            const penalty = edgePenalties.get(edge.id) || 1.0;
            const edgeCost = this.calculateEdgeCost(edge, penalty);
            if (!Number.isFinite(edgeCost)) continue; // Prune blocked edges

            const tentativeG = gU + edgeCost;
            if (tentativeG < (gForward.get(v) ?? Infinity)) {
              gForward.set(v, tentativeG);
              parentForward.set(v, { edge, prevNode: u });

              const vNode = this.graph.getNode(v);
              const h = vNode ? this.heuristic(vNode, targetNode) : 0;
              pqForward.push(v, tentativeG + h);

              if (visitedBackward.has(v)) {
                const combined = tentativeG + (gBackward.get(v) || 0);
                if (combined < minCombinedCost) {
                  minCombinedCost = combined;
                  bestMeetingNode = v;
                }
              }
            }
          }
        }
      }

      // 2. Backward Search Step
      const currB = pqBackward.pop()!;
      const w = currB.item;
      nodesExpanded++;

      if (!visitedBackward.has(w)) {
        visitedBackward.add(w);

        if (visitedForward.has(w)) {
          const cost = (gForward.get(w) || 0) + (gBackward.get(w) || 0);
          if (cost < minCombinedCost) {
            minCombinedCost = cost;
            bestMeetingNode = w;
          }
        }

        const wNode = this.graph.getNode(w);
        const gW = gBackward.get(w)!;

        if (gW + (wNode ? this.heuristic(wNode, sourceNode) : 0) < minCombinedCost) {
          for (const edge of this.graph.getIncomingEdges(w)) {
            const x = edge.fromNodeId;
            if (visitedBackward.has(x)) continue;

            const penalty = edgePenalties.get(edge.id) || 1.0;
            const edgeCost = this.calculateEdgeCost(edge, penalty);
            if (!Number.isFinite(edgeCost)) continue;

            const tentativeG = gW + edgeCost;
            if (tentativeG < (gBackward.get(x) ?? Infinity)) {
              gBackward.set(x, tentativeG);
              parentBackward.set(x, { edge, nextNode: w });

              const xNode = this.graph.getNode(x);
              const h = xNode ? this.heuristic(xNode, sourceNode) : 0;
              pqBackward.push(x, tentativeG + h);

              if (visitedForward.has(x)) {
                const combined = (gForward.get(x) || 0) + tentativeG;
                if (combined < minCombinedCost) {
                  minCombinedCost = combined;
                  bestMeetingNode = x;
                }
              }
            }
          }
        }
      }

      // Termination Condition: If minimum queue priorities exceed best combined cost
      const topF = pqForward.peek()?.priority ?? Infinity;
      const topB = pqBackward.peek()?.priority ?? Infinity;
      if (topF + topB >= minCombinedCost * 1.05 && bestMeetingNode !== null) {
        break;
      }
    }

    if (!bestMeetingNode || !Number.isFinite(minCombinedCost)) {
      return {
        success: false,
        edges: [],
        nodeIds: [],
        totalDistanceMeters: 0,
        totalDurationSeconds: 0,
        totalCost: Infinity,
        averageRisk: 100,
        isBlocked: true,
        nodesExpanded,
      };
    }

    // Reconstruct full path from source -> bestMeetingNode -> target
    const forwardEdges: GraphEdge[] = [];
    const forwardNodes: string[] = [];
    let curr: string = bestMeetingNode;

    while (curr !== sourceNodeId) {
      const step = parentForward.get(curr);
      if (!step) break;
      forwardEdges.unshift(step.edge);
      forwardNodes.unshift(curr);
      curr = step.prevNode;
    }
    forwardNodes.unshift(sourceNodeId);

    const backwardEdges: GraphEdge[] = [];
    const backwardNodes: string[] = [];
    curr = bestMeetingNode;

    while (curr !== targetNodeId) {
      const step = parentBackward.get(curr);
      if (!step) break;
      backwardEdges.push(step.edge);
      backwardNodes.push(step.nextNode);
      curr = step.nextNode;
    }

    const allEdges = [...forwardEdges, ...backwardEdges];
    const allNodeIds = [...forwardNodes, ...backwardNodes];

    let totalDist = 0;
    let totalTimeSec = 0;
    let weightedRisk = 0;

    for (const e of allEdges) {
      totalDist += e.lengthMeters;
      const speedMs = ((e.currentSpeedKmh || e.speedLimitKmh) * 1000) / 3600;
      totalTimeSec += e.lengthMeters / Math.max(1, speedMs);
      weightedRisk += e.compositeRisk * e.lengthMeters;
    }

    return {
      success: true,
      edges: allEdges,
      nodeIds: allNodeIds,
      totalDistanceMeters: Math.round(totalDist),
      totalDurationSeconds: Math.round(totalTimeSec),
      totalCost: Number(minCombinedCost.toFixed(1)),
      averageRisk: totalDist > 0 ? Number((weightedRisk / totalDist).toFixed(1)) : 0,
      isBlocked: false,
      nodesExpanded,
    };
  }

  /**
   * Finds top K structurally diverse routes by penalizing previously traversed edges.
   */
  public findKDiverseRoutes(
    sourceNodeId: string,
    targetNodeId: string,
    k = 3
  ): KDiverseRoutesResult {
    const edgePenalties = new Map<string, number>();
    const discoveredRoutes: PathSearchResult[] = [];
    const maxAttempts = Math.max(k * 3, 8);

    for (let attempt = 0; attempt < maxAttempts && discoveredRoutes.length < k; attempt++) {
      const result = this.findOptimalPath(sourceNodeId, targetNodeId, edgePenalties);
      if (!result.success || result.isBlocked) break;

      if (result.edges.length === 0) {
        if (discoveredRoutes.length === 0) {
          discoveredRoutes.push(result);
        }
        break;
      }

      // Ensure diversity: check if path is structurally distinct (> 25% new edges)
      const edgeIds = new Set(result.edges.map((e) => e.id));
      let isDuplicate = false;

      for (const prev of discoveredRoutes) {
        let overlap = 0;
        for (const e of prev.edges) {
          if (edgeIds.has(e.id)) overlap++;
        }
        if (overlap / Math.max(1, prev.edges.length) > 0.85) {
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate || discoveredRoutes.length === 0) {
        discoveredRoutes.push(result);
      }

      // Apply structural diversity penalty to traversed edges for subsequent searches
      // If it hit a duplicate, apply an escalated penalty (3.5x) so it escapes the already-chosen corridor
      const penaltyMultiplier = isDuplicate ? 3.5 : 2.5;
      for (const e of result.edges) {
        const currentPenalty = edgePenalties.get(e.id) || 1.0;
        edgePenalties.set(e.id, currentPenalty * penaltyMultiplier);
        edgePenalties.set(`${e.id}-rev`, currentPenalty * penaltyMultiplier);
      }
    }

    const primaryRoute = discoveredRoutes[0] || {
      success: false,
      edges: [],
      nodeIds: [],
      totalDistanceMeters: 0,
      totalDurationSeconds: 0,
      totalCost: Infinity,
      averageRisk: 100,
      isBlocked: true,
      nodesExpanded: 0,
    };

    return {
      primaryRoute,
      alternativeRoutes: discoveredRoutes.slice(1),
      allRoutes: discoveredRoutes,
    };
  }

  /**
   * Simulates traffic flow assignment across a path, updating edge volumes for dynamic balancing.
   */
  public assignTrafficFlow(edges: GraphEdge[], vehicleCount = 100): void {
    for (const edge of edges) {
      edge.currentVolume = (edge.currentVolume || 0) + vehicleCount;
    }
  }
}
