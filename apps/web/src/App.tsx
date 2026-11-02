import React, { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { I18nProvider } from './i18n/I18nContext';
import { Navbar } from './components/Navbar';
import { DisasterAlertBanner } from './components/DisasterAlertBanner';
import { AutoUpdateBanner } from './components/AutoUpdateBanner';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { MapPage } from './pages/MapPage';
import { AlertsPage } from './pages/AlertsPage';
import { CitizenNotificationsPage } from './pages/CitizenNotificationsPage';
import { ProfilePage } from './pages/ProfilePage';
import { AdminPage } from './pages/AdminPage';
import { pushNotificationClientService } from './services/pushNotificationService';
import { disasterNotificationService } from './services/disasterNotificationService';

/**
 * Check if the current client is running inside Capacitor (Native Android / iOS)
 * or in a mobile form factor.
 */
export const isNativePlatform = (): boolean => {
  try {
    return Capacitor.isNativePlatform() || Capacitor.getPlatform() === 'android' || Capacitor.getPlatform() === 'ios';
  } catch {
    return false;
  }
};

export const checkIsMobile = (): boolean => {
  if (typeof window === 'undefined') return false;
  if (isNativePlatform()) return true;

  // Manual URL override for QA testing: ?view=mobile or ?view=admin
  const params = new URLSearchParams(window.location.search);
  if (params.get('mode') === 'mobile' || params.get('app') === 'true') {
    return true;
  }
  if (params.get('mode') === 'desktop' || params.get('admin') === 'true') {
    return false;
  }

  const ua = navigator.userAgent || navigator.vendor || '';
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  return isMobileUA || window.innerWidth <= 768;
};

export const App: React.FC = () => {
  const [isMobile, setIsMobile] = useState<boolean>(() => checkIsMobile());

  const getPathFromHash = useCallback((mobileMode: boolean): string => {
    if (typeof window === 'undefined') return mobileMode ? '/map' : '/admin';
    const hash = window.location.hash.replace(/^#\/?/, '').trim();

    if (mobileMode) {
      // Mobile app strictly shields admin routes and redirects to /map
      if (!hash || hash.toLowerCase().includes('admin')) {
        return '/map';
      }
      if (hash.startsWith('profile')) return '/profile';
      if (hash.startsWith('alerts')) return '/alerts';
      return '/map';
    }

    // Desktop Web: default route to /admin (EOC Console) if no specific hash
    if (!hash || hash === '/') {
      return '/admin';
    }
    return `/${hash}`;
  }, []);

  const [currentPath, setCurrentPath] = useState<string>(() => {
    return getPathFromHash(checkIsMobile());
  });

  const [role, setRole] = useState<'CITIZEN' | 'ADMIN'>(() => {
    if (checkIsMobile()) {
      // Mobile app is strictly for CITIZEN users
      return 'CITIZEN';
    }
    // Webpage primary persona is ADMIN
    return 'ADMIN';
  });

  const [hasActiveAlert, setHasActiveAlert] = useState<boolean>(() => {
    return !!disasterNotificationService.getActiveAlert();
  });

  // Track responsive screen resize for hybrid responsiveness
  useEffect(() => {
    const handleResize = () => {
      const mobileState = checkIsMobile();
      setIsMobile((prev) => {
        if (prev !== mobileState) {
          // Adjust role when transitioning
          if (mobileState) {
            setRole('CITIZEN');
          }
          return mobileState;
        }
        return prev;
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Listen for real-time disaster alerts for mobile notification badge
  useEffect(() => {
    const unsub = disasterNotificationService.onAlertChange((alert) => {
      setHasActiveAlert(!!alert);
    });
    return () => unsub();
  }, []);

  // Initialize Background Push & Android Notification Channels
  useEffect(() => {
    pushNotificationClientService.init();

    const handleHashChange = () => {
      const rawPath = getPathFromHash(isMobile);
      if (isMobile) {
        if (rawPath === '/admin' || rawPath.toLowerCase().includes('admin')) {
          handleNavigate('/map');
          return;
        }
        setCurrentPath(rawPath);
        setRole('CITIZEN');
      } else {
        setCurrentPath(rawPath);
        if (rawPath === '/admin') {
          setRole('ADMIN');
        }
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [isMobile, getPathFromHash]);

  useEffect(() => {
    disasterNotificationService.setUserRole(role);
  }, [role]);

  // Synchronize initial URL hash on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace(/^#\/?/, '').trim();
      if (isMobile) {
        setRole('CITIZEN');
        if (!hash || hash.toLowerCase().includes('admin')) {
          window.location.hash = 'map';
          setCurrentPath('/map');
        }
      } else {
        if (!hash) {
          window.location.hash = 'admin';
          setCurrentPath('/admin');
          setRole('ADMIN');
        }
      }
    }
  }, [isMobile]);

  const handleNavigate = (path: string) => {
    let targetPath = path;

    if (isMobile) {
      // Strictly prevent mobile from entering admin routes
      if (targetPath === '/admin' || targetPath.toLowerCase().includes('admin')) {
        targetPath = '/map';
      }
      setRole('CITIZEN');
    } else {
      if (targetPath === '/admin') {
        setRole('ADMIN');
      }
    }

    setCurrentPath(targetPath);
    if (typeof window !== 'undefined') {
      const cleanHash = targetPath === '/' ? '' : targetPath.replace(/^\//, '');
      window.location.hash = cleanHash;
    }
  };

  const handleRoleChange = (newRole: 'CITIZEN' | 'ADMIN') => {
    if (isMobile) {
      // Mobile app strictly enforces CITIZEN role
      setRole('CITIZEN');
      return;
    }

    setRole(newRole);
    if (newRole === 'ADMIN' && currentPath !== '/admin') {
      handleNavigate('/admin');
    } else if (newRole === 'CITIZEN' && currentPath === '/admin') {
      handleNavigate('/map');
    }
  };

  const isMapFullscreen = currentPath === '/map';

  // -------------------------------------------------------------------------
  // MOBILE APP INTERFACE (Capacitor Native Android / Mobile Citizen Persona)
  // Dedicated strictly to users: Live Map, Safe-Mobility, Alerts, Profile
  // -------------------------------------------------------------------------
  if (isMobile) {
    const renderMobilePage = () => {
      switch (currentPath) {
        case '/profile':
          return (
            <div className="standalone-profile-container">
              <ProfilePage />
            </div>
          );
        case '/alerts':
          return (
            <div className="standalone-profile-container">
              <CitizenNotificationsPage onNavigate={handleNavigate} />
            </div>
          );
        case '/map':
        default:
          return <MapPage onNavigate={handleNavigate} />;
      }
    };

    return (
      <I18nProvider>
        <div className="standalone-app-root">
          {/* Floating Auto-Update Banner for zero-delay OTA updates */}
          <AutoUpdateBanner />

          {/* Floating High-Priority Emergency Disaster Alert Heads-Up Banner */}
          <DisasterAlertBanner onNavigate={handleNavigate} role="CITIZEN" />

          {/* Main Citizen Safe-Mobility View */}
          <main className="standalone-app-main">
            {renderMobilePage()}
          </main>

          {/* Mobile Citizen Bottom Navigation Bar */}
          <nav className="standalone-bottom-nav" aria-label="Citizen Mobile Navigation">
            {/* 1. Live Safe-Mobility Map */}
            <button
              type="button"
              onClick={() => handleNavigate('/map')}
              className={`standalone-nav-tab ${currentPath === '/map' ? 'active' : ''}`}
              aria-label="Live Map and Safe Detours"
              style={{ flex: 1, maxWidth: '140px', padding: '6px 12px', position: 'relative' }}
            >
              {currentPath === '/map' && (
                <span
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '36px',
                    height: '3px',
                    borderRadius: '0 0 4px 4px',
                    background: '#38BDF8',
                    boxShadow: '0 0 8px #38BDF8',
                  }}
                />
              )}
              <span className="standalone-nav-icon">🗺️</span>
              <span className="standalone-nav-label">Live Map</span>
            </button>

            {/* 2. Alerts & Notifications */}
            <button
              type="button"
              onClick={() => handleNavigate('/alerts')}
              className={`standalone-nav-tab ${currentPath === '/alerts' ? 'active' : ''}`}
              aria-label="Emergency Alerts and Advisories"
              style={{ flex: 1, maxWidth: '140px', padding: '6px 12px', position: 'relative' }}
            >
              {currentPath === '/alerts' && (
                <span
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '36px',
                    height: '3px',
                    borderRadius: '0 0 4px 4px',
                    background: '#38BDF8',
                    boxShadow: '0 0 8px #38BDF8',
                  }}
                />
              )}
              <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="standalone-nav-icon">🔔</span>
                {hasActiveAlert && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '-2px',
                      right: '-6px',
                      width: '9px',
                      height: '9px',
                      borderRadius: '50%',
                      backgroundColor: '#EF4444',
                      boxShadow: '0 0 8px #EF4444',
                      border: '1.5px solid #0B1120',
                      animation: 'pulseGlow 1.2s infinite ease-in-out',
                    }}
                    title="Active Emergency Alert"
                  />
                )}
              </div>
              <span className="standalone-nav-label">Notifications</span>
            </button>

            {/* 3. Citizen Profile & Preferences */}
            <button
              type="button"
              onClick={() => handleNavigate('/profile')}
              className={`standalone-nav-tab ${currentPath === '/profile' ? 'active' : ''}`}
              aria-label="Citizen Profile and Notification Preferences"
              style={{ flex: 1, maxWidth: '140px', padding: '6px 12px', position: 'relative' }}
            >
              {currentPath === '/profile' && (
                <span
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '36px',
                    height: '3px',
                    borderRadius: '0 0 4px 4px',
                    background: '#38BDF8',
                    boxShadow: '0 0 8px #38BDF8',
                  }}
                />
              )}
              <span className="standalone-nav-icon">👤</span>
              <span className="standalone-nav-label">Profile</span>
            </button>
          </nav>
        </div>
      </I18nProvider>
    );
  }

  // -------------------------------------------------------------------------
  // WEBPAGE INTERFACE (Desktop Browser / EOC Authority Admin Console)
  // Dedicated primarily to EOC Admins, with full Top Navbar & Role Switcher
  // -------------------------------------------------------------------------
  const renderDesktopPage = () => {
    switch (currentPath) {
      case '/login':
        return <LoginPage onNavigate={handleNavigate} onRoleChange={handleRoleChange} />;
      case '/register':
        return <RegisterPage onNavigate={handleNavigate} onRoleChange={handleRoleChange} />;
      case '/home':
      case '/overview':
      case '/':
        return <HomePage onNavigate={handleNavigate} />;
      case '/dashboard':
        return <DashboardPage onNavigate={handleNavigate} />;
      case '/map':
        return <MapPage onNavigate={handleNavigate} />;
      case '/alerts':
        return <AlertsPage />;
      case '/profile':
        return <ProfilePage />;
      case '/admin':
      default:
        return <AdminPage role={role} onRoleChange={handleRoleChange} onNavigate={handleNavigate} />;
    }
  };

  return (
    <I18nProvider>
      <div style={{
        height: isMapFullscreen ? '100vh' : 'auto',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: isMapFullscreen ? 'hidden' : 'visible'
      }}>
        {/* Full Desktop Top Navbar with Role Switcher for Admin Monitoring */}
        <Navbar
          currentPath={currentPath}
          onNavigate={handleNavigate}
          role={role}
          onRoleChange={handleRoleChange}
        />

        {/* Floating Auto-Update Banner */}
        <AutoUpdateBanner />

        {/* Floating Disaster Alert Banner */}
        <DisasterAlertBanner onNavigate={handleNavigate} role={role} />

        <main style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          minHeight: 0,
          height: isMapFullscreen ? 'calc(100vh - 84px)' : 'auto',
          paddingBottom: isMapFullscreen ? '0' : '60px',
          overflow: isMapFullscreen ? 'hidden' : 'auto'
        }}>
          {renderDesktopPage()}
        </main>

        {!isMapFullscreen && (
          <footer style={{
            borderTop: '1px solid var(--border-subtle)',
            padding: '24px 20px',
            textAlign: 'center',
            fontSize: '0.8rem',
            color: 'var(--text-muted)',
            background: 'rgba(7, 11, 20, 0.95)',
          }}>
            <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <b>SmartCity Guardian</b> • AI-Powered Urban Disaster Resilience &amp; Mobility Platform
              </div>
              <div className="font-mono" style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="pulse-dot text-cyan" />
                <span>EOC COMMAND CENTER • REAL-TIME OPERATIONAL INTELLIGENCE ACTIVE</span>
              </div>
            </div>
          </footer>
        )}
      </div>
    </I18nProvider>
  );
};

export default App;
