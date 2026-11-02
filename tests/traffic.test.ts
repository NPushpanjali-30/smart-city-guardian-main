import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { createApp } from '../apps/api/src/app.js';
import {
  calculateTrafficScore,
  classifyTrafficState,
} from '../packages/shared/src/calculators/traffic.js';
import { trafficIntelligenceService } from '../apps/api/src/services/traffic/trafficIntelligence.service.js';
import { trafficCorridorService } from '../apps/api/src/services/traffic/trafficCorridor.service.js';
import { roadRiskService } from '../apps/api/src/services/roads/roadRisk.service.js';
import { TrafficIncident } from '../packages/shared/src/types/index.js';

describe('Phase 5: Traffic Intelligence Engine', () => {
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

  describe('1. Traffic Score Formulation & Explainability', () => {
    it('should calculate low traffic score and classify as SMOOTH for free-flow conditions', () => {
      const result = calculateTrafficScore({
        currentSpeedKmh: 48,
        freeFlowSpeedKmh: 50,
        currentTravelTimeSeconds: 120,
        freeFlowTravelTimeSeconds: 115,
        congestionLevel: 10,
        incidents: [],
        timestamp: new Date().toISOString(),
      });

      expect(result.score).toBeLessThanOrEqual(25);
      expect(result.state).toBe('SMOOTH');
      expect(result.delayFactor).toBeCloseTo(120 / 115, 2);
      expect(result.incidentRisk).toBe(0);
      expect(result.confidence).toBe(1.0);
      expect(result.factors.length).toBeGreaterThan(0);
      expect(result.summary?.toLowerCase()).toContain('smooth');
    });

    it('should calculate moderate traffic score and classify as SLOW', () => {
      const result = calculateTrafficScore({
        currentSpeedKmh: 30,
        freeFlowSpeedKmh: 50,
        currentTravelTimeSeconds: 200,
        freeFlowTravelTimeSeconds: 120,
        congestionLevel: 45,
        incidents: [],
        timestamp: new Date().toISOString(),
      });

      expect(result.score).toBeGreaterThan(25);
      expect(result.score).toBeLessThanOrEqual(50);
      expect(result.state).toBe('SLOW');
      expect(result.delayFactor).toBeCloseTo(200 / 120, 2);
    });

    it('should calculate high traffic score and classify as CONGESTED or SEVERELY_CONGESTED', () => {
      const result = calculateTrafficScore({
        currentSpeedKmh: 12,
        freeFlowSpeedKmh: 50,
        currentTravelTimeSeconds: 480,
        freeFlowTravelTimeSeconds: 120,
        congestionLevel: 85,
        incidents: [],
        timestamp: new Date().toISOString(),
      });

      expect(result.score).toBeGreaterThan(50);
      expect(['CONGESTED', 'SEVERELY_CONGESTED']).toContain(result.state);
      expect(result.delayFactor).toBe(4.0);
    });

    it('should safely handle missing free-flow values without division by zero', () => {
      const result = calculateTrafficScore({
        currentSpeedKmh: 25,
        freeFlowSpeedKmh: 0, // Edge case: zero or missing
        currentTravelTimeSeconds: 100,
        freeFlowTravelTimeSeconds: 0,
        congestionLevel: 30,
        incidents: [],
        timestamp: new Date().toISOString(),
      });

      expect(Number.isFinite(result.score)).toBe(true);
      expect(Number.isFinite(result.delayFactor)).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it('should penalize stale traffic data and reduce confidence', () => {
      const twoHoursAgo = new Date(Date.now() - 7200 * 1000).toISOString();
      const result = calculateTrafficScore({
        currentSpeedKmh: 45,
        freeFlowSpeedKmh: 50,
        currentTravelTimeSeconds: 120,
        freeFlowTravelTimeSeconds: 120,
        congestionLevel: 10,
        incidents: [],
        timestamp: twoHoursAgo,
      });

      // Data is stale (> 30 min)
      expect(result.confidence).toBeLessThan(1.0);
    });

    it('should incorporate verified traffic incidents into road incident score', () => {
      const incidents: TrafficIncident[] = [
        {
          id: 'inc-01',
          type: 'ACCIDENT',
          severity: 'MAJOR',
          description: 'Multi-vehicle collision blocking 2 lanes',
          location: { latitude: 40.712, longitude: -74.005 },
          roadId: 'road-bay-st-001',
          startTime: new Date().toISOString(),
          source: 'POLICE_DISPATCH',
          freshness: 'LIVE',
        },
      ];

      const result = calculateTrafficScore({
        currentSpeedKmh: 20,
        freeFlowSpeedKmh: 50,
        currentTravelTimeSeconds: 300,
        freeFlowTravelTimeSeconds: 120,
        congestionLevel: 60,
        incidents,
        timestamp: new Date().toISOString(),
      });

      expect(result.incidentRisk).toBeGreaterThan(0);
      expect(result.score).toBeGreaterThan(50);
      const incidentFactor = result.factors.find((f) => f.factor === 'incident_severity');
      expect(incidentFactor).toBeDefined();
      expect(incidentFactor?.contribution).toBeGreaterThan(0);
    });

    it('should classify traffic state boundaries accurately', () => {
      expect(classifyTrafficState(15)).toBe('SMOOTH');
      expect(classifyTrafficState(35)).toBe('SLOW');
      expect(classifyTrafficState(60)).toBe('CONGESTED');
      expect(classifyTrafficState(85)).toBe('SEVERELY_CONGESTED');
    });
  });

  describe('2. Traffic Intelligence Service & Road Risk Integration', () => {
    it('should return normalized road states for all managed roads', async () => {
      const states = await trafficIntelligenceService.getAllRoadStates();
      expect(states.length).toBeGreaterThan(0);

      const sample = states[0];
      expect(sample).toHaveProperty('roadId');
      expect(sample).toHaveProperty('traffic');
      expect(sample.traffic).toHaveProperty('score');
      expect(sample.traffic).toHaveProperty('state');
      expect(sample.traffic).toHaveProperty('delayFactor');
      expect(sample).toHaveProperty('updatedAt');
    });

    it('should evaluate and preserve independent flood, traffic and incident sub-scores', async () => {
      const risks = await roadRiskService.evaluateAllRoadRisks();
      expect(risks.length).toBeGreaterThan(0);

      const bayStreet = risks.find((r) => r.roadId === 'road-bay-st-001');
      expect(bayStreet).toBeDefined();
      if (bayStreet) {
        // Individual components are preserved
        expect(bayStreet).toHaveProperty('floodRisk');
        expect(bayStreet).toHaveProperty('trafficRisk');
        expect(bayStreet).toHaveProperty('incidentRisk');
        expect(bayStreet).toHaveProperty('overallMobilityRisk');
        expect(bayStreet).toHaveProperty('accessibilityState');
        expect(bayStreet.accessibilityState).toBe('BLOCKED');
      }
    });

    it('should aggregate roads into municipal traffic corridors with diversion suggestions', async () => {
      const corridors = await trafficCorridorService.evaluateAllCorridors();
      expect(corridors.length).toBeGreaterThan(0);

      const bayCorridor = corridors.find((c) => c.corridorId === 'corridor-bay-expressway');
      expect(bayCorridor).toBeDefined();
      if (bayCorridor) {
        expect(bayCorridor.floodImpact).toBe('BLOCKED');
        expect(bayCorridor.alternativeCorridors.length).toBeGreaterThan(0);
        expect(bayCorridor.alternativeCorridors).toContain('corridor-highland-detour');
        expect(bayCorridor.recommendedAction).toBe('DIVERT_TRAFFIC');
      }
    });
  });

  describe('3. REST API Endpoints Verification', () => {
    it('GET /api/v1/traffic/roads should return road-level traffic telemetry', async () => {
      const res = await fetch(`${baseUrl}/api/v1/traffic/roads`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty('roads');
      expect(Array.isArray(data.roads)).toBe(true);
      expect(data.roads.length).toBeGreaterThan(0);

      const road = data.roads[0];
      expect(road).toHaveProperty('roadId');
      expect(road).toHaveProperty('traffic');
      expect(road.traffic).toHaveProperty('score');
      expect(road.traffic).toHaveProperty('state');
    });

    it('GET /api/v1/traffic/corridors should return municipal corridor states', async () => {
      const res = await fetch(`${baseUrl}/api/v1/traffic/corridors`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty('corridors');
      expect(Array.isArray(data.corridors)).toBe(true);
      expect(data.corridors.length).toBeGreaterThan(0);

      const corridor = data.corridors[0];
      expect(corridor).toHaveProperty('corridorId');
      expect(corridor).toHaveProperty('name');
      expect(corridor).toHaveProperty('trafficState');
      expect(corridor).toHaveProperty('floodImpact');
      expect(corridor).toHaveProperty('recommendedAction');
    });

    it('GET /api/v1/roads/risk should return comprehensive multi-hazard road risks', async () => {
      const res = await fetch(`${baseUrl}/api/v1/roads/risk`);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty('risks');
      expect(Array.isArray(data.risks)).toBe(true);
      expect(data.risks.length).toBeGreaterThan(0);

      const risk = data.risks[0];
      expect(risk).toHaveProperty('roadId');
      expect(risk).toHaveProperty('overallMobilityRisk');
      expect(risk).toHaveProperty('accessibilityState');
      expect(risk).toHaveProperty('floodRisk');
      expect(risk).toHaveProperty('trafficRisk');
    });
  });
});
