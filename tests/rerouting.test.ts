import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { createApp } from '../apps/api/src/app.js';
import { reroutingPolicyService } from '../apps/api/src/services/routing/reroutingPolicy.service.js';
import { activeRouteService } from '../apps/api/src/services/routing/activeRoute.service.js';
import { routingEngineService } from '../apps/api/src/services/routing/routingEngine.service.js';
import { CandidateRouteOutput, RoadRiskRecord } from '../packages/shared/src/types/index.js';

describe('Phase 5: Dynamic Rerouting Engine & Anti-Oscillation Guardrails', () => {
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

  const baseCandidateRoute: CandidateRouteOutput = {
    routeId: 'route-test-session',
    origin: { latitude: 40.7128, longitude: -74.006 },
    destination: { latitude: 40.714, longitude: -74.012 },
    geometry: { type: 'LineString', coordinates: [[-74.006, 40.7128], [-74.012, 40.714]] },
    distanceMeters: 2500,
    estimatedTravelTimeSeconds: 480,
    risk: {
      overall: 20,
      flood: 15,
      traffic: 25,
      incident: 0,
    },
    status: 'SAFE_TO_PROCEED',
    segments: [
      {
        roadId: 'road-corridor-alpha',
        sequence: 0,
        distanceMeters: 1200,
        travelTimeSeconds: 240,
        trafficScore: 25,
        floodScore: 15,
        incidentScore: 0,
        accessibility: 'OPEN',
      },
      {
        roadId: 'road-corridor-beta',
        sequence: 1,
        distanceMeters: 1300,
        travelTimeSeconds: 240,
        trafficScore: 25,
        floodScore: 15,
        incidentScore: 0,
        accessibility: 'OPEN',
      },
    ],
    reasoning: {
      advantages: ['Safe initial corridor'],
      cautions: [],
      tradeOffs: [],
    },
  };

  describe('1. Material Change Triggers', () => {
    it('Trigger 1: should trigger immediate reroute when any road segment becomes BLOCKED', async () => {
      const roadUpdates: RoadRiskRecord[] = [
        {
          roadId: 'road-corridor-alpha',
          overallMobilityRisk: 95,
          floodRisk: 95,
          trafficRisk: 80,
          incidentRisk: 30,
          accessibilityState: 'BLOCKED',
          blockageReason: 'Flash flood inundation depth 32cm',
          freshness: 'LIVE',
          updatedAt: new Date().toISOString(),
        },
      ];

      const evalResult = await reroutingPolicyService.evaluateRouteForReroute({
        currentRoute: baseCandidateRoute,
        roadUpdates,
        userId: 'test-user-trigger1',
      });

      expect(evalResult.shouldReroute).toBe(true);
      expect(evalResult.triggerType).toBe('ROAD_BLOCKED');
      expect(evalResult.isEmergencyOverride).toBe(true);
      expect(evalResult.reason).toContain('BLOCKED');
    });

    it('Trigger 2: should trigger reroute when flood risk crosses the critical safety threshold', async () => {
      const roadUpdates: RoadRiskRecord[] = [
        {
          roadId: 'road-corridor-alpha',
          overallMobilityRisk: 75,
          floodRisk: 78, // Crosses default threshold (65)
          trafficRisk: 30,
          incidentRisk: 0,
          accessibilityState: 'HIGH_RISK',
          freshness: 'LIVE',
          updatedAt: new Date().toISOString(),
        },
      ];

      const evalResult = await reroutingPolicyService.evaluateRouteForReroute({
        currentRoute: baseCandidateRoute,
        roadUpdates,
        userId: 'test-user-trigger2',
      });

      expect(evalResult.shouldReroute).toBe(true);
      expect(['FLOOD_RISK_SURGE', 'ROAD_HIGH_RISK']).toContain(evalResult.triggerType);
    });

    it('Trigger 4: should trigger reroute when traffic congestion materially spikes', async () => {
      const roadUpdates: RoadRiskRecord[] = [
        {
          roadId: 'road-corridor-alpha',
          overallMobilityRisk: 65,
          floodRisk: 20,
          trafficRisk: 85, // Traffic spikes from 25 to 85 (+60 points, > 35 delta)
          incidentRisk: 10,
          accessibilityState: 'CAUTION',
          freshness: 'LIVE',
          updatedAt: new Date().toISOString(),
        },
      ];

      const evalResult = await reroutingPolicyService.evaluateRouteForReroute({
        currentRoute: baseCandidateRoute,
        roadUpdates,
        userId: 'test-user-trigger4',
      });

      expect(evalResult.shouldReroute).toBe(true);
      expect(evalResult.triggerType).toBe('TRAFFIC_SURGE');
      expect(evalResult.reason.toLowerCase()).toContain('traffic');
    });

    it('Trigger 5: should trigger reroute when an incident occurs on route', async () => {
      const evalResult = await reroutingPolicyService.evaluateRouteForReroute({
        currentRoute: baseCandidateRoute,
        incidentDetected: {
          roadId: 'road-corridor-beta',
          severity: 'MAJOR',
          description: 'Emergency tanker spill blocking lane',
        },
        userId: 'test-user-trigger5',
      });

      expect(evalResult.shouldReroute).toBe(true);
      expect(evalResult.triggerType).toBe('INCIDENT_ON_ROUTE');
    });

    it('Trigger 6: should trigger reroute when user significantly deviates from path (> 75m)', async () => {
      const evalResult = await reroutingPolicyService.evaluateRouteForReroute({
        currentRoute: baseCandidateRoute,
        userLocation: {
          latitude: 40.730, // Far off from route
          longitude: -74.020,
        },
        userId: 'test-user-trigger6',
      });

      expect(evalResult.shouldReroute).toBe(true);
      expect(evalResult.triggerType).toBe('USER_DEVIATION');
    });
  });

  describe('2. Anti-Oscillation Guardrails: Hysteresis & Cooldown', () => {
    it('Hysteresis: should suppress reroute for minor condition changes (< 15% threshold)', async () => {
      const minorRoadUpdates: RoadRiskRecord[] = [
        {
          roadId: 'road-corridor-alpha',
          overallMobilityRisk: 24, // Was 20, delta is only +4 points (< 15%)
          floodRisk: 18,
          trafficRisk: 28,
          incidentRisk: 0,
          accessibilityState: 'OPEN',
          freshness: 'LIVE',
          updatedAt: new Date().toISOString(),
        },
      ];

      const evalResult = await reroutingPolicyService.evaluateRouteForReroute({
        currentRoute: baseCandidateRoute,
        roadUpdates: minorRoadUpdates,
        userId: 'test-user-hysteresis',
      });

      expect(evalResult.shouldReroute).toBe(false);
      expect(evalResult.reason).toContain('Route remains optimal');
    });

    it('Cooldown: should reject second reroute within 90-second cooldown window for non-emergency change', async () => {
      const userId = 'test-user-cooldown';

      // First reroute
      reroutingPolicyService.recordRecalculation({
        routeId: baseCandidateRoute.routeId,
        newVersion: 2,
        triggerType: 'TRAFFIC_SURGE',
        reason: 'Initial traffic surge',
        timestamp: new Date().toISOString(),
        riskDelta: 20,
        etaDeltaSeconds: 180,
      });

      // Second minor non-emergency evaluation immediately within cooldown
      const roadUpdates: RoadRiskRecord[] = [
        {
          roadId: 'road-corridor-alpha',
          overallMobilityRisk: 62,
          floodRisk: 30,
          trafficRisk: 75,
          incidentRisk: 0,
          accessibilityState: 'CAUTION',
          freshness: 'LIVE',
          updatedAt: new Date().toISOString(),
        },
      ];

      const evalResult = await reroutingPolicyService.evaluateRouteForReroute({
        currentRoute: baseCandidateRoute,
        roadUpdates,
        userId,
      });

      // Cooldown should prevent non-emergency reroute
      expect(evalResult.shouldReroute).toBe(false);
      expect(evalResult.reason).toContain('cooldown');
    });

    it('Emergency Override: should bypass cooldown when road is physically BLOCKED', async () => {
      const userId = 'test-user-emergency-override';

      // Set cooldown
      reroutingPolicyService.recordRecalculation({
        routeId: baseCandidateRoute.routeId,
        newVersion: 2,
        triggerType: 'TRAFFIC_SURGE',
        reason: 'Previous traffic shift',
        timestamp: new Date().toISOString(),
        riskDelta: 10,
        etaDeltaSeconds: 60,
      });

      // Impassable physical blockage within 500m
      const blockedUpdates: RoadRiskRecord[] = [
        {
          roadId: 'road-corridor-alpha',
          overallMobilityRisk: 99,
          floodRisk: 99,
          trafficRisk: 90,
          incidentRisk: 50,
          accessibilityState: 'BLOCKED',
          blockageReason: 'Catastrophic flash flood water depth 45cm',
          freshness: 'LIVE',
          updatedAt: new Date().toISOString(),
        },
      ];

      const evalResult = await reroutingPolicyService.evaluateRouteForReroute({
        currentRoute: baseCandidateRoute,
        roadUpdates: blockedUpdates,
        userId,
      });

      // Emergency override MUST bypass cooldown
      expect(evalResult.shouldReroute).toBe(true);
      expect(evalResult.isEmergencyOverride).toBe(true);
      expect(evalResult.triggerType).toBe('ROAD_BLOCKED');
    });
  });

  describe('3. Route Versioning & Recalculation History', () => {
    it('should increment route version and maintain explainable history', () => {
      const routeId = 'route-audit-version-test';

      const v1 = reroutingPolicyService.recordRecalculation({
        routeId,
        newVersion: 1,
        triggerType: 'ALTERNATIVE_AVAILABLE',
        reason: 'Initial baseline navigation route',
        timestamp: new Date().toISOString(),
        riskDelta: 0,
        etaDeltaSeconds: 0,
      });

      expect(v1.version).toBe(1);

      const v2 = reroutingPolicyService.recordRecalculation({
        routeId,
        newVersion: 2,
        triggerType: 'FLOOD_RISK_SURGE',
        reason: 'Water levels surged along low-elevation underpass',
        timestamp: new Date().toISOString(),
        riskDelta: -35, // Safer by 35 points
        etaDeltaSeconds: 120, // +2 min
      });

      expect(v2.version).toBe(2);

      const history = reroutingPolicyService.getVersionHistory(routeId);
      expect(history.length).toBe(2);
      expect(history[0].version).toBe(1);
      expect(history[1].version).toBe(2);
      expect(history[1].reason).toContain('Water levels surged');
    });
  });

  describe('4. Active Route Navigation Session REST API', () => {
    let routeId: string;

    beforeAll(async () => {
      const calcRes = await fetch(`${baseUrl}/api/v1/routes/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: { latitude: 40.7128, longitude: -74.0060, name: 'Origin' },
          destination: { latitude: 40.7140, longitude: -74.0120, name: 'Hospital' },
        }),
      });
      const data = await calcRes.json();
      routeId = data.recommendedRoute.routeId;
    });

    it('POST /api/v1/routes/:id/start should initiate an active navigation session', async () => {
      const res = await fetch(`${baseUrl}/api/v1/routes/${routeId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'user-nav-001' }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty('session');
      expect(data.session.routeId).toBe(routeId);
      expect(data.session.userId).toBe('user-nav-001');
      expect(data.session.status).toBe('ACTIVE');
      expect(data.session.currentRouteVersion).toBe(1);
    });

    it('GET /api/v1/routes/active should return current user active route', async () => {
      const res = await fetch(`${baseUrl}/api/v1/routes/active?userId=user-nav-001`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty('session');
      expect(data.session.routeId).toBe(routeId);
    });

    it('POST /api/v1/routes/:id/recalculate should perform an explicit reroute', async () => {
      const res = await fetch(`${baseUrl}/api/v1/routes/${routeId}/recalculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'user-nav-001',
          reason: 'TRAFFIC_SURGE',
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty('session');
      expect(data.session.currentRouteVersion).toBeGreaterThan(1);
    });

    it('GET /api/v1/routes/:id/versions should return full route version audit history', async () => {
      const res = await fetch(`${baseUrl}/api/v1/routes/${routeId}/versions`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty('versions');
      expect(Array.isArray(data.versions)).toBe(true);
      expect(data.versions.length).toBeGreaterThanOrEqual(1);
    });

    it('POST /api/v1/routes/:id/stop should terminate the active navigation session', async () => {
      const res = await fetch(`${baseUrl}/api/v1/routes/${routeId}/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'user-nav-001' }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty('session');
      expect(data.session.status).toBe('COMPLETED');
    });
  });
});
