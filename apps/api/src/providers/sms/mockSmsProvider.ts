import {
  SmsSendParams,
  SmsDeliveryResult,
  SmsDeliveryStatus,
  calculateSmsSegments,
} from '@smartcity/shared';
import { ISmsProvider } from './smsProvider.interface.js';
import { logger } from '../../utils/logger.js';

export type MockSmsSimulationMode =
  | 'SUCCESS'
  | 'TRANSIENT_FAILURE'
  | 'PERMANENT_FAILURE'
  | 'RATE_LIMITED';

interface StoredMockMessage {
  messageId: string;
  to: string;
  message: string;
  status: SmsDeliveryStatus;
  segmentCount: number;
  encoding: 'GSM-7' | 'UCS-2';
  sentAt: string;
  error?: string;
}

export class MockSmsProvider implements ISmsProvider {
  public readonly name = 'mock-sms-provider';
  public readonly isLive = false;

  private simulationMode: MockSmsSimulationMode = 'SUCCESS';
  private dispatchedMessages: Map<string, StoredMockMessage> = new Map();
  private messageCounter = 1000;

  constructor(defaultMode: MockSmsSimulationMode = 'SUCCESS') {
    this.simulationMode = defaultMode;
  }

  public setSimulationMode(mode: MockSmsSimulationMode): void {
    this.simulationMode = mode;
    logger.info(`[MockSmsProvider] Simulation mode switched to: ${mode}`);
  }

  public getSimulationMode(): MockSmsSimulationMode {
    return this.simulationMode;
  }

  public isAvailable(): boolean {
    return this.simulationMode !== 'PERMANENT_FAILURE';
  }

  public async sendSms(params: SmsSendParams): Promise<SmsDeliveryResult> {
    const analysis = calculateSmsSegments(params.message);
    const messageId = `SM_mock_${Date.now()}_${++this.messageCounter}`;
    const sentAt = new Date().toISOString();

    // 1. Permanent Failure Simulation (e.g. invalid recipient format)
    if (this.simulationMode === 'PERMANENT_FAILURE') {
      const errorMsg = 'Invalid recipient address or unallocated number';
      this.dispatchedMessages.set(messageId, {
        messageId,
        to: params.to,
        message: params.message,
        status: 'FAILED',
        segmentCount: analysis.segmentCount,
        encoding: analysis.encoding,
        sentAt,
        error: errorMsg,
      });

      return {
        success: false,
        messageId,
        status: 'FAILED',
        provider: this.name,
        segmentCount: analysis.segmentCount,
        encoding: analysis.encoding,
        error: errorMsg,
        sentAt,
      };
    }

    // 2. Transient Failure Simulation (e.g. telecom gateway temporary outage)
    if (this.simulationMode === 'TRANSIENT_FAILURE') {
      const errorMsg = 'Telecom upstream carrier gateway timed out (503)';
      this.dispatchedMessages.set(messageId, {
        messageId,
        to: params.to,
        message: params.message,
        status: 'FAILED',
        segmentCount: analysis.segmentCount,
        encoding: analysis.encoding,
        sentAt,
        error: errorMsg,
      });

      return {
        success: false,
        messageId,
        status: 'FAILED',
        provider: this.name,
        segmentCount: analysis.segmentCount,
        encoding: analysis.encoding,
        error: errorMsg,
        sentAt,
      };
    }

    // 3. Rate-Limited Simulation (429)
    if (this.simulationMode === 'RATE_LIMITED') {
      const errorMsg = 'Exceeded carrier dispatch rate limit (429 Too Many Requests)';
      this.dispatchedMessages.set(messageId, {
        messageId,
        to: params.to,
        message: params.message,
        status: 'FAILED',
        segmentCount: analysis.segmentCount,
        encoding: analysis.encoding,
        sentAt,
        error: errorMsg,
      });

      return {
        success: false,
        messageId,
        status: 'FAILED',
        provider: this.name,
        segmentCount: analysis.segmentCount,
        encoding: analysis.encoding,
        error: errorMsg,
        sentAt,
      };
    }

    // 4. Successful Delivery
    this.dispatchedMessages.set(messageId, {
      messageId,
      to: params.to,
      message: params.message,
      status: 'DELIVERED',
      segmentCount: analysis.segmentCount,
      encoding: analysis.encoding,
      sentAt,
    });

    return {
      success: true,
      messageId,
      status: 'DELIVERED',
      provider: this.name,
      segmentCount: analysis.segmentCount,
      encoding: analysis.encoding,
      costUnits: analysis.segmentCount,
      sentAt,
    };
  }

  public async getDeliveryStatus(messageId: string): Promise<SmsDeliveryStatus> {
    const record = this.dispatchedMessages.get(messageId);
    if (!record) {
      return 'UNKNOWN';
    }
    return record.status;
  }

  public getDispatchedMessages(): StoredMockMessage[] {
    return Array.from(this.dispatchedMessages.values());
  }

  public clearHistory(): void {
    this.dispatchedMessages.clear();
  }
}

export const mockSmsProvider = new MockSmsProvider();
