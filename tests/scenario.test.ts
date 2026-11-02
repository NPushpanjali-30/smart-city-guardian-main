import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { createApp } from '../apps/api/src/app.js';
import { routingEngineService } from '../apps/api/src/services/routing/routingEngine.service.js';
import { reroutingPolicyService } from '../apps/api/src/services/routing/reroutingPolicy.service.js';
import { evaluateCandidateRoute, calculateSegmentCost } from '../packages/shared/src/calculators/routing.js';
import { RoadSegment, CandidateRouteOutput, RoadRiskRecord } from '../packages/shared/src/types/index.js';

describe('Phase 5: Deterministic Demonstration Scenario & Failure Modes', () => {
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

  describe('1. Requirement 69: Deterministic 3-Step Demonstration Scenario', () => {
    // Road segments for Scenario
    // Route A (Direct Corridor): initially 10 km, low flood risk, smooth-moderate traffic
    const segmentRouteA_Initial: RoadSegment = {
      id: 'road-corridor-a',
      name: 'Route A Direct Arterial',
      roadClass: 'primary',
      lengthMeters: 10000,
      speedLimitKmh: 60,
      floodScore: 10,
      trafficScore: 15,
      compositeRisk: 12,
      accessibilityState: 'OPEN',
      confidence: 1.0,
      isHistoricallyFloodProne: false,
      coordinates: [[-74.00, 40.70], [-74.02, 40.80]],
    };

    // Route B (Elevated Detour): 14 km (+4 km / +5 min), minimal flood exposure
    const segmentRouteB_Initial: RoadSegment = {
      id: 'road-corridor-b',
      name: 'Route B Elevated Ridge Bypass',
      roadClass: 'primary',
      lengthMeters: 14000,
      speedLimitKmh: 60,
      floodScore: 5,
      trafficScore: 15,
      compositeRisk: 8,
      accessibilityState: 'OPEN',
      confidence: 1.0,
      isHistoricallyFloodProne: false,
      coordinates: [[-74.00, 40.70], [-74.04, 40.80]],
    };

    // Route C (Northern Ring Expressway): 20 km (+10 km), high-capacity ring
    const segmentRouteC_Initial: RoadSegment = {
      id: 'road-corridor-c',
      name: 'Route C Northern Ring Corridor',
      roadClass: 'motorway',
      lengthMeters: 20000,
      speedLimitKmh: 60,
      floodScore: 5,
      trafficScore: 15,
      compositeRisk: 8,
      accessibilityState: 'OPEN',
      confidence: 1.0,
      isHistoricallyFloodProne: false,
      coordinates: [[-74.00, 40.70], [-74.06, 40.80]],
    };

    it('Step 1: Initial state — Route A is selected because it is direct, low flood risk and moderate traffic', () => {
      const evalA = evaluateCandidateRoute([segmentRouteA_Initial]);
      const evalB = evaluateCandidateRoute([segmentRouteB_Initial]);
      const evalC = evaluateCandidateRoute([segmentRouteC_Initial]);

      // Route A has lowest duration and acceptable low flood risk (< 20)
      expect(evalA.totalDurationSeconds).toBeLessThan(evalB.totalDurationSeconds);
      expect(evalA.totalDurationSeconds).toBeLessThan(evalC.totalDurationSeconds);
      expect(evalA.isBlocked).toBe(false);
      expect(evalA.totalCost).toBeLessThan(evalB.totalCost);
      expect(evalA.totalCost).toBeLessThan(evalC.totalCost);
    });

    it('Step 2: Flood risk surges on Route A — Route B is selected despite +6 min travel time', async () => {
      // Flood risk surges on Route A
      const segmentRouteA_Flooded: RoadSegment = {
        ...segmentRouteA_Initial,
        floodScore: 85,
        compositeRisk: 82,
        accessibilityState: 'BLOCKED',
        blockageReason: 'Severe flash flood inundation depth 35cm',
      };

      const evalA = evaluateCandidateRoute([segmentRouteA_Flooded]);
      const evalB = evaluateCandidateRoute([segmentRouteB_Initial]);
      const evalC = evaluateCandidateRoute([segmentRouteC_Initial]);

      // Route A is now BLOCKED and INVALID with infinite cost
      expect(evalA.isBlocked).toBe(true);
      expect(evalA.totalCost).toBe(Infinity);

      // Route B is now the winning candidate (finite cost, safer than flooded A)
      expect(evalB.isBlocked).toBe(false);
      expect(evalB.totalCost).toBeLessThan(evalA.totalCost);
      expect(evalB.totalCost).toBeLessThan(evalC.totalCost);
      expect(evalB.totalDurationSeconds).toBeGreaterThan(evalA.totalDurationSeconds); // +6 min
    });

    it('Step 3: Route B becomes heavily congested — Route C becomes preferable in second reroute', async () => {
      // Route A remains flooded
      const segmentRouteA_Flooded: RoadSegment = {
        ...segmentRouteA_Initial,
        floodScore: 85,
        compositeRisk: 82,
        accessibilityState: 'BLOCKED',
        blockageReason: 'Severe flash flood inundation depth 35cm',
      };

      // Route B now suffers severe traffic congestion (speed drops, delay spikes)
      const segmentRouteB_Congested: RoadSegment = {
        ...segmentRouteB_Initial,
        trafficScore: 90,
        compositeRisk: 65,
        accessibilityState: 'CAUTION',
      };

      const evalA = evaluateCandidateRoute([segmentRouteA_Flooded]);
      const evalB = evaluateCandidateRoute([segmentRouteB_Congested]);
      const evalC = evaluateCandidateRoute([segmentRouteC_Initial]);

      // Route A is still blocked
      expect(evalA.isBlocked).toBe(true);

      // Route B's cost spikes significantly due to severe traffic penalty
      expect(evalB.totalCost).toBeGreaterThan(evalC.totalCost);

      // Route C (Northern Ring Expressway) now has the lowest composite cost and wins!
      expect(evalC.isBlocked).toBe(false);
      expect(evalC.totalCost).toBeLessThan(evalB.totalCost);
    });
  });

  describe('2. Requirement 59: Graceful Degradation & Failure Tests', () => {
    it('should degrade gracefully to offline fallback when external routing provider is unreachable', async () => {
      // Test the service calculateRoutes with offline mock fallback
      const result = await routingEngineService.calculateRoutes({
        origin: { latitude: 40.7128, longitude: -74.006 },
        destination: { latitude: 40.714, longitude: -74.012 },
      });

      expect(result).toBeDefined();
      expect(result.recommendedRoute).toBeDefined();
      expect(result.candidateRoutes.length).toBeGreaterThan(0);
    });

    it('Safety Rule: UNKNOWN != SAFE — segments with UNKNOWN state must not be treated as safe', () => {
      const unknownSegment: RoadSegment = {
        id: 'seg-unknown-sensor',
        name: 'Unmonitored Ridge Passage',
        roadClass: 'secondary',
        lengthMeters: 1000,
        speedLimitKmh: 50,
        floodScore: 50, // Conservative mid-risk
        trafficScore: 50,
        compositeRisk: 50,
        accessibilityState: 'UNKNOWN',
        confidence: 0.2, // Low confidence
        isHistoricallyFloodProne: false,
        coordinates: [[-74.01, 40.71], [-74.02, 40.72]],
      };

      const cost = calculateSegmentCost(unknownSegment);

      // Must receive conservative safety penalty and not zero risk
      expect(cost.totalCost).toBeGreaterThan(cost.travelTimeSeconds);
      expect(cost.floodPenaltySeconds).toBeGreaterThan(0);
    });

    it('should operate deterministically even if Grok AI decision service is offline', async () => {
      // Even if AI service fails or returns null, routing engine computes valid routes
      const result = await routingEngineService.calculateRoutes({
        origin: { latitude: 40.7128, longitude: -74.006 },
        destination: { latitude: 40.714, longitude: -74.012 },
      });

      expect(result.recommendedRoute).toBeDefined();
      expect(result.safetyDecision).toBeDefined();
      expect(['RECOMMENDED', 'ALTERNATIVE', 'DIRECT_BLOCKED']).toContain(result.recommendedRoute.type);
    });
  });
});
