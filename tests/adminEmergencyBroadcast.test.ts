import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { createApp } from '../apps/api/src/app.js';
import { notificationQueueService } from '../apps/api/src/services/notifications/notificationQueue.service.js';

describe('Admin Emergency Operations Broadcast & Fan-out', () => {
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

  it('should reject broadcast requests without ADMIN authorization on admin router', async () => {
    const res = await fetch(`${baseUrl}/api/v1/admin/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': 'CITIZEN',
      },
      body: JSON.stringify({
        title: '🚨 CRITICAL FLOOD WARNING',
        message: 'Water depth 44cm at Silk Board Underpass.',
      }),
    });

    expect(res.status).toBe(403);
  });

  it('should successfully transmit emergency disaster broadcast with ADMIN role and emit event', async () => {
    const emittedEvents: any[] = [];
    const eventHandler = (event: any) => {
      emittedEvents.push(event);
    };
    notificationQueueService.on('domain_event', eventHandler);

    const res = await fetch(`${baseUrl}/api/v1/admin/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer mock_jwt_token_admin',
        'x-user-role': 'ADMIN',
      },
      body: JSON.stringify({
        title: '🚨 CRITICAL FLOOD WARNING: Silk Board Basin',
        message: 'Water depth escalating to 44cm at Silk Board Underpass. Corridor closed.',
        severity: 'CRITICAL',
        location: 'Central Silk Board',
        waterDepthCm: 44,
        leadTimeMinutes: 15,
        recommendedAction: 'Divert via Hosur Road Elevated Expressway.',
        detourCorridor: 'Hosur Road Elevated Expressway',
      }),
    });

    notificationQueueService.off('domain_event', eventHandler);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.broadcastId).toBeDefined();
    expect(body.message).toContain('Citywide emergency disaster notification broadcasted');

    const broadcastEvent = emittedEvents.find((e) => e.event_type === 'ADMIN_EMERGENCY_BROADCAST');
    expect(broadcastEvent).toBeDefined();
    expect(broadcastEvent.payload.title).toContain('Silk Board');
    expect(broadcastEvent.payload.buzzerAlert).toBe(true);
    expect(broadcastEvent.payload.waterDepthCm).toBe(44);
  });

  it('should allow broadcast dispatch via alerts router', async () => {
    const res = await fetch(`${baseUrl}/api/v1/alerts/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '⚠️ CLOUDBURST WARNING: Bellandur Catchment',
        message: 'Extreme rainfall 52 mm/h. Submersion expected in 20 min.',
        severity: 'WARNING',
        location: 'Bellandur Lake Basin',
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.broadcastId).toBeDefined();
  });
});
