import React from 'react';

interface HomePageProps {
  onNavigate: (path: string) => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onNavigate }) => {
  return (
    <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
      {/* Hero Banner */}
      <section className="glass-panel" style={{
        padding: '48px 40px',
        position: 'relative',
        overflow: 'hidden',
        background: 'radial-gradient(circle at 80% 20%, rgba(6, 182, 212, 0.15) 0%, transparent 60%), var(--bg-card)',
      }}>
        <div style={{ maxWidth: '780px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span className="badge badge-warning">
              <span className="pulse-dot" /> Real-Time Decision Support Active
            </span>
            <span className="badge badge-normal">Phase 1 Foundation Live</span>
          </div>

          <h1 style={{ fontSize: '2.8rem', fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.03em' }}>
            AI-Powered Urban Flood Defense &amp; <span className="text-cyan">Disaster-Resilient Navigation</span>
          </h1>

          <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            SmartCity Guardian integrates live environmental meteorological telemetry, transportation congestion graphs, and multi-factor hydrological modeling to protect urban mobility. By combining deterministic safety guarantees with Grok AI decision intelligence, we keep citizens and emergency responders safe.
          </p>

          <div style={{ display: 'flex', gap: '16px', marginTop: '10px' }}>
            <button className="btn btn-primary" onClick={() => onNavigate('/map')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
                <line x1="8" y1="2" x2="8" y2="18"/>
                <line x1="16" y1="6" x2="16" y2="22"/>
              </svg>
              Explore Live Hazard Map
            </button>
            <button className="btn btn-secondary" onClick={() => onNavigate('/dashboard')}>
              Citizen Commute Shield
            </button>
            <button className="btn btn-secondary" onClick={() => onNavigate('/admin')}>
              EOC Operations Console
            </button>
          </div>
        </div>
      </section>

      {/* 3 Pillar Interactive Capabilities */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
        <div className="glass-panel" style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '10px',
            background: 'rgba(56, 189, 248, 0.15)',
            color: 'var(--accent-cyan)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
            </svg>
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Explainable Flood Risk Scoring</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', lineHeight: 1.5 }}>
            No black-box guesses. We synthesize current precipitation intensity, antecedent soil saturation, short-term predictive radar, and verified citizen hazard reports into transparent 0–100 scores.
          </p>
          <div style={{ marginTop: 'auto', paddingTop: '10px' }}>
            <span className="badge badge-critical">78.5/100 CRITICAL</span>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '10px',
            background: 'rgba(16, 185, 129, 0.15)',
            color: 'var(--color-normal)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="6" cy="19" r="3"/>
              <path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/>
              <circle cx="18" cy="5" r="3"/>
            </svg>
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Safety-Weighted Routing</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', lineHeight: 1.5 }}>
            Traditional navigation steers cars into deadly flooded underpasses because they look empty of traffic. SmartCity Guardian inverts this: safety strictly dominates time. Submerged corridors are permanently excluded.
          </p>
          <div style={{ marginTop: 'auto', paddingTop: '10px' }}>
            <span className="badge badge-normal">Submerged Roads Excluded</span>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '10px',
            background: 'rgba(99, 102, 241, 0.15)',
            color: 'var(--accent-indigo)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Grok AI Action Plans &amp; SMS</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', lineHeight: 1.5 }}>
            Grok reasons over validated telemetry to craft prioritized checklists for municipal operators and sends 160-character emergency SMS advisories to citizens before they reach rising waters.
          </p>
          <div style={{ marginTop: 'auto', paddingTop: '10px' }}>
            <span className="badge badge-watch">Deduplicated SMS Enabled</span>
          </div>
        </div>
      </section>

      {/* Closed Loop Architecture Visualizer */}
      <section className="glass-panel" style={{ padding: '32px' }}>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '8px' }}>
          The Autonomous Closed-Loop Event Cycle
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '24px' }}>
          How environmental telemetry propagates through our modular monolith to protect citizens in real time.
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '12px',
          textAlign: 'center',
        }}>
          {[
            { step: '01', title: 'Live Weather', desc: 'Rainfall rate & radar forecast' },
            { step: '02', title: 'Flood Risk', desc: 'Antecedent soil saturation calc' },
            { step: '03', title: 'Road Status', desc: 'Corridor states (OPEN/BLOCKED)' },
            { step: '04', title: 'Safe Routing', desc: 'Safety-weighted graph solver' },
            { step: '05', title: 'Grok Reasoning', desc: 'Contextual synthesis & plan' },
            { step: '06', title: 'Targeted SMS', desc: 'Deduplicated direct broadcast' },
          ].map((item, idx) => (
            <div
              key={idx}
              style={{
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '16px 12px',
              }}
            >
              <div className="font-mono text-cyan" style={{ fontSize: '0.8rem', fontWeight: 700 }}>
                {item.step}
              </div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', marginTop: '6px' }}>
                {item.title}
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: '4px' }}>
                {item.desc}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
