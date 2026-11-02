import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { createApp } from '../apps/api/src/app.js';
import {
  calculateSegmentCost,
  evaluateCandidateRoute,
  calculateFloodRouteIndex,
  calculateMobilityRiskIndex,
  classifyRouteStatus,
  buildRouteReasoning,
  DEFAULT_ROUTING_PARAMS,
} from '../packages/shared/src/calculators/routing.js';
import { routingEngineService } from '../apps/api/src/services/routing/routingEngine.service.js';
import { RoadSegment } from '../packages/shared/src/types/index.js';

describe('Phase 5: Flood-Aware Routing Engine', () => {
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

  const openSegment: RoadSegment = {
    id: 'seg-open',
    name: 'Highland Avenue',
    roadClass: 'primary',
    lengthMeters: 1000,
    speedLimitKmh: 50,
    floodScore: 10,
    trafficScore: 15,
    compositeRisk: 12,
    accessibilityState: 'OPEN',
    confidence: 1.0,
    isHistoricallyFloodProne: false,
    coordinates: [[-74.01, 40.71], [-74.02, 40.72]],
  };

  const blockedSegment: RoadSegment = {
    id: 'seg-blocked',
    name: 'Bay Street Overpass',
    roadClass: 'primary',
    lengthMeters: 1000,
    speedLimitKmh: 50,
    floodScore: 95,
    trafficScore: 85,
    compositeRisk: 92,
    accessibilityState: 'BLOCKED',
    confidence: 1.0,
    isHistoricallyFloodProne: true,
    coordinates: [[-74.01, 40.71], [-74.00, 40.72]],
    blockageReason: 'Deep standing water over 28cm',
  };

  const highRiskSegment: RoadSegment = {
    id: 'seg-high-risk',
    name: 'Riverbank Road',
    roadClass: 'secondary',
    lengthMeters: 1000,
    speedLimitKmh: 50,
    floodScore: 70,
    trafficScore: 50,
    compositeRisk: 68,
    accessibilityState: 'HIGH_RISK',
    confidence: 1.0,
    isHistoricallyFloodProne: true,
    coordinates: [[-74.01, 40.71], [-74.01, 40.73]],
  };

  describe('1. Segment Cost Model & Safety Overrides', () => {
    it('should strictly exclude BLOCKED segments with infinite cost', () => {
      const cost = calculateSegmentCost(blockedSegment);

      expect(cost.isExcluded).toBe(true);
      expect(cost.totalCost).toBe(Infinity);
      expect(cost.exclusionReason).toBe('Deep standing water over 28cm');
    });

    it('should calculate finite, safety-weighted cost for OPEN segments', () => {
      const cost = calculateSegmentCost(openSegment);

      expect(cost.isExcluded).toBe(false);
      expect(cost.totalCost).toBeGreaterThan(0);
      expect(Number.isFinite(cost.totalCost)).toBe(true);
      expect(cost.travelTimeSeconds).toBeGreaterThan(0);
    });

    it('should heavily penalize HIGH_RISK segments compared to OPEN segments', () => {
      const openCost = calculateSegmentCost(openSegment);
      const highRiskCost = calculateSegmentCost(highRiskSegment);

      // High risk cost must be significantly higher due to flood weight multiplier
      expect(highRiskCost.totalCost).toBeGreaterThan(openCost.totalCost * 5);
      expect(highRiskCost.floodPenaltySeconds).toBeGreaterThan(openCost.floodPenaltySeconds * 10);
    });

    it('should invalidate an entire candidate route if any segment is BLOCKED', () => {
      const routeWithBlockage = evaluateCandidateRoute([openSegment, blockedSegment]);

      expect(routeWithBlockage.isBlocked).toBe(true);
      expect(routeWithBlockage.totalCost).toBe(Infinity);
    });

    it('should calculate valid finite metrics for safe alternative route', () => {
      const safeRoute = evaluateCandidateRoute([openSegment, openSegment]);

      expect(safeRoute.isBlocked).toBe(false);
      expect(Number.isFinite(safeRoute.totalCost)).toBe(true);
      expect(safeRoute.totalDistanceMeters).toBe(2000);
      expect(safeRoute.totalDurationSeconds).toBeGreaterThan(0);
      expect(safeRoute.totalRiskScore).toBe(12);
    });
  });

  describe('2. Flood Route Index (FRI) & Mobility Risk Index (MRI)', () => {
    it('should compute distance-weighted Flood Route Index (FRI)', () => {
      const fri = calculateFloodRouteIndex([
        { floodPenalty: 0.1, lengthMeters: 1000 },
        { floodPenalty: 0.8, lengthMeters: 500 },
      ]);

      // FRI = (0.1 * 1000 + 0.8 * 500) / 1500 = (100 + 400) / 1500 = 500 / 1500 ≈ 0.333
      expect(fri).toBeCloseTo(0.333, 2);
    });

    it('should compute composite Mobility Risk Index (MRI) combining flood, traffic and incidents', () => {
      const mri = calculateMobilityRiskIndex({
        floodRisk: 60,
        trafficRisk: 40,
        incidentRisk: 20,
      });

      // MRI = 0.55 * 60 + 0.30 * 40 + 0.15 * 20 = 33 + 12 + 3 = 48
      expect(mri).toBe(48);
    });

    it('should classify route status based on safety thresholds', () => {
      expect(classifyRouteStatus(15, false)).toBe('SAFE_TO_PROCEED');
      expect(classifyRouteStatus(45, false)).toBe('CAUTION');
      expect(classifyRouteStatus(75, false)).toBe('HIGH_RISK');
      expect(classifyRouteStatus(20, true)).toBe('INVALID'); // Blockage always yields INVALID
    });

    it('should construct transparent, explainable route reasoning', () => {
      const reasoning = buildRouteReasoning({
        floodRisk: 12,
        trafficRisk: 18,
        incidentRisk: 0,
        isBlocked: false,
        durationSeconds: 600,
        baselineDurationSeconds: 480,
      });

      expect(reasoning.advantages.length).toBeGreaterThan(0);
      expect(reasoning.tradeOffs.length).toBeGreaterThan(0);
      expect(reasoning.cautions.length).toBe(0);
    });
  });

  describe('3. Multi-Candidate Route Ranking & Safety Supremacy', () => {
    it('should prefer a safer route over a faster submerged route', async () => {
      const result = await routingEngineService.calculateRoutes({
        origin: { latitude: 40.7128, longitude: -74.006, name: 'City Center' },
        destination: { latitude: 40.714, longitude: -74.012, name: 'City Memorial Hospital' },
        preferences: {
          prioritizeSafety: true,
          avoidFloodRiskThreshold: 50,
        },
      });

      expect(result).toHaveProperty('recommendedRoute');
      expect(result).toHaveProperty('candidateRoutes');
      expect(result.candidateRoutes.length).toBeGreaterThan(1);

      // Recommended route must be safe
      expect(['SAFE_TO_PROCEED', 'CAUTION']).toContain(result.recommendedRoute.status);
      expect(result.recommendedRoute.risk.flood).toBeLessThan(50);

      // The direct route has a submerged blocked segment, so it must be marked INVALID and not recommended
      const blockedCandidate = result.candidateRoutes.find((c) => c.status === 'INVALID');
      expect(blockedCandidate).toBeDefined();
      expect(result.recommendedRoute.id).not.toBe(blockedCandidate?.id);
    });

    it('should include explainable reasoning for all candidate routes', async () => {
      const result = await routingEngineService.calculateRoutes({
        origin: { latitude: 40.7128, longitude: -74.006 },
        destination: { latitude: 40.714, longitude: -74.012 },
      });

      for (const candidate of result.candidateRoutes) {
        expect(candidate.reasoning).toBeDefined();
        expect(Array.isArray(candidate.reasoning.advantages)).toBe(true);
        expect(Array.isArray(candidate.reasoning.cautions)).toBe(true);
        expect(Array.isArray(candidate.reasoning.tradeOffs)).toBe(true);
      }
    });
  });

  describe('4. REST API Route Calculation & Retrieval', () => {
    it('POST /api/v1/routes/calculate should return recommended route and candidate alternatives', async () => {
      const res = await fetch(`${baseUrl}/api/v1/routes/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: { latitude: 40.7128, longitude: -74.0060, name: 'Downtown Hub' },
          destination: { latitude: 40.7140, longitude: -74.0120, name: 'North Clinic' },
          preferences: { prioritizeSafety: true },
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty('recommendedRoute');
      expect(data).toHaveProperty('candidateRoutes');
      expect(data.recommendedRoute).toHaveProperty('routeId');
      expect(data.recommendedRoute).toHaveProperty('geometry');
      expect(data.recommendedRoute).toHaveProperty('risk');
      expect(data.recommendedRoute.risk).toHaveProperty('overall');
      expect(data.recommendedRoute.risk).toHaveProperty('flood');
      expect(data.recommendedRoute.risk).toHaveProperty('traffic');
      expect(data.recommendedRoute).toHaveProperty('status');
      expect(data.recommendedRoute).toHaveProperty('segments');
    });

    it('POST /api/v1/routes/calculate should reject requests with missing origin or destination with 400', async () => {
      const res = await fetch(`${baseUrl}/api/v1/routes/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: { latitude: 40.7128, longitude: -74.0060 },
          // Missing destination
        }),
      });

      expect(res.status).toBe(400);
    });

    it('GET /api/v1/routes/:id should return route details or 404 for non-existent route', async () => {
      // First calculate a route to get a valid ID
      const calcRes = await fetch(`${baseUrl}/api/v1/routes/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: { latitude: 40.7128, longitude: -74.0060 },
          destination: { latitude: 40.7140, longitude: -74.0120 },
        }),
      });

      const calcData = await calcRes.json();
      const validId = calcData.recommendedRoute.routeId;

      const getRes = await fetch(`${baseUrl}/api/v1/routes/${validId}`);
      expect(getRes.status).toBe(200);
      const getData = await getRes.json();
      expect(getData.routeId).toBe(validId);

      // Non-existent ID returns 404
      const notFoundRes = await fetch(`${baseUrl}/api/v1/routes/non-existent-route-id`);
      expect(notFoundRes.status).toBe(404);
    });

    it('POST /api/v1/routing/calculate should maintain backward compatibility with Phase 1 endpoint', async () => {
      const res = await fetch(`${baseUrl}/api/v1/routing/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: { latitude: 40.7128, longitude: -74.0060 },
          destination: { latitude: 40.7140, longitude: -74.0120 },
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty('recommendedRoute');
      expect(data).toHaveProperty('safetyDecision');
    });
  });
});
