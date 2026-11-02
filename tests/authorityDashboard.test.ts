import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { createApp } from '../apps/api/src/app.js';

describe('Phase 6: EOC Authority Control Center & Decision Support APIs', () => {
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

  describe('1. GET /api/v1/admin/overview', () => {
    it('should return configured study area bounds, operational health, and provider telemetry', async () => {
      const res = await fetch(`${baseUrl}/api/v1/admin/overview`);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.status).toBe('ok');
      expect(json.studyArea).toBeDefined();
      expect(json.studyArea.name).toContain('Metro Central Study Basin');
      expect(json.studyArea.bounds).toBeDefined();
      expect(json.studyArea.bounds.north).toBe(40.750);
      expect(json.studyArea.bounds.south).toBe(40.700);
      expect(json.studyArea.areaKm2).toBe(25.0);
      expect(json.studyArea.disclaimer).toContain('Localized decision support prototype');

      // Health metrics
      expect(json.cityHealth).toBeDefined();
      expect(json.cityHealth.overallRiskScore).toBeGreaterThan(0);
      expect(json.cityHealth.blockedRoadsCount).toBeGreaterThanOrEqual(1);
      expect(json.cityHealth.monitoredBasinsCount).toBe(4);

      // Telemetry freshness matrix
      expect(json.telemetryFreshness).toBeDefined();
      expect(json.telemetryFreshness.weatherProvider.status).toBe('HEALTHY');
      expect(json.telemetryFreshness.trafficProvider.status).toBe('HEALTHY');
      expect(json.telemetryFreshness.grokDecisionEngine.status).toBe('OPERATIONAL');
    });
  });

  describe('2. GET /api/v1/admin/events & Filtering', () => {
    it('should return all events when no filter is applied', async () => {
      const res = await fetch(`${baseUrl}/api/v1/admin/events`);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.data.length).toBeGreaterThanOrEqual(3);
      expect(json.pagination).toBeDefined();
      expect(json.pagination.currentPage).toBe(1);
    });

    it('should filter events by severity correctly', async () => {
      const res = await fetch(`${baseUrl}/api/v1/admin/events?severity=CRITICAL`);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      json.data.forEach((evt: any) => {
        expect(evt.severity).toBe('CRITICAL');
      });
    });

    it('should filter events by area ID correctly', async () => {
      const res = await fetch(`${baseUrl}/api/v1/admin/events?areaId=sector-4-lowlands`);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      json.data.forEach((evt: any) => {
        expect(evt.areaId).toBe('sector-4-lowlands');
      });
    });

    it('should support pagination with limit and page params', async () => {
      const res = await fetch(`${baseUrl}/api/v1/admin/events?page=1&limit=2`);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.length).toBeLessThanOrEqual(2);
      expect(json.pagination.limit).toBe(2);
      expect(json.pagination.currentPage).toBe(1);
    });
  });

  describe('3. GET /api/v1/admin/corridors & Diversion Advisories', () => {
    it('should return monitored corridors with accessibility and diversion recommendations', async () => {
      const res = await fetch(`${baseUrl}/api/v1/admin/corridors`);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);

      const bayStreet = json.data.find((c: any) => c.corridorId === 'corridor-bay-st');
      expect(bayStreet).toBeDefined();
      expect(bayStreet.accessibility).toBe('BLOCKED');
      expect(bayStreet.waterDepthCm).toBe(28);
      expect(bayStreet.diversionAdvisory).toContain('Highland Avenue');

      const highlandAve = json.data.find((c: any) => c.corridorId === 'corridor-highland-ave');
      expect(highlandAve).toBeDefined();
      expect(highlandAve.accessibility).toBe('OPEN');
      expect(highlandAve.speedKmh).toBeGreaterThan(30);
    });
  });

  describe('4. GET /api/v1/admin/reroutes (Live Recalculation Stream)', () => {
    it('should return recent dynamic route recalculation events', async () => {
      const res = await fetch(`${baseUrl}/api/v1/admin/reroutes`);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.data.length).toBeGreaterThanOrEqual(1);

      const record = json.data[0];
      expect(record.trigger).toBeDefined();
      expect(record.oldRouteName).toBeDefined();
      expect(record.newRouteName).toBeDefined();
      expect(record.reason).toBeDefined();
    });
  });

  describe('5. Citizen Reports Verification Queue', () => {
    it('should list citizen reports and allow verification', async () => {
      // 1. Fetch reports
      const listRes = await fetch(`${baseUrl}/api/v1/admin/reports`);
      expect(listRes.status).toBe(200);
      const listJson = await listRes.json();
      expect(Array.isArray(listJson.data)).toBe(true);

      // 2. Verify rep-002
      const verifyRes = await fetch(`${baseUrl}/api/v1/admin/reports/rep-002/verify`, {
        method: 'POST',
      });
      expect(verifyRes.status).toBe(200);
      const verifyJson = await verifyRes.json();
      expect(verifyJson.success).toBe(true);
      expect(verifyJson.data.status).toBe('VERIFIED');
    });

    it('should allow dismissing a citizen report', async () => {
      const dismissRes = await fetch(`${baseUrl}/api/v1/admin/reports/rep-003/dismiss`, {
        method: 'POST',
      });
      expect(dismissRes.status).toBe(200);
      const dismissJson = await dismissRes.json();
      expect(dismissJson.success).toBe(true);
    });
  });

  describe('6. Scenario Simulation Generator & Digital Twin State Transitions', () => {
    it('should inject Monsoon Cloudburst scenario with extreme precipitation surge', async () => {
      const res = await fetch(`${baseUrl}/api/v1/admin/simulation/scenario`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario: 'MONSOON_CLOUDBURST' }),
      });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.activeScenario).toBe('MONSOON_CLOUDBURST');
      expect(json.data.rainfallRateMmh).toBeGreaterThan(50);
      expect(json.data.waterDepthCm).toBeGreaterThanOrEqual(40);
      expect(json.data.affectedBasins).toContain('Silk Board Drainage Basin');

      // Verify Overview KPI state reflection
      const overviewRes = await fetch(`${baseUrl}/api/v1/admin/overview`);
      const overviewJson = await overviewRes.json();
      expect(overviewJson.cityHealth.activeScenario).toBe('MONSOON_CLOUDBURST');
      expect(overviewJson.cityHealth.riskTier).toBe('CRITICAL');
      expect(overviewJson.cityHealth.overallRiskScore).toBeGreaterThan(90);
    });

    it('should inject Lake Breach / Dam Failure scenario with emergency evacuation trigger', async () => {
      const res = await fetch(`${baseUrl}/api/v1/admin/simulation/scenario`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario: 'LAKE_BREACH' }),
      });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.activeScenario).toBe('LAKE_BREACH');
      expect(json.data.waterDepthCm).toBe(65);
      expect(json.data.evacuationTriggered).toBe(true);
      expect(json.data.affectedBasins).toContain('Bellandur Lake Embankment');

      const overviewRes = await fetch(`${baseUrl}/api/v1/admin/overview`);
      const overviewJson = await overviewRes.json();
      expect(overviewJson.cityHealth.overallRiskScore).toBe(98.0);
    });

    it('should inject Peak Hour Traffic Gridlock scenario with diversion requirements', async () => {
      const res = await fetch(`${baseUrl}/api/v1/admin/simulation/scenario`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario: 'TRAFFIC_GRIDLOCK' }),
      });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.activeScenario).toBe('TRAFFIC_GRIDLOCK');
      expect(json.data.congestionIndex).toBe(96);
    });

    it('should reset simulation back to nominal baseline', async () => {
      const res = await fetch(`${baseUrl}/api/v1/admin/simulation/reset`, {
        method: 'POST',
      });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.activeScenario).toBe('BASELINE');
      expect(json.data.waterDepthCm).toBe(28);

      const overviewRes = await fetch(`${baseUrl}/api/v1/admin/overview`);
      const overviewJson = await overviewRes.json();
      expect(overviewJson.cityHealth.activeScenario).toBe('BASELINE');
      expect(overviewJson.cityHealth.overallRiskScore).toBe(68.5);
    });
  });

  describe('7. Emergency Municipal Units & Incident Field Dispatch', () => {
    it('should list all emergency municipal units and readiness summaries', async () => {
      const res = await fetch(`${baseUrl}/api/v1/admin/units`);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.summary).toBeDefined();
      expect(json.summary.total).toBeGreaterThanOrEqual(4);

      const types = json.data.map((u: any) => u.type);
      expect(types).toContain('PUMP_TRUCK');
      expect(types).toContain('RESCUE_BOAT');
    });

    it('should dispatch an available emergency unit to an active incident', async () => {
      const res = await fetch(`${baseUrl}/api/v1/admin/units/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unitId: 'unit-boat-02',
          incidentId: 'evt-flood-001',
          assignedSector: 'Sector 4 Bay Basin Lowlands',
        }),
      });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.id).toBe('unit-boat-02');
      expect(json.data.status).toBe('DISPATCHED');
      expect(json.data.assignedIncidentId).toBe('evt-flood-001');
    });

    it('should update unit status to ON_SCENE', async () => {
      const res = await fetch(`${baseUrl}/api/v1/admin/units/unit-boat-02/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ON_SCENE' }),
      });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.status).toBe('ON_SCENE');
    });
  });

  describe('8. Telemetry Circuit Breaker Controls & Fast-Fail Resilience', () => {
    it('should list all telemetry circuit breaker statuses', async () => {
      const res = await fetch(`${baseUrl}/api/v1/admin/system/circuit-breakers`);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.data.length).toBeGreaterThan(0);
    });

    it('should manually trip and reset a circuit breaker for maintenance or fault isolation', async () => {
      // 1. Trip breaker
      const tripRes = await fetch(`${baseUrl}/api/v1/admin/system/circuit-breakers/trip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'OpenMeteoWeather' }),
      });
      expect(tripRes.status).toBe(200);
      const tripJson = await tripRes.json();
      expect(tripJson.success).toBe(true);
      expect(tripJson.state).toBe('OPEN');

      // 2. Reset breaker
      const resetRes = await fetch(`${baseUrl}/api/v1/admin/system/circuit-breakers/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'OpenMeteoWeather' }),
      });
      expect(resetRes.status).toBe(200);
      const resetJson = await resetRes.json();
      expect(resetJson.success).toBe(true);
      expect(resetJson.state).toBe('CLOSED');
    });
  });

  describe('9. Cache Eviction & Diagnostic Latency SLAs', () => {
    it('should evict in-memory state and telemetry caches on demand', async () => {
      const res = await fetch(`${baseUrl}/api/v1/admin/system/cache/evict`, {
        method: 'POST',
      });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toBeDefined();
    });

    it('should return operational readiness and verified latency SLAs (< target)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/admin/diagnostics`);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.status).toBe('ok');
      expect(json.operationalReadiness.overallStatus).toBe('OPERATIONAL');
      expect(json.latencySLAs.weatherIngestionSLA.compliant).toBe(true);
      expect(json.latencySLAs.weatherIngestionSLA.measuredMs).toBeLessThan(json.latencySLAs.weatherIngestionSLA.targetMs);
      expect(json.latencySLAs.floodIntelligenceSLA.compliant).toBe(true);
      expect(json.latencySLAs.floodIntelligenceSLA.measuredMs).toBeLessThan(json.latencySLAs.floodIntelligenceSLA.targetMs);
      expect(json.latencySLAs.unifiedRoadRiskSLA.compliant).toBe(true);
      expect(json.latencySLAs.unifiedRoadRiskSLA.measuredMs).toBeLessThan(json.latencySLAs.unifiedRoadRiskSLA.targetMs);
      expect(json.latencySLAs.multiCandidateRouteSLA.compliant).toBe(true);
      expect(json.latencySLAs.multiCandidateRouteSLA.measuredMs).toBeLessThan(json.latencySLAs.multiCandidateRouteSLA.targetMs);
    });
  });
});
