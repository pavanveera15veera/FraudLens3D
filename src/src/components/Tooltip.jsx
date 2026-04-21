const TYPE_LABELS = {
  housing:      'Housing Violation',
  restaurant:   'Restaurant Inspection',
  construction: 'Construction Violation',
  service311:   '311 Service Request',
  permit:       'Permit Issuance',
  property:     'Property Valuation',
  fire:         'Fire Incident',
};

const RISK_COLORS = {
  'Critical Risk': '#ff3366',
  'High Risk':     '#ff9933',
  'Medium Risk':   '#ffff33',
  'Low Risk':      '#33ff80',
};

function FactorBar({ label, value, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
      <span style={{
        fontSize: 10, color: 'rgba(255,255,255,0.35)',
        width: 56, flexShrink: 0,
      }}>
        {label}
      </span>
      <div style={{
        flex: 1, height: 3, background: 'rgba(255,255,255,0.08)',
        borderRadius: 2, overflow: 'hidden',
      }}>
        <div style={{
          width: `${value * 100}%`, height: '100%',
          background: `linear-gradient(to right, ${color}88, ${color})`,
          borderRadius: 2,
          boxShadow: `0 0 4px ${color}`,
        }} />
      </div>
      <span style={{
        fontSize: 10, color: 'rgba(255,255,255,0.5)',
        width: 28, textAlign: 'right', fontVariantNumeric: 'tabular-nums',
      }}>
        {(value * 100).toFixed(0)}%
      </span>
    </div>
  );
}

export default function Tooltip({ info }) {
  const { record, color, x, y } = info;
  const pct        = (record.score * 100).toFixed(0);
  const riskColor  = RISK_COLORS[record.scoreLabel] ?? color;

  // Keep tooltip inside viewport
  const left = x + 18;
  const top  = y - 12;

  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : '—'; }

  return (
    <div style={{
      position:   'fixed',
      left, top,
      zIndex:     999,
      pointerEvents: 'none',
      // Glass card
      background: 'rgba(5,5,20,0.92)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      borderRadius: 12,
      border:       `1px solid ${color}`,
      borderLeft:   `3px solid ${color}`,
      padding:      '14px 16px',
      minWidth:     220,
      maxWidth:     290,
      boxShadow:    `0 8px 32px rgba(0,0,0,0.6), 0 0 24px ${color}22`,
      fontFamily:   'Inter, sans-serif',
    }}>
      {/* Type badge */}
      <div style={{
        display:    'inline-flex', alignItems: 'center', gap: 6,
        background: `${color}18`, border: `1px solid ${color}44`,
        borderRadius: 6, padding: '3px 8px', marginBottom: 12,
      }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}` }} />
        <span style={{ fontSize: 11, fontWeight: 600, color }}>
          {TYPE_LABELS[record.type] ?? record.type}
        </span>
      </div>

      {/* Borough + Address */}
      <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 5 }}>
        {[['Borough', cap(record.borough)], ['Address', record.address || '—']].map(([label, val]) => (
          <div key={label} style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>{label}</span>
            <span style={{
              fontSize: 11, color: 'rgba(255,255,255,0.8)',
              textAlign: 'right', maxWidth: 160, wordBreak: 'break-word',
            }}>{val}</span>
          </div>
        ))}
      </div>

      {/* Score */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 0', borderTop: '1px solid rgba(255,255,255,0.07)',
        borderBottom: '1px solid rgba(255,255,255,0.07)', marginBottom: 12,
      }}>
        <div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', marginBottom: 2 }}>
            FRAUD SCORE
          </div>
          <div style={{
            fontSize: 28, fontWeight: 700, lineHeight: 1,
            color,
            textShadow: `0 0 20px ${color}`,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {pct}%
          </div>
        </div>
        <div style={{
          padding: '6px 12px', borderRadius: 8,
          background: `${riskColor}18`,
          border: `1px solid ${riskColor}55`,
          fontSize: 11, fontWeight: 700,
          color: riskColor, letterSpacing: '0.04em',
          textAlign: 'center',
        }}>
          {record.scoreLabel}
        </div>
      </div>

      {/* Factor bars */}
      <div>
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.12em', marginBottom: 8 }}>
          CONTRIBUTING FACTORS
        </div>
        <FactorBar label="Density"   value={record.factor1 ?? 0} color="#00f5ff" />
        <FactorBar label="Diversity" value={record.factor2 ?? 0} color="#7b2fff" />
        <FactorBar label="Severity"  value={record.factor3 ?? 0} color={color}   />
      </div>
    </div>
  );
}
