import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { createApp } from '../apps/api/src/app.js';
import { generateJwt, verifyJwt } from '../apps/api/src/utils/jwt.js';
import { sanitizeSecrets } from '../apps/api/src/utils/sanitizer.js';
import { config } from '../apps/api/src/config/index.js';

describe('API Security, Key Shielding & Access Control', () => {
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

  describe('1. Secret API Key Shielding & Redaction', () => {
    it('should NEVER expose external API keys in telemetry or provider status endpoints', async () => {
      const res = await fetch(`${baseUrl}/api/v1/data/providers/status`);
      expect(res.status).toBe(200);

      const rawText = await res.text();
      // Ensure no raw keys, secrets, or tokens exist in response
      expect(rawText).not.toContain(config.JWT_SECRET);
      expect(rawText).not.toContain(config.ADMIN_API_KEY);
      expect(rawText).not.toContain('xai-');
      expect(rawText).not.toContain('authToken');
      expect(rawText).not.toContain('TWILIO');
    });

    it('should NEVER expose SMS gateway credentials in provider config endpoint', async () => {
      const res = await fetch(`${baseUrl}/api/v1/alerts/provider/config`);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.status).toBe('ok');
      expect(json.providerName).toBeDefined();
      expect(json.isLive).toBeDefined();
      expect(json.isAvailable).toBeDefined();
      // Ensure credentials are NOT leaked
      expect(json.apiKey).toBeUndefined();
      expect(json.authToken).toBeUndefined();
      expect(json.accountSid).toBeUndefined();
    });

    it('should sanitize raw API keys, passwords, and tokens from error messages', () => {
      const leakedError = 'Upstream call failed using key=sk_live_9988776655443322 and xai-1234567890abcdef123456 with Bearer eyJhbGciOiJIUzI1NiJ9.test.sig';
      const sanitized = sanitizeSecrets(leakedError);

      expect(sanitized).not.toContain('sk_live_9988776655443322');
      expect(sanitized).not.toContain('xai-1234567890abcdef123456');
      expect(sanitized).not.toContain('eyJhbGciOiJIUzI1NiJ9.test.sig');
      expect(sanitized).toContain('xai-***REDACTED***');
      expect(sanitized).toContain('key=***REDACTED***');
      expect(sanitized).toContain('Bearer ***REDACTED***');
    });
  });

  describe('2. Cryptographic JWT Generation & Constant-Time Verification', () => {
    it('should generate a valid HS256 JWT and verify it with timing-safe signature comparison', () => {
      const token = generateJwt({
        id: 'user-sec-01',
        email: 'security@smartcity.org',
        role: 'ADMIN',
        fullName: 'Security Officer',
      });

      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3);

      const decoded = verifyJwt(token);
      expect(decoded).not.toBeNull();
      expect(decoded?.id).toBe('user-sec-01');
      expect(decoded?.role).toBe('ADMIN');
      expect(decoded?.email).toBe('security@smartcity.org');
    });

    it('should strictly reject tampered or modified JWT tokens', () => {
      const validToken = generateJwt({
        id: 'user-sec-01',
        email: 'security@smartcity.org',
        role: 'CITIZEN',
      });

      // Tamper with payload (attacker attempts privilege escalation to ADMIN)
      const parts = validToken.split('.');
      const tamperedPayload = Buffer.from(JSON.stringify({ id: 'user-sec-01', role: 'ADMIN' })).toString('base64url');
      const forgedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

      const verified = verifyJwt(forgedToken);
      expect(verified).toBeNull();
    });

    it('should reject expired JWT tokens', () => {
      // Issue token that expired 10 seconds ago
      const expiredToken = generateJwt(
        { id: 'user-expired', email: 'exp@test.com', role: 'CITIZEN' },
        config.JWT_SECRET,
        -10
      );

      const verified = verifyJwt(expiredToken);
      expect(verified).toBeNull();
    });
  });

  describe('3. Endpoint Access Control & Role Enforcement', () => {
    it('should reject unauthenticated requests to administrative endpoints when auth is enforced (HTTP 401)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/admin/overview`, {
        headers: {
          'x-test-enforce-auth': 'true',
        },
      });

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.status).toBe(401);
      expect(json.title).toBe('Authentication Required');
    });

    it('should forbid Citizen users from accessing EOC Authority endpoints (HTTP 403 Forbidden)', async () => {
      const citizenToken = generateJwt({
        id: 'citizen-bob',
        email: 'bob@example.com',
        role: 'CITIZEN',
      });

      const res = await fetch(`${baseUrl}/api/v1/admin/overview`, {
        headers: {
          Authorization: `Bearer ${citizenToken}`,
          'x-test-enforce-auth': 'true',
        },
      });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.status).toBe(403);
      expect(json.title).toBe('Access Forbidden');
      expect(json.detail).toContain('ADMIN');
    });

    it('should grant access to EOC Authority endpoints with valid Admin JWT token (HTTP 200)', async () => {
      const adminToken = generateJwt({
        id: 'admin-alice',
        email: 'alice.commander@smartcity.org',
        role: 'ADMIN',
      });

      const res = await fetch(`${baseUrl}/api/v1/admin/overview`, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'x-test-enforce-auth': 'true',
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('ok');
      expect(json.studyArea).toBeDefined();
    });

    it('should grant access to administrative endpoints using valid x-api-key header', async () => {
      const res = await fetch(`${baseUrl}/api/v1/admin/overview`, {
        headers: {
          'x-api-key': config.ADMIN_API_KEY,
          'x-test-enforce-auth': 'true',
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('ok');
    });

    it('should reject invalid x-api-key headers (HTTP 401)', async () => {
      const res = await fetch(`${baseUrl}/api/v1/admin/overview`, {
        headers: {
          'x-api-key': 'attacker_wrong_admin_key_attempt',
          'x-test-enforce-auth': 'true',
        },
      });

      expect(res.status).toBe(401);
    });
  });

  describe('4. Token Verification & Authentication Lifecycle', () => {
    it('POST /api/v1/auth/login should return a valid signed JWT and GET /api/v1/auth/verify should validate it', async () => {
      const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'admin.eoc@smartcity.org',
          password: 'securePassword123',
        }),
      });

      expect(loginRes.status).toBe(200);
      const loginBody = await loginRes.json();
      expect(loginBody.accessToken).toBeDefined();
      expect(loginBody.user.role).toBe('ADMIN');

      // Verify token via /api/v1/auth/verify
      const verifyRes = await fetch(`${baseUrl}/api/v1/auth/verify`, {
        headers: {
          Authorization: `Bearer ${loginBody.accessToken}`,
        },
      });

      expect(verifyRes.status).toBe(200);
      const verifyBody = await verifyRes.json();
      expect(verifyBody.valid).toBe(true);
      expect(verifyBody.user.email).toBe('admin.eoc@smartcity.org');
      expect(verifyBody.user.role).toBe('ADMIN');
    });
  });

  describe('5. Rate Limiting Protection', () => {
    it('should block abusive request bursts exceeding limit with HTTP 429 Too Many Requests', async () => {
      const url = `${baseUrl}/api/v1/auth/verify`;
      const testHeaders = { 'x-test-rate-limit': 'true' };

      // Consume requests up to limit
      let lastStatus = 200;
      for (let i = 0; i < 35; i++) {
        const res = await fetch(url, { headers: testHeaders });
        lastStatus = res.status;
        if (res.status === 429) {
          const body = await res.json();
          expect(body.status).toBe(429);
          expect(body.title).toBe('Too Many Requests');
          expect(res.headers.get('RateLimit-Remaining')).toBe('0');
          break;
        }
      }

      expect(lastStatus).toBe(429);
    });
  });
});
