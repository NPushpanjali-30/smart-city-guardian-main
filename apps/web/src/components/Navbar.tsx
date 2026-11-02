import React, { useState, useEffect } from 'react';
import { useI18n, SupportedLanguage } from '../i18n/I18nContext';
import { disasterNotificationService, DisasterAlert } from '../services/disasterNotificationService';

interface NavbarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  role: 'CITIZEN' | 'ADMIN';
  onRoleChange: (role: 'CITIZEN' | 'ADMIN') => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentPath,
  onNavigate,
  role,
  onRoleChange,
}) => {
  const { language, setLanguage, t } = useI18n();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeDisaster, setActiveDisaster] = useState<DisasterAlert | null>(() =>
    disasterNotificationService.getActiveAlert()
  );

  useEffect(() => {
    const unsub = disasterNotificationService.onAlertChange((alert) => {
      setActiveDisaster(alert);
    });
    return () => unsub();
  }, []);

  const navLinks = [
    { path: '/', label: t('nav.overview'), icon: '🌐' },
    { path: '/dashboard', label: t('nav.dashboard'), icon: '📊' },
    { path: '/map', label: t('nav.map'), icon: '🗺️' },
    { path: '/alerts', label: t('nav.alerts'), icon: '🔔' },
    { path: '/profile', label: t('nav.profile'), icon: '⚙️' },
    { path: '/admin', label: t('nav.admin'), icon: '🛡️' },
  ];

  const handleNavClick = (path: string) => {
    onNavigate(path);
    setMobileMenuOpen(false);
  };

  return (
    <header style={{
      borderBottom: '1px solid var(--border-subtle)',
      background: 'rgba(7, 11, 20, 0.92)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      position: 'sticky',
      top: 0,
      zIndex: 100,
      width: '100%',
    }}>
      {/* Top Crisis Ticker */}
      <div className="crisis-ticker">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
          <span className="pulse-dot text-red" style={{ flexShrink: 0 }} />
          <span className="font-mono text-red" style={{ fontWeight: 700, flexShrink: 0, fontSize: '0.74rem' }}>
            ADVISORY:
          </span>
          <span style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: '0.74rem',
            color: 'var(--text-primary)',
          }}>
            {t('app.eoc_ticker')}
          </span>
        </div>
        <span className="font-mono text-muted ticker-freshness" style={{ fontSize: '0.7rem', flexShrink: 0 }}>
          2m ago
        </span>
      </div>

      {/* Main Nav Header */}
      <div style={{
        maxWidth: '1360px',
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px',
        width: '100%',
        boxSizing: 'border-box',
      }}>
        {/* Brand */}
        <div
          onClick={() => handleNavClick('/')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            cursor: 'pointer',
            minWidth: 0,
            flexShrink: 1,
          }}
        >
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '9px',
            background: 'linear-gradient(135deg, #06B6D4, #3B82F6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 12px rgba(6, 182, 212, 0.4)',
            flexShrink: 0,
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontWeight: 800,
              fontSize: '1.05rem',
              letterSpacing: '-0.02em',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
            }}>
              <span>SMARTCITY</span>
              <span className="text-cyan">GUARDIAN</span>
            </div>
            <div className="font-mono text-muted desktop-only" style={{ fontSize: '0.68rem', whiteSpace: 'nowrap' }}>
              {t('app.subtitle')}
            </div>
          </div>
        </div>

        {/* Desktop Navigation Tabs */}
        <nav className="desktop-only" style={{ gap: '4px', alignItems: 'center' }}>
          {navLinks.map((tab) => {
            const isActive = currentPath === tab.path;
            const isAlertTab = tab.path === '/alerts';
            return (
              <button
                key={tab.path}
                onClick={() => handleNavClick(tab.path)}
                style={{
                  background: isActive ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                  color: isActive ? '#38BDF8' : 'var(--text-secondary)',
                  border: isActive ? '1px solid rgba(56, 189, 248, 0.35)' : '1px solid transparent',
                  padding: '7px 12px',
                  borderRadius: '7px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  whiteSpace: 'nowrap',
                  position: 'relative',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>{tab.label}</span>
                {isAlertTab && activeDisaster && (
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: '#EF4444',
                      boxShadow: '0 0 8px #EF4444',
                      display: 'inline-block',
                      animation: 'pulseGlow 1.2s infinite ease-in-out',
                    }}
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Desktop Right Section: Language + Role + Sign In */}
        <div className="desktop-only" style={{ alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {/* Language Selector */}
          <div style={{
            display: 'flex',
            background: 'rgba(15, 23, 42, 0.8)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '7px',
            padding: '2px',
          }}>
            {(['en', 'hi', 'kn'] as SupportedLanguage[]).map((l) => (
              <button
                key={l}
                onClick={() => setLanguage(l)}
                style={{
                  background: language === l ? 'rgba(56, 189, 248, 0.25)' : 'transparent',
                  color: language === l ? '#38BDF8' : 'var(--text-secondary)',
                  border: 'none',
                  borderRadius: '5px',
                  padding: '3px 7px',
                  fontSize: '0.72rem',
                  fontWeight: language === l ? 700 : 500,
                  cursor: 'pointer',
                }}
              >
                {l === 'en' ? 'EN' : l === 'hi' ? 'हिन्दी' : 'ಕನ್ನಡ'}
              </button>
            ))}
          </div>

          {/* Role Switcher */}
          <div style={{
            display: 'flex',
            background: 'rgba(15, 23, 42, 0.8)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '7px',
            padding: '2px',
          }}>
            <button
              onClick={() => onRoleChange('CITIZEN')}
              style={{
                background: role === 'CITIZEN' ? 'var(--accent-cyan)' : 'transparent',
                color: role === 'CITIZEN' ? '#000' : 'var(--text-secondary)',
                border: 'none',
                borderRadius: '5px',
                padding: '3px 8px',
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {t('app.role_citizen')}
            </button>
            <button
              onClick={() => onRoleChange('ADMIN')}
              style={{
                background: role === 'ADMIN' ? 'var(--accent-indigo)' : 'transparent',
                color: role === 'ADMIN' ? '#fff' : 'var(--text-secondary)',
                border: 'none',
                borderRadius: '5px',
                padding: '3px 8px',
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {t('app.role_admin')}
            </button>
          </div>

          <button
            onClick={() => disasterNotificationService.triggerTestDisaster('FLOOD')}
            style={{
              background: 'rgba(239, 68, 68, 0.16)',
              color: '#F87171',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: '7px',
              padding: '5px 9px',
              fontSize: '0.74rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.2s ease',
            }}
            title="Simulate Real-time Disaster Warning & Push Notification"
          >
            <span>🚨</span>
            <span>Disaster Drill</span>
          </button>

          <button
            className="btn btn-secondary"
            onClick={() => handleNavClick('/login')}
            style={{ padding: '6px 12px', fontSize: '0.78rem' }}
          >
            {t('app.sign_in')}
          </button>
        </div>

        {/* Mobile Controls: Language Quick-Pill + Hamburger Toggle Button */}
        <div className="mobile-only" style={{ alignItems: 'center', gap: '8px' }}>
          {/* Compact Mobile Language Switcher */}
          <button
            onClick={() => {
              const order: SupportedLanguage[] = ['en', 'hi', 'kn'];
              const next = order[(order.indexOf(language) + 1) % order.length];
              setLanguage(next);
            }}
            style={{
              background: 'rgba(15, 23, 42, 0.8)',
              border: '1px solid var(--border-subtle)',
              color: '#38BDF8',
              borderRadius: '6px',
              padding: '6px 9px',
              fontSize: '0.72rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
            title="Toggle Language"
          >
            🌐 {language === 'en' ? 'EN' : language === 'hi' ? 'हिन्दी' : 'ಕನ್ನಡ'}
          </button>

          {/* Hamburger Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            style={{
              background: mobileMenuOpen ? 'rgba(56, 189, 248, 0.2)' : 'rgba(15, 23, 42, 0.8)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
              borderRadius: '7px',
              width: '38px',
              height: '38px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: '1.2rem',
              transition: 'all 0.2s ease',
            }}
            aria-label="Toggle Navigation Menu"
          >
            {mobileMenuOpen ? '✕' : '☰'}
          </button>
        </div>
      </div>

      {/* Mobile Drawer / Collapsible Menu */}
      {mobileMenuOpen && (
        <div style={{
          background: 'rgba(11, 17, 32, 0.98)',
          borderTop: '1px solid var(--border-subtle)',
          borderBottom: '2px solid var(--border-glow)',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          boxShadow: '0 12px 30px rgba(0, 0, 0, 0.6)',
          animation: 'fadeIn 0.2s ease',
        }}>
          {/* Navigation Links Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '8px',
          }}>
            {navLinks.map((tab) => {
              const isActive = currentPath === tab.path;
              return (
                <button
                  key={tab.path}
                  onClick={() => handleNavClick(tab.path)}
                  style={{
                    background: isActive ? 'rgba(56, 189, 248, 0.2)' : 'rgba(15, 23, 42, 0.7)',
                    color: isActive ? '#38BDF8' : 'var(--text-primary)',
                    border: isActive ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid var(--border-subtle)',
                    padding: '12px 10px',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    textAlign: 'left',
                  }}
                >
                  <span>{tab.icon}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Role Switcher in Mobile Drawer */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            borderTop: '1px solid var(--border-subtle)',
            paddingTop: '12px',
          }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              USER ROLE CONTEXT:
            </span>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              background: 'rgba(15, 23, 42, 0.8)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              padding: '3px',
              gap: '4px',
            }}>
              <button
                onClick={() => onRoleChange('CITIZEN')}
                style={{
                  background: role === 'CITIZEN' ? 'var(--accent-cyan)' : 'transparent',
                  color: role === 'CITIZEN' ? '#000' : 'var(--text-secondary)',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '9px 12px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                👤 {t('app.role_citizen')}
              </button>
              <button
                onClick={() => onRoleChange('ADMIN')}
                style={{
                  background: role === 'ADMIN' ? 'var(--accent-indigo)' : 'transparent',
                  color: role === 'ADMIN' ? '#fff' : 'var(--text-secondary)',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '9px 12px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                🛡️ {t('app.role_admin')}
              </button>
            </div>
          </div>

          {/* Language Switcher in Mobile Drawer */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            borderTop: '1px solid var(--border-subtle)',
            paddingTop: '12px',
          }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              SELECT LANGUAGE / भाषा चुनें / ಭಾಷೆಯನ್ನು ಆಯ್ಕೆಮಾಡಿ:
            </span>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              background: 'rgba(15, 23, 42, 0.8)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              padding: '3px',
              gap: '4px',
            }}>
              {(['en', 'hi', 'kn'] as SupportedLanguage[]).map((l) => (
                <button
                  key={l}
                  onClick={() => setLanguage(l)}
                  style={{
                    background: language === l ? 'rgba(56, 189, 248, 0.25)' : 'transparent',
                    color: language === l ? '#38BDF8' : 'var(--text-secondary)',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 6px',
                    fontSize: '0.78rem',
                    fontWeight: language === l ? 700 : 500,
                    cursor: 'pointer',
                    textAlign: 'center',
                  }}
                >
                  {l === 'en' ? 'English' : l === 'hi' ? 'हिन्दी' : 'ಕನ್ನಡ'}
                </button>
              ))}
            </div>
          </div>

          {/* Disaster Early Warning Drill Button for Mobile */}
          <button
            onClick={() => {
              disasterNotificationService.triggerTestDisaster('FLOOD');
              setMobileMenuOpen(false);
            }}
            style={{
              width: '100%',
              padding: '10px',
              fontSize: '0.82rem',
              fontWeight: 700,
              background: 'rgba(239, 68, 68, 0.2)',
              color: '#FCA5A5',
              border: '1px solid rgba(239, 68, 68, 0.45)',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              marginTop: '4px',
            }}
          >
            <span>🚨</span>
            <span>Simulate Disaster Warning &amp; Push</span>
          </button>

          {/* Sign In Button in Mobile Drawer */}
          <button
            className="btn btn-secondary"
            onClick={() => handleNavClick('/login')}
            style={{ width: '100%', padding: '10px', fontSize: '0.85rem', marginTop: '4px' }}
          >
            {t('app.sign_in')}
          </button>
        </div>
      )}
    </header>
  );
};
