import React, { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { disasterNotificationService, DisasterAlert } from '../services/disasterNotificationService';
import { realtimeClient, ConnectionStatus } from '../services/realtimeClient';
import { getApiBaseUrl } from '../services/apiConfig';

interface CitizenNotificationsPageProps {
  onNavigate?: (path: string) => void;
}

export const CitizenNotificationsPage: React.FC<CitizenNotificationsPageProps> = ({ onNavigate }) => {
  const [activeAlert, setActiveAlert] = useState<DisasterAlert | null>(() =>
    disasterNotificationService.getActiveAlert()
  );
  const [alertHistory, setAlertHistory] = useState<DisasterAlert[]>(() =>
    disasterNotificationService.getAlertHistory()
  );
  const [filter, setFilter] = useState<'ALL' | 'CRITICAL' | 'WARNING'>('ALL');
  const [isTesting, setIsTesting] = useState(false);
  const [testSuccessMessage, setTestSuccessMessage] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(() => realtimeClient.getStatus());
  const [hasPermission, setHasPermission] = useState<boolean>(true);
  const apiBase = getApiBaseUrl();

  useEffect(() => {
    // 1. Subscribe to alert changes
    const unsubAlert = disasterNotificationService.onAlertChange((alert) => {
      setActiveAlert(alert);
      setAlertHistory(disasterNotificationService.getAlertHistory());
    });

    // 2. Subscribe to realtime WebSocket connection status
    const unsubStatus = realtimeClient.onStatusChange((status) => {
      setConnectionStatus(status);
    });

    // 3. Check Android notification permission status
    const checkPerms = async () => {
      try {
        if (Capacitor.isNativePlatform() || Capacitor.getPlatform() === 'android') {
          const status = await LocalNotifications.checkPermissions();
          setHasPermission(status.display === 'granted');
        }
      } catch {}
    };
    checkPerms();

    // 4. Immediately fetch latest broadcast on page load and poll every 4 seconds
    const fetchLatest = async () => {
      try {
        const res = await fetch(`${apiBase}/api/v1/alerts/latest-broadcast`, {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });
        if (res.ok) {
          const data = await res.json();
          const alert = data?.alert || data?.data;
          if (alert && alert.id) {
            await disasterNotificationService.notifyDisaster(alert, true);
          }
        }
      } catch {}
    };
    fetchLatest();
    const interval = setInterval(fetchLatest, 4000);

    return () => {
      unsubAlert();
      unsubStatus();
      clearInterval(interval);
    };
  }, [apiBase]);

  const handleRequestPermission = async () => {
    try {
      if (Capacitor.isNativePlatform() || Capacitor.getPlatform() === 'android') {
        const req = await LocalNotifications.requestPermissions();
        setHasPermission(req.display === 'granted');
        if (req.display === 'granted') {
          setTestSuccessMessage('✅ Android Notification permission granted successfully!');
        } else {
          setTestSuccessMessage('⚠️ Please allow notifications in Android Settings > Apps > Smart City Guardian');
        }
      }
    } catch (err: any) {
      setTestSuccessMessage(`Permission request error: ${err?.message}`);
    }
  };

  const handleOpenMap = (coordinates?: [number, number], locationName?: string) => {
    if (coordinates) {
      try {
        sessionStorage.setItem('scg_focus_hazard', JSON.stringify({
          coordinates,
          name: locationName || 'Hazard Zone',
        }));
      } catch {}
    }
    if (onNavigate) {
      onNavigate('/map');
    } else if (typeof window !== 'undefined') {
      window.location.hash = 'map';
    }
  };

  const handleTestAlert = async () => {
    setIsTesting(true);
    setTestSuccessMessage(null);
    try {
      await disasterNotificationService.triggerTestDisaster('FLOOD');
      setTestSuccessMessage('✅ Emergency notification, buzzer alarm, and vibration transmitted to your phone!');
      setTimeout(() => setTestSuccessMessage(null), 6000);
    } catch (err: any) {
      setTestSuccessMessage(`❌ Test notification error: ${err?.message || 'Check notification permissions'}`);
    } finally {
      setIsTesting(false);
    }
  };

  const handleClearHistory = () => {
    disasterNotificationService.clearHistory();
    setAlertHistory([]);
  };

  const filteredHistory = alertHistory.filter((item) => {
    if (filter === 'ALL') return true;
    if (filter === 'CRITICAL') return item.severity === 'CRITICAL';
    if (filter === 'WARNING') return item.severity === 'WARNING' || item.severity === 'WATCH';
    return true;
  });

  return (
    <div style={{
      maxWidth: '640px',
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
      gap: '14px',
      paddingTop: '6px',
    }}>
      {/* Citizen Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <span>🔔</span>
            <span>Emergency Notifications</span>
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '4px', marginBottom: 0 }}>
            Official life-safety early warnings &amp; evacuation advisories from EOC Authorities.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(15, 23, 42, 0.6)',
            padding: '4px 10px',
            borderRadius: '16px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          }}>
            <span
              className="pulse-dot"
              style={{
                backgroundColor: connectionStatus === 'CONNECTED' ? '#10B981' : connectionStatus === 'RECONNECTING' ? '#F59E0B' : '#EF4444',
              }}
            />
            <span style={{
              fontSize: '0.72rem',
              color: connectionStatus === 'CONNECTED' ? '#34D399' : connectionStatus === 'RECONNECTING' ? '#FBBF24' : '#F87171',
              fontWeight: 700,
            }}>
              {connectionStatus === 'CONNECTED' ? 'EOC LIVE' : connectionStatus}
            </span>
          </div>
          <button
            type="button"
            onClick={async () => {
              try {
                const res = await fetch(`${apiBase}/api/v1/alerts/latest-broadcast`, {
                  cache: 'no-store',
                  headers: { Accept: 'application/json' },
                });
                if (res.ok) {
                  const data = await res.json();
                  const alert = data?.alert || data?.data;
                  if (alert && alert.id) {
                    await disasterNotificationService.notifyDisaster(alert, true);
                    setTestSuccessMessage('✅ Synchronized latest EOC emergency alerts!');
                    setTimeout(() => setTestSuccessMessage(null), 4000);
                  } else {
                    setTestSuccessMessage('ℹ️ No active emergency alerts currently on EOC server.');
                    setTimeout(() => setTestSuccessMessage(null), 3000);
                  }
                }
              } catch (err: any) {
                setTestSuccessMessage(`⚠️ Sync error: ${err?.message || 'Check connection'}`);
              }
            }}
            title="Sync latest alerts from EOC Server"
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#38BDF8',
              borderRadius: '8px',
              padding: '5px 10px',
              fontSize: '0.72rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span>🔄</span>
            <span>Sync</span>
          </button>
        </div>
      </div>

      {/* Permission Warning Banner (if permission not yet granted) */}
      {!hasPermission && (
        <div
          className="glass-panel"
          style={{
            padding: '12px 14px',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid #EF4444',
            borderRadius: '12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <div style={{ fontSize: '0.78rem', color: '#FEE2E2' }}>
            ⚠️ <strong>Notification permission required</strong> for lock screen popups &amp; loud emergency buzzers.
          </div>
          <button
            type="button"
            onClick={handleRequestPermission}
            style={{
              background: '#EF4444',
              color: '#FFF',
              border: 'none',
              borderRadius: '6px',
              padding: '6px 12px',
              fontSize: '0.74rem',
              fontWeight: 800,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Enable Now
          </button>
        </div>
      )}

      {/* Test Notification Banner for Physical Phone Testing */}
      <div
        className="glass-panel"
        style={{
          padding: '14px 16px',
          background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.08), rgba(59, 130, 246, 0.08))',
          border: '1px solid rgba(56, 189, 248, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#F8FAFC' }}>
              📲 Test Device Alerts
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
              Verify heads-up banner, notification tray, and loud emergency buzzer on this phone.
            </div>
          </div>

          <button
            type="button"
            onClick={handleTestAlert}
            disabled={isTesting}
            style={{
              background: 'linear-gradient(135deg, #0284C7, #0369A1)',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 14px',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 10px rgba(2, 132, 199, 0.4)',
              whiteSpace: 'nowrap',
            }}
          >
            <span>{isTesting ? '⏳' : '🚨'}</span>
            <span>{isTesting ? 'Testing...' : 'Test Phone Alert'}</span>
          </button>
        </div>

        {testSuccessMessage && (
          <div style={{ fontSize: '0.78rem', color: testSuccessMessage.startsWith('✅') ? '#34D399' : '#F87171', fontWeight: 600 }}>
            {testSuccessMessage}
          </div>
        )}
      </div>

      {/* Active Broadcast Alert (If Present) */}
      {activeAlert && (
        <div
          className="glass-panel"
          style={{
            padding: '16px',
            background: activeAlert.severity === 'CRITICAL'
              ? 'linear-gradient(135deg, rgba(220, 38, 38, 0.2), rgba(153, 27, 27, 0.15))'
              : 'linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(180, 83, 9, 0.15))',
            border: activeAlert.severity === 'CRITICAL' ? '1.5px solid #EF4444' : '1.5px solid #F59E0B',
            borderRadius: '16px',
            boxShadow: activeAlert.severity === 'CRITICAL'
              ? '0 8px 24px rgba(239, 68, 68, 0.25)'
              : '0 8px 24px rgba(245, 158, 11, 0.2)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1.4rem' }}>🚨</span>
              <div>
                <span
                  style={{
                    background: activeAlert.severity === 'CRITICAL' ? '#DC2626' : '#D97706',
                    color: '#FFF',
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: '4px',
                    letterSpacing: '0.04em',
                  }}
                >
                  ACTIVE {activeAlert.severity}
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: '8px' }}>
                  {new Date(activeAlert.timestamp).toLocaleTimeString()}
                </span>
              </div>
            </div>

            <span style={{ fontSize: '0.74rem', color: '#67E8F9', fontWeight: 700 }}>
              {activeAlert.location}
            </span>
          </div>

          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#FFFFFF', margin: '0 0 6px 0' }}>
              {activeAlert.title}
            </h3>
            <p style={{ fontSize: '0.84rem', color: '#E2E8F0', lineHeight: 1.5, margin: 0 }}>
              {activeAlert.body || activeAlert.headline}
            </p>
          </div>

          {activeAlert.recommendedAction && (
            <div
              style={{
                background: 'rgba(0, 0, 0, 0.3)',
                padding: '8px 12px',
                borderRadius: '8px',
                borderLeft: '3px solid #38BDF8',
                fontSize: '0.78rem',
                color: '#BAE6FD',
              }}
            >
              <strong>Advisory:</strong> {activeAlert.recommendedAction}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', paddingTop: '4px' }}>
            <div style={{ fontSize: '0.74rem', color: '#94A3B8' }}>
              🔊 Buzzer sounded • 📳 Phone vibrated
            </div>

            <button
              type="button"
              onClick={() => handleOpenMap(activeAlert.coordinates, activeAlert.location)}
              style={{
                background: 'linear-gradient(135deg, #10B981, #059669)',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                padding: '8px 16px',
                fontSize: '0.82rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 12px rgba(16, 185, 129, 0.4)',
              }}
            >
              <span>🗺️</span>
              <span>View Evacuation Route</span>
            </button>
          </div>
        </div>
      )}

      {/* Filter Tabs & History Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            type="button"
            onClick={() => setFilter('ALL')}
            style={{
              background: filter === 'ALL' ? '#0284C7' : 'rgba(255, 255, 255, 0.06)',
              color: filter === 'ALL' ? '#FFF' : 'var(--text-secondary)',
              border: '1px solid ' + (filter === 'ALL' ? '#38BDF8' : 'rgba(255, 255, 255, 0.1)'),
              borderRadius: '8px',
              padding: '5px 12px',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            All ({alertHistory.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('CRITICAL')}
            style={{
              background: filter === 'CRITICAL' ? '#DC2626' : 'rgba(255, 255, 255, 0.06)',
              color: filter === 'CRITICAL' ? '#FFF' : 'var(--text-secondary)',
              border: '1px solid ' + (filter === 'CRITICAL' ? '#EF4444' : 'rgba(255, 255, 255, 0.1)'),
              borderRadius: '8px',
              padding: '5px 12px',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Critical
          </button>
          <button
            type="button"
            onClick={() => setFilter('WARNING')}
            style={{
              background: filter === 'WARNING' ? '#D97706' : 'rgba(255, 255, 255, 0.06)',
              color: filter === 'WARNING' ? '#FFF' : 'var(--text-secondary)',
              border: '1px solid ' + (filter === 'WARNING' ? '#F59E0B' : 'rgba(255, 255, 255, 0.1)'),
              borderRadius: '8px',
              padding: '5px 12px',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Warnings
          </button>
        </div>

        {alertHistory.length > 0 && (
          <button
            type="button"
            onClick={handleClearHistory}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '0.72rem',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Clear History
          </button>
        )}
      </div>

      {/* Received Alerts List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {filteredHistory.length === 0 ? (
          <div
            className="glass-panel"
            style={{
              padding: '36px 20px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <span style={{ fontSize: '2.5rem' }}>🛡️</span>
            <div style={{ fontWeight: 700, fontSize: '0.98rem', color: '#F8FAFC' }}>
              No Active Disaster Alerts
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: '380px', margin: 0 }}>
              Your area currently has no emergency warnings. Verified flood alerts and safe detour broadcasts from the EOC Authority will appear here.
            </p>
          </div>
        ) : (
          filteredHistory.map((alert) => {
            const isCrit = alert.severity === 'CRITICAL';
            return (
              <div
                key={alert.id}
                className="glass-panel"
                style={{
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  borderLeft: isCrit ? '4px solid #EF4444' : '4px solid #F59E0B',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span
                      style={{
                        background: isCrit ? 'rgba(239, 68, 68, 0.18)' : 'rgba(245, 158, 11, 0.18)',
                        color: isCrit ? '#F87171' : '#FBBF24',
                        border: '1px solid ' + (isCrit ? '#EF4444' : '#F59E0B'),
                        borderRadius: '4px',
                        padding: '1px 6px',
                        fontSize: '0.66rem',
                        fontWeight: 800,
                      }}
                    >
                      {alert.severity}
                    </span>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                      {new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <span style={{ fontSize: '0.75rem', color: '#38BDF8', fontWeight: 600 }}>
                    {alert.location}
                  </span>
                </div>

                <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#F8FAFC' }}>
                  {alert.title}
                </div>

                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  {alert.body || alert.headline}
                </div>

                {alert.recommendedAction && (
                  <div style={{ fontSize: '0.75rem', color: '#93C5FD', background: 'rgba(56, 189, 248, 0.08)', padding: '6px 10px', borderRadius: '6px' }}>
                    <strong>Action:</strong> {alert.recommendedAction}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    Source: {alert.source || 'EOC Control Center'}
                  </span>

                  <button
                    type="button"
                    onClick={() => handleOpenMap(alert.coordinates, alert.location)}
                    style={{
                      background: 'rgba(16, 185, 129, 0.12)',
                      border: '1px solid rgba(16, 185, 129, 0.35)',
                      color: '#34D399',
                      borderRadius: '6px',
                      padding: '4px 10px',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <span>🗺️</span>
                    <span>Show on Map</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default CitizenNotificationsPage;
