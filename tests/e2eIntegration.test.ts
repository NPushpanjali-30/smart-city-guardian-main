import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'http';
import { WebSocket } from 'ws';
import { createApp } from '../apps/api/src/app.js';
import { dataAggregator } from '../apps/api/src/services/dataAggregator.js';
import { floodIntelligenceService } from '../apps/api/src/services/flood/floodIntelligence.service.js';
import { roadRiskService } from '../apps/api/src/services/roads/roadRisk.service.js';
import { activeRouteService } from '../apps/api/src/services/routing/activeRoute.service.js';
import { routingEngine } from '../apps/api/src/services/routing/routingEngine.service.js';
import { grokDecisionService } from '../apps/api/src/services/ai/GrokDecisionService.js';
import { notificationQueueService } from '../apps/api/src/services/notifications/notificationQueue.service.js';
import { userPreferenceService } from '../apps/api/src/services/notifications/userPreference.service.js';
import { mockSmsProvider } from '../apps/api/src/providers/sms/mockSmsProvider.js';
import { RealtimeWebSocketServer } from '../apps/api/src/websocket/wsServer.js';

describe('Phase 8: End-to-End System Integration & Workflow Verification', () => {
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

  beforeEach(() => {
    notificationQueueService.clearAll();
    mockSmsProvider.setSimulationMode('SUCCESS');
    mockSmsProvider.clearHistory();

    userPreferenceService.updatePreferences('commuter-test-user', {
      phoneNumber: '+919876543210',
      smsOptIn: true,
      preferredLanguage: 'en',
      minSeverity: 'WARNING',
      channels: { inApp: true, sms: true },
    });
  });

  it('1. Complete Autonomous Workflow: Weather Ingestion -> Flood Prediction -> Road Risk -> Navigation -> Decision -> Notification', async () => {
    // 1. Ingest Weather Telemetry
    const weather = await dataAggregator.refreshWeather(40.7128, -74.0060);
    expect(weather).toBeDefined();
    expect(weather.rainfallRateMmh).toBeGreaterThanOrEqual(0);

    // 2. Flood Intelligence & Risk Evaluation
    const floodEval = await floodIntelligenceService.evaluateRisk({
      weatherObservation: weather,
    });
    expect(floodEval).toBeDefined();
    expect(floodEval.currentRisk).toBeDefined();
    expect(floodEval.prediction).toBeDefined();
    expect(floodEval.affectedRoads.length).toBeGreaterThan(0);

    // 3. Unified Road Risk Scoring
    const roadRisks = await roadRiskService.evaluateAllRoadRisks();
    expect(roadRisks.length).toBeGreaterThan(0);
    const primaryRoad = roadRisks.find((r) => r.roadId === 'road-bay-st-001' || r.roadId === 'road-bay-st');
    expect(primaryRoad).toBeDefined();

    // 4. Commuter Route Calculation
    const routePlan = await routingEngine.calculateRoutes({
      origin: { latitude: 40.7128, longitude: -74.0060, name: 'Downtown Origin' },
      destination: { latitude: 40.7450, longitude: -74.0200, name: 'Highland Destination' },
      userId: 'commuter-test-user',
    });
    expect(routePlan.recommendedRoute).toBeDefined();
    expect(routePlan.candidateRoutes.length).toBeGreaterThanOrEqual(1);

    // 5. Grok AI Advisory Context & Fallback
    const aiDecision = await grokDecisionService.analyze({
      mode: 'COMMUTER_DETOUR',
      language: 'en',
    });
    expect(aiDecision).toBeDefined();
    expect(aiDecision.decision.situation_summary).toBeDefined();
    expect(aiDecision.decision.route_recommendation).toBeDefined();

    // 6. Start Active Navigation Session
    const session = await activeRouteService.startRoute(routePlan.recommendedRoute.routeId, 'commuter-test-user');
    expect(session.sessionId).toBeDefined();
    expect(session.status).toBe('ACTIVE');

    // Clean up
    activeRouteService.stopRoute(session.sessionId);
  });

  it('2. Blocked Road Event -> Dynamic Reroute -> Cooldown Bypass -> Localized SMS Delivery', async () => {
    // Start active navigation session
    const calc = await routingEngine.calculateRoutes({
      origin: { latitude: 40.7128, longitude: -74.0060, name: 'City Hall' },
      destination: { latitude: 40.7450, longitude: -74.0200, name: 'North Station' },
      userId: 'commuter-test-user',
    });
    const session = await activeRouteService.startRoute(calc.recommendedRoute.routeId, 'commuter-test-user');
    expect(session.currentRouteVersion).toBe(1);

    // Identify active route segment to block
    const targetSegment = session.currentRoute.segments[0];
    const blockedSegmentId = targetSegment?.roadId || targetSegment?.segmentId || 'road-bay-st-001';

    // Introduce verified road blockage on active route segment
    const simulatedRoadRisk = [
      {
        roadId: blockedSegmentId,
        roadName: targetSegment?.roadName || 'Bay Street Boulevard',
        accessibility: 'BLOCKED' as const,
        accessibilityState: 'BLOCKED' as const,
        overallRisk: 95,
        blockageReason: 'Submerged underpass (32cm flood)',
        traffic: { score: 90, state: 'CONGESTED' as const, delayRatio: 3.0 },
        flood: { score: 95, state: 'CRITICAL' as const, waterDepthCm: 32 },
        incident: { score: 90, activeIncidents: 1, isBlocking: true },
        confidence: 0.95,
        freshness: 'LIVE' as const,
        reason: 'CRITICAL Flash Flood Inundation',
        updatedAt: new Date().toISOString(),
      },
    ];

    // Evaluate active routes against blocked road
    await activeRouteService.evaluateAllActiveRoutes(simulatedRoadRisk);

    const updatedSession = activeRouteService.findSession(session.sessionId);
    expect(updatedSession).toBeDefined();
    expect(updatedSession?.currentRouteVersion).toBe(2);
    expect(updatedSession?.lastRerouteAt).toBeDefined();

    // Verify localized SMS notification was enqueued and delivered
    const notifHistory = notificationQueueService.getHistory('commuter-test-user');
    expect(notifHistory.length).toBeGreaterThanOrEqual(1);

    const rerouteNotif = notifHistory.find((n) => n.triggerType === 'ROUTE_ALERT');
    expect(rerouteNotif).toBeDefined();
    expect(rerouteNotif?.status).toBe('DELIVERED');
    expect(rerouteNotif?.recipientPhoneMasked).toBe('+91 98*** ***10');
    expect(rerouteNotif?.message).toContain('Detour');

    // Clean up
    activeRouteService.stopRoute(session.sessionId);
  });

  it('3. Idempotency: Unchanged environmental snapshots do not spam reroutes or duplicate notifications', async () => {
    // Start session
    const calc = await routingEngine.calculateRoutes({
      origin: { latitude: 40.7128, longitude: -74.0060, name: 'Start' },
      destination: { latitude: 40.7450, longitude: -74.0200, name: 'End' },
      userId: 'commuter-test-user',
    });
    const session = await activeRouteService.startRoute(calc.recommendedRoute.routeId, 'commuter-test-user');
    const initialVersion = session.currentRouteVersion;
    const initialHistoryLength = notificationQueueService.getHistory('commuter-test-user').length;

    // Normal road risk state with no blockages
    const stableRoadRisk = [
      {
        roadId: 'road-market-st',
        roadName: 'Market Street',
        accessibility: 'OPEN',
        overallRisk: 10,
        traffic: { score: 10, state: 'SMOOTH', delayRatio: 1.0 },
        flood: { score: 5, state: 'NORMAL' },
        incident: { score: 0, activeIncidents: 0 },
        confidence: 0.9,
        freshness: 'LIVE',
        reason: 'Normal Flow',
        updatedAt: new Date().toISOString(),
      },
    ];

    // Run evaluation twice
    await activeRouteService.evaluateAllActiveRoutes(stableRoadRisk);
    await activeRouteService.evaluateAllActiveRoutes(stableRoadRisk);

    const finalSession = activeRouteService.findSession(session.sessionId);
    expect(finalSession?.currentRouteVersion).toBe(initialVersion); // Unchanged

    const finalHistoryLength = notificationQueueService.getHistory('commuter-test-user').length;
    expect(finalHistoryLength).toBe(initialHistoryLength); // No duplicate alerts

    activeRouteService.stopRoute(session.sessionId);
  });

  it('4. Multi-Subsystem Failure Resilience: Grok offline and SMS unconfigured does not disrupt route navigation', async () => {
    // Force Grok provider to throw or be unconfigured
    const originalAiProvider = grokDecisionService.getProvider();
    grokDecisionService.setProvider({
      name: 'broken-ai-provider',
      isHealthy: () => false,
      generateDecision: async () => {
        throw new Error('Grok API upstream timeout (504)');
      },
    });

    // Ensure SMS provider is in transient failure
    mockSmsProvider.setSimulationMode('TRANSIENT_FAILURE');

    // Calculate route - should succeed via deterministic router despite AI failure
    const calcRes = await fetch(`${baseUrl}/api/v1/routes/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin: { latitude: 40.7128, longitude: -74.0060, name: 'Origin' },
        destination: { latitude: 40.7450, longitude: -74.0200, name: 'Destination' },
      }),
    });
    expect(calcRes.status).toBe(200);
    const calcJson = await calcRes.json();
    expect(calcJson.success).toBe(true);
    const recRoute = calcJson.recommendedRoute || calcJson.data?.recommendedRoute;
    expect(recRoute).toBeDefined();

    // Start navigation session
    const startRes = await fetch(`${baseUrl}/api/v1/routes/${recRoute.routeId}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'commuter-test-user' }),
    });
    expect(startRes.status).toBe(200);

    // Restore providers
    grokDecisionService.setProvider(originalAiProvider);
    mockSmsProvider.setSimulationMode('SUCCESS');
  });

  it('5. Tenant Privacy & Object-Level Access Control: User A session protected against User B modification', async () => {
    // User A starts session
    const startRes = await fetch(`${baseUrl}/api/v1/routes/route-market-highland/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'user-alpha-001' }),
    });
    expect(startRes.status).toBe(200);
    const startJson = await startRes.json();
    const sessionId = startJson.data.sessionId;

    // User B attempts to stop User A's session
    const unauthorizedStop = await fetch(`${baseUrl}/api/v1/routes/${sessionId}/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'user-bravo-999' }), // unauthorized
    });
    expect(unauthorizedStop.status).toBe(403);
    const stopJson = await unauthorizedStop.json();
    expect(stopJson.error.code).toBe('FORBIDDEN');

    // User A successfully stops own session
    const authorizedStop = await fetch(`${baseUrl}/api/v1/routes/${sessionId}/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'user-alpha-001' }),
    });
    expect(authorizedStop.status).toBe(200);
  });

  it('6. User-Scoped WebSocket Streaming: Client receives private routing events when subscribed', async () => {
    const ws = new WebSocket(wsUrl);

    await new Promise<void>((resolve) => {
      ws.on('open', () => resolve());
    });

    const receivedMessages: any[] = [];
    ws.on('message', (msg: string) => {
      try {
        receivedMessages.push(JSON.parse(msg));
      } catch {
        // ignore
      }
    });

    // Subscribe to user topic
    ws.send(JSON.stringify({ action: 'subscribe', topics: ['user:ws-test-commuter', 'realtime:routing'] }));

    // Wait for subscription confirmation
    await new Promise((r) => setTimeout(r, 100));

    // Start route for ws-test-commuter
    await activeRouteService.startRoute('route-market-highland', 'ws-test-commuter');

    // Wait for broadcast propagation
    await new Promise((r) => setTimeout(r, 150));

    const routeCreatedMsg = receivedMessages.find((m) => m.eventType === 'ROUTE_CREATED');
    expect(routeCreatedMsg).toBeDefined();

    ws.close();
  });
});
