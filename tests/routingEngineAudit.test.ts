import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { createApp } from '../apps/api/src/app.js';
import { routingEngineService } from '../apps/api/src/services/routing/routingEngine.service.js';

describe('Routing Algorithms, Mathematics, and Backend API Routing Audit', () => {
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

  describe('1. Origin == Destination (0-Distance Path) Edge Cases', () => {
    it('should handle identical Origin and Destination coordinates without division by zero or infinite loop', async () => {
      const blrPoint = { latitude: 12.9716, longitude: 77.5946, name: 'Vidhana Soudha' };
      const result = await routingEngineService.calculateRoutes({
        origin: blrPoint,
        destination: blrPoint,
      });

      expect(result).toBeDefined();
      expect(result.recommendedRoute).toBeDefined();
      expect(result.recommendedRoute.distanceMeters).toBe(0);
      expect(result.recommendedRoute.estimatedTravelTimeSeconds).toBe(0);
      expect(result.recommendedRoute.isBlocked).toBe(false);
      expect(result.recommendedRoute.status).toBe('SAFE_TO_PROCEED');
      expect(result.recommendedRoute.routeType).toBe('RECOMMENDED');
      expect(result.recommendedRoute.risk.overall).toBe(0);
      expect(result.recommendedRoute.risk.flood).toBe(0);
      expect(result.recommendedRoute.risk.traffic).toBe(0);
      expect(Number.isFinite(result.recommendedRoute.cost)).toBe(true);
      expect(result.safetyDecision?.action).toBe('SAFE_TO_PROCEED');
      expect(result.allCandidates.length).toBe(1);
    });

    it('should handle 0-distance path in flooded location without forcing a 20+ km detour', async () => {
      const bellandurPoint = { latitude: 12.9260, longitude: 77.6762, name: 'Bellandur ORR Underpass' };
      const result = await routingEngineService.calculateRoutes({
        origin: bellandurPoint,
        destination: bellandurPoint,
      });

      expect(result.recommendedRoute.distanceMeters).toBe(0);
      expect(result.recommendedRoute.estimatedTravelTimeSeconds).toBe(0);
      expect(result.recommendedRoute.isBlocked).toBe(false);
      expect(result.safetyDecision?.action).toBe('SAFE_TO_PROCEED');
      // Must not route 23km to Old Airport Road
      expect(result.recommendedRoute.distanceMeters).toBeLessThan(100);
    });

    it('POST /api/v1/routes/calculate should return HTTP 200 for 0-distance route with valid metrics', async () => {
      const res = await fetch(`${baseUrl}/api/v1/routes/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: { latitude: 12.9716, longitude: 77.5946 },
          destination: { latitude: 12.9716, longitude: 77.5946 },
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.recommendedRoute.totalDistanceMeters).toBe(0);
      expect(json.recommendedRoute.durationSeconds).toBe(0);
      expect(json.recommendedRoute.isSafe).toBe(true);
      expect(json.safetyDecision.action).toBe('SAFE_TO_PROCEED');
      expect(Number.isFinite(json.recommendedRoute.riskScore)).toBe(true);
    });
  });

  describe('2. Coordinates Outside Bangalore (Delhi, New York, Arbitrary Coordinates)', () => {
    it('should gracefully route coordinates in Delhi without forcing Bangalore landmarks', async () => {
      // Delhi: India Gate to Rohini
      const origin = { latitude: 28.6139, longitude: 77.2090, name: 'India Gate, New Delhi' };
      const destination = { latitude: 28.7041, longitude: 77.1025, name: 'Rohini, New Delhi' };

      const result = await routingEngineService.calculateRoutes({ origin, destination });

      expect(result).toBeDefined();
      expect(result.recommendedRoute.isBlocked).toBe(false);
      expect(result.recommendedRoute.distanceMeters).toBeGreaterThan(5000);
      // It must NOT route through Old Airport Road or KR Puram in Bangalore
      expect(result.recommendedRoute.name).not.toContain('Old Airport Road');
      expect(result.recommendedRoute.name).not.toContain('KR Puram');
      expect(result.recommendedRoute.description).not.toContain('BBMP');
      expect(result.recommendedRoute.description).not.toContain('Bellandur');

      // The alternatives for Delhi must also not refer to Bangalore landmarks
      for (const alt of result.alternatives) {
        expect(alt.name).not.toContain('Old Airport Road');
        expect(alt.name).not.toContain('KR Puram');
      }
    });

    it('should route New York coordinates using the local corridor network', async () => {
      const origin = { latitude: 40.7128, longitude: -74.0060, name: 'City Hall' };
      const destination = { latitude: 40.7220, longitude: -74.0060, name: 'Market Plaza' };

      const result = await routingEngineService.calculateRoutes({ origin, destination });

      expect(result).toBeDefined();
      expect(result.recommendedRoute.isBlocked).toBe(false);
      expect(result.recommendedRoute.distanceMeters).toBeGreaterThan(0);
    });
  });

  describe('3. Algorithm Selection: HD_STAR_LITE, H_STAR, DMC_ASTAR', () => {
    it('should return valid HD* Lite Contraction Hierarchy telemetry when requested', async () => {
      const res = await fetch(`${baseUrl}/api/v1/routes/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: { latitude: 12.9767, longitude: 77.5713, name: 'Majestic' },
          destination: { latitude: 13.0048, longitude: 77.5990, name: 'Frazer Town' },
          preferences: { algorithm: 'HD_STAR_LITE' },
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.algorithm).toContain('HD* Lite');
      expect(json.metrics).toBeDefined();
      expect(json.metrics.algorithm).toContain('HD* Lite');
      expect(json.metrics.nodesExpanded).toBeGreaterThan(0);
      expect(json.metrics.chShortcutsTraversed).toBeGreaterThanOrEqual(1);
      expect(json.metrics.memoryUsageEstimateBytes).toBeGreaterThan(0);
      expect(Number.isFinite(json.metrics.replanDurationMs)).toBe(true);
    });

    it('should return valid H-STAR Boltzmann multi-stream telemetry when requested', async () => {
      const res = await fetch(`${baseUrl}/api/v1/routes/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: { latitude: 12.9767, longitude: 77.5713, name: 'Majestic' },
          destination: { latitude: 13.0048, longitude: 77.5990, name: 'Frazer Town' },
          preferences: { algorithm: 'H_STAR' },
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.algorithm).toContain('H-STAR');
      expect(json.metrics).toBeDefined();
      expect(json.metrics.algorithm).toContain('H-STAR');
      expect(json.metrics.totalVehiclesDispersed).toBeGreaterThan(0);
      expect(json.metrics.loadBalancingEfficiencyRatio).toBeGreaterThan(0);
      expect(json.metrics.loadBalancingEfficiencyRatio).toBeLessThanOrEqual(1.0);
    });

    it('should return valid DMC-A* multi-criteria telemetry when requested', async () => {
      const res = await fetch(`${baseUrl}/api/v1/routes/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: { latitude: 12.9767, longitude: 77.5713, name: 'Majestic' },
          destination: { latitude: 13.0048, longitude: 77.5990, name: 'Frazer Town' },
          preferences: { algorithm: 'DMC_ASTAR' },
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.algorithm).toContain('DMC-A*');
      expect(json.metrics).toBeDefined();
      expect(json.metrics.algorithm).toContain('DMC-A*');
      expect(json.metrics.nodesExpanded).toBeGreaterThan(0);
      expect(json.metrics.graphNodesCount).toBeGreaterThan(0);
      expect(json.metrics.graphEdgesCount).toBeGreaterThan(0);
    });
  });

  describe('4. Bangalore Real-Road Routes & Flood Detection Verification', () => {
    it('should recommend direct route for non-blocked corridor with correct distance and risk', async () => {
      // Safe central Bangalore trip: Majestic to Frazer Town
      const origin = { latitude: 12.9767, longitude: 77.5713, name: 'Majestic' };
      const destination = { latitude: 13.00481, longitude: 77.59901, name: 'Frazer Town' };

      const result = await routingEngineService.calculateRoutes({ origin, destination });

      expect(result.recommendedRoute.routeType).toBe('RECOMMENDED');
      expect(result.recommendedRoute.isBlocked).toBe(false);
      expect(result.recommendedRoute.status).toBe('SAFE_TO_PROCEED');
      expect(result.recommendedRoute.distanceMeters).toBeGreaterThan(0);
      expect(result.recommendedRoute.estimatedTravelTimeSeconds).toBeGreaterThan(0);
      expect(result.recommendedRoute.risk.overall).toBeLessThan(25);
      expect(result.recommendedRoute.risk.flood).toBeLessThan(25);
      expect(result.safetyDecision?.action).toBe('SAFE_TO_PROCEED');

      // Direct route is not blocked
      const direct = result.allCandidates.find((c) => c.routeType === 'RECOMMENDED');
      expect(direct).toBeDefined();
      expect(direct?.isBlocked).toBe(false);
    });

    it('should block direct route and recommend safe elevated detour when intersecting Bellandur ORR / Silk Board', async () => {
      // Passes Bellandur EcoSpace underpass: Silk Board to Whitefield
      const origin = { latitude: 12.9172, longitude: 77.6228, name: 'Silk Board' };
      const destination = { latitude: 12.9856, longitude: 77.7317, name: 'Whitefield' };

      const result = await routingEngineService.calculateRoutes({ origin, destination });

      // Direct corridor must be blocked
      const directCandidate = result.allCandidates.find((c) => c.routeType === 'DIRECT_BLOCKED');
      expect(directCandidate).toBeDefined();
      expect(directCandidate?.isBlocked).toBe(true);
      expect(directCandidate?.status).toBe('INVALID');
      expect(directCandidate?.cost).toBe(Infinity);
      expect(directCandidate?.blockageReason).toContain('Bellandur');

      // Recommended route must be safe elevated detour via Old Airport Road
      expect(result.recommendedRoute.routeType).toBe('RECOMMENDED');
      expect(result.recommendedRoute.isBlocked).toBe(false);
      expect(result.recommendedRoute.name).toContain('Old Airport Road');
      expect(result.safetyDecision?.action).toBe('DETOUR_RECOMMENDED');
    });
  });

  describe('5. Specialized H-STAR and HD* Lite Endpoints', () => {
    it('POST /api/v1/routes/hstar/disperse should compute Boltzmann traffic dispersion across multi-stream corridors', async () => {
      const res = await fetch(`${baseUrl}/api/v1/routes/hstar/disperse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: { latitude: 12.9716, longitude: 77.5946 },
          destination: { latitude: 12.9856, longitude: 77.7317 },
          vehicleBatchCount: 150,
          boltzmannTemperature: 0.03,
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.algorithm).toContain('H-STAR');
      expect(json.streams).toBeDefined();
      expect(Array.isArray(json.streams)).toBe(true);
      expect(json.streams.length).toBeGreaterThanOrEqual(1);

      // Probabilities should sum to approximately 1.0
      const totalProb = json.streams.reduce((acc: number, s: any) => acc + s.selectionProbability, 0);
      expect(totalProb).toBeCloseTo(1.0, 1);

      // Total dispersed vehicles should match batch count
      const totalAssigned = json.streams.reduce((acc: number, s: any) => acc + s.assignedVehicleCount, 0);
      expect(totalAssigned).toBeCloseTo(150, -1);
      expect(json.metrics.totalVehiclesDispersed).toBe(150);
      expect(json.metrics.loadBalancingEfficiencyRatio).toBeGreaterThan(0.5);
    });

    it('POST /api/v1/routes/hstar/deflect should execute instantaneous local gradient deflection', async () => {
      const res = await fetch(`${baseUrl}/api/v1/routes/hstar/deflect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: { latitude: 12.9172, longitude: 77.6228 }, // Silk Board
          destination: { latitude: 12.9569, longitude: 77.7011 }, // Marathahalli
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.algorithm).toContain('Swarm-Potential');
      expect(Number.isFinite(json.executionDurationMs)).toBe(true);
      expect(json.nextEdge).toBeDefined();
      expect(json.nextEdge.name).toBeDefined();
      // Must deflect away from Bellandur underpass onto safe elevated ridge
      expect(json.nextEdge.id).not.toBe('road-bellandur-001');
    });

    it('POST /api/v1/routes/dstar/dynamic-obstacle should incrementally repair tree and replan around blockages', async () => {
      const res = await fetch(`${baseUrl}/api/v1/routes/dstar/dynamic-obstacle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          edgeId: 'road-bellandur-001',
          reason: 'Severe localized flood crest 40cm',
          origin: { latitude: 12.9172, longitude: 77.6228 },
          destination: { latitude: 12.9569, longitude: 77.7011 },
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.algorithm).toContain('HD* Lite');
      expect(json.blockedEdgeId).toBe('road-bellandur-001');
      expect(json.incrementalReplan).toBeDefined();
      expect(json.incrementalReplan.repairedVerticesCount).toBeGreaterThan(0);
      expect(json.incrementalReplan.nodesExpanded).toBeGreaterThan(0);
      expect(json.incrementalReplan.memoryUsageEstimateBytes).toBeGreaterThan(0);
      expect(json.updatedRoute.success).toBe(true);
      expect(json.updatedRoute.isBlocked).toBe(false);
      expect(json.updatedRoute.edges.some((e: any) => e.id === 'road-hal-002')).toBe(true);
    });

    it('GET /api/v1/routes/hstar/potential-field should return active hazard sources and space-time reservations', async () => {
      const res = await fetch(`${baseUrl}/api/v1/routes/hstar/potential-field`);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.algorithm).toContain('H-STAR');
      expect(json.hazardsCount).toBeGreaterThan(0);
      expect(Array.isArray(json.hazards)).toBe(true);
      expect(Array.isArray(json.activeReservations)).toBe(true);

      // Verify hazard properties
      const hazard = json.hazards[0];
      expect(hazard).toHaveProperty('id');
      expect(hazard).toHaveProperty('latitude');
      expect(hazard).toHaveProperty('longitude');
      expect(hazard).toHaveProperty('severity');
    });

    it('GET /api/v1/routes/:id should retrieve a previously calculated route by ID', async () => {
      const calcRes = await fetch(`${baseUrl}/api/v1/routes/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: { latitude: 12.9716, longitude: 77.5946 },
          destination: { latitude: 13.0048, longitude: 77.5990 },
        }),
      });
      const calcData = await calcRes.json();
      const routeId = calcData.recommendedRoute.routeId;

      const getRes = await fetch(`${baseUrl}/api/v1/routes/${routeId}`);
      expect(getRes.status).toBe(200);
      const getData = await getRes.json();
      expect(getData.success).toBe(true);
      expect(getData.routeId).toBe(routeId);
      expect(getData.distanceMeters).toBe(calcData.recommendedRoute.distanceMeters);
      expect(getData.totalDistanceMeters).toBe(calcData.recommendedRoute.distanceMeters);
    });
  });
});
