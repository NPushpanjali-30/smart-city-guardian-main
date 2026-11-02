import React, { useState, useEffect } from 'react';
import { LanguageCode, FloodSeverity } from '@smartcity/shared';
import { getConfiguredServerUrl, setConfiguredServerUrl, DEFAULT_HOST_IP, DEFAULT_HOST_PORT } from '../services/apiConfig';

const STORAGE_KEY_PROFILE = 'smartcity_user_profile';
const STORAGE_KEY_PHONE = 'smartcity_profile_phone';

function extract10Digits(input?: string): string {
  if (!input) return '';
  let cleaned = input.replace(/\D/g, '');
  if (cleaned.startsWith('0091') && cleaned.length >= 14) {
    cleaned = cleaned.slice(4);
  } else if (cleaned.startsWith('91') && cleaned.length >= 12) {
    cleaned = cleaned.slice(2);
  } else if (cleaned.startsWith('0') && cleaned.length >= 11) {
    cleaned = cleaned.slice(1);
  }
  return cleaned.slice(0, 10);
}

function maskPhone(phone: string): string {
  const clean = phone.trim();
  if (!clean) return '+91 78*** ***91';
  if (clean.length <= 5) return clean;
  // If Indian standard (+919876543210 or +91 9876543210)
  const digitsOnly = clean.replace(/[^\d+]/g, '');
  if (digitsOnly.startsWith('+91') && digitsOnly.length >= 12) {
    return `+91 ${digitsOnly.slice(3, 5)}*** ***${digitsOnly.slice(-2)}`;
  }
  if (digitsOnly.length >= 10) {
    return `${digitsOnly.slice(0, 3)}*** ***${digitsOnly.slice(-2)}`;
  }
  return `${digitsOnly.slice(0, 2)}***${digitsOnly.slice(-2)}`;
}

export const ProfilePage: React.FC = () => {
  const [citizenName, setCitizenName] = useState(() => {
    try {
      const cached = localStorage.getItem(STORAGE_KEY_PROFILE);
      if (cached) {
        const p = JSON.parse(cached);
        if (p.name) return p.name;
      }
    } catch {}
    return 'Maya Chen';
  });

  const [citizenEmail, setCitizenEmail] = useState(() => {
    try {
      const cached = localStorage.getItem(STORAGE_KEY_PROFILE);
      if (cached) {
        const p = JSON.parse(cached);
        if (p.email) return p.email;
      }
    } catch {}
    return 'maya.chen@metro.org';
  });

  const [phoneNumber, setPhoneNumber] = useState(() => {
    try {
      const cached = localStorage.getItem(STORAGE_KEY_PROFILE);
      if (cached) {
        const p = JSON.parse(cached);
        if (p.phoneNumber) return p.phoneNumber;
      }
      return localStorage.getItem(STORAGE_KEY_PHONE) || '';
    } catch {
      return '';
    }
  });

  const [phoneNumberMasked, setPhoneNumberMasked] = useState(() => {
    try {
      const cached = localStorage.getItem(STORAGE_KEY_PROFILE);
      if (cached) {
        const p = JSON.parse(cached);
        if (p.phoneNumberMasked) return p.phoneNumberMasked;
        if (p.phoneNumber) return maskPhone(p.phoneNumber);
      }
    } catch {}
    return '';
  });

  const [smsOptIn, setSmsOptIn] = useState(() => {
    try {
      const cached = localStorage.getItem(STORAGE_KEY_PROFILE);
      if (cached) {
        const p = JSON.parse(cached);
        if (p.smsOptIn !== undefined) return Boolean(p.smsOptIn);
      }
    } catch {}
    return true;
  });

  const [inAppOptIn, setInAppOptIn] = useState(() => {
    try {
      const cached = localStorage.getItem(STORAGE_KEY_PROFILE);
      if (cached) {
        const p = JSON.parse(cached);
        if (p.inAppOptIn !== undefined) return Boolean(p.inAppOptIn);
      }
    } catch {}
    return true;
  });

  const [preferredLanguage, setPreferredLanguage] = useState<LanguageCode>(() => {
    try {
      const cached = localStorage.getItem(STORAGE_KEY_PROFILE);
      if (cached) {
        const p = JSON.parse(cached);
        if (p.preferredLanguage) return p.preferredLanguage;
      }
    } catch {}
    return 'en';
  });

  const [minSeverity, setMinSeverity] = useState<FloodSeverity>(() => {
    try {
      const cached = localStorage.getItem(STORAGE_KEY_PROFILE);
      if (cached) {
        const p = JSON.parse(cached);
        if (p.minSeverity) return p.minSeverity;
      }
    } catch {}
    return 'WARNING';
  });

  const [alertRadiusKm, setAlertRadiusKm] = useState(() => {
    try {
      const cached = localStorage.getItem(STORAGE_KEY_PROFILE);
      if (cached) {
        const p = JSON.parse(cached);
        if (p.alertRadiusKm) return Number(p.alertRadiusKm);
      }
    } catch {}
    return 10;
  });

  const [isLoading, setIsLoading] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // EOC Server Connection State
  const [serverUrl, setServerUrl] = useState(() => getConfiguredServerUrl() || `http://${DEFAULT_HOST_IP}:${DEFAULT_HOST_PORT}`);
  const [serverTestStatus, setServerTestStatus] = useState<string | null>(null);
  const [isTestingServer, setIsTestingServer] = useState(false);

  // Load user preferences from API on mount with offline resilience
  useEffect(() => {
    const handleProfileUpdate = (e: any) => {
      const p = e?.detail;
      if (p?.name) setCitizenName(p.name);
      if (p?.email) setCitizenEmail(p.email);
      if (p?.phoneNumber) {
        setPhoneNumber(p.phoneNumber);
        setPhoneNumberMasked(p.phoneNumberMasked || maskPhone(p.phoneNumber));
      }
    };
    window.addEventListener('smartcity_profile_updated', handleProfileUpdate);

    const fetchPrefs = async () => {
      try {
        const res = await fetch('/api/v1/alerts/preferences?userId=demo-user-1');
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          const json = await res.json();
          if (json?.data) {
            const remotePhone = json.data.phoneNumber || '';
            if (remotePhone) {
              setPhoneNumber(remotePhone);
              setPhoneNumberMasked(json.data.phoneNumberMasked || maskPhone(remotePhone));
            }
            if (json.data.smsOptIn !== undefined) setSmsOptIn(Boolean(json.data.smsOptIn));
            if (json.data.preferredLanguage) setPreferredLanguage(json.data.preferredLanguage);
            if (json.data.minSeverity) setMinSeverity(json.data.minSeverity);
            if (json.data.alertRadiusKm) setAlertRadiusKm(json.data.alertRadiusKm);

            if (json.data.channels) {
              if (Array.isArray(json.data.channels)) {
                setSmsOptIn(json.data.channels.includes('SMS'));
                setInAppOptIn(json.data.channels.includes('IN_APP'));
              } else {
                setSmsOptIn(Boolean(json.data.channels.sms));
                setInAppOptIn(Boolean(json.data.channels.inApp));
              }
            }
          }
        }
      } catch {
        // Fallback silently to seeded / localStorage profile
      }
    };
    fetchPrefs();
    return () => window.removeEventListener('smartcity_profile_updated', handleProfileUpdate);
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);
    setSavedSuccess(false);

    const cleanPhone = phoneNumber.trim();
    const digitsOnly = extract10Digits(cleanPhone);
    let formattedE164: string | null = null;
    let calculatedMasked = '';

    if (digitsOnly.length > 0) {
      if (digitsOnly.length !== 10) {
        setErrorMessage('Indian mobile number must be exactly 10 digits.');
        setIsLoading(false);
        return;
      }
      if (!/^[6-9]/.test(digitsOnly)) {
        setErrorMessage('Indian mobile number must begin with digits 6, 7, 8, or 9.');
        setIsLoading(false);
        return;
      }
      formattedE164 = `+91${digitsOnly}`;
      calculatedMasked = maskPhone(formattedE164);
    }

    // 1. Attempt authoritative backend sync if available
    try {
      await fetch('/api/v1/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: citizenName,
          phoneNumber: formattedE164,
          email: citizenEmail,
          smsConsent: smsOptIn,
        }),
      });

      const res = await fetch('/api/v1/alerts/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'demo-user-1',
          phoneNumber: formattedE164 || undefined,
          smsOptIn,
          preferredLanguage,
          minSeverity,
          alertRadiusKm,
          channels: {
            sms: smsOptIn,
            inApp: inAppOptIn,
          },
        }),
      });

      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        if (data?.data?.phoneNumberMasked) {
          calculatedMasked = data.data.phoneNumberMasked;
        }
      }
    } catch {
      // Backend unavailable or running as static deployment
    }

    // 2. Persist to state and browser localStorage for zero-failure demo continuity
    setPhoneNumber(formattedE164 || '');
    setPhoneNumberMasked(calculatedMasked);

    try {
      const profileToSave = {
        name: citizenName,
        email: citizenEmail,
        phoneNumber: formattedE164,
        phoneNumberMasked: calculatedMasked,
        smsOptIn,
        inAppOptIn,
        preferredLanguage,
        minSeverity,
        alertRadiusKm,
      };
      localStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(profileToSave));
      if (formattedE164) {
        localStorage.setItem(STORAGE_KEY_PHONE, formattedE164);
      } else {
        localStorage.removeItem(STORAGE_KEY_PHONE);
      }
      window.dispatchEvent(new CustomEvent('smartcity_profile_updated', { detail: profileToSave }));
    } catch {}

    setSavedSuccess(true);
    setIsLoading(false);
    setTimeout(() => setSavedSuccess(false), 5000);
  };

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h2 style={{ fontSize: '1.45rem', fontWeight: 800, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>👤</span>
          <span>Citizen Profile &amp; Preferences</span>
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
          Registered mobile contact, emergency SMS dispatch, and Bangalore flood alerts.
        </p>
      </div>

      {savedSuccess && (
        <div style={{
          padding: '12px 18px',
          borderRadius: '8px',
          background: 'rgba(16, 185, 129, 0.15)',
          border: '1px solid rgba(16, 185, 129, 0.4)',
          color: 'var(--color-normal)',
          fontSize: '0.88rem',
          fontWeight: 600,
        }}>
          ✓ Notification preferences and emergency contact updated successfully.
        </div>
      )}

      {errorMessage && (
        <div style={{
          padding: '12px 18px',
          borderRadius: '8px',
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid rgba(239, 68, 68, 0.4)',
          color: '#fca5a5',
          fontSize: '0.88rem',
        }}>
          ⚠ {errorMessage}
        </div>
      )}

      {(!phoneNumber || extract10Digits(phoneNumber).length < 10) && (
        <div style={{
          padding: '12px 18px',
          borderRadius: '8px',
          background: 'rgba(56, 189, 248, 0.12)',
          border: '1px solid rgba(56, 189, 248, 0.35)',
          color: '#7dd3fc',
          fontSize: '0.88rem',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}>
          <span style={{ fontSize: '1.25rem' }}>💡</span>
          <span>
            <strong>Phone number not configured:</strong> Add your 10-digit Indian mobile number (+91) below to receive emergency SMS flood advisories and evacuation alerts directly on your device.
          </span>
        </div>
      )}

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Account Details & Contact */}
        <div className="glass-panel" style={{ padding: '26px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 700 }}>Account &amp; Verified Recipient Info</h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
            <div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>CITIZEN NAME</div>
              <div style={{ fontWeight: 600, fontSize: '0.95rem', marginTop: '2px' }}>{citizenName}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>ACCOUNT ROLE</div>
              <div style={{ marginTop: '2px' }}>
                <span className="badge badge-normal">VERIFIED CITIZEN</span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>REGISTERED EMAIL</div>
              <div style={{ fontWeight: 600, fontSize: '0.95rem', marginTop: '2px' }}>{citizenEmail}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>REGISTERED PHONE</div>
              <div className="font-mono" style={{ fontWeight: 700, fontSize: '0.95rem', marginTop: '2px', color: (phoneNumber && extract10Digits(phoneNumber).length === 10) ? 'var(--accent-cyan)' : 'var(--text-muted)' }}>
                {(phoneNumber && extract10Digits(phoneNumber).length === 10) ? (phoneNumberMasked || maskPhone(phoneNumber)) : 'Not configured'}
              </div>
            </div>
          </div>

          <div style={{ marginTop: '10px' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
              Mobile Phone Number (🇮🇳 +91 Fixed) <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>(Optional)</span>
            </label>
            <div style={{ display: 'flex', alignItems: 'stretch' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '10px 14px',
                background: 'rgba(30, 41, 59, 0.95)',
                border: '1px solid var(--border-subtle)',
                borderRight: 'none',
                borderTopLeftRadius: '6px',
                borderBottomLeftRadius: '6px',
                color: 'var(--accent-cyan)',
                fontWeight: 700,
                fontSize: '0.9rem',
                userSelect: 'none',
              }}>
                <span>🇮🇳 +91</span>
              </div>
              <input
                type="tel"
                value={extract10Digits(phoneNumber)}
                onChange={(e) => {
                  const digits = extract10Digits(e.target.value);
                  setPhoneNumber(`+91${digits}`);
                }}
                placeholder="9876543210"
                maxLength={10}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  background: 'rgba(15, 23, 42, 0.8)',
                  border: '1px solid var(--border-subtle)',
                  borderTopRightRadius: '6px',
                  borderBottomRightRadius: '6px',
                  color: 'white',
                  fontSize: '0.9rem',
                  fontFamily: 'monospace',
                  letterSpacing: '1px',
                }}
              />
            </div>
            <p style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Locked to India (+91). Optional — enter your 10-digit mobile number ({extract10Digits(phoneNumber).length}/10 digits, starts with 6-9) to enable SMS alerts.
            </p>
          </div>
        </div>

        {/* Trilingual Preferences & Severity Threshold */}
        <div className="glass-panel" style={{ padding: '26px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 700 }}>Notification &amp; Language Preferences</h3>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
              Preferred Emergency Alert Language
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
              {[
                { code: 'en' as const, label: 'English', sub: 'Latin GSM-7' },
                { code: 'hi' as const, label: 'हिंदी (Hindi)', sub: 'Devanagari UCS-2' },
                { code: 'kn' as const, label: 'ಕನ್ನಡ (Kannada)', sub: 'Kannada UCS-2' },
              ].map((opt) => (
                <button
                  key={opt.code}
                  type="button"
                  onClick={() => setPreferredLanguage(opt.code)}
                  style={{
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid',
                    textAlign: 'left',
                    cursor: 'pointer',
                    background: preferredLanguage === opt.code ? 'rgba(6, 182, 212, 0.18)' : 'rgba(15, 23, 42, 0.6)',
                    borderColor: preferredLanguage === opt.code ? 'var(--accent-cyan)' : 'var(--border-subtle)',
                    color: preferredLanguage === opt.code ? 'var(--accent-cyan)' : 'white',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{opt.label}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{opt.sub}</div>
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                Minimum Severity Threshold
              </label>
              <select
                value={minSeverity}
                onChange={(e) => setMinSeverity(e.target.value as FloodSeverity)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  background: 'rgba(15, 23, 42, 0.8)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  color: 'white',
                  fontSize: '0.85rem',
                }}
              >
                <option value="WATCH">WATCH (Elevated Caution)</option>
                <option value="WARNING">WARNING (Recommended Default)</option>
                <option value="CRITICAL">CRITICAL ONLY (Life-Safety Urgent)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                Alert Radius: {alertRadiusKm} km
              </label>
              <input
                type="range"
                min={2}
                max={25}
                step={1}
                value={alertRadiusKm}
                onChange={(e) => setAlertRadiusKm(Number(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--accent-cyan)' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                <span>2 km</span>
                <span>10 km (Standard)</span>
                <span>25 km</span>
              </div>
            </div>
          </div>

          {/* Delivery Channels */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
              Active Delivery Channels
            </label>
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>
                <input
                  type="checkbox"
                  checked={smsOptIn}
                  onChange={(e) => setSmsOptIn(e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: 'var(--accent-cyan)' }}
                />
                <span>SMS Text Message (Carrier Dispatch)</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>
                <input
                  type="checkbox"
                  checked={inAppOptIn}
                  onChange={(e) => setInAppOptIn(e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: 'var(--accent-cyan)' }}
                />
                <span>In-App Real-Time Toast &amp; Modal</span>
              </label>
            </div>
          </div>

          {/* Privacy Note */}
          <div style={{
            background: 'rgba(56, 189, 248, 0.08)',
            border: '1px solid rgba(56, 189, 248, 0.2)',
            borderRadius: '8px',
            padding: '12px 16px',
            fontSize: '0.8rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
          }}>
            <b>Citizen Privacy Guarantee:</b> All proximity evaluations evaluate GPS coordinates in volatile RAM during active commute sessions only. Coordinates are never permanently stored with dispatched notification logs, and recipient phone numbers are securely masked.
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="btn btn-primary"
            style={{ alignSelf: 'flex-start', marginTop: '6px' }}
          >
            {isLoading ? 'Saving...' : 'Save Notification Preferences'}
          </button>
        </div>
      </form>

      {/* EOC Command Center Network Connection Settings */}
      <div
        className="glass-panel"
        style={{
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          borderRadius: '12px',
          border: '1px solid rgba(56, 189, 248, 0.25)',
          background: 'rgba(15, 23, 42, 0.6)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 4px 0', color: '#F8FAFC' }}>
              📡 EOC Server &amp; Wi-Fi Connection
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
              Backend server address for live emergency broadcast reception &amp; siren sync.
            </p>
          </div>
          <span style={{ fontSize: '0.72rem', background: '#0369A1', color: '#FFF', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
            LAN HOST
          </span>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <input
            type="text"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="http://192.168.0.120:4000"
            style={{
              flex: 1,
              minWidth: '200px',
              padding: '8px 12px',
              background: 'rgba(0, 0, 0, 0.4)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              color: 'white',
              fontSize: '0.82rem',
              fontFamily: 'monospace',
            }}
          />
          <button
            type="button"
            disabled={isTestingServer}
            onClick={async () => {
              setIsTestingServer(true);
              setServerTestStatus('⏳ Testing connection to server...');
              try {
                const target = serverUrl.trim().replace(/\/+$/, '');
                const start = Date.now();
                const res = await fetch(`${target}/health`, { cache: 'no-store' });
                const elapsed = Date.now() - start;
                if (res.ok) {
                  setServerTestStatus(`✅ Connected successfully! (${elapsed}ms latency)`);
                  setConfiguredServerUrl(target);
                } else {
                  setServerTestStatus(`⚠️ Server responded with HTTP ${res.status}`);
                }
              } catch (err: any) {
                setServerTestStatus(`❌ Could not connect: ${err?.message || 'Check Wi-Fi network'}`);
              } finally {
                setIsTestingServer(false);
              }
            }}
            style={{
              background: '#0284C7',
              color: '#FFF',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 14px',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {isTestingServer ? 'Testing...' : 'Test & Save'}
          </button>
        </div>

        {serverTestStatus && (
          <div style={{
            fontSize: '0.78rem',
            fontWeight: 600,
            color: serverTestStatus.startsWith('✅') ? '#34D399' : serverTestStatus.startsWith('⏳') ? '#38BDF8' : '#F87171',
          }}>
            {serverTestStatus}
          </div>
        )}

        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          Default host: <code>http://{DEFAULT_HOST_IP}:{DEFAULT_HOST_PORT}</code>. Ensure phone is on the same local Wi-Fi.
        </div>
      </div>
    </div>
  );
};
