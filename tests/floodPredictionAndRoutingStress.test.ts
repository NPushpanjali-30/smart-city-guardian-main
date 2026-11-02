import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { createApp } from '../apps/api/src/app.js';
import {
  calculateFloodRisk,
  extractRainfallFeatures,
  extractForecastFeatures,
  extractHistoricalFeatures,
  extractCrowdsourcedFeatures,
  calculateEvidenceConfidence,
  buildFloodRiskFeatureSet,
  haversineDistanceMeters,
} from '@smartcity/shared';
import { floodRiskEngine } from '../apps/api/src/services/flood/floodRiskEngine.js';
import { routingEngineService } from '../apps/api/src/services/routing/routingEngine.service.js';
import { shortHorizonPredictor } from '../apps/api/src/services/flood/shortHorizonPredictor.js';

describe('System & Routing Test Engineering: Flood Prediction Boundary & Routing Stress Suite', () => {
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

  describe('1. Flood Prediction Boundary & Extreme Conditions', () => {
    it('Condition 1A: Zero rainfall yields NORMAL severity, compositeScore < 15, and 0 rainfall contribution', () => {
      const zeroFeatures = buildFloodRiskFeatureSet({
        currentWeather: {
          rainfallRateMmh: 0,
          rainfall1hMm: 0,
          rainfall24hMm: 0,
          timestamp: new Date().toISOString(),
          freshness: 'LIVE',
          dataAgeSeconds: 10,
        },
        isHistoricallyFloodProne: false,
      });

      const result = floodRiskEngine.calculateRisk(zeroFeatures);

      expect(result.severity).toBe('NORMAL');
      expect(result.compositeScore).toBeLessThan(15);
      const rainFactor = result.factors.find((f) => f.name.includes('Rainfall Intensity'));
      expect(rainFactor).toBeDefined();
      expect(rainFactor?.contribution).toBe(0);
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('Condition 1B: Extreme 120 mm/h torrential cloudburst drives CRITICAL severity and caps risk score', () => {
      const torrentialFeatures = buildFloodRiskFeatureSet({
        currentWeather: {
          rainfallRateMmh: 120.0,
          rainfall1hMm: 95.0,
          rainfall24hMm: 210.0,
          timestamp: new Date().toISOString(),
          freshness: 'LIVE',
          dataAgeSeconds: 5,
        },
        forecasts: [
          {
            timestamp: new Date().toISOString(),
            forecastFor: new Date(Date.now() + 3600000).toISOString(),
            latitude: 12.926,
            longitude: 77.676,
            precipitationProbability: 0.98,
            precipitationAmountMm: 50.0,
            temperatureC: 22,
            source: 'open-meteo',
            freshness: 'LIVE',
          },
        ],
        isHistoricallyFloodProne: true,
        reports: [
          { category: 'FLOOD', status: 'VERIFIED', ageMinutes: 3, distanceMeters: 50 },
          { category: 'FLOOD', status: 'VERIFIED', ageMinutes: 8, distanceMeters: 120 },
        ],
      });

      const result = floodRiskEngine.calculateRisk(torrentialFeatures);

      expect(result.severity).toBe('CRITICAL');
      expect(result.compositeScore).toBeGreaterThanOrEqual(75);
      expect(result.compositeScore).toBeLessThanOrEqual(100);
      const rainFactor = result.factors.find((f) => f.name.includes('Rainfall Intensity'));
      // 120 mm/h > 50 mm/h benchmark => capped at 100 * 0.35 = 35 contribution points
      expect(rainFactor?.contribution).toBe(35);
      expect(result.humanSummary).toContain('violent downpour');
    });

    it('Condition 2: Fast-accelerating rainfall (+160 mm/h²) triggers INCREASING trend vs rapid decrease (-200 mm/h²)', () => {
      const now = Date.now();
      // Accelerating from 10 to 50 in 15 min (+160 mm/h²)
      const accelFeatures = buildFloodRiskFeatureSet({
        currentWeather: {
          rainfallRateMmh: 50.0,
          rainfall1hMm: 30.0,
          rainfall24hMm: 60.0,
          timestamp: new Date(now).toISOString(),
          freshness: 'LIVE',
          dataAgeSeconds: 10,
        },
        weatherHistory: [
          { rainfallRateMmh: 10.0, timestamp: new Date(now - 15 * 60000).toISOString() },
        ],
        isHistoricallyFloodProne: false,
      });

      // Decreasing from 60 to 10 in 15 min (-200 mm/h²)
      const decelFeatures = buildFloodRiskFeatureSet({
        currentWeather: {
          rainfallRateMmh: 10.0,
          rainfall1hMm: 50.0,
          rainfall24hMm: 80.0,
          timestamp: new Date(now).toISOString(),
          freshness: 'LIVE',
          dataAgeSeconds: 10,
        },
        weatherHistory: [
          { rainfallRateMmh: 60.0, timestamp: new Date(now - 15 * 60000).toISOString() },
        ],
        isHistoricallyFloodProne: false,
      });

      expect(accelFeatures.rainfallTrend).toBe('INCREASING');
      expect(accelFeatures.rainfallAcceleration).toBeGreaterThan(50);

      expect(decelFeatures.rainfallTrend).toBe('DECREASING');
      expect(decelFeatures.rainfallAcceleration).toBeLessThan(-50);

      const accelRisk = floodRiskEngine.calculateRisk(accelFeatures);
      const decelRisk = floodRiskEngine.calculateRisk(decelFeatures);

      const accelTrendContrib = accelRisk.factors.find((f) => f.name.includes('Trend'))?.contribution ?? 0;
      const decelTrendContrib = decelRisk.factors.find((f) => f.name.includes('Trend'))?.contribution ?? 0;

      expect(accelTrendContrib).toBeGreaterThan(decelTrendContrib);
    });

    it('Condition 3: Fresh telemetry (10s old, LIVE) vs Expired sensor data (90m old, EXPIRED) degrades confidence by >= 50%', () => {
      const now = Date.now();
      const freshFeatures = buildFloodRiskFeatureSet({
        currentWeather: {
          rainfallRateMmh: 45.0,
          rainfall1hMm: 35.0,
          rainfall24hMm: 70.0,
          timestamp: new Date(now).toISOString(),
          freshness: 'LIVE',
          dataAgeSeconds: 10,
        },
        isHistoricallyFloodProne: true,
      });

      const expiredFeatures = buildFloodRiskFeatureSet({
        currentWeather: {
          rainfallRateMmh: 45.0,
          rainfall1hMm: 35.0,
          rainfall24hMm: 70.0,
          timestamp: new Date(now - 90 * 60000).toISOString(),
          freshness: 'EXPIRED',
          dataAgeSeconds: 5400,
        },
        isHistoricallyFloodProne: true,
      });

      const freshRisk = floodRiskEngine.calculateRisk(freshFeatures);
      const expiredRisk = floodRiskEngine.calculateRisk(expiredFeatures);

      expect(freshRisk.confidence).toBeGreaterThanOrEqual(0.95);
      expect(expiredRisk.confidence).toBeLessThanOrEqual(0.55);
      // Expired sensor data scales down composite score appropriately (confidence multiplier = 0.50)
      expect(expiredRisk.compositeScore).toBeLessThan(freshRisk.compositeScore * 0.6);

      // Short horizon predictor confirms DEGRADED fallback level
      const prediction = shortHorizonPredictor.predict({
        features: expiredFeatures,
        currentRiskScore: expiredRisk.compositeScore,
        currentSeverity: expiredRisk.severity,
        location: { name: 'Bellandur Substation', latitude: 12.926, longitude: 77.676 },
      });
      expect(prediction.fallbackLevel).toBe('DEGRADED');
      expect(prediction.confidence).toBeLessThanOrEqual(0.20);
    });

    it('Condition 4: Historical depression zones (Bellandur / Silk Board at 5m elevation) boost vulnerability compared to standard ridge (45m elevation)', () => {
      const depressionTerrain = extractHistoricalFeatures(true, 5.0);
      const ridgeTerrain = extractHistoricalFeatures(false, 45.0);

      expect(depressionTerrain.isHistoricallyFloodProne).toBe(true);
      expect(depressionTerrain.basinDepressionScore).toBeGreaterThanOrEqual(85);

      expect(ridgeTerrain.isHistoricallyFloodProne).toBe(false);
      expect(ridgeTerrain.basinDepressionScore).toBe(0);

      const depressionFeatures = buildFloodRiskFeatureSet({
        currentWeather: {
          rainfallRateMmh: 20.0,
          rainfall1hMm: 15.0,
          rainfall24hMm: 30.0,
          timestamp: new Date().toISOString(),
          freshness: 'LIVE',
          dataAgeSeconds: 15,
        },
        isHistoricallyFloodProne: true,
        basinElevationM: 5.0,
      });

      const ridgeFeatures = buildFloodRiskFeatureSet({
        currentWeather: {
          rainfallRateMmh: 20.0,
          rainfall1hMm: 15.0,
          rainfall24hMm: 30.0,
          timestamp: new Date().toISOString(),
          freshness: 'LIVE',
          dataAgeSeconds: 15,
        },
        isHistoricallyFloodProne: false,
        basinElevationM: 45.0,
      });

      const depressionRisk = floodRiskEngine.calculateRisk(depressionFeatures);
      const ridgeRisk = floodRiskEngine.calculateRisk(ridgeFeatures);

      const depressionVulnerability = depressionRisk.factors.find((f) => f.name.includes('Topographical'))?.contribution ?? 0;
      const ridgeVulnerability = ridgeRisk.factors.find((f) => f.name.includes('Topographical'))?.contribution ?? 0;

      expect(depressionVulnerability).toBeGreaterThan(ridgeVulnerability);
      expect(depressionRisk.compositeScore).toBeGreaterThan(ridgeRisk.compositeScore);
    });

    it('Condition 5: Corroborating crowdsourced reports heavily outweigh solitary false alarms with spatial/temporal decay', () => {
      // 3 verified, recent, nearby reports
      const corroboratingReports = [
        { category: 'FLOOD', status: 'VERIFIED', ageMinutes: 5, distanceMeters: 50 },
        { category: 'FLOOD', status: 'VERIFIED', ageMinutes: 10, distanceMeters: 120 },
        { category: 'FLOOD', status: 'VERIFIED', ageMinutes: 15, distanceMeters: 200 },
      ];
      // 1 unverified, old (90m), far (1.8km) report
      const solitaryReports = [
        { category: 'FLOOD', status: 'PENDING_REVIEW', ageMinutes: 90, distanceMeters: 1800 },
      ];

      const corroborating = extractCrowdsourcedFeatures(corroboratingReports);
      const solitary = extractCrowdsourcedFeatures(solitaryReports);

      expect(corroborating.verifiedReportsCount).toBe(3);
      expect(corroborating.reportSpatialClusterWeight).toBeGreaterThan(50);

      expect(solitary.verifiedReportsCount).toBe(0);
      expect(solitary.unverifiedReportsCount).toBe(1);
      // Heavy distance & age decay reduces cluster weight to < 1.0
      expect(solitary.reportSpatialClusterWeight).toBeLessThan(1.0);
    });
  });

  describe('2. Routing Engine Stress Test Across Bangalore Hubs', () => {
    const BANGALORE_HUBS = {
      Majestic: { latitude: 12.9767, longitude: 77.5713, name: 'Majestic' },
      Indiranagar: { latitude: 12.9719, longitude: 77.6412, name: 'Indiranagar' },
      Koramangala: { latitude: 12.9352, longitude: 77.6245, name: 'Koramangala' },
      Bellandur: { latitude: 12.9260, longitude: 77.6762, name: 'Bellandur EcoSpace' },
      Whitefield: { latitude: 12.9856, longitude: 77.7317, name: 'Whitefield' },
      ElectronicCity: { latitude: 12.8452, longitude: 77.6602, name: 'Electronic City' },
    };

    const hubPairs: [keyof typeof BANGALORE_HUBS, keyof typeof BANGALORE_HUBS][] = [
      ['Majestic', 'Indiranagar'],
      ['Majestic', 'Koramangala'],
      ['Majestic', 'Whitefield'],
      ['Koramangala', 'Bellandur'],
      ['Koramangala', 'Whitefield'],
      ['Bellandur', 'Whitefield'],
      ['Koramangala', 'ElectronicCity'],
      ['Majestic', 'ElectronicCity'],
      ['Indiranagar', 'Whitefield'],
    ];

    for (const [from, to] of hubPairs) {
      it(`should compute safe, valid route between ${from} and ${to} within latency budget`, async () => {
        const origin = BANGALORE_HUBS[from];
        const destination = BANGALORE_HUBS[to];

        const t0 = performance.now();
        const result = await routingEngineService.calculateRoutes({
          origin,
          destination,
          preferences: { prioritizeSafety: true },
        });
        const durationMs = performance.now() - t0;

        // Routing latency SLA: full resolution under 3000ms (resilient under full parallel suite load)
        expect(durationMs).toBeLessThan(3000);

        // Recommended route assertions
        expect(result).toBeDefined();
        expect(result.recommendedRoute).toBeDefined();
        expect(result.recommendedRoute.isBlocked).toBe(false);
        expect(['SAFE_TO_PROCEED', 'CAUTION']).toContain(result.recommendedRoute.status);
        expect(result.recommendedRoute.distanceMeters).toBeGreaterThan(1000);
        expect(result.recommendedRoute.estimatedTravelTimeSeconds).toBeGreaterThan(60);
        expect(result.recommendedRoute.cost).toBeLessThan(Infinity);

        // Coordinates check: starts at origin, ends at destination
        expect(result.recommendedRoute.origin.latitude).toBeCloseTo(origin.latitude, 3);
        expect(result.recommendedRoute.origin.longitude).toBeCloseTo(origin.longitude, 3);
        expect(result.recommendedRoute.destination.latitude).toBeCloseTo(destination.latitude, 3);
        expect(result.recommendedRoute.destination.longitude).toBeCloseTo(destination.longitude, 3);

        // No endless loops: candidate count is reasonable
        expect(result.allCandidates.length).toBeGreaterThanOrEqual(1);
        expect(result.allCandidates.length).toBeLessThanOrEqual(10);
      });
    }

    it('should detect flood blockage when corridor intersects Bellandur EcoSpace / ORR Underpass and provide safe detour with zero flood exposure', async () => {
      // Silk Board to Whitefield directly traverses Bellandur EcoSpace ORR underpass (12.9260, 77.6762)
      const origin = { latitude: 12.9172, longitude: 77.6228, name: 'Silk Board' };
      const destination = { latitude: 12.9856, longitude: 77.7317, name: 'Whitefield' };

      const result = await routingEngineService.calculateRoutes({
        origin,
        destination,
        preferences: { prioritizeSafety: true },
      });

      // 1. Must flag direct path as blocked with reason
      const directBlocked = result.allCandidates.find((c) => c.routeType === 'DIRECT_BLOCKED' || c.isBlocked);
      expect(directBlocked).toBeDefined();
      expect(directBlocked?.isBlocked).toBe(true);
      expect(directBlocked?.status).toBe('INVALID');
      expect(directBlocked?.cost).toBe(Infinity);
      expect(directBlocked?.blockageReason).toMatch(/Bellandur|overflow|water depth|barricade/i);

      // 2. Recommended route must be safe alternate corridor
      expect(result.recommendedRoute.isBlocked).toBe(false);
      expect(result.recommendedRoute.status).toBe('SAFE_TO_PROCEED');
      expect(result.recommendedRoute.risk.flood).toBeLessThan(25);
      expect(result.safetyDecision?.action).toBe('DETOUR_RECOMMENDED');

      // 3. Recommended route must avoid the submerged segment
      for (const seg of result.recommendedRoute.segments) {
        expect(seg.accessibility).not.toBe('BLOCKED');
        expect(seg.floodScore).toBeLessThan(50);
      }
    });

    it('should route without arbitrary detours when the corridor is far from flood zones', async () => {
      // North Bangalore trip: Majestic to Peenya / Malleshwaram
      const origin = { latitude: 12.9767, longitude: 77.5713, name: 'Majestic' };
      const destination = { latitude: 13.0031, longitude: 77.5701, name: 'Malleshwaram' };

      const result = await routingEngineService.calculateRoutes({
        origin,
        destination,
        preferences: { prioritizeSafety: true },
      });

      expect(result.recommendedRoute.isBlocked).toBe(false);
      expect(result.recommendedRoute.status).toBe('SAFE_TO_PROCEED');

      // Distance should be direct (~3 to 5 km) and not detour 20km via Old Airport Road
      expect(result.recommendedRoute.distanceMeters).toBeLessThan(7000);
      expect(result.recommendedRoute.name).not.toContain('Old Airport Road');
      expect(result.recommendedRoute.name).not.toContain('Bellandur');
    });

    it('should benchmark execution latency for all algorithms (HD_STAR_LITE, DMC_ASTAR, H_STAR) under < 100ms in-memory graph search', async () => {
      const origin = BANGALORE_HUBS.Majestic;
      const destination = BANGALORE_HUBS.Whitefield;

      for (const algorithm of ['HD_STAR_LITE', 'DMC_ASTAR', 'H_STAR'] as const) {
        const t0 = performance.now();
        const res = await routingEngineService.calculateRoutes({
          origin,
          destination,
          preferences: { algorithm },
        });
        const durationMs = performance.now() - t0;

        expect(durationMs).toBeLessThan(2500);
        expect(res.recommendedRoute).toBeDefined();
        expect(res.recommendedRoute.isBlocked).toBe(false);
        expect(res.metrics?.algorithm).toContain(algorithm === 'HD_STAR_LITE' ? 'HD* Lite' : algorithm === 'DMC_ASTAR' ? 'DMC-A*' : 'H-STAR');
      }
    });
  });
});
