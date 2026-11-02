import { describe, it, expect } from 'vitest';
import {
  OpenMeteoAdapter,
  MockWeatherAdapter,
  TrafficAdapter,
  FloodAdapter,
  CircuitBreaker,
} from '../apps/api/src/providers/index.js';

describe('Data Provider Adapters', () => {
  it('OpenMeteoAdapter should reject out-of-bounds geographic coordinates', async () => {
    const adapter = new OpenMeteoAdapter();
    await expect(adapter.getCurrentWeather(95.0, -74.0)).rejects.toThrow('Invalid geographic coordinates');
    await expect(adapter.getCurrentWeather(40.0, 195.0)).rejects.toThrow('Invalid geographic coordinates');
  });

  it('OpenMeteoAdapter should fall back to safe mock weather data on network failure', async () => {
    // Instantiate with an unresolvable domain and fast timeout to simulate network outage
    const adapter = new OpenMeteoAdapter('http://invalid-unresolvable-weather-domain-xyz.local', {
      requestTimeoutMs: 300,
      maxRetries: 1,
    });
    const result = await adapter.getCurrentWeather(40.7128, -74.0060);

    expect(result).toBeDefined();
    expect(result.temperatureC).toBeDefined();
    expect(result.rainfallRateMmh).toBeGreaterThanOrEqual(0);
    expect(result.freshness).toBe('MOCK');
    expect(result.source).toContain('fallback');
  });

  it('MockWeatherAdapter should return consistent normalized metrics', async () => {
    const adapter = new MockWeatherAdapter();
    const current = await adapter.getCurrentWeather(40.7128, -74.0060);

    expect(current.source).toBe('mock-weather-service');
    expect(current.freshness).toBe('MOCK');
    expect(current.temperatureC).toBeGreaterThan(-50);
    expect(current.humidityPercent).toBeLessThanOrEqual(100);

    const forecast = await adapter.getForecast(40.7128, -74.0060);
    expect(forecast.length).toBeGreaterThan(0);
    expect(forecast[0].precipitationProbability).toBeLessThanOrEqual(100);
  });

  it('TrafficAdapter should return flows and incidents with proper freshness', async () => {
    const adapter = new TrafficAdapter('test-traffic-adapter', true);
    const flows = await adapter.getTrafficFlows([-74.05, 40.68, -73.95, 40.78]);

    expect(flows.length).toBeGreaterThan(0);
    expect(flows[0].speedKmh).toBeGreaterThanOrEqual(0);
    expect(flows[0].congestionLevel).toBeLessThanOrEqual(100);

    const incidents = await adapter.getIncidents([-74.05, 40.68, -73.95, 40.78]);
    expect(incidents.length).toBeGreaterThan(0);
    expect(incidents[0].type).toBeDefined();
  });

  it('FloodAdapter should transparently label simulated telemetry as MOCK', async () => {
    const adapter = new FloodAdapter('test-flood-adapter', false);
    const observations = await adapter.getFloodObservations();

    expect(observations.length).toBeGreaterThan(0);
    expect(observations[0].isLive).toBe(false);
    expect(observations[0].freshness).toBe('MOCK');
    expect(observations[0].waterDepthCm).toBeGreaterThanOrEqual(0);
  });
});

describe('Circuit Breaker Resilience', () => {
  it('should trip to OPEN state after consecutive failures and fast-fail', async () => {
    const breaker = new CircuitBreaker('TestBreaker', {
      failureThreshold: 2,
      resetTimeoutMs: 1000,
      requestTimeoutMs: 100,
      maxRetries: 0,
    });

    const failingAction = async () => {
      throw new Error('Upstream timeout');
    };

    // Attempt 1 fails
    await expect(breaker.execute(failingAction)).rejects.toThrow('Upstream timeout');
    expect(breaker.getState()).toBe('CLOSED');

    // Attempt 2 fails -> trips breaker
    await expect(breaker.execute(failingAction)).rejects.toThrow('Upstream timeout');
    expect(breaker.getState()).toBe('OPEN');

    // Attempt 3 fast fails without executing
    await expect(breaker.execute(failingAction)).rejects.toThrow('is OPEN (fast fail)');
  });
});
