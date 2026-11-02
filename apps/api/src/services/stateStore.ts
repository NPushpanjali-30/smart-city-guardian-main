import {
  WeatherObservation,
  WeatherForecast,
  TrafficObservation,
  TrafficIncident,
  FloodObservation,
  ProviderStatusInfo,
  ProviderHealthStatus,
} from '@smartcity/shared';
import { logger } from '../utils/logger.js';

interface CacheItem<T> {
  value: T;
  expiresAt: number;
}

export class LiveStateStore {
  private cache: Map<string, CacheItem<unknown>> = new Map();
  private inFlightRequests: Map<string, Promise<unknown>> = new Map();
  private providerStatusMap: Map<string, ProviderStatusInfo> = new Map();

  // 1. Cache Get/Set with TTL
  public get<T>(key: string): T | null {
    const item = this.cache.get(key) as CacheItem<T> | undefined;
    if (!item) return null;

    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return item.value;
  }

  public set<T>(key: string, value: T, ttlSeconds: number): void {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  public clearCache(): { evictedCount: number } {
    const count = this.cache.size;
    this.cache.clear();
    return { evictedCount: count };
  }

  public getCacheSize(): number {
    return this.cache.size;
  }

  // 2. Request Coalescing (Single-Flight deduplication)
  public async coalesce<T>(key: string, fetchFn: () => Promise<T>): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const inFlight = this.inFlightRequests.get(key) as Promise<T> | undefined;
    if (inFlight) {
      return inFlight;
    }

    const promise = (async () => {
      try {
        const data = await fetchFn();
        return data;
      } finally {
        this.inFlightRequests.delete(key);
      }
    })();

    this.inFlightRequests.set(key, promise);
    return promise;
  }

  // 3. Provider Status Tracking
  public updateProviderStatus(
    provider: string,
    category: 'weather' | 'traffic' | 'flood' | 'map' | 'sms' | 'ai',
    isSuccess: boolean,
    responseTimeMs: number,
    isLive: boolean,
    capabilities: string[],
    error?: string
  ): ProviderStatusInfo {
    const existing = this.providerStatusMap.get(provider) || {
      provider,
      category,
      status: 'UNKNOWN' as ProviderHealthStatus,
      consecutiveFailures: 0,
      lastResponseTimeMs: 0,
      isLive,
      capabilities,
    };

    const now = new Date().toISOString();

    if (isSuccess) {
      existing.status = 'HEALTHY';
      existing.lastSuccess = now;
      existing.consecutiveFailures = 0;
      existing.lastError = undefined;
    } else {
      existing.consecutiveFailures++;
      existing.lastFailure = now;
      existing.lastError = error;
      existing.status = existing.consecutiveFailures >= 3 ? 'DEGRADED' : 'UNKNOWN';
      if (existing.consecutiveFailures >= 5) {
        existing.status = 'DOWN';
      }
    }

    existing.lastResponseTimeMs = responseTimeMs;
    this.providerStatusMap.set(provider, existing);
    return existing;
  }

  public getAllProviderStatuses(): ProviderStatusInfo[] {
    return Array.from(this.providerStatusMap.values());
  }

  // 4. Change Detection Utilities
  public hasWeatherMeaningfullyChanged(previous: WeatherObservation | null, next: WeatherObservation): boolean {
    if (!previous) return true;
    const rainDelta = Math.abs(previous.rainfallRateMmh - next.rainfallRateMmh);
    const tempDelta = Math.abs(previous.temperatureC - next.temperatureC);
    // Meaningful change: rainfall changes by >= 2.0 mm/h or temperature by >= 3.0 C
    return rainDelta >= 2.0 || tempDelta >= 3.0;
  }

  public hasTrafficMeaningfullyChanged(previous: TrafficObservation[] | null, next: TrafficObservation[]): boolean {
    if (!previous || previous.length !== next.length) return true;
    for (let i = 0; i < next.length; i++) {
      const prevItem = previous.find((p) => p.segmentId === next[i].segmentId);
      if (!prevItem) return true;
      const speedDelta = Math.abs(prevItem.speedKmh - next[i].speedKmh);
      const congestionDelta = Math.abs(prevItem.congestionLevel - next[i].congestionLevel);
      if (speedDelta >= 5.0 || congestionDelta >= 15.0) {
        return true;
      }
    }
    return false;
  }
}

export const liveStateStore = new LiveStateStore();
