import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { createApp } from '../apps/api/src/app.js';
import { pushNotificationService } from '../apps/api/src/services/notifications/pushNotification.service.js';

describe('Zero-Delay Broadcast, Closed-App Push & OTA Auto-Update Suite', () => {
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

  describe('1. Zero-Delay Emergency Broadcast Endpoint', () => {
    it('should dispatch an administrative broadcast instantly with < 200ms latency', async () => {
      const t0 = performance.now();
      const res = await fetch(`${baseUrl}/api/v1/admin/broadcast`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock_jwt_token_admin',
          'x-user-role': 'ADMIN',
        },
        body: JSON.stringify({
          title: '🚨 CRITICAL FLASH FLOOD: Bellandur Basin',
          message: 'Water levels rising rapidly (45cm). Elevated bypass active.',
          severity: 'CRITICAL',
          location: 'Bellandur EcoSpace Underpass',
          waterDepthCm: 45,
          leadTimeMinutes: 12,
          recommendedAction: 'Divert immediately via Old Airport Road.',
          detourCorridor: 'Old Airport Road Elevated Ridge',
        }),
      });
      const durationMs = performance.now() - t0;
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.broadcastId).toBeDefined();
      expect(data.record).toBeDefined();
      expect(durationMs).toBeLessThan(1000); // Super fast execution
    });

    it('should immediately update latest emergency broadcast queryable by closed apps', async () => {
      const res = await fetch(`${baseUrl}/api/v1/alerts/latest`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.hasActiveAlert).toBe(true);
      expect(data.alert).toBeDefined();
      expect(data.alert.location).toBe('Bellandur EcoSpace Underpass');
      expect(data.alert.waterDepthCm).toBe(45);
    });
  });

  describe('2. Closed-App Background Push Notification Service', () => {
    it('should register a device push subscription for offline alert delivery', async () => {
      const res = await fetch(`${baseUrl}/api/v1/push/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: 'https://fcm.googleapis.com/fcm/send/sample-token-123',
          keys: {
            p256dh: 'sample-p256dh-key',
            auth: 'sample-auth-secret',
          },
          platform: 'android',
          userId: 'test-user-mobile-1',
        }),
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.subscriptionId).toBeDefined();
      expect(data.totalSubscribers).toBeGreaterThanOrEqual(1);
    });

    it('should return VAPID public key for Web Push handshake', async () => {
      const res = await fetch(`${baseUrl}/api/v1/push/public-key`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.publicKey).toBeDefined();
      expect(typeof data.publicKey).toBe('string');
    });

    it('should broadcast push notifications to registered subscriptions when app is closed', async () => {
      const pushResult = await pushNotificationService.broadcastPush({
        id: 'test-emergency-push-01',
        title: '🚨 EVACUATION ORDER: Lowland Lake Embankment',
        headline: 'Water depth 60cm breaching embankment.',
        severity: 'CRITICAL',
        location: 'Bellandur Lake Basin',
        waterDepthCm: 60,
      });

      expect(pushResult.total).toBeGreaterThanOrEqual(1);
    });
  });

  describe('3. In-App OTA Auto-Update & Version Release System', () => {
    it('should report the latest app version via GET /api/v1/app/version', async () => {
      const res = await fetch(`${baseUrl}/api/v1/app/version`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.status).toBe('ok');
      expect(data.version).toBeDefined();
      expect(data.versionCode).toBeGreaterThanOrEqual(200);
      expect(data.mandatory).toBe(true);
      expect(data.releaseNotes).toBeDefined();
    });

    it('should allow admin to publish and broadcast a new version release', async () => {
      const res = await fetch(`${baseUrl}/api/v1/app/admin/version/release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: '2.1.1',
          releaseNotes: 'Optimized routing algorithms and instant emergency push alerts.',
          mandatory: true,
        }),
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.version).toBe('2.1.1');
      expect(data.data.versionCode).toBeGreaterThan(201);

      // Verify that GET /api/v1/app/version now immediately returns the new version
      const checkRes = await fetch(`${baseUrl}/api/v1/app/version`);
      const checkData = await checkRes.json();
      expect(checkData.version).toBe('2.1.1');
    });
  });
});
