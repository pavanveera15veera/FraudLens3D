import { useState, useRef, useCallback } from 'react';

const RISK_LEVELS = [
  { label: 'Do Not Insure',  minScore: 0.85, color: '#ff0040' },
  { label: 'High Risk',      minScore: 0.65, color: '#ff3366' },
  { label: 'Caution',        minScore: 0.40, color: '#ffaa00' },
  { label: 'Insurable',      minScore: 0,    color: '#00f5ff' },
];

function getRiskLevel(score) {
  return RISK_LEVELS.find((l) => score >= l.minScore) ?? RISK_LEVELS[RISK_LEVELS.length - 1];
}

function normalizeAddr(str) {
  return String(str || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function matchAddress(query, house, street) {
  const full = normalizeAddr(`${house} ${street}`);
  return full.includes(query) || query.includes(full.split(' ').slice(0, 2).join(' '));
}

export default function AddressLookup({ data, rawDatasets }) {
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState(null);
  const [open,    setOpen]    = useState(false);
  const inputRef = useRef(null);

  const search = useCallback(() => {
    const q = normalizeAddr(query);
    if (!q || q.length < 4) return;

    // Find matching scored records
    const matchedRecords = data.filter((r) => normalizeAddr(r.address).includes(q));

    // Max score at this address
    const maxScore = matchedRecords.length
      ? Math.max(...matchedRecords.map((r) => r.score))
      : 0;

    // ECB violations
    const ecbMatches = (rawDatasets?.ecbViolations ?? []).filter((r) =>
      matchAddress(q, r.respondent_house_number, r.respondent_street)
    );

    // OATH hearings
    const oathMatches = (rawDatasets?.oathHearings ?? []).filter((r) =>
      matchAddress(q, r.violation_location_house, r.violation_location_street_name)
    );

    // Rodent inspections
    const rodentMatches = (rawDatasets?.rodentInspections ?? []).filter((r) =>
      matchAddress(q, r.house_number, r.street_name)
    );

    setResults({ matchedRecords, maxScore, ecbMatches, oathMatches, rodentMatches });
    setOpen(true);
  }, [query, data, rawDatasets]);

  const handleKey = (e) => {
    if (e.key === 'Enter') search();
    if (e.key === 'Escape') setOpen(false);
  };

  const risk = results ? getRiskLevel(results.maxScore) : null;

  return (
    <div style={{
      position: 'fixed',
      top: 68,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 1200,
      width: 480,
      maxWidth: 'calc(100vw - 560px)',
      fontFamily: 'Inter, sans-serif',
    }}>
      {/* Search bar */}
      <div style={{
        display: 'flex',
        background: 'rgba(5,5,20,0.92)',
        border: '1px solid rgba(0,245,255,0.25)',
        borderRadius: open && results ? '10px 10px 0 0' : 10,
        backdropFilter: 'blur(20px)',
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      }}>
        {/* Icon */}
        <div style={{ display:'flex', alignItems:'center', padding:'0 12px', color:'rgba(0,245,255,0.5)' }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5"/>
            <line x1="11" y1="11" x2="15" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>

        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Search address, e.g. 123 Main St…"
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#fff',
            fontSize: 13,
            padding: '10px 0',
            letterSpacing: '0.02em',
          }}
        />

        {query && (
          <button
            onClick={() => { setQuery(''); setOpen(false); setResults(null); }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.3)', padding: '0 10px', fontSize: 16,
            }}
          >×</button>
        )}

        <button
          onClick={search}
          style={{
            background: 'rgba(0,245,255,0.1)',
            border: 'none',
            borderLeft: '1px solid rgba(0,245,255,0.15)',
            color: '#00f5ff',
            padding: '0 16px',
            cursor: 'pointer',
            fontSize: 12,
            letterSpacing: '0.08em',
            fontWeight: 600,
            fontFamily: 'Inter, sans-serif',
          }}
        >
          SEARCH
        </button>
      </div>

      {/* Results panel */}
      {open && results && (
        <div style={{
          background: 'rgba(5,5,20,0.96)',
          border: '1px solid rgba(0,245,255,0.2)',
          borderTop: 'none',
          borderRadius: '0 0 10px 10px',
          padding: 16,
          maxHeight: 420,
          overflowY: 'auto',
          boxShadow: '0 16px 48px rgba(0,0,0,0.7)',
        }}>

          {/* Risk recommendation */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14,
            padding: '10px 14px',
            background: `rgba(${risk.color === '#ff0040' ? '255,0,64' : risk.color === '#ff3366' ? '255,51,102' : risk.color === '#ffaa00' ? '255,170,0' : '0,245,255'},0.08)`,
            borderRadius: 8,
            border: `1px solid ${risk.color}33`,
          }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: risk.color, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.1em' }}>RISK ASSESSMENT</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: risk.color }}>{risk.label}</div>
            </div>
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>MAX SCORE</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: risk.color }}>
                {results.maxScore > 0 ? results.maxScore.toFixed(2) : '—'}
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            {[
              { label: 'Violations',  value: results.matchedRecords.length, color: '#7b2fff' },
              { label: 'ECB Fines',   value: results.ecbMatches.length,     color: '#ff3366' },
              { label: 'OATH Cases',  value: results.oathMatches.length,    color: '#ffaa00' },
              { label: 'Rodent Hits', value: results.rodentMatches.length,  color: '#00f5ff' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{
                flex: 1, textAlign: 'center', padding: '8px 4px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 6,
              }}>
                <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* ECB violations detail */}
          {results.ecbMatches.length > 0 && (
            <Section title="ECB VIOLATIONS" color="#ff3366">
              {results.ecbMatches.slice(0, 5).map((r, i) => (
                <Row key={i}
                  left={r.respondent_house_number + ' ' + r.respondent_street}
                  right={r.penality_imposed ? `Fine: $${r.penality_imposed}` : r.hearing_status}
                />
              ))}
            </Section>
          )}

          {/* OATH hearings detail */}
          {results.oathMatches.length > 0 && (
            <Section title="OATH HEARINGS" color="#ffaa00">
              {results.oathMatches.slice(0, 5).map((r, i) => (
                <Row key={i}
                  left={r.violation_location_house + ' ' + r.violation_location_street_name}
                  right={r.hearing_result || '—'}
                />
              ))}
            </Section>
          )}

          {/* Rodent inspections detail */}
          {results.rodentMatches.length > 0 && (
            <Section title="RODENT INSPECTIONS" color="#00f5ff">
              {results.rodentMatches.slice(0, 5).map((r, i) => (
                <Row key={i}
                  left={r.house_number + ' ' + r.street_name}
                  right={r.result || '—'}
                />
              ))}
            </Section>
          )}

          {results.matchedRecords.length === 0 && results.ecbMatches.length === 0 &&
           results.oathMatches.length === 0 && results.rodentMatches.length === 0 && (
            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13, padding: '8px 0' }}>
              No records found for this address
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, color, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 9, color, letterSpacing: '0.12em', fontWeight: 700, marginBottom: 6 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ left, right }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '5px 8px',
      background: 'rgba(255,255,255,0.03)',
      borderRadius: 4, marginBottom: 3,
      fontSize: 11,
    }}>
      <span style={{ color: 'rgba(255,255,255,0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 8 }}>
        {left}
      </span>
      <span style={{ color: 'rgba(255,255,255,0.45)', flexShrink: 0, fontSize: 10 }}>{right}</span>
    </div>
  );
}
