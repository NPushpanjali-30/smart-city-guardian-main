import {
  SmsSendParams,
  SmsDeliveryResult,
  SmsDeliveryStatus,
  calculateSmsSegments,
} from '@smartcity/shared';
import { ISmsProvider } from './smsProvider.interface.js';
import { logger } from '../../utils/logger.js';

export class Fast2SmsAdapter implements ISmsProvider {
  public readonly name = 'fast2sms-adapter';
  public readonly isLive = true;

  private apiKey?: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.FAST2SMS_API_KEY;
  }

  public setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  public isAvailable(): boolean {
    return Boolean(this.apiKey || process.env.FAST2SMS_API_KEY);
  }

  public async sendSms(params: SmsSendParams): Promise<SmsDeliveryResult> {
    const analysis = calculateSmsSegments(params.message);
    const sentAt = new Date().toISOString();

    const key = this.apiKey || process.env.FAST2SMS_API_KEY;

    if (!key) {
      logger.warn('[Fast2SmsAdapter] Send aborted: Fast2SMS API Key is not configured');
      return {
        success: false,
        messageId: '',
        status: 'FAILED',
        provider: this.name,
        segmentCount: analysis.segmentCount,
        encoding: analysis.encoding,
        error: 'FAST2SMS_NOT_CONFIGURED: Fast2SMS API authorization key is missing',
        sentAt,
      };
    }

    // Clean Indian phone number: remove non-digits
    let cleanPhone = params.to.replace(/\D/g, '');
    if (cleanPhone.startsWith('0091') && cleanPhone.length === 14) {
      cleanPhone = cleanPhone.slice(4);
    } else if (cleanPhone.startsWith('91') && cleanPhone.length === 12) {
      cleanPhone = cleanPhone.slice(2); // Extract standard 10-digit Indian mobile number
    } else if (cleanPhone.startsWith('0') && cleanPhone.length === 11) {
      cleanPhone = cleanPhone.slice(1);
    }

    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      logger.warn(`[Fast2SmsAdapter] Invalid Indian mobile number format: ${params.to} -> ${cleanPhone}`);
      return {
        success: false,
        messageId: '',
        status: 'FAILED',
        provider: this.name,
        segmentCount: analysis.segmentCount,
        encoding: analysis.encoding,
        error: `INVALID_PHONE_NUMBER: Recipient '${params.to}' must resolve to a valid 10-digit Indian mobile number (6000000000-9999999999)`,
        sentAt,
      };
    }

    try {
      const url = 'https://www.fast2sms.com/dev/bulkV2';
      // If text contains non-GSM characters (Devanagari, Kannada, emoji), use unicode mode
      const isUnicode = analysis.encoding === 'UCS-2' || /[^\x00-\x7F]/.test(params.message);

      const bodyData = {
        route: 'q',
        message: params.message,
        language: isUnicode ? 'unicode' : 'english',
        flash: 0,
        numbers: cleanPhone,
      };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'authorization': key,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(bodyData),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      let data: Record<string, any>;
      try {
        data = (await response.json()) as Record<string, any>;
      } catch {
        const textErr = await response.text().catch(() => '');
        throw new Error(`Fast2SMS upstream HTTP error ${response.status}: ${textErr.slice(0, 150)}`);
      }

      if (!response.ok || data.return === false) {
        const errorMsg = Array.isArray(data.message)
          ? data.message.join(', ')
          : (data.message || `Fast2SMS HTTP error ${response.status}`);

        logger.error(`[Fast2SmsAdapter] Dispatch failed (${response.status}): ${errorMsg}`);
        return {
          success: false,
          messageId: data.request_id || '',
          status: 'FAILED',
          provider: this.name,
          segmentCount: analysis.segmentCount,
          encoding: analysis.encoding,
          error: errorMsg,
          sentAt,
        };
      }

      logger.info(`[Fast2SmsAdapter] SMS delivered successfully to ${params.to} (Request ID: ${data.request_id})`);

      return {
        success: true,
        messageId: data.request_id || `F2S_${Date.now()}`,
        status: 'DELIVERED',
        provider: this.name,
        segmentCount: analysis.segmentCount,
        encoding: analysis.encoding,
        costUnits: analysis.segmentCount,
        sentAt,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error(`[Fast2SmsAdapter] Network/Fetch exception during sendSms: ${errorMsg}`);
      return {
        success: false,
        messageId: '',
        status: 'FAILED',
        provider: this.name,
        segmentCount: analysis.segmentCount,
        encoding: analysis.encoding,
        error: `NETWORK_ERROR: ${errorMsg}`,
        sentAt,
      };
    }
  }

  public async getDeliveryStatus(messageId: string): Promise<SmsDeliveryStatus> {
    if (!messageId) return 'UNKNOWN';
    return 'DELIVERED';
  }
}

export const fast2SmsAdapter = new Fast2SmsAdapter();
