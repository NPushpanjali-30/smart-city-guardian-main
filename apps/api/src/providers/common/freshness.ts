import { FreshnessState } from '@smartcity/shared';

export interface FreshnessConfig {
  liveMaxAgeSeconds: number;   // e.g. 180s (3 min)
  recentMaxAgeSeconds: number; // e.g. 600s (10 min)
  staleMaxAgeSeconds: number;  // e.g. 1800s (30 min)
}

export const DEFAULT_WEATHER_FRESHNESS_CONFIG: FreshnessConfig = {
  liveMaxAgeSeconds: 300,   // 5 min
  recentMaxAgeSeconds: 900,  // 15 min
  staleMaxAgeSeconds: 2700, // 45 min
};

export const DEFAULT_TRAFFIC_FRESHNESS_CONFIG: FreshnessConfig = {
  liveMaxAgeSeconds: 180,   // 3 min
  recentMaxAgeSeconds: 600,  // 10 min
  staleMaxAgeSeconds: 1800, // 30 min
};

export const DEFAULT_FLOOD_FRESHNESS_CONFIG: FreshnessConfig = {
  liveMaxAgeSeconds: 300,
  recentMaxAgeSeconds: 1200,
  staleMaxAgeSeconds: 3600,
};

/**
 * Evaluates the freshness state of an observation based on its source timestamp.
 */
export function evaluateFreshness(
  sourceTimestamp: string | Date,
  config: FreshnessConfig = DEFAULT_WEATHER_FRESHNESS_CONFIG,
  referenceTime: Date = new Date(),
  isMock = false
): { freshness: FreshnessState; dataAgeSeconds: number } {
  if (isMock) {
    return { freshness: 'MOCK', dataAgeSeconds: 0 };
  }

  const sourceTime = typeof sourceTimestamp === 'string' ? new Date(sourceTimestamp).getTime() : sourceTimestamp.getTime();
  if (isNaN(sourceTime)) {
    return { freshness: 'UNAVAILABLE', dataAgeSeconds: 0 };
  }

  const ageMs = Math.max(0, referenceTime.getTime() - sourceTime);
  const dataAgeSeconds = Math.floor(ageMs / 1000);

  let freshness: FreshnessState = 'LIVE';

  if (dataAgeSeconds <= config.liveMaxAgeSeconds) {
    freshness = 'LIVE';
  } else if (dataAgeSeconds <= config.recentMaxAgeSeconds) {
    freshness = 'RECENT';
  } else if (dataAgeSeconds <= config.staleMaxAgeSeconds) {
    freshness = 'STALE';
  } else {
    freshness = 'EXPIRED';
  }

  return {
    freshness,
    dataAgeSeconds,
  };
}
