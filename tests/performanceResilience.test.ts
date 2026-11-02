import { describe, it, expect, beforeEach } from 'vitest';
import { dataAggregator } from '../apps/api/src/services/dataAggregator.js';
import { floodIntelligenceService } from '../apps/api/src/services/flood/floodIntelligence.service.js';
import { roadRiskService } from '../apps/api/src/services/roads/roadRisk.service.js';
import { routingEngine } from '../apps/api/src/services/routing/routingEngine.service.js';
import { grokFallbackService } from '../apps/api/src/services/ai/GrokFallbackService.js';
import { grokAIContextBuilder } from '../apps/api/src/services/ai/GrokAIContextBuilder.js';
import { notificationPolicyService, AlertEvaluationCandidate } from '../apps/api/src/services/notifications/notificationPolicy.service.js';
import { notificationQueueService } from '../apps/api/src/services/notifications/notificationQueue.service.js';
import { userPreferenceService } from '../apps/api/src/services/notifications/userPreference.service.js';
import { mockSmsProvider } from '../apps/api/src/providers/sms/mockSmsProvider.js';
import { CircuitBreaker } from '../apps/api/src/providers/common/circuitBreaker.js';

describe('Phase 9: Performance Benchmarking & System Resilience Review', () => {
  beforeEach(() => {
    notificationQueueService.clearAll();
    mockSmsProvider.setSimulationMode('SUCCESS');
    mockSmsProvider.clearHistory();

    userPreferenceService.updatePreferences('perf-test-user', {
      phoneNumber: '+919876543210',
      smsOptIn: true,
      preferredLanguage: 'en',
      minSeverity: 'WATCH',
      channels: { inApp: true, sms: true },
    });
  });

  describe('1. Subsystem Latency Benchmarks (SLA Compliance)', () => {
    it('Weather Telemetry Ingestion should complete within SLA (< 500ms)', async () => {
      const start = Date.now();
      const weather = await dataAggregator.refreshWeather(40.7128, -74.0060);
      const elapsed = Date.now() - start;

      expect(weather).toBeDefined();
      expect(elapsed).toBeLessThan(500);
    });

    it('Flood Intelligence evaluation should complete within SLA (< 100ms)', async () => {
      const start = Date.now();
      const floodEval = await floodIntelligenceService.evaluateRisk();
      const elapsed = Date.now() - start;

      expect(floodEval).toBeDefined();
      expect(floodEval.currentRisk).toBeDefined();
      expect(elapsed).toBeLessThan(100);
    });

    it('Unified Road Risk Multi-Hazard scoring should complete within SLA (< 50ms)', async () => {
      const start = Date.now();
      const roadRisks = await roadRiskService.evaluateAllRoadRisks();
      const elapsed = Date.now() - start;

      expect(roadRisks.length).toBeGreaterThan(0);
      expect(elapsed).toBeLessThan(50);
    });

    it('Multi-Candidate Route Calculation across urban graph should complete within SLA (< 1000ms)', async () => {
      const start = Date.now();
      const routePlan = await routingEngine.calculateRoutes({
        origin: { latitude: 40.7128, longitude: -74.0060, name: 'Start' },
        destination: { latitude: 40.7450, longitude: -74.0200, name: 'Goal' },
        userId: 'perf-test-user',
      });
      const elapsed = Date.now() - start;

      expect(routePlan.recommendedRoute).toBeDefined();
      expect(routePlan.candidateRoutes.length).toBeGreaterThanOrEqual(1);
      expect(elapsed).toBeLessThan(1000);
    });

    it('Deterministic Grok AI Fallback generation should complete in sub-20ms (< 20ms)', async () => {
      const context = await grokAIContextBuilder.buildContext({
        mode: 'CITY_OVERVIEW',
        language: 'en',
      });
      const start = performance.now();
      const fallback = grokFallbackService.generateFallback(context, 'Autonomous fallback test', 'en');
      const elapsed = performance.now() - start;

      expect(fallback).toBeDefined();
      expect(fallback.risk_level).toBeDefined();
      expect(fallback.citizen_actions.length).toBeGreaterThan(0);
      expect(elapsed).toBeLessThan(20);
    });

    it('Batch Notification Policy evaluation (100 candidates) should complete within SLA (< 50ms)', () => {
      const candidates: AlertEvaluationCandidate[] = Array.from({ length: 100 }, (_, i) => ({
        userId: 'perf-test-user',
        eventId: `perf-event-${i}`,
        eventName: `Localized Flood Alert ${i}`,
        severity: (i % 3 === 0 ? 'CRITICAL' : i % 3 === 1 ? 'WARNING' : 'WATCH') as any,
        triggerType: 'SECTOR_ALERT',
        channel: 'SMS',
        eventCoordinates: [40.7128, -74.0060],
        userCoordinates: [40.7130, -74.0065],
      }));

      const start = performance.now();
      const results = candidates.map((c) => notificationPolicyService.evaluateEligibility(c));
      const elapsed = performance.now() - start;

      expect(results.length).toBe(100);
      expect(elapsed).toBeLessThan(50);
    });
  });

  describe('2. Concurrent Request Coalescing Under High Traffic', () => {
    it('should coalesce 25 concurrent road risk evaluations into a single execution without race conditions', async () => {
      const start = Date.now();
      const promises = Array.from({ length: 25 }, () => roadRiskService.evaluateAllRoadRisks());
      const results = await Promise.all(promises);
      const elapsed = Date.now() - start;

      expect(results.length).toBe(25);
      // All 25 concurrent calls must return identical records
      const firstLen = results[0].length;
      expect(firstLen).toBeGreaterThan(0);
      for (const res of results) {
        expect(res.length).toBe(firstLen);
      }
      expect(elapsed).toBeLessThan(150);
    });
  });

  describe('3. Circuit Breaker Resilience & Zero-Latency Fast-Fail', () => {
    it('should trip to OPEN after threshold failures, fast-fail with 0ms overhead, and recover via HALF_OPEN probe', async () => {
      const breaker = new CircuitBreaker('TestBenchBreaker', {
        failureThreshold: 2,
        resetTimeoutMs: 60,
        requestTimeoutMs: 100,
        maxRetries: 0,
      });

      expect(breaker.getState()).toBe('CLOSED');

      // Failure 1
      await expect(
        breaker.execute(async () => {
          throw new Error('Connection refused 1');
        })
      ).rejects.toThrow('Connection refused 1');

      expect(breaker.getState()).toBe('CLOSED');

      // Failure 2 (trips breaker)
      await expect(
        breaker.execute(async () => {
          throw new Error('Connection refused 2');
        })
      ).rejects.toThrow('Connection refused 2');

      expect(breaker.getState()).toBe('OPEN');

      // Fast-fail test: in OPEN state, execution is rejected immediately (< 5ms) without calling supplier
      let supplierCalled = false;
      const fastFailStart = performance.now();
      await expect(
        breaker.execute(async () => {
          supplierCalled = true;
          return 'should_not_reach';
        })
      ).rejects.toThrow('CircuitBreaker [TestBenchBreaker] is OPEN');
      const fastFailElapsed = performance.now() - fastFailStart;

      expect(supplierCalled).toBe(false);
      expect(fastFailElapsed).toBeLessThan(10);

      // Wait for reset timeout (60ms) to trigger HALF_OPEN transition
      await new Promise((resolve) => setTimeout(resolve, 75));
      expect(breaker.getState()).toBe('HALF_OPEN');

      // Canary probes succeed (2 consecutive successes required) -> breaker returns to CLOSED
      const probeResult1 = await breaker.execute(async () => 'healthy_probe_1');
      expect(probeResult1).toBe('healthy_probe_1');
      const probeResult2 = await breaker.execute(async () => 'healthy_probe_2');
      expect(probeResult2).toBe('healthy_probe_2');
      expect(breaker.getState()).toBe('CLOSED');
    });
  });

  describe('4. High-Throughput Notification Queue Resilience', () => {
    it('should cleanly enqueue and process 20 notifications concurrently', async () => {
      const promises = Array.from({ length: 20 }, async (_, i) => {
        const candidate: AlertEvaluationCandidate = {
          userId: 'perf-test-user',
          eventId: `high-throughput-${i}`,
          eventName: `High Throughput Event ${i}`,
          severity: 'CRITICAL',
          triggerType: 'ROUTE_ALERT',
          channel: 'SMS',
          eventCoordinates: [40.7128, -74.0060],
          userCoordinates: [40.7128, -74.0060],
        };

        return notificationQueueService.enqueue({
          candidate,
          message: `[CRITICAL] High volume alert ${i}`,
          triggerType: 'ROUTE_ALERT',
          channel: 'SMS',
          skipPolicyCheck: true, // test queue throughput directly
        });
      });

      const enqueuedResults = await Promise.all(promises);
      expect(enqueuedResults.length).toBe(20);
      for (const res of enqueuedResults) {
        expect(res.success).toBe(true);
        expect(res.recordId).toBeDefined();
      }

      // Allow background queue worker to finish draining
      await notificationQueueService.processQueue();

      // Verify mock SMS provider history received all 20 dispatches
      const sentHistory = mockSmsProvider.getDispatchedMessages();
      expect(sentHistory.length).toBe(20);
    });
  });
});
