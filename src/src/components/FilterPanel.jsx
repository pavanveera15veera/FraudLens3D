import { useMemo, useState } from 'react';

const TYPE_CONFIG = [
  { key: 'housing',      color: '#ff3333', label: 'Housing Violations'    },
  { key: 'restaurant',   color: '#33aaff', label: 'Restaurant Inspection' },
  { key: 'construction', color: '#33ff80', label: 'Construction Violation' },
  { key: 'service311',   color: '#ffff33', label: '311 Service Request'   },
  { key: 'permit',       color: '#ff9933', label: 'Permit Issuance'       },
  { key: 'property',     color: '#cc33ff', label: 'Property Valuation'    },
  { key: 'fire',         color: '#ff6699', label: 'Fire Incident'         },
];

const BOROUGH_COLORS = {
  manhattan:      '#00f5ff',
  brooklyn:       '#7b2fff',
  queens:         '#ff9933',
  bronx:          '#ff3366',
  'staten island':'#33ff80',
};

function SectionTitle({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 600, letterSpacing: '0.14em',
      color: 'var(--cyan)', marginBottom: 10, opacity: 0.8,
    }}>
      {children}
    </div>
  );
}

function Divider() {
  return (
    <div style={{
      height: 1, background: 'var(--border)',
      margin: '14px 0',
    }} />
  );
}

function Toggle({ on, color, onChange }) {
  return (
    <div
      onClick={onChange}
      style={{
        width: 34, height: 18, borderRadius: 9, flexShrink: 0, cursor: 'pointer',
        background: on ? `${color}44` : 'rgba(255,255,255,0.08)',
        border: `1px solid ${on ? color : 'rgba(255,255,255,0.15)'}`,
        position: 'relative', transition: 'all 0.2s',
      }}
    >
      <div style={{
        position: 'absolute', top: 2,
        left: on ? 17 : 2,
        width: 12, height: 12, borderRadius: '50%',
        background: on ? color : 'rgba(255,255,255,0.3)',
        transition: 'left 0.2s, background 0.2s',
        boxShadow: on ? `0 0 6px ${color}` : 'none',
      }} />
    </div>
  );
}

export default function FilterPanel({
  data, visible, visibleTypes, setVisibleTypes, minScore, setMinScore,
  showChainDetector, setShowChainDetector,
}) {
  const [hoveredType, setHoveredType] = useState(null);

  const typeCounts = useMemo(() => {
    const c = {};
    for (const d of data) c[d.type] = (c[d.type] || 0) + 1;
    return c;
  }, [data]);

  const topBoroughs = useMemo(() => {
    const sum = {}; const cnt = {};
    for (const d of data) {
      if (!d.borough) continue;
      sum[d.borough] = (sum[d.borough] || 0) + d.score;
      cnt[d.borough] = (cnt[d.borough] || 0) + 1;
    }
    const list = Object.entries(sum)
      .map(([b, s]) => ({ name: b, avg: s / cnt[b], count: cnt[b] }))
      .sort((a, b) => b.avg - a.avg);
    const maxAvg = list[0]?.avg || 1;
    return list.map((r) => ({ ...r, pct: r.avg / maxAvg }));
  }, [data]);

  function toggleType(key) {
    setVisibleTypes((prev) =>
      prev.includes(key) ? prev.filter((t) => t !== key) : [...prev, key]
    );
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  return (
    <div style={{
      position:   'fixed',
      top:        56, left: 0, bottom: 48,
      width:      280,
      zIndex:     100,
      background: 'var(--glass)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderRight: '1px solid var(--border)',
      borderTop:   '2px solid var(--cyan)',
      overflowY:   'auto',
      padding:     '16px 14px',
    }}>

      {/* ── Section 1: Data Layers ── */}
      <SectionTitle>DATA LAYERS</SectionTitle>

      {TYPE_CONFIG.map(({ key, color, label }) => {
        const on    = visibleTypes.includes(key);
        const count = typeCounts[key] ?? 0;
        const hov   = hoveredType === key;
        return (
          <div
            key={key}
            onMouseEnter={() => setHoveredType(key)}
            onMouseLeave={() => setHoveredType(null)}
            style={{
              display:      'flex',
              alignItems:   'center',
              gap:          8,
              padding:      '7px 8px',
              borderRadius: 8,
              marginBottom: 3,
              cursor:       'pointer',
              background:   hov ? `${color}12` : 'transparent',
              border:       `1px solid ${hov ? `${color}40` : 'transparent'}`,
              transition:   'all 0.15s',
            }}
            onClick={() => toggleType(key)}
          >
            {/* Color dot */}
            <div style={{
              width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
              background: on ? color : 'transparent',
              border: `1.5px solid ${color}`,
              boxShadow: on ? `0 0 8px ${color}` : 'none',
              transition: 'all 0.2s',
            }} />

            {/* Label */}
            <span style={{
              flex: 1, fontSize: 12, fontWeight: 400,
              color: on ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)',
              transition: 'color 0.2s',
            }}>
              {label}
            </span>

            {/* Count badge */}
            <span style={{
              fontSize: 10, fontWeight: 500, fontVariantNumeric: 'tabular-nums',
              background: on ? `${color}22` : 'rgba(255,255,255,0.06)',
              color: on ? color : 'rgba(255,255,255,0.3)',
              border: `1px solid ${on ? `${color}44` : 'transparent'}`,
              borderRadius: 4,
              padding: '1px 6px',
              minWidth: 38, textAlign: 'center',
              transition: 'all 0.2s',
            }}>
              {count.toLocaleString()}
            </span>

            {/* Toggle */}
            <Toggle on={on} color={color} onChange={() => toggleType(key)} />
          </div>
        );
      })}

      <Divider />

      {/* ── Section 2: Risk Threshold ── */}
      <SectionTitle>RISK THRESHOLD</SectionTitle>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, alignItems: 'baseline' }}>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Min score filter</span>
        <span style={{
          fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
          color: minScore >= 0.75 ? 'var(--red)' : minScore >= 0.5 ? '#ff9933' : 'var(--cyan)',
        }}>
          {(minScore * 100).toFixed(0)}%
        </span>
      </div>

      {/* Gradient track slider */}
      <div style={{ position: 'relative', marginBottom: 4 }}>
        <div style={{
          position: 'absolute', top: '50%', left: 0, right: 0,
          height: 4, borderRadius: 2, transform: 'translateY(-50%)',
          background: 'linear-gradient(to right, #33ff80, #ffff33, #ff9933, #ff3366)',
          pointerEvents: 'none',
        }} />
        <input
          type="range" min={0} max={1} step={0.01}
          value={minScore}
          onChange={(e) => setMinScore(parseFloat(e.target.value))}
          style={{
            width: '100%', appearance: 'none', WebkitAppearance: 'none',
            background: 'transparent', cursor: 'pointer',
            position: 'relative', zIndex: 1,
          }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'rgba(255,255,255,0.2)' }}>
        <span>LOW</span><span>CRITICAL</span>
      </div>

      <Divider />

      {/* ── Section 3: How to Read ── */}
      <SectionTitle>HOW TO READ</SectionTitle>

      {[
        { icon: '↕', title: 'Height', desc: 'Point elevation = fraud score intensity' },
        { icon: '●', title: 'Color',  desc: 'Each hue represents a violation type'   },
        { icon: '⬡', title: 'Density', desc: 'Tight clusters = high-risk hotspots'   },
      ].map(({ icon, title, desc }) => (
        <div key={title} style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'flex-start' }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6, flexShrink: 0,
            background: 'rgba(0,245,255,0.08)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, color: 'var(--cyan)',
          }}>
            {icon}
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: 2 }}>{title}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', lineHeight: 1.4 }}>{desc}</div>
          </div>
        </div>
      ))}

      <Divider />

      {/* ── Section 4: Top Risk Zones ── */}
      <SectionTitle>TOP RISK ZONES</SectionTitle>

      {topBoroughs.map(({ name, avg, count: cnt, pct }) => {
        const color = BOROUGH_COLORS[name] ?? 'var(--cyan)';
        return (
          <div key={name} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>{cap(name)}</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontVariantNumeric: 'tabular-nums' }}>
                  {cnt.toLocaleString()}
                </span>
                <span style={{ fontSize: 10, fontWeight: 600, color, fontVariantNumeric: 'tabular-nums' }}>
                  {(avg * 100).toFixed(0)}%
                </span>
              </div>
            </div>
            <div style={{ height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 2,
                width: `${pct * 100}%`,
                background: `linear-gradient(to right, ${color}88, ${color})`,
                transition: 'width 0.8s ease',
              }} />
            </div>
          </div>
        );
      })}

      {/* Visible count */}
      <div style={{
        marginTop: 14, padding: '8px 10px', borderRadius: 8,
        background: 'rgba(0,245,255,0.06)', border: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em' }}>VISIBLE</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--cyan)', fontVariantNumeric: 'tabular-nums' }}>
          {visible.length.toLocaleString()}
        </span>
      </div>

      <Divider />

      {/* Chain Detector toggle */}
      <button
        onClick={() => setShowChainDetector((v) => !v)}
        style={{
          width: '100%', padding: '9px 0',
          background: showChainDetector ? 'rgba(0,245,255,0.12)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${showChainDetector ? 'rgba(0,245,255,0.4)' : 'rgba(255,255,255,0.1)'}`,
          borderRadius: 8,
          color: showChainDetector ? '#00f5ff' : 'rgba(255,255,255,0.5)',
          fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
          cursor: 'pointer', fontFamily: 'Inter, sans-serif',
          transition: 'all 0.2s',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        <span style={{ fontSize: 13 }}>⛓</span>
        {showChainDetector ? 'HIDE CHAIN DETECTOR' : 'CHAIN DETECTOR'}
      </button>
    </div>
  );
}
