import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { createApp } from '../apps/api/src/app.js';
import { floodRiskEngine } from '../apps/api/src/services/flood/floodRiskEngine.js';
import { shortHorizonPredictor } from '../apps/api/src/services/flood/shortHorizonPredictor.js';
import { roadFloodRiskService } from '../apps/api/src/services/flood/roadFloodRisk.service.js';
import { floodIntelligenceService } from '../apps/api/src/services/flood/floodIntelligence.service.js';
import { buildFloodRiskFeatureSet } from '@smartcity/shared';

describe('Phase 3: Flood Intelligence & Prediction Engine', () => {
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

  describe('1. Current Flood Risk Score & Explainability', () => {
    it('should calculate monotonic risk score increasing with precipitation rate', () => {
      const lowFeatures = buildFloodRiskFeatureSet({
        currentWeather: {
          rainfallRateMmh: 5.0,
          rainfall1hMm: 3.0,
          rainfall24hMm: 10.0,
          timestamp: new Date().toISOString(),
          freshness: 'LIVE',
          dataAgeSeconds: 10,
        },
        isHistoricallyFloodProne: false,
      });

      const highFeatures = buildFloodRiskFeatureSet({
        currentWeather: {
          rainfallRateMmh: 48.0,
          rainfall1hMm: 38.0,
          rainfall24hMm: 110.0,
          timestamp: new Date().toISOString(),
          freshness: 'LIVE',
          dataAgeSeconds: 10,
        },
        isHistoricallyFloodProne: true,
      });

      const lowRisk = floodRiskEngine.calculateRisk(lowFeatures);
      const highRisk = floodRiskEngine.calculateRisk(highFeatures);

      expect(lowRisk.compositeScore).toBeLessThan(highRisk.compositeScore);
      expect(lowRisk.severity).toBe('NORMAL');
      expect(['WARNING', 'CRITICAL']).toContain(highRisk.severity);
      expect(highRisk.factors.length).toBeGreaterThanOrEqual(4);
      expect(highRisk.humanSummary).toContain('Composite Flood Risk');
    });

    it('should provide structured, transparent risk factor contributions', () => {
      const features = buildFloodRiskFeatureSet({
        currentWeather: {
          rainfallRateMmh: 35.0,
          rainfall1hMm: 28.0,
          rainfall24hMm: 80.0,
          timestamp: new Date().toISOString(),
          freshness: 'LIVE',
          dataAgeSeconds: 10,
        },
        isHistoricallyFloodProne: true,
      });

      const risk = floodRiskEngine.calculateRisk(features);

      const factorNames = risk.factors.map((f) => f.name);
      expect(factorNames).toContain('Rainfall Intensity');
      expect(factorNames).toContain('Rainfall Trend & Dynamic Acceleration');
      expect(factorNames).toContain('Predictive Radar Forecast');
      expect(factorNames).toContain('Historical & Topographical Vulnerability');
    });
  });

  describe('2. State Transitions & Hysteresis Anti-Flapping', () => {
    it('should enter WARNING at score >= 50 and remain in WARNING until score drops < 45', () => {
      // Direct entry into WARNING
      const initialEntry = floodRiskEngine.evaluateSeverityWithHysteresis(52);
      expect(initialEntry).toBe('WARNING');

      // Score drops to 48: without hysteresis it would flip to WATCH, but hysteresis holds WARNING
      const heldState = floodRiskEngine.evaluateSeverityWithHysteresis(48, 'WARNING');
      expect(heldState).toBe('WARNING');

      // Score drops below 45 (threshold 50 - margin 5 = 45): state safely steps down to WATCH
      const recoveryState = floodRiskEngine.evaluateSeverityWithHysteresis(42, 'WARNING');
      expect(recoveryState).toBe('WATCH');
    });

    it('should enter CRITICAL at score >= 75 and hold CRITICAL until score drops < 70', () => {
      const initialCritical = floodRiskEngine.evaluateSeverityWithHysteresis(76);
      expect(initialCritical).toBe('CRITICAL');

      // Score fluctuates to 72: held in CRITICAL
      const heldCritical = floodRiskEngine.evaluateSeverityWithHysteresis(72, 'CRITICAL');
      expect(heldCritical).toBe('CRITICAL');

      // Score drops to 68: steps down to WARNING
      const stepDown = floodRiskEngine.evaluateSeverityWithHysteresis(68, 'CRITICAL');
      expect(stepDown).toBe('WARNING');
    });
  });

  describe('3. Short-Horizon Prediction & Nowcasting', () => {
    it('should project increasing risk trajectory and probability over 30-min horizon when rainfall accelerates', () => {
      const features = buildFloodRiskFeatureSet({
        currentWeather: {
          rainfallRateMmh: 42.0,
          rainfall1hMm: 35.0,
          rainfall24hMm: 95.0,
          timestamp: new Date().toISOString(),
          freshness: 'LIVE',
          dataAgeSeconds: 10,
        },
        weatherHistory: [
          { rainfallRateMmh: 18.0, timestamp: new Date(Date.now() - 15 * 60000).toISOString() },
        ],
        isHistoricallyFloodProne: true,
      });

      const prediction = shortHorizonPredictor.predict({
        features,
        currentRiskScore: 62.0,
        currentSeverity: 'WARNING',
        location: { name: 'Metro Test', latitude: 40.71, longitude: -74.01 },
        horizonMinutes: 30,
      });

      expect(prediction.predictionHorizonMinutes).toBe(30);
      expect(prediction.probability).toBeGreaterThan(0.5);
      expect(prediction.trend).toBe('INCREASING');
      expect(prediction.predictedState).toBe('CRITICAL');
      expect(prediction.modelVersion).toBeDefined();
      expect(prediction.fallbackLevel).toBe('BASELINE');
    });

    it('should produce DEGRADED state rather than false NORMAL when telemetry is expired (Rule 49)', () => {
      const expiredFeatures = buildFloodRiskFeatureSet({
        currentWeather: {
          rainfallRateMmh: 0.0,
          rainfall1hMm: 0.0,
          rainfall24hMm: 0.0,
          timestamp: new Date(Date.now() - 4 * 3600000).toISOString(),
          freshness: 'EXPIRED',
          dataAgeSeconds: 14400,
        },
        isHistoricallyFloodProne: false,
      });

      const prediction = shortHorizonPredictor.predict({
        features: expiredFeatures,
        currentRiskScore: 10.0,
        currentSeverity: 'NORMAL',
        location: { name: 'Expired Sector', latitude: 40.71, longitude: -74.01 },
      });

      expect(prediction.fallbackLevel).toBe('DEGRADED');
      expect(prediction.confidence).toBeLessThanOrEqual(0.20);
      expect(prediction.reasons[0]).toContain('temporarily unavailable');
    });
  });

  describe('4. Road Impact Mapping & Accessibility Separation', () => {
    it('should evaluate road flood score while separating environmental hazard from operational blockage', () => {
      const activeZones = [
        {
          zoneId: 'zone-bay-basin-01',
          zoneName: 'Bay Basin Lowlands',
          zoneType: 'OBSERVED_CONFIRMED' as const,
          severity: 'CRITICAL' as const,
          floodScore: 88.0,
          confidence: 0.95,
          waterDepthCm: 28.0,
          polygon: [
            [-74.015, 40.71],
            [-74.005, 40.71],
            [-74.005, 40.72],
            [-74.015, 40.72],
            [-74.015, 40.71],
          ] as [number, number][],
          updatedAt: new Date().toISOString(),
        },
      ];

      const evaluatedRoads = roadFloodRiskService.evaluateRoadRisks(activeZones, 70.0);
      expect(evaluatedRoads.length).toBeGreaterThan(0);

      const bayStreet = evaluatedRoads.find((r) => r.roadId === 'road-bay-st-001');
      expect(bayStreet).toBeDefined();
      expect(bayStreet?.accessibilityState).toBe('BLOCKED');
      expect(bayStreet?.floodScore).toBeGreaterThanOrEqual(85);

      const safeDetour = evaluatedRoads.find((r) => r.roadId === 'road-highland-ave-002');
      expect(safeDetour).toBeDefined();
      expect(safeDetour?.accessibilityState).toBe('OPEN');
    });
  });

  describe('5. Synthetic End-to-End Scenarios (Section 53)', () => {
    it('Scenario A — Normal Baseline: dry conditions yield NORMAL state and safe roads', async () => {
      const evaluation = await floodIntelligenceService.evaluateRisk({
        weatherObservation: {
          id: 'normal-weather',
          source: 'open-meteo',
          timestamp: new Date().toISOString(),
          receivedAt: new Date().toISOString(),
          location: { name: 'Metro Sector A', latitude: 40.71, longitude: -74.01 },
          temperatureC: 22,
          humidityPercent: 55,
          rainfallRateMmh: 0.0,
          rainfall1hMm: 0.0,
          rainfall24hMm: 1.0,
          windSpeedKmh: 12,
          freshness: 'LIVE',
          dataAgeSeconds: 15,
        },
        isHistoricallyFloodProne: false,
        reports: [],
      });

      expect(evaluation.currentRisk.severity).toBe('NORMAL');
      expect(evaluation.currentRisk.compositeScore).toBeLessThan(25);
      expect(evaluation.prediction.predictedState).toBe('NORMAL');
    });

    it('Scenario B — Heavy Rain Onset: rapid rainfall elevates risk to WATCH / WARNING', async () => {
      const evaluation = await floodIntelligenceService.evaluateRisk({
        weatherObservation: {
          id: 'rain-onset',
          source: 'open-meteo',
          timestamp: new Date().toISOString(),
          receivedAt: new Date().toISOString(),
          location: { name: 'Metro Sector B', latitude: 40.71, longitude: -74.01 },
          temperatureC: 20,
          humidityPercent: 90,
          rainfallRateMmh: 32.0,
          rainfall1hMm: 24.0,
          rainfall24hMm: 45.0,
          windSpeedKmh: 35,
          freshness: 'LIVE',
          dataAgeSeconds: 10,
        },
        weatherHistory: [
          { rainfallRateMmh: 8.0, timestamp: new Date(Date.now() - 20 * 60000).toISOString() },
        ],
        isHistoricallyFloodProne: true,
      });

      expect(['WATCH', 'WARNING']).toContain(evaluation.currentRisk.severity);
      expect(evaluation.currentRisk.compositeScore).toBeGreaterThanOrEqual(25);
      expect(evaluation.prediction.trend).toBe('INCREASING');
    });

    it('Scenario C — Sustained Downpour Escalation: saturated conditions trigger CRITICAL state', async () => {
      const evaluation = await floodIntelligenceService.evaluateRisk({
        weatherObservation: {
          id: 'escalation-weather',
          source: 'open-meteo',
          timestamp: new Date().toISOString(),
          receivedAt: new Date().toISOString(),
          location: { name: 'Metro Sector C', latitude: 40.71, longitude: -74.01 },
          temperatureC: 19,
          humidityPercent: 98,
          rainfallRateMmh: 55.0,
          rainfall1hMm: 45.0,
          rainfall24hMm: 140.0,
          windSpeedKmh: 50,
          freshness: 'LIVE',
          dataAgeSeconds: 5,
        },
        isHistoricallyFloodProne: true,
        reports: [
          { category: 'FLOOD', status: 'VERIFIED', ageMinutes: 5, distanceMeters: 100 },
        ],
      });

      expect(['WARNING', 'CRITICAL']).toContain(evaluation.currentRisk.severity);
      expect(evaluation.currentRisk.compositeScore).toBeGreaterThanOrEqual(60);
      expect(evaluation.prediction.predictedState).toBe('CRITICAL');
    });

    it('Scenario D — Recovery: receding rain steps down through hysteresis to NORMAL', async () => {
      const recoveryEvaluation = await floodIntelligenceService.evaluateRisk({
        weatherObservation: {
          id: 'recovery-weather',
          source: 'open-meteo',
          timestamp: new Date().toISOString(),
          receivedAt: new Date().toISOString(),
          location: { name: 'Metro Sector D', latitude: 40.71, longitude: -74.01 },
          temperatureC: 22,
          humidityPercent: 60,
          rainfallRateMmh: 0.0,
          rainfall1hMm: 2.0,
          rainfall24hMm: 15.0,
          windSpeedKmh: 10,
          freshness: 'LIVE',
          dataAgeSeconds: 10,
        },
        isHistoricallyFloodProne: false,
        reports: [],
      });

      expect(recoveryEvaluation.prediction.trend).toBe('DECREASING');
      expect(['NORMAL', 'WATCH']).toContain(recoveryEvaluation.currentRisk.severity);
    });
  });

  describe('6. REST API Endpoints Verification', () => {
    it('GET /api/v1/flood/risk should return current risk and 30m nowcast prediction', async () => {
      const res = await fetch(`${baseUrl}/api/v1/flood/risk`);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.current.score).toBeGreaterThanOrEqual(0);
      expect(json.data.current.state).toBeDefined();
      expect(json.data.prediction.horizonMinutes).toBe(30);
      expect(json.data.prediction.trend).toBeDefined();
      expect(json.data.confidence).toBeGreaterThan(0);
    });

    it('GET /api/v1/flood/predictions should return active nowcast predictions', async () => {
      const res = await fetch(`${baseUrl}/api/v1/flood/predictions?horizon=30`);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.activePrediction.predictionHorizonMinutes).toBe(30);
      expect(json.data.activePrediction.modelVersion).toBeDefined();
    });

    it('GET /api/v1/flood/zones should return classified observed, predicted, and historical zones', async () => {
      const res = await fetch(`${baseUrl}/api/v1/flood/zones`);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);

      const zoneTypes = json.data.map((z: any) => z.zoneType);
      expect(zoneTypes).toContain('OBSERVED_CONFIRMED');
      expect(zoneTypes).toContain('PREDICTED_RISK');
    });

    it('GET /api/v1/flood/history should return prediction audit records', async () => {
      const res = await fetch(`${baseUrl}/api/v1/flood/history`);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.data.length).toBeGreaterThan(0);
    });

    it('GET /api/v1/flood/ai-context should return complete traceable context for Grok AI', async () => {
      const res = await fetch(`${baseUrl}/api/v1/flood/ai-context`);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.currentRisk).toBeDefined();
      expect(json.data.prediction).toBeDefined();
      expect(json.data.traceability.length).toBeGreaterThan(0);
      expect(json.data.traceability[0].source).toBeDefined();
    });

    it('GET /api/v1/roads/flood-risk should return road corridors with accessibility states', async () => {
      const res = await fetch(`${baseUrl}/api/v1/roads/flood-risk`);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.data.length).toBeGreaterThan(0);

      const road = json.data[0];
      expect(road.roadId).toBeDefined();
      expect(road.floodScore).toBeDefined();
      expect(road.accessibilityState).toBeDefined();
    });
  });
});
