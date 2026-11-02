import React, { useState, useEffect } from 'react';
import { autoUpdateService, AppVersionInfo } from '../services/autoUpdateService';

export const AutoUpdateBanner: React.FC = () => {
  const [updateInfo, setUpdateInfo] = useState<AppVersionInfo | null>(null);
  const [countdown, setCountdown] = useState<number>(4);

  useEffect(() => {
    const unsub = autoUpdateService.onUpdateAvailable((info) => {
      setUpdateInfo(info);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!updateInfo) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          autoUpdateService.applyUpdate();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [updateInfo]);

  if (!updateInfo) return null;

  return (
    <div
      role="alert"
      style={{
        position: 'fixed',
        top: '12px',
        left: '12px',
        right: '12px',
        zIndex: 99999,
        background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.96), rgba(2, 132, 199, 0.98))',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        color: '#FFFFFF',
        borderRadius: '16px',
        padding: '14px 16px',
        boxShadow: '0 12px 32px rgba(2, 132, 199, 0.45), 0 2px 8px rgba(0,0,0,0.3)',
        border: '1px solid rgba(255, 255, 255, 0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        animation: 'slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
        <span style={{ fontSize: '1.6rem', animation: 'bounce 1s infinite alternate' }}>🚀</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: '0.92rem', letterSpacing: '-0.01em' }}>
            New Version Available ({updateInfo.version})
          </div>
          <div style={{ fontSize: '0.78rem', opacity: 0.92, marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {updateInfo.releaseNotes || 'Auto-applying the latest safety routes and maps...'}
          </div>
        </div>
      </div>

      <button
        onClick={() => autoUpdateService.applyUpdate()}
        style={{
          background: '#FFFFFF',
          color: '#0284C7',
          border: 'none',
          borderRadius: '10px',
          padding: '8px 14px',
          fontSize: '0.82rem',
          fontWeight: 800,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
        }}
      >
        Update ({countdown}s)
      </button>
    </div>
  );
};
