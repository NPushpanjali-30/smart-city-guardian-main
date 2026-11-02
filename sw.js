// Smart City Guardian - Sovereign Emergency Service Worker
// Enables Background Notifications when App is Closed & Instant OTA Auto-Updates

const SW_VERSION = '2.1.0';
const CACHE_NAME = `scg-assets-${SW_VERSION}`;

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// 1. Instant Push Notification Listener (Wakes up device when app is closed)
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { message: event.data ? event.data.text() : 'High Priority Disaster Alert' };
  }

  const title = data.title || '🚨 EMERGENCY ALERT: Smart City Guardian';
  const body = data.headline || data.message || data.body || 'Immediate flood hazard warning. Follow safe elevated routes.';
  const coordinates = data.coordinates || [12.9172, 77.6228];

  const notificationOptions = {
    body,
    icon: '/shield.svg',
    badge: '/shield.svg',
    vibrate: [500, 150, 500, 150, 800],
    tag: data.id || `disaster-${Date.now()}`,
    renotify: true,
    requireInteraction: true,
    silent: false,
    timestamp: Date.now(),
    data: {
      url: '/#map',
      alertId: data.id,
      coordinates,
      severity: data.severity || 'CRITICAL',
    },
    actions: [
      { action: 'open_map', title: '🗺️ Open Live Map' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, notificationOptions));
});

// 2. Notification Click Action Handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          if (client.navigate) {
            client.navigate('/#map');
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('/#map');
      }
    })
  );
});

// 3. Periodic Background Sync (Checks for active emergency broadcasts when OS wakes up worker)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-disaster-alerts') {
    event.waitUntil(
      fetch('/api/v1/alerts/latest')
        .then((r) => (r.ok ? r.json() : null))
        .then((res) => {
          if (res?.hasActiveAlert && res.alert) {
            const a = res.alert;
            return self.registration.showNotification(a.title || '🚨 EMERGENCY ALERT', {
              body: a.headline || a.body,
              icon: '/shield.svg',
              badge: '/shield.svg',
              vibrate: [500, 150, 500, 150, 800],
              tag: a.id,
              requireInteraction: true,
            });
          }
        })
        .catch(() => {})
    );
  }
});

// 4. Instant Zero-Click Auto-Update Listener
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
