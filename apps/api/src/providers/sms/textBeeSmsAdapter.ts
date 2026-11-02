import {
  SmsSendParams,
  SmsDeliveryResult,
  SmsDeliveryStatus,
  calculateSmsSegments,
} from '@smartcity/shared';
import { ISmsProvider } from './smsProvider.interface.js';
import { logger } from '../../utils/logger.js';
import { CircuitBreaker } from '../common/circuitBreaker.js';

export interface TextBeeConfig {
  apiKey?: string;
  deviceId?: string;
  baseUrl?: string;
  testMode?: boolean;
}

export interface TextBeeConnectionTestResult {
  success: boolean;
  status: 'CONNECTED' | 'DEVICE_OFFLINE' | 'INVALID_KEY' | 'MISSING_CREDENTIALS' | 'TEST_MODE' | 'ERROR';
  message: string;
  details?: any;
}

/**
 * TextBee SMS Gateway Adapter
 * Integrates TextBee Android Gateway (https://api.textbee.dev) for real-time
 * cellular SMS emergency broadcasts across Indian mobile networks.
 *
 * Implements:
 * - TextBee REST API: POST /api/v1/gateway/devices/{deviceId}/send-sms
 * - Header: x-api-key
 * - Backend environment variables: TEXTBEE_API_KEY, TEXTBEE_DEVICE_ID, TEXTBEE_BASE_URL
 * - E.164 phone normalization (+91 for Indian mobile numbers)
 * - Connection and device status testing
 * - Safe test / dry-run mode
 */
export class TextBeeSmsAdapter implements ISmsProvider {
  public readonly name = 'textbee-adapter';
  public readonly isLive: boolean;

  private apiKey?: string;
  private deviceId?: string;
  private baseUrl: string;
  private testMode: boolean;
  private circuitBreaker: CircuitBreaker;
  private messageStore: Map<string, { status: SmsDeliveryStatus; details: any }> = new Map();

  constructor(config?: TextBeeConfig | string, deviceIdParam?: string, testModeParam?: boolean) {
    if (typeof config === 'string') {
      this.apiKey = config;
      this.deviceId = deviceIdParam || process.env.TEXTBEE_DEVICE_ID;
      this.baseUrl = (process.env.TEXTBEE_BASE_URL || 'https://api.textbee.dev/api/v1').replace(/\/$/, '');
      this.testMode = testModeParam !== undefined ? testModeParam : (process.env.TEXTBEE_TEST_MODE !== 'false');
    } else {
      this.apiKey = config?.apiKey || process.env.TEXTBEE_API_KEY;
      this.deviceId = config?.deviceId || process.env.TEXTBEE_DEVICE_ID;
      this.baseUrl = (config?.baseUrl || process.env.TEXTBEE_BASE_URL || 'https://api.textbee.dev/api/v1').replace(/\/$/, '');
      this.testMode = config?.testMode !== undefined
        ? config.testMode
        : (process.env.TEXTBEE_TEST_MODE !== 'false');
    }

    this.isLive = !this.testMode && Boolean(this.apiKey);

    this.circuitBreaker = new CircuitBreaker('TextBeeGateway', {
      failureThreshold: 3,
      resetTimeoutMs: 30000,
      requestTimeoutMs: 10000,
      maxRetries: 2,
    });
  }

  public setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  public setDeviceId(deviceId?: string): void {
    this.deviceId = deviceId;
  }

  public setTestMode(testMode: boolean): void {
    this.testMode = testMode;
  }

  public getTestMode(): boolean {
    return this.testMode;
  }

  public isAvailable(): boolean {
    return Boolean(this.apiKey || this.testMode);
  }

  public normalizeRecipient(phone: string): string {
    const raw = phone.trim();
    if (raw.startsWith('+')) {
      return '+' + raw.slice(1).replace(/\D/g, '');
    }

    const digits = raw.replace(/\D/g, '');
    if (digits.length === 10 && /^[6-9]/.test(digits)) {
      return `+91${digits}`;
    }
    if (digits.length === 12 && digits.startsWith('91')) {
      return `+${digits}`;
    }
    if (digits.length === 11 && digits.startsWith('0')) {
      return `+91${digits.slice(1)}`;
    }
    return `+${digits}`;
  }

  /**
   * Tests TextBee Gateway connection and checks whether device is online or credentials missing.
   */
  public async testConnection(): Promise<TextBeeConnectionTestResult> {
    const effectiveApiKey = this.apiKey || process.env.TEXTBEE_API_KEY;
    const effectiveDeviceId = this.deviceId || process.env.TEXTBEE_DEVICE_ID;

    if (!effectiveApiKey) {
      return {
        success: false,
        status: 'MISSING_CREDENTIALS',
        message: 'TextBee API key is missing. Set TEXTBEE_API_KEY in backend environment.',
      };
    }

    if (!effectiveDeviceId) {
      return {
        success: false,
        status: 'MISSING_CREDENTIALS',
        message: 'TextBee Device ID is missing. Set TEXTBEE_DEVICE_ID in backend environment.',
      };
    }

    if (this.testMode) {
      return {
        success: true,
        status: 'TEST_MODE',
        message: 'TextBee Gateway configured in Safe Test Mode (Simulated SMS ready).',
        details: { deviceId: effectiveDeviceId, testMode: true },
      };
    }

    try {
      const endpoint = `${this.baseUrl}/gateway/devices/${encodeURIComponent(effectiveDeviceId)}`;
      const res = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'x-api-key': effectiveApiKey,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(8000),
      });

      const raw = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(raw);
      } catch {
        data = { raw };
      }

      if (res.status === 401 || res.status === 403) {
        return {
          success: false,
          status: 'INVALID_KEY',
          message: 'Invalid TextBee API key. Check TEXTBEE_API_KEY in backend environment.',
          details: data,
        };
      }

      if (res.status === 404) {
        return {
          success: false,
          status: 'DEVICE_OFFLINE',
          message: `TextBee device '${effectiveDeviceId}' not found. Check TEXTBEE_DEVICE_ID.`,
          details: data,
        };
      }

      if (res.status === 429) {
        return {
          success: false,
          status: 'ERROR',
          message: 'TextBee rate limit exceeded. Please wait a moment before trying again.',
          details: data,
        };
      }

      if (!res.ok) {
        return {
          success: false,
          status: 'ERROR',
          message: data.message || `TextBee gateway error: HTTP ${res.status}`,
          details: data,
        };
      }

      const isOnline = data?.data?.status === 'ONLINE' || data?.status === 'ONLINE' || data?.online === true;
      if (data?.data?.status && !isOnline) {
        return {
          success: false,
          status: 'DEVICE_OFFLINE',
          message: `TextBee Android device is currently OFFLINE (Status: ${data.data.status}). Open TextBee app on Android device.`,
          details: data,
        };
      }

      return {
        success: true,
        status: 'CONNECTED',
        message: `TextBee Gateway connected successfully. Device '${effectiveDeviceId}' is active.`,
        details: data,
      };
    } catch (err: any) {
      return {
        success: false,
        status: 'ERROR',
        message: `Failed to reach TextBee Gateway: ${err.message || 'Network timeout'}`,
      };
    }
  }

  /**
   * Dispatches disaster SMS via TextBee Gateway
   */
  public async sendSms(params: SmsSendParams): Promise<SmsDeliveryResult> {
    const analysis = calculateSmsSegments(params.message);
    const sentAt = new Date().toISOString();
    const recipientE164 = this.normalizeRecipient(params.to);

    if (!/^\+[1-9]\d{9,14}$/.test(recipientE164)) {
      const errorMsg = `INVALID_PHONE_NUMBER: Recipient '${params.to}' must resolve to a valid phone number (E.164 format, e.g. +91XXXXXXXXXX)`;
      logger.warn(`[TextBeeSmsAdapter] ${errorMsg}`);
      return {
        success: false,
        messageId: '',
        status: 'FAILED',
        provider: this.name,
        segmentCount: analysis.segmentCount,
        encoding: analysis.encoding,
        error: errorMsg,
        sentAt,
      };
    }

    const effectiveApiKey = this.apiKey || process.env.TEXTBEE_API_KEY;
    const effectiveDeviceId = this.deviceId || process.env.TEXTBEE_DEVICE_ID;

    // Check if running in safe test / authorization mode
    if (this.testMode || !effectiveApiKey) {
      const simulatedId = `tb_sim_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      logger.info(
        `[TextBeeSmsAdapter] Safe test mode active (No real SMS billed). Simulated dispatch to ${recipientE164}: "${params.message.slice(0, 60)}..."`
      );

      this.messageStore.set(simulatedId, {
        status: 'DELIVERED',
        details: {
          recipient: recipientE164,
          segmentCount: analysis.segmentCount,
          encoding: analysis.encoding,
          sentAt,
          mode: 'SIMULATED_TEST',
        },
      });

      return {
        success: true,
        messageId: simulatedId,
        status: 'DELIVERED',
        provider: `${this.name}-test-mode`,
        segmentCount: analysis.segmentCount,
        encoding: analysis.encoding,
        sentAt,
      };
    }

    // Live Transmission via TextBee REST API
    try {
      return await this.circuitBreaker.execute(async (signal) => {
        const payload: Record<string, any> = {
          recipients: [recipientE164],
          message: params.message,
        };

        // TextBee endpoint: POST /api/v1/gateway/devices/{deviceId}/send-sms
        let endpoint = `${this.baseUrl}/gateway/send-sms`;
        if (effectiveDeviceId) {
          endpoint = `${this.baseUrl}/gateway/devices/${encodeURIComponent(effectiveDeviceId)}/send-sms`;
        }

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'x-api-key': effectiveApiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal,
        });

        const rawResponse = await res.text();
        let parsedData: any = {};
        try {
          parsedData = JSON.parse(rawResponse);
        } catch {
          parsedData = { raw: rawResponse };
        }

        if (!res.ok) {
          let errorType = 'TEXTBEE_API_ERROR';
          let userMsg = parsedData.message || parsedData.error || `HTTP ${res.status}`;
          if (res.status === 401 || res.status === 403) {
            errorType = 'INVALID_API_KEY';
            userMsg = 'Invalid or expired TextBee API key.';
          } else if (res.status === 404) {
            errorType = 'DEVICE_NOT_FOUND';
            userMsg = `TextBee device '${effectiveDeviceId || 'unknown'}' not found.`;
          } else if (res.status === 429) {
            errorType = 'RATE_LIMIT_EXCEEDED';
            userMsg = 'TextBee rate limit reached. Please wait before retrying.';
          } else if (parsedData.message && parsedData.message.toLowerCase().includes('offline')) {
            errorType = 'DEVICE_OFFLINE';
            userMsg = 'TextBee Android device is offline.';
          }

          logger.error(`[TextBeeSmsAdapter] ${errorType}: ${userMsg}`);
          return {
            success: false,
            messageId: '',
            status: 'FAILED',
            provider: this.name,
            segmentCount: analysis.segmentCount,
            encoding: analysis.encoding,
            error: `${errorType}: ${userMsg}`,
            sentAt,
          };
        }

        const messageId =
          parsedData.data?.id ||
          parsedData.id ||
          parsedData.messageId ||
          `tb_live_${Date.now()}`;

        this.messageStore.set(messageId, {
          status: 'DELIVERED',
          details: {
            recipient: recipientE164,
            response: parsedData,
            sentAt,
          },
        });

        logger.info(`[TextBeeSmsAdapter] Successfully dispatched live SMS to ${recipientE164} (ID: ${messageId})`);

        return {
          success: true,
          messageId,
          status: 'DELIVERED',
          provider: this.name,
          segmentCount: analysis.segmentCount,
          encoding: analysis.encoding,
          sentAt,
        };
      });
    } catch (err: any) {
      const errMsg = err?.message || 'Network failure dispatching SMS via TextBee';
      logger.error(`[TextBeeSmsAdapter] Exception during send: ${errMsg}`);
      return {
        success: false,
        messageId: '',
        status: 'FAILED',
        provider: this.name,
        segmentCount: analysis.segmentCount,
        encoding: analysis.encoding,
        error: `TEXTBEE_DISPATCH_EXCEPTION: ${errMsg}`,
        sentAt,
      };
    }
  }

  public async getDeliveryStatus(messageId: string): Promise<SmsDeliveryStatus> {
    const record = this.messageStore.get(messageId);
    if (record) {
      return record.status;
    }
    if (messageId.startsWith('tb_sim_')) {
      return 'DELIVERED';
    }
    return 'UNKNOWN';
  }
}
