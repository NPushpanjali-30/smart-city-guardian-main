import { Router, Request, Response } from 'express';
import { pushNotificationService } from '../../services/notifications/pushNotification.service.js';

export const pushRouter = Router();

// Standard VAPID public key
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuNuB008f1bQ2b8';

/**
 * GET /api/v1/push/public-key
 */
pushRouter.get('/public-key', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    publicKey: VAPID_PUBLIC_KEY,
  });
});

/**
 * POST /api/v1/push/subscribe
 * Registers a citizen device PushSubscription to receive notifications even when app is closed
 */
pushRouter.post('/subscribe', (req: Request, res: Response) => {
  try {
    const { endpoint, keys, userId, platform } = req.body;
    if (!endpoint) {
      res.status(400).json({ error: 'Endpoint is required for push subscription' });
      return;
    }

    const record = pushNotificationService.registerSubscription({
      endpoint,
      keys,
      userId,
      platform,
    });

    res.status(200).json({
      status: 'ok',
      success: true,
      subscriptionId: record.id,
      totalSubscribers: pushNotificationService.getSubscriptionsCount(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to register push subscription' });
  }
});

/**
 * POST /api/v1/push/unsubscribe
 */
pushRouter.post('/unsubscribe', (req: Request, res: Response) => {
  const { endpoint } = req.body;
  if (endpoint) {
    pushNotificationService.unregisterSubscription(endpoint);
  }
  res.status(200).json({ status: 'ok' });
});

/**
 * POST /api/v1/push/broadcast
 * Dispatches an instant push to all registered closed/offline apps
 */
pushRouter.post('/broadcast', async (req: Request, res: Response) => {
  try {
    const alert = req.body.alert || req.body;
    const result = await pushNotificationService.broadcastPush(alert);
    res.status(200).json({
      status: 'ok',
      success: true,
      dispatched: result.dispatched,
      total: result.total,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to dispatch push broadcast' });
  }
});
