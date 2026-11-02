import React, { useState, useEffect } from 'react';
import { disasterNotificationService, DisasterAlert, UserRole } from '../services/disasterNotificationService';

interface DisasterAlertBannerProps {
  onNavigate?: (path: string) => void;
  role?: UserRole;
}

export const DisasterAlertBanner: React.FC<DisasterAlertBannerProps> = ({ onNavigate, role }) => {
  const [currentRole, setCurrentRole] = useState<UserRole>(() => {
    return role ?? disasterNotificationService.getUserRole();
  });
  const [activeAlert, setActiveAlert] = useState<DisasterAlert | null>(() =>
    disasterNotificationService.getActiveAlert()
  );
  const [isDismissed, setIsDismissed] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    if (role) {
      setCurrentRole(role);
    }
  }, [role]);

  useEffect(() => {
    const unsubRole = disasterNotificationService.onRoleChange((newRole) => {
      setCurrentRole(newRole);
    });
    const unsubAlert = disasterNotificationService.onAlertChange((alert) => {
      setActiveAlert(alert);
      if (alert) {
        setIsDismissed(false);
      }
    });
    return () => {
      unsubRole();
      unsubAlert();
    };
  }, []);

  const handleMuteToggle = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    disasterNotificationService.setAudioMuted(nextMuted);
  };

  const handleDismiss = () => {
    setIsDismissed(true);
  };

  const handleViewEvacuationMap = () => {
    if (onNavigate) {
      onNavigate('/map');
    } else if (typeof window !== 'undefined') {
      window.location.hash = 'map';
    }
    // Also trigger detour simulation if appropriate
    try {
      sessionStorage.setItem('scg_focus_hazard', JSON.stringify({
        coordinates: activeAlert?.coordinates || [12.9172, 77.6228],
        name: activeAlert?.location || 'Silk Board',
      }));
    } catch {
      // ignore
    }
  };

  // Only render the banner if the user role is 'CITIZEN'.
  // Admins already have their own EOC command console and live alert audit log;
  // citizen evacuation banners must NEVER obscure the Admin dashboard.
  if (currentRole === 'ADMIN' || !activeAlert) {
    return null;
  }

  // If dismissed, show a compact floating pill so it doesn't obstruct but remains accessible
  if (isDismissed) {
    return (
      <aside
        aria-label="Active disaster early warning"
        onClick={() => setIsDismissed(false)}
        style={{
          position: 'fixed',
          top: 'max(68px, calc(env(safe-area-inset-top, 0px) + 50px))',
          right: 'max(16px, env(safe-area-inset-right, 0px))',
          zIndex: 9998,
          background: 'linear-gradient(135deg, rgba(220, 38, 38, 0.95), rgba(153, 27, 27, 0.95))',
          color: '#FFFFFF',
          padding: '8px 14px',
          borderRadius: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(220, 38, 38, 0.45)',
          border: '1px solid rgba(254, 202, 202, 0.4)',
          fontSize: '0.78rem',
          fontWeight: 700,
          animation: 'pulseGlow 2s infinite ease-in-out',
        }}
      >
        <span style={{ fontSize: '1.1rem' }}>🚨</span>
        <span>Active Disaster Warning: {activeAlert.location}</span>
        <span style={{ opacity: 0.8, fontSize: '0.7rem' }}>(Expand)</span>
      </aside>
    );
  }

  const isCritical = activeAlert.severity === 'CRITICAL';

  return (
    <aside
      aria-label="Disaster alert banner"
      style={{
        position: 'sticky',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: isCritical
          ? 'linear-gradient(90deg, #7F1D1D 0%, #991B1B 50%, #7F1D1D 100%)'
          : 'linear-gradient(90deg, #78350F 0%, #92400E 50%, #78350F 100%)',
        borderBottom: isCritical ? '2px solid #EF4444' : '2px solid #F59E0B',
        boxShadow: isCritical
          ? '0 6px 24px rgba(239, 68, 68, 0.4)'
          : '0 6px 20px rgba(245, 158, 11, 0.3)',
        color: '#FFFFFF',
        padding: 'max(12px, env(safe-area-inset-top, 0px)) max(16px, env(safe-area-inset-right, 0px)) 12px max(16px, env(safe-area-inset-left, 0px))',
        transition: 'all 0.3s ease',
      }}
    >
      <div
        className="container"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          maxWidth: '1280px',
          margin: '0 auto',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          {/* Headline & Badges */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '280px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: isCritical ? '#EF4444' : '#F59E0B',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.1rem',
                flexShrink: 0,
                boxShadow: '0 0 12px rgba(255, 255, 255, 0.6)',
                animation: 'pulseGlow 1.4s infinite ease-in-out',
              }}
            >
              🚨
            </div>

            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span
                  style={{
                    background: 'rgba(0, 0, 0, 0.4)',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    border: '1px solid rgba(255, 255, 255, 0.25)',
                  }}
                >
                  {isCritical ? 'CRITICAL DISASTER IMMINENT' : 'DISASTER WARNING'}
                </span>

                {activeAlert.leadTimeMinutes && (
                  <span
                    style={{
                      background: 'rgba(255, 255, 255, 0.2)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '0.68rem',
                      fontWeight: 700,
                    }}
                  >
                    ⚡ Inundation in ~{activeAlert.leadTimeMinutes} mins
                  </span>
                )}

                {activeAlert.waterDepthCm && (
                  <span
                    style={{
                      background: 'rgba(0, 0, 0, 0.3)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      color: '#67E8F9',
                    }}
                  >
                    🌊 Depth: {activeAlert.waterDepthCm} cm
                  </span>
                )}
              </div>

              <div
                style={{
                  fontWeight: 800,
                  fontSize: '0.98rem',
                  lineHeight: 1.3,
                  marginTop: '2px',
                }}
              >
                {activeAlert.title}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <button
              onClick={handleViewEvacuationMap}
              style={{
                background: '#FFFFFF',
                color: '#7F1D1D',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 14px',
                fontSize: '0.8rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
              }}
            >
              <span>🗺️</span>
              <span>View Safe Evacuation Route</span>
            </button>

            <button
              onClick={() => disasterNotificationService.playBuzzerSound()}
              title="Play Emergency Phone Buzzer Sound"
              style={{
                background: 'rgba(0, 0, 0, 0.45)',
                border: '1px solid rgba(254, 202, 202, 0.5)',
                color: '#FEF08A',
                borderRadius: '6px',
                padding: '6px 10px',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span>📢</span>
              <span>Buzzer Sound</span>
            </button>

            <button
              onClick={handleMuteToggle}
              title={isMuted ? 'Unmute alert tone' : 'Mute alert siren'}
              style={{
                background: 'rgba(0, 0, 0, 0.35)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                color: '#FFFFFF',
                borderRadius: '6px',
                padding: '6px 10px',
                fontSize: '0.82rem',
                cursor: 'pointer',
              }}
            >
              {isMuted ? '🔇' : '🔊'}
            </button>

            <button
              onClick={handleDismiss}
              title="Dismiss warning banner"
              style={{
                background: 'rgba(0, 0, 0, 0.35)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                color: '#FFFFFF',
                borderRadius: '6px',
                padding: '6px 10px',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Detailed Advisory */}
        <div
          style={{
            fontSize: '0.82rem',
            lineHeight: 1.4,
            opacity: 0.95,
            paddingLeft: '42px',
          }}
        >
          <span>{activeAlert.headline}</span>{' '}
          <strong style={{ color: '#FEF08A' }}>
            Action: {activeAlert.recommendedAction}
          </strong>
        </div>
      </div>
    </aside>
  );
};

