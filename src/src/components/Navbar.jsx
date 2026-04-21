import { useState, useEffect, useMemo } from 'react';

const BOROUGHS = ['all', 'manhattan', 'brooklyn', 'queens', 'bronx', 'staten island'];

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function HexLogo() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
      <polygon
        points="18,2 32,10 32,26 18,34 4,26 4,10"
        fill="rgba(0,245,255,0.08)"
        stroke="#00f5ff"
        strokeWidth="1.5"
      />
      {/* Eye shape */}
      <path
        d="M9 18 Q18 10 27 18 Q18 26 9 18 Z"
        fill="none"
        stroke="#00f5ff"
        strokeWidth="1.2"
      />
      {/* Iris */}
      <circle cx="18" cy="18" r="3.5" fill="rgba(0,245,255,0.25)" stroke="#00f5ff" strokeWidth="1" />
      {/* Pupil */}
      <circle cx="18" cy="18" r="1.4" fill="#00f5ff" />
    </svg>
  );
}

function useCounter(target, duration = 1600) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!target) return;
    let current = 0;
    const step = target / (duration / 16);
    const id = setInterval(() => {
      current += step;
      if (current >= target) { setVal(target); clearInterval(id); }
      else setVal(Math.floor(current));
    }, 16);
    return () => clearInterval(id);
  }, [target, duration]);
  return val;
}

function AnimatedCounter({ label, value, color }) {
  const displayed = useCounter(value);
  return (
    <div style={{ textAlign: 'center', minWidth: 100 }}>
      <div style={{
        fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
        color, letterSpacing: '-0.02em',
        textShadow: `0 0 20px ${color}88`,
      }}>
        {displayed.toLocaleString()}
      </div>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}

export default function Navbar({ data, selectedBorough, setSelectedBorough, portfolioActive, onPortfolioToggle }) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const total    = data.length;
  const alerts   = useMemo(() => data.filter((d) => d.score > 0.7).length, [data]);
  const critical = useMemo(() => data.filter((d) => d.score > 0.9).length, [data]);

  const timeStr = time.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });

  return (
    <div style={{
      position:   'fixed',
      top: 0, left: 0, right: 0,
      height:     56,
      zIndex:     200,
      background: 'var(--glass)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderBottom: '1px solid var(--cyan)',
      display:    'flex',
      alignItems: 'center',
      padding:    '0 20px',
      gap:        24,
    }}>
      {/* ── Logo ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <HexLogo />
        <div>
          <div style={{
            fontSize: 15, fontWeight: 700, letterSpacing: '0.12em', color: '#fff',
            lineHeight: 1.1,
          }}>
            FRAUDLENS<span style={{ color: 'var(--cyan)' }}>3D</span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--cyan)', letterSpacing: '0.08em', opacity: 0.8 }}>
            NYC RISK INTELLIGENCE
          </div>
        </div>
      </div>

      {/* ── Divider ── */}
      <div style={{ width: 1, height: 32, background: 'var(--border)', flexShrink: 0 }} />

      {/* ── Counters ── */}
      <div style={{
        flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 0,
      }}>
        <AnimatedCounter label="TOTAL RECORDS"   value={total}    color="var(--cyan)" />
        <div style={{ width: 1, height: 28, background: 'var(--border)', margin: '0 24px' }} />
        <AnimatedCounter label="ACTIVE ALERTS"   value={alerts}   color="#ff9933" />
        <div style={{ width: 1, height: 28, background: 'var(--border)', margin: '0 24px' }} />
        <AnimatedCounter label="CRITICAL ZONES"  value={critical} color="var(--red)" />
      </div>

      {/* ── Divider ── */}
      <div style={{ width: 1, height: 32, background: 'var(--border)', flexShrink: 0 }} />

      {/* ── Right controls ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
        {/* Clock */}
        <div style={{
          fontFamily: 'monospace', fontSize: 14, color: 'var(--cyan)',
          letterSpacing: '0.06em', opacity: 0.85,
        }}>
          {timeStr}
        </div>

        {/* Live badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%', background: 'var(--red)',
            animation: 'pulse 1.8s ease-in-out infinite',
          }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--red)', letterSpacing: '0.1em' }}>
            LIVE
          </span>
        </div>

        {/* Portfolio Builder toggle */}
        <button
          onClick={onPortfolioToggle}
          style={{
            background:   portfolioActive ? 'rgba(123,47,255,0.2)' : 'rgba(123,47,255,0.06)',
            border:       `1px solid ${portfolioActive ? 'rgba(123,47,255,0.6)' : 'rgba(123,47,255,0.25)'}`,
            borderRadius: 6,
            color:        portfolioActive ? '#7b2fff' : 'rgba(255,255,255,0.55)',
            fontSize:     11,
            padding:      '5px 12px',
            cursor:       'pointer',
            fontFamily:   'Inter, sans-serif',
            fontWeight:   700,
            letterSpacing:'0.08em',
            transition:   'all 0.2s',
          }}
        >
          ⬡ PORTFOLIO
        </button>

        {/* Borough selector */}
        <select
          value={selectedBorough}
          onChange={(e) => setSelectedBorough(e.target.value)}
          style={{
            background:   'rgba(0,245,255,0.06)',
            border:       '1px solid var(--border)',
            borderRadius: 6,
            color:        'rgba(255,255,255,0.85)',
            fontSize:     12,
            padding:      '4px 10px',
            cursor:       'pointer',
            outline:      'none',
            fontFamily:   'Inter, sans-serif',
          }}
        >
          {BOROUGHS.map((b) => (
            <option key={b} value={b} style={{ background: '#0a0a1e' }}>
              {b === 'all' ? 'All Boroughs' : cap(b)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
