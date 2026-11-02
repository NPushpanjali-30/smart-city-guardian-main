import { describe, it, expect } from 'vitest';
import {
  extractRainfallFeatures,
  extractForecastFeatures,
  extractHistoricalFeatures,
  extractCrowdsourcedFeatures,
  calculateEvidenceConfidence,
  buildFloodRiskFeatureSet,
} from '@smartcity/shared';

describe('Phase 3: Flood Feature Engineering', () => {
  describe('Rainfall Accumulations & Trend Acceleration', () => {
    it('should compute rolling 15m, 30m, 1h, 3h accumulations from current rate and history', () => {
      const current = {
        rainfallRateMmh: 40.0,
        rainfall1hMm: 32.0,
        rainfall24hMm: 80.0,
        timestamp: '2026-09-08T10:00:00Z',
        freshness: 'LIVE' as const,
        dataAgeSeconds: 10,
      };

      const history = [
        { rainfallRateMmh: 20.0, timestamp: '2026-09-08T09:45:00Z' },
      ];

      const features = extractRainfallFeatures(current, history);

      expect(features.rainfallRateMmh).toBe(40.0);
      expect(features.rainfall15mMm).toBeGreaterThan(0);
      expect(features.rainfall30mMm).toBeGreaterThan(features.rainfall15mMm);
      expect(features.rainfall1hMm).toBe(32.0);
      expect(features.rainfall3hMm).toBeGreaterThanOrEqual(features.rainfall1hMm);
      expect(features.rainfallAcceleration).toBeGreaterThan(0); // 40 > 20 => positive acceleration
      expect(features.rainfallTrend).toBe('INCREASING');
    });

    it('should detect DECREASING trend when rainfall rate drops significantly', () => {
      const current = {
        rainfallRateMmh: 5.0,
        rainfall1hMm: 25.0,
        rainfall24hMm: 60.0,
        timestamp: '2026-09-08T10:30:00Z',
        freshness: 'LIVE' as const,
        dataAgeSeconds: 15,
      };

      const history = [
        { rainfallRateMmh: 35.0, timestamp: '2026-09-08T10:00:00Z' },
      ];

      const features = extractRainfallFeatures(current, history);

      expect(features.rainfallRateMmh).toBe(5.0);
      expect(features.rainfallAcceleration).toBeLessThan(0);
      expect(features.rainfallTrend).toBe('DECREASING');
    });
  });

  describe('Forecast Radar Features', () => {
    it('should compute normalized forecast intensity from upcoming radar intervals', () => {
      const forecasts = [
        {
          timestamp: '2026-09-08T10:00:00Z',
          forecastFor: '2026-09-08T11:00:00Z',
          latitude: 40.71,
          longitude: -74.01,
          precipitationProbability: 0.90,
          precipitationAmountMm: 15.0,
          temperatureC: 22,
          source: 'open-meteo',
          freshness: 'LIVE' as const,
        },
        {
          timestamp: '2026-09-08T10:00:00Z',
          forecastFor: '2026-09-08T12:00:00Z',
          latitude: 40.71,
          longitude: -74.01,
          precipitationProbability: 0.85,
          precipitationAmountMm: 12.0,
          temperatureC: 21,
          source: 'open-meteo',
          freshness: 'LIVE' as const,
        },
      ];

      const forecastFeatures = extractForecastFeatures(forecasts);

      expect(forecastFeatures.forecastExpectedRainfallMm).toBe(27.0);
      expect(forecastFeatures.forecastPrecipitationProbability).toBe(0.90);
      expect(forecastFeatures.forecastIntensity).toBeGreaterThan(50);
      expect(forecastFeatures.forecastIntensity).toBeLessThanOrEqual(100);
    });

    it('should handle empty forecasts gracefully', () => {
      const forecastFeatures = extractForecastFeatures([]);
      expect(forecastFeatures.forecastExpectedRainfallMm).toBe(0);
      expect(forecastFeatures.forecastPrecipitationProbability).toBe(0);
      expect(forecastFeatures.forecastIntensity).toBe(0);
    });
  });

  describe('Historical Vulnerability Features', () => {
    it('should assign elevated depression score to historically flood prone low-elevation sectors', () => {
      const proneLow = extractHistoricalFeatures(true, 5.0); // 5m elevation
      const nonProneHigh = extractHistoricalFeatures(false, 45.0); // 45m elevation

      expect(proneLow.basinDepressionScore).toBeGreaterThan(nonProneHigh.basinDepressionScore);
      expect(proneLow.basinDepressionScore).toBeGreaterThanOrEqual(70);
      expect(nonProneHigh.basinDepressionScore).toBe(0);
    });
  });

  describe('Crowdsourced Hazard Clustering', () => {
    it('should weigh verified reports more heavily than unverified and apply spatial distance decay', () => {
      const reports = [
        { category: 'FLOOD', status: 'VERIFIED', ageMinutes: 10, distanceMeters: 150 }, // close & verified
        { category: 'FLOOD', status: 'PENDING_REVIEW', ageMinutes: 20, distanceMeters: 400 }, // farther & unverified
        { category: 'FLOOD', status: 'PENDING_REVIEW', ageMinutes: 180, distanceMeters: 2000 }, // expired & far
      ];

      const crowdsourced = extractCrowdsourcedFeatures(reports);

      expect(crowdsourced.verifiedReportsCount).toBe(1);
      expect(crowdsourced.unverifiedReportsCount).toBe(2);
      expect(crowdsourced.reportSpatialClusterWeight).toBeGreaterThan(15);
    });
  });

  describe('Evidence Confidence Calculation', () => {
    it('should reduce confidence when telemetry becomes stale or expired', () => {
      const fresh = calculateEvidenceConfidence({
        weatherFreshness: 'LIVE',
        weatherAgeMinutes: 2,
        hasCorroboratingReports: true,
      });

      const stale = calculateEvidenceConfidence({
        weatherFreshness: 'STALE',
        weatherAgeMinutes: 35,
        hasCorroboratingReports: false,
      });

      const expired = calculateEvidenceConfidence({
        weatherFreshness: 'EXPIRED',
        weatherAgeMinutes: 90,
        hasCorroboratingReports: false,
      });

      expect(fresh.confidence).toBeGreaterThan(stale.confidence);
      expect(stale.confidence).toBeGreaterThan(expired.confidence);
      expect(fresh.corroborationFactor).toBe(0.9);
      expect(stale.corroborationFactor).toBe(0.5);
    });
  });

  describe('High-Level Feature Pipeline: buildFloodRiskFeatureSet', () => {
    it('should assemble a complete, strongly-typed FloodRiskFeatureSet', () => {
      const featureSet = buildFloodRiskFeatureSet({
        currentWeather: {
          rainfallRateMmh: 30.0,
          rainfall1hMm: 22.0,
          rainfall24hMm: 70.0,
          timestamp: new Date().toISOString(),
          freshness: 'LIVE',
          dataAgeSeconds: 25,
        },
        isHistoricallyFloodProne: true,
      });

      expect(featureSet.rainfallRateMmh).toBe(30.0);
      expect(featureSet.rainfall30mMm).toBeGreaterThan(0);
      expect(featureSet.isHistoricallyFloodProne).toBe(true);
      expect(featureSet.dataFreshnessState).toBe('LIVE');
      expect(featureSet.dataAgeMinutes).toBe(0);
    });
  });
});
