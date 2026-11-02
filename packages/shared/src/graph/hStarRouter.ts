import { GraphEdge, GraphNode, RoadNetworkGraph, haversineDistanceMeters } from './roadGraph.js';
import { PriorityQueue } from './priorityQueue.js';
import { SpaceTimeReservationGrid } from './spaceTimeReservations.js';
import { HazardSource, SwarmPotentialField } from './swarmPotentialField.js';
import { assessFloodClearance, analyzeKinematicShockwave, ShockwaveAnalysis } from './hydrodynamicModel.js';

export interface HStarRoutingOptions {
  departureEpochSeconds?: number;
  reserveCapacity?: boolean;
  vehicleBatchCount?: number;
  boltzmannTemperature?: number; // lambda parameter for multi-stream flow dispersion
  floodRiseRateCmPerHour?: number;
  criticalFloodDepthCm?: number;
}

export interface AnticipatoryPathResult {
  success: boolean;
  edges: GraphEdge[];
  nodeIds: string[];
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  totalImpedance: number;
  arrivalEpochSeconds: number;
  isBlocked: boolean;
  preemptedFloodCorridorsCount: number;
  nodesExpanded: number;
}

export interface BoltzmannCorridorStream {
  corridorIndex: number;
  path: AnticipatoryPathResult;
  selectionProbability: number;
  assignedVehicleCount: number;
  impedance: number;
}

export interface MultiStreamFlowResult {
  primaryCorridor: AnticipatoryPathResult;
  streams: BoltzmannCorridorStream[];
  totalVehiclesDispersed: number;
  loadBalancingEfficiencyRatio: number;
  executionDurationMs: number;
}

export class HStarRouter {
  private graph: RoadNetworkGraph;
  private spaceTimeGrid: SpaceTimeReservationGrid;
  private potentialField: SwarmPotentialField;
  private hazards: HazardSource[] = [];

  constructor(
    graph: RoadNetworkGraph,
    spaceTimeGrid?: SpaceTimeReservationGrid,
    potentialField?: SwarmPotentialField
  ) {
    this.graph = graph;
    this.spaceTimeGrid = spaceTimeGrid || new SpaceTimeReservationGrid();
    this.potentialField = potentialField || new SwarmPotentialField();
    this.refreshHazards();
  }

  public getSpaceTimeGrid(): SpaceTimeReservationGrid {
    return this.spaceTimeGrid;
  }

  public getPotentialField(): SwarmPotentialField {
    return this.potentialField;
  }

  /**
   * Refreshes the spatial hazard sources from current graph edges.
   */
  public refreshHazards(): void {
    this.hazards = [];
    for (const edge of this.graph.getAllEdges()) {
      if (edge.accessibilityState === 'BLOCKED' || edge.floodScore >= 70 || edge.trafficScore >= 85) {
        if (edge.coordinates && edge.coordinates.length > 0) {
          const mid = edge.coordinates[Math.floor(edge.coordinates.length / 2)];
          this.hazards.push({
            id: `hazard-${edge.id}`,
            latitude: mid[1],
            longitude: mid[0],
            radiusMeters: Math.max(100, edge.lengthMeters / 2),
            severity: edge.accessibilityState === 'BLOCKED' ? 100 : Math.max(edge.floodScore, edge.trafficScore),
            isBlocked: edge.accessibilityState === 'BLOCKED',
          });
        }
      }
    }
  }

  /**
   * Directly injects a dynamic localized hazard (e.g. flash flood or tanker accident).
   */
  public addHazardSource(hazard: HazardSource): void {
    this.hazards.push(hazard);
  }

  /**
   * Returns current active hazard sources.
   */
  public getHazards(): HazardSource[] {
    return [...this.hazards];
  }

  /**
   * Finds an anticipatory optimal path through 4D space-time,
   * factoring in predicted future arrival congestion and hydraulic flood crest velocity.
   */
  public findAnticipatoryPath(
    sourceNodeId: string,
    targetNodeId: string,
    options: HStarRoutingOptions = {},
    edgePenalties: Map<string, number> = new Map()
  ): AnticipatoryPathResult {
    const departureEpoch = options.departureEpochSeconds || Math.floor(Date.now() / 1000);
    const floodRiseRate = options.floodRiseRateCmPerHour ?? 6.0; // cm/hour
    const criticalDepth = options.criticalFloodDepthCm ?? 28.0;

    const sourceNode = this.graph.getNode(sourceNodeId);
    const targetNode = this.graph.getNode(targetNodeId);

    if (!sourceNode || !targetNode) {
      return {
        success: false,
        edges: [],
        nodeIds: [],
        totalDistanceMeters: 0,
        totalDurationSeconds: 0,
        totalImpedance: Infinity,
        arrivalEpochSeconds: departureEpoch,
        isBlocked: true,
        preemptedFloodCorridorsCount: 0,
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
        totalImpedance: 0,
        arrivalEpochSeconds: departureEpoch,
        isBlocked: false,
        preemptedFloodCorridorsCount: 0,
        nodesExpanded: 0,
      };
    }

    const pq = new PriorityQueue<string>();
    const gScore = new Map<string, number>(); // Accumulated impedance
    const arrivalTime = new Map<string, number>(); // Cumulative timestamp in epoch seconds
    const parent = new Map<string, { edge: GraphEdge; prevNode: string }>();
    const visited = new Set<string>();

    gScore.set(sourceNodeId, 0);
    arrivalTime.set(sourceNodeId, departureEpoch);
    pq.push(sourceNodeId, 0);

    let nodesExpanded = 0;
    let preemptedFloodCount = 0;

    while (!pq.isEmpty) {
      const current = pq.pop()!;
      const u = current.item;

      if (visited.has(u)) continue;
      visited.add(u);
      nodesExpanded++;

      if (u === targetNodeId) break;

      const currentG = gScore.get(u) || 0;
      const currentEpoch = arrivalTime.get(u) || departureEpoch;
      const uNode = this.graph.getNode(u);
      if (!uNode) continue;

      for (const edge of this.graph.getOutgoingEdges(u)) {
        if (edge.accessibilityState === 'BLOCKED') continue;

        const v = edge.toNodeId;
        if (visited.has(v)) continue;

        const vNode = this.graph.getNode(v);
        if (!vNode) continue;

        // 1. Anticipated traversal time under projected future volume
        const anticipatedTravelSeconds = this.spaceTimeGrid.getAnticipatedTravelTimeSeconds(
          edge,
          currentEpoch
        );

        // 2. Kinematic Flood Interception: Predict if edge will drown before vehicle clears it
        const floodClearance = assessFloodClearance(
          edge.waterDepthCm || (edge.floodScore / 100) * 20,
          criticalDepth,
          floodRiseRate,
          anticipatedTravelSeconds
        );

        if (floodClearance.isPreemptivelyUnsafe) {
          preemptedFloodCount++;
          continue; // Pre-emptively prune corridor before commuter gets trapped!
        }

        // 3. Stigmergic swarm-potential impedance
        const potentialImpedance = this.potentialField.evaluateEdgeImpedance(
          edge,
          targetNode,
          vNode,
          this.hazards,
          this.spaceTimeGrid,
          currentEpoch
        );

        // Structural diversity penalty multiplier (for multi-stream searches)
        const structuralPenalty = edgePenalties.get(edge.id) || 1.0;
        const totalEdgeCost = potentialImpedance * structuralPenalty;

        const tentativeG = currentG + totalEdgeCost;

        if (tentativeG < (gScore.get(v) ?? Infinity)) {
          gScore.set(v, tentativeG);
          arrivalTime.set(v, currentEpoch + anticipatedTravelSeconds);
          parent.set(v, { edge, prevNode: u });

          // Heuristic guided by straight-line distance to sink target
          const distToTarget = haversineDistanceMeters(vNode.latitude, vNode.longitude, targetNode.latitude, targetNode.longitude);
          const heuristic = distToTarget / 28.0; // Admissible speed upper bound

          pq.push(v, tentativeG + heuristic);
        }
      }
    }

    if (!parent.has(targetNodeId)) {
      return {
        success: false,
        edges: [],
        nodeIds: [],
        totalDistanceMeters: 0,
        totalDurationSeconds: 0,
        totalImpedance: Infinity,
        arrivalEpochSeconds: departureEpoch,
        isBlocked: true,
        preemptedFloodCorridorsCount: preemptedFloodCount,
        nodesExpanded,
      };
    }

    // Reconstruct forward path
    const pathEdges: GraphEdge[] = [];
    const pathNodes: string[] = [targetNodeId];
    let curr = targetNodeId;
    let totalDist = 0;
    let totalDur = 0;

    while (curr !== sourceNodeId) {
      const p = parent.get(curr)!;
      pathEdges.unshift(p.edge);
      pathNodes.unshift(p.prevNode);
      totalDist += p.edge.lengthMeters;
      curr = p.prevNode;
    }

    const finalArrivalEpoch = arrivalTime.get(targetNodeId) || departureEpoch;
    totalDur = finalArrivalEpoch - departureEpoch;

    // Register space-time reservation if requested
    if (options.reserveCapacity) {
      let tCursor = departureEpoch;
      for (const e of pathEdges) {
        const segDur = this.spaceTimeGrid.getAnticipatedTravelTimeSeconds(e, tCursor);
        this.spaceTimeGrid.reserveLinkOccupancy(e.id, tCursor, tCursor + segDur, 1);
        tCursor += segDur;
      }
    }

    return {
      success: true,
      edges: pathEdges,
      nodeIds: pathNodes,
      totalDistanceMeters: totalDist,
      totalDurationSeconds: Math.round(totalDur),
      totalImpedance: Number((gScore.get(targetNodeId) || 0).toFixed(2)),
      arrivalEpochSeconds: finalArrivalEpoch,
      isBlocked: false,
      preemptedFloodCorridorsCount: preemptedFloodCount,
      nodesExpanded,
    };
  }

  /**
   * Multi-Stream Boltzmann Flow Dissipation:
   * Dynamically calculates multiple resilient corridors and distributes commuter demand
   * across them probabilistically (Wardrop System Optimum), avoiding the classic
   * Braess' Paradox where 100% of commuters flock to the same single detour.
   */
  public findBoltzmannMultiStreamCorridors(
    sourceNodeId: string,
    targetNodeId: string,
    options: HStarRoutingOptions = {}
  ): MultiStreamFlowResult {
    const t0 = performance.now();
    const batchCount = options.vehicleBatchCount || 100;
    const lambda = options.boltzmannTemperature ?? 0.03; // Dispersion sensitivity

    const edgePenalties = new Map<string, number>();
    const discoveredPaths: AnticipatoryPathResult[] = [];
    const maxCorridors = 3;

    for (let c = 0; c < maxCorridors; c++) {
      const pathRes = this.findAnticipatoryPath(sourceNodeId, targetNodeId, options, edgePenalties);
      if (!pathRes.success || pathRes.isBlocked) break;

      if (pathRes.edges.length === 0) {
        if (discoveredPaths.length === 0) {
          discoveredPaths.push(pathRes);
        }
        break;
      }

      // Verify topological distinction (> 20% distinct edges)
      const edgeIds = new Set(pathRes.edges.map((e) => e.id));
      let isDuplicate = false;
      for (const prev of discoveredPaths) {
        let overlap = 0;
        for (const pe of prev.edges) {
          if (edgeIds.has(pe.id)) overlap++;
        }
        if (overlap / Math.max(1, prev.edges.length) > 0.8) {
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate || discoveredPaths.length === 0) {
        discoveredPaths.push(pathRes);
      }

      // Penalize traversed edges for next stream search
      for (const e of pathRes.edges) {
        const cur = edgePenalties.get(e.id) || 1.0;
        edgePenalties.set(e.id, cur * 2.8);
        edgePenalties.set(`${e.id}-rev`, cur * 2.8);
      }
    }

    if (discoveredPaths.length === 0) {
      const executionDurationMs = Number((performance.now() - t0).toFixed(3));
      return {
        primaryCorridor: {
          success: false,
          edges: [],
          nodeIds: [],
          totalDistanceMeters: 0,
          totalDurationSeconds: 0,
          totalImpedance: Infinity,
          arrivalEpochSeconds: 0,
          isBlocked: true,
          preemptedFloodCorridorsCount: 0,
          nodesExpanded: 0,
        },
        streams: [],
        totalVehiclesDispersed: 0,
        loadBalancingEfficiencyRatio: 0,
        executionDurationMs,
      };
    }

    // Compute Boltzmann partition function: Z = sum [ exp(-lambda * Impedance_k) ]
    const minImpedance = Math.min(...discoveredPaths.map((p) => p.totalImpedance));
    const expWeights = discoveredPaths.map((p) => Math.exp(-lambda * (p.totalImpedance - minImpedance)));
    const partitionZ = expWeights.reduce((acc, w) => acc + w, 0);

    const streams: BoltzmannCorridorStream[] = [];
    let distributedVehicles = 0;

    for (let i = 0; i < discoveredPaths.length; i++) {
      const prob = partitionZ > 0 ? expWeights[i] / partitionZ : (1 / discoveredPaths.length);
      const assignedCount = Math.round(batchCount * prob);
      distributedVehicles += assignedCount;

      streams.push({
        corridorIndex: i,
        path: discoveredPaths[i],
        selectionProbability: Number(prob.toFixed(3)),
        assignedVehicleCount: assignedCount,
        impedance: discoveredPaths[i].totalImpedance,
      });

      // Reserve space-time slots for the distributed vehicles
      if (options.reserveCapacity && assignedCount > 0) {
        let tCursor = options.departureEpochSeconds || Math.floor(Date.now() / 1000);
        for (const e of discoveredPaths[i].edges) {
          const segDur = this.spaceTimeGrid.getAnticipatedTravelTimeSeconds(e, tCursor);
          this.spaceTimeGrid.reserveLinkOccupancy(e.id, tCursor, tCursor + segDur, assignedCount);
          tCursor += segDur;
        }
      }
    }

    // Load balancing efficiency: Ratio of load spread compared to pure single-corridor concentration
    const maxStreamShare = Math.max(...streams.map((s) => s.selectionProbability));
    const loadBalancingEfficiencyRatio = Number((1.0 - maxStreamShare * 0.5).toFixed(2));
    const executionDurationMs = Number((performance.now() - t0).toFixed(3));

    return {
      primaryCorridor: discoveredPaths[0],
      streams,
      totalVehiclesDispersed: distributedVehicles,
      loadBalancingEfficiencyRatio,
      executionDurationMs,
    };
  }

  /**
   * Instantaneous O(1) steering deflection vector.
   * Directs an active vehicle at an upcoming node away from sudden downstream obstacles.
   */
  public computeEmergencyDeflection(
    currentNodeId: string,
    targetNodeId: string
  ): { nextEdge: GraphEdge | null; reason: string } {
    const currentNode = this.graph.getNode(currentNodeId);
    const targetNode = this.graph.getNode(targetNodeId);

    if (!currentNode || !targetNode) {
      return { nextEdge: null, reason: 'Invalid node coordinates for deflection' };
    }

    const outgoing = this.graph.getOutgoingEdges(currentNodeId);
    const steering = this.potentialField.calculateLocalSteeringVector(
      currentNode,
      outgoing,
      (id) => this.graph.getNode(id),
      targetNode,
      this.hazards
    );

    if (!steering.bestEdge) {
      return { nextEdge: null, reason: 'No unblocked outgoing corridor available' };
    }

    return {
      nextEdge: steering.bestEdge,
      reason: `Deflected onto ${steering.bestEdge.name} via lowest swarm-potential gradient`,
    };
  }
}
