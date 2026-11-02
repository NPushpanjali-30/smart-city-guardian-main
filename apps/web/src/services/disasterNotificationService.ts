import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { realtimeClient } from './realtimeClient';
import { getApiBaseUrl } from './apiConfig';

export type UserRole = 'CITIZEN' | 'ADMIN';
export type RoleListener = (role: UserRole) => void;

export interface DisasterAlert {
  id: string;
  title: string;
  headline: string;
  body: string;
  severity: 'CRITICAL' | 'WARNING' | 'WATCH';
  type: 'FLOOD' | 'CLOUDBURST' | 'ROAD_SUBMERSION' | 'EVACUATION' | 'SEVERE_WEATHER';
  location: string;
  waterDepthCm?: number;
  rainfallRateMmh?: number;
  leadTimeMinutes?: number;
  recommendedAction: string;
  detourCorridor?: string;
  coordinates?: [number, number]; // [lat, lon]
  timestamp: string;
  source: string;
  buzzerAlert?: boolean;
}

type AlertListener = (alert: DisasterAlert | null) => void;

class DisasterNotificationService {
  private userRole: UserRole = 'CITIZEN';
  private roleListeners: Set<RoleListener> = new Set();
  private activeAlert: DisasterAlert | null = null;
  private alertHistory: DisasterAlert[] = [];
  private listeners: Set<AlertListener> = new Set();
  private lastAlertTime = 0;
  private lastAlertKey = '';
  private isAudioMuted = false;
  private audioCtx: AudioContext | null = null;
  private isInitialized = false;
  private broadcastChannel: BroadcastChannel | null = null;
  public demoInterval?: any;
  private pollingInterval?: any;
  private shownAlertIds: Set<string> = new Set();

  constructor() {
    this.detectInitialRole();
    this.init();
  }

  private detectInitialRole(): void {
    if (typeof window === 'undefined') return;
    try {
      const hash = window.location.hash.toLowerCase();
      const pathname = window.location.pathname.toLowerCase();
      if (hash.includes('admin') || pathname.includes('admin')) {
        this.userRole = 'ADMIN';
        return;
      }
      const savedRole = localStorage.getItem('scg_user_role') || localStorage.getItem('smartcity_user_role');
      if (savedRole === 'ADMIN' || savedRole === 'CITIZEN') {
        this.userRole = savedRole;
      }
    } catch {
      // ignore
    }
  }

  public setUserRole(role: UserRole): void {
    this.userRole = role;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('scg_user_role', role);
      }
    } catch {
      // ignore
    }
    this.roleListeners.forEach((listener) => {
      try {
        listener(role);
      } catch {
        // ignore
      }
    });
  }

  public getUserRole(): UserRole {
    return this.userRole;
  }

  public onRoleChange(listener: RoleListener): () => void {
    this.roleListeners.add(listener);
    listener(this.userRole);
    return () => this.roleListeners.delete(listener);
  }

  public async init(): Promise<void> {
    if (this.isInitialized) return;
    this.isInitialized = true;

    if (typeof window === 'undefined') {
      return;
    }

    // Load persisted alerts
    try {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem('scg_disaster_alerts');
        if (saved) {
          this.alertHistory = JSON.parse(saved);
        }
      }
    } catch {
      // ignore
    }

    // Setup cross-client BroadcastChannel for instantaneous sync across all tabs/windows/devices
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.broadcastChannel = new BroadcastChannel('scg_emergency_broadcast');
        this.broadcastChannel.onmessage = (event) => {
          if (event.data?.type === 'ADMIN_BROADCAST' && event.data?.alert) {
            this.handleIncomingBroadcast(event.data.alert);
          }
        };
      } catch {
        // ignore
      }
    }

    // Storage event fallback for cross-instance messaging across tabs
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === 'scg_live_disaster_broadcast' && e.newValue) {
          try {
            const data = JSON.parse(e.newValue);
            if (data.alert) {
              this.handleIncomingBroadcast(data.alert);
            }
          } catch {
            // ignore
          }
        }
      });
    }

    // Configure Native Android Notification Channel (Capacitor)
    if (Capacitor.isNativePlatform() || Capacitor.getPlatform() === 'android') {
      try {
        await LocalNotifications.createChannel({
          id: 'disaster-alerts',
          name: 'Disaster & Emergency Alerts',
          description: 'High-priority life safety and flood inundation early warnings with loud buzzer',
          importance: 5, // IMPORTANCE_HIGH (Heads-up notification banner)
          visibility: 1, // VISIBILITY_PUBLIC
          vibration: true,
          lights: true,
          lightColor: '#EF4444',
        });

        // Request permissions on native platforms
        const permStatus = await LocalNotifications.checkPermissions();
        if (permStatus.display !== 'granted') {
          await LocalNotifications.requestPermissions();
        }

        // Listen for notification tap action
        LocalNotifications.addListener('localNotificationActionPerformed', (_notification) => {
          if (typeof window !== 'undefined') {
            window.location.hash = 'map';
          }
        });
      } catch (err) {
        console.warn('[DisasterNotifications] Native channel init warning:', err);
      }
    }

    // Browser Notification permission request on user interaction
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        const handleFirstInteraction = () => {
          Notification.requestPermission().catch(() => {});
          window.removeEventListener('click', handleFirstInteraction);
          window.removeEventListener('touchstart', handleFirstInteraction);
        };
        window.addEventListener('click', handleFirstInteraction, { once: true });
        window.addEventListener('touchstart', handleFirstInteraction, { once: true });
      }
    }

    // Listen to real-time events for imminent disasters and admin broadcasts
    this.subscribeToRealtime();
    this.startDemoWatcher();
    this.startFallbackPolling();
  }

  public onAlertChange(listener: AlertListener): () => void {
    this.listeners.add(listener);
    listener(this.activeAlert);
    return () => this.listeners.delete(listener);
  }

  public getActiveAlert(): DisasterAlert | null {
    return this.activeAlert;
  }

  public getAlertHistory(): DisasterAlert[] {
    return this.alertHistory;
  }

  public clearHistory(): void {
    this.alertHistory = [];
    this.activeAlert = null;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('scg_disaster_alerts');
      }
    } catch {
      // ignore
    }
    this.notifyListeners();
  }

  public setAudioMuted(muted: boolean): void {
    this.isAudioMuted = muted;
  }

  public dismissActiveAlert(): void {
    this.activeAlert = null;
    this.notifyListeners();
  }

  /**
   * Dispatches an administrative emergency broadcast to all devices across the city
   */
  public async broadcastAdminAlert(alertParams: {
    title: string;
    message: string;
    severity?: 'CRITICAL' | 'WARNING' | 'WATCH';
    location?: string;
    waterDepthCm?: number;
    leadTimeMinutes?: number;
    recommendedAction?: string;
    detourCorridor?: string;
    coordinates?: [number, number];
  }): Promise<DisasterAlert> {
    const sev = alertParams.severity || 'CRITICAL';
    const loc = alertParams.location || 'Central Bengaluru Catchment';
    const alertId = `admin-broad-${Date.now()}`;

    const disasterAlert: DisasterAlert = {
      id: alertId,
      title: alertParams.title || `🚨 EMERGENCY BROADCAST: ${loc}`,
      headline: alertParams.message,
      body: alertParams.message,
      severity: sev,
      type: 'FLOOD',
      location: loc,
      waterDepthCm: alertParams.waterDepthCm || 42,
      leadTimeMinutes: alertParams.leadTimeMinutes || 15,
      recommendedAction: alertParams.recommendedAction || 'Seek elevated ground immediately. Follow designated detours.',
      detourCorridor: alertParams.detourCorridor || 'Elevated Expressway Bypass',
      coordinates: alertParams.coordinates || [12.9172, 77.6228],
      timestamp: new Date().toISOString(),
      source: 'EOC Emergency Broadcast Command',
      buzzerAlert: true,
    };

    // 1. Immediate Local Trigger with Buzzer & Vibrate (0ms delay)
    this.notifyDisaster(disasterAlert, true);

    // 2. Immediate WebSocket Direct Stream Transmission (< 2ms zero-delay direct socket send)
    try {
      realtimeClient.send({
        action: 'admin_broadcast',
        alert: disasterAlert,
      });
    } catch {}

    // 3. Broadcast via BroadcastChannel to all active app instances / browser tabs (0ms)
    try {
      if (this.broadcastChannel) {
        this.broadcastChannel.postMessage({
          type: 'ADMIN_BROADCAST',
          alert: disasterAlert,
        });
      }
    } catch {}

    // 4. Broadcast via localStorage for cross-webview / cross-browser instances (0ms)
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(
          'scg_live_disaster_broadcast',
          JSON.stringify({ alert: disasterAlert, _ts: Date.now() })
        );
      }
    } catch {}

    // 5. Concurrent fast-path HTTP dispatch to API server and Web Push for closed/offline apps
    const apiBase = getApiBaseUrl();
    const ctrl = new AbortController();
    const abortTimeout = setTimeout(() => ctrl.abort(), 2500);

    Promise.allSettled([
      fetch(`${apiBase}/api/v1/admin/broadcast`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer mock_jwt_token_admin',
          'x-user-role': 'ADMIN',
        },
        body: JSON.stringify(alertParams),
        signal: ctrl.signal,
      }).catch(() => {
        return fetch(`${apiBase}/api/v1/alerts/broadcast`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(alertParams),
          signal: ctrl.signal,
        });
      }),
      fetch(`${apiBase}/api/v1/push/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alert: disasterAlert }),
        signal: ctrl.signal,
      }).catch(() => {}),
    ]).finally(() => {
      clearTimeout(abortTimeout);
    });

    return disasterAlert;
  }

  /**
   * Handles incoming broadcast from other tabs or WebSocket
   */
  public async handleIncomingBroadcast(alert: DisasterAlert): Promise<void> {
    await this.notifyDisaster(alert, true);
  }

  /**
   * Dispatches a disaster notification across:
   * 1. Android Native System Notification (LocalNotifications)
   * 2. Electron Desktop Notification
   * 3. Web Notification API
   * 4. Web Audio Emergency Buzzer Sound & Siren
   * 5. Phone Haptic Buzzer Vibration
   * 6. In-App Heads-Up Banner
   */
  public async notifyDisaster(alert: DisasterAlert, forceBuzzer = false): Promise<void> {
    const alertKey = `${alert.id}_${alert.severity}`;
    const now = Date.now();

    // Check if this is an Admin-sent notification
    const isAdminAlert = forceBuzzer ||
      (alert.source && /admin|eoc|authority|command/i.test(alert.source)) ||
      (alert.id && alert.id.startsWith('admin-'));

    // Check if this is a verified real emergency (Critical Life-Safety or Evacuation)
    const isRealEmergency = alert.severity === 'CRITICAL' || alert.type === 'EVACUATION' ||
      (typeof alert.waterDepthCm === 'number' && alert.waterDepthCm >= 30) ||
      (alert.headline && /evacuation|life-safety|critical flood/i.test(alert.headline));

    // Deduplication cooldown (10 minutes) unless forced or sent by admin
    if (!isAdminAlert && this.lastAlertKey === alertKey && now - this.lastAlertTime < 600000) {
      return;
    }

    this.lastAlertKey = alertKey;
    this.lastAlertTime = now;
    this.activeAlert = alert;
    if (alert.id) {
      this.shownAlertIds.add(alert.id);
    }

    // Add to history and persist
    this.alertHistory = [alert, ...this.alertHistory.filter((a) => a.id !== alert.id)].slice(0, 20);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('scg_disaster_alerts', JSON.stringify(this.alertHistory));
      }
    } catch {
      // ignore
    }

    this.notifyListeners();

    // Critical Requirement: If current client is an ADMIN:
    // Buzzer sound, vibration, and system notifications must ONLY trigger/show for CITIZEN users.
    // Completely silence and suppress on Admin consoles/devices (no buzzer tone, no haptic vibration, no popups).
    if (this.userRole === 'ADMIN') {
      return;
    }

    // Only dispatch intrusive system notifications (Android push, buzzer, vibration)
    // if it is an ADMIN BROADCAST or a REAL CRITICAL EMERGENCY!
    if (!isAdminAlert && !isRealEmergency) {
      return;
    }

    // Check user preference opt-out
    try {
      if (typeof localStorage !== 'undefined') {
        const rawProfile = localStorage.getItem('smartcity_user_profile');
        if (rawProfile) {
          const profile = JSON.parse(rawProfile);
          if (profile.minSeverity === 'CRITICAL' && alert.severity !== 'CRITICAL' && !isAdminAlert) {
            return;
          }
          if (profile.inAppOptIn === false && !isAdminAlert) {
            return;
          }
        }
      }
    } catch {
      // ignore
    }

    // 1. Android Native Local Notification with sound & vibration
    try {
      if (typeof window !== 'undefined' || Capacitor.isNativePlatform()) {
        if (Capacitor.isNativePlatform() || Capacitor.getPlatform() === 'android') {
          try {
            const perms = await LocalNotifications.checkPermissions();
            if (perms.display !== 'granted') {
              await LocalNotifications.requestPermissions();
            }
          } catch {
            // ignore permission check errors
          }
        }

        const numericId = Math.abs(this.hashString(alert.id)) % 2147483647;
        // Note: Omit the `schedule` property (no schedule: { at: new Date(...) })
        // for immediate emergency alerts so Android does not reject or throttle
        // it under strict exact alarm battery optimization policies.
        await LocalNotifications.schedule({
          notifications: [
            {
              id: numericId,
              title: alert.title,
              body: `${alert.headline} ${alert.recommendedAction ? '• ' + alert.recommendedAction : ''}`,
              channelId: 'disaster-alerts',
              smallIcon: 'ic_stat_alert',
              iconColor: '#EF4444',
              isExactNotification: false as any,
              extra: {
                alertId: alert.id,
                coordinates: alert.coordinates,
                severity: alert.severity,
              },
            } as any,
          ],
        });
        console.log('[DisasterNotifications] Native local notification posted successfully:', alert.title);
      }
    } catch (err) {
      console.warn('[DisasterNotifications] Native local notification error:', err);
    }

    // 2. Desktop Electron Notification
    try {
      if (typeof window !== 'undefined') {
        const electronApi = (window as any).smartCityDesktop;
        if (electronApi?.sendAlertNotification) {
          electronApi.sendAlertNotification(alert.title, alert.headline);
        }
      }
    } catch {
      // ignore
    }

    // 3. Web Browser Notification
    try {
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        new Notification(alert.title, {
          body: `${alert.headline}\n${alert.recommendedAction}`,
          tag: alert.id,
        });
      }
    } catch {
      // ignore
    }

    // 4. Loud Emergency Buzzer Sound Synthesizer
    if (!this.isAudioMuted) {
      this.playBuzzerSound();
    }

    // 5. Heavy Phone Haptic Buzzer Vibration Pattern
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([500, 150, 500, 150, 800]);
      }
    } catch {
      // ignore
    }
  }

  /**
   * Synthesizes an authoritative emergency buzzer alarm using Web Audio API:
   * Detuned 220Hz + 224Hz square/sawtooth oscillators with 60Hz line-hum modulation
   * pulsing in 3 distinct urgent bursts (BZZZT! BZZZT! BZZZT!).
   */
  public playBuzzerSound(): void {
    // When the client is an ADMIN: playBuzzerSound must be completely silenced (no sound) and no haptic vibration
    if (this.userRole === 'ADMIN') {
      return;
    }

    try {
      if (typeof window === 'undefined') return;
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return;

      if (!this.audioCtx) {
        this.audioCtx = new AudioCtxClass();
      }

      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }

      const now = this.audioCtx.currentTime;

      // 3 urgent buzzer pulses: 0.0-0.45s, 0.60-1.05s, 1.20-1.65s
      const pulses = [
        { start: 0.0, dur: 0.45 },
        { start: 0.60, dur: 0.45 },
        { start: 1.20, dur: 0.45 },
      ];

      pulses.forEach(({ start, dur }) => {
        if (!this.audioCtx) return;

        const osc1 = this.audioCtx.createOscillator();
        const osc2 = this.audioCtx.createOscillator();
        const modLfo = this.audioCtx.createOscillator();
        const modGain = this.audioCtx.createGain();
        const mainGain = this.audioCtx.createGain();

        // 220 Hz (A3) Sawtooth + 224 Hz (A3 detuned) Square
        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(220, now + start);

        osc2.type = 'square';
        osc2.frequency.setValueAtTime(224, now + start);

        // 60 Hz modulation LFO for electric line-hum buzz
        modLfo.type = 'sawtooth';
        modLfo.frequency.setValueAtTime(60, now + start);
        modGain.gain.setValueAtTime(0.35, now + start);
        modLfo.connect(modGain);

        // Main amplitude envelope
        mainGain.gain.setValueAtTime(0.001, now + start);
        mainGain.gain.linearRampToValueAtTime(0.38, now + start + 0.02);
        mainGain.gain.setValueAtTime(0.38, now + start + dur - 0.03);
        mainGain.gain.linearRampToValueAtTime(0.001, now + start + dur);

        modGain.connect(mainGain.gain);
        osc1.connect(mainGain);
        osc2.connect(mainGain);
        mainGain.connect(this.audioCtx.destination);

        osc1.start(now + start);
        osc2.start(now + start);
        modLfo.start(now + start);

        osc1.stop(now + start + dur);
        osc2.stop(now + start + dur);
        modLfo.stop(now + start + dur);
      });

      // Synchronized heavy haptic vibration pattern on phones
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([450, 150, 450, 150, 450]);
      }
    } catch {
      // audio autoplay might require user gesture
    }
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => {
      try {
        listener(this.activeAlert);
      } catch {
        // ignore
      }
    });
  }

  private subscribeToRealtime(): void {
    realtimeClient.onMessage((msg) => {
      // 1. Admin Emergency Broadcast Event (From Webpage or Admin Dashboard)
      if (
        msg.topic === 'realtime:broadcast' ||
        msg.topic === 'realtime:alerts' ||
        msg.eventType === 'ADMIN_EMERGENCY_BROADCAST' ||
        msg.eventType === 'NOTIFICATION_DISPATCHED'
      ) {
        const p = msg.payload || msg.data || {};
        const title = p.title || `🚨 EMERGENCY BROADCAST: ${p.location || 'Citywide Emergency'}`;
        const body = p.message || p.headline || p.body || 'Disaster early warning transmitted by EOC Authority.';
        const loc = p.location || p.eventName || 'Bengaluru Urban Catchment';

        this.notifyDisaster(
          {
            id: p.id || `admin-${Date.now()}`,
            title,
            headline: body,
            body,
            severity: p.severity || 'CRITICAL',
            type: p.type || 'FLOOD',
            location: loc,
            waterDepthCm: p.waterDepthCm || 42,
            leadTimeMinutes: p.leadTimeMinutes || 15,
            recommendedAction: p.recommendedAction || 'Evacuate low-lying underpasses. Follow elevated routes.',
            detourCorridor: p.detourCorridor || 'Elevated Expressway Bypass',
            coordinates: p.coordinates || [12.9172, 77.6228],
            timestamp: p.dispatchedAt || new Date().toISOString(),
            source: 'EOC Authority Control Center Broadcast',
            buzzerAlert: true,
          },
          true
        );
        return;
      }

      // 2. Real Emergency: Verified Critical Flood Inundation or Evacuation Order ONLY
      if (msg.topic === 'realtime:flood' && msg.payload) {
        const payload = msg.payload;
        const isCritical = payload.severity === 'CRITICAL' || payload.overallSeverity === 'CRITICAL';
        const isSevere = (typeof payload.waterDepthCm === 'number' && payload.waterDepthCm >= 30) || payload.type === 'EVACUATION';

        if (isCritical && isSevere) {
          const zoneName = payload.zoneName || 'Silk Board & Bellandur Lake Basin';
          const depth = payload.waterDepthCm || 38;
          this.notifyDisaster({
            id: `flood-critical-${Math.floor(Date.now() / 600000)}`,
            title: `🚨 CRITICAL FLOOD EMERGENCY: ${zoneName}`,
            severity: 'CRITICAL',
            type: payload.type || 'FLOOD',
            location: zoneName,
            headline: `Extreme water depth (${depth} cm). Immediate road submersion occurring.`,
            body: `Critical flood waters rising in ${zoneName}. Low-lying road corridors submerged. Immediate detour advised.`,
            waterDepthCm: depth,
            leadTimeMinutes: 15,
            recommendedAction: 'Divert via Elevated Ridge Corridor. Avoid low-lying underpasses.',
            detourCorridor: 'Elevated Expressway',
            coordinates: [12.9172, 77.6228],
            timestamp: new Date().toISOString(),
            source: 'Hydrodynamic Flood Predictor Engine',
            buzzerAlert: true,
          });
        }
      }
    });
  }

  private startDemoWatcher(): void {
    // Disabled: Notifications should only trigger for verified real emergencies or admin broadcasts.
    if (this.demoInterval) {
      clearInterval(this.demoInterval);
      this.demoInterval = undefined;
    }
  }

  /**
   * Continuous active polling fallback:
   * Queries `${getApiBaseUrl()}/api/v1/alerts/latest-broadcast` every 3 seconds.
   * Ensures that even if WebSockets are blocked, disconnected, or reconnecting
   * on mobile data/Wi-Fi, the mobile app ALWAYS receives and displays emergency notifications.
   */
  private startFallbackPolling(): void {
    if (this.pollingInterval) return;

    // Seed from history so past alerts are not repeatedly triggered across restarts
    this.alertHistory.forEach((a) => {
      if (a.id) this.shownAlertIds.add(a.id);
    });

    const checkLatestBroadcast = async () => {
      try {
        const apiBase = getApiBaseUrl();
        const res = await fetch(`${apiBase}/api/v1/alerts/latest-broadcast`, {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });

        if (res.ok) {
          const data = await res.json();
          const alert = data?.alert || data?.data;
          if (alert && alert.id && !this.shownAlertIds.has(alert.id)) {
            const rawTime = alert.timestamp || alert.dispatchedAt;
            const alertTime = rawTime ? new Date(rawTime).getTime() : Date.now();
            // Show alert if issued within last 2 hours
            if (Date.now() - alertTime < 2 * 60 * 60 * 1000) {
              this.shownAlertIds.add(alert.id);
              await this.notifyDisaster(alert, true);
            }
          }
        }
      } catch {
        // silent catch on network disconnection
      }
    };

    // Immediate check after 1 second, then recurring every 3 seconds
    setTimeout(checkLatestBroadcast, 1000);
    this.pollingInterval = setInterval(checkLatestBroadcast, 3000);
  }

  public triggerTestDisaster(
    scenario: 'FLOOD' | 'CLOUDBURST' | 'ROAD_SUBMERSION' | 'EVACUATION' = 'FLOOD'
  ): void {
    const timestamp = new Date().toISOString();

    switch (scenario) {
      case 'CLOUDBURST':
        this.notifyDisaster({
          id: `test-cloudburst-${Date.now()}`,
          title: '⚠️ CLOUDBURST EARLY WARNING: Extreme Rain Incoming',
          headline: 'Severe downpour (52.4 mm/h) detected over Bellandur & Silk Board basin.',
          body: 'Stormwater catchment capacity exceeded. Low-lying underpasses will begin submerging within 15 minutes.',
          severity: 'CRITICAL',
          type: 'CLOUDBURST',
          location: 'Bellandur - Silk Board Drainage Basin',
          waterDepthCm: 35,
          rainfallRateMmh: 52.4,
          leadTimeMinutes: 15,
          recommendedAction: 'Divert to elevated corridor. Do not enter low-lying railway underpasses.',
          detourCorridor: 'Old Airport Road Elevated Ridge',
          coordinates: [12.926, 77.6762],
          timestamp,
          source: 'Meteorological Radar & Runoff AI',
          buzzerAlert: true,
        });
        break;

      case 'ROAD_SUBMERSION':
        this.notifyDisaster({
          id: `test-submersion-${Date.now()}`,
          title: '🚨 CORRIDOR SUBMERSION: Outer Ring Road Blocked',
          headline: 'EcoSpace Underpass submerged (45cm water depth). Rapid surge ongoing.',
          body: 'Outer Ring Road between Marathahalli and Bellandur is impassable for standard vehicular transit.',
          severity: 'CRITICAL',
          type: 'ROAD_SUBMERSION',
          location: 'Outer Ring Road (EcoSpace Underpass)',
          waterDepthCm: 45,
          leadTimeMinutes: 5,
          recommendedAction: 'Take intermediate Ring Road elevated flyover detour.',
          detourCorridor: 'Elevated Expressway Bypass',
          coordinates: [12.9288, 77.6843],
          timestamp,
          source: 'Autonomous Road Sentinel Grid',
          buzzerAlert: true,
        });
        break;

      case 'EVACUATION':
        this.notifyDisaster({
          id: `test-evacuation-${Date.now()}`,
          title: '🚨 EMERGENCY EVACUATION ORDER: Low-Lying Lake Ridge',
          headline: 'Bellandur Lake water levels breaching safe embankment. Evacuation in effect.',
          body: 'Authorities have opened designated emergency shelter corridors. Move to elevated ground immediately.',
          severity: 'CRITICAL',
          type: 'EVACUATION',
          location: 'Bellandur Lake Lowland Catchment',
          waterDepthCm: 60,
          leadTimeMinutes: 25,
          recommendedAction: 'Evacuate to Bellandur Community Shelter via safe designated corridors.',
          detourCorridor: 'Safe High-Ground Route',
          coordinates: [12.9345, 77.6698],
          timestamp,
          source: 'BBMP Disaster Management Authority EOC',
          buzzerAlert: true,
        });
        break;

      case 'FLOOD':
      default:
        this.notifyDisaster({
          id: `test-flood-${Date.now()}`,
          title: '🚨 CRITICAL FLOOD DISASTER IMMINENT: Silk Board Basin',
          headline: 'Rapid water accumulation (42 cm) predicted at Silk Board Underpass within 18 minutes.',
          body: 'Hydrodynamic models predict complete corridor submersion. High risk of vehicle stalling and flash flooding.',
          severity: 'CRITICAL',
          type: 'FLOOD',
          location: 'Central Silk Board & HSR Layout Sector 6',
          waterDepthCm: 42,
          rainfallRateMmh: 46.2,
          leadTimeMinutes: 18,
          recommendedAction: 'Follow Safe Elevated Corridor bypass via Hosur Road Elevated Expressway.',
          detourCorridor: 'Hosur Road Elevated Expressway',
          coordinates: [12.9172, 77.6228],
          timestamp,
          source: 'Hydrodynamic Runoff Prediction Model',
          buzzerAlert: true,
        });
        break;
    }
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }
}

export const disasterNotificationService = new DisasterNotificationService();
