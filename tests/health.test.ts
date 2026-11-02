import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../apps/api/src/app.js';
import { Server } from 'http';
import { AddressInfo } from 'net';

describe('API Health and Version Endpoints', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('GET /health should return 200 OK with service identifier', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('smartcity-guardian-api');
    expect(body.version).toBe('0.1.0');
    expect(body.timestamp).toBeDefined();
  });

  it('GET /api/v1/health should return detailed component status', async () => {
    const res = await fetch(`${baseUrl}/api/v1/health`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.components).toBeDefined();
    expect(body.components.database).toBeDefined();
    expect(body.components.redis).toBeDefined();
    expect(body.components.grokAi).toBeDefined();
    expect(body.mockMode).toBe(true);
  });

  it('GET /api/v1/version should return runtime capabilities', async () => {
    const res = await fetch(`${baseUrl}/api/v1/version`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.service).toBe('smartcity-guardian-api');
    expect(body.version).toBe('0.1.0');
    expect(body.capabilities).toBeInstanceOf(Array);
    expect(body.capabilities).toContain('safety_weighted_routing');
    expect(body.capabilities).toContain('blocked_road_exclusion');
  });

  it('POST /api/v1/routing/calculate should compute safe route and exclude blocked roads', async () => {
    const payload = {
      origin: { latitude: 40.712, longitude: -74.012, name: 'Home' },
      destination: { latitude: 40.732, longitude: -74.005, name: 'Work' },
    };

    const res = await fetch(`${baseUrl}/api/v1/routing/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.recommendedRoute.isSafe).toBe(true);
    expect(body.directRoute.isBlocked).toBe(true);
    expect(body.safetyDecision.action).toBe('DETOUR_RECOMMENDED');
  });

  it('POST /api/v1/ai/decide should return structured action plan with deterministic fallback', async () => {
    const res = await fetch(`${baseUrl}/api/v1/ai/decide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.isFallback).toBe(true);
    expect(body.data.risk_level).toBeDefined();
    expect(body.data.sms_summary).toBeDefined();
    expect(body.data.sms_summary.length).toBeLessThanOrEqual(160);
  });
});
