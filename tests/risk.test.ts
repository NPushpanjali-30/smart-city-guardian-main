import { describe, it, expect } from 'vitest';
import {
  calculateFloodRisk,
  classifyFloodSeverity,
  evaluateRoadSegmentRisk,
} from '../packages/shared/src/calculators/risk.js';

describe('Multi-Factor Flood Risk Scoring Engine', () => {
  it('should classify dry conditions as NORMAL severity with zero or low score', () => {
    const result = calculateFloodRisk({
      rainfallRateMmh: 0,
      rainfall1hMm: 0,
      rainfall24hMm: 0,
      forecastExpectedRainfallMm: 0,
      forecastPrecipitationProbability: 0,
      isHistoricallyFloodProne: false,
      verifiedCitizenReportsCount: 0,
      dataAgeMinutes: 2,
    });

    expect(result.compositeScore).toBe(0);
    expect(result.severity).toBe('NORMAL');
    expect(result.confidence).toBe(1.0);
    expect(result.factors.length).toBeGreaterThan(0);
    expect(result.humanSummary).toContain('NORMAL');
  });

  it('should transition through severity tiers as precipitation and evidence escalate', () => {
    // Watch Tier
    const watchRes = calculateFloodRisk({
      rainfallRateMmh: 18.0,
      rainfall1hMm: 12.0,
      rainfall24hMm: 25.0,
      forecastExpectedRainfallMm: 15.0,
      forecastPrecipitationProbability: 0.7,
      isHistoricallyFloodProne: false,
    });
    expect(watchRes.severity).toBe('WATCH');
    expect(watchRes.compositeScore).toBeGreaterThanOrEqual(25);
    expect(watchRes.compositeScore).toBeLessThan(50);

    // Warning Tier
    const warningRes = calculateFloodRisk({
      rainfallRateMmh: 35.0,
      rainfall1hMm: 25.0,
      rainfall24hMm: 60.0,
      forecastExpectedRainfallMm: 30.0,
      forecastPrecipitationProbability: 0.85,
      isHistoricallyFloodProne: true,
    });
    expect(warningRes.severity).toBe('WARNING');
    expect(warningRes.compositeScore).toBeGreaterThanOrEqual(50);
    expect(warningRes.compositeScore).toBeLessThan(75);

    // Critical Tier
    const criticalRes = calculateFloodRisk({
      rainfallRateMmh: 55.0, // Violent downpour
      rainfall1hMm: 45.0,
      rainfall24hMm: 110.0,
      forecastExpectedRainfallMm: 45.0,
      forecastPrecipitationProbability: 0.95,
      isHistoricallyFloodProne: true,
      verifiedCitizenReportsCount: 3,
    });
    expect(criticalRes.severity).toBe('CRITICAL');
    expect(criticalRes.compositeScore).toBeGreaterThanOrEqual(75);
  });

  it('should produce transparent, explainable factor breakdowns', () => {
    const res = calculateFloodRisk({
      rainfallRateMmh: 42.5,
      rainfall1hMm: 34.0,
      rainfall24hMm: 98.0,
      forecastExpectedRainfallMm: 38.0,
      forecastPrecipitationProbability: 0.9,
      isHistoricallyFloodProne: true,
      verifiedCitizenReportsCount: 2,
    });

    const factorNames = res.factors.map((f) => f.name);
    expect(factorNames).toContain('Current Rainfall Intensity');
    expect(factorNames).toContain('Soil Saturation & Antecedent Rain');
    expect(factorNames).toContain('Predictive Radar Forecast');
    expect(factorNames).toContain('Physical & Catchment Evidence');

    for (const factor of res.factors) {
      expect(factor.contribution).toBeGreaterThanOrEqual(0);
      expect(factor.description).toBeTruthy();
    }
  });

  it('should degrade confidence when telemetry is stale', () => {
    const freshRes = calculateFloodRisk({
      rainfallRateMmh: 30.0,
      rainfall1hMm: 20.0,
      rainfall24hMm: 40.0,
      dataAgeMinutes: 5,
    });

    const staleRes = calculateFloodRisk({
      rainfallRateMmh: 30.0,
      rainfall1hMm: 20.0,
      rainfall24hMm: 40.0,
      dataAgeMinutes: 90, // 90 minutes old
    });

    expect(freshRes.confidence).toBe(1.0);
    expect(staleRes.confidence).toBeLessThan(freshRes.confidence);
    expect(staleRes.compositeScore).toBeLessThan(freshRes.compositeScore);
  });
});

describe('Road Accessibility State & Segment Risk Evaluation', () => {
  it('should strictly flag segment as BLOCKED if confirmed submerged or closed', () => {
    const road = {
      floodScore: 90,
      trafficScore: 80,
      isHistoricallyFloodProne: true,
    };

    const result = evaluateRoadSegmentRisk(road, 0, false, 25); // 25cm water depth
    expect(result.accessibilityState).toBe('BLOCKED');
    expect(result.compositeRisk).toBe(100.0);
    expect(result.reason).toContain('submerged');
  });

  it('should mark road as OPEN when conditions are normal', () => {
    const road = {
      floodScore: 10,
      trafficScore: 15,
      isHistoricallyFloodProne: false,
    };

    const result = evaluateRoadSegmentRisk(road, 0, false, 0);
    expect(result.accessibilityState).toBe('OPEN');
    expect(result.compositeRisk).toBeLessThan(30);
  });
});
