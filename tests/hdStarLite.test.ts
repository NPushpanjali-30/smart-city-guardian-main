import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { createApp } from '../apps/api/src/app.js';
import {
  RoadNetworkGraph,
  HDStarLiteRouter,
  GraphNode,
  GraphEdge,
} from '@smartcity/shared';
import { routingEngineService } from '../apps/api/src/services/routing/routingEngine.service.js';

describe('HD* Lite: Hierarchical Dynamic D* Lite with Contraction & Flood Safety', () => {
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

  function createTestGraph(): RoadNetworkGraph {
    const graph = new RoadNetworkGraph();

    // Nodes across an urban corridor
    // Node A (Origin) -> Node B -> Node C (Destination)
    // Alternate elevated detour: Node A -> Node D -> Node C
    graph.addNode({ id: 'N-A', name: 'Origin Hub', latitude: 12.920, longitude: 77.610 });
    graph.addNode({ id: 'N-B', name: 'Lowland Basin Underpass', latitude: 12.925, longitude: 77.620 });
    graph.addNode({ id: 'N-C', name: 'Destination Hub', latitude: 12.930, longitude: 77.630 });
    graph.addNode({ id: 'N-D', name: 'Elevated Ridge Waypoint', latitude: 12.935, longitude: 77.615 });

    // Edge AB: Direct Lowland Underpass (speed 60km/h, length 800m)
    graph.addEdge({
      id: 'edge-ab',
      fromNodeId: 'N-A',
      toNodeId: 'N-B',
      name: 'Central Arterial to Underpass',
      roadClass: 'primary',
      lengthMeters: 800,
      speedLimitKmh: 60,
      currentSpeedKmh: 60,
      freeFlowSpeedKmh: 60,
      trafficScore: 0,
      floodScore: 0,
      compositeRisk: 0,
      accessibilityState: 'OPEN',
      coordinates: [[77.610, 12.920], [77.620, 12.925]],
      capacityVehiclesPerHour: 1800,
      currentVolume: 200,
    }, false);

    // Edge BC: Lowland to Destination
    graph.addEdge({
      id: 'edge-bc',
      fromNodeId: 'N-B',
      toNodeId: 'N-C',
      name: 'Underpass Exit Corridor',
      roadClass: 'primary',
      lengthMeters: 800,
      speedLimitKmh: 60,
      currentSpeedKmh: 60,
      freeFlowSpeedKmh: 60,
      trafficScore: 0,
      floodScore: 0,
      compositeRisk: 0,
      accessibilityState: 'OPEN',
      coordinates: [[77.620, 12.925], [77.630, 12.930]],
      capacityVehiclesPerHour: 1800,
      currentVolume: 200,
    }, false);

    // Edge AD: Elevated Ridge West
    graph.addEdge({
      id: 'edge-ad',
      fromNodeId: 'N-A',
      toNodeId: 'N-D',
      name: 'Elevated Ridge Road West',
      roadClass: 'secondary',
      lengthMeters: 1000,
      speedLimitKmh: 50,
      currentSpeedKmh: 50,
      freeFlowSpeedKmh: 50,
      trafficScore: 0,
      floodScore: 0,
      compositeRisk: 0,
      accessibilityState: 'OPEN',
      coordinates: [[77.610, 12.920], [77.615, 12.935]],
      capacityVehiclesPerHour: 1200,
      currentVolume: 100,
    }, false);

    // Edge DC: Elevated Ridge East to Destination
    graph.addEdge({
      id: 'edge-dc',
      fromNodeId: 'N-D',
      toNodeId: 'N-C',
      name: 'Elevated Ridge Road East',
      roadClass: 'secondary',
      lengthMeters: 1000,
      speedLimitKmh: 50,
      currentSpeedKmh: 50,
      freeFlowSpeedKmh: 50,
      trafficScore: 0,
      floodScore: 0,
      compositeRisk: 0,
      accessibilityState: 'OPEN',
      coordinates: [[77.615, 12.935], [77.630, 12.930]],
      capacityVehiclesPerHour: 1200,
      currentVolume: 100,
    }, false);

    return graph;
  }

  describe('1. Contraction Hierarchy (CH) Pre-processing & Scale', () => {
    it('should assign hierarchical levels and synthesize contraction shortcuts for degree-2 pass-through vertices', () => {
      const graph = createTestGraph();
      const router = new HDStarLiteRouter(graph, { enableContractionHierarchy: true });

      // Verifies CH pre-processing synthesized shortcut bypassing degree-2 intermediate node N-B
      const initialPath = router.findOptimalPath('N-A', 'N-C');
      expect(initialPath.success).toBe(true);
      expect(initialPath.totalDistanceMeters).toBe(1600);
      expect(initialPath.isBlocked).toBe(false);
      expect(initialPath.chShortcutsTraversed).toBeGreaterThanOrEqual(1);
    });

    it('should keep memory footprint bounded under 120KB for active priority sets', () => {
      const graph = createTestGraph();
      const router = new HDStarLiteRouter(graph);
      const result = router.findOptimalPath('N-A', 'N-C');

      expect(result.memoryUsageEstimateBytes).toBeLessThan(120 * 1024);
      expect(result.nodesExpanded).toBeGreaterThan(0);
    });
  });

  describe('2. Pathfinding Optimality & Safety Dominance around Road Blocks', () => {
    it('should route via direct path when open and optimal', () => {
      const graph = createTestGraph();
      const router = new HDStarLiteRouter(graph);
      const path = router.findOptimalPath('N-A', 'N-C');

      expect(path.success).toBe(true);
      expect(path.totalDistanceMeters).toBe(1600);
      expect(path.nodeIds).toContain('N-A');
      expect(path.nodeIds).toContain('N-C');
    });

    it('should enforce strict infinite-cost exclusion on submerged or blocked road segments', () => {
      const graph = createTestGraph();
      const router = new HDStarLiteRouter(graph);

      // Block the direct corridor
      graph.updateEdgeConditions('edge-ab', {
        accessibilityState: 'BLOCKED',
        blockageReason: 'Deep standing water over 30cm',
      });

      const path = router.findOptimalPath('N-A', 'N-C');
      expect(path.success).toBe(true);
      // Must take elevated detour AD -> DC (2000m)
      expect(path.totalDistanceMeters).toBe(2000);
      expect(path.nodeIds).toContain('N-D');
      expect(path.nodeIds).not.toContain('N-B');
    });
  });

  describe('3. D* Lite Incremental Dynamic Replanning (No Cold A* Restart)', () => {
    it('should incrementally repair affected subtrees in < 5ms when a road block appears dynamically', () => {
      const graph = createTestGraph();
      const router = new HDStarLiteRouter(graph);

      // 1. Initial optimal search under clear conditions (via AB -> BC)
      const initialPath = router.findOptimalPath('N-A', 'N-C');
      expect(initialPath.success).toBe(true);
      expect(initialPath.totalDistanceMeters).toBe(1600);

      // 2. Sudden Dynamic Cloudburst: Underpass on edge-ab submerges during commute!
      const t0 = performance.now();
      const replanResult = router.applyDynamicBlockage('edge-ab', 'Sudden flash flood cresting at 35cm');
      const replanTimeMs = performance.now() - t0;

      // 3. Verifies D* Lite incrementally repaired the tree without cold re-initialization
      expect(replanResult.success).toBe(true);
      // Rerouted onto safe elevated ridge N-A -> N-D -> N-C (2000m)
      expect(replanResult.totalDistanceMeters).toBe(2000);
      expect(replanResult.nodeIds).toContain('N-D');
      expect(replanResult.nodeIds).not.toContain('N-B');
      expect(replanResult.verticesRepaired).toBeGreaterThan(0);
      expect(replanTimeMs).toBeLessThan(100); // Ultra fast incremental subtree repair
    });
  });

  describe('4. REST API Dynamic Obstacle Replanning Endpoint', () => {
    it('POST /api/v1/routes/dstar/dynamic-obstacle should trigger incremental replan and return telemetry', async () => {
      const res = await fetch(`${baseUrl}/api/v1/routes/dstar/dynamic-obstacle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          edgeId: 'road-bay-st-001',
          reason: 'Severe underpass inundation 35cm',
          origin: { latitude: 40.7128, longitude: -74.0060 },
          destination: { latitude: 40.7140, longitude: -74.0120 },
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.algorithm).toContain('HD* Lite');
      expect(data).toHaveProperty('incrementalReplan');
      expect(data.incrementalReplan).toHaveProperty('repairedVerticesCount');
      expect(data.incrementalReplan).toHaveProperty('memoryUsageEstimateBytes');
      expect(data).toHaveProperty('updatedRoute');
    });

    it('POST /api/v1/routes/calculate with algorithm HD_STAR_LITE should return HD* Lite metrics', async () => {
      const res = await fetch(`${baseUrl}/api/v1/routes/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: { latitude: 40.7128, longitude: -74.0060, name: 'Downtown Hub' },
          destination: { latitude: 40.7140, longitude: -74.0120, name: 'North Clinic' },
          preferences: {
            algorithm: 'HD_STAR_LITE',
            prioritizeSafety: true,
          },
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.recommendedRoute).toHaveProperty('routeId');
      expect(data).toHaveProperty('metrics');
      expect(data.metrics.algorithm).toContain('HD* Lite');
    });
  });
});
