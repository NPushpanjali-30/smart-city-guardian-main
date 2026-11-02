import { SmsSendParams, SmsDeliveryResult, SmsDeliveryStatus } from '@smartcity/shared';

export interface ISmsProvider {
  readonly name: string;
  readonly isLive: boolean;
  sendSms(params: SmsSendParams): Promise<SmsDeliveryResult>;
  getDeliveryStatus(messageId: string): Promise<SmsDeliveryStatus>;
  isAvailable(): boolean;
}
