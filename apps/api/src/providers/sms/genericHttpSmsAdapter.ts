import {
  SmsSendParams,
  SmsDeliveryResult,
  SmsDeliveryStatus,
  calculateSmsSegments,
} from '@smartcity/shared';
import { ISmsProvider } from './smsProvider.interface.js';
import { logger } from '../../utils/logger.js';

export interface GenericHttpGatewayConfig {
  endpointUrl: string;
  method?: 'POST' | 'GET';
  headers?: Record<string, string>;
  authHeaderName?: string;
  authHeaderValue?: string;
  phoneNumberField?: string;
  messageField?: string;
}

export class GenericHttpSmsAdapter implements ISmsProvider {
  public readonly name = 'http-gateway-adapter';
  public readonly isLive = true;

  private config?: GenericHttpGatewayConfig;

  constructor(config?: GenericHttpGatewayConfig) {
    this.config = config;
  }

  public setConfig(config: GenericHttpGatewayConfig): void {
    this.config = config;
  }

  public isAvailable(): boolean {
    return Boolean(this.config?.endpointUrl);
  }

  public async sendSms(params: SmsSendParams): Promise<SmsDeliveryResult> {
    const analysis = calculateSmsSegments(params.message);
    const sentAt = new Date().toISOString();

    if (!this.config?.endpointUrl) {
      return {
        success: false,
        messageId: '',
        status: 'FAILED',
        provider: this.name,
        segmentCount: analysis.segmentCount,
        encoding: analysis.encoding,
        error: 'GATEWAY_NOT_CONFIGURED: HTTP endpoint URL is missing',
        sentAt,
      };
    }

    try {
      const method = this.config.method || 'POST';
      const phoneKey = this.config.phoneNumberField || 'to';
      const msgKey = this.config.messageField || 'message';

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(this.config.headers || {}),
      };

      if (this.config.authHeaderName && this.config.authHeaderValue) {
        headers[this.config.authHeaderName] = this.config.authHeaderValue;
      }

      const bodyData = {
        [phoneKey]: params.to,
        [msgKey]: params.message,
        timestamp: sentAt,
      };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);

      const resp = await fetch(this.config.endpointUrl, {
        method,
        headers,
        body: method === 'POST' ? JSON.stringify(bodyData) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!resp.ok) {
        const errorText = await resp.text();
        return {
          success: false,
          messageId: '',
          status: 'FAILED',
          provider: this.name,
          segmentCount: analysis.segmentCount,
          encoding: analysis.encoding,
          error: `Gateway returned status ${resp.status}: ${errorText.slice(0, 200)}`,
          sentAt,
        };
      }

      return {
        success: true,
        messageId: `HTTP_${Date.now()}`,
        status: 'DELIVERED',
        provider: this.name,
        segmentCount: analysis.segmentCount,
        encoding: analysis.encoding,
        costUnits: analysis.segmentCount,
        sentAt,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
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
    return 'DELIVERED';
  }
}

export const genericHttpSmsAdapter = new GenericHttpSmsAdapter();
