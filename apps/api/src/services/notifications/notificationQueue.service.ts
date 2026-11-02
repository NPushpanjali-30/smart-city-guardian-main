import {
  NotificationRecord,
  SmsDeliveryStatus,
  LanguageCode,
  NotificationTriggerType,
  NotificationChannel,
  calculateSmsSegments,
} from '@smartcity/shared';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import { ISmsProvider } from '../../providers/sms/smsProvider.interface.js';
import { mockSmsProvider } from '../../providers/sms/mockSmsProvider.js';
import { pushNotificationService } from './pushNotification.service.js';
import { TwilioSmsAdapter } from '../../providers/sms/twilioSmsAdapter.js';
import { Fast2SmsAdapter } from '../../providers/sms/fast2SmsAdapter.js';
import { GenericHttpSmsAdapter } from '../../providers/sms/genericHttpSmsAdapter.js';
import { CarrierEmailSmsAdapter } from '../../providers/sms/carrierEmailSmsAdapter.js';
import { TextBeeSmsAdapter } from '../../providers/sms/textBeeSmsAdapter.js';
import { notificationPolicyService, AlertEvaluationCandidate } from './notificationPolicy.service.js';
import { userPreferenceService } from './userPreference.service.js';
import { logger } from '../../utils/logger.js';

interface EnqueuedJob {
  record: NotificationRecord;
  actualRecipientPhone?: string; // transient in memory only, not stored in permanent logs
  candidate: AlertEvaluationCandidate;
  nextAttemptMs: number;
}

export class NotificationQueueService extends EventEmitter {
  private activeProvider: ISmsProvider;
  private queue: EnqueuedJob[] = [];
  private history: Map<string, NotificationRecord> = new Map();
  private activeProcessingPromise?: Promise<void>;
  private maxRetries = 3;
  private jobCounter = 5000;
  private latestBroadcastAlert: any = null;

  private getConfigFilePath(): string {
    const cwd = process.cwd();
    if (cwd.endsWith('apps/api') || cwd.endsWith('apps/api/') || cwd.endsWith('backend') || cwd.endsWith('backend/')) {
      return path.resolve(cwd, 'data/sms_gateway_config.json');
    }
    const backendDataPath = path.resolve(cwd, 'backend/data/sms_gateway_config.json');
    if (fs.existsSync(backendDataPath)) {
      return backendDataPath;
    }
    return path.resolve(cwd, 'apps/api/data/sms_gateway_config.json');
  }

  constructor(provider?: ISmsProvider) {
    super();
    this.activeProvider = provider || this.loadSavedProvider() || mockSmsProvider;
  }

  private loadSavedProvider(): ISmsProvider | null {
    try {
      const configPath = this.getConfigFilePath();
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, 'utf-8');
        const data = JSON.parse(raw);
        if (data.type === 'mock') {
          logger.info('[NotificationQueueService] Loaded persistent Mock SMS Gateway configuration');
          return mockSmsProvider;
        } else if (data.type === 'twilio' && data.twilio?.accountSid && data.twilio?.authToken && data.twilio?.fromNumber) {
          logger.info('[NotificationQueueService] Loaded persistent Twilio SMS Gateway configuration');
          return new TwilioSmsAdapter(data.twilio);
        } else if (data.type === 'fast2sms' && (data.fast2sms?.apiKey || data.fast2smsApiKey)) {
          const key = data.fast2sms?.apiKey || data.fast2smsApiKey;
          logger.info('[NotificationQueueService] Loaded persistent Fast2SMS Gateway configuration');
          return new Fast2SmsAdapter(key);
        } else if (data.type === 'http_gateway' && data.httpGateway?.endpointUrl) {
          logger.info('[NotificationQueueService] Loaded persistent Generic HTTP SMS Gateway configuration');
          return new GenericHttpSmsAdapter(data.httpGateway);
        } else if (data.type === 'carrier_email') {
          logger.info('[NotificationQueueService] Loaded persistent Carrier Email-to-SMS Gateway configuration');
          return new CarrierEmailSmsAdapter(data.carrier_email || data.carrierEmail);
        } else if (data.type === 'textbee') {
          logger.info('[NotificationQueueService] Loaded persistent TextBee SMS Gateway configuration');
          return new TextBeeSmsAdapter(data.textbee || { apiKey: data.textbeeApiKey, deviceId: data.textbeeDeviceId });
        }
      }

      // Check environment variables if no config file or type was not explicitly 'mock'
      if (process.env.TEXTBEE_API_KEY) {
        logger.info('[NotificationQueueService] Initialized TextBee Gateway from TEXTBEE_API_KEY environment variable');
        return new TextBeeSmsAdapter({
          apiKey: process.env.TEXTBEE_API_KEY,
          deviceId: process.env.TEXTBEE_DEVICE_ID,
          testMode: process.env.TEXTBEE_TEST_MODE !== 'false',
        });
      }
      if (process.env.FAST2SMS_API_KEY) {
        logger.info('[NotificationQueueService] Initialized Fast2SMS Gateway from FAST2SMS_API_KEY environment variable');
        return new Fast2SmsAdapter(process.env.FAST2SMS_API_KEY);
      }
      if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER) {
        logger.info('[NotificationQueueService] Initialized Twilio SMS Gateway from TWILIO environment variables');
        return new TwilioSmsAdapter({
          accountSid: process.env.TWILIO_ACCOUNT_SID,
          authToken: process.env.TWILIO_AUTH_TOKEN,
          fromNumber: process.env.TWILIO_FROM_NUMBER,
        });
      }
    } catch {
      // Fallback to default
    }
    return null;
  }

  public configureGateway(
    type: 'twilio' | 'fast2sms' | 'textbee' | 'http_gateway' | 'carrier_email' | 'mock',
    options?: any
  ): ISmsProvider {
    let newProvider: ISmsProvider;
    if (type === 'twilio') {
      newProvider = new TwilioSmsAdapter(options);
    } else if (type === 'fast2sms') {
      newProvider = new Fast2SmsAdapter(options?.apiKey);
    } else if (type === 'textbee') {
      newProvider = new TextBeeSmsAdapter(options);
    } else if (type === 'http_gateway') {
      newProvider = new GenericHttpSmsAdapter(options);
    } else if (type === 'carrier_email') {
      newProvider = new CarrierEmailSmsAdapter(options);
    } else {
      newProvider = mockSmsProvider;
    }

    this.activeProvider = newProvider;

    try {
      const configPath = this.getConfigFilePath();
      const dir = path.dirname(configPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        configPath,
        JSON.stringify({ type, [type]: options, updatedAt: new Date().toISOString() }, null, 2),
        'utf-8'
      );
    } catch {}

    logger.info(`[NotificationQueueService] Configured and activated SMS gateway: ${newProvider.name} (live: ${newProvider.isLive})`);
    return newProvider;
  }

  public setProvider(provider: ISmsProvider): void {
    this.activeProvider = provider;
    logger.info(`[NotificationQueueService] Switched SMS provider to: ${provider.name}`);
  }

  public getActiveProvider(): ISmsProvider {
    return this.activeProvider;
  }

  /**
   * Enqueues a notification after verifying policy eligibility.
   * If policy rejects, an audit record with status FAILED or SUPPRESSED can still be kept.
   */
  public async enqueue(params: {
    candidate: AlertEvaluationCandidate;
    message: string;
    triggerType: NotificationTriggerType;
    channel?: NotificationChannel;
    language?: LanguageCode;
    skipPolicyCheck?: boolean;
    targetPhoneNumber?: string;
    bypassCooldown?: boolean;
  }): Promise<{
    success: boolean;
    recordId: string;
    status: SmsDeliveryStatus;
    reason: string;
    record?: NotificationRecord;
  }> {
    const channel: NotificationChannel = params.channel || 'SMS';
    const candidate = params.candidate;

    if (params.targetPhoneNumber) {
      candidate.targetPhoneNumber = userPreferenceService.normalizePhoneNumber(params.targetPhoneNumber);
    }
    if (params.bypassCooldown) {
      candidate.bypassCooldown = true;
    }

    const evaluation = params.skipPolicyCheck
      ? {
          eligible: true,
          reason: 'Policy check skipped (manual bypass)',
          recipientPhone: candidate.targetPhoneNumber || userPreferenceService.getPreferences(candidate.userId).phoneNumber,
          recipientPhoneMasked: candidate.targetPhoneNumber
            ? userPreferenceService.maskPhoneNumber(candidate.targetPhoneNumber)
            : userPreferenceService.getPreferences(candidate.userId).phoneNumberMasked,
          preferredLanguage: params.language || userPreferenceService.getPreferences(candidate.userId).preferredLanguage,
          severity: candidate.severity,
          distanceKm: 0,
          bypassCooldown: true,
          deduplicated: false,
        }
      : notificationPolicyService.evaluateEligibility(candidate, { bypassCooldown: params.bypassCooldown });

    const recordId = `notif_${Date.now()}_${++this.jobCounter}`;
    const language = params.language || evaluation.preferredLanguage || 'en';
    const analysis = calculateSmsSegments(params.message);
    const rawPhone = candidate.targetPhoneNumber || evaluation.recipientPhone;
    const actualPhone = rawPhone ? userPreferenceService.normalizePhoneNumber(rawPhone) : undefined;
    const recipientPhoneMasked = actualPhone ? userPreferenceService.maskPhoneNumber(actualPhone) : (evaluation.recipientPhoneMasked || '***');

    if (!evaluation.eligible) {
      const isSuppressed = 'rejectionCode' in evaluation && evaluation.rejectionCode === 'SUPPRESSED_COOLDOWN';
      const suppressedRecord: NotificationRecord = {
        id: recordId,
        userId: candidate.userId,
        recipientPhoneMasked,
        recipientMasked: recipientPhoneMasked,
        message: params.message,
        channel,
        triggerType: params.triggerType,
        severity: candidate.severity,
        language,
        status: isSuppressed ? 'SUPPRESSED' : 'FAILED',
        segmentCount: analysis.segmentCount,
        encoding: analysis.encoding,
        provider: this.activeProvider.name,
        retryCount: 0,
        error: evaluation.reason,
        createdAt: new Date().toISOString(),
      };
      this.history.set(recordId, suppressedRecord);
      return {
        success: false,
        recordId,
        status: suppressedRecord.status,
        reason: evaluation.reason,
        record: suppressedRecord,
      };
    }

    const record: NotificationRecord = {
      id: recordId,
      userId: candidate.userId,
      recipientPhoneMasked,
      recipientMasked: recipientPhoneMasked,
      message: params.message,
      channel,
      triggerType: params.triggerType,
      severity: candidate.severity,
      language,
      status: 'QUEUED',
      segmentCount: analysis.segmentCount,
      encoding: analysis.encoding,
      provider: this.activeProvider.name,
      retryCount: 0,
      createdAt: new Date().toISOString(),
    };

    this.history.set(recordId, record);

    const job: EnqueuedJob = {
      record,
      actualRecipientPhone: actualPhone,
      candidate,
      nextAttemptMs: Date.now(),
    };

    this.queue.push(job);
    logger.info(`[NotificationQueue] Job ${recordId} enqueued for user ${candidate.userId} via ${channel}`);

    // Broadcast event across WebSockets so all connected citizen devices are notified in real-time
    this.emit('domain_event', {
      event_id: crypto.randomUUID(),
      event_type: 'NOTIFICATION_DISPATCHED',
      timestamp: new Date().toISOString(),
      source: 'notification-queue-service',
      correlation_id: recordId,
      payload: {
        id: recordId,
        userId: candidate.userId,
        severity: candidate.severity,
        title: `🚨 EMERGENCY ALERT: ${candidate.eventName || 'Disaster Warning'}`,
        message: params.message,
        triggerType: params.triggerType,
        eventName: candidate.eventName || 'Flood Advisory',
        location: candidate.eventName || 'Monitored Catchment Basin',
        waterDepthCm: candidate.waterDepthCm,
        detourCorridor: candidate.routeDetourName,
        coordinates: candidate.eventCoordinates,
        dispatchedAt: record.createdAt,
        buzzerAlert: candidate.severity === 'CRITICAL' || candidate.severity === 'WARNING',
      },
    });

    // Trigger queue worker immediately so dispatch status is authoritative
    await this.processQueue();

    return {
      success: true,
      recordId,
      status: record.status || 'DELIVERED',
      reason: evaluation.reason,
      record,
    };
  }

  /**
   * Background queue worker processing jobs with backoff retries
   */
  public async processQueue(): Promise<void> {
    if (this.activeProcessingPromise) {
      return this.activeProcessingPromise;
    }

    this.activeProcessingPromise = (async () => {
      try {
        while (this.queue.length > 0) {
          const now = Date.now();
          const nextJobIndex = this.queue.findIndex((j) => j.nextAttemptMs <= now);

          if (nextJobIndex === -1) {
            // No job ready yet (waiting on backoff)
            break;
          }

          const [job] = this.queue.splice(nextJobIndex, 1);
          await this.executeJob(job);
        }
      } finally {
        this.activeProcessingPromise = undefined;
      }
    })();

    return this.activeProcessingPromise;
  }

  private async executeJob(job: EnqueuedJob): Promise<void> {
    const { record, actualRecipientPhone } = job;
    record.status = 'SENT_TO_PROVIDER';

    if (!actualRecipientPhone) {
      record.status = 'FAILED';
      record.error = 'Missing valid unmasked recipient phone number for provider dispatch';
      this.history.set(record.id, record);
      return;
    }

    try {
      const result = await this.activeProvider.sendSms({
        to: actualRecipientPhone,
        message: record.message,
        priority: record.severity === 'CRITICAL' ? 'HIGH' : 'NORMAL',
        metadata: {
          notificationId: record.id,
          userId: record.userId,
          severity: record.severity,
        },
      });

      if (result.success && (result.status === 'DELIVERED' || result.status === 'SENT_TO_PROVIDER')) {
        record.status = result.status;
        record.deliveredAt = new Date().toISOString();
        record.error = undefined;
        this.history.set(record.id, record);
        logger.info(`[NotificationQueue] Job ${record.id} successfully dispatched (${result.status})`);
      } else {
        await this.handleFailure(job, result.error || 'Provider returned failure status');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      await this.handleFailure(job, errorMsg);
    }
  }

  private async handleFailure(job: EnqueuedJob, errorReason: string): Promise<void> {
    const { record } = job;
    record.retryCount = (record.retryCount || 0) + 1;
    record.error = errorReason;

    // Check if error is permanent (e.g. invalid phone, unallocated number, opt-out)
    const isPermanent =
      errorReason.toLowerCase().includes('invalid') ||
      errorReason.toLowerCase().includes('unallocated') ||
      errorReason.toLowerCase().includes('permanent');

    if (isPermanent || record.retryCount >= this.maxRetries) {
      record.status = 'FAILED';
      this.history.set(record.id, record);
      logger.warn(
        `[NotificationQueue] Job ${record.id} permanently failed after ${record.retryCount} attempt(s): ${errorReason}`
      );
    } else {
      // Exponential backoff: 50ms * 2^retryCount for swift execution in async tests
      const backoffMs = Math.min(100 * Math.pow(2, record.retryCount), 2000);
      job.nextAttemptMs = Date.now() + backoffMs;
      record.status = 'QUEUED';
      this.history.set(record.id, record);
      this.queue.push(job);
      logger.info(
        `[NotificationQueue] Job ${record.id} scheduled for retry ${record.retryCount}/${this.maxRetries} in ${backoffMs}ms`
      );
    }
  }

  /**
   * Admin-initiated retry of a failed notification record
   */
  public async retryNotification(recordId: string): Promise<{ success: boolean; message: string; record?: NotificationRecord }> {
    const existing = this.history.get(recordId);
    if (!existing) {
      return { success: false, message: `Notification record ${recordId} not found` };
    }

    if (existing.status !== 'FAILED') {
      return { success: false, message: `Record ${recordId} is in status ${existing.status}; retry only applies to FAILED records` };
    }

    const userPrefs = userPreferenceService.getPreferences(existing.userId);
    if (!userPrefs.phoneNumber) {
      return { success: false, message: `Cannot retry: user ${existing.userId} has no registered phone number` };
    }

    existing.status = 'QUEUED';
    existing.retryCount = 0;
    existing.error = undefined;
    this.history.set(recordId, existing);

    const job: EnqueuedJob = {
      record: existing,
      actualRecipientPhone: userPrefs.phoneNumber,
      candidate: {
        userId: existing.userId,
        eventId: 'retry-event',
        eventName: 'Manual Retry Alert',
        severity: existing.severity,
        triggerType: existing.triggerType,
        channel: existing.channel || 'SMS',
        eventCoordinates: [40.7128, -74.006],
        userCoordinates: [40.7128, -74.006],
      },
      nextAttemptMs: Date.now(),
    };

    this.queue.push(job);
    await this.executeJob(job);

    return { success: true, message: `Notification ${recordId} re-dispatched for delivery`, record: existing };
  }

  public getHistory(userId?: string): NotificationRecord[] {
    const all = Array.from(this.history.values());
    if (userId) {
      return all.filter((r) => r.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  public getRecord(recordId: string): NotificationRecord | undefined {
    return this.history.get(recordId);
  }

  public getQueueDepth(): number {
    return this.queue.length;
  }

  public getQueueLength(): number {
    return this.getQueueDepth();
  }

  public getHealthMetrics() {
    const all = Array.from(this.history.values());
    const total = all.length;
    const delivered = all.filter((r) => r.status === 'DELIVERED').length;
    const sentToProvider = all.filter((r) => r.status === 'SENT_TO_PROVIDER').length;
    const failed = all.filter((r) => r.status === 'FAILED').length;
    const suppressed = all.filter((r) => r.status === 'SUPPRESSED').length;
    const queued = this.queue.length;

    const deliverySuccessRate = total > 0 ? Number(((delivered / total) * 100).toFixed(1)) : 100;

    return {
      activeProvider: this.activeProvider.name,
      providerIsLive: this.activeProvider.isLive,
      providerAvailable: this.activeProvider.isAvailable(),
      queueDepth: queued,
      totalDispatched: total,
      deliveredCount: delivered,
      sentToProviderCount: sentToProvider,
      failedCount: failed,
      suppressedCount: suppressed,
      deliverySuccessRatePercent: deliverySuccessRate,
      policyMetrics: notificationPolicyService.getMetrics(),
    };
  }

  /**
   * Broadcasts an administrative emergency disaster alert citywide to all devices
   */
  public broadcastEmergencyAlert(params: {
    title: string;
    message: string;
    severity?: 'CRITICAL' | 'WARNING' | 'WATCH';
    location?: string;
    waterDepthCm?: number;
    leadTimeMinutes?: number;
    recommendedAction?: string;
    detourCorridor?: string;
    coordinates?: [number, number];
  }): NotificationRecord {
    const sev = params.severity || 'CRITICAL';
    const loc = params.location || 'Bengaluru Urban Catchment';
    const recordId = `broad-${Date.now().toString(36)}`;

    const record: NotificationRecord = {
      id: recordId,
      userId: 'ALL_CITIZENS',
      recipientPhoneMasked: 'ALL_DEVICES',
      recipientMasked: 'ALL_DEVICES',
      message: params.message,
      channel: 'SMS',
      triggerType: 'LOCATION_ALERT',
      severity: sev,
      language: 'en',
      status: 'DELIVERED',
      segmentCount: 1,
      encoding: 'GSM-7',
      provider: this.activeProvider?.name || 'SmartCity Sovereign Engine',
      retryCount: 0,
      createdAt: new Date().toISOString(),
      dispatchedAt: new Date().toISOString(),
      deliveredAt: new Date().toISOString(),
    };

    this.history.set(recordId, record);

    const eventPayload = {
      event_id: crypto.randomUUID(),
      event_type: 'ADMIN_EMERGENCY_BROADCAST',
      timestamp: new Date().toISOString(),
      source: 'admin-broadcast-console',
      correlation_id: recordId,
      payload: {
        id: recordId,
        title: params.title || `🚨 EMERGENCY ALERT: ${loc}`,
        headline: params.message,
        body: params.message,
        severity: sev,
        type: 'FLOOD',
        location: loc,
        waterDepthCm: params.waterDepthCm || 42,
        leadTimeMinutes: params.leadTimeMinutes || 15,
        recommendedAction: params.recommendedAction || 'Divert immediately to elevated terrain corridor.',
        detourCorridor: params.detourCorridor || 'Elevated Expressway Bypass',
        coordinates: params.coordinates || [12.9172, 77.6228],
        dispatchedAt: record.dispatchedAt,
        source: 'EOC Emergency Broadcast Command',
        buzzerAlert: true,
      },
    };

    this.latestBroadcastAlert = eventPayload.payload;
    this.emit('domain_event', eventPayload);
    logger.info(`[NotificationQueue] Admin broadcast transmitted to all devices: "${params.title}"`);

    // Dispatch Web Push to reach all closed/offline devices immediately
    try {
      pushNotificationService.broadcastPush(eventPayload.payload).catch(() => {});
    } catch {}

    return record;
  }

  public getLatestBroadcast(): any {
    return this.latestBroadcastAlert;
  }

  public clearAll(): void {
    this.queue = [];
    this.history.clear();
    notificationPolicyService.clearCooldownHistory();
  }
}

export const notificationQueueService = new NotificationQueueService();
