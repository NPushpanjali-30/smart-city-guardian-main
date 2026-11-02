import { GraphEdge, GraphNode, haversineDistanceMeters } from './roadGraph.js';
import { SpaceTimeReservationGrid } from './spaceTimeReservations.js';

export interface HazardSource {
  id: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  severity: number; // 0 to 100
  isBlocked: boolean;
}

export interface SwarmPotentialParams {
  kAttractive: number; // Attraction strength toward destination (default: 1000)
  kRepulsive: number;   // Repulsion strength from hazard centers (default: 5000)
  kConductive: number;  // Conductivity of high-capacity unblocked ridges (default: 200)
  epsilon: number;      // Smoothing distance parameter
}

export const DEFAULT_SWARM_PARAMS: SwarmPotentialParams = {
  kAttractive: 1000,
  kRepulsive: 5000,
  kConductive: 200,
  epsilon: 25.0,
};

export class SwarmPotentialField {
  private params: SwarmPotentialParams;

  constructor(params: Partial<SwarmPotentialParams> = {}) {
    this.params = { ...DEFAULT_SWARM_PARAMS, ...params };
  }

  /**
   * Computes the scalar stigmergic potential at a spatial vertex.
   * Lower potential attracts commuter flow; high positive potential deflects commuters.
   */
  public evaluateNodePotential(
    node: GraphNode,
    targetNode: GraphNode,
    hazards: HazardSource[] = []
  ): number {
    // 1. Attractive Sink: -K_att / (dist + eps)
    const distToTarget = haversineDistanceMeters(
      node.latitude,
      node.longitude,
      targetNode.latitude,
      targetNode.longitude
    );
    const vAttractive = -this.params.kAttractive / (distToTarget + this.params.epsilon);

    // 2. Repulsive Barriers from Hazards: + sum [ K_rep * Severity / (dist + eps)^2 ]
    let vRepulsive = 0;
    for (const h of hazards) {
      const distToHazard = haversineDistanceMeters(
        node.latitude,
        node.longitude,
        h.latitude,
        h.longitude
      );

      if (distToHazard <= h.radiusMeters * 2.5) {
        const effectiveDist = Math.max(5.0, distToHazard);
        const barrierHeight = h.isBlocked ? 50000 : (h.severity * 50);
        vRepulsive += (this.params.kRepulsive * barrierHeight) / Math.pow(effectiveDist + this.params.epsilon, 2);
      }
    }

    return vAttractive + vRepulsive;
  }

  /**
   * Evaluates the generalized multi-criteria flow impedance of traversing a directed edge.
   * Combines potential gradient, travel time, and space-time capacity reservation.
   */
  public evaluateEdgeImpedance(
    edge: GraphEdge,
    targetNode: GraphNode,
    toNode: GraphNode,
    hazards: HazardSource[],
    spaceTimeGrid: SpaceTimeReservationGrid,
    arrivalTimeEpochSeconds: number
  ): number {
    // HARD BARRIER: Blocked road has infinite impedance
    if (edge.accessibilityState === 'BLOCKED') {
      return Infinity;
    }

    // 1. Anticipated travel time from space-time grid
    const anticipatedTravelTimeSeconds = spaceTimeGrid.getAnticipatedTravelTimeSeconds(
      edge,
      arrivalTimeEpochSeconds
    );

    // 2. Node potential difference (descent down potential gradient attracts flow)
    const nodePotential = this.evaluateNodePotential(toNode, targetNode, hazards);

    // 3. Flood hazard impedance
    let floodWeight = 1.0;
    if (edge.accessibilityState === 'HIGH_RISK') floodWeight = 8.0;
    else if (edge.accessibilityState === 'CAUTION') floodWeight = 2.0;
    const floodCost = (edge.floodScore / 100) * 120 * floodWeight;

    // 4. Conductive capacity bonus for high-flow, low-volume expressways/arterials
    const anticipatedVolume = spaceTimeGrid.getAnticipatedVolume(edge, arrivalTimeEpochSeconds);
    const capacityRatio = edge.capacityVehiclesPerHour / Math.max(10, anticipatedVolume);
    const conductiveBonus = Math.min(25, capacityRatio * 2.0);

    return Math.max(0.1, anticipatedTravelTimeSeconds + nodePotential + floodCost - conductiveBonus);
  }

  /**
   * Calculates local steering gradient vector at an intersection for real-time deflection.
   * Enables O(1) micro-steering away from emerging hazards without full graph recalculation.
   */
  public calculateLocalSteeringVector(
    currentNode: GraphNode,
    outgoingEdges: GraphEdge[],
    nodeLookup: (id: string) => GraphNode | undefined,
    targetNode: GraphNode,
    hazards: HazardSource[]
  ): { bestEdge: GraphEdge | null; gradients: Array<{ edgeId: string; potential: number }> } {
    const gradients: Array<{ edgeId: string; potential: number }> = [];
    let bestEdge: GraphEdge | null = null;
    let minPotential = Infinity;

    for (const edge of outgoingEdges) {
      if (edge.accessibilityState === 'BLOCKED') continue;
      const nextNode = nodeLookup(edge.toNodeId);
      if (!nextNode) continue;

      const potential = this.evaluateNodePotential(nextNode, targetNode, hazards);
      gradients.push({ edgeId: edge.id, potential });

      if (potential < minPotential) {
        minPotential = potential;
        bestEdge = edge;
      }
    }

    return { bestEdge, gradients };
  }
}
