import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'http';
import { createApp } from '../apps/api/src/app.js';
import {
  notificationPolicyService,
} from '../apps/api/src/services/notifications/notificationPolicy.service.js';
import {
  notificationQueueService,
} from '../apps/api/src/services/notifications/notificationQueue.service.js';
import {
  userPreferenceService,
} from '../apps/api/src/services/notifications/userPreference.service.js';
import {
  mockSmsProvider,
} from '../apps/api/src/providers/sms/mockSmsProvider.js';
import {
  calculateSmsSegments,
  formatLocalizedAlert,
} from '@smartcity/shared';

describe('Phase 7: SMS Notifications & Multilingual Citizen Alert Subsystem', () => {
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

  beforeEach(() => {
    notificationQueueService.clearAll();
    mockSmsProvider.setSimulationMode('SUCCESS');
    mockSmsProvider.clearHistory();
  });

  describe('1. Phone Number Validation & Masking Privacy', () => {
    it('should validate E.164 phone numbers accurately', () => {
      expect(userPreferenceService.validatePhoneNumber('+919876543210')).toBe(true);
      expect(userPreferenceService.validatePhoneNumber('+14155552671')).toBe(true);
      expect(userPreferenceService.validatePhoneNumber('9876543210')).toBe(false); // missing +
      expect(userPreferenceService.validatePhoneNumber('+012345')).toBe(false); // invalid starting 0
      expect(userPreferenceService.validatePhoneNumber('')).toBe(false);
    });

    it('should mask phone numbers for citizen privacy without leaking full identity', () => {
      expect(userPreferenceService.maskPhoneNumber('+919876543210')).toBe('+91 98*** ***10');
      expect(userPreferenceService.maskPhoneNumber('+14155552671')).toBe('+14 15*** ***71');
      expect(userPreferenceService.maskPhoneNumber('+9112')).toBe('****');
    });

    it('should retrieve and update user notification preferences safely', () => {
      const initial = userPreferenceService.getPreferences('demo-user-1');
      expect(initial.smsOptIn).toBe(true);
      expect(initial.phoneNumberMasked).toBe('+91 98*** ***10');

      const updated = userPreferenceService.updatePreferences('demo-user-1', {
        minSeverity: 'CRITICAL',
        preferredLanguage: 'kn',
      });

      expect(updated.minSeverity).toBe('CRITICAL');
      expect(updated.preferredLanguage).toBe('kn');

      // Revert for subsequent tests
      userPreferenceService.updatePreferences('demo-user-1', {
        minSeverity: 'WARNING',
        preferredLanguage: 'en',
      });
    });

    it('should normalize 10-digit Indian numbers and +91 formatted numbers to E.164 +919876543210', () => {
      expect(userPreferenceService.normalizePhoneNumber('9876543210')).toBe('+919876543210');
      expect(userPreferenceService.normalizePhoneNumber('+919876543210')).toBe('+919876543210');
      expect(userPreferenceService.normalizePhoneNumber('+91 98765 43210')).toBe('+919876543210');
      expect(userPreferenceService.normalizePhoneNumber('+91-9876543210')).toBe('+919876543210');
      expect(userPreferenceService.normalizePhoneNumber('919876543210')).toBe('+919876543210');
      expect(userPreferenceService.normalizePhoneNumber('09876543210')).toBe('+919876543210');
      expect(userPreferenceService.validatePhoneNumber(userPreferenceService.normalizePhoneNumber('9876543210'))).toBe(true);
      expect(userPreferenceService.validatePhoneNumber(userPreferenceService.normalizePhoneNumber('+919876543210'))).toBe(true);
    });
  });

  describe('2. Notification Policy Engine & Rules', () => {
    it('should reject alerts for NORMAL severity as no citizen emergency exists', () => {
      const evaluation = notificationPolicyService.evaluateEligibility({
        userId: 'demo-user-1',
        eventId: 'event-normal-1',
        eventName: 'Clear Basin',
        severity: 'NORMAL',
        triggerType: 'LOCATION_ALERT',
        channel: 'SMS',
        eventCoordinates: [40.715, -74.01],
        userCoordinates: [40.715, -74.01],
      });

      expect(evaluation.eligible).toBe(false);
      expect(evaluation.rejectionCode).toBe('SEVERITY_NORMAL');
    });

    it('should reject stale hazard data exceeding freshness limit', () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const evaluation = notificationPolicyService.evaluateEligibility({
        userId: 'demo-user-1',
        eventId: 'event-stale-1',
        eventName: 'Old Flood',
        severity: 'WARNING',
        triggerType: 'LOCATION_ALERT',
        channel: 'SMS',
        eventCoordinates: [40.715, -74.01],
        userCoordinates: [40.715, -74.01],
        eventUpdatedAt: oneHourAgo,
      });

      expect(evaluation.eligible).toBe(false);
      expect(evaluation.rejectionCode).toBe('STALE_DATA');
    });

    it('should reject candidates if user opted out of SMS', () => {
      userPreferenceService.updatePreferences('opted-out-user', {
        smsOptIn: false,
        phoneNumber: '+919999999999',
      });

      const evaluation = notificationPolicyService.evaluateEligibility({
        userId: 'opted-out-user',
        eventId: 'event-optout-1',
        eventName: 'Bay Basin',
        severity: 'CRITICAL',
        triggerType: 'LOCATION_ALERT',
        channel: 'SMS',
        eventCoordinates: [40.715, -74.01],
        userCoordinates: [40.715, -74.01],
      });

      expect(evaluation.eligible).toBe(false);
      expect(evaluation.rejectionCode).toBe('OPT_OUT');
    });

    it('should reject candidates if alert severity is below user threshold', () => {
      // User minSeverity is WARNING; event is WATCH
      const evaluation = notificationPolicyService.evaluateEligibility({
        userId: 'demo-user-1',
        eventId: 'event-below-threshold',
        eventName: 'Minor Puddle',
        severity: 'WATCH',
        triggerType: 'LOCATION_ALERT',
        channel: 'SMS',
        eventCoordinates: [40.715, -74.01],
        userCoordinates: [40.715, -74.01],
      });

      expect(evaluation.eligible).toBe(false);
      expect(evaluation.rejectionCode).toBe('SEVERITY_BELOW_THRESHOLD');
    });

    it('should approve events within 10 km radius of user location, destination, or route', () => {
      // Near user coords (~0.5 km)
      const locationEval = notificationPolicyService.evaluateEligibility({
        userId: 'demo-user-1',
        eventId: 'event-loc-1',
        eventName: 'Bay Lowlands',
        severity: 'WARNING',
        triggerType: 'LOCATION_ALERT',
        channel: 'SMS',
        eventCoordinates: [40.715, -74.01],
        userCoordinates: [40.718, -74.008],
      });
      expect(locationEval.eligible).toBe(true);
      expect(locationEval.matchedRadiusType).toBe('CURRENT_LOCATION');
      expect(locationEval.distanceKm).toBeLessThan(10);

      // Hazard 25 km away
      const farEval = notificationPolicyService.evaluateEligibility({
        userId: 'demo-user-1',
        eventId: 'event-far-1',
        eventName: 'Distant Basin',
        severity: 'WARNING',
        triggerType: 'LOCATION_ALERT',
        channel: 'SMS',
        eventCoordinates: [40.95, -74.01],
        userCoordinates: [40.718, -74.008],
      });
      expect(farEval.eligible).toBe(false);
      expect(farEval.rejectionCode).toBe('BEYOND_ALERT_RADIUS');
    });

    it('should suppress duplicate alerts within 60-minute cooldown', () => {
      const candidate = {
        userId: 'demo-user-1',
        eventId: 'event-repeat-1',
        eventName: 'Bay Lowlands',
        severity: 'WARNING' as const,
        triggerType: 'LOCATION_ALERT' as const,
        channel: 'SMS' as const,
        eventCoordinates: [40.715, -74.01] as [number, number],
        userCoordinates: [40.718, -74.008] as [number, number],
      };

      const first = notificationPolicyService.evaluateEligibility(candidate);
      expect(first.eligible).toBe(true);

      // Repeat identical severity immediately
      const second = notificationPolicyService.evaluateEligibility(candidate);
      expect(second.eligible).toBe(false);
      expect(second.rejectionCode).toBe('SUPPRESSED_COOLDOWN');
      expect(second.deduplicated).toBe(true);
    });

    it('should BYPASS cooldown immediately when severity escalates', () => {
      userPreferenceService.updatePreferences('demo-user-escalation', {
        phoneNumber: '+919876543299',
        smsOptIn: true,
        channels: { inApp: true, sms: true },
      });

      const candidateWarning = {
        userId: 'demo-user-escalation',
        eventId: 'event-escalation-1',
        eventName: 'Central River',
        severity: 'WARNING' as const,
        triggerType: 'LOCATION_ALERT' as const,
        channel: 'SMS' as const,
        eventCoordinates: [40.715, -74.01] as [number, number],
        userCoordinates: [40.718, -74.008] as [number, number],
      };

      const first = notificationPolicyService.evaluateEligibility(candidateWarning);
      expect(first.eligible).toBe(true);

      // Escalate to CRITICAL within seconds
      const candidateCritical = {
        ...candidateWarning,
        severity: 'CRITICAL' as const,
      };

      const second = notificationPolicyService.evaluateEligibility(candidateCritical);
      expect(second.eligible).toBe(true);
      expect(second.bypassCooldown).toBe(true);
    });
  });

  describe('3. Unicode Character & SMS Segment Calculator', () => {
    it('should accurately calculate GSM-7 single segment up to 160 characters', () => {
      const text = 'SMARTCITY WARNING: Flood hazard 1.2km away near Bay Basin. Avoid low underpasses.';
      const analysis = calculateSmsSegments(text);

      expect(analysis.encoding).toBe('GSM-7');
      expect(analysis.characterCount).toBe(text.length);
      expect(analysis.segmentCount).toBe(1);
      expect(analysis.maxCharsPerSegment).toBe(160);
      expect(analysis.remainingInCurrentSegment).toBe(160 - text.length);
    });

    it('should accurately calculate GSM-7 concatenated segments with 153 chars/segment', () => {
      // 180 characters GSM-7
      const text = 'SMARTCITY CRITICAL ALERT: Prolonged intense rain has triggered severe flash flooding across major urban corridors. All drivers should detour immediately and seek high elevation zones now.';
      const analysis = calculateSmsSegments(text);

      expect(analysis.encoding).toBe('GSM-7');
      expect(analysis.characterCount).toBeGreaterThan(160);
      expect(analysis.segmentCount).toBe(2);
    });

    it('should detect Unicode Hindi (Devanagari) and apply UCS-2 limits (70 base / 67 concat)', () => {
      const hindiShort = 'स्मार्टसिटी चेतावनी: आपके क्षेत्र में जलभराव की संभावना है।';
      const analysis = calculateSmsSegments(hindiShort);

      expect(analysis.encoding).toBe('UCS-2');
      expect(analysis.segmentCount).toBe(1);
      expect(analysis.maxCharsPerSegment).toBe(70);

      // Long Hindi string > 70 characters
      const hindiLong = 'स्मार्टसिटी चेतावनी: बे बेसिन के पास 1.2 किमी दूर बाढ़ का खतरा है। निचले अंडरपास से बचें और ऊंचे मार्गों का उपयोग करें। सुरक्षा सर्वोपरि है।';
      const longAnalysis = calculateSmsSegments(hindiLong);

      expect(longAnalysis.encoding).toBe('UCS-2');
      expect(longAnalysis.segmentCount).toBeGreaterThanOrEqual(2);
    });

    it('should detect Unicode Kannada and apply UCS-2 limits', () => {
      const kannadaText = 'ಸ್ಮಾರ್ಟ್‌ಸಿಟಿ ಎಚ್ಚರಿಕೆ: ಬೇ ಬೇಸಿನ್ ಬಳಿ 1.2 ಕಿಮೀ ದೂರದಲ್ಲಿ ಪ್ರವಾಹದ ಅಪಾಯವಿದೆ. ತಗ್ಗು ಪ್ರದೇಶಗಳಿಂದ ದೂರವಿರಿ.';
      const analysis = calculateSmsSegments(kannadaText);

      expect(analysis.encoding).toBe('UCS-2');
      expect(analysis.maxCharsPerSegment).toBe(70);
    });

    it('should format trilingual ROUTE_ALERT templates correctly across en, hi, and kn', () => {
      const enAlert = formatLocalizedAlert({
        template: 'ROUTE_ALERT',
        language: 'en',
        severity: 'WARNING',
        eventName: 'Bay Boulevard',
        routeDetourName: 'Highland Overpass',
        travelTimeDeltaMin: 12,
      });
      expect(enAlert.smsSummary).toContain('Highland Overpass');
      expect(enAlert.smsSummary).toContain('12');

      const hiAlert = formatLocalizedAlert({
        template: 'ROUTE_ALERT',
        language: 'hi',
        severity: 'CRITICAL',
        eventName: 'Bay Boulevard',
        routeDetourName: 'Highland Overpass',
        travelTimeDeltaMin: 12,
      });
      expect(hiAlert.smsSummary).toContain('Highland Overpass');

      const knAlert = formatLocalizedAlert({
        template: 'ROUTE_ALERT',
        language: 'kn',
        severity: 'WARNING',
        eventName: 'Bay Boulevard',
        routeDetourName: 'Highland Overpass',
        travelTimeDeltaMin: 8,
      });
      expect(knAlert.smsSummary).toContain('Highland Overpass');
      expect(knAlert.smsSummary).toContain('8');
    });
  });

  describe('4. Asynchronous Queue & Exponential Backoff Retries', () => {
    it('should enqueue and immediately deliver notification in default SUCCESS mode', async () => {
      const result = await notificationQueueService.enqueue({
        candidate: {
          userId: 'demo-user-1',
          eventId: 'event-queue-1',
          eventName: 'Bay Lowlands',
          severity: 'CRITICAL',
          triggerType: 'LOCATION_ALERT',
          channel: 'SMS',
          eventCoordinates: [40.715, -74.01],
          userCoordinates: [40.718, -74.008],
        },
        message: 'SMARTCITY CRITICAL: Flash flood near Bay Basin. Seek high ground.',
        triggerType: 'LOCATION_ALERT',
      });

      expect(result.success).toBe(true);
      expect(result.recordId).toBeDefined();

      // Check record in queue service history
      const record = notificationQueueService.getRecord(result.recordId);
      expect(record).toBeDefined();
      expect(record?.status).toBe('DELIVERED');
      expect(record?.recipientPhoneMasked).toBe('+91 98*** ***10');
      expect(record?.retryCount).toBe(0);
    });

    it('should immediately process queue upon enqueue with targetPhoneNumber and mark delivery record as DELIVERED', async () => {
      const result = await notificationQueueService.enqueue({
        candidate: {
          userId: 'demo-user-1',
          eventId: 'event-immediate-process-1',
          eventName: 'Indiranagar Central',
          severity: 'CRITICAL',
          triggerType: 'LOCATION_ALERT',
          channel: 'SMS',
          eventCoordinates: [12.9716, 77.5946],
          userCoordinates: [12.9716, 77.5946],
          targetPhoneNumber: '9876543210',
          bypassCooldown: true,
        },
        message: 'CRITICAL FLOOD ALERT: Rapid inundation at Indiranagar 100ft Road.',
        triggerType: 'LOCATION_ALERT',
        targetPhoneNumber: '9876543210',
        bypassCooldown: true,
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('DELIVERED');
      expect(result.recordId).toBeDefined();
      expect(result.recordId.startsWith('notif_')).toBe(true);

      const record = notificationQueueService.getRecord(result.recordId);
      expect(record).toBeDefined();
      expect(record?.status).toBe('DELIVERED');
      expect(record?.deliveredAt).toBeDefined();
      expect(record?.recipientPhoneMasked).toBe('+91 98*** ***10');
    });

    it('should record suppression in history when policy rejects duplicate', async () => {
      const candidate = {
        userId: 'demo-user-1',
        eventId: 'event-suppress-queue',
        eventName: 'Bay Lowlands',
        severity: 'WARNING' as const,
        triggerType: 'LOCATION_ALERT' as const,
        channel: 'SMS' as const,
        eventCoordinates: [40.715, -74.01] as [number, number],
        userCoordinates: [40.718, -74.008] as [number, number],
      };

      // 1st dispatch -> success
      const first = await notificationQueueService.enqueue({
        candidate,
        message: 'Initial Warning',
        triggerType: 'LOCATION_ALERT',
      });
      expect(first.success).toBe(true);

      // 2nd dispatch -> suppressed
      const second = await notificationQueueService.enqueue({
        candidate,
        message: 'Duplicate Warning',
        triggerType: 'LOCATION_ALERT',
      });
      expect(second.success).toBe(false);
      expect(second.status).toBe('SUPPRESSED');

      const health = notificationQueueService.getHealthMetrics();
      expect(health.suppressedCount).toBeGreaterThanOrEqual(1);
    });

    it('should retry transient failures and allow administrative manual retry', async () => {
      mockSmsProvider.setSimulationMode('PERMANENT_FAILURE');

      const failedResult = await notificationQueueService.enqueue({
        candidate: {
          userId: 'demo-user-1',
          eventId: 'event-perm-fail',
          eventName: 'Bay Lowlands',
          severity: 'CRITICAL',
          triggerType: 'LOCATION_ALERT',
          channel: 'SMS',
          eventCoordinates: [40.715, -74.01],
          userCoordinates: [40.718, -74.008],
        },
        message: 'Fail test message',
        triggerType: 'LOCATION_ALERT',
        skipPolicyCheck: true,
      });

      const failedRecord = notificationQueueService.getRecord(failedResult.recordId);
      expect(failedRecord?.status).toBe('FAILED');

      // Now restore provider to SUCCESS mode and trigger manual retry
      mockSmsProvider.setSimulationMode('SUCCESS');
      const retryResult = await notificationQueueService.retryNotification(failedResult.recordId);
      expect(retryResult.success).toBe(true);

      // Verify updated record status after retry
      const updatedRecord = notificationQueueService.getRecord(failedResult.recordId);
      expect(updatedRecord?.status).toBe('DELIVERED');
    });
  });

  describe('5. REST API Integration Endpoints', () => {
    it('GET /api/v1/alerts/preferences should return user notification preferences', async () => {
      const res = await fetch(`${baseUrl}/api/v1/alerts/preferences?userId=demo-user-1`);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('ok');
      expect(json.data.userId).toBe('demo-user-1');
      expect(json.data.phoneNumberMasked).toBe('+91 98*** ***10');
    });

    it('PUT /api/v1/alerts/preferences should update preferences with validation', async () => {
      const updateRes = await fetch(`${baseUrl}/api/v1/alerts/preferences`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'demo-user-1',
          preferredLanguage: 'hi',
          minSeverity: 'WARNING',
        }),
      });
      expect(updateRes.status).toBe(200);
      const json = await updateRes.json();
      expect(json.status).toBe('ok');
      expect(json.data.preferredLanguage).toBe('hi');

      // Reset back to English
      await fetch(`${baseUrl}/api/v1/alerts/preferences`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'demo-user-1',
          preferredLanguage: 'en',
        }),
      });
    });

    it('POST /api/v1/alerts/calculate-segments should analyze SMS character encoding', async () => {
      const res = await fetch(`${baseUrl}/api/v1/alerts/calculate-segments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Bengaluru Smart City Alert: Severe waterlogging on Ring Road.',
        }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('ok');
      expect(json.data.encoding).toBe('GSM-7');
      expect(json.data.segmentCount).toBe(1);
    });

    it('POST /api/v1/alerts/dispatch should dispatch localized alert and track history', async () => {
      const res = await fetch(`${baseUrl}/api/v1/alerts/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'demo-user-1',
          eventId: 'api-test-event-01',
          eventName: 'East River Concourse',
          severity: 'CRITICAL',
          triggerType: 'ROUTE_ALERT',
          channel: 'SMS',
          language: 'en',
          routeDetourName: 'Highland Elevated Bypass',
          travelTimeDeltaMin: 15,
        }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.recordId).toBeDefined();

      // Check history endpoint
      const histRes = await fetch(`${baseUrl}/api/v1/alerts/history?userId=demo-user-1`);
      expect(histRes.status).toBe(200);
      const histJson = await histRes.json();
      expect(histJson.count).toBeGreaterThanOrEqual(1);
      const matching = histJson.data.find((r: any) => r.id === json.recordId);
      expect(matching).toBeDefined();
      expect(matching.message).toContain('Highland Elevated Bypass');
    });

    it('GET /api/v1/alerts/health & /api/v1/admin/notifications/health should report queue and provider status', async () => {
      const res = await fetch(`${baseUrl}/api/v1/alerts/health`);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('ok');
      expect(json.data.activeProvider).toBe('mock-sms-provider');
      expect(typeof json.data.deliverySuccessRatePercent).toBe('number');

      const adminRes = await fetch(`${baseUrl}/api/v1/admin/notifications/health`);
      expect(adminRes.status).toBe(200);
      const adminJson = await adminRes.json();
      expect(adminJson.success).toBe(true);
      expect(adminJson.data.activeProvider).toBe('mock-sms-provider');
    });

    it('POST /api/v1/alerts/provider/simulation-mode should update mock simulation mode', async () => {
      const res = await fetch(`${baseUrl}/api/v1/alerts/provider/simulation-mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'TRANSIENT_FAILURE' }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.mode).toBe('TRANSIENT_FAILURE');
      expect(mockSmsProvider.getSimulationMode()).toBe('TRANSIENT_FAILURE');
    });

    it('POST /api/v1/alerts/dispatch with explicit target phoneNumber and bypassCooldown should deliver without suppression', async () => {
      mockSmsProvider.setSimulationMode('SUCCESS');

      // Dispatch 1 to explicit target +919876543210
      const res1 = await fetch(`${baseUrl}/api/v1/alerts/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'demo-user-1',
          phoneNumber: '+919876543210',
          bypassCooldown: true,
          eventName: 'Bay Basin Lowlands',
          severity: 'CRITICAL',
          triggerType: 'LOCATION_ALERT',
          channel: 'SMS',
          language: 'en',
          customMessage: 'TEST LIVE ALERT: Water rising rapidly near Bay Basin.',
        }),
      });

      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.success).toBe(true);
      expect(json1.record.recipientPhoneMasked).toBe('+91 98*** ***10');
      expect(json1.record.status).toBe('DELIVERED');

      // Dispatch 2 immediately with same key: bypassCooldown ensures it is NOT suppressed
      const res2 = await fetch(`${baseUrl}/api/v1/alerts/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'demo-user-1',
          phoneNumber: '+919876543210',
          bypassCooldown: true,
          eventName: 'Bay Basin Lowlands',
          severity: 'CRITICAL',
          triggerType: 'LOCATION_ALERT',
          channel: 'SMS',
          language: 'en',
          customMessage: 'TEST LIVE ALERT: Water rising rapidly near Bay Basin.',
        }),
      });

      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.success).toBe(true);
      expect(json2.record.status).toBe('DELIVERED');
    });

    it('POST /api/v1/alerts/dispatch with phoneNumber: "+919876543210" and bypassCooldown: true returns HTTP 200 with status: "DELIVERED" and valid recordId', async () => {
      mockSmsProvider.setSimulationMode('SUCCESS');

      const res = await fetch(`${baseUrl}/api/v1/alerts/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: '+919876543210',
          bypassCooldown: true,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.status).toBe('DELIVERED');
      expect(data.recordId).toBeDefined();
      expect(typeof data.recordId).toBe('string');
      expect(data.recordId.startsWith('notif_')).toBe(true);
      expect(data.record).toBeDefined();
      expect(data.record.status).toBe('DELIVERED');
      expect(data.record.recipientPhoneMasked).toBe('+91 98*** ***10');
    });

    it('POST /api/v1/alerts/dispatch with 10 digits phoneNumber "9876543210" normalizes to E.164 "+919876543210" and delivers', async () => {
      mockSmsProvider.setSimulationMode('SUCCESS');

      const res = await fetch(`${baseUrl}/api/v1/alerts/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: '9876543210',
          bypassCooldown: true,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.status).toBe('DELIVERED');
      expect(data.recordId).toBeDefined();
      expect(data.record.recipientPhoneMasked).toBe('+91 98*** ***10');

      // Verify the dispatched mock SMS has normalized E.164 destination
      const dispatched = mockSmsProvider.getDispatchedMessages();
      const last = dispatched[dispatched.length - 1];
      expect(last).toBeDefined();
      expect(last.to).toBe('+919876543210');
    });

    it('POST /api/v1/alerts/provider/configure and /api/v1/alerts/provider/test should support dynamic gateway switching', async () => {
      // Test configuring Fast2SMS
      const configRes = await fetch(`${baseUrl}/api/v1/alerts/provider/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerType: 'fast2sms',
          fast2sms: { apiKey: 'test_fast2sms_key' },
        }),
      });

      expect(configRes.status).toBe(200);
      const configJson = await configRes.json();
      expect(configJson.activeProvider).toBe('fast2sms-adapter');
      expect(configJson.isLive).toBe(true);

      // Revert to mock for clean state
      const revertRes = await fetch(`${baseUrl}/api/v1/alerts/provider/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerType: 'mock' }),
      });
      expect(revertRes.status).toBe(200);
      const revertJson = await revertRes.json();
      expect(revertJson.activeProvider).toBe('mock-sms-provider');

      // Test SMS endpoint
      const testRes = await fetch(`${baseUrl}/api/v1/alerts/provider/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: '+919876543210',
          message: 'Test Gateway Connection',
        }),
      });
      expect(testRes.status).toBe(200);
      const testJson = await testRes.json();
      expect(testJson.status).toBe('ok');
      expect(testJson.result.success).toBe(true);
    });
  });
});

