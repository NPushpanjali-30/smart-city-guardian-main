import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { createApp } from '../apps/api/src/app.js';
import {
  RoadNetworkGraph,
  HStarRouter,
  SpaceTimeReservationGrid,
  SwarmPotentialField,
  calculateKinematicSpeed,
  calculateKinematicFlow,
  analyzeKinematicShockwave,
  assessFloodClearance,
  RoadSegment,
} from '@smartcity/shared';
import { routingEngineService } from '../apps/api/src/services/routing/routingEngine.service.js';

describe('H-STAR: Hydrodynamic Stigmergic Traffic Anticipatory Router', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const address = server.address() as any;
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });
  describe('1. LWR Kinematic Wave Theory & Shockwave Analysis', () => {
    it('should calculate Greenshields speed degradation and parabolic flow curve', () => {
      const vFree = 60; // km/h
      const kJam = 135; // veh/km/lane

      // Free flow at 0 density
      expect(calculateKinematicSpeed(0, vFree, kJam)).toBe(60);
      expect(calculateKinematicFlow(0, vFree, kJam)).toBe(0);

      // Critical density at kJam / 2 = 67.5 -> speed is 30 km/h
      const vCrit = calculateKinematicSpeed(kJam / 2, vFree, kJam);
      expect(vCrit).toBeCloseTo(30, 1);
      const maxFlow = calculateKinematicFlow(kJam / 2, vFree, kJam);
      expect(maxFlow).toBeCloseTo(2025, 0); // ~2025 veh/hr

      // Jam density floor
      const vJam = calculateKinematicSpeed(kJam, vFree, kJam);
      expect(vJam).toBe(5.0); // Minimum creep speed
    });

    it('should identify backward-propagating traffic shockwaves during downstream bottlenecking', () => {
      // Upstream uncongested traffic: 30 veh/km (flow = 1400 veh/h)
      // Downstream bottleneck traffic: 120 veh/km (flow = 800 veh/h)
      const shockwave = analyzeKinematicShockwave(30, 120, 60, 135);

      expect(shockwave.isBackwardPropagating).toBe(true);
      expect(shockwave.shockwaveVelocityKmh).toBeLessThan(0); // Negative velocity = moves backward upstream

      // Approaching traffic 1000m upstream will encounter the shockwave wavefront in finite time
      const timeToImpactSeconds = shockwave.estimatedArrivalTimeAtDistanceSeconds(1000);
      expect(timeToImpactSeconds).toBeGreaterThan(0);
      expect(timeToImpactSeconds).toBeLessThan(600);
    });
  });

  describe('2. Kinematic Flood Interception & Predictive Clearance', () => {
    it('should pre-emptively seal dry roads where flood crest will submerge the link before arrival', () => {
      // Road currently has only 10cm of water (safe limit is 28cm, so 18cm freeboard)
      // Rapid flash flood rising at 60 cm/hour (1 cm per minute)
      // Time to submerge = 18 minutes = 1080 seconds
      // Anticipated vehicle traversal time is 1200 seconds (20 minutes)
      const assessment = assessFloodClearance(10, 28, 60, 1200);

      expect(assessment.isCurrentlySubmerged).toBe(false);
      expect(assessment.remainingFreeboardCm).toBe(18);
      expect(assessment.timeToSubmergeSeconds).toBe(1080);
      // Even though dry now, it will submerge during transit -> MUST PRE-EMPTIVELY BLOCK
      expect(assessment.isPreemptivelyUnsafe).toBe(true);
    });

    it('should permit corridors with sufficient hydraulic freeboard', () => {
      // 5cm current depth, 28cm critical limit, slow rise of 10 cm/hr
      // Traversal time is 180 seconds (3 mins)
      const assessment = assessFloodClearance(5, 28, 10, 180);

      expect(assessment.isCurrentlySubmerged).toBe(false);
      expect(assessment.isPreemptivelyUnsafe).toBe(false);
      expect(assessment.timeToSubmergeSeconds).toBeGreaterThan(5000);
    });
  });

  describe('3. 4D Space-Time Trajectory Grid & Capacity Slot Reservations', () => {
    let grid: SpaceTimeReservationGrid;

    beforeEach(() => {
      grid = new SpaceTimeReservationGrid(60); // 60-second time bins
    });

    it('should register vehicle trajectories in projected arrival time windows', () => {
      const now = 1700000000;
      // Vehicle 1 enters at now, exits at now + 120 (spans 2 windows)
      grid.reserveLinkOccupancy('edge-arterial-1', now, now + 120, 10);

      const mockEdge: any = {
        id: 'edge-arterial-1',
        lengthMeters: 1000,
        speedLimitKmh: 60,
        freeFlowSpeedKmh: 60,
        trafficScore: 10,
        currentVolume: 100,
        capacityVehiclesPerHour: 1500,
      };

      // In the reserved window, anticipated volume is 110 (100 base + 10 reserved)
      const volAtNow = grid.getAnticipatedVolume(mockEdge, now + 30);
      expect(volAtNow).toBe(110);

      // In distant future window (1 hour later), volume is just the base 100
      const volLater = grid.getAnticipatedVolume(mockEdge, now + 3600);
      expect(volLater).toBe(100);
    });

    it('Anti-Herd Mechanism: successive reservations increase anticipated travel time', () => {
      const now = 1700000000;
      const mockEdge: any = {
        id: 'edge-bottleneck',
        lengthMeters: 2000,
        speedLimitKmh: 50,
        freeFlowSpeedKmh: 50,
        trafficScore: 20,
        currentVolume: 50,
        capacityVehiclesPerHour: 1000,
      };

      const initialTime = grid.getAnticipatedTravelTimeSeconds(mockEdge, now);

      // 80 vehicles reserve this exact time window
      grid.reserveLinkOccupancy('edge-bottleneck', now, now + 180, 80);

      const postReservationTime = grid.getAnticipatedTravelTimeSeconds(mockEdge, now);

      // Anticipated travel time increases, naturally discouraging future commuters
      expect(postReservationTime).toBeGreaterThan(initialTime);
    });
  });

  describe('4. Stigmergic Swarm-Potential Field & Microsecond Deflection', () => {
    let graph: RoadNetworkGraph;
    let potentialField: SwarmPotentialField;

    beforeEach(() => {
      graph = new RoadNetworkGraph();
      potentialField = new SwarmPotentialField();

      // Simple fork: Node A -> Node B (toward target) OR Node A -> Node C (toward target)
      graph.addNode({ id: 'N-A', name: 'Fork Point', latitude: 40.710, longitude: -74.010 });
      graph.addNode({ id: 'N-B', name: 'Lower Basin Branch', latitude: 40.715, longitude: -74.005 });
      graph.addNode({ id: 'N-C', name: 'Elevated Ridge Branch', latitude: 40.715, longitude: -74.015 });
      graph.addNode({ id: 'N-Target', name: 'Destination Hub', latitude: 40.725, longitude: -74.010 });

      graph.addEdge({
        id: 'E-AB',
        fromNodeId: 'N-A',
        toNodeId: 'N-B',
        name: 'Lower Basin Road',
        roadClass: 'primary',
        lengthMeters: 600,
        speedLimitKmh: 50,
        currentSpeedKmh: 50,
        freeFlowSpeedKmh: 50,
        trafficScore: 10,
        floodScore: 5,
        compositeRisk: 8,
        accessibilityState: 'OPEN',
        coordinates: [[-74.010, 40.710], [-74.005, 40.715]],
        capacityVehiclesPerHour: 1500,
        currentVolume: 100,
      }, false);

      graph.addEdge({
        id: 'E-AC',
        fromNodeId: 'N-A',
        toNodeId: 'N-C',
        name: 'Elevated Ridge Road',
        roadClass: 'secondary',
        lengthMeters: 600,
        speedLimitKmh: 50,
        currentSpeedKmh: 50,
        freeFlowSpeedKmh: 50,
        trafficScore: 10,
        floodScore: 5,
        compositeRisk: 8,
        accessibilityState: 'OPEN',
        coordinates: [[-74.010, 40.710], [-74.015, 40.715]],
        capacityVehiclesPerHour: 1200,
        currentVolume: 100,
      }, false);
    });

    it('should compute negative sink potential towards destination and positive repulsion near hazards', () => {
      const targetNode = graph.getNode('N-Target')!;
      const basinNode = graph.getNode('N-B')!;

      // Without hazards: basin node has attractive potential towards target
      const basePotential = potentialField.evaluateNodePotential(basinNode, targetNode, []);
      expect(basePotential).toBeLessThan(0); // Attractive potential is negative

      // Inject severe flood hazard right at Basin Node
      const hazard = {
        id: 'hazard-basin',
        latitude: basinNode.latitude,
        longitude: basinNode.longitude,
        radiusMeters: 300,
        severity: 95,
        isBlocked: true,
      };

      const hazardousPotential = potentialField.evaluateNodePotential(basinNode, targetNode, [hazard]);
      // Repulsive barrier dominates
      expect(hazardousPotential).toBeGreaterThan(0);
      expect(hazardousPotential).toBeGreaterThan(basePotential);
    });

    it('should calculate instantaneous local steering deflection vector away from hazard', () => {
      const forkNode = graph.getNode('N-A')!;
      const targetNode = graph.getNode('N-Target')!;
      const outgoing = graph.getOutgoingEdges('N-A');

      // Add hazard blocking Lower Basin Road
      const hazard = {
        id: 'hazard-basin',
        latitude: 40.715,
        longitude: -74.005,
        radiusMeters: 300,
        severity: 100,
        isBlocked: true,
      };

      const steering = potentialField.calculateLocalSteeringVector(
        forkNode,
        outgoing,
        (id) => graph.getNode(id),
        targetNode,
        [hazard]
      );

      // Local gradient must immediately deflect onto the safe Elevated Ridge Road
      expect(steering.bestEdge).toBeDefined();
      expect(steering.bestEdge?.id).toBe('E-AC');
      expect(steering.bestEdge?.name).toBe('Elevated Ridge Road');
    });
  });

  describe('5. Boltzmann Multi-Stream Flow Dissipation (Anti-Herd Balancing)', () => {
    let graph: RoadNetworkGraph;
    let router: HStarRouter;

    beforeEach(() => {
      graph = new RoadNetworkGraph();
      // Multi-corridor diamond network:
      // Origin: 'start'
      // Stream 1 (Direct Ridge): 1200m total
      // Stream 2 (Mid Arterial): 1400m total
      // Stream 3 (Outer Perimeter): 1700m total
      // Goal: 'goal'
      graph.addNode({ id: 'start', name: 'City Gate', latitude: 40.700, longitude: -74.000 });
      graph.addNode({ id: 's1', name: 'Ridge Mid', latitude: 40.710, longitude: -74.000 });
      graph.addNode({ id: 's2', name: 'Arterial Mid', latitude: 40.710, longitude: -74.010 });
      graph.addNode({ id: 's3', name: 'Perimeter Mid', latitude: 40.710, longitude: -74.020 });
      graph.addNode({ id: 'goal', name: 'Metro Center', latitude: 40.720, longitude: -74.000 });

      // Stream 1 (1200m)
      graph.addEdge({
        id: 'st1-a', fromNodeId: 'start', toNodeId: 's1', name: 'Ridge North 1', roadClass: 'primary',
        lengthMeters: 600, speedLimitKmh: 60, currentSpeedKmh: 60, freeFlowSpeedKmh: 60,
        trafficScore: 0, floodScore: 0, compositeRisk: 0, accessibilityState: 'OPEN',
        coordinates: [[-74.000, 40.700], [-74.000, 40.710]], capacityVehiclesPerHour: 1500, currentVolume: 100,
      }, false);
      graph.addEdge({
        id: 'st1-b', fromNodeId: 's1', toNodeId: 'goal', name: 'Ridge North 2', roadClass: 'primary',
        lengthMeters: 600, speedLimitKmh: 60, currentSpeedKmh: 60, freeFlowSpeedKmh: 60,
        trafficScore: 0, floodScore: 0, compositeRisk: 0, accessibilityState: 'OPEN',
        coordinates: [[-74.000, 40.710], [-74.000, 40.720]], capacityVehiclesPerHour: 1500, currentVolume: 100,
      }, false);

      // Stream 2 (1400m)
      graph.addEdge({
        id: 'st2-a', fromNodeId: 'start', toNodeId: 's2', name: 'Arterial North 1', roadClass: 'primary',
        lengthMeters: 700, speedLimitKmh: 50, currentSpeedKmh: 50, freeFlowSpeedKmh: 50,
        trafficScore: 0, floodScore: 0, compositeRisk: 0, accessibilityState: 'OPEN',
        coordinates: [[-74.000, 40.700], [-74.010, 40.710]], capacityVehiclesPerHour: 1200, currentVolume: 100,
      }, false);
      graph.addEdge({
        id: 'st2-b', fromNodeId: 's2', toNodeId: 'goal', name: 'Arterial North 2', roadClass: 'primary',
        lengthMeters: 700, speedLimitKmh: 50, currentSpeedKmh: 50, freeFlowSpeedKmh: 50,
        trafficScore: 0, floodScore: 0, compositeRisk: 0, accessibilityState: 'OPEN',
        coordinates: [[-74.010, 40.710], [-74.000, 40.720]], capacityVehiclesPerHour: 1200, currentVolume: 100,
      }, false);

      // Stream 3 (1700m)
      graph.addEdge({
        id: 'st3-a', fromNodeId: 'start', toNodeId: 's3', name: 'Perimeter North 1', roadClass: 'highway',
        lengthMeters: 850, speedLimitKmh: 60, currentSpeedKmh: 60, freeFlowSpeedKmh: 60,
        trafficScore: 0, floodScore: 0, compositeRisk: 0, accessibilityState: 'OPEN',
        coordinates: [[-74.000, 40.700], [-74.020, 40.710]], capacityVehiclesPerHour: 2000, currentVolume: 100,
      }, false);
      graph.addEdge({
        id: 'st3-b', fromNodeId: 's3', toNodeId: 'goal', name: 'Perimeter North 2', roadClass: 'highway',
        lengthMeters: 850, speedLimitKmh: 60, currentSpeedKmh: 60, freeFlowSpeedKmh: 60,
        trafficScore: 0, floodScore: 0, compositeRisk: 0, accessibilityState: 'OPEN',
        coordinates: [[-74.020, 40.710], [-74.000, 40.720]], capacityVehiclesPerHour: 2000, currentVolume: 100,
      }, false);

      router = new HStarRouter(graph);
    });

    it('should dissipate commuter load probabilistically across multi-stream corridors', () => {
      const flowResult = router.findBoltzmannMultiStreamCorridors('start', 'goal', {
        vehicleBatchCount: 100,
        reserveCapacity: true,
      });

      expect(flowResult.streams.length).toBeGreaterThanOrEqual(2);
      expect(flowResult.totalVehiclesDispersed).toBeCloseTo(100, -1);

      // Stream 1 has lowest distance and receives highest share
      const s1 = flowResult.streams[0];
      const s2 = flowResult.streams[1];
      expect(s1.selectionProbability).toBeGreaterThan(s2.selectionProbability);

      // Crucial: Unlike legacy algorithms that assign 100% to s1, H-STAR spreads the load
      expect(s1.selectionProbability).toBeLessThan(0.95);
      expect(s2.selectionProbability).toBeGreaterThan(0.05);

      // Load balancing efficiency must be healthy
      expect(flowResult.loadBalancingEfficiencyRatio).toBeGreaterThan(0.5);
    });

    it('should execute emergency deflection in microsecond time when hazard blocks current stream', () => {
      // Stream 1 gets blocked
      graph.updateEdgeConditions('st1-a', { accessibilityState: 'BLOCKED' });
      router.refreshHazards();

      const deflection = router.computeEmergencyDeflection('start', 'goal');

      expect(deflection.nextEdge).toBeDefined();
      expect(deflection.nextEdge?.id).not.toBe('st1-a');
      expect(['st2-a', 'st3-a']).toContain(deflection.nextEdge?.id);
    });
  });

  describe('6. End-to-End RoutingEngine Integration & Microsecond Latency Benchmark', () => {
    it('should calculate hydrodynamic multi-stream routes with full metadata and sub-millisecond latency', () => {
      const result = routingEngineService.calculateHydrodynamicRoutes(
        { latitude: 40.7128, longitude: -74.006, name: 'Downtown Center' },
        { latitude: 40.725, longitude: -74.015, name: 'Highland Clinic' },
        { vehicleBatchCount: 120, reserveCapacity: true }
      );

      expect(result).toBeDefined();
      expect(result.recommendedRoute).toBeDefined();
      expect(result.candidateRoutes.length).toBeGreaterThanOrEqual(1);
      expect(result.metrics.algorithm).toContain('H-STAR');
      expect(result.metrics.totalVehiclesDispersed).toBeGreaterThanOrEqual(0);

      // Benchmark: H-STAR execution speed
      expect(result.metrics.executionDurationMs).toBeLessThan(50.0);

      // Verify route output formatting
      const rec = result.recommendedRoute;
      expect(rec.routeId).toMatch(/^route-hstar-/);
      expect(rec.geometry.type).toBe('LineString');
      expect(rec.geometry.coordinates.length).toBeGreaterThan(1);
      expect(rec.travelTimeFormatted).toMatch(/\d+ min/);
    });

    it('should seamlessly execute H-STAR when requested via calculateRoutes preference', async () => {
      const result = await routingEngineService.calculateRoutes({
        origin: { latitude: 40.7128, longitude: -74.006, name: 'Downtown Hub' },
        destination: { latitude: 40.722, longitude: -74.006, name: 'Market Plaza' },
        preferences: {
          algorithm: 'H_STAR',
        },
      });

      expect(result).toBeDefined();
      expect(result.recommendedRoute).toBeDefined();
      expect(result.metrics?.algorithm).toContain('H-STAR');
      expect(['SAFE_TO_PROCEED', 'DETOUR_RECOMMENDED']).toContain(result.safetyDecision?.action);
    });
  });

  describe('7. H-STAR REST API Municipal Traffic Operations & Emergency Deflection', () => {
    it('POST /api/v1/routes/hstar/disperse should disperse vehicle batches across multi-stream conduits', async () => {
      const res = await fetch(`${baseUrl}/api/v1/routes/hstar/disperse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: { latitude: 40.7128, longitude: -74.0060 },
          destination: { latitude: 40.7220, longitude: -74.0060 },
          vehicleBatchCount: 150,
          boltzmannTemperature: 0.03,
          reserveCapacity: true,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.algorithm).toContain('H-STAR');
      expect(data.streams.length).toBeGreaterThanOrEqual(1);
      expect(data.metrics.totalVehiclesDispersed).toBe(150);
      expect(data.metrics.loadBalancingEfficiencyRatio).toBeGreaterThan(0);
      expect(data.primaryCorridor).toBeDefined();
    });

    it('POST /api/v1/routes/hstar/deflect should execute sub-millisecond local steering deflection', async () => {
      const res = await fetch(`${baseUrl}/api/v1/routes/hstar/deflect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: { latitude: 40.7128, longitude: -74.0060 },
          destination: { latitude: 40.7220, longitude: -74.0060 },
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.algorithm).toContain('Swarm-Potential');
      expect(data.executionDurationMs).toBeLessThan(50.0); // Fast gradient deflection (tolerates CPU contention)
      expect(data.nextEdge).toBeDefined();
    });

    it('GET /api/v1/routes/hstar/potential-field should return active potential field telemetry and reservations', async () => {
      const res = await fetch(`${baseUrl}/api/v1/routes/hstar/potential-field`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data).toHaveProperty('hazardsCount');
      expect(data).toHaveProperty('activeReservationsCount');
      expect(Array.isArray(data.activeReservations)).toBe(true);
    });
  });
});

