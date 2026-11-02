import { describe, it, expect } from 'vitest';
import {
  GrokDecisionOutputSchema,
  generateDeterministicFallbackDecision,
  GrokInputContext,
} from '../packages/shared/src/index.js';

describe('Grok AI Contract & Deterministic Fallback Engine', () => {
  const sampleContext: GrokInputContext = {
    timestamp: '2026-09-08T09:00:00Z',
    location: {
      cityName: 'Metro District',
      coordinates: [40.7128, -74.0060],
      monitoredSectors: ['Sector 4 Lowlands', 'Harbor Underpass'],
    },
    weather: {
      rainfallRateMmh: 45.0,
      rainfall1hMm: 35.0,
      rainfall24hMm: 100.0,
      windSpeedKmh: 40.0,
      severeWeatherAlerts: ['Flash Flood Warning'],
    },
    traffic: {
      averageCongestionIndex: 80.0,
      activeIncidentsCount: 2,
      blockedCorridorsCount: 1,
    },
    floodRisk: {
      compositeScore: 82.0,
      severity: 'CRITICAL',
      highRiskBasins: ['Sector 4 Lowlands'],
    },
    roads: [
      { id: 'r1', name: 'Bay Street Boulevard', state: 'BLOCKED', waterDepthCm: 30 },
      { id: 'r2', name: 'Highland Avenue', state: 'OPEN' },
    ],
    dataFreshness: {
      weatherAgeMinutes: 3,
      trafficAgeMinutes: 2,
    },
    confidenceScore: 0.95,
  };

  it('should generate a fallback decision that strictly validates against the Grok output schema', () => {
    const fallback = generateDeterministicFallbackDecision(sampleContext, 'Testing fallback');

    const validationResult = GrokDecisionOutputSchema.safeParse(fallback);
    expect(validationResult.success).toBe(true);

    if (validationResult.success) {
      expect(validationResult.data.risk_level).toBe('CRITICAL');
      expect(validationResult.data.roads_to_avoid).toContain('Bay Street Boulevard');
      expect(validationResult.data.authority_actions.length).toBeGreaterThan(0);
      expect(validationResult.data.citizen_actions.length).toBeGreaterThan(0);
      expect(validationResult.data.sms_summary.length).toBeLessThanOrEqual(160);
      expect(validationResult.data.sms_summary.length).toBeGreaterThan(10);
    }
  });

  it('should enforce SMS character limits under 160 characters for all severity levels', () => {
    const severities = [10, 30, 60, 90];

    for (const score of severities) {
      const ctx = {
        ...sampleContext,
        floodRisk: {
          ...sampleContext.floodRisk,
          compositeScore: score,
        },
      };

      const fallback = generateDeterministicFallbackDecision(ctx);
      expect(fallback.sms_summary.length).toBeLessThanOrEqual(160);
      expect(fallback.sms_summary.length).toBeGreaterThanOrEqual(10);
    }
  });

  it('should reject malformed AI outputs that violate the contract schema', () => {
    const malformedOutput = {
      risk_level: 'SUPER_EXTREME', // Invalid enum
      confidence: 1.5,            // > 1.0
      affected_zones: [],         // Empty array
      roads_to_avoid: ['Road A'],
      recommended_actions: [],    // Empty array
      sms_summary: 'short',       // < 10 chars
    };

    const parseResult = GrokDecisionOutputSchema.safeParse(malformedOutput);
    expect(parseResult.success).toBe(false);
  });
});
