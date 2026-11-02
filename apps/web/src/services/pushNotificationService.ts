import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { getApiBaseUrl } from './apiConfig';

class PushNotificationClientService {
  private isSubscribed = false;
  private swRegistration: ServiceWorkerRegistration | null = null;

  public async init(): Promise<void> {
    if (typeof window === 'undefined') return;

    // 1. Configure Native Android Push & Notification Channel (Capacitor)
    if (Capacitor.isNativePlatform() || Capacitor.getPlatform() === 'android') {
      try {
        await LocalNotifications.createChannel({
          id: 'disaster-alerts',
          name: 'Emergency Life Safety & Disaster Warnings',
          description: 'High-priority emergency alerts and evacuation early warnings with loud buzzer',
          importance: 5, // IMPORTANCE_HIGH (Shows heads-up notification banner even when locked)
          visibility: 1, // VISIBILITY_PUBLIC (Visible on secure lock screen)
          vibration: true,
          lights: true,
          lightColor: '#EF4444',
        });

        const perms = await LocalNotifications.checkPermissions();
        if (perms.display !== 'granted') {
          await LocalNotifications.requestPermissions();
        }
      } catch (err) {
        console.warn('[PushService] Capacitor channel setup warning:', err);
      }
    }

    // 2. Register Service Worker for Background Web Push (Active when app is closed)
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        this.swRegistration = reg;
        console.log('[PushService] Emergency Service Worker registered with scope:', reg.scope);

        // Register periodic background sync if supported
        if ('periodicSync' in reg) {
          try {
            await (reg as any).periodicSync.register('check-disaster-alerts', {
              minInterval: 5 * 60 * 1000, // 5 minutes
            });
          } catch {}
        }

        // Subscribe to Web Push
        await this.subscribeToPush(reg);
      } catch (err) {
        console.warn('[PushService] Service worker registration warning:', err);
      }
    }
  }

  public getRegistration(): ServiceWorkerRegistration | null {
    return this.swRegistration;
  }

  public async subscribeToPush(registration: ServiceWorkerRegistration): Promise<void> {
    if (this.isSubscribed || !('PushManager' in window)) return;

    try {
      const apiBase = getApiBaseUrl();
      let sub = await registration.pushManager.getSubscription();

      if (!sub) {
        // Fetch server's public VAPID key
        let applicationServerKey: string | undefined;
        try {
          const keyRes = await fetch(`${apiBase}/api/v1/push/public-key`);
          if (keyRes.ok) {
            const data = await keyRes.json();
            applicationServerKey = data.publicKey;
          }
        } catch {}

        sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey || 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuNuB008f1bQ2b8',
        });
      }

      if (sub) {
        // Transmit subscription to backend
        const rawKey = sub.getKey ? sub.getKey('p256dh') : null;
        const rawAuth = sub.getKey ? sub.getKey('auth') : null;

        const p256dh = rawKey ? btoa(String.fromCharCode(...new Uint8Array(rawKey))) : '';
        const auth = rawAuth ? btoa(String.fromCharCode(...new Uint8Array(rawAuth))) : '';

        await fetch(`${apiBase}/api/v1/push/subscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: sub.endpoint,
            keys: { p256dh, auth },
            platform: Capacitor.getPlatform(),
            userId: localStorage.getItem('scg_user_id') || 'citizen-device',
          }),
        });

        this.isSubscribed = true;
        console.log('[PushService] Successfully subscribed device to background emergency push');
      }
    } catch (err) {
      console.warn('[PushService] Web push subscription warning:', err);
    }
  }
}

export const pushNotificationClientService = new PushNotificationClientService();
