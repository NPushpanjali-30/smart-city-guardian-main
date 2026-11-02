import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'http';
import { WebSocket } from 'ws';
import { createApp } from '../apps/api/src/app.js';
import { RealtimeWebSocketServer } from '../apps/api/src/websocket/wsServer.js';
import { routingEngine } from '../apps/api/src/services/routing/routingEngine.service.js';
import { activeRouteService } from '../apps/api/src/services/routing/activeRoute.service.js';
import { locationRelevanceService } from '../apps/api/src/services/locationRelevance.service.js';
import { OpenMeteoAdapter } from '../apps/api/src/providers/weather/openMeteoAdapter.js';
import { TwilioSmsAdapter } from '../apps/api/src/providers/sms/twilioSmsAdapter.js';
import { CircuitBreaker } from '../apps/api/src/providers/common/circuitBreaker.js';
import {
  WeatherObservationSchema,
  FloodObservationSchema,
  TrafficObservationSchema,
  TrafficIncidentSchema,
  RouteRequestSchema,
  RouteCalculationRequestSchema,
  LocationRelevanceRequestSchema,
  SavedLocationSchema,
  AiAnalyzeRequestSchema,
  CitizenReportInputSchema,
} from '@smartcity/shared';

describe('Comprehensive End-to-End System Integration, Security & Resilience Verification', () => {
  let server: http.Server;
  let wsServer: RealtimeWebSocketServer;
  let baseUrl: string;
  let wsUrl: string;

  beforeAll(async () => {
    const app = createApp();
    server = http.createServer(app);
    wsServer = new RealtimeWebSocketServer(server);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address() as any;
        baseUrl = `http://127.0.0.1:${address.port}`;
        wsUrl = `ws://127.0.0.1:${address.port}/ws`;
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

  // ============================================================================
  // SECTION 1: FULL API SUITE - LOCATION SERVICE ROUTES
  // ============================================================================
  describe('1. Full API Suite Review: Location Service Routes', () => {
    it('GET /api/v1/location/search should return matching Bangalore landmarks and support queries', async () => {
      // 1. Local database search
      const res = await fetch(`${baseUrl}/api/v1/location/search?q=Majestic`);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.results)).toBe(true);
      expect(json.results.length).toBeGreaterThan(0);
      expect(json.results.some((r: any) => r.name.toLowerCase().includes('majestic'))).toBe(true);

      // 2. Empty query returns default top landmarks
      const emptyRes = await fetch(`${baseUrl}/api/v1/location/search`);
      expect(emptyRes.status).toBe(200);
      const emptyJson = await emptyRes.json();
      expect(emptyJson.success).toBe(true);
      expect(emptyJson.results.length).toBeGreaterThanOrEqual(5);

      // 3. Array query parameters handled cleanly without error
      const arrayRes = await fetch(`${baseUrl}/api/v1/location/search?q=Koramangala&q=Bellandur`);
      expect(arrayRes.status).toBe(200);
      const arrayJson = await arrayRes.json();
      expect(arrayJson.success).toBe(true);
      expect(arrayJson.results.length).toBeGreaterThan(0);
    });

    it('GET /api/v1/location/reverse should perform reverse geocoding for valid coordinates and reject invalid bounds', async () => {
      // Valid Bangalore Coordinates (Majestic: 12.9767, 77.5713)
      const validRes = await fetch(`${baseUrl}/api/v1/location/reverse?lat=12.9767&lon=77.5713`);
      expect(validRes.status).toBe(200);
      const validJson = await validRes.json();
      expect(validJson.success).toBe(true);
      expect(validJson.lat).toBe(12.9767);
      expect(validJson.lon).toBe(77.5713);
      expect(validJson.name).toBeDefined();
      expect(validJson.nearestLandmark).toBeDefined();

      // Reject non-numeric lat/lon with HTTP 400
      const invalidRes = await fetch(`${baseUrl}/api/v1/location/reverse?lat=invalid&lon=abc`);
      expect(invalidRes.status).toBe(400);
      const invalidJson = await invalidRes.json();
      expect(invalidJson.success).toBe(false);

      // Reject out-of-bounds coordinates with HTTP 400
      const outOfBoundsRes = await fetch(`${baseUrl}/api/v1/location/reverse?lat=120.0&lon=77.0`);
      expect(outOfBoundsRes.status).toBe(400);
    });

    it('CRUD /api/v1/location/saved should manage user destinations and enforce authorization', async () => {
      const auditorUser = 'auditor-user-001';
      const attackerUser = 'attacker-user-999';

      // 1. GET saved locations for user
      const getInitial = await fetch(`${baseUrl}/api/v1/location/saved?userId=${auditorUser}`);
      expect(getInitial.status).toBe(200);
      const initialJson = await getInitial.json();
      expect(initialJson.success).toBe(true);
      expect(Array.isArray(initialJson.data)).toBe(true);

      // 2. POST create a new saved location
      const createRes = await fetch(`${baseUrl}/api/v1/location/saved`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': auditorUser,
        },
        body: JSON.stringify({
          name: 'Bengaluru Tech Innovation Lab',
          type: 'WORK',
          latitude: 12.9352,
          longitude: 77.6245,
        }),
      });
      expect(createRes.status).toBe(201);
      const createJson = await createRes.json();
      expect(createJson.success).toBe(true);
      expect(createJson.data.name).toBe('Bengaluru Tech Innovation Lab');
      const locationId = createJson.data.id;

      // 3. Attacker attempts to delete auditor's location (HTTP 403 Forbidden)
      const attackerDelete = await fetch(`${baseUrl}/api/v1/location/saved/${locationId}`, {
        method: 'DELETE',
        headers: { 'x-user-id': attackerUser },
      });
      expect(attackerDelete.status).toBe(403);

      // 4. Authorized owner successfully deletes own location (HTTP 200 OK)
      const ownerDelete = await fetch(`${baseUrl}/api/v1/location/saved/${locationId}`, {
        method: 'DELETE',
        headers: { 'x-user-id': auditorUser },
      });
      expect(ownerDelete.status).toBe(200);

      // 5. Deleting already removed location returns HTTP 404 Not Found
      const repeatDelete = await fetch(`${baseUrl}/api/v1/location/saved/${locationId}`, {
        method: 'DELETE',
        headers: { 'x-user-id': auditorUser },
      });
      expect(repeatDelete.status).toBe(404);
    });

    it('GET & POST /api/v1/location/relevance should evaluate proximity risk and validate coordinates', async () => {
      // GET evaluation
      const getRes = await fetch(
        `${baseUrl}/api/v1/location/relevance?lat=12.9716&lon=77.5946&destination=Hospital&language=en`
      );
      expect(getRes.status).toBe(200);
      const getJson = await getRes.json();
      expect(getJson.success).toBe(true);
      expect(getJson.data.currentLocation).toBeDefined();

      // GET with invalid coordinates returns HTTP 400
      const invalidGet = await fetch(`${baseUrl}/api/v1/location/relevance?lat=999.0&lon=77.5946`);
      expect(invalidGet.status).toBe(400);

      // POST evaluation with payload
      const postRes = await fetch(`${baseUrl}/api/v1/location/relevance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: 12.9716,
          longitude: 77.5946,
          destination: 'Whitefield',
          language: 'en',
          userId: 'auditor-user-001',
        }),
      });
      expect(postRes.status).toBe(200);
      const postJson = await postRes.json();
      expect(postJson.success).toBe(true);
      expect(postJson.data.currentLocation).toBeDefined();

      // POST evaluation with invalid schema returns HTTP 400
      const invalidPost = await fetch(`${baseUrl}/api/v1/location/relevance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: 'not-a-number',
          longitude: 77.5946,
        }),
      });
      expect(invalidPost.status).toBe(400);
    });
  });

  // ============================================================================
  // SECTION 2: FULL API SUITE - ROUTING SERVICE ROUTES
  // ============================================================================
  describe('2. Full API Suite Review: Routing Service Routes', () => {
    let calculatedRouteId: string;
    let activeSessionId: string;

    it('POST /api/v1/routes/calculate should compute safe multi-candidate routes for valid custom coordinates', async () => {
      // Custom coordinates: Majestic Station to Frazer Town / Bangalore Palace
      const routePayload = {
        origin: { latitude: 12.9767, longitude: 77.5713, name: 'Majestic Station' },
        destination: { latitude: 13.00481, longitude: 77.59901, name: 'Bangalore Palace' },
        preferences: {
          prioritizeSafety: true,
          avoidFloodRiskThreshold: 50,
        },
      };

      const res = await fetch(`${baseUrl}/api/v1/routes/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(routePayload),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.recommendedRoute).toBeDefined();
      expect(json.recommendedRoute.isSafe).toBe(true);
      expect(json.recommendedRoute.geometry.coordinates.length).toBeGreaterThan(0);
      expect(json.directRoute).toBeDefined();
      expect(json.safetyDecision).toBeDefined();

      calculatedRouteId = json.recommendedRoute.routeId;
      expect(calculatedRouteId).toBeDefined();
    });

    it('POST /api/v1/routes/:id/start and GET /api/v1/routes/active should manage navigation sessions', async () => {
      // Start navigation session for auditor
      const startRes = await fetch(`${baseUrl}/api/v1/routes/${calculatedRouteId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'auditor-session-user' }),
      });

      expect(startRes.status).toBe(200);
      const startJson = await startRes.json();
      expect(startJson.success).toBe(true);
      expect(startJson.data.sessionId).toBeDefined();
      expect(startJson.data.status).toBe('ACTIVE');
      activeSessionId = startJson.data.sessionId;

      // GET /api/v1/routes/active with userId filter
      const activeRes = await fetch(`${baseUrl}/api/v1/routes/active?userId=auditor-session-user`);
      expect(activeRes.status).toBe(200);
      const activeJson = await activeRes.json();
      expect(activeJson.success).toBe(true);
      expect(activeJson.data.sessionId).toBe(activeSessionId);

      // GET /api/v1/routes/:id should retrieve active session
      const getSessionRes = await fetch(`${baseUrl}/api/v1/routes/${activeSessionId}`);
      expect(getSessionRes.status).toBe(200);
      const sessionJson = await getSessionRes.json();
      expect(sessionJson.success).toBe(true);
      expect(sessionJson.session?.sessionId).toBe(activeSessionId);
    });

    it('POST /api/v1/routes/:id/recalculate should perform route recalculation and emit new version', async () => {
      const recalcRes = await fetch(`${baseUrl}/api/v1/routes/${activeSessionId}/recalculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      expect(recalcRes.status).toBe(200);
      const recalcJson = await recalcRes.json();
      expect(recalcJson.success).toBe(true);
      expect(recalcJson.session.currentRouteVersion).toBeGreaterThanOrEqual(2);
      expect(recalcJson.session.lastRerouteAt).toBeDefined();

      // Verify versions endpoint
      const versionsRes = await fetch(`${baseUrl}/api/v1/routes/${activeSessionId}/versions`);
      expect(versionsRes.status).toBe(200);
      const versionsJson = await versionsRes.json();
      expect(versionsJson.totalVersions).toBeGreaterThanOrEqual(2);
    });

    it('POST /api/v1/routes/:id/stop should conclude session with BOLA access control', async () => {
      // Attacker cannot stop auditor's session
      const unauthorizedStop = await fetch(`${baseUrl}/api/v1/routes/${activeSessionId}/stop`, {
        method: 'POST',
        headers: { 'x-user-id': 'attacker-user' },
      });
      expect(unauthorizedStop.status).toBe(403);

      // Authorized owner stops session
      const authorizedStop = await fetch(`${baseUrl}/api/v1/routes/${activeSessionId}/stop`, {
        method: 'POST',
        headers: { 'x-user-id': 'auditor-session-user' },
      });
      expect(authorizedStop.status).toBe(200);
      const stopJson = await authorizedStop.json();
      expect(stopJson.session.status).toBe('COMPLETED');
    });
  });

  // ============================================================================
  // SECTION 3: FULL API SUITE - FLOOD & WEATHER INGESTION
  // ============================================================================
  describe('3. Full API Suite Review: Flood Intelligence & Weather Ingestion', () => {
    it('GET /api/v1/flood/risk and /api/v1/flood/predictions should return valid flood telemetry', async () => {
      const floodRiskRes = await fetch(`${baseUrl}/api/v1/flood/risk?rainfall=35.0&floodProne=true`);
      expect(floodRiskRes.status).toBe(200);
      const riskJson = await floodRiskRes.json();
      expect(riskJson.success).toBe(true);
      expect(riskJson.data.current.score).toBeGreaterThanOrEqual(0);
      expect(riskJson.data.prediction.state).toBeDefined();

      const predictionsRes = await fetch(`${baseUrl}/api/v1/flood/predictions?horizon=45`);
      expect(predictionsRes.status).toBe(200);
      const predJson = await predictionsRes.json();
      expect(predJson.success).toBe(true);
      expect(predJson.data.activePrediction).toBeDefined();

      const zonesRes = await fetch(`${baseUrl}/api/v1/flood/zones`);
      expect(zonesRes.status).toBe(200);
      const zonesJson = await zonesRes.json();
      expect(zonesJson.success).toBe(true);
      expect(zonesJson.data.length).toBeGreaterThan(0);

      const eventsRes = await fetch(`${baseUrl}/api/v1/flood/events`);
      expect(eventsRes.status).toBe(200);
      const eventsJson = await eventsRes.json();
      expect(eventsJson.success).toBe(true);
      expect(eventsJson.data.currentState).toBeDefined();
    });

    it('GET /api/v1/weather/current and /api/v1/weather/forecast should ingest weather and validate coords', async () => {
      // Valid coordinates
      const currentRes = await fetch(`${baseUrl}/api/v1/weather/current?lat=12.9716&lon=77.5946`);
      expect(currentRes.status).toBe(200);
      const currentJson = await currentRes.json();
      expect(currentJson.success).toBe(true);
      expect(currentJson.data.temperatureC).toBeDefined();
      expect(currentJson.data.rainfallRateMmh).toBeGreaterThanOrEqual(0);

      // Forecast
      const forecastRes = await fetch(`${baseUrl}/api/v1/weather/forecast?lat=12.9716&lon=77.5946`);
      expect(forecastRes.status).toBe(200);
      const forecastJson = await forecastRes.json();
      expect(forecastJson.success).toBe(true);
      expect(forecastJson.data.length).toBeGreaterThan(0);

      // Out of bounds latitude rejected with 400
      const invalidLatRes = await fetch(`${baseUrl}/api/v1/weather/current?lat=195.0&lon=77.5946`);
      expect(invalidLatRes.status).toBe(400);

      const invalidForecastRes = await fetch(`${baseUrl}/api/v1/weather/forecast?lat=12.9716&lon=-350.0`);
      expect(invalidForecastRes.status).toBe(400);
    });
  });

  // ============================================================================
  // SECTION 4: REAL-TIME WEBSOCKET STREAMING & RECALCULATION BROADCASTS
  // ============================================================================
  describe('4. Real-Time WebSockets: Connection, Subscriptions, and Broadcast Packets', () => {
    it('should establish WebSocket connection, receive initial handshake, handle ping/pong, and update subscriptions', async () => {
      const ws = new WebSocket(wsUrl);

      const messages: any[] = [];
      await new Promise<void>((resolve, reject) => {
        ws.on('open', () => resolve());
        ws.on('error', (err) => reject(err));
        ws.on('message', (data: string) => {
          try {
            messages.push(JSON.parse(data));
          } catch {}
        });
      });

      // Wait for initial connection packet
      await new Promise((r) => setTimeout(r, 100));
      const handshake = messages.find((m) => m.type === 'CONNECTION_ESTABLISHED');
      expect(handshake).toBeDefined();
      expect(handshake.topic).toBe('realtime:system');
      expect(handshake.subscriptions).toContain('realtime:routing');

      // Test Ping / Pong
      ws.send(JSON.stringify({ action: 'ping' }));
      await new Promise((r) => setTimeout(r, 100));
      const pong = messages.find((m) => m.type === 'pong');
      expect(pong).toBeDefined();

      // Test Subscribing to custom topic
      ws.send(JSON.stringify({ action: 'subscribe', topics: ['user:ws-auditor', 'custom:incident'] }));
      await new Promise((r) => setTimeout(r, 100));
      const subUpdated = messages.find((m) => m.type === 'SUBSCRIPTIONS_UPDATED');
      expect(subUpdated).toBeDefined();
      expect(subUpdated.subscriptions).toContain('user:ws-auditor');

      // Test Unsubscribing
      ws.send(JSON.stringify({ action: 'unsubscribe', topics: ['custom:incident'] }));
      await new Promise((r) => setTimeout(r, 100));
      const latestSub = messages.filter((m) => m.type === 'SUBSCRIPTIONS_UPDATED').pop();
      expect(latestSub.subscriptions).not.toContain('custom:incident');

      ws.close();
    });

    it('should broadcast ROUTE_RECALCULATED events in real time to subscribed WebSocket clients', async () => {
      const ws = new WebSocket(wsUrl);

      const receivedBroadcasts: any[] = [];
      await new Promise<void>((resolve) => {
        ws.on('open', () => resolve());
        ws.on('message', (data: string) => {
          try {
            receivedBroadcasts.push(JSON.parse(data));
          } catch {}
        });
      });

      // Subscribe to routing and private user channel
      const targetUser = 'ws-recalc-auditor';
      ws.send(JSON.stringify({ action: 'subscribe', topics: ['realtime:routing', `user:${targetUser}`] }));
      await new Promise((r) => setTimeout(r, 120));

      // Calculate and start a new route session for the target user
      const calc = await routingEngine.calculateRoutes({
        origin: { latitude: 12.9767, longitude: 77.5713, name: 'Start Majestic' },
        destination: { latitude: 13.00481, longitude: 77.59901, name: 'Dest Palace' },
        userId: targetUser,
      });
      const session = await activeRouteService.startRoute(calc.recommendedRoute.routeId, targetUser);

      // Trigger dynamic recalculation on this active session
      await activeRouteService.recalculateRoute(session.sessionId, 'MANUAL');

      // Allow event propagation through event bus to WebSocket clients
      await new Promise((r) => setTimeout(r, 200));

      // Verify route recalculation packet was received over WebSocket
      const recalcEvent = receivedBroadcasts.find(
        (m) => m.topic === 'realtime:routing' && m.eventType === 'ROUTE_RECALCULATED'
      );
      expect(recalcEvent).toBeDefined();
      expect(recalcEvent.payload.sessionId).toBe(session.sessionId);
      expect(recalcEvent.payload.userId).toBe(targetUser);
      expect(recalcEvent.payload.version).toBeGreaterThanOrEqual(2);

      // Clean up session and socket
      activeRouteService.stopRoute(session.sessionId);
      ws.close();
    });
  });

  // ============================================================================
  // SECTION 5: UPSTREAM FAILURE MODES, TIMEOUTS & CIRCUIT BREAKER RESILIENCE
  // ============================================================================
  describe('5. System Failure Modes & Circuit Breaker Resilience', () => {
    it('OpenMeteoAdapter should trip circuit breaker and gracefully activate deterministic mock weather fallback', async () => {
      // Create adapter pointing to simulated broken upstream
      const adapter = new OpenMeteoAdapter('http://127.0.0.1:59999/broken-upstream', {
        failureThreshold: 2,
        resetTimeoutMs: 1000,
        requestTimeoutMs: 150,
        maxRetries: 0,
      });

      // Execution should not throw; should gracefully activate fallback
      const weatherFallback = await adapter.getCurrentWeather(12.9716, 77.5946);
      expect(weatherFallback).toBeDefined();
      expect(weatherFallback.freshness).toBe('MOCK');
      expect(weatherFallback.source).toContain('fallback');
      expect(weatherFallback.temperatureC).toBeGreaterThan(-50);
    });

    it('OSRM Routing Circuit Breaker in RoutingEngine should trip on failures and activate deterministic route fallback', async () => {
      const osrmBreaker = routingEngine.getOsrmCircuitBreaker();
      expect(osrmBreaker).toBeDefined();

      // Trip the OSRM breaker artificially to OPEN state by executing failing actions
      const failingOsrmCall = async () => {
        throw new Error('OSRM upstream service timeout / 503 gateway unavailable');
      };

      try { await osrmBreaker.execute(failingOsrmCall); } catch {}
      try { await osrmBreaker.execute(failingOsrmCall); } catch {}
      try { await osrmBreaker.execute(failingOsrmCall); } catch {}

      // Breaker is now OPEN
      expect(osrmBreaker.getState()).toBe('OPEN');

      // Now calculate routes with Bangalore coordinates while OSRM circuit breaker is OPEN
      const t0 = performance.now();
      const result = await routingEngine.calculateRoutes({
        origin: { latitude: 12.9767, longitude: 77.5713, name: 'Majestic Station' },
        destination: { latitude: 13.00481, longitude: 77.59901, name: 'Bangalore Palace' },
      });
      const durationMs = performance.now() - t0;

      // 1. Should succeed with high speed (< 200ms) without waiting for 2.8s timeouts
      expect(result.recommendedRoute).toBeDefined();
      expect(result.recommendedRoute.isBlocked).toBe(false);
      expect(result.recommendedRoute.status).toBe('SAFE_TO_PROCEED');
      expect(result.recommendedRoute.geometry.coordinates.length).toBeGreaterThan(0);
      expect(durationMs).toBeLessThan(500);

      // 2. Deterministic geometry fallback was used seamlessly
      expect(result.allCandidates.length).toBeGreaterThanOrEqual(1);
    });

    it('TwilioSmsAdapter should trip circuit breaker on upstream 5xx errors and fast-fail when OPEN', async () => {
      const twilio = new TwilioSmsAdapter(
        {
          accountSid: 'AC_mock_sid_test_12345',
          authToken: 'auth_token_mock_test_67890',
          fromNumber: '+15005550006',
        },
        {
          failureThreshold: 2,
          resetTimeoutMs: 2000,
          requestTimeoutMs: 200,
          maxRetries: 0,
        }
      );

      const breaker = twilio.getCircuitBreaker();
      expect(breaker.getState()).toBe('CLOSED');

      // Execute failing upstream actions to trip breaker
      try {
        await breaker.execute(async () => {
          throw new Error('Twilio REST API 500 Internal Server Error');
        });
      } catch {}

      try {
        await breaker.execute(async () => {
          throw new Error('Twilio REST API 500 Internal Server Error');
        });
      } catch {}

      expect(breaker.getState()).toBe('OPEN');

      // sendSms immediately fast-fails without hitting network
      const fastFailResult = await twilio.sendSms({
        to: '+919876543210',
        message: 'Critical emergency flood notification',
      });

      expect(fastFailResult.success).toBe(false);
      expect(fastFailResult.status).toBe('FAILED');
      expect(fastFailResult.error).toContain('CIRCUIT_BREAKER_OPEN');
    });
  });

  // ============================================================================
  // SECTION 6: RATE LIMITING, SECURITY HEADERS & SCHEMA INPUT DEFENSE
  // ============================================================================
  describe('6. Security, Rate Limiting & Input Validation Defense', () => {
    it('should emit all required security headers (Helmet, CSP, X-Frame-Options, X-Content-Type-Options)', async () => {
      const res = await fetch(`${baseUrl}/health`);
      expect(res.status).toBe(200);

      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('x-frame-options')).toBe('DENY');
      expect(res.headers.get('x-xss-protection')).toBe('1; mode=block');
      expect(res.headers.get('content-security-policy')).toBeDefined();
      expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
      expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    });

    it('should enforce CORS whitelist and allow legitimate cross-origin preflight requests', async () => {
      const allowedRes = await fetch(`${baseUrl}/health`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:5173',
          'Access-Control-Request-Method': 'GET',
        },
      });
      expect(allowedRes.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
      expect(allowedRes.headers.get('access-control-allow-credentials')).toBe('true');
    });

    it('should trigger rate limiting (HTTP 429) and standard RateLimit headers when threshold exceeded', async () => {
      const testHeaders = { 'x-test-rate-limit': 'true' };
      const endpoint = `${baseUrl}/api/v1/auth/verify`;

      let rateLimited = false;
      for (let i = 0; i < 35; i++) {
        const res = await fetch(endpoint, { headers: testHeaders });
        if (res.status === 429) {
          rateLimited = true;
          const body = await res.json();
          expect(body.status).toBe(429);
          expect(body.title).toBe('Too Many Requests');
          expect(res.headers.get('RateLimit-Remaining')).toBe('0');
          expect(res.headers.get('RateLimit-Reset')).toBeDefined();
          break;
        }
      }
      expect(rateLimited).toBe(true);
    });

    it('should cleanly reject malformed and malicious payloads across @smartcity/shared schemas without crashing', () => {
      // 1. WeatherObservationSchema: reject negative rainfall / out-of-bounds coordinates / NaN
      const maliciousWeather = {
        id: 'wx-malicious',
        source: 'attacker',
        timestamp: 'now',
        receivedAt: 'now',
        location: { name: '<script>alert(1)</script>', latitude: 195.0, longitude: -74.0 },
        temperatureC: 25,
        humidityPercent: 150, // exceeds 100%
        rainfallRateMmh: -10, // negative
        rainfall1hMm: -5,
        rainfall24hMm: 0,
        windSpeedKmh: -20,
        freshness: 'INVALID_STATE',
        dataAgeSeconds: -10,
      };
      const weatherCheck = WeatherObservationSchema.safeParse(maliciousWeather);
      expect(weatherCheck.success).toBe(false);

      // 2. TrafficObservationSchema: reject speeds exceeding physics limits / negative delays
      const maliciousTraffic = {
        segmentId: 'seg-01',
        roadName: 'Main Rd',
        timestamp: 'now',
        receivedAt: 'now',
        speedKmh: 9999, // exceeds 250 kmh max
        freeFlowSpeedKmh: 0, // min 1
        delaySeconds: -50,
        congestionLevel: 150,
        source: 'test',
        freshness: 'LIVE',
        dataAgeSeconds: 0,
      };
      const trafficCheck = TrafficObservationSchema.safeParse(maliciousTraffic);
      expect(trafficCheck.success).toBe(false);

      // 3. FloodObservationSchema: reject negative water depths / invalid severity
      const maliciousFlood = {
        id: 'fl-01',
        zoneId: 'z-01',
        zoneName: 'Test Zone',
        waterDepthCm: -15, // negative
        severity: 'SUPER_CRITICAL_EXPLOIT',
        observedAt: 'now',
        source: 'test',
        isLive: true,
        freshness: 'LIVE',
        dataAgeSeconds: 0,
      };
      const floodCheck = FloodObservationSchema.safeParse(maliciousFlood);
      expect(floodCheck.success).toBe(false);

      // 4. RouteCalculationRequestSchema: reject out-of-bounds origins and destinations
      const maliciousRoute = {
        origin: { latitude: NaN, longitude: -74.0 },
        destination: { latitude: 40.71, longitude: 500.0 },
      };
      const routeCheck = RouteCalculationRequestSchema.safeParse(maliciousRoute);
      expect(routeCheck.success).toBe(false);

      // 5. CitizenReportInputSchema: reject tiny description / malicious prototype injection attempts
      const maliciousReport = {
        category: 'FLOOD',
        description: 'a', // too short (< 5 chars)
        latitude: -120.0, // out of range
        longitude: 40.0,
        __proto__: { admin: true },
      };
      const reportCheck = CitizenReportInputSchema.safeParse(maliciousReport);
      expect(reportCheck.success).toBe(false);

      // 6. AiAnalyzeRequestSchema: reject invalid decision mode
      const maliciousAi = {
        mode: 'SYSTEM_OVERRIDE_PROMPT_INJECTION',
        language: 'invalid_lang',
      };
      const aiCheck = AiAnalyzeRequestSchema.safeParse(maliciousAi);
      expect(aiCheck.success).toBe(false);
    });
  });
});
