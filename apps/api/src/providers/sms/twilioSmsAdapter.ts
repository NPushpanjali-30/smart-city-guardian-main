import {
  SmsSendParams,
  SmsDeliveryResult,
  SmsDeliveryStatus,
  calculateSmsSegments,
} from '@smartcity/shared';
import { ISmsProvider } from './smsProvider.interface.js';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { CircuitBreaker, CircuitBreakerOptions } from '../common/circuitBreaker.js';

export class TwilioSmsAdapter implements ISmsProvider {
  public readonly name = 'twilio-sms-adapter';
  public readonly isLive = true;

  private accountSid?: string;
  private authToken?: string;
  private fromNumber?: string;
  private circuitBreaker: CircuitBreaker;

  constructor(
    creds?: { accountSid?: string; authToken?: string; fromNumber?: string },
    cbOptions?: Partial<CircuitBreakerOptions>
  ) {
    this.accountSid = creds?.accountSid;
    this.authToken = creds?.authToken;
    this.fromNumber = creds?.fromNumber;
    this.circuitBreaker = new CircuitBreaker('TwilioSms', {
      failureThreshold: cbOptions?.failureThreshold ?? 3,
      resetTimeoutMs: cbOptions?.resetTimeoutMs ?? 30000,
      requestTimeoutMs: cbOptions?.requestTimeoutMs ?? 5000,
      maxRetries: cbOptions?.maxRetries ?? 1,
    });
  }

  public getCircuitBreaker(): CircuitBreaker {
    return this.circuitBreaker;
  }

  public setCredentials(creds: { accountSid: string; authToken: string; fromNumber: string }): void {
    this.accountSid = creds.accountSid;
    this.authToken = creds.authToken;
    this.fromNumber = creds.fromNumber;
  }

  public isAvailable(): boolean {
    const sid = this.accountSid || config.TWILIO_ACCOUNT_SID;
    const token = this.authToken || config.TWILIO_AUTH_TOKEN;
    const from = this.fromNumber || config.TWILIO_FROM_NUMBER;
    return Boolean(sid && token && from);
  }

  public async sendSms(params: SmsSendParams): Promise<SmsDeliveryResult> {
    const analysis = calculateSmsSegments(params.message);
    const sentAt = new Date().toISOString();

    if (!this.isAvailable()) {
      logger.warn('[TwilioSmsAdapter] Send aborted: Twilio credentials are not configured');
      return {
        success: false,
        messageId: '',
        status: 'FAILED',
        provider: this.name,
        segmentCount: analysis.segmentCount,
        encoding: analysis.encoding,
        error: 'TWILIO_NOT_CONFIGURED: Twilio Account SID, Auth Token, or From Number missing',
        sentAt,
      };
    }

    if (this.circuitBreaker.getState() === 'OPEN') {
      logger.warn('[TwilioSmsAdapter] Fast-failing sendSms: Circuit breaker is OPEN');
      return {
        success: false,
        messageId: '',
        status: 'FAILED',
        provider: this.name,
        segmentCount: analysis.segmentCount,
        encoding: analysis.encoding,
        error: 'CIRCUIT_BREAKER_OPEN: Twilio service is currently failing (fast fail)',
        sentAt,
      };
    }

    const accountSid = this.accountSid || config.TWILIO_ACCOUNT_SID!;
    const authToken = this.authToken || config.TWILIO_AUTH_TOKEN!;
    const fromNumber = this.fromNumber || config.TWILIO_FROM_NUMBER!;

    // Normalize recipient phone to strict E.164 format
    let toFormatted = params.to.replace(/[\s\-\(\)]/g, '');
    if (!toFormatted.startsWith('+')) {
      if (/^[6-9]\d{9}$/.test(toFormatted)) {
        toFormatted = `+91${toFormatted}`;
      } else {
        toFormatted = `+${toFormatted}`;
      }
    }

    try {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
      const body = new URLSearchParams();
      body.append('To', toFormatted);
      body.append('From', fromNumber);
      body.append('Body', params.message);

      const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');

      return await this.circuitBreaker.execute(async (signal) => {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: body.toString(),
          signal,
        });

        let data: Record<string, any>;
        try {
          data = (await response.json()) as Record<string, any>;
        } catch {
          const textErr = await response.text().catch(() => '');
          throw new Error(`Twilio upstream error ${response.status}: ${textErr.slice(0, 150)}`);
        }

        if (!response.ok) {
          const errorMsg = data.message || `Twilio HTTP error ${response.status}`;
          logger.error(`[TwilioSmsAdapter] Dispatch failed (${response.status}): ${errorMsg}`);
          if (response.status === 429 || response.status === 408 || response.status >= 500) {
            throw new Error(errorMsg);
          }
          return {
            success: false,
            messageId: data.sid || '',
            status: 'FAILED',
            provider: this.name,
            segmentCount: analysis.segmentCount,
            encoding: analysis.encoding,
            error: errorMsg,
            sentAt,
          };
        }

        const twilioStatus = (data.status || '').toLowerCase();
        let status: SmsDeliveryStatus = 'SENT_TO_PROVIDER';
        if (twilioStatus === 'delivered') {
          status = 'DELIVERED';
        } else if (twilioStatus === 'failed' || twilioStatus === 'undelivered') {
          status = 'FAILED';
        }

        return {
          success: true,
          messageId: data.sid,
          status,
          provider: this.name,
          segmentCount: analysis.segmentCount,
          encoding: analysis.encoding,
          costUnits: analysis.segmentCount,
          sentAt,
        };
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error(`[TwilioSmsAdapter] Exception during sendSms: ${errorMsg}`);
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
  }

  public async getDeliveryStatus(messageId: string): Promise<SmsDeliveryStatus> {
    if (!this.isAvailable() || !messageId) {
      return 'UNKNOWN';
    }

    const accountSid = this.accountSid || config.TWILIO_ACCOUNT_SID!;
    const authToken = this.authToken || config.TWILIO_AUTH_TOKEN!;

    try {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages/${messageId}.json`;
      const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
        },
      });

      if (!response.ok) {
        return 'UNKNOWN';
      }

      const data = (await response.json()) as Record<string, any>;
      const twilioStatus = (data.status || '').toLowerCase();

      switch (twilioStatus) {
        case 'delivered':
          return 'DELIVERED';
        case 'sent':
        case 'sending':
        case 'queued':
          return 'SENT_TO_PROVIDER';
        case 'failed':
        case 'undelivered':
          return 'FAILED';
        default:
          return 'UNKNOWN';
      }
    } catch {
      return 'UNKNOWN';
    }
  }
}

export const twilioSmsAdapter = new TwilioSmsAdapter();
