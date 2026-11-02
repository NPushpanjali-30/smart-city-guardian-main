import { describe, it, expect, vi, beforeEach } from 'vitest';
import { disasterNotificationService, DisasterAlert } from '../apps/web/src/services/disasterNotificationService';

describe('Disaster Notification Service', () => {
  beforeEach(() => {
    disasterNotificationService.dismissActiveAlert();
  });

  it('should initialize and have null active alert initially after dismiss', () => {
    disasterNotificationService.dismissActiveAlert();
    expect(disasterNotificationService.getActiveAlert()).toBeNull();
  });

  it('should notify subscribers when a disaster alert is dispatched', async () => {
    const receivedAlerts: (DisasterAlert | null)[] = [];
    const unsub = disasterNotificationService.onAlertChange((alert) => {
      receivedAlerts.push(alert);
    });

    const testAlert: DisasterAlert = {
      id: `disaster-silkboard-${Date.now()}`,
      title: '🚨 CRITICAL FLOOD DISASTER IMMINENT: Silk Board Basin',
      headline: 'Water depth reaching 42 cm. Silk Board underpass submerging in 18 minutes.',
      body: 'Severe runoff surge in progress. Avoid Central Silk Board.',
      severity: 'CRITICAL',
      type: 'FLOOD',
      location: 'Silk Board Basin',
      waterDepthCm: 42,
      rainfallRateMmh: 46.2,
      leadTimeMinutes: 18,
      recommendedAction: 'Divert to Hosur Road Elevated Expressway.',
      detourCorridor: 'Hosur Road Elevated Expressway',
      coordinates: [12.9172, 77.6228],
      timestamp: new Date().toISOString(),
      source: 'Hydrodynamic Runoff Model',
    };

    await disasterNotificationService.notifyDisaster(testAlert);

    expect(disasterNotificationService.getActiveAlert()).not.toBeNull();
    expect(disasterNotificationService.getActiveAlert()?.title).toContain('Silk Board');
    expect(disasterNotificationService.getActiveAlert()?.severity).toBe('CRITICAL');
    expect(disasterNotificationService.getActiveAlert()?.waterDepthCm).toBe(42);

    unsub();
  });

  it('should add dispatched alerts to history', async () => {
    const testAlert: DisasterAlert = {
      id: `disaster-bellandur-${Date.now()}`,
      title: '⚠️ CLOUDBURST EARLY WARNING: Bellandur Catchment',
      headline: 'Cloudburst precipitation 52 mm/h detected.',
      body: 'Low-lying corridors submerging.',
      severity: 'WARNING',
      type: 'CLOUDBURST',
      location: 'Bellandur Lake Basin',
      recommendedAction: 'Divert via Old Airport Road Elevated Ridge.',
      timestamp: new Date().toISOString(),
      source: 'Doppler Radar Grid',
    };

    await disasterNotificationService.notifyDisaster(testAlert);

    const history = disasterNotificationService.getAlertHistory();
    expect(history.length).toBeGreaterThan(0);
    expect(history[0].id).toBe(testAlert.id);
  });

  it('should correctly trigger test disaster scenarios (FLOOD, CLOUDBURST, ROAD_SUBMERSION, EVACUATION)', () => {
    disasterNotificationService.triggerTestDisaster('FLOOD');
    let active = disasterNotificationService.getActiveAlert();
    expect(active).not.toBeNull();
    expect(active?.type).toBe('FLOOD');
    expect(active?.severity).toBe('CRITICAL');

    disasterNotificationService.triggerTestDisaster('CLOUDBURST');
    active = disasterNotificationService.getActiveAlert();
    expect(active).not.toBeNull();
    expect(active?.type).toBe('CLOUDBURST');

    disasterNotificationService.triggerTestDisaster('ROAD_SUBMERSION');
    active = disasterNotificationService.getActiveAlert();
    expect(active).not.toBeNull();
    expect(active?.type).toBe('ROAD_SUBMERSION');

    disasterNotificationService.triggerTestDisaster('EVACUATION');
    active = disasterNotificationService.getActiveAlert();
    expect(active).not.toBeNull();
    expect(active?.type).toBe('EVACUATION');
  });

  it('should allow dismissing the active alert', () => {
    disasterNotificationService.triggerTestDisaster('FLOOD');
    expect(disasterNotificationService.getActiveAlert()).not.toBeNull();

    disasterNotificationService.dismissActiveAlert();
    expect(disasterNotificationService.getActiveAlert()).toBeNull();
  });

  it('should broadcast admin emergency alerts to all connected citizen devices with buzzer', async () => {
    const receivedAlerts: (DisasterAlert | null)[] = [];
    const unsub = disasterNotificationService.onAlertChange((alert) => {
      receivedAlerts.push(alert);
    });

    const alert = await disasterNotificationService.broadcastAdminAlert({
      title: '🚨 CRITICAL FLOOD: Silk Board & Bellandur Lake overflow',
      message: 'Water depth 44cm at underpass. Mandatory evacuation detour in effect.',
      severity: 'CRITICAL',
      location: 'Central Silk Board Junction',
      waterDepthCm: 44,
      leadTimeMinutes: 15,
      recommendedAction: 'Divert onto Hosur Road Elevated Expressway.',
      detourCorridor: 'Hosur Road Elevated Expressway',
    });

    expect(alert).toBeDefined();
    expect(alert.title).toContain('Silk Board');
    expect(alert.buzzerAlert).toBe(true);

    const current = disasterNotificationService.getActiveAlert();
    expect(current).not.toBeNull();
    expect(current?.title).toContain('Silk Board');
    expect(current?.waterDepthCm).toBe(44);

    unsub();
  });

  it('should safely execute playBuzzerSound without throwing errors in any environment', () => {
    expect(() => {
      disasterNotificationService.playBuzzerSound();
    }).not.toThrow();
  });

  it('should handle incoming broadcasts from other tabs/WebSockets', async () => {
    const incomingAlert: DisasterAlert = {
      id: `remote-${Date.now()}`,
      title: '🚨 REMOTE BROADCAST: EcoSpace Underpass Submerged',
      headline: '48cm water depth. Road closed.',
      body: '48cm water depth. Road closed.',
      severity: 'CRITICAL',
      type: 'ROAD_SUBMERSION',
      location: 'EcoSpace Underpass',
      recommendedAction: 'Use elevated bypass.',
      timestamp: new Date().toISOString(),
      source: 'Remote EOC Broadcast',
      buzzerAlert: true,
    };

    await disasterNotificationService.handleIncomingBroadcast(incomingAlert);
    const active = disasterNotificationService.getActiveAlert();
    expect(active?.title).toContain('EcoSpace Underpass Submerged');
    expect(active?.buzzerAlert).toBe(true);
  });
});


