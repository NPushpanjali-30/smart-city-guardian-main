import {
  SmsSendParams,
  SmsDeliveryResult,
  SmsDeliveryStatus,
  calculateSmsSegments,
} from '@smartcity/shared';
import { ISmsProvider } from './smsProvider.interface.js';
import { logger } from '../../utils/logger.js';

export interface TextBeeConfig {
  apiKey?: string;
  deviceId?: string;
  baseUrl?: string;
  testMode?: boolean;
}

export interface TextBeeConnectionTestResult {
  success: boolean;
  status: 'CONNECTED' | 'ONLINE' | 'DEVICE_OFFLINE' | 'INVALID_KEY' | 'MISSING_KEY' | 'MISSING_DEVICE_ID' | 'MISSING_CREDENTIALS' | 'TEST_MODE' | 'ERROR';
  message: string;
  details?: any;
  testMode?: boolean;
}

/**
 * TextBee SMS Gateway Adapter
 * Integrates TextBee Android Gateway (https://api.textbee.dev) for real-time
 * cellular SMS emergency broadcasts across Indian mobile networks.
 *
 * Implements:
 * - TextBee REST API: POST https://api.textbee.dev/api/v1/gateway/devices/{deviceId}/send-sms
 * - Header: x-api-key
 * - Body: {"recipients": ["+91..."], "message": "..."}
 * - Environment variables: TEXTBEE_API_KEY, TEXTBEE_DEVICE_ID
 * - Strict E.164 phone normalization (+91 for 10-digit Indian mobile numbers starting with 6-9)
 * - Clear connection test reporting (missing key, missing device ID, device offline, online)
 * - Server logging for real errors
 */
export class TextBeeSmsAdapter implements ISmsProvider {
  public readonly name = 'textbee-adapter';
  public readonly isLive: boolean;

  private apiKey?: string;
  private deviceId?: string;
  private baseUrl: string;
  private testMode: boolean;
  private messageStore: Map<string, { status: SmsDeliveryStatus; details: any }> = new Map();

  constructor(config?: TextBeeConfig | string, deviceIdParam?: string, testModeParam?: boolean) {
    if (typeof config === 'string') {
      this.apiKey = config;
      this.deviceId = deviceIdParam || process.env.TEXTBEE_DEVICE_ID;
      this.baseUrl = (process.env.TEXTBEE_BASE_URL || 'https://api.textbee.dev/api/v1').replace(/\/$/, '');
      this.testMode = testModeParam !== undefined ? testModeParam : (process.env.TEXTBEE_TEST_MODE === 'true');
    } else {
      this.apiKey = config?.apiKey || process.env.TEXTBEE_API_KEY;
      this.deviceId = config?.deviceId || process.env.TEXTBEE_DEVICE_ID;
      this.baseUrl = (config?.baseUrl || process.env.TEXTBEE_BASE_URL || 'https://api.textbee.dev/api/v1').replace(/\/$/, '');
      this.testMode = config?.testMode !== undefined
        ? config.testMode
        : (process.env.TEXTBEE_TEST_MODE === 'true');
    }

    this.isLive = !this.testMode && Boolean(this.apiKey && this.deviceId);
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

  public isAvailable(): boolean {
    return Boolean(this.apiKey || this.testMode);
  }

  public normalizeRecipient(phone: string): string {
    const raw = phone.trim();
    let digits = raw.replace(/\D/g, '');

    if (digits.startsWith('0091') && digits.length >= 14) {
      digits = digits.slice(4);
    } else if (digits.startsWith('91') && digits.length >= 12) {
      digits = digits.slice(2);
    } else if (digits.startsWith('0') && digits.length >= 11) {
      digits = digits.slice(1);
    }

    if (digits.length === 10 && /^[6-9]/.test(digits)) {
      return `+91${digits}`;
    }
    if (raw.startsWith('+')) {
      return '+' + digits;
    }
    return `+91${digits}`;
  }

  public isValidIndianMobile(phone: string): boolean {
    const normalized = this.normalizeRecipient(phone);
    return /^\+91[6-9]\d{9}$/.test(normalized);
  }

  /**
   * Tests TextBee Gateway connection and checks whether device is online or credentials missing.
   * Reports clearly if API key is missing, device ID is missing, or device is offline.
   */
  public async testConnection(): Promise<TextBeeConnectionTestResult> {
    const effectiveApiKey = this.apiKey || process.env.TEXTBEE_API_KEY;
    const effectiveDeviceId = this.deviceId || process.env.TEXTBEE_DEVICE_ID;

    if (!effectiveApiKey) {
      const msg = 'Missing TextBee API key. Set TEXTBEE_API_KEY in .env.';
      logger.warn(`[TextBeeSmsAdapter] testConnection: ${msg}`);
      return {
        success: false,
        status: 'MISSING_KEY',
        message: msg,
      };
    }

    if (!effectiveDeviceId) {
      const msg = 'Missing TextBee Device ID. Set TEXTBEE_DEVICE_ID in .env.';
      logger.warn(`[TextBeeSmsAdapter] testConnection: ${msg}`);
      return {
        success: false,
        status: 'MISSING_DEVICE_ID',
        message: msg,
      };
    }

    if (this.testMode) {
      return {
        success: true,
        status: 'TEST_MODE',
        testMode: true,
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
          'Accept': 'application/json',
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
        const msg = 'Invalid or unauthorized TextBee API key. Check TEXTBEE_API_KEY in .env.';
        logger.error(`[TextBeeSmsAdapter] testConnection: ${msg}`, { status: res.status });
        return {
          success: false,
          status: 'INVALID_KEY',
          message: msg,
          details: data,
        };
      }

      if (res.status === 404) {
        const msg = `TextBee device '${effectiveDeviceId}' not found. Check TEXTBEE_DEVICE_ID in .env.`;
        logger.error(`[TextBeeSmsAdapter] testConnection: ${msg}`);
        return {
          success: false,
          status: 'DEVICE_OFFLINE',
          message: msg,
          details: data,
        };
      }

      if (!res.ok) {
        const msg = data.message || `TextBee gateway error: HTTP ${res.status}`;
        logger.error(`[TextBeeSmsAdapter] testConnection error: ${msg}`);
        return {
          success: false,
          status: 'ERROR',
          message: msg,
          details: data,
        };
      }

      const isOnline = data?.data?.status === 'ONLINE' || data?.status === 'ONLINE' || data?.online === true;
      if (data?.data?.status && !isOnline) {
        const msg = `TextBee device '${effectiveDeviceId}' is offline (Status: ${data.data.status}). Open TextBee app on Android device.`;
        logger.warn(`[TextBeeSmsAdapter] testConnection: ${msg}`);
        return {
          success: false,
          status: 'DEVICE_OFFLINE',
          message: msg,
          details: data,
        };
      }

      const successMsg = `TextBee Gateway connected successfully. Device '${effectiveDeviceId}' is online.`;
      logger.info(`[TextBeeSmsAdapter] testConnection: ${successMsg}`);
      return {
        success: true,
        status: 'CONNECTED',
        message: successMsg,
        details: data,
      };
    } catch (err: any) {
      const msg = `Failed to reach TextBee Gateway: ${err.message || 'Network timeout'}`;
      logger.error(`[TextBeeSmsAdapter] testConnection exception: ${msg}`);
      return {
        success: false,
        status: 'ERROR',
        message: msg,
      };
    }
  }

  /**
   * Dispatches disaster SMS via TextBee Gateway REST API:
   * POST https://api.textbee.dev/api/v1/gateway/devices/{deviceId}/send-sms
   * Header: x-api-key
   * Body: {"recipients": ["+91..."], "message": "..."}
   */
  public async sendSms(params: SmsSendParams): Promise<SmsDeliveryResult> {
    const analysis = calculateSmsSegments(params.message);
    const sentAt = new Date().toISOString();
    const recipientE164 = this.normalizeRecipient(params.to);

    if (!/^\+91[6-9]\d{9}$/.test(recipientE164)) {
      const errorMsg = `INVALID_PHONE_NUMBER: Recipient '${params.to}' must resolve to a valid phone number (E.164 format, e.g. +91XXXXXXXXXX)`;
      logger.error(`[TextBeeSmsAdapter] ${errorMsg}`);
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

    // In unit test simulation mode:
    if (this.testMode) {
      const simId = `tb_sim_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      this.messageStore.set(simId, {
        status: 'DELIVERED',
        details: { recipient: recipientE164, sentAt },
      });
      return {
        success: true,
        messageId: simId,
        status: 'DELIVERED',
        provider: 'textbee-adapter-test-mode',
        segmentCount: analysis.segmentCount,
        encoding: analysis.encoding,
        sentAt,
      };
    }

    if (!effectiveApiKey) {
      const errorMsg = 'Missing TextBee API key. Set TEXTBEE_API_KEY in backend .env.';
      logger.error(`[TextBeeSmsAdapter] ${errorMsg}`);
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

    if (!effectiveDeviceId) {
      const errorMsg = 'Missing TextBee Device ID. Set TEXTBEE_DEVICE_ID in backend .env.';
      logger.error(`[TextBeeSmsAdapter] ${errorMsg}`);
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

    try {
      const endpoint = `${this.baseUrl}/gateway/devices/${encodeURIComponent(effectiveDeviceId)}/send-sms`;
      const payload = {
        recipients: [recipientE164],
        message: params.message,
      };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'x-api-key': effectiveApiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });

      const rawResponse = await res.text();
      let parsedData: any = {};
      try {
        parsedData = JSON.parse(rawResponse);
      } catch {
        parsedData = { raw: rawResponse };
      }

      if (!res.ok) {
        let errorMsg = parsedData.message || parsedData.error || `HTTP ${res.status}: ${res.statusText}`;
        if (res.status === 401 || res.status === 403) {
          errorMsg = 'Invalid or unauthorized TextBee API key (HTTP 401/403).';
        } else if (res.status === 404) {
          errorMsg = `TextBee device '${effectiveDeviceId}' not found (HTTP 404). Check TEXTBEE_DEVICE_ID.`;
        } else if (res.status === 429) {
          errorMsg = 'TextBee rate limit reached. Please wait before retrying.';
        } else if (parsedData.message && parsedData.message.toLowerCase().includes('offline')) {
          errorMsg = `TextBee device '${effectiveDeviceId}' is offline. Please make sure the TextBee app is running and connected on the Android device.`;
        }

        logger.error(`[TextBeeSmsAdapter] SMS dispatch failed: ${errorMsg}`, { status: res.status, data: parsedData });
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

      if (parsedData.success === false || parsedData.status === 'FAILED') {
        const errorMsg = parsedData.message || 'TextBee reported delivery failure in response body.';
        logger.error(`[TextBeeSmsAdapter] SMS dispatch failed in response: ${errorMsg}`, { data: parsedData });
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

      const messageId =
        parsedData.data?.id ||
        parsedData.id ||
        parsedData.messageId ||
        `tb_${Date.now()}`;

      this.messageStore.set(messageId, {
        status: 'DELIVERED',
        details: {
          recipient: recipientE164,
          response: parsedData,
          sentAt,
        },
      });

      logger.info(`[TextBeeSmsAdapter] SMS successfully sent to ${recipientE164} (ID: ${messageId})`);

      return {
        success: true,
        messageId,
        status: 'DELIVERED',
        provider: this.name,
        segmentCount: analysis.segmentCount,
        encoding: analysis.encoding,
        sentAt,
      };
    } catch (err: any) {
      const errMsg = `Network error reaching TextBee gateway: ${err.message || 'Connection timeout'}`;
      logger.error(`[TextBeeSmsAdapter] Exception during send: ${errMsg}`);
      return {
        success: false,
        messageId: '',
        status: 'FAILED',
        provider: this.name,
        segmentCount: analysis.segmentCount,
        encoding: analysis.encoding,
        error: errMsg,
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
