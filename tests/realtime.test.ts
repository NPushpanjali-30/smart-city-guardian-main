import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import WebSocket from 'ws';
import { createApp } from '../apps/api/src/app.js';
import { RealtimeWebSocketServer } from '../apps/api/src/websocket/wsServer.js';
import { LiveStateStore } from '../apps/api/src/services/stateStore.js';
import { WeatherObservation } from '@smartcity/shared';

describe('LiveStateStore & Request Coalescing', () => {
  it('should store items in cache and respect TTL expiration', async () => {
    const store = new LiveStateStore();
    store.set('key1', { temp: 25 }, 1); // 1s TTL

    expect(store.get('key1')).toEqual({ temp: 25 });
    await new Promise((r) => setTimeout(r, 1100));
    expect(store.get('key1')).toBeNull();
  });

  it('should coalesce concurrent requests so the fetcher is called only once', async () => {
    const store = new LiveStateStore();
    let callCount = 0;

    const expensiveFetch = async () => {
      callCount++;
      await new Promise((r) => setTimeout(r, 50));
      return { data: 'heavy_payload' };
    };

    // Trigger 10 concurrent requests
    const promises = Array.from({ length: 10 }).map(() =>
      store.coalesce('shared_key', expensiveFetch)
    );

    const results = await Promise.all(promises);
    expect(callCount).toBe(1); // Crucial: called exactly once!
    expect(results[0]).toEqual({ data: 'heavy_payload' });
  });

  it('should detect meaningful vs negligible weather changes', () => {
    const store = new LiveStateStore();
    const base: WeatherObservation = {
      id: '1',
      source: 'test',
      timestamp: '2026-09-08T12:00:00Z',
      receivedAt: '2026-09-08T12:00:00Z',
      location: { name: 'Metro', latitude: 40.71, longitude: -74.0 },
      temperatureC: 22.0,
      humidityPercent: 80,
      rainfallRateMmh: 10.0,
      rainfall1hMm: 10.0,
      rainfall24hMm: 20.0,
      windSpeedKmh: 15.0,
      freshness: 'LIVE',
      dataAgeSeconds: 0,
    };

    // Minor change (rainfall +0.5 mm/h, temp +0.5 C) -> NOT meaningful
    const minorChange: WeatherObservation = {
      ...base,
      rainfallRateMmh: 10.5,
      temperatureC: 22.5,
    };
    expect(store.hasWeatherMeaningfullyChanged(base, minorChange)).toBe(false);

    // Major change (rainfall +5.0 mm/h) -> meaningful
    const majorChange: WeatherObservation = {
      ...base,
      rainfallRateMmh: 15.0,
    };
    expect(store.hasWeatherMeaningfullyChanged(base, majorChange)).toBe(true);
  });

  it('should track provider health status transitions', () => {
    const store = new LiveStateStore();

    // Success
    const s1 = store.updateProviderStatus('prov1', 'weather', true, 45, true, ['data']);
    expect(s1.status).toBe('HEALTHY');
    expect(s1.consecutiveFailures).toBe(0);

    // 3 Failures -> DEGRADED
    store.updateProviderStatus('prov1', 'weather', false, 500, true, ['data'], 'error 1');
    store.updateProviderStatus('prov1', 'weather', false, 500, true, ['data'], 'error 2');
    const s2 = store.updateProviderStatus('prov1', 'weather', false, 500, true, ['data'], 'error 3');
    expect(s2.status).toBe('DEGRADED');
    expect(s2.consecutiveFailures).toBe(3);

    // 5 Failures -> DOWN
    store.updateProviderStatus('prov1', 'weather', false, 500, true, ['data'], 'error 4');
    const s3 = store.updateProviderStatus('prov1', 'weather', false, 500, true, ['data'], 'error 5');
    expect(s3.status).toBe('DOWN');
  });
});

describe('Realtime WebSocket Server Streaming', () => {
  let server: Server;
  let wsServer: RealtimeWebSocketServer;
  let wsUrl: string;

  beforeAll(async () => {
    const app = createApp();
    server = createServer(app);
    wsServer = new RealtimeWebSocketServer(server);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as AddressInfo;
        wsUrl = `ws://127.0.0.1:${addr.port}/ws`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    wsServer.close();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('should connect to /ws and receive initial state packet', async () => {
    const client = new WebSocket(wsUrl);

    const initialMessage = await new Promise<any>((resolve, reject) => {
      client.on('message', (data) => {
        resolve(JSON.parse(data.toString()));
      });
      client.on('error', reject);
    });

    expect(initialMessage.type).toBe('CONNECTION_ESTABLISHED');
    expect(initialMessage.topic).toBe('realtime:system');
    client.close();
  });

  it('should receive broadcast messages when subscribed to a topic', async () => {
    const client = new WebSocket(wsUrl);

    await new Promise<void>((resolve) => {
      client.on('open', () => resolve());
    });

    const broadcastPromise = new Promise<any>((resolve) => {
      client.on('message', (data) => {
        const parsed = JSON.parse(data.toString());
        if (parsed.topic === 'realtime:weather') {
          resolve(parsed);
        }
      });
    });

    // Trigger broadcast on server
    wsServer.broadcast('realtime:weather', {
      topic: 'realtime:weather',
      eventType: 'WEATHER_UPDATED',
      timestamp: new Date().toISOString(),
      payload: { rainfallRateMmh: 45.0 },
    });

    const received = await broadcastPromise;
    expect(received.eventType).toBe('WEATHER_UPDATED');
    expect(received.payload.rainfallRateMmh).toBe(45.0);

    client.close();
  });
});
