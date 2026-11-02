import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  formatLocalizedAlert,
  calculateSmsSegments,
  LanguageCode,
  FloodSeverity,
  NotificationTriggerType,
  NotificationChannel,
  LocalizedNotificationTemplate,
} from '@smartcity/shared';
import { userPreferenceService } from '../../services/notifications/userPreference.service.js';
import {
  notificationPolicyService,
  AlertEvaluationCandidate,
} from '../../services/notifications/notificationPolicy.service.js';
import { notificationQueueService } from '../../services/notifications/notificationQueue.service.js';
import { mockSmsProvider, MockSmsSimulationMode } from '../../providers/sms/mockSmsProvider.js';
import { TextBeeSmsAdapter } from '../../providers/sms/textBeeSmsAdapter.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';

export const alertsRouter = Router();

const SendSmsSimulationSchema = z.object({
  phoneNumber: z.string().optional(),
  to: z.string().optional(),
  message: z.string().optional(),
  headline: z.string().optional(),
  zone: z.string().optional(),
  location: z.string().optional(),
  severity: z.enum(['WATCH', 'WARNING', 'CRITICAL', 'NORMAL']).optional().default('CRITICAL'),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']).optional(),
  language: z.enum(['en', 'hi', 'kn']).optional(),
});

/**
 * Direct mock/live SMS emergency dispatch handler
 * POST /api/v1/alerts/send-sms and POST /api/v1/alerts/simulate-sms
 */
export const handleSendSmsDispatch = async (req: Request, res: Response) => {
  try {
    const data = SendSmsSimulationSchema.parse(req.body);
    const rawPhone = data.phoneNumber || data.to;
    if (!rawPhone) {
      return res.status(400).json({
        status: 'error',
        success: false,
        error: 'Valid recipient phone number is required (+91 followed by 10 digits starting with 6-9)',
        message: 'Valid recipient phone number is required (+91 followed by 10 digits starting with 6-9)',
      });
    }
    const normalizedPhone = userPreferenceService.normalizePhoneNumber(rawPhone);
    if (!userPreferenceService.validatePhoneNumber(normalizedPhone)) {
      return res.status(400).json({
        status: 'error',
        success: false,
        error: 'Valid recipient phone number is required (+91 followed by 10 digits starting with 6-9)',
        message: 'Valid recipient phone number is required (+91 followed by 10 digits starting with 6-9)',
      });
    }
    const zoneName = data.zone || data.location || 'Local Sector';
    const severity = (data.severity || 'CRITICAL') as 'WATCH' | 'WARNING' | 'CRITICAL';
    const maskedPhone = userPreferenceService.maskPhoneNumber(normalizedPhone);

    const active = notificationQueueService.getActiveProvider();
    const messageText =
      data.message ||
      data.headline ||
      `${severity} FLOOD ALERT: Severe water risk in ${zoneName}. Please take caution and use high-elevation routes.`;

    const smsResult = await active.sendSms({
      to: normalizedPhone,
      message: messageText,
      priority: (data.priority as any) || 'HIGH',
    });

    if (!smsResult.success) {
      return res.status(400).json({
        status: 'error',
        success: false,
        error: smsResult.error || 'Failed to dispatch SMS through gateway',
        message: smsResult.error || 'Failed to dispatch SMS through gateway',
        dispatch: {
          provider: active.name,
          recipientPhone: normalizedPhone,
          status: 'FAILED',
          error: smsResult.error,
        },
      });
    }

    const assignedId = smsResult.messageId || `SM_sim_${Date.now()}`;
    res.status(200).json({
      status: 'ok',
      success: true,
      messageId: assignedId,
      message: smsResult.provider.includes('test-mode') ? 'SMS sent in safe test mode' : 'SMS sent successfully',
      dispatch: {
        provider: active.name,
        messageId: assignedId,
        recipientMasked: maskedPhone,
        recipientPhone: normalizedPhone,
        severity,
        zone: zoneName,
        smsContent: messageText,
        dispatchedAt: new Date().toISOString(),
        deduplicated: false,
        status: smsResult.status,
        encoding: smsResult.encoding,
        segmentCount: smsResult.segmentCount,
      },
    });
  } catch (err: any) {
    res.status(400).json({
      status: 'error',
      success: false,
      error: err.message || 'Invalid SMS dispatch parameters',
      message: err.message || 'Invalid SMS dispatch parameters',
    });
  }
};

const UpdatePreferencesSchema = z.object({
  userId: z.string().optional().default('demo-user-1'),
  phoneNumber: z.string().optional(),
  smsOptIn: z.boolean().optional(),
  preferredLanguage: z.enum(['en', 'hi', 'kn']).optional(),
  minSeverity: z.enum(['NORMAL', 'WATCH', 'WARNING', 'CRITICAL']).optional(),
  alertRadiusKm: z.number().positive().optional(),
  channels: z.array(z.enum(['IN_APP', 'SMS', 'PUSH', 'EMAIL'])).optional(),
});

const DispatchNotificationSchema = z.object({
  userId: z.string().optional().default('demo-user-1'),
  phoneNumber: z.string().optional(),
  targetPhoneNumber: z.string().optional(),
  bypassCooldown: z.boolean().optional().default(true),
  eventId: z.string().default('flood-event-manual'),
  eventName: z.string().default('Hazard Zone'),
  severity: z.enum(['NORMAL', 'WATCH', 'WARNING', 'CRITICAL']).default('CRITICAL'),
  triggerType: z
    .enum(['LOCATION_ALERT', 'DESTINATION_ALERT', 'ROUTE_ALERT', 'BROADCAST_ALERT'])
    .default('LOCATION_ALERT'),
  channel: z.enum(['IN_APP', 'SMS', 'PUSH', 'EMAIL']).default('SMS'),
  language: z.enum(['en', 'hi', 'kn']).optional(),
  customMessage: z.string().optional(),
  eventCoordinates: z.tuple([z.number(), z.number()]).default([40.715, -74.01]),
  userCoordinates: z.tuple([z.number(), z.number()]).optional(),
  destinationCoordinates: z.tuple([z.number(), z.number()]).optional(),
  routeCoordinates: z.array(z.tuple([z.number(), z.number()])).optional(),
  eventUpdatedAt: z.string().optional(),
  waterDepthCm: z.number().optional(),
  routeDetourName: z.string().optional(),
  travelTimeDeltaMin: z.number().optional(),
  skipPolicyCheck: z.boolean().optional(),
});

const SimulationModeSchema = z.object({
  mode: z.enum(['SUCCESS', 'TRANSIENT_FAILURE', 'PERMANENT_FAILURE', 'RATE_LIMITED']),
});

const MOCK_ALERTS = [
  {
    id: 'alert-001',
    severity: 'CRITICAL',
    headline: 'CRITICAL FLASH FLOOD WARNING — Bay Street Corridor Submerged',
    body: 'Continuous violent rainfall has caused water depths up to 28cm on Bay Street Boulevard. Road barricades are active. Avoid all low-elevation underpasses. Detour via Highland Avenue.',
    affectedZone: 'Bay Basin Lowlands',
    smsSummary: 'CRITICAL FLASH FLOOD: Bay St closed due to water accumulation. Detour via Highland Ave. Avoid low underpasses.',
    dispatchedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    recipientsReached: 1420,
  },
  {
    id: 'alert-002',
    severity: 'WARNING',
    headline: 'FLOOD ADVISORY — East River Concourse Lane Restrictions',
    body: 'Rising water levels near riverbank concourse. Right lane closed. Speed limit reduced to 25 km/h.',
    affectedZone: 'East River Concourse',
    smsSummary: 'FLOOD WARNING: Water pooling on East River Concourse. Reduce speed and follow designated detours.',
    dispatchedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    recipientsReached: 890,
  },
];

/**
 * GET /api/v1/alerts
 */
alertsRouter.get('/', (req: Request, res: Response) => {
  const recentHistory = notificationQueueService.getHistory();
  res.status(200).json({
    status: 'ok',
    count: MOCK_ALERTS.length + recentHistory.length,
    data: [
      ...recentHistory.map((h) => ({
        id: h.id,
        severity: h.severity,
        headline: `${h.severity} ALERT: ${h.triggerType}`,
        body: h.message,
        affectedZone: 'Local Sector',
        smsSummary: h.message,
        dispatchedAt: h.createdAt,
        recipientsReached: h.status === 'DELIVERED' ? 1 : 0,
        status: h.status,
        recipientMasked: h.recipientMasked,
        language: h.language,
      })),
      ...MOCK_ALERTS,
    ],
  });
});

/**
 * Emergency SMS Dispatch & Simulation:
 * POST /api/v1/alerts/send-sms and POST /api/v1/alerts/simulate-sms
 */
alertsRouter.post('/send-sms', handleSendSmsDispatch);
alertsRouter.post('/simulate-sms', handleSendSmsDispatch);

/**
 * GET /api/v1/alerts/preferences or /api/v1/notifications/preferences
 */
alertsRouter.get('/preferences', (req: Request, res: Response) => {
  const userId = (req.query.userId as string) || 'demo-user-1';
  const prefs = userPreferenceService.getPreferences(userId);
  res.status(200).json({
    status: 'ok',
    data: prefs,
  });
});

/**
 * PUT /api/v1/alerts/preferences or /api/v1/notifications/preferences
 */
alertsRouter.put('/preferences', (req: Request, res: Response) => {
  const body = UpdatePreferencesSchema.parse(req.body);
  const userId = body.userId || 'demo-user-1';

  try {
    const updated = userPreferenceService.updatePreferences(userId, {
      phoneNumber: body.phoneNumber,
      smsOptIn: body.smsOptIn,
      preferredLanguage: body.preferredLanguage,
      minSeverity: body.minSeverity,
      alertRadiusKm: body.alertRadiusKm,
      channels: body.channels,
    });
    res.status(200).json({
      status: 'ok',
      message: 'Preferences updated successfully',
      data: updated,
    });
  } catch (err: any) {
    res.status(400).json({
      status: 'error',
      message: err.message || 'Failed to update preferences',
    });
  }
});

/**
 * GET /api/v1/alerts/history or /api/v1/notifications/history
 */
alertsRouter.get('/history', (req: Request, res: Response) => {
  const userId = req.query.userId as string | undefined;
  const history = notificationQueueService.getHistory(userId);
  res.status(200).json({
    status: 'ok',
    count: history.length,
    data: history,
  });
});

/**
 * POST /api/v1/alerts/calculate-segments
 */
alertsRouter.post('/calculate-segments', (req: Request, res: Response) => {
  const { message } = req.body;
  if (typeof message !== 'string') {
    res.status(400).json({ status: 'error', message: 'Message text must be a string' });
    return;
  }
  const analysis = calculateSmsSegments(message);
  res.status(200).json({
    status: 'ok',
    data: analysis,
  });
});

/**
 * POST /api/v1/alerts/dispatch
 * Evaluates policy and dispatches / enqueues localized notification
 */
alertsRouter.post('/dispatch', requireAuth, async (req: Request, res: Response) => {
  try {
    const body = DispatchNotificationSchema.parse(req.body);
    const userId = body.userId;
    const userPrefs = userPreferenceService.getPreferences(userId);
    const targetLanguage: LanguageCode = body.language || userPrefs.preferredLanguage || 'en';

    // If explicit recipient phone number is provided, prioritize it and normalize to E.164
    let recipientPhone = body.phoneNumber || body.targetPhoneNumber;
    if (recipientPhone) {
      recipientPhone = userPreferenceService.normalizePhoneNumber(recipientPhone);
      userPrefs.phoneNumber = recipientPhone;
      userPrefs.phoneNumberMasked = userPreferenceService.maskPhoneNumber(recipientPhone);
      userPreferenceService.updatePreferences(userId, { phoneNumber: recipientPhone, smsOptIn: true });
    }

    // If no explicit coordinates provided, default to demo user coords near zone
    const userCoords = body.userCoordinates || [40.718, -74.008];

    const candidate: AlertEvaluationCandidate = {
      userId,
      eventId: body.eventId,
      eventName: body.eventName,
      severity: body.severity,
      triggerType: body.triggerType,
      channel: body.channel,
      eventCoordinates: body.eventCoordinates,
      userCoordinates: userCoords,
      destinationCoordinates: body.destinationCoordinates,
      routeCoordinates: body.routeCoordinates,
      eventUpdatedAt: body.eventUpdatedAt,
      waterDepthCm: body.waterDepthCm,
      targetPhoneNumber: recipientPhone,
      bypassCooldown: body.bypassCooldown,
    };

    let messageText = body.customMessage;
    if (!messageText) {
      const templateKey: 'LOCATION_ALERT' | 'DESTINATION_ALERT' | 'ROUTE_ALERT' =
        body.triggerType === 'ROUTE_ALERT'
          ? 'ROUTE_ALERT'
          : body.triggerType === 'DESTINATION_ALERT'
          ? 'DESTINATION_ALERT'
          : 'LOCATION_ALERT';

      const localized = formatLocalizedAlert({
        template: templateKey,
        language: targetLanguage,
        severity: body.severity,
        eventName: body.eventName,
        distanceKm: 1.2,
        waterDepthCm: body.waterDepthCm || 20,
        destination: 'Workplace Plaza',
        routeDetourName: body.routeDetourName || 'Highland Parkway',
        travelTimeDeltaMin: body.travelTimeDeltaMin || 14,
      });
      messageText = localized.smsSummary;
    }

    const result = await notificationQueueService.enqueue({
      candidate,
      message: messageText,
      triggerType: body.triggerType,
      channel: body.channel,
      language: targetLanguage,
      skipPolicyCheck: body.skipPolicyCheck,
      targetPhoneNumber: recipientPhone,
      bypassCooldown: body.bypassCooldown,
    });

    res.status(result.success ? 200 : 422).json({
      ...result,
      dispatchResult: result.success ? 'ok' : 'suppressed_or_rejected',
    });
  } catch (err: any) {
    res.status(400).json({
      status: 'error',
      message: err.message || 'Invalid dispatch parameters',
    });
  }
});

/**
 * GET /api/v1/alerts/provider/config
 */
alertsRouter.get('/provider/config', (req: Request, res: Response) => {
  const active = notificationQueueService.getActiveProvider();
  res.status(200).json({
    status: 'ok',
    providerName: active.name,
    isLive: active.isLive,
    isAvailable: active.isAvailable(),
  });
});

/**
 * POST /api/v1/alerts/provider/configure
 */
alertsRouter.post('/provider/configure', requireRole('ADMIN'), (req: Request, res: Response) => {
  const { providerType, twilio, fast2sms, textbee, httpGateway, carrierEmail } = req.body;
  if (!providerType) {
    return res.status(400).json({
      status: 'error',
      message: 'providerType is required (twilio, fast2sms, textbee, http_gateway, carrier_email, mock)',
    });
  }

  let options: any;
  if (providerType === 'twilio') options = twilio;
  else if (providerType === 'fast2sms') options = fast2sms;
  else if (providerType === 'textbee') options = textbee;
  else if (providerType === 'http_gateway') options = httpGateway;
  else if (providerType === 'carrier_email') options = carrierEmail;

  const provider = notificationQueueService.configureGateway(providerType, options);

  res.status(200).json({
    status: 'ok',
    message: `SMS gateway configured to ${provider.name}`,
    activeProvider: provider.name,
    isLive: provider.isLive,
    isAvailable: provider.isAvailable(),
  });
});

/**
 * GET & POST /api/v1/alerts/sms/test-connection
 * Tests TextBee Gateway connection, API key authentication, and device online status.
 */
alertsRouter.all('/sms/test-connection', async (req: Request, res: Response) => {
  try {
    const active = notificationQueueService.getActiveProvider();
    let result;
    if (active instanceof TextBeeSmsAdapter || 'testConnection' in active) {
      result = await (active as any).testConnection();
    } else {
      const tb = new TextBeeSmsAdapter();
      result = await tb.testConnection();
    }

    res.status(200).json({
      ...result,
      status: result.status,
      success: result.success,
    });
  } catch (err: any) {
    res.status(500).json({
      status: 'error',
      success: false,
      message: err.message || 'Error testing SMS gateway connection',
    });
  }
});

/**
 * POST /api/v1/alerts/provider/test
 */
alertsRouter.post('/provider/test', requireRole('ADMIN'), async (req: Request, res: Response) => {
  const { phoneNumber, message } = req.body;
  if (!phoneNumber) {
    return res.status(400).json({ status: 'error', message: 'phoneNumber is required' });
  }

  const active = notificationQueueService.getActiveProvider();
  const testMsg = message || `Smart City Guardian Test SMS: Alert gateway active at ${new Date().toLocaleTimeString()}`;

  try {
    const normalizedPhone = userPreferenceService.normalizePhoneNumber(phoneNumber);
    const result = await active.sendSms({
      to: normalizedPhone,
      message: testMsg,
      priority: 'HIGH',
    });

    res.status(result.success ? 200 : 400).json({
      status: result.success ? 'ok' : 'error',
      result,
      provider: active.name,
    });
  } catch (err: any) {
    res.status(500).json({
      status: 'error',
      message: err.message || 'SMS test send failed',
    });
  }
});

/**
 * GET /api/v1/alerts/health or /api/v1/admin/notifications/health
 */
alertsRouter.get('/health', (req: Request, res: Response) => {
  const metrics = notificationQueueService.getHealthMetrics();
  res.status(200).json({
    status: 'ok',
    data: metrics,
  });
});

/**
 * POST /api/v1/alerts/retry/:id
 */
alertsRouter.post('/retry/:id', async (req: Request, res: Response) => {
  const recordId = req.params.id;
  const result = await notificationQueueService.retryNotification(recordId);
  res.status(result.success ? 200 : 400).json({
    status: result.success ? 'ok' : 'error',
    ...result,
  });
});

/**
 * POST /api/v1/alerts/provider/simulation-mode
 */
alertsRouter.post('/provider/simulation-mode', (req: Request, res: Response) => {
  const body = SimulationModeSchema.parse(req.body);
  mockSmsProvider.setSimulationMode(body.mode as MockSmsSimulationMode);
  res.status(200).json({
    status: 'ok',
    message: `Provider simulation mode set to ${body.mode}`,
    mode: body.mode,
  });
});

/**
 * POST /api/v1/alerts/broadcast
 * Public / authenticated broadcast dispatcher for EOC and drill tests
 */
alertsRouter.post('/broadcast', (req: Request, res: Response) => {
  try {
    const {
      title,
      message,
      headline,
      severity = 'CRITICAL',
      location = 'Central Bengaluru Catchment',
      waterDepthCm = 40,
      leadTimeMinutes = 15,
      recommendedAction,
      detourCorridor,
      coordinates,
    } = req.body;

    const bodyText = message || headline || 'Emergency disaster alert issued.';
    const broadcastTitle = title || `🚨 EMERGENCY ALERT: ${location}`;

    const record = notificationQueueService.broadcastEmergencyAlert({
      title: broadcastTitle,
      message: bodyText,
      severity: severity as any,
      location,
      waterDepthCm,
      leadTimeMinutes,
      recommendedAction,
      detourCorridor,
      coordinates,
    });

    res.status(200).json({
      status: 'ok',
      success: true,
      broadcastId: record.id,
      timestamp: record.dispatchedAt,
      title: broadcastTitle,
      message: 'Emergency notification broadcasted to all connected devices.',
      record,
    });
  } catch (err: any) {
    res.status(400).json({
      status: 'error',
      success: false,
      message: err.message || 'Failed to dispatch broadcast',
    });
  }
});

/**
 * GET /api/v1/alerts/latest or /api/v1/alerts/latest-broadcast or /api/v1/alerts/active
 * Returns the latest active disaster broadcast so closed apps or background sync can catch up
 */
const handleLatestBroadcast = (_req: Request, res: Response) => {
  const latest = notificationQueueService.getLatestBroadcast();
  if (!latest) {
    res.status(200).json({
      status: 'ok',
      hasActiveAlert: false,
      alert: null,
      data: null,
    });
    return;
  }
  res.status(200).json({
    status: 'ok',
    hasActiveAlert: true,
    alert: latest,
    data: latest,
  });
};

alertsRouter.get('/latest', handleLatestBroadcast);
alertsRouter.get('/latest-broadcast', handleLatestBroadcast);
alertsRouter.get('/active', handleLatestBroadcast);
