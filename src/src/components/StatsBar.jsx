import { useMemo } from 'react';

const BOROUGH_ORDER  = ['manhattan', 'brooklyn', 'queens', 'bronx', 'staten island'];
const BOROUGH_COLORS = {
  manhattan:      '#00f5ff',
  brooklyn:       '#7b2fff',
  queens:         '#ff9933',
  bronx:          '#ff3366',
  'staten island':'#33ff80',
};

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

export default function StatsBar({ visible }) {
  const { boroughCounts, topBorough } = useMemo(() => {
    const counts = {};
    for (const d of visible) {
      if (!d.borough) continue;
      counts[d.borough] = (counts[d.borough] || 0) + 1;
    }
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return { boroughCounts: counts, topBorough: top };
  }, [visible]);

  const boroughs = BOROUGH_ORDER.filter((b) => boroughCounts[b] != null);

  return (
    <div style={{
      position:   'fixed',
      bottom: 0, left: 0, right: 0,
      height:     48,
      zIndex:     200,
      background: 'var(--glass)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderTop:  '1px solid var(--cyan)',
      display:    'flex',
      alignItems: 'center',
      padding:    '0 20px',
      gap:        16,
      pointerEvents: 'none',
    }}>
      {/* Borough pills */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1 }}>
        {boroughs.map((b) => {
          const color = BOROUGH_COLORS[b];
          const count = boroughCounts[b];
          const isTop = b === topBorough;
          return (
            <div
              key={b}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '3px 10px',
                borderRadius: 20,
                background: isTop ? `${color}22` : 'rgba(255,255,255,0.04)',
                border: `1px solid ${isTop ? `${color}88` : 'rgba(255,255,255,0.1)'}`,
                transition: 'all 0.3s',
              }}
            >
              <div style={{
                width: 6, height: 6, borderRadius: '50%', background: color,
                boxShadow: isTop ? `0 0 6px ${color}` : 'none',
              }} />
              <span style={{ fontSize: 11, color: isTop ? color : 'rgba(255,255,255,0.5)', fontWeight: isTop ? 600 : 400 }}>
                {cap(b)}
              </span>
              <span style={{
                fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                color: isTop ? '#fff' : 'rgba(255,255,255,0.4)',
              }}>
                {count.toLocaleString()}
              </span>
            </div>
          );
        })}
      </div>

      {/* Highest risk badge */}
      {topBorough && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '4px 14px', borderRadius: 20,
          background: `${BOROUGH_COLORS[topBorough]}18`,
          border: `1px solid ${BOROUGH_COLORS[topBorough]}55`,
        }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: 'var(--red)',
            animation: 'pulse 1.8s ease-in-out infinite',
          }} />
          <span style={{ fontSize: 10, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.5)' }}>
            HIGHEST RISK
          </span>
          <span style={{
            fontSize: 12, fontWeight: 700,
            color: BOROUGH_COLORS[topBorough],
          }}>
            {cap(topBorough)}
          </span>
        </div>
      )}

      {/* Total count */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', flexShrink: 0 }}>
        <span style={{ fontSize: 10, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.3)' }}>TOTAL</span>
        <span style={{
          fontSize: 15, fontWeight: 700, color: 'var(--cyan)',
          fontVariantNumeric: 'tabular-nums',
          textShadow: '0 0 12px var(--cyan)',
        }}>
          {visible.length.toLocaleString()}
        </span>
      </div>
    </div>
  );
}
