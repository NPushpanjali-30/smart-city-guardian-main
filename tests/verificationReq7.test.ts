import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import http from 'http';
import { createApp } from '../apps/api/src/app.js';

describe('Requirement 7 Comprehensive Verification: 5 Route Corridors & Features', () => {
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

  // 1. Verify 5 Requested India Route Pairs
  describe('1. Five India Route Corridors', () => {
    const routePairs = [
      { from: 'Chennai', to: 'Bengaluru', origin: [13.0827, 80.2707], dest: [12.9716, 77.5946] },
      { from: 'Delhi', to: 'Jaipur', origin: [28.6139, 77.2090], dest: [26.9124, 75.7873] },
      { from: 'Mumbai', to: 'Pune', origin: [19.0760, 72.8777], dest: [18.5204, 73.8567] },
      { from: 'Kolkata', to: 'Bhubaneswar', origin: [22.5726, 88.3639], dest: [20.2961, 85.8245] },
      { from: 'Guwahati', to: 'Shillong', origin: [26.1445, 91.7362], dest: [25.5788, 91.8933] },
    ];

    for (const pair of routePairs) {
      it(`should calculate or resolve route corridor for ${pair.from} → ${pair.to}`, async () => {
        // Location search check
        const searchRes = await fetch(`${baseUrl}/api/v1/location/search?q=${encodeURIComponent(pair.from)}`);
        expect(searchRes.status).toBe(200);

        // Flood corridor evaluation along route
        const waypoints = [
          pair.origin,
          [(pair.origin[0] + pair.dest[0]) / 2, (pair.origin[1] + pair.dest[1]) / 2],
          pair.dest,
        ];

        const floodRes = await fetch(`${baseUrl}/api/v1/floods/route-corridor`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ waypoints, simulatedRainfall: 35.0 }),
        });

        expect(floodRes.status).toBe(200);
        const floodBody = await floodRes.json();
        expect(floodBody.success).toBe(true);
        expect(Array.isArray(floodBody.segments)).toBe(true);
        expect(floodBody.segments.length).toBeGreaterThan(0);

        // Verify valid honest source attribution
        const validSources = ['Live observation', 'Forecast', 'Historical', 'Simulated scenario'];
        floodBody.segments.forEach((seg: any) => {
          expect(validSources).toContain(seg.sourceType);
          expect(['CRITICAL', 'WARNING', 'WATCH', 'NORMAL']).toContain(seg.severity);
        });
      });
    }
  });

  // 2. Hospitals and Shelters near at least 3 different destinations without marker overlap
  describe('2. Facilities near destinations across India', () => {
    const destinations = [
      { name: 'Bengaluru ITPL', lat: 12.9856, lon: 77.7317 },
      { name: 'Jaipur Central', lat: 26.9124, lon: 75.7873 },
      { name: 'Pune Shivajinagar', lat: 18.5204, lon: 73.8567 },
    ];

    for (const d of destinations) {
      it(`should find facilities around ${d.name} without overlap`, async () => {
        const res = await fetch(`${baseUrl}/api/v1/facilities/nearby?lat=${d.lat}&lon=${d.lon}&radius=4`);
        expect(res.status).toBe(200);
        const data = await res.json();
        const facilities = data.data || data.facilities || [];
        expect(Array.isArray(facilities)).toBe(true);
        expect(facilities.length).toBeGreaterThan(0);

        // Check metadata
        facilities.forEach((f: any) => {
          expect(['HOSPITAL', 'SHELTER', 'FIRE_STATION']).toContain(f.type);
          expect(f.name).toBeTruthy();
          expect(f.coordinates).toHaveLength(2);
          expect(typeof f.distanceKm).toBe('number');
        });

        // Check coordinate spacing (no two markers at exact same location)
        for (let i = 0; i < facilities.length; i++) {
          for (let j = i + 1; j < facilities.length; j++) {
            const samePos =
              facilities[i].coordinates[0] === facilities[j].coordinates[0] &&
              facilities[i].coordinates[1] === facilities[j].coordinates[1];
            expect(samePos).toBe(false);
          }
        }
      });
    }

    it('should return honest list without inventing fake facilities', async () => {
      const res = await fetch(`${baseUrl}/api/v1/facilities/nearby?lat=27.5000&lon=71.2000&radius=2`);
      expect(res.status).toBe(200);
      const data = await res.json();
      const facilities = data.data || data.facilities || [];
      expect(Array.isArray(facilities)).toBe(true);
      facilities.forEach((f: any) => {
        expect(f.id).not.toContain('fac-gen-');
      });
    });
  });

  // 3. User Registration with +91 Mobile, Login, Profile and Auto-Prefill
  describe('3. Registration, Profile, Phone Number & Auto-Prefill', () => {
    const testEmail = `test.driver.${Date.now()}@smartcity.org`;
    const testPhone = '+919876543210';

    it('should register a new user with +91 Indian mobile number and normalize to E.164', async () => {
      const regRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testEmail,
          password: 'Password123!',
          fullName: 'Rohan Sharma',
          phoneNumber: '9876543210',
        }),
      });

      expect(regRes.status).toBe(201);
      const regBody = await regRes.json();
      expect(regBody.user).toBeDefined();
      expect(regBody.user.phoneNumber).toBe('+919876543210');
      expect(regBody.accessToken || regBody.token).toBeDefined();
    });

    it('should reject invalid phone numbers (non-Indian prefix or wrong length)', async () => {
      const regRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: `invalid.${Date.now()}@smartcity.org`,
          password: 'Password123!',
          fullName: 'Invalid User',
          phoneNumber: '12345',
        }),
      });

      expect(regRes.status).toBe(400);
      const regBody = await regRes.json();
      expect(regBody.error || regBody.message).toBeTruthy();
    });

    it('should return phoneNumber upon login to enable prefill in SMS Dispatcher', async () => {
      const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testEmail,
          password: 'Password123!',
        }),
      });

      expect(loginRes.status).toBe(200);
      const loginBody = await loginRes.json();
      expect(loginBody.user).toBeDefined();
      expect(loginBody.user.phoneNumber).toBe(testPhone);
    });

    it('should allow existing user without phone to update profile phone number', async () => {
      const updateRes = await fetch(`${baseUrl}/api/v1/auth/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testEmail,
          phoneNumber: '9845012345',
        }),
      });

      expect(updateRes.status).toBe(200);
      const updateBody = await updateRes.json();
      expect(updateBody.user.phoneNumber).toBe('+919845012345');
    });
  });

  // 4. TextBee SMS Dispatcher & Connection Test
  describe('4. TextBee SMS Dispatcher & Connection Test', () => {
    it('should provide a /test-connection endpoint reporting status honestly', async () => {
      const testRes = await fetch(`${baseUrl}/api/v1/alerts/sms/test-connection`);
      expect(testRes.status).toBe(200);
      const testBody = await testRes.json();
      expect(testBody.status).toBeDefined();
      expect(['ONLINE', 'OFFLINE', 'TEST_MODE', 'MISSING_CREDENTIALS', 'NOT_CONFIGURED']).toContain(testBody.status);
      expect(typeof testBody.testMode === 'boolean' || testBody.status === 'MISSING_CREDENTIALS').toBe(true);
      expect(testBody.details || testBody.message).toBeDefined();
    });

    it('should reject SMS dispatch if phone number is invalid', async () => {
      const sendRes = await fetch(`${baseUrl}/api/v1/alerts/send-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: 'invalid-number',
          message: 'Evacuation notice',
        }),
      });

      expect(sendRes.status).toBe(400);
      const sendBody = await sendRes.json();
      expect(sendBody.success).toBe(false);
      expect(sendBody.error).toContain('Valid recipient phone number is required');
    });

    it('should simulate SMS safely without unconfirmed success when in test mode', async () => {
      const sendRes = await fetch(`${baseUrl}/api/v1/alerts/send-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: '+919876543210',
          message: '🚨 ALERT: Flash flood warning in Whitefield corridor. Seek high ground.',
        }),
      });

      expect(sendRes.status).toBe(200);
      const sendBody = await sendRes.json();
      expect(sendBody.success).toBe(true);
      expect(sendBody.messageId).toBeDefined();
    });
  });
});
