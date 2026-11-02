import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'http';
import { createApp } from '../apps/api/src/app.js';
import { CarrierEmailSmsAdapter, KNOWN_CARRIER_DOMAINS } from '../apps/api/src/providers/sms/carrierEmailSmsAdapter.js';
import { notificationQueueService } from '../apps/api/src/services/notifications/notificationQueue.service.js';

describe('Carrier Email-to-SMS Gateway Suite', () => {
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
    notificationQueueService.configureGateway('mock');
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  beforeEach(() => {
    // Reset to mock provider
    notificationQueueService.configureGateway('mock');
  });

  describe('1. Phone Number Sanitization & Carrier Address Resolution', () => {
    const adapter = new CarrierEmailSmsAdapter({ carrierDomain: 'airtelmail.com' });

    it('should format +919876543210 to 9876543210@airtelmail.com', () => {
      const email = adapter.getGatewayEmailAddress('+919876543210');
      expect(email).toBe('9876543210@airtelmail.com');
    });

    it('should format 919876543210 to 9876543210@airtelmail.com', () => {
      const email = adapter.getGatewayEmailAddress('919876543210');
      expect(email).toBe('9876543210@airtelmail.com');
    });

    it('should format 09876543210 to 9876543210@airtelmail.com', () => {
      const email = adapter.getGatewayEmailAddress('09876543210');
      expect(email).toBe('9876543210@airtelmail.com');
    });

    it('should format plain 10-digit 9876543210 to 9876543210@airtelmail.com', () => {
      const email = adapter.getGatewayEmailAddress('9876543210');
      expect(email).toBe('9876543210@airtelmail.com');
    });

    it('should support dynamic carrier domains (Jio, Vi, BSNL, Verizon)', () => {
      expect(adapter.getGatewayEmailAddress('9876543210', 'jiosms.com')).toBe('9876543210@jiosms.com');
      expect(adapter.getGatewayEmailAddress('9876543210', 'vodafone.in')).toBe('9876543210@vodafone.in');
      expect(adapter.getGatewayEmailAddress('9876543210', 'bsnl.co.in')).toBe('9876543210@bsnl.co.in');
      expect(adapter.getGatewayEmailAddress('9876543210', 'vtext.com')).toBe('9876543210@vtext.com');
      expect(adapter.getGatewayEmailAddress('9876543210', 'txt.att.net')).toBe('9876543210@txt.att.net');
    });

    it('should include known carrier domains in KNOWN_CARRIER_DOMAINS registry', () => {
      expect(KNOWN_CARRIER_DOMAINS.airtel).toBe('airtelmail.com');
      expect(KNOWN_CARRIER_DOMAINS.jio).toBe('jiosms.com');
      expect(KNOWN_CARRIER_DOMAINS.vi).toBe('vodafone.in');
      expect(KNOWN_CARRIER_DOMAINS.bsnl).toBe('bsnl.co.in');
      expect(KNOWN_CARRIER_DOMAINS.verizon).toBe('vtext.com');
    });
  });

  describe('2. Message Transmission & Validation', () => {
    it('should successfully dispatch simulated carrier email SMS for 9876543210', async () => {
      const adapter = new CarrierEmailSmsAdapter({
        carrierDomain: 'airtelmail.com',
        isSimulated: true,
      });

      const result = await adapter.sendSms({
        to: '+919876543210',
        message: 'SMARTCITY CRITICAL: Flash flood warning at Silk Board underpass.',
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('DELIVERED');
      expect(result.provider).toBe('carrier-email-sms-adapter');
      expect(result.messageId).toContain('EMAIL_SMS_');
      expect(result.segmentCount).toBe(1);
      expect(result.encoding).toBe('GSM-7');
    });

    it('should reject invalid / malformed phone numbers', async () => {
      const adapter = new CarrierEmailSmsAdapter({ carrierDomain: 'airtelmail.com' });
      const result = await adapter.sendSms({
        to: '123',
        message: 'Test message',
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('FAILED');
      expect(result.error).toContain('INVALID_PHONE_NUMBER');
    });
  });

  describe('3. Queue Service & API Integration', () => {
    it('should switch provider to carrier_email via NotificationQueueService', () => {
      const provider = notificationQueueService.configureGateway('carrier_email', {
        carrierDomain: 'jiosms.com',
        smtpHost: 'smtp.example.com',
        smtpPort: 587,
      });

      expect(provider.name).toBe('carrier-email-sms-adapter');
      const active = notificationQueueService.getActiveProvider();
      expect(active.name).toBe('carrier-email-sms-adapter');
      expect(active.isLive).toBe(true);
    });

    it('should configure carrier_email via POST /api/v1/alerts/provider/configure', async () => {
      const res = await fetch(`${baseUrl}/api/v1/alerts/provider/configure`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock_jwt_token_admin',
          'x-user-role': 'ADMIN',
        },
        body: JSON.stringify({
          providerType: 'carrier_email',
          carrierEmail: {
            carrierDomain: 'airtelmail.com',
            smtpHost: 'smtp.gmail.com',
            smtpPort: 587,
          },
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('ok');
      expect(json.activeProvider).toBe('carrier-email-sms-adapter');
      expect(json.isLive).toBe(true);

      // Restore to mock provider immediately
      notificationQueueService.configureGateway('mock');
    });
  });
});
