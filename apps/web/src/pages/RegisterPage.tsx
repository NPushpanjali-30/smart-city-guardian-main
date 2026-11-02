import React, { useState } from 'react';

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

interface RegisterPageProps {
  onNavigate: (path: string) => void;
  onRoleChange: (role: 'CITIZEN' | 'ADMIN') => void;
}

export const RegisterPage: React.FC<RegisterPageProps> = ({ onNavigate, onRoleChange }) => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('+919876543210');
  const [password, setPassword] = useState('');
  const [smsConsent, setSmsConsent] = useState(true);
  const [severityThreshold, setSeverityThreshold] = useState('WARNING');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const digits = extract10Digits(phoneNumber);
    if (digits.length !== 10) {
      setErrorMessage('Please enter a valid 10-digit Indian mobile number.');
      return;
    }
    if (!/^[6-9]/.test(digits)) {
      setErrorMessage('Indian mobile number must begin with digits 6, 7, 8, or 9.');
      return;
    }

    const cleanPhone = `+91${digits}`;
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim(),
          phoneNumber: cleanPhone,
          password,
          smsConsent,
          minSeverityThreshold: severityThreshold,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const profile = {
          id: data.user?.id || 'user-001',
          name: data.user?.fullName || fullName.trim(),
          email: data.user?.email || email.trim(),
          phoneNumber: data.user?.phoneNumber || cleanPhone,
          phoneNumberMasked: `${cleanPhone.slice(0, 5)}*** ***${cleanPhone.slice(-2)}`,
          smsOptIn: smsConsent,
          minSeverity: severityThreshold,
          role: data.user?.role || 'CITIZEN',
        };
        localStorage.setItem('smartcity_token', data.accessToken || '');
        localStorage.setItem('smartcity_user_profile', JSON.stringify(profile));
        localStorage.setItem('smartcity_profile_phone', profile.phoneNumber);
        window.dispatchEvent(new CustomEvent('smartcity_profile_updated', { detail: profile }));
        onRoleChange('CITIZEN');
        onNavigate('/dashboard');
        return;
      } else {
        const errData = await res.json().catch(() => null);
        setErrorMessage(errData?.message || 'Registration failed. Please check details.');
      }
    } catch {
      // Local fallback in offline mode
      const profile = {
        name: fullName.trim() || 'Metro Resident',
        email: email.trim(),
        phoneNumber: cleanPhone,
        phoneNumberMasked: `${cleanPhone.slice(0, 5)}*** ***${cleanPhone.slice(-2)}`,
        smsOptIn: smsConsent,
        minSeverity: severityThreshold,
        role: 'CITIZEN' as const,
      };
      localStorage.setItem('smartcity_user_profile', JSON.stringify(profile));
      localStorage.setItem('smartcity_profile_phone', cleanPhone);
      window.dispatchEvent(new CustomEvent('smartcity_profile_updated', { detail: profile }));
      onRoleChange('CITIZEN');
      onNavigate('/dashboard');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container" style={{ maxWidth: '540px', marginTop: '30px' }}>
      <div className="glass-panel" style={{ padding: '36px' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800 }}>Create Citizen Profile</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginTop: '6px' }}>
            Register to receive safety-weighted routing and emergency SMS flood advisories.
          </p>
        </div>

        {errorMessage && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid #ef4444',
            color: '#fca5a5',
            padding: '10px 14px',
            borderRadius: '8px',
            fontSize: '0.85rem',
            marginBottom: '16px'
          }}>
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
              Full Name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Rahul Sharma"
              style={{
                width: '100%',
                padding: '10px 14px',
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                color: 'white',
              }}
              required
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="rahul.sharma@example.com"
              style={{
                width: '100%',
                padding: '10px 14px',
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                color: 'white',
              }}
              required
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
              Mobile Phone (India 🇮🇳 +91 Fixed) <span style={{ color: '#ef4444' }}>*</span>
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
                borderTopLeftRadius: '8px',
                borderBottomLeftRadius: '8px',
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
                  borderTopRightRadius: '8px',
                  borderBottomRightRadius: '8px',
                  color: 'white',
                  fontSize: '0.9rem',
                  fontFamily: 'monospace',
                  letterSpacing: '1px',
                }}
                required
              />
            </div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
              Required for emergency SMS broadcasts ({extract10Digits(phoneNumber).length}/10 digits, starts with 6-9).
            </span>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
              Create Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              style={{
                width: '100%',
                padding: '10px 14px',
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                color: 'white',
              }}
              required
            />
          </div>

          <div style={{
            background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            padding: '14px',
          }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={smsConsent}
                onChange={(e) => setSmsConsent(e.target.checked)}
                style={{ marginTop: '3px' }}
              />
              <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                I consent to receive high-priority, deduplicated Emergency SMS flood and route disruption alerts on my mobile phone.
              </span>
            </label>

            <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Minimum Alert Severity:</span>
              <select
                value={severityThreshold}
                onChange={(e) => setSeverityThreshold(e.target.value)}
                style={{
                  background: 'rgba(30, 41, 59, 0.8)',
                  color: 'white',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  padding: '4px 8px',
                  fontSize: '0.8rem',
                }}
              >
                <option value="WATCH">WATCH (Elevated Caution)</option>
                <option value="WARNING">WARNING (Recommended)</option>
                <option value="CRITICAL">CRITICAL ONLY (Life Safety)</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', padding: '12px' }}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Registering...' : 'Complete Registration & Enter Dashboard'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          Already registered?{' '}
          <span
            onClick={() => onNavigate('/login')}
            style={{ color: 'var(--accent-cyan)', cursor: 'pointer', fontWeight: 600 }}
          >
            Sign In
          </span>
        </div>
      </div>
    </div>
  );
};
