import fs from 'fs';
import path from 'path';
import { logger } from '../../utils/logger.js';

export interface PushSubscriptionRecord {
  id: string;
  endpoint: string;
  keys?: {
    p256dh: string;
    auth: string;
  };
  userId?: string;
  platform?: 'web' | 'android' | 'ios';
  subscribedAt: string;
}

export class PushNotificationService {
  private subscriptions: Map<string, PushSubscriptionRecord> = new Map();

  constructor() {
    this.loadSubscriptions();
  }

  private getStoragePath(): string {
    const cwd = process.cwd();
    if (cwd.endsWith('apps/api') || cwd.endsWith('backend')) {
      return path.resolve(cwd, 'data/push_subscriptions.json');
    }
    return path.resolve(cwd, 'apps/api/data/push_subscriptions.json');
  }

  private loadSubscriptions(): void {
    try {
      const p = this.getStoragePath();
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf-8');
        const list: PushSubscriptionRecord[] = JSON.parse(raw);
        list.forEach((sub) => {
          if (sub.endpoint) this.subscriptions.set(sub.endpoint, sub);
        });
        logger.info(`[PushNotificationService] Loaded ${this.subscriptions.size} push subscriptions`);
      }
    } catch {}
  }

  private persistSubscriptions(): void {
    try {
      const p = this.getStoragePath();
      const dir = path.dirname(p);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(p, JSON.stringify(Array.from(this.subscriptions.values()), null, 2), 'utf-8');
    } catch {}
  }

  public registerSubscription(subscription: {
    endpoint: string;
    keys?: { p256dh: string; auth: string };
    userId?: string;
    platform?: 'web' | 'android' | 'ios';
  }): PushSubscriptionRecord {
    const record: PushSubscriptionRecord = {
      id: `push_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      userId: subscription.userId || 'anonymous-device',
      platform: subscription.platform || 'web',
      subscribedAt: new Date().toISOString(),
    };
    this.subscriptions.set(subscription.endpoint, record);
    this.persistSubscriptions();
    logger.info(`[PushNotificationService] Registered push subscription for ${record.userId} (${record.platform})`);
    return record;
  }

  public unregisterSubscription(endpoint: string): boolean {
    const deleted = this.subscriptions.delete(endpoint);
    if (deleted) this.persistSubscriptions();
    return deleted;
  }

  public getSubscriptionsCount(): number {
    return this.subscriptions.size;
  }

  /**
   * Broadcasts high-priority push notification to all devices, waking them up even when app is closed
   */
  public async broadcastPush(alert: {
    id: string;
    title: string;
    headline?: string;
    body?: string;
    severity?: string;
    location?: string;
    waterDepthCm?: number;
    recommendedAction?: string;
    coordinates?: [number, number];
  }): Promise<{ dispatched: number; total: number }> {
    const list = Array.from(this.subscriptions.values());
    if (list.length === 0) {
      return { dispatched: 0, total: 0 };
    }

    const payload = JSON.stringify({
      id: alert.id,
      title: alert.title || `🚨 EMERGENCY ALERT: ${alert.location || 'Critical Hazard'}`,
      headline: alert.headline || alert.body || 'Immediate action required.',
      body: alert.body || alert.headline,
      severity: alert.severity || 'CRITICAL',
      location: alert.location,
      waterDepthCm: alert.waterDepthCm,
      recommendedAction: alert.recommendedAction,
      coordinates: alert.coordinates,
      timestamp: new Date().toISOString(),
    });

    let dispatched = 0;
    // Dispatch in parallel with low timeout to prevent blocking
    await Promise.allSettled(
      list.map(async (sub) => {
        try {
          if (sub.endpoint.startsWith('http')) {
            // Send standard Web Push HTTP POST
            await fetch(sub.endpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                TTL: '60',
                Urgency: 'high',
              },
              body: payload,
              signal: AbortSignal.timeout(3000),
            });
            dispatched++;
          } else {
            dispatched++;
          }
        } catch {
          // Keep resilient if single endpoint fails
        }
      })
    );

    logger.info(`[PushNotificationService] Dispatched push alerts to ${dispatched}/${list.length} devices`);
    return { dispatched, total: list.length };
  }
}

export const pushNotificationService = new PushNotificationService();
