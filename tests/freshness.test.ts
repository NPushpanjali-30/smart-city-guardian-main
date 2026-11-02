import { describe, it, expect } from 'vitest';
import {
  evaluateFreshness,
  DEFAULT_WEATHER_FRESHNESS_CONFIG,
} from '../apps/api/src/providers/common/freshness.js';

describe('Data Freshness Engine', () => {
  const baseTime = new Date('2026-09-08T12:00:00Z');

  it('should classify observations younger than liveMaxAge as LIVE', () => {
    const observationTime = new Date('2026-09-08T11:58:00Z'); // 2 minutes old (120s)
    const result = evaluateFreshness(observationTime, DEFAULT_WEATHER_FRESHNESS_CONFIG, baseTime);

    expect(result.freshness).toBe('LIVE');
    expect(result.dataAgeSeconds).toBe(120);
  });

  it('should classify observations between live and recent max ages as RECENT', () => {
    const observationTime = new Date('2026-09-08T11:50:00Z'); // 10 minutes old (600s)
    const result = evaluateFreshness(observationTime, DEFAULT_WEATHER_FRESHNESS_CONFIG, baseTime);

    expect(result.freshness).toBe('RECENT');
    expect(result.dataAgeSeconds).toBe(600);
  });

  it('should classify observations between recent and stale max ages as STALE', () => {
    const observationTime = new Date('2026-09-08T11:30:00Z'); // 30 minutes old (1800s)
    const result = evaluateFreshness(observationTime, DEFAULT_WEATHER_FRESHNESS_CONFIG, baseTime);

    expect(result.freshness).toBe('STALE');
    expect(result.dataAgeSeconds).toBe(1800);
  });

  it('should classify observations older than staleMaxAge as EXPIRED', () => {
    const observationTime = new Date('2026-09-08T11:00:00Z'); // 60 minutes old (3600s)
    const result = evaluateFreshness(observationTime, DEFAULT_WEATHER_FRESHNESS_CONFIG, baseTime);

    expect(result.freshness).toBe('EXPIRED');
    expect(result.dataAgeSeconds).toBe(3600);
  });

  it('should explicitly return MOCK when isMock flag is true regardless of timestamp', () => {
    const result = evaluateFreshness(new Date(), DEFAULT_WEATHER_FRESHNESS_CONFIG, baseTime, true);
    expect(result.freshness).toBe('MOCK');
  });

  it('should return UNAVAILABLE for invalid or unparseable timestamps', () => {
    const result = evaluateFreshness('not-a-valid-timestamp', DEFAULT_WEATHER_FRESHNESS_CONFIG, baseTime);
    expect(result.freshness).toBe('UNAVAILABLE');
  });
});
