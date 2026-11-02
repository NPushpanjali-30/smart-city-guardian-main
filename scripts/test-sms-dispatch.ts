import http from 'http';
import { createApp } from '../apps/api/src/app.js';
import { notificationQueueService } from '../apps/api/src/services/notifications/notificationQueue.service.js';
import { userPreferenceService } from '../apps/api/src/services/notifications/userPreference.service.js';
import { mockSmsProvider } from '../apps/api/src/providers/sms/mockSmsProvider.js';
import { fast2SmsAdapter } from '../apps/api/src/providers/sms/fast2SmsAdapter.js';
import { calculateSmsSegments, formatLocalizedAlert } from '@smartcity/shared';

// Utility for frontend 10-digit extraction test
function extract10Digits(input?: string): string {
  if (!input) return '';
  let cleaned = input.replace(/\D/g, '');
  if (cleaned.startsWith('0091') && cleaned.length >= 14) {
    cleaned = cleaned.slice(4);
  } else if (cleaned.startsWith('91') && cleaned.length >= 12) {
    cleaned = cleaned.slice(2);
  } else if (cleaned.startsWith('0') && cleaned.length >= 11) {
    cleaned = cleaned.slice(1);
  }
  return cleaned.slice(0, 10);
}

interface TestRunResult {
  step: string;
  status: 'PASSED' | 'FAILED';
  details: Record<string, any>;
}

async function main() {
  console.log('================================================================================');
  console.log('     SMARTCITY GUARDIAN: LIVE SMS DISPATCH & GATEWAY TEST HARNESS               ');
  console.log('              Target Recipient Phone: 9876543210 (+919876543210)                ');
  console.log('================================================================================\n');

  const targetRaw = '9876543210';
  const results: TestRunResult[] = [];

  // Start API Server
  const app = createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`[INIT] Test HTTP Server running at ${baseUrl}`);

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Phone Normalization and Input Sanitization for 9876543210
    // -------------------------------------------------------------------------
    console.log('\n--- [TEST 1] Phone Normalization & Sanitization ---');
    const variations = [
      '9876543210',
      '+919876543210',
      '+91 98765-43210',
      '09876543210',
      '00919876543210',
      '+91 (987) 654-3210',
    ];

    let normSuccess = true;
    for (const v of variations) {
      const extracted = extract10Digits(v);
      const normalized = userPreferenceService.normalizePhoneNumber(v);
      const isValid = userPreferenceService.validatePhoneNumber(normalized);
      if (extracted !== targetRaw || normalized !== '+919876543210' || !isValid) {
        normSuccess = false;
        console.error(`  FAIL variation "${v}": extracted="${extracted}", normalized="${normalized}"`);
      } else {
        console.log(`  ✓ "${v}" -> 10-digits: "${extracted}" -> E.164: "${normalized}" (Valid: ${isValid})`);
      }
    }
    results.push({
      step: '1. Phone Normalization & Sanitization',
      status: normSuccess ? 'PASSED' : 'FAILED',
      details: { variationsTested: variations.length, target: '+919876543210' },
    });

    // -------------------------------------------------------------------------
    // TEST 2: Critical Flash Flood Alert (English GSM-7) via /alerts/dispatch
    // -------------------------------------------------------------------------
    console.log('\n--- [TEST 2] Dispatching English Critical Flood Alert to 9876543210 ---');
    mockSmsProvider.setSimulationMode('SUCCESS');

    const englishPayload = {
      userId: 'citizen-9876543210',
      phoneNumber: targetRaw,
      severity: 'CRITICAL',
      triggerType: 'LOCATION_ALERT',
      eventName: 'Silk Board Underpass Inundation',
      customMessage: 'SMARTCITY CRITICAL: Silk Board underpass flooded (45cm). Route closed. Avoid travel immediately.',
      bypassCooldown: true,
    };

    const res1 = await fetch(`${baseUrl}/api/v1/alerts/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(englishPayload),
    });

    const data1 = await res1.json();
    console.log(`  HTTP Response Status: ${res1.status}`);
    console.log(`  Dispatch Record ID: ${data1.recordId}`);
    console.log(`  Delivery Status: ${data1.status}`);
    console.log(`  Masked Recipient: ${data1.record?.recipientPhoneMasked}`);

    const pass1 = res1.status === 200 && data1.status === 'DELIVERED' && data1.record?.recipientPhoneMasked === '+91 98*** ***10';
    results.push({
      step: '2. English Critical Alert Dispatch',
      status: pass1 ? 'PASSED' : 'FAILED',
      details: { httpStatus: res1.status, recordId: data1.recordId, status: data1.status, maskedPhone: data1.record?.recipientPhoneMasked },
    });

    // -------------------------------------------------------------------------
    // TEST 3: Multilingual Emergency Alert (Hindi UCS-2) to 9876543210
    // -------------------------------------------------------------------------
    console.log('\n--- [TEST 3] Dispatching Hindi (UCS-2) Flood Warning to 9876543210 ---');
    const hindiMessage = 'स्मार्टसिटी चेतावनी: सिल्क बोर्ड में भारी जलभराव। वैकल्पिक मार्ग का उपयोग करें।';
    const hindiAnalysis = calculateSmsSegments(hindiMessage);
    console.log(`  Text Encoding: ${hindiAnalysis.encoding}, Segment Count: ${hindiAnalysis.segmentCount}`);

    const res2 = await fetch(`${baseUrl}/api/v1/alerts/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'citizen-9876543210',
        phoneNumber: `+91${targetRaw}`,
        severity: 'WARNING',
        triggerType: 'ROUTE_ALERT',
        eventName: 'Outer Ring Road Bellandur',
        customMessage: hindiMessage,
        bypassCooldown: true,
        language: 'hi',
      }),
    });

    const data2 = await res2.json();
    console.log(`  HTTP Response Status: ${res2.status}`);
    console.log(`  Dispatch Record ID: ${data2.recordId}`);
    console.log(`  Delivery Status: ${data2.status}`);

    const pass2 = res2.status === 200 && data2.status === 'DELIVERED' && hindiAnalysis.encoding === 'UCS-2';
    results.push({
      step: '3. Hindi Unicode Alert Dispatch',
      status: pass2 ? 'PASSED' : 'FAILED',
      details: { httpStatus: res2.status, encoding: hindiAnalysis.encoding, status: data2.status },
    });

    // -------------------------------------------------------------------------
    // TEST 4: Multilingual Emergency Alert (Kannada UCS-2) to 9876543210
    // -------------------------------------------------------------------------
    console.log('\n--- [TEST 4] Dispatching Kannada (UCS-2) Warning to 9876543210 ---');
    const kannadaMessage = 'ಸ್ಮಾರ್ಟ್‌ಸಿಟಿ ಎಚ್ಚರಿಕೆ: ಸಿಲ್ಕ್ ಬೋರ್ಡ್ ಬಳಿ ಪ್ರವಾಹದ ನೀರು ನಿಂತಿದೆ. ದಯವಿಟ್ಟು ಎಲಿವೇಟೆಡ್ ರಸ್ತೆ ಬಳಸಿ.';
    const kannadaAnalysis = calculateSmsSegments(kannadaMessage);
    console.log(`  Text Encoding: ${kannadaAnalysis.encoding}, Segment Count: ${kannadaAnalysis.segmentCount}`);

    const res3 = await fetch(`${baseUrl}/api/v1/alerts/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'citizen-9876543210',
        phoneNumber: targetRaw,
        severity: 'WARNING',
        triggerType: 'ROUTE_ALERT',
        eventName: 'Silk Board Junction',
        customMessage: kannadaMessage,
        bypassCooldown: true,
        language: 'kn',
      }),
    });

    const data3 = await res3.json();
    console.log(`  HTTP Response Status: ${res3.status}`);
    console.log(`  Dispatch Record ID: ${data3.recordId}`);
    console.log(`  Delivery Status: ${data3.status}`);

    const pass3 = res3.status === 200 && data3.status === 'DELIVERED';
    results.push({
      step: '4. Kannada Unicode Alert Dispatch',
      status: pass3 ? 'PASSED' : 'FAILED',
      details: { httpStatus: res3.status, encoding: kannadaAnalysis.encoding, status: data3.status },
    });

    // -------------------------------------------------------------------------
    // TEST 5: Direct Provider Test API (/alerts/provider/test) to 9876543210
    // -------------------------------------------------------------------------
    console.log('\n--- [TEST 5] Testing Direct Provider Test Endpoint ---');
    const res4 = await fetch(`${baseUrl}/api/v1/alerts/provider/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer mock_jwt_token_admin',
      },
      body: JSON.stringify({
        phoneNumber: targetRaw,
        message: 'Direct telecom gateway probe to +919876543210: Operational status VERIFIED.',
      }),
    });

    const data4 = await res4.json();
    console.log(`  HTTP Response Status: ${res4.status}`);
    console.log(`  Provider: ${data4.provider}`);
    console.log(`  Message Delivery Success: ${data4.result?.success}`);
    console.log(`  Message ID: ${data4.result?.messageId}`);

    const pass4 = res4.status === 200 && data4.result?.success === true;
    results.push({
      step: '5. Direct Provider Test API',
      status: pass4 ? 'PASSED' : 'FAILED',
      details: { httpStatus: res4.status, provider: data4.provider, messageId: data4.result?.messageId },
    });

    // -------------------------------------------------------------------------
    // TEST 6: Cooldown Policy Enforcement & Cooldown Bypass Verification
    // -------------------------------------------------------------------------
    console.log('\n--- [TEST 6] Testing Cooldown Enforcement vs Bypass for 9876543210 ---');
    userPreferenceService.updatePreferences('cooldown-test-user', {
      phoneNumber: `+91${targetRaw}`,
      smsOptIn: true,
      minSeverity: 'WATCH',
      channels: { inApp: true, sms: true },
    });

    // First dispatch without bypassCooldown (should succeed first time)
    const resCooldown1 = await fetch(`${baseUrl}/api/v1/alerts/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'cooldown-test-user',
        phoneNumber: targetRaw,
        severity: 'WATCH',
        triggerType: 'LOCATION_ALERT',
        eventName: 'Test Zone A',
        customMessage: 'WATCH ALERT: First advisory message.',
        bypassCooldown: false,
      }),
    });
    const dataCooldown1 = await resCooldown1.json();
    console.log(`  First non-bypass dispatch: status=${dataCooldown1.status}`);

    // Second dispatch immediately without bypass (should be suppressed by 60-min cooldown)
    const resCooldown2 = await fetch(`${baseUrl}/api/v1/alerts/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'cooldown-test-user',
        phoneNumber: targetRaw,
        severity: 'WATCH',
        triggerType: 'LOCATION_ALERT',
        eventName: 'Test Zone A',
        customMessage: 'WATCH ALERT: Duplicate advisory within 60 mins.',
        bypassCooldown: false,
      }),
    });
    const dataCooldown2 = await resCooldown2.json();
    console.log(`  Immediate duplicate non-bypass dispatch: status=${dataCooldown2.status} (Expected SUPPRESSED)`);

    // Third dispatch WITH bypassCooldown=true (should successfully deliver despite cooldown)
    const resCooldown3 = await fetch(`${baseUrl}/api/v1/alerts/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'cooldown-test-user',
        phoneNumber: targetRaw,
        severity: 'WATCH',
        triggerType: 'LOCATION_ALERT',
        eventName: 'Test Zone A',
        customMessage: 'WATCH ALERT: Priority emergency bypass message.',
        bypassCooldown: true,
      }),
    });
    const dataCooldown3 = await resCooldown3.json();
    console.log(`  Emergency bypass dispatch: status=${dataCooldown3.status} (Expected DELIVERED)`);

    const pass6 = dataCooldown1.status === 'DELIVERED' && dataCooldown2.status === 'SUPPRESSED' && dataCooldown3.status === 'DELIVERED';
    results.push({
      step: '6. Cooldown Policy & Bypass Verification',
      status: pass6 ? 'PASSED' : 'FAILED',
      details: {
        firstDispatch: dataCooldown1.status,
        duplicateSuppression: dataCooldown2.status,
        emergencyBypass: dataCooldown3.status,
      },
    });

    // -------------------------------------------------------------------------
    // TEST 7: Gateway Health Metrics & Telemetry
    // -------------------------------------------------------------------------
    console.log('\n--- [TEST 7] Verifying Notification Gateway Health Metrics ---');
    const resHealth = await fetch(`${baseUrl}/api/v1/alerts/health`);
    const healthData = await resHealth.json();
    const health = healthData.data || healthData;
    console.log(`  Total Dispatched: ${health.totalDispatched}`);
    console.log(`  Delivered Count: ${health.deliveredCount}`);
    console.log(`  Suppressed Count: ${health.suppressedCount}`);
    console.log(`  Delivery Success Rate: ${health.deliverySuccessRatePercent}%`);
    console.log(`  Active Provider: ${health.activeProvider}`);

    const pass7 = resHealth.status === 200 && health.deliveredCount > 0 && health.deliverySuccessRatePercent >= 80;
    results.push({
      step: '7. Gateway Health & Telemetry Audit',
      status: pass7 ? 'PASSED' : 'FAILED',
      details: health,
    });

    // -------------------------------------------------------------------------
    // TEST 8: Verify Dispatched Messages In-Flight Log for 9876543210
    // -------------------------------------------------------------------------
    console.log('\n--- [TEST 8] Dispatched Telecom Messages Audit for +919876543210 ---');
    const messages = mockSmsProvider.getDispatchedMessages();
    const targeted = messages.filter((m) => m.to === '+919876543210');
    console.log(`  Total mock messages sent: ${messages.length}`);
    console.log(`  Targeted to +919876543210: ${targeted.length}`);

    targeted.forEach((m, idx) => {
      console.log(`    [Msg #${idx + 1}] ID: ${m.messageId} | Status: ${m.status} | Encoding: ${m.encoding} (${m.segmentCount} seg)`);
      console.log(`              Content: "${m.message.slice(0, 60)}..."`);
    });

    const pass8 = targeted.length >= 4;
    results.push({
      step: '8. Dispatched Telecom Messages Audit',
      status: pass8 ? 'PASSED' : 'FAILED',
      details: { totalSentToTarget: targeted.length },
    });

  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    console.log('\n[CLEANUP] Test HTTP Server shutdown gracefully.');
  }

  // ---------------------------------------------------------------------------
  // Summary Table
  // ---------------------------------------------------------------------------
  console.log('\n================================================================================');
  console.log('                          LIVE SMS TEST RESULTS SUMMARY                          ');
  console.log('================================================================================');
  let allPass = true;
  for (const r of results) {
    const symbol = r.status === 'PASSED' ? '✅' : '❌';
    if (r.status !== 'PASSED') allPass = false;
    console.log(`  ${symbol} ${r.step.padEnd(45)} [${r.status}]`);
  }
  console.log('================================================================================');

  if (allPass) {
    console.log('\n🎉 ALL SMS FEATURE TESTS TO 9876543210 COMPLETED WITH 100% SUCCESS!\n');
    process.exit(0);
  } else {
    console.error('\n❌ SOME TESTS FAILED!\n');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[FATAL] Script error:', err);
  process.exit(1);
});
