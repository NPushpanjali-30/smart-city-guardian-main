import React, { useState } from 'react';

interface LoginPageProps {
  onNavigate: (path: string) => void;
  onRoleChange: (role: 'CITIZEN' | 'ADMIN') => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onNavigate, onRoleChange }) => {
  const [email, setEmail] = useState('citizen@smartcity.org');
  const [password, setPassword] = useState('password123');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    const isAdmin = email.toLowerCase().includes('admin');
    const targetRole = isAdmin ? 'ADMIN' : 'CITIZEN';

    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      if (res.ok) {
        const data = await res.json();
        const user = data.user || {};
        const phone = user.phoneNumber || '+919876543210';

        localStorage.setItem('smartcity_token', data.accessToken || '');
        localStorage.setItem('smartcity_user_profile', JSON.stringify({
          id: user.id || (isAdmin ? 'admin-001' : 'user-001'),
          name: user.fullName || (isAdmin ? 'EOC Commander' : 'Metro Resident'),
          email: user.email || email.trim(),
          phoneNumber: phone,
          role: user.role || targetRole,
        }));
        localStorage.setItem('smartcity_profile_phone', phone);
        window.dispatchEvent(new CustomEvent('smartcity_profile_updated', {
          detail: {
            id: user.id,
            name: user.fullName,
            email: user.email,
            phoneNumber: phone,
            role: user.role || targetRole,
          },
        }));

        onRoleChange(user.role || targetRole);
        onNavigate(user.role === 'ADMIN' || isAdmin ? '/admin' : '/dashboard');
        return;
      } else {
        const errData = await res.json().catch(() => null);
        setErrorMessage(errData?.message || 'Login failed. Please check credentials.');
      }
    } catch {
      // Local demo fallback
      const defaultPhone = '+919876543210';
      localStorage.setItem('smartcity_user_profile', JSON.stringify({
        name: isAdmin ? 'EOC Commander' : 'Metro Resident',
        email: email.trim(),
        phoneNumber: defaultPhone,
        role: targetRole,
      }));
      localStorage.setItem('smartcity_profile_phone', defaultPhone);
      window.dispatchEvent(new CustomEvent('smartcity_profile_updated', {
        detail: { email, phoneNumber: defaultPhone, role: targetRole },
      }));
      onRoleChange(targetRole);
      onNavigate(isAdmin ? '/admin' : '/dashboard');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container" style={{ maxWidth: '480px', marginTop: '40px' }}>
      <div className="glass-panel" style={{ padding: '36px' }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800 }}>Welcome Back</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginTop: '6px' }}>
            Sign in to access your flood-aware route planner &amp; alerts.
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

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 14px',
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                color: 'white',
                fontSize: '0.95rem',
              }}
              required
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
              Tip: Use email containing <b>'admin'</b> to test EOC Authority login.
            </span>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 14px',
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                color: 'white',
                fontSize: '0.95rem',
              }}
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', padding: '12px' }}
            disabled={isLoading}
          >
            {isLoading ? 'Signing In...' : 'Sign In to SmartCity Guardian'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '24px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          Don't have an account?{' '}
          <span
            onClick={() => onNavigate('/register')}
            style={{ color: 'var(--accent-cyan)', cursor: 'pointer', fontWeight: 600 }}
          >
            Create Citizen Profile
          </span>
        </div>
      </div>
    </div>
  );
};
