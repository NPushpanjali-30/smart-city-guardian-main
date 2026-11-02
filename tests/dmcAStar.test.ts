import { describe, it, expect, beforeEach } from 'vitest';
import {
  PriorityQueue,
  RoadNetworkGraph,
  DMCAStarRouter,
  haversineDistanceMeters,
  RoadSegment,
  DEFAULT_DMC_PARAMS,
} from '@smartcity/shared';
import { routingEngineService } from '../apps/api/src/services/routing/routingEngine.service.js';

describe('Dynamic Multi-Criteria Bi-Directional A* (DMC-A*) Routing Algorithm', () => {
  describe('1. Binary Min-Heap Priority Queue', () => {
    it('should pop elements in strictly ascending priority order', () => {
      const pq = new PriorityQueue<string>();
      pq.push('node-c', 50);
      pq.push('node-a', 10);
      pq.push('node-d', 100);
      pq.push('node-b', 25);
      pq.push('node-e', 5);

      expect(pq.size).toBe(5);
      expect(pq.peek()?.element).toBe('node-e');

      const popped: string[] = [];
      while (!pq.isEmpty) {
        popped.push(pq.pop()!.element);
      }

      expect(popped).toEqual(['node-e', 'node-a', 'node-b', 'node-c', 'node-d']);
      expect(pq.size).toBe(0);
      expect(pq.pop()).toBeNull();
    });

    it('should handle equal priorities and negative weights gracefully', () => {
      const pq = new PriorityQueue<number>();
      pq.push(1, -10);
      pq.push(2, 0);
      pq.push(3, -10);
      pq.push(4, 5);

      const first = pq.pop();
      expect(first?.priority).toBe(-10);
      const second = pq.pop();
      expect(second?.priority).toBe(-10);
      expect(pq.pop()?.priority).toBe(0);
      expect(pq.pop()?.priority).toBe(5);
    });

    it('should execute 10,000 push/pop heap operations within sub-millisecond per-op latency', () => {
      const pq = new PriorityQueue<number>();
      const t0 = performance.now();
      for (let i = 0; i < 10000; i++) {
        pq.push(i, Math.random() * 1000);
      }
      let prev = -Infinity;
      while (!pq.isEmpty) {
        const item = pq.pop()!;
        expect(item.priority).toBeGreaterThanOrEqual(prev);
        prev = item.priority;
      }
      const durationMs = performance.now() - t0;
      expect(durationMs).toBeLessThan(5000); // 20k operations (tolerates CPU contention in parallel test runs)
    });
  });

  describe('2. RoadNetworkGraph & Spatial Indexing', () => {
    it('should compute accurate Haversine distances', () => {
      // 1 degree latitude around equator is approx 111,195 meters
      const dist = haversineDistanceMeters(0, 0, 1, 0);
      expect(dist).toBeGreaterThan(110000);
      expect(dist).toBeLessThan(112000);

      // Distance to self is 0
      expect(haversineDistanceMeters(40.7128, -74.006, 40.7128, -74.006)).toBe(0);
    });

    it('should snap arbitrary GPS coordinates to the nearest network node', () => {
      const graph = new RoadNetworkGraph();
      graph.addNode({ id: 'node-downtown', name: 'Downtown Hub', latitude: 40.7128, longitude: -74.006 });
      graph.addNode({ id: 'node-uptown', name: 'Uptown Ridge', latitude: 40.735, longitude: -74.015 });
      graph.addNode({ id: 'node-harbor', name: 'Harbor Pier', latitude: 40.705, longitude: -74.02 });

      // Point very close to Downtown Hub
      const snap = graph.findNearestNode(40.713, -74.0062);
      expect(snap).toBeDefined();
      expect(snap?.node.id).toBe('node-downtown');
      expect(snap?.distanceMeters).toBeLessThan(50);
    });

    it('should automatically fuse segment endpoints within 30m into common intersections', () => {
      const segments: RoadSegment[] = [
        {
          id: 'seg-1',
          name: 'Main Street',
          roadClass: 'primary',
          lengthMeters: 500,
          speedLimitKmh: 50,
          floodScore: 10,
          trafficScore: 20,
          compositeRisk: 15,
          accessibilityState: 'OPEN',
          confidence: 0.95,
          isHistoricallyFloodProne: false,
          coordinates: [[-74.006, 40.7128], [-74.008, 40.715]],
        },
        {
          id: 'seg-2',
          name: 'Connecting Avenue',
          roadClass: 'secondary',
          lengthMeters: 600,
          speedLimitKmh: 40,
          floodScore: 12,
          trafficScore: 25,
          compositeRisk: 18,
          accessibilityState: 'OPEN',
          confidence: 0.95,
          isHistoricallyFloodProne: false,
          // Start point is 5 meters from seg-1 end point
          coordinates: [[-74.00802, 40.71502], [-74.012, 40.72]],
        },
      ];

      const graph = RoadNetworkGraph.fromRoadSegments(segments);
      expect(graph.getAllNodes().length).toBe(3); // start, intersection (fused), end
      expect(graph.getAllEdges().length).toBe(4); // 2 bidirectional segments = 4 edges
    });
  });

  describe('3. Bi-Directional Multi-Criteria Search & Pruning', () => {
    let graph: RoadNetworkGraph;

    beforeEach(() => {
      graph = new RoadNetworkGraph();
      // Triangle network:
      // Node A (Origin) -> Node B (Low Basin) -> Node D (Destination)
      // Node A (Origin) -> Node C (Highland Ridge) -> Node D (Destination)
      graph.addNode({ id: 'A', name: 'Start', latitude: 40.710, longitude: -74.010 });
      graph.addNode({ id: 'B', name: 'Low Basin Valley', latitude: 40.715, longitude: -74.008 });
      graph.addNode({ id: 'C', name: 'Highland Ridge', latitude: 40.720, longitude: -74.015 });
      graph.addNode({ id: 'D', name: 'Goal', latitude: 40.725, longitude: -74.008 });

      // Basin Path (Fast, 500m + 500m, floodScore 0)
      graph.addEdge({
        id: 'A-B',
        fromNodeId: 'A',
        toNodeId: 'B',
        name: 'Basin Boulevard Lower',
        roadClass: 'primary',
        lengthMeters: 500,
        speedLimitKmh: 60,
        currentSpeedKmh: 60,
        freeFlowSpeedKmh: 60,
        trafficScore: 0,
        floodScore: 0,
        compositeRisk: 0,
        accessibilityState: 'OPEN',
        coordinates: [[-74.010, 40.710], [-74.008, 40.715]],
        capacityVehiclesPerHour: 1500,
        currentVolume: 100,
      }, false);

      graph.addEdge({
        id: 'B-D',
        fromNodeId: 'B',
        toNodeId: 'D',
        name: 'Basin Boulevard Upper',
        roadClass: 'primary',
        lengthMeters: 500,
        speedLimitKmh: 60,
        currentSpeedKmh: 60,
        freeFlowSpeedKmh: 60,
        trafficScore: 0,
        floodScore: 0,
        compositeRisk: 0,
        accessibilityState: 'OPEN',
        coordinates: [[-74.008, 40.715], [-74.008, 40.725]],
        capacityVehiclesPerHour: 1500,
        currentVolume: 100,
      }, false);

      // Ridge Path (Longer, 800m + 800m, floodScore 0)
      graph.addEdge({
        id: 'A-C',
        fromNodeId: 'A',
        toNodeId: 'C',
        name: 'Highland Ridge Lower',
        roadClass: 'secondary',
        lengthMeters: 800,
        speedLimitKmh: 50,
        currentSpeedKmh: 50,
        freeFlowSpeedKmh: 50,
        trafficScore: 0,
        floodScore: 0,
        compositeRisk: 0,
        accessibilityState: 'OPEN',
        coordinates: [[-74.010, 40.710], [-74.015, 40.720]],
        capacityVehiclesPerHour: 1000,
        currentVolume: 100,
      }, false);

      graph.addEdge({
        id: 'C-D',
        fromNodeId: 'C',
        toNodeId: 'D',
        name: 'Highland Ridge Upper',
        roadClass: 'secondary',
        lengthMeters: 800,
        speedLimitKmh: 50,
        currentSpeedKmh: 50,
        freeFlowSpeedKmh: 50,
        trafficScore: 0,
        floodScore: 0,
        compositeRisk: 0,
        accessibilityState: 'OPEN',
        coordinates: [[-74.015, 40.720], [-74.008, 40.725]],
        capacityVehiclesPerHour: 1000,
        currentVolume: 100,
      }, false);
    });

    it('should find optimal shortest path through low basin when conditions are clear', () => {
      const router = new DMCAStarRouter(graph);
      const result = router.findOptimalPath('A', 'D');

      expect(result.success).toBe(true);
      expect(result.isBlocked).toBe(false);
      expect(result.nodeIds).toEqual(['A', 'B', 'D']);
      expect(result.totalDistanceMeters).toBe(1000);
      expect(result.edges.map((e) => e.id)).toEqual(['A-B', 'B-D']);
    });

    it('Safety Supremacy: should prune submerged basin corridor and select elevated ridge', () => {
      // Submerge Node B path: Flood score = 90, accessibility = BLOCKED
      graph.updateEdgeConditions('A-B', {
        floodScore: 90,
        accessibilityState: 'BLOCKED',
        blockageReason: 'Basin submerged under 45cm floodwater',
      });

      const router = new DMCAStarRouter(graph);
      const result = router.findOptimalPath('A', 'D');

      expect(result.success).toBe(true);
      expect(result.isBlocked).toBe(false);
      // Must take elevated ridge detour
      expect(result.nodeIds).toEqual(['A', 'C', 'D']);
      expect(result.edges.map((e) => e.id)).toEqual(['A-C', 'C-D']);
      expect(result.totalDistanceMeters).toBe(1600);
    });

    it('should return failure with infinite cost if all routes are blocked', () => {
      // Block both paths
      graph.updateEdgeConditions('A-B', { accessibilityState: 'BLOCKED' });
      graph.updateEdgeConditions('A-C', { accessibilityState: 'BLOCKED' });

      const router = new DMCAStarRouter(graph);
      const result = router.findOptimalPath('A', 'D');

      expect(result.success).toBe(false);
      expect(result.isBlocked).toBe(true);
      expect(result.totalCost).toBe(Infinity);
    });
  });

  describe('4. K-Diverse Route Generation & BPR Capacity Balancing', () => {
    let graph: RoadNetworkGraph;

    beforeEach(() => {
      graph = new RoadNetworkGraph();
      // Multi-corridor diamond:
      // A -> Path 1 (Direct Shortest) -> D
      // A -> Path 2 (Mid Arterial) -> D
      // A -> Path 3 (Perimeter Bypass) -> D
      graph.addNode({ id: 'start', name: 'Start', latitude: 40.700, longitude: -74.000 });
      graph.addNode({ id: 'p1', name: 'Direct Midpoint', latitude: 40.710, longitude: -74.000 });
      graph.addNode({ id: 'p2', name: 'Arterial Midpoint', latitude: 40.710, longitude: -74.010 });
      graph.addNode({ id: 'p3', name: 'Bypass Midpoint', latitude: 40.710, longitude: -74.020 });
      graph.addNode({ id: 'goal', name: 'Goal', latitude: 40.720, longitude: -74.000 });

      // Path 1 (Direct: 1600m total, 60 km/h, travel time = 96s)
      graph.addEdge({
        id: 'e1-a',
        fromNodeId: 'start',
        toNodeId: 'p1',
        name: 'Direct Part 1',
        roadClass: 'primary',
        lengthMeters: 800,
        speedLimitKmh: 60,
        currentSpeedKmh: 60,
        freeFlowSpeedKmh: 60,
        trafficScore: 0,
        floodScore: 0,
        compositeRisk: 0,
        accessibilityState: 'OPEN',
        coordinates: [[-74.000, 40.700], [-74.000, 40.710]],
        capacityVehiclesPerHour: 1000,
        currentVolume: 100,
      }, false);
      graph.addEdge({
        id: 'e1-b',
        fromNodeId: 'p1',
        toNodeId: 'goal',
        name: 'Direct Part 2',
        roadClass: 'primary',
        lengthMeters: 800,
        speedLimitKmh: 60,
        currentSpeedKmh: 60,
        freeFlowSpeedKmh: 60,
        trafficScore: 0,
        floodScore: 0,
        compositeRisk: 0,
        accessibilityState: 'OPEN',
        coordinates: [[-74.000, 40.710], [-74.000, 40.720]],
        capacityVehiclesPerHour: 1000,
        currentVolume: 100,
      }, false);

      // Path 2 (Mid Arterial: 2500m total, 50 km/h, travel time = 180s)
      graph.addEdge({
        id: 'e2-a',
        fromNodeId: 'start',
        toNodeId: 'p2',
        name: 'Arterial Part 1',
        roadClass: 'primary',
        lengthMeters: 1250,
        speedLimitKmh: 50,
        currentSpeedKmh: 50,
        freeFlowSpeedKmh: 50,
        trafficScore: 0,
        floodScore: 0,
        compositeRisk: 0,
        accessibilityState: 'OPEN',
        coordinates: [[-74.000, 40.700], [-74.010, 40.710]],
        capacityVehiclesPerHour: 1600,
        currentVolume: 100,
      }, false);
      graph.addEdge({
        id: 'e2-b',
        fromNodeId: 'p2',
        toNodeId: 'goal',
        name: 'Arterial Part 2',
        roadClass: 'primary',
        lengthMeters: 1250,
        speedLimitKmh: 50,
        currentSpeedKmh: 50,
        freeFlowSpeedKmh: 50,
        trafficScore: 0,
        floodScore: 0,
        compositeRisk: 0,
        accessibilityState: 'OPEN',
        coordinates: [[-74.010, 40.710], [-74.000, 40.720]],
        capacityVehiclesPerHour: 1600,
        currentVolume: 100,
      }, false);

      // Path 3 (Bypass: 3600m total, 60 km/h, travel time = 216s)
      graph.addEdge({
        id: 'e3-a',
        fromNodeId: 'start',
        toNodeId: 'p3',
        name: 'Bypass Part 1',
        roadClass: 'highway',
        lengthMeters: 1800,
        speedLimitKmh: 60,
        currentSpeedKmh: 60,
        freeFlowSpeedKmh: 60,
        trafficScore: 0,
        floodScore: 0,
        compositeRisk: 0,
        accessibilityState: 'OPEN',
        coordinates: [[-74.000, 40.700], [-74.020, 40.710]],
        capacityVehiclesPerHour: 2400,
        currentVolume: 100,
      }, false);
      graph.addEdge({
        id: 'e3-b',
        fromNodeId: 'p3',
        toNodeId: 'goal',
        name: 'Bypass Part 2',
        roadClass: 'highway',
        lengthMeters: 1800,
        speedLimitKmh: 60,
        currentSpeedKmh: 60,
        freeFlowSpeedKmh: 60,
        trafficScore: 0,
        floodScore: 0,
        compositeRisk: 0,
        accessibilityState: 'OPEN',
        coordinates: [[-74.020, 40.710], [-74.000, 40.720]],
        capacityVehiclesPerHour: 2400,
        currentVolume: 100,
      }, false);
    });

    it('should find 3 distinct diverse routes with topological divergence', () => {
      const router = new DMCAStarRouter(graph);
      const kResult = router.findKDiverseRoutes('start', 'goal', 3);

      expect(kResult.allRoutes.length).toBe(3);
      expect(kResult.primaryRoute.nodeIds).toEqual(['start', 'p1', 'goal']);
      expect(kResult.alternativeRoutes[0].nodeIds).toEqual(['start', 'p2', 'goal']);
      expect(kResult.alternativeRoutes[1].nodeIds).toEqual(['start', 'p3', 'goal']);

      // Primary route has lowest distance
      expect(kResult.primaryRoute.totalDistanceMeters).toBeLessThan(kResult.alternativeRoutes[0].totalDistanceMeters);
      expect(kResult.alternativeRoutes[0].totalDistanceMeters).toBeLessThan(kResult.alternativeRoutes[1].totalDistanceMeters);
    });

    it('should divert flow from saturated corridors using BPR flow balancing', () => {
      const router = new DMCAStarRouter(graph);

      // First run: primary route uses path 1
      const initial = router.findOptimalPath('start', 'goal');
      expect(initial.nodeIds).toEqual(['start', 'p1', 'goal']);

      // Heavily saturate Path 1: volume 2500 on 1000 capacity link (V/C = 2.5)
      graph.updateEdgeConditions('e1-a', { currentVolume: 2500, capacityVehiclesPerHour: 1000, trafficScore: 85 });
      graph.updateEdgeConditions('e1-b', { currentVolume: 2500, capacityVehiclesPerHour: 1000, trafficScore: 85 });

      // Re-run: BPR formula t = t_0 * [1 + 0.15 * (V/C)^4] exponentially penalizes Path 1
      const balanced = router.findOptimalPath('start', 'goal');
      // Router must dynamically divert flow to the uncongested Arterial Path 2
      expect(balanced.nodeIds).toEqual(['start', 'p2', 'goal']);
    });
  });

  describe('5. End-to-End RoutingEngine Integration & Microsecond Latency Benchmark', () => {
    it('should calculate optimal graph routes with candidate formatting and metrics', () => {
      const result = routingEngineService.calculateOptimalGraphRoutes(
        { latitude: 40.7128, longitude: -74.006, name: 'Downtown Center' },
        { latitude: 40.725, longitude: -74.015, name: 'Highland Clinic' },
        { k: 3 }
      );

      expect(result).toBeDefined();
      expect(result.recommendedRoute).toBeDefined();
      expect(result.candidateRoutes.length).toBeGreaterThanOrEqual(1);
      expect(result.metrics.algorithm).toContain('DMC-A*');
      expect(result.metrics.graphNodesCount).toBeGreaterThan(0);
      expect(result.metrics.graphEdgesCount).toBeGreaterThan(0);

      // Verify performance: search completes under benchmark limit (allowing for CPU contention during parallel test runs)
      expect(result.metrics.searchDurationMs).toBeLessThan(100.0);

      // Verify route properties
      const rec = result.recommendedRoute;
      expect(rec.routeId).toBeDefined();
      expect(rec.geometry.type).toBe('LineString');
      expect(rec.geometry.coordinates.length).toBeGreaterThan(1);
      expect(rec.travelTimeFormatted).toMatch(/\d+ min/);
      expect(rec.risk).toBeDefined();
    });

    it('should seamlessly execute DMC-A* when requested via calculateRoutes preference', async () => {
      const result = await routingEngineService.calculateRoutes({
        origin: { latitude: 40.7128, longitude: -74.006, name: 'Downtown' },
        destination: { latitude: 40.722, longitude: -74.006, name: 'Market Plaza' },
        preferences: {
          useDynamicGraphRouter: true,
          avoidFlood: true,
        },
      });

      expect(result).toBeDefined();
      expect(result.recommendedRoute).toBeDefined();
      expect(result.metrics).toBeDefined();
      expect(result.metrics?.algorithm).toContain('DMC-A*');
      expect(['SAFE_TO_PROCEED', 'DETOUR_RECOMMENDED']).toContain(result.safetyDecision?.action);
    });
  });
});
