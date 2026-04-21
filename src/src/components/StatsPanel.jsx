import { useMemo } from 'react';

const BOROUGH_COLORS = {
  manhattan:      '#00f5ff',
  brooklyn:       '#7b2fff',
  queens:         '#ff9933',
  bronx:          '#ff3366',
  'staten island':'#33ff80',
};

const RISK_BANDS = [
  { key: 'critical', label: 'Critical', color: '#ff3366', min: 0.75 },
  { key: 'high',     label: 'High',     color: '#ff9933', min: 0.50 },
  { key: 'medium',   label: 'Medium',   color: '#ffff33', min: 0.25 },
  { key: 'low',      label: 'Low',      color: '#33ff80', min: 0    },
];

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function SectionTitle({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 600, letterSpacing: '0.14em',
      color: 'var(--cyan)', marginBottom: 12, opacity: 0.8,
    }}>
      {children}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: 'var(--border)', margin: '14px 0' }} />;
}

export default function StatsPanel({ data, visible }) {
  // Borough breakdown from visible records
  const boroughStats = useMemo(() => {
    const cnt = {};
    for (const d of visible) {
      if (!d.borough) continue;
      cnt[d.borough] = (cnt[d.borough] || 0) + 1;
    }
    const total = visible.length || 1;
    return Object.entries(cnt)
      .map(([b, c]) => ({ name: b, count: c, pct: c / total }))
      .sort((a, b) => b.count - a.count);
  }, [visible]);

  const maxCount = boroughStats[0]?.count || 1;

  // Risk distribution from full data
  const riskDist = useMemo(() => {
    const buckets = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const d of data) {
      if      (d.score >= 0.75) buckets.critical++;
      else if (d.score >= 0.50) buckets.high++;
      else if (d.score >= 0.25) buckets.medium++;
      else                       buckets.low++;
    }
    const total = data.length || 1;
    return RISK_BANDS.map((b) => ({
      ...b,
      count: buckets[b.key],
      pct:   (buckets[b.key] / total) * 100,
    }));
  }, [data]);

  // Build conic-gradient for donut
  const donutGradient = useMemo(() => {
    let acc = 0;
    const stops = riskDist.map(({ color, pct }) => {
      const from = acc;
      acc += pct;
      return `${color} ${from.toFixed(1)}% ${acc.toFixed(1)}%`;
    });
    return `conic-gradient(${stops.join(', ')})`;
  }, [riskDist]);

  const topBorough = boroughStats[0];
  const secondBorough = boroughStats[1];
  const topDiff = topBorough && secondBorough
    ? (((topBorough.count - secondBorough.count) / secondBorough.count) * 100).toFixed(0)
    : null;

  return (
    <div style={{
      position:   'fixed',
      top: 56, right: 0, bottom: 48,
      width:      260,
      zIndex:     100,
      background: 'var(--glass)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderLeft:  '1px solid var(--border)',
      borderTop:   '2px solid var(--cyan)',
      overflowY:   'auto',
      padding:     '16px 14px',
    }}>
      {/* ── Title ── */}
      <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 16 }}>
        RISK <span style={{ color: 'var(--cyan)' }}>ANALYTICS</span>
      </div>

      {/* ── Borough Breakdown ── */}
      <SectionTitle>BOROUGH BREAKDOWN</SectionTitle>

      {boroughStats.length === 0 && (
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '12px 0' }}>
          No data
        </div>
      )}

      {boroughStats.map(({ name, count, pct }) => {
        const color = BOROUGH_COLORS[name] ?? 'var(--cyan)';
        return (
          <div key={name} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', fontWeight: 500 }}>{cap(name)}</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontVariantNumeric: 'tabular-nums' }}>
                  {count.toLocaleString()}
                </span>
                <span style={{ fontSize: 10, color, fontWeight: 600 }}>
                  {(pct * 100).toFixed(0)}%
                </span>
              </div>
            </div>
            <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 2,
                width: `${(count / maxCount) * 100}%`,
                background: `linear-gradient(to right, ${color}66, ${color})`,
                transition: 'width 1s ease',
                boxShadow: `0 0 8px ${color}66`,
              }} />
            </div>
          </div>
        );
      })}

      <Divider />

      {/* ── Risk Distribution Donut ── */}
      <SectionTitle>RISK DISTRIBUTION</SectionTitle>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 14 }}>
        {/* Donut */}
        <div style={{
          width: 130, height: 130, borderRadius: '50%',
          background: donutGradient,
          position: 'relative',
          boxShadow: '0 0 24px rgba(0,245,255,0.15)',
        }}>
          {/* Inner hole */}
          <div style={{
            position: 'absolute', inset: 28, borderRadius: '50%',
            background: '#0a0a1e',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
              {data.length.toLocaleString()}
            </div>
            <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', marginTop: 1 }}>
              TOTAL
            </div>
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 14, justifyContent: 'center' }}>
          {riskDist.map(({ key, label, color, pct }) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 7, height: 7, borderRadius: 2, background: color, flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>
                {label} <span style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>{pct.toFixed(0)}%</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      <Divider />

      {/* ── Insight Card ── */}
      <SectionTitle>INSIGHT</SectionTitle>

      {topBorough ? (
        <div style={{
          padding: '12px', borderRadius: 10,
          background: `${BOROUGH_COLORS[topBorough.name] ?? 'var(--cyan)'}10`,
          border: `1px solid ${BOROUGH_COLORS[topBorough.name] ?? 'var(--cyan)'}44`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: BOROUGH_COLORS[topBorough.name] ?? 'var(--cyan)',
              boxShadow: `0 0 8px ${BOROUGH_COLORS[topBorough.name] ?? 'var(--cyan)'}`,
            }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: BOROUGH_COLORS[topBorough.name] ?? 'var(--cyan)' }}>
              {cap(topBorough.name)}
            </span>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>is highest risk</span>
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>
            {topBorough.count.toLocaleString()} visible records
            {topDiff && (
              <span style={{ color: 'var(--red)', fontWeight: 600 }}> · {topDiff}% more</span>
            )}
            {' '}than {secondBorough ? cap(secondBorough.name) : 'others'}.
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>
          No data available
        </div>
      )}
    </div>
  );
}
