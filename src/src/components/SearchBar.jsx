import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';

// ── Constants ─────────────────────────────────────────────────────────────────

const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN || '';

const RECENT_KEY = 'fraudlens_recent_searches';
const MAX_RECENT = 5;

const RISK_LEVELS = [
  { label: 'Do Not Insure', minScore: 0.85, color: '#ff0040', bg: 'rgba(255,0,64,0.12)'    },
  { label: 'High Risk',     minScore: 0.65, color: '#ff3366', bg: 'rgba(255,51,102,0.12)'  },
  { label: 'Caution',       minScore: 0.40, color: '#ffaa00', bg: 'rgba(255,170,0,0.12)'   },
  { label: 'Insurable',     minScore: 0,    color: '#00f5ff', bg: 'rgba(0,245,255,0.08)'   },
];


// ── Helpers ───────────────────────────────────────────────────────────────────

function norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

function getRisk(score) {
  return RISK_LEVELS.find((l) => score >= l.minScore) ?? RISK_LEVELS[RISK_LEVELS.length - 1];
}

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

function loadRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
}

function saveRecent(list) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* noop */ }
}

function pushRecent(term) {
  const list = [term, ...loadRecent().filter((t) => t !== term)].slice(0, MAX_RECENT);
  saveRecent(list);
  return list;
}

// ── Highlight matching text ───────────────────────────────────────────────────

function HighlightText({ text, query }) {
  if (!query) return <span>{text}</span>;
  const idx = norm(text).indexOf(norm(query));
  if (idx === -1) return <span>{text}</span>;
  return (
    <span>
      {text.slice(0, idx)}
      <span style={{ color: '#00f5ff', fontWeight: 600 }}>{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </span>
  );
}

// ── Marker factory ────────────────────────────────────────────────────────────

function makeMarkerEl(color = '#00f5ff', small = false) {
  const size = small ? 20 : 32;
  const el   = document.createElement('div');
  el.style.cssText = `
    width: ${size}px; height: ${size}px; cursor: pointer;
    animation: ${small ? 'none' : 'markerBounce 0.55s cubic-bezier(.36,.07,.19,.97) forwards'};
  `;
  el.innerHTML = `
    <svg viewBox="0 0 32 40" width="${size}" height="${size * 1.25}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M16 0C9.373 0 4 5.597 4 12.5C4 21.875 16 40 16 40C16 40 28 21.875 28 12.5C28 5.597 22.627 0 16 0Z"
        fill="${color}" fill-opacity="0.9"/>
      <circle cx="16" cy="12.5" r="5" fill="white" fill-opacity="0.9"/>
      <path d="M16 0C9.373 0 4 5.597 4 12.5C4 21.875 16 40 16 40C16 40 28 21.875 28 12.5C28 5.597 22.627 0 16 0Z"
        fill="none" stroke="${color}" stroke-width="1.5"/>
    </svg>
  `;
  return el;
}

// ── Geocode via Mapbox ────────────────────────────────────────────────────────

async function geocodeAddress(query) {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
    `?country=US&proximity=-74.006,40.7128&access_token=${MAPBOX_TOKEN}&limit=1`;
  const res = await fetch(url);
  const json = await res.json();
  const feat = json.features?.[0];
  if (!feat) return null;
  const [lon, lat] = feat.center;
  return { lat, lon, placeName: feat.place_name };
}

// ── Panel helpers ─────────────────────────────────────────────────────────────

// Standalone address matcher — avoids stale closures inside useMemo
function matchAddr(house, street, qParts) {
  const rowN = norm(`${house || ''} ${street || ''}`);
  if (rowN.length < 3 || qParts.length < 1) return false;
  return qParts.slice(0, 2).every((p) => p.length > 1 && rowN.includes(p));
}

function fmtDate(raw) {
  if (!raw) return null;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return String(raw).slice(0, 10) || null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtMoney(val) {
  const n = parseFloat(val);
  if (!n || isNaN(n)) return null;
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

const BORO_COLORS = {
  manhattan: '#33aaff', brooklyn: '#33ff80', queens: '#ff9933',
  bronx: '#ff3366', 'staten island': '#cc33ff',
};

const UW_LEVELS = [
  { min: 0.85, label: 'DO NOT INSURE',  color: '#ff0040', bg: 'rgba(255,0,64,0.14)',    adj: 'Decline'   },
  { min: 0.65, label: 'HIGH RISK',      color: '#ff3366', bg: 'rgba(255,51,102,0.12)',  adj: '+35%'      },
  { min: 0.40, label: 'REVIEW REQUIRED',color: '#ffaa00', bg: 'rgba(255,170,0,0.12)',   adj: '+15%'      },
  { min: 0,    label: 'INSURABLE',      color: '#33ff80', bg: 'rgba(51,255,128,0.09)',  adj: 'Standard'  },
];
function getUW(score) { return UW_LEVELS.find((l) => score >= l.min) ?? UW_LEVELS[UW_LEVELS.length - 1]; }

function scoreColor100(s) {
  return s >= 81 ? '#ff3366' : s >= 61 ? '#ff9933' : s >= 31 ? '#ffff33' : '#33ff80';
}

// ── Small reusable widgets ────────────────────────────────────────────────────

function Pill({ label, color, bg }) {
  return (
    <span style={{
      display: 'inline-block', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
      color: color ?? '#fff', background: bg ?? 'rgba(255,255,255,0.1)',
      borderRadius: 4, padding: '2px 6px', border: `1px solid ${color ?? '#fff'}33`,
    }}>
      {label}
    </span>
  );
}

function SLab({ color, children }) {
  return (
    <div style={{ fontSize: 9, color, letterSpacing: '0.14em', fontWeight: 700, marginTop: 14, marginBottom: 5 }}>
      {children}
    </div>
  );
}

function ScoreBar({ label, value, color = '#00f5ff', sublabel }) {
  const pct = Math.round(Math.min(100, value * 100));
  return (
    <div style={{ marginBottom: 9 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
          {value.toFixed(2)}
        </span>
      </div>
      <div style={{ height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`, borderRadius: 2,
          background: `linear-gradient(90deg,${color}66,${color})`,
          transition: 'width 0.7s ease',
        }} />
      </div>
      {sublabel && <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.28)', marginTop: 2 }}>{sublabel}</div>}
    </div>
  );
}

function ViolRow({ cells, critical }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: cells.map((c) => c.w ?? '1fr').join(' '),
      gap: 6, padding: '5px 8px', borderRadius: 4, marginBottom: 3,
      background: critical ? 'rgba(255,51,102,0.07)' : 'rgba(255,255,255,0.03)',
      border: critical ? '1px solid rgba(255,51,102,0.22)' : '1px solid transparent',
    }}>
      {cells.map((c, i) => (
        <div key={i} style={{
          fontSize: 10, color: c.color ?? 'rgba(255,255,255,0.65)',
          fontWeight: c.bold ? 700 : 400,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }} title={String(c.v ?? '')}>
          {c.v ?? '—'}
        </div>
      ))}
    </div>
  );
}

function StatChip({ label, value, color }) {
  return (
    <div style={{
      flex: 1, textAlign: 'center', padding: '6px 6px',
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.07)', borderRadius: 6,
    }}>
      <div style={{ fontSize: 15, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.06em', marginTop: 1 }}>{label}</div>
    </div>
  );
}

function MiniCard({ address, score, scoreColor: sc }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '5px 8px', borderRadius: 5, marginBottom: 4,
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)',
    }}>
      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', flex: 1, marginRight: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {address}
      </span>
      <span style={{ fontSize: 11, fontWeight: 700, color: sc, flexShrink: 0 }}>{score}</span>
    </div>
  );
}

// ── Collapsible section ───────────────────────────────────────────────────────

function Collapsible({ title, color, count, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const empty = count === 0;
  return (
    <div style={{
      marginBottom: 5,
      borderLeft: `3px solid ${empty ? 'rgba(255,255,255,0.07)' : color}`,
      borderRadius: '0 6px 6px 0',
      background: empty ? 'transparent' : `${color}07`,
      overflow: 'hidden',
    }}>
      <button
        onClick={() => !empty && setOpen((o) => !o)}
        style={{
          width: '100%', background: 'none', border: 'none',
          padding: '8px 10px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between',
          cursor: empty ? 'default' : 'pointer',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.11em',
            color: empty ? 'rgba(255,255,255,0.22)' : color,
          }}>
            {title}
          </span>
          {!empty ? (
            <span style={{
              fontSize: 9, fontWeight: 700,
              background: `${color}22`, color, borderRadius: 3, padding: '1px 5px',
            }}>
              {count}
            </span>
          ) : (
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.18)', fontStyle: 'italic', fontWeight: 400 }}>
              No records found
            </span>
          )}
        </div>
        {!empty && (
          <span style={{
            color: `${color}cc`, fontSize: 10,
            transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s',
          }}>▾</span>
        )}
      </button>
      {open && !empty && (
        <div style={{ padding: '0 10px 10px' }}>{children}</div>
      )}
    </div>
  );
}

// ── Comprehensive Risk Panel ──────────────────────────────────────────────────

function RiskPanel({ panel, onClose, rawDatasets, data }) {
  const isChain  = panel.type === 'chain';
  const score100 = Math.round((panel.maxScore ?? 0) * 100);
  const sc       = scoreColor100(score100);
  const uw       = getUW(panel.maxScore ?? 0);
  const boroC    = BORO_COLORS[norm(panel.borough ?? '')] ?? 'rgba(255,255,255,0.25)';

  // Derive qParts once for all matchers
  const qParts = useMemo(
    () => norm(panel.address ?? '').split(' ').filter((p) => p.length > 1),
    [panel.address]
  );

  // ── Raw dataset matches ───────────────────────────────────────────────────
  const restaurantHits = useMemo(() =>
    (rawDatasets?.restaurantInspections ?? []).filter((r) => matchAddr(r.building, r.street, qParts)),
    [rawDatasets, qParts]);

  const housingHits = useMemo(() =>
    (rawDatasets?.housingViolations ?? []).filter((r) => matchAddr(r.housenumber, r.streetname, qParts)),
    [rawDatasets, qParts]);

  const constructionHits = useMemo(() =>
    (rawDatasets?.constructionViolations ?? []).filter((r) => matchAddr(r.house_number, r.street, qParts)),
    [rawDatasets, qParts]);

  const ecbHits = useMemo(() =>
    (rawDatasets?.ecbViolations ?? []).filter((r) => matchAddr(r.respondent_house_number, r.respondent_street, qParts)),
    [rawDatasets, qParts]);

  const fireHits = useMemo(() => {
    if (!panel.address || !rawDatasets?.fireIncidents) return [];
    return rawDatasets.fireIncidents.filter((r) => {
      const loc = norm(r.alarm_box_location ?? '');
      return qParts.slice(0, 1).some((p) => loc.includes(p));
    });
  }, [rawDatasets, qParts, panel.address]);

  const s311Hits = useMemo(() => {
    if (!rawDatasets?.serviceRequests311) return [];
    return rawDatasets.serviceRequests311.filter((r) => {
      const inc = norm(r.incident_address ?? '');
      return qParts.slice(0, 2).every((p) => inc.includes(p));
    });
  }, [rawDatasets, qParts]);

  const oathHits = useMemo(() =>
    (rawDatasets?.oathHearings ?? []).filter((r) => matchAddr(r.violation_location_house, r.violation_location_street_name, qParts)),
    [rawDatasets, qParts]);

  const rodentHits = useMemo(() =>
    (rawDatasets?.rodentInspections ?? []).filter((r) => matchAddr(r.house_number, r.street_name, qParts)),
    [rawDatasets, qParts]);

  const dcaHits = useMemo(() =>
    (rawDatasets?.dcaComplaints ?? []).filter((r) => matchAddr(r.building || r.address_building, r.street || r.address_street_name, qParts)),
    [rawDatasets, qParts]);

  // ── ECB financials ────────────────────────────────────────────────────────
  const ecbTotal       = ecbHits.reduce((s, r) => s + (parseFloat(r.penality_imposed) || 0), 0);
  const ecbOutstanding = ecbHits.reduce((s, r) => s + (parseFloat(r.balance_due) || 0), 0);

  // ── Risk factor scores ────────────────────────────────────────────────────
  const qNorm  = norm(panel.address ?? '');
  const recs   = useMemo(() => (data ?? []).filter((r) => norm(r.address) === qNorm), [data, qNorm]);
  const f1avg  = recs.length ? recs.reduce((s, r) => s + (r.factor1 ?? 0), 0) / recs.length : 0;
  const f2avg  = recs.length ? recs.reduce((s, r) => s + (r.factor2 ?? 0), 0) / recs.length : 0;
  const f3avg  = recs.length ? recs.reduce((s, r) => s + (r.factor3 ?? 0), 0) / recs.length : 0;
  const dsCount = Object.keys(panel.byType ?? {}).length;

  // ── Chain analysis ────────────────────────────────────────────────────────
  const chainInfo = useMemo(() => {
    if (!isChain || !panel.locations?.length) return null;
    const locs    = [...panel.locations].sort((a, b) => (b.maxScore ?? 0) - (a.maxScore ?? 0));
    const avgScore = locs.reduce((s, l) => s + (l.maxScore ?? 0), 0) / locs.length;
    const thisIdx  = locs.findIndex((l) => norm(l.address) === qNorm);
    const boroDist = {};
    locs.forEach((l) => { const b = norm(l.borough ?? 'unknown'); boroDist[b] = (boroDist[b] ?? 0) + 1; });
    return { locs, avgScore, thisIdx, boroDist };
  }, [isChain, panel.locations, qNorm]);

  // ── Comparable properties ─────────────────────────────────────────────────
  const comparables = useMemo(() => {
    if (!data?.length) return [];
    const target = panel.maxScore ?? 0;
    return [...(data ?? [])]
      .filter((r) => norm(r.address) !== qNorm && r.score > 0)
      .sort((a, b) => Math.abs(a.score - target) - Math.abs(b.score - target))
      .slice(0, 3);
  }, [data, panel.maxScore, qNorm]);

  // ── Key risk bullets ──────────────────────────────────────────────────────
  const bullets = [];
  if (ecbTotal > 0)   bullets.push(`${fmtMoney(ecbTotal)} in ECB fines on record`);
  if (ecbOutstanding > 0) bullets.push(`${fmtMoney(ecbOutstanding)} in unpaid ECB fines`);
  if (rodentHits.some((r) => norm(r.result ?? '').includes('fail') || norm(r.result ?? '').includes('rat')))
    bullets.push('Active rodent activity detected');
  if (restaurantHits.some((r) => norm(r.critical_flag ?? '') === 'critical'))
    bullets.push('Critical restaurant health violations');
  if (housingHits.some((r) => !r.closedate && norm(r.currentstatus ?? '') !== 'close'))
    bullets.push('Open housing violations');
  if (oathHits.length > 0) bullets.push(`${oathHits.length} OATH administrative hearing(s)`);
  if (dsCount >= 4)   bullets.push(`Flagged by ${dsCount} different city datasets`);
  if (f1avg > 0.7)    bullets.push('Located in a high violation density area');

  const title = panel.name || panel.address || 'Unknown';

  return (
    <div style={{
      position:  'fixed', right: 0, top: 56, bottom: 48,
      width:     420,
      zIndex:    600,
      background: 'rgba(5,5,20,0.98)',
      borderLeft: '1px solid rgba(0,245,255,0.15)',
      fontFamily: 'Inter, sans-serif',
      display:   'flex', flexDirection: 'column',
      animation: 'slideInRight 0.28s cubic-bezier(.25,.46,.45,.94) forwards',
      backdropFilter: 'blur(28px)',
      boxShadow: '-16px 0 60px rgba(0,0,0,0.8)',
    }}>

      {/* ── UW banner ── */}
      <div style={{
        background: uw.bg, borderBottom: `1px solid ${uw.color}44`,
        padding: '7px 16px', display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', color: uw.color }}>
          {uw.label}
        </span>
        <span style={{ fontSize: 10, color: `${uw.color}99`, letterSpacing: '0.05em' }}>
          Premium adjustment: {uw.adj}
        </span>
      </div>

      {/* ── Header ── */}
      <div style={{
        padding: '12px 14px 10px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, marginRight: 8 }}>
            {/* Name */}
            <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', lineHeight: 1.2, marginBottom: 3 }}>
              {title}
            </div>
            {/* Address in cyan (only when title is business name) */}
            {panel.name && panel.address && panel.name !== panel.address && (
              <div style={{ fontSize: 11, color: '#00f5ff', marginBottom: 5 }}>{panel.address}</div>
            )}
            {/* Badges row */}
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 4 }}>
              {panel.borough && (
                <Pill
                  label={cap(panel.borough).toUpperCase()}
                  color={boroC}
                  bg={`${boroC}18`}
                />
              )}
              {isChain && (
                <Pill label={`CHAIN · ${panel.locations?.length} LOC`} color="#7b2fff" bg="rgba(123,47,255,0.15)" />
              )}
              <Pill
                label={score100 >= 81 ? 'CRITICAL RISK' : score100 >= 61 ? 'HIGH RISK' : score100 >= 31 ? 'MEDIUM RISK' : 'LOW RISK'}
                color={sc}
                bg={`${sc}18`}
              />
            </div>
          </div>

          {/* Score + close */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
            <button onClick={onClose} style={{
              background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)',
              cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '0 2px', marginBottom: 2,
            }}>×</button>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 40, fontWeight: 900, color: sc, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                {score100}
              </div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em' }}>RISK SCORE / 100</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 10px 20px' }}>

        {/* Geocode-only notice */}
        {panel.geocodedOnly && (
          <div style={{
            padding: '10px 12px', borderRadius: 8, marginBottom: 10,
            background: 'rgba(255,170,0,0.08)', border: '1px solid rgba(255,170,0,0.25)',
            fontSize: 11, color: 'rgba(255,170,0,0.85)', lineHeight: 1.5,
          }}>
            No violation data found for this address in NYC datasets. Showing map location only.
          </div>
        )}

        {!panel.geocodedOnly && (
          <>
            {/* ── RESTAURANT INSPECTIONS ── */}
            <Collapsible title="RESTAURANT INSPECTIONS" color="#33aaff" count={restaurantHits.length} defaultOpen={restaurantHits.length > 0}>
              {(() => {
                const latest = restaurantHits.find((r) => r.grade)?.grade;
                const critN  = restaurantHits.filter((r) => norm(r.critical_flag ?? '') === 'critical').length;
                return (
                  <>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 7 }}>
                      {latest && <Pill label={`Grade ${latest}`} color="#33aaff" bg="rgba(51,170,255,0.15)" />}
                      {critN > 0 && <Pill label={`${critN} Critical`} color="#ff3366" bg="rgba(255,51,102,0.15)" />}
                      <Pill label={`${restaurantHits.length} records`} color="rgba(255,255,255,0.4)" bg="rgba(255,255,255,0.06)" />
                    </div>
                    {restaurantHits.slice(0, 8).map((r, i) => {
                      const crit = norm(r.critical_flag ?? '') === 'critical';
                      return (
                        <ViolRow key={i} critical={crit} cells={[
                          { v: r.violation_code || 'N/A', w: '44px', color: crit ? '#ff3366' : 'rgba(255,255,255,0.4)', bold: true },
                          { v: r.violation_description || r.action || '—' },
                          { v: fmtDate(r.inspection_date || r.grade_date) ?? '—', w: '80px', color: 'rgba(255,255,255,0.38)' },
                        ]} />
                      );
                    })}
                  </>
                );
              })()}
            </Collapsible>

            {/* ── HOUSING VIOLATIONS ── */}
            <Collapsible title="HOUSING VIOLATIONS" color="#ff3333" count={housingHits.length} defaultOpen={housingHits.length > 0}>
              {housingHits.slice(0, 8).map((r, i) => {
                const isOpen = !r.closedate || norm(r.currentstatus ?? '') === 'open';
                return (
                  <ViolRow key={i} cells={[
                    { v: r.violationclass ? `Cls ${r.violationclass}` : (r.class_ ?? 'N/A'), w: '48px', color: '#ff3333', bold: true },
                    { v: r.novdescription || r.violationtype || '—' },
                    { v: isOpen ? 'OPEN' : fmtDate(r.closedate) ?? 'CLOSED', w: '56px', color: isOpen ? '#ff3366' : '#33ff80', bold: isOpen },
                  ]} />
                );
              })}
              {housingHits.some((r) => parseFloat(r.penalty_imposed || r.penalty_amount) > 0) && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,51,51,0.2)', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>Total penalties</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#ff9933' }}>
                    {fmtMoney(housingHits.reduce((s, r) => s + (parseFloat(r.penalty_imposed || r.penalty_amount) || 0), 0))}
                  </span>
                </div>
              )}
            </Collapsible>

            {/* ── CONSTRUCTION VIOLATIONS ── */}
            <Collapsible title="CONSTRUCTION VIOLATIONS" color="#33ff80" count={constructionHits.length} defaultOpen={constructionHits.length > 0}>
              {constructionHits.slice(0, 8).map((r, i) => {
                const swo = norm(r.violation_type ?? '').includes('stop work') || norm(r.violation_category ?? '').includes('stop work');
                return (
                  <ViolRow key={i} critical={swo} cells={[
                    { v: r.violation_type_code || r.violation_category || 'N/A', w: '52px', color: '#33ff80', bold: true },
                    { v: r.description || r.disposition_description || '—' },
                    { v: swo ? 'STOP WORK' : (r.disposition_date ? 'CLOSED' : 'OPEN'), w: '64px', color: swo ? '#ff0040' : (r.disposition_date ? '#33ff80' : '#ff9933'), bold: true },
                  ]} />
                );
              })}
            </Collapsible>

            {/* ── ECB VIOLATIONS ── */}
            <Collapsible title="ECB VIOLATIONS" color="#ff6699" count={ecbHits.length} defaultOpen={ecbHits.length > 0}>
              {ecbHits.slice(0, 8).map((r, i) => {
                const unpaid = parseFloat(r.balance_due) > 0;
                return (
                  <ViolRow key={i} critical={unpaid} cells={[
                    { v: fmtMoney(r.penality_imposed) ?? '—', w: '72px', color: '#ff6699', bold: true },
                    { v: r.violation_description || r.hearing_status || '—' },
                    { v: unpaid ? 'UNPAID' : 'PAID', w: '48px', color: unpaid ? '#ff3366' : '#33ff80', bold: true },
                  ]} />
                );
              })}
              {(ecbTotal > 0 || ecbOutstanding > 0) && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,102,153,0.2)' }}>
                  {ecbTotal > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>Total fines issued</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#ff6699' }}>{fmtMoney(ecbTotal)}</span>
                    </div>
                  )}
                  {ecbOutstanding > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>Outstanding balance</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: '#ff0040' }}>{fmtMoney(ecbOutstanding)}</span>
                    </div>
                  )}
                </div>
              )}
            </Collapsible>

            {/* ── FIRE INCIDENTS ── */}
            <Collapsible title="FIRE INCIDENTS" color="#ff9966" count={fireHits.length} defaultOpen={false}>
              {fireHits.slice(0, 6).map((r, i) => (
                <ViolRow key={i} cells={[
                  { v: fmtDate(r.incident_datetime) ?? '—', w: '80px', color: 'rgba(255,255,255,0.4)' },
                  { v: r.incident_classification || r.incident_classification_group || '—' },
                  { v: r.dispatch_response_seconds_qy ? `${Math.round(r.dispatch_response_seconds_qy / 60)}min` : '—', w: '40px', color: '#ff9966' },
                ]} />
              ))}
            </Collapsible>

            {/* ── 311 COMPLAINTS ── */}
            <Collapsible title="311 COMPLAINTS" color="#ffff33" count={s311Hits.length} defaultOpen={false}>
              {s311Hits.slice(0, 8).map((r, i) => {
                const open = norm(r.status ?? '') !== 'closed';
                return (
                  <ViolRow key={i} cells={[
                    { v: r.complaint_type || '—', color: '#ffff33' },
                    { v: r.descriptor || r.resolution_description || '—', color: 'rgba(255,255,255,0.55)' },
                    { v: open ? 'OPEN' : 'CLOSED', w: '48px', color: open ? '#ffaa00' : '#33ff80', bold: true },
                  ]} />
                );
              })}
            </Collapsible>

            {/* ── OATH HEARINGS ── */}
            <Collapsible title="OATH HEARINGS" color="#ffaa00" count={oathHits.length} defaultOpen={oathHits.length > 0}>
              {oathHits.slice(0, 6).map((r, i) => {
                const guilty = (() => {
                  const hr = norm(r.hearing_result ?? '');
                  return hr.includes('guilty') && !hr.includes('not guilty');
                })();
                return (
                  <ViolRow key={i} critical={guilty} cells={[
                    { v: fmtDate(r.hearing_date || r.ticket_date) ?? '—', w: '80px', color: 'rgba(255,255,255,0.4)' },
                    { v: r.violation_description || r.charge_description || '—' },
                    { v: guilty ? 'GUILTY' : (r.hearing_result || '—'), w: '64px', color: guilty ? '#ff3366' : '#33ff80', bold: guilty },
                  ]} />
                );
              })}
              {oathHits.some((r) => parseFloat(r.penalty_imposed) > 0) && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,170,0,0.2)', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>Total penalties</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#ffaa00' }}>
                    {fmtMoney(oathHits.reduce((s, r) => s + (parseFloat(r.penalty_imposed) || 0), 0))}
                  </span>
                </div>
              )}
            </Collapsible>

            {/* ── RODENT INSPECTIONS ── */}
            <Collapsible title="RODENT INSPECTIONS" color="#33ff80" count={rodentHits.length} defaultOpen={rodentHits.length > 0}>
              {rodentHits.slice(0, 6).map((r, i) => {
                const failed = norm(r.result ?? '').includes('fail') || norm(r.result ?? '').includes('rat');
                return (
                  <ViolRow key={i} critical={failed} cells={[
                    { v: fmtDate(r.inspection_date || r.approved_date) ?? '—', w: '80px', color: 'rgba(255,255,255,0.4)' },
                    { v: r.result || '—', color: failed ? '#ff3366' : '#33ff80', bold: true },
                    { v: r.activity_type || '', color: 'rgba(255,255,255,0.4)' },
                  ]} />
                );
              })}
            </Collapsible>

            {/* ── DCA COMPLAINTS ── */}
            <Collapsible title="DCA COMPLAINTS" color="#cc33ff" count={dcaHits.length} defaultOpen={false}>
              {dcaHits.slice(0, 6).map((r, i) => (
                <ViolRow key={i} cells={[
                  { v: r.category || r.complaint_type || '—', color: '#cc33ff' },
                  { v: fmtDate(r.complaint_date || r.created_date) ?? '—', w: '80px', color: 'rgba(255,255,255,0.4)' },
                  { v: r.status || r.resolution || '—', w: '60px', color: norm(r.status ?? '').includes('open') ? '#ffaa00' : '#33ff80' },
                ]} />
              ))}
            </Collapsible>

            {/* ── RISK FACTORS ── */}
            <SLab color="rgba(255,255,255,0.4)">RISK FACTORS</SLab>
            <ScoreBar
              label="Location Density"
              value={f1avg}
              color="#ff9933"
              sublabel={`${recs.length} violations recorded at this address`}
            />
            <ScoreBar
              label="Dataset Diversity"
              value={f2avg}
              color="#00f5ff"
              sublabel={`${dsCount} of 7 city datasets flagged this location`}
            />
            <ScoreBar
              label="Violation Severity"
              value={f3avg}
              color="#ff3366"
              sublabel="Weighted by violation type seriousness"
            />

            {/* ── CHAIN ANALYSIS ── */}
            {isChain && chainInfo && (
              <>
                <SLab color="#7b2fff">CHAIN ANALYSIS</SLab>
                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                  <StatChip label="Locations" value={chainInfo.locs.length} color="#7b2fff" />
                  <StatChip label="Avg Score" value={Math.round(chainInfo.avgScore * 100)} color="#ffaa00" />
                  {chainInfo.thisIdx >= 0 && (
                    <StatChip label="Rank" value={`#${chainInfo.thisIdx + 1}/${chainInfo.locs.length}`} color="#ff9933" />
                  )}
                </div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 4 }}>RISKIEST LOCATION</div>
                <MiniCard address={chainInfo.locs[0].address} score={Math.round((chainInfo.locs[0].maxScore ?? 0) * 100)} scoreColor="#ff3366" />
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 8, marginBottom: 4 }}>SAFEST LOCATION</div>
                <MiniCard address={chainInfo.locs[chainInfo.locs.length - 1].address} score={Math.round((chainInfo.locs[chainInfo.locs.length - 1].maxScore ?? 0) * 100)} scoreColor="#33ff80" />
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 8, marginBottom: 5 }}>BOROUGH DISTRIBUTION</div>
                {Object.entries(chainInfo.boroDist).sort(([, a], [, b]) => b - a).map(([b, n]) => (
                  <div key={b} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 10 }}>
                    <span style={{ color: 'rgba(255,255,255,0.55)' }}>{cap(b)}</span>
                    <span style={{ color: '#7b2fff', fontWeight: 700 }}>{n} location{n !== 1 ? 's' : ''}</span>
                  </div>
                ))}
              </>
            )}

            {/* ── INSURANCE RECOMMENDATION ── */}
            <SLab color="rgba(255,255,255,0.4)">INSURANCE RECOMMENDATION</SLab>
            <div style={{
              padding: '10px 12px', borderRadius: 8, marginBottom: 10,
              background: uw.bg, border: `1px solid ${uw.color}33`,
            }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: uw.color, marginBottom: 6 }}>
                {uw.label} — {uw.adj}
              </div>
              {bullets.length > 0 ? (
                <ul style={{ margin: 0, paddingLeft: 14 }}>
                  {bullets.map((b, i) => (
                    <li key={i} style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', marginBottom: 3, lineHeight: 1.45 }}>{b}</li>
                  ))}
                </ul>
              ) : (
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)' }}>No significant risk factors identified.</div>
              )}
            </div>

            {/* Comparable properties */}
            {comparables.length > 0 && (
              <>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', marginBottom: 6 }}>
                  COMPARABLE NEARBY PROPERTIES
                </div>
                {comparables.map((r, i) => (
                  <MiniCard
                    key={i}
                    address={`${r.address}${r.borough ? ` · ${cap(r.borough)}` : ''}`}
                    score={Math.round(r.score * 100)}
                    scoreColor={scoreColor100(Math.round(r.score * 100))}
                  />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Dropdown section ──────────────────────────────────────────────────────────

function DropdownSection({ title, color, children }) {
  return (
    <div style={{ marginBottom:2 }}>
      <div style={{
        padding:'6px 14px 4px',
        fontSize:9, fontWeight:700, letterSpacing:'0.14em',
        color, borderBottom:`1px solid ${color}22`,
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function SuggestionRow({ onClick, active, children }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding:'9px 14px', cursor:'pointer',
        background: active ? 'rgba(0,245,255,0.08)' : 'transparent',
        borderLeft: active ? '2px solid #00f5ff' : '2px solid transparent',
        transition:'background 0.1s',
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >
      {children}
    </div>
  );
}

// ── Main SearchBar component ──────────────────────────────────────────────────

export default function SearchBar({ data, rawDatasets, mapInstance, externalQuery, onExternalQueryConsumed, rightOffset = 260 }) {
  const [query,       setQuery]       = useState('');
  const [focused,     setFocused]     = useState(false);
  const [activeIdx,   setActiveIdx]   = useState(-1);
  const [panel,       setPanel]       = useState(null);

  // Respond to external query requests (e.g. from ClickPanel "Search This Address")
  useEffect(() => {
    if (!externalQuery) return;
    setQuery(externalQuery);
    setFocused(true);
    inputRef.current?.focus();
    onExternalQueryConsumed?.();
  }, [externalQuery, onExternalQueryConsumed]);
  const [loading,     setLoading]     = useState(false);
  const [recent,      setRecent]      = useState(loadRecent);

  const inputRef        = useRef(null);
  const markerRef       = useRef(null);
  const chainMarkersRef = useRef([]);

  // ── Index: address → { records[], maxScore, lat, lon, borough } ──────────
  const addressIndex = useMemo(() => {
    const map = new Map();
    for (const r of data) {
      const key = norm(r.address);
      if (!key || key.length < 4) continue;
      if (!map.has(key)) {
        map.set(key, { address: r.address, borough: r.borough, lat: r.lat, lon: r.lon, records: [], maxScore: 0 });
      }
      const entry = map.get(key);
      entry.records.push(r);
      if (r.score > entry.maxScore) {
        entry.maxScore = r.score;
        entry.lat      = r.lat;
        entry.lon      = r.lon;
        entry.borough  = r.borough;
      }
    }
    return map;
  }, [data]);

  // ── Index: businessName → { name, category, locations[] } ────────────────
  const businessIndex = useMemo(() => {
    const map = new Map();

    const addBiz = (rawName, category, house, street, borough, lat, lon) => {
      const name = String(rawName || '').trim();
      if (!name || name.length < 2) return;
      const key = norm(name);
      if (!map.has(key)) map.set(key, { name, category, locations: [] });
      const addr = [house, street].filter(Boolean).join(' ');
      // compute maxScore from addressIndex
      const scored = addressIndex.get(norm(addr));
      map.get(key).locations.push({
        address: addr, borough,
        lat: parseFloat(lat) || null,
        lon: parseFloat(lon) || null,
        maxScore: scored?.maxScore ?? 0,
      });
    };

    for (const r of (rawDatasets?.restaurantInspections ?? [])) {
      addBiz(r.dba, 'Restaurant', r.building, r.street, r.boro, r.latitude, r.longitude);
    }
    for (const r of (rawDatasets?.activeBusinesses ?? [])) {
      const name = r.dba_trade_name || r.business_name;
      addBiz(name, r.business_category || 'Business',
        r.address_building, r.address_street_name,
        r.address_borough, r.latitude, r.longitude);
    }
    return map;
  }, [rawDatasets, addressIndex]);

  // ── Suggestions ───────────────────────────────────────────────────────────
  const suggestions = useMemo(() => {
    if (!query || query.length < 2) return null;
    const q = norm(query);

    const addresses  = [];
    const businesses = [];
    const chains     = [];

    for (const [key, entry] of addressIndex) {
      if (key.includes(q)) addresses.push(entry);
      if (addresses.length >= 4) break;
    }

    for (const [key, entry] of businessIndex) {
      if (!key.includes(q)) continue;
      // deduplicate locations
      const seen = new Set();
      const uniq = entry.locations.filter((l) => {
        const k = norm(l.address);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      const enriched = { ...entry, locations: uniq };
      if (uniq.length >= 3) chains.push(enriched);
      else                   businesses.push(enriched);
    }

    return {
      addresses:  addresses.slice(0, 4),
      businesses: businesses.slice(0, 4),
      chains:     chains.slice(0, 4),
    };
  }, [query, addressIndex, businessIndex]);

  // Flat list for keyboard nav
  const flatItems = useMemo(() => {
    if (!suggestions) return [];
    return [
      ...suggestions.addresses.map((d)  => ({ kind: 'address',  data: d })),
      ...suggestions.businesses.map((d) => ({ kind: 'business', data: d })),
      ...suggestions.chains.map((d)     => ({ kind: 'chain',    data: d })),
    ];
  }, [suggestions]);

  // ── Clear markers ─────────────────────────────────────────────────────────
  const clearMarkers = useCallback(() => {
    markerRef.current?.remove();
    markerRef.current = null;
    chainMarkersRef.current.forEach((m) => m.remove());
    chainMarkersRef.current = [];
  }, []);

  // ── Drop main pin ─────────────────────────────────────────────────────────
  const dropPin = useCallback((lon, lat, color = '#00f5ff') => {
    if (!mapInstance) return;
    clearMarkers();
    const el = makeMarkerEl(color, false);
    markerRef.current = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
      .setLngLat([lon, lat])
      .addTo(mapInstance);
  }, [mapInstance, clearMarkers]);

  // ── Drop chain pins ───────────────────────────────────────────────────────
  const dropChainPins = useCallback((locations) => {
    if (!mapInstance) return;
    locations.forEach((loc) => {
      if (!loc.lat || !loc.lon) return;
      const risk  = getRisk(loc.maxScore ?? 0);
      const el    = makeMarkerEl(risk.color, true);
      const m     = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([loc.lon, loc.lat])
        .addTo(mapInstance);
      chainMarkersRef.current.push(m);
    });
  }, [mapInstance]);

  // ── Select an address result ──────────────────────────────────────────────
  const selectAddress = useCallback((entry) => {
    pushRecent(entry.address);
    setRecent(loadRecent());
    setQuery(entry.address);
    setFocused(false);
    setActiveIdx(-1);

    const risk  = getRisk(entry.maxScore);
    const byType = {};
    for (const r of entry.records) {
      if (!byType[r.type]) byType[r.type] = { count: 0, maxScore: 0 };
      byType[r.type].count++;
      if (r.score > byType[r.type].maxScore) byType[r.type].maxScore = r.score;
    }

    if (mapInstance && entry.lat && entry.lon) {
      mapInstance.flyTo({ center: [entry.lon, entry.lat], zoom: 16, pitch: 60, bearing: -20, speed: 1.6 });
      dropPin(entry.lon, entry.lat, risk.color);
    }

    setPanel({
      type: 'address',
      address: entry.address,
      borough: entry.borough,
      maxScore: entry.maxScore,
      byType,
    });
  }, [mapInstance, dropPin]);

  // ── Select a business result ──────────────────────────────────────────────
  const selectBusiness = useCallback((entry) => {
    const loc = entry.locations.find((l) => l.lat && l.lon) ?? entry.locations[0];
    if (!loc) return;

    pushRecent(entry.name);
    setRecent(loadRecent());
    setQuery(entry.name);
    setFocused(false);
    setActiveIdx(-1);

    const addrEntry = addressIndex.get(norm(loc.address));
    const byType    = {};
    if (addrEntry) {
      for (const r of addrEntry.records) {
        if (!byType[r.type]) byType[r.type] = { count: 0, maxScore: 0 };
        byType[r.type].count++;
        if (r.score > byType[r.type].maxScore) byType[r.type].maxScore = r.score;
      }
    }
    const maxScore = addrEntry?.maxScore ?? 0;
    const risk     = getRisk(maxScore);

    if (mapInstance && loc.lat && loc.lon) {
      mapInstance.flyTo({ center: [loc.lon, loc.lat], zoom: 16, pitch: 60, bearing: -20, speed: 1.6 });
      dropPin(loc.lon, loc.lat, risk.color);
    }

    setPanel({
      type:    'business',
      name:    entry.name,
      address: loc.address,
      borough: loc.borough,
      maxScore,
      byType,
    });
  }, [mapInstance, addressIndex, dropPin]);

  // ── Select a chain result ─────────────────────────────────────────────────
  const selectChain = useCallback((entry) => {
    pushRecent(entry.name);
    setRecent(loadRecent());
    setQuery(entry.name);
    setFocused(false);
    setActiveIdx(-1);

    const validLocs = entry.locations.filter((l) => l.lat && l.lon);
    const best      = [...validLocs].sort((a, b) => (b.maxScore ?? 0) - (a.maxScore ?? 0))[0];
    const maxScore  = best?.maxScore ?? 0;

    if (mapInstance && best) {
      mapInstance.flyTo({ center: [best.lon, best.lat], zoom: 13, pitch: 50, speed: 1.2 });
      clearMarkers();
      dropChainPins(validLocs);
    }

    setPanel({
      type:      'chain',
      name:      entry.name,
      borough:   null,
      maxScore,
      locations: entry.locations,
      byType:    {},
    });
  }, [mapInstance, clearMarkers, dropChainPins]);

  // ── Handle Enter / geocode fallback ──────────────────────────────────────
  const handleEnterOrSubmit = useCallback(async () => {
    if (activeIdx >= 0 && activeIdx < flatItems.length) {
      const item = flatItems[activeIdx];
      if (item.kind === 'address')  selectAddress(item.data);
      if (item.kind === 'business') selectBusiness(item.data);
      if (item.kind === 'chain')    selectChain(item.data);
      return;
    }

    if (!query.trim()) return;

    // Try address index first
    const q     = norm(query);
    const match = [...addressIndex.entries()].find(([k]) => k.includes(q));
    if (match) { selectAddress(match[1]); return; }

    // Geocode fallback
    setLoading(true);
    try {
      const geo = await geocodeAddress(query);
      if (geo && mapInstance) {
        pushRecent(query);
        setRecent(loadRecent());
        setFocused(false);
        mapInstance.flyTo({ center: [geo.lon, geo.lat], zoom: 16, pitch: 60, bearing: -20, speed: 1.6 });
        dropPin(geo.lon, geo.lat, '#ffaa00');
        setPanel({
          type:        'address',
          address:     geo.placeName,
          borough:     null,
          maxScore:    0,
          byType:      {},
          geocodedOnly: true,
        });
      }
    } catch (err) {
      console.warn('Geocode failed:', err);
    } finally {
      setLoading(false);
    }
  }, [activeIdx, flatItems, query, addressIndex, selectAddress, selectBusiness, selectChain, mapInstance, dropPin]);

  // ── Keyboard navigation ───────────────────────────────────────────────────
  const handleKey = useCallback((e) => {
    if (!focused) return;
    if (e.key === 'Escape') { setFocused(false); setActiveIdx(-1); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleEnterOrSubmit();
    }
  }, [focused, flatItems.length, handleEnterOrSubmit]);

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  // Close panel → remove markers
  const closePanel = useCallback(() => {
    setPanel(null);
    clearMarkers();
  }, [clearMarkers]);

  const showDropdown = focused && (query.length >= 2 ? !!suggestions : recent.length > 0);

  // Flat index counter helpers
  let itemCounter = -1;
  const nextIdx = () => { itemCounter++; return itemCounter; };

  return (
    <>
      {/* ── Outer centering wrapper (spans only the map area) ── */}
      <div style={{
        position:       'fixed',
        top:            68,
        left:           280,
        right:          panel ? Math.max(rightOffset, 360) : rightOffset,
        zIndex:         1200,
        display:        'flex',
        justifyContent: 'center',
        pointerEvents:  'none',
      }}>
        {/* ── Inner container (receives pointer events) ── */}
        <div style={{
          width:         500,
          maxWidth:      'calc(100% - 24px)',
          pointerEvents: 'auto',
          fontFamily:    'Inter, sans-serif',
        }}>

          {/* ── Input bar ── */}
          <div style={{
            display:      'flex',
            alignItems:   'center',
            background:   'rgba(5,5,20,0.92)',
            border:       `1px solid ${focused ? 'rgba(0,245,255,0.5)' : 'rgba(0,245,255,0.18)'}`,
            borderRadius: showDropdown ? '12px 12px 0 0' : 12,
            backdropFilter: 'blur(24px)',
            boxShadow:    focused
              ? '0 0 0 3px rgba(0,245,255,0.1), 0 8px 32px rgba(0,0,0,0.7)'
              : '0 8px 32px rgba(0,0,0,0.6)',
            transition:   'border-color 0.2s, box-shadow 0.2s',
            overflow:     'hidden',
          }}>
            {/* Magnifier icon */}
            <div style={{ padding:'0 12px', color: focused ? '#00f5ff' : 'rgba(0,245,255,0.4)', flexShrink:0, transition:'color 0.2s' }}>
              {loading
                ? <span style={{ fontSize:14, animation:'spin 0.8s linear infinite', display:'inline-block' }}>⟳</span>
                : <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                    <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5"/>
                    <line x1="11.5" y1="11.5" x2="15" y2="15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                  </svg>
              }
            </div>

            <input
              ref={inputRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActiveIdx(-1); }}
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 200)}
              placeholder="Search address, business or chain…"
              style={{
                flex:        1,
                background:  'transparent',
                border:      'none',
                outline:     'none',
                color:       '#fff',
                fontSize:    13,
                padding:     '11px 0',
                letterSpacing:'0.02em',
                fontFamily:  'Inter, sans-serif',
              }}
            />

            {/* Clear button */}
            {query && (
              <button
                onMouseDown={(e) => e.preventDefault()} // don't blur input
                onClick={() => { setQuery(''); setActiveIdx(-1); inputRef.current?.focus(); }}
                style={{
                  background:'none', border:'none', cursor:'pointer',
                  color:'rgba(255,255,255,0.3)', padding:'0 10px', fontSize:18,
                  fontFamily:'Inter, sans-serif', flexShrink:0,
                  transition:'color 0.15s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'}
                onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.3)'}
              >
                ×
              </button>
            )}

            {/* Search button */}
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleEnterOrSubmit}
              style={{
                background:    'rgba(0,245,255,0.1)',
                border:        'none',
                borderLeft:    '1px solid rgba(0,245,255,0.15)',
                color:         '#00f5ff',
                padding:       '0 18px',
                height:        '100%',
                cursor:        'pointer',
                fontSize:      11,
                fontWeight:    700,
                letterSpacing: '0.1em',
                fontFamily:    'Inter, sans-serif',
                flexShrink:    0,
                transition:    'background 0.15s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,245,255,0.2)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0,245,255,0.1)'}
            >
              SEARCH
            </button>
          </div>

          {/* ── Dropdown ── */}
          {showDropdown && (
            <div style={{
              background:     'rgba(5,5,20,0.97)',
              border:         '1px solid rgba(0,245,255,0.18)',
              borderTop:      'none',
              borderRadius:   '0 0 12px 12px',
              maxHeight:      460,
              overflowY:      'auto',
              backdropFilter: 'blur(24px)',
              boxShadow:      '0 20px 60px rgba(0,0,0,0.8)',
            }}>

              {/* Recent searches (when query is empty) */}
              {query.length < 2 && recent.length > 0 && (
                <DropdownSection title="RECENT SEARCHES" color="rgba(255,255,255,0.35)">
                  {recent.map((term, i) => {
                    const idx = nextIdx();
                    return (
                      <SuggestionRow key={i} active={activeIdx === idx}
                        onClick={() => { setQuery(term); setActiveIdx(-1); inputRef.current?.focus(); }}>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <span style={{ fontSize:12, color:'rgba(255,255,255,0.25)' }}>⟲</span>
                          <span style={{ fontSize:12, color:'rgba(255,255,255,0.65)' }}>{term}</span>
                        </div>
                      </SuggestionRow>
                    );
                  })}
                  <div style={{ textAlign:'right', padding:'6px 14px' }}>
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { saveRecent([]); setRecent([]); }}
                      style={{ background:'none', border:'none', color:'rgba(255,255,255,0.2)', fontSize:10, cursor:'pointer', letterSpacing:'0.08em', fontFamily:'Inter,sans-serif' }}
                    >
                      CLEAR HISTORY
                    </button>
                  </div>
                </DropdownSection>
              )}

              {/* Address results */}
              {suggestions?.addresses?.length > 0 && (
                <DropdownSection title="ADDRESSES" color="#00f5ff">
                  {suggestions.addresses.map((entry, i) => {
                    const idx  = nextIdx();
                    const risk = getRisk(entry.maxScore);
                    return (
                      <SuggestionRow key={i} active={activeIdx === idx} onClick={() => selectAddress(entry)}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                          <div style={{ flex:1, marginRight:8 }}>
                            <div style={{ fontSize:12, color:'rgba(255,255,255,0.85)' }}>
                              <HighlightText text={entry.address} query={query} />
                            </div>
                            <div style={{ fontSize:10, color:'rgba(255,255,255,0.35)', marginTop:2 }}>
                              {cap(entry.borough)} · {entry.records.length} violation{entry.records.length !== 1 ? 's' : ''}
                            </div>
                          </div>
                          <div style={{
                            fontSize:11, fontWeight:700, color:risk.color,
                            background:`${risk.color}18`, borderRadius:4, padding:'2px 7px', flexShrink:0,
                          }}>
                            {entry.maxScore.toFixed(2)}
                          </div>
                        </div>
                      </SuggestionRow>
                    );
                  })}
                </DropdownSection>
              )}

              {/* Business results */}
              {suggestions?.businesses?.length > 0 && (
                <DropdownSection title="BUSINESSES" color="#ff9933">
                  {suggestions.businesses.map((entry, i) => {
                    const idx     = nextIdx();
                    const loc     = entry.locations[0];
                    const maxScore = Math.max(...entry.locations.map((l) => l.maxScore ?? 0));
                    const risk    = getRisk(maxScore);
                    return (
                      <SuggestionRow key={i} active={activeIdx === idx} onClick={() => selectBusiness(entry)}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                          <div style={{ flex:1, marginRight:8 }}>
                            <div style={{ fontSize:12, color:'rgba(255,255,255,0.85)' }}>
                              <HighlightText text={entry.name} query={query} />
                            </div>
                            <div style={{ fontSize:10, color:'rgba(255,255,255,0.35)', marginTop:2 }}>
                              {entry.category} · {loc?.address}
                            </div>
                          </div>
                          <div style={{
                            fontSize:11, fontWeight:700, color:risk.color,
                            background:`${risk.color}18`, borderRadius:4, padding:'2px 7px', flexShrink:0,
                          }}>
                            {maxScore.toFixed(2)}
                          </div>
                        </div>
                      </SuggestionRow>
                    );
                  })}
                </DropdownSection>
              )}

              {/* Chain results */}
              {suggestions?.chains?.length > 0 && (
                <DropdownSection title="CHAINS" color="#7b2fff">
                  {suggestions.chains.map((entry, i) => {
                    const idx      = nextIdx();
                    const maxScore = Math.max(...entry.locations.map((l) => l.maxScore ?? 0));
                    const risk     = getRisk(maxScore);
                    return (
                      <SuggestionRow key={i} active={activeIdx === idx} onClick={() => selectChain(entry)}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                          <div style={{ flex:1, marginRight:8 }}>
                            <div style={{ fontSize:12, color:'rgba(255,255,255,0.85)' }}>
                              <HighlightText text={entry.name} query={query} />
                            </div>
                            <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:2 }}>
                              <span style={{ fontSize:10, color:'rgba(123,47,255,0.8)', fontWeight:600 }}>
                                ⛓ {entry.locations.length} NYC locations
                              </span>
                              <span style={{ fontSize:10, color:'rgba(255,255,255,0.3)' }}>· {entry.category}</span>
                            </div>
                          </div>
                          <div style={{
                            fontSize:11, fontWeight:700, color:risk.color,
                            background:`${risk.color}18`, borderRadius:4, padding:'2px 7px', flexShrink:0,
                          }}>
                            {maxScore.toFixed(2)}
                          </div>
                        </div>
                      </SuggestionRow>
                    );
                  })}
                </DropdownSection>
              )}

              {/* Empty state */}
              {query.length >= 2 &&
               !suggestions?.addresses?.length &&
               !suggestions?.businesses?.length &&
               !suggestions?.chains?.length && (
                <div style={{ padding:'20px', textAlign:'center', color:'rgba(255,255,255,0.25)', fontSize:12 }}>
                  No results in dataset — press Enter to geocode this address
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Risk panel ── */}
      {panel && (
        <RiskPanel
          panel={panel}
          onClose={closePanel}
          rawDatasets={rawDatasets}
          data={data}
        />
      )}

      {/* ── CSS animations ── */}
      <style>{`
        @keyframes markerBounce {
          0%   { transform: translateY(-28px) scale(0.7); opacity: 0; }
          55%  { transform: translateY(5px)   scale(1.05); opacity: 1; }
          75%  { transform: translateY(-8px)  scale(0.97); }
          90%  { transform: translateY(3px)   scale(1.01); }
          100% { transform: translateY(0)     scale(1);    opacity: 1; }
        }
        @keyframes slideInRight {
          from { transform: translateX(40px); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
