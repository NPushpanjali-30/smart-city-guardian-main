import { describe, it, expect, beforeEach } from 'vitest';
import {
  MockSmsProvider,
  mockSmsProvider,
} from '../apps/api/src/providers/sms/mockSmsProvider.js';
import { TwilioSmsAdapter } from '../apps/api/src/providers/sms/twilioSmsAdapter.js';
import { Fast2SmsAdapter } from '../apps/api/src/providers/sms/fast2SmsAdapter.js';
import { GenericHttpSmsAdapter } from '../apps/api/src/providers/sms/genericHttpSmsAdapter.js';
import { TextBeeSmsAdapter } from '../apps/api/src/providers/sms/textBeeSmsAdapter.js';
import { calculateSmsSegments } from '@smartcity/shared';

describe('Phase 7: SMS Provider Abstraction & Adapters', () => {
  let provider: MockSmsProvider;

  beforeEach(() => {
    provider = new MockSmsProvider('SUCCESS');
    provider.clearHistory();
  });

  describe('MockSmsProvider', () => {
    it('should implement ISmsProvider contract properties', () => {
      expect(provider.name).toBe('mock-sms-provider');
      expect(provider.isLive).toBe(false);
      expect(provider.isAvailable()).toBe(true);
    });

    it('should successfully deliver SMS in SUCCESS mode with deterministic messageId', async () => {
      const result = await provider.sendSms({
        to: '+919876543210',
        message: 'SMARTCITY WARNING: Flood hazard 1.2km away near Bay Basin. Avoid low underpasses.',
        priority: 'HIGH',
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('DELIVERED');
      expect(result.provider).toBe('mock-sms-provider');
      expect(result.messageId).toMatch(/^SM_mock_\d+_\d+$/);
      expect(result.segmentCount).toBe(1);
      expect(result.encoding).toBe('GSM-7');

      // Verify delivery status query
      const queriedStatus = await provider.getDeliveryStatus(result.messageId);
      expect(queriedStatus).toBe('DELIVERED');
    });

    it('should simulate transient network failure in TRANSIENT_FAILURE mode', async () => {
      provider.setSimulationMode('TRANSIENT_FAILURE');
      expect(provider.getSimulationMode()).toBe('TRANSIENT_FAILURE');

      const result = await provider.sendSms({
        to: '+919876543210',
        message: 'Temporary advisory message',
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('FAILED');
      expect(result.error).toContain('timed out');

      const queriedStatus = await provider.getDeliveryStatus(result.messageId);
      expect(queriedStatus).toBe('FAILED');
    });

    it('should simulate permanent failure and report unavailable in PERMANENT_FAILURE mode', async () => {
      provider.setSimulationMode('PERMANENT_FAILURE');
      expect(provider.isAvailable()).toBe(false);

      const result = await provider.sendSms({
        to: '+919876543210',
        message: 'Invalid number message',
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('FAILED');
      expect(result.error).toContain('Invalid recipient address');
    });

    it('should simulate rate limiting in RATE_LIMITED mode', async () => {
      provider.setSimulationMode('RATE_LIMITED');

      const result = await provider.sendSms({
        to: '+919876543210',
        message: 'High volume message',
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('FAILED');
      expect(result.error).toContain('429 Too Many Requests');
    });

    it('should return UNKNOWN status for unrecorded message IDs', async () => {
      const status = await provider.getDeliveryStatus('SM_non_existent_9999');
      expect(status).toBe('UNKNOWN');
    });
  });

  describe('TwilioSmsAdapter Graceful Fallback', () => {
    it('should report unavailable and fail gracefully when credentials are not configured', async () => {
      const adapter = new TwilioSmsAdapter();
      // In test environment without TWILIO_* env vars, isAvailable() should be false
      expect(adapter.name).toBe('twilio-sms-adapter');
      expect(adapter.isLive).toBe(true);

      const result = await adapter.sendSms({
        to: '+919876543210',
        message: 'Test Twilio fallback message',
      });

      if (!adapter.isAvailable()) {
        expect(result.success).toBe(false);
        expect(result.status).toBe('FAILED');
        expect(result.error).toContain('TWILIO_NOT_CONFIGURED');
      }

      const status = await adapter.getDeliveryStatus('SM_test_123');
      expect(status).toBe('UNKNOWN');
    });
  });

  describe('Fast2SmsAdapter (Direct Indian Mobile Delivery)', () => {
    it('should report unavailable when API key is not provided', async () => {
      const adapter = new Fast2SmsAdapter('');
      expect(adapter.name).toBe('fast2sms-adapter');
      expect(adapter.isLive).toBe(true);
      expect(adapter.isAvailable()).toBe(false);

      const result = await adapter.sendSms({
        to: '+919876543210',
        message: 'Test Fast2SMS message',
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('FAILED');
      expect(result.error).toContain('FAST2SMS_NOT_CONFIGURED');
    });

    it('should report available once API key is provided', () => {
      const adapter = new Fast2SmsAdapter('test_api_key_123');
      expect(adapter.isAvailable()).toBe(true);
      adapter.setApiKey('');
      expect(adapter.isAvailable()).toBe(false);
      adapter.setApiKey('new_key_456');
      expect(adapter.isAvailable()).toBe(true);
    });

    it('should reject invalid phone numbers that do not resolve to 10-digit Indian mobile', async () => {
      const adapter = new Fast2SmsAdapter('dummy_key');
      const result = await adapter.sendSms({
        to: '12345', // too short
        message: 'Invalid number test',
      });
      expect(result.success).toBe(false);
      expect(result.status).toBe('FAILED');
      expect(result.error).toContain('INVALID_PHONE_NUMBER');
    });
  });

  describe('GenericHttpSmsAdapter (Custom Webhook / REST Gateway)', () => {
    it('should report unavailable when endpoint URL is not provided', async () => {
      const adapter = new GenericHttpSmsAdapter();
      expect(adapter.name).toBe('http-gateway-adapter');
      expect(adapter.isLive).toBe(true);
      expect(adapter.isAvailable()).toBe(false);

      const result = await adapter.sendSms({
        to: '+919876543210',
        message: 'Test generic webhook message',
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('FAILED');
      expect(result.error).toContain('GATEWAY_NOT_CONFIGURED');
    });

    it('should report available once endpoint URL is configured', () => {
      const adapter = new GenericHttpSmsAdapter({ endpointUrl: 'https://api.telecom.local/sms/send' });
      expect(adapter.isAvailable()).toBe(true);
    });
  });

  describe('TextBeeSmsAdapter (TextBee Android / Cloud SMS Gateway)', () => {
    it('should implement ISmsProvider contract properties', () => {
      const adapter = new TextBeeSmsAdapter({ apiKey: 'test_tb_key', testMode: true });
      expect(adapter.name).toBe('textbee-adapter');
      expect(adapter.isLive).toBe(false); // in test mode
      expect(adapter.isAvailable()).toBe(true);
    });

    it('should normalize Indian phone numbers to E.164 (+91)', () => {
      const adapter = new TextBeeSmsAdapter({ testMode: true });
      expect(adapter.normalizeRecipient('9876543210')).toBe('+919876543210');
      expect(adapter.normalizeRecipient('+919876543210')).toBe('+919876543210');
      expect(adapter.normalizeRecipient('09876543210')).toBe('+919876543210');
      expect(adapter.normalizeRecipient('919876543210')).toBe('+919876543210');
    });

    it('should reject invalid phone numbers that cannot resolve to valid E.164', async () => {
      const adapter = new TextBeeSmsAdapter({ testMode: true });
      const result = await adapter.sendSms({
        to: '123',
        message: 'Disaster Alert Test',
      });
      expect(result.success).toBe(false);
      expect(result.status).toBe('FAILED');
      expect(result.error).toContain('INVALID_PHONE_NUMBER');
    });

    it('should safely simulate delivery in testMode without calling live cellular gateway', async () => {
      const adapter = new TextBeeSmsAdapter({
        apiKey: 'textbee_test_key_abc123',
        deviceId: 'device_001',
        testMode: true,
      });

      const result = await adapter.sendSms({
        to: '+919876543210',
        message: '🚨 CRITICAL FLOOD ALERT: Musi river discharge surge near Amberpet. Seek high ground.',
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('DELIVERED');
      expect(result.provider).toBe('textbee-adapter-test-mode');
      expect(result.messageId).toMatch(/^tb_sim_/);
      expect(result.segmentCount).toBe(2); // UCS-2 due to emoji
      expect(result.encoding).toBe('UCS-2');

      // Verify getDeliveryStatus
      const status = await adapter.getDeliveryStatus(result.messageId);
      expect(status).toBe('DELIVERED');
    });
  });
});

