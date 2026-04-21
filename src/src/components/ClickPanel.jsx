import { useState, useMemo, useEffect, useRef } from 'react';

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_COLORS = {
  housing:      '#ff3333', restaurant: '#33aaff', construction: '#33ff80',
  service311:   '#ffff33', permit:     '#ff9933', property:     '#cc33ff', fire: '#ff6699',
};

const TYPE_LABELS = {
  housing:      'Housing Violation',      restaurant:   'Restaurant Inspection',
  construction: 'Construction Violation', service311:   '311 Complaint',
  permit:       'Permit Issuance',        property:     'Property Valuation',
  fire:         'Fire Incident',
};

const BORO_COLORS = {
  manhattan: '#33aaff', brooklyn: '#33ff80', queens: '#ff9933',
  bronx: '#ff3366', 'staten island': '#cc33ff',
};

const UW = [
  { min: 0.80, label: 'DO NOT INSURE',   color: '#ff0040', bg: 'rgba(255,0,64,0.13)',   adj: 'Decline'  },
  { min: 0.65, label: 'HIGH RISK',       color: '#ff3366', bg: 'rgba(255,51,102,0.12)', adj: '+30%'     },
  { min: 0.40, label: 'REVIEW REQUIRED', color: '#ffaa00', bg: 'rgba(255,170,0,0.11)',  adj: '+15%'     },
  { min: 0,    label: 'INSURABLE',       color: '#33ff80', bg: 'rgba(51,255,128,0.09)', adj: 'Standard' },
];

const PORTFOLIO_KEY = 'fraudlens_portfolio';

// ── Helpers ───────────────────────────────────────────────────────────────────

function norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
function cap(s)  { return s ? s.charAt(0).toUpperCase() + s.slice(1) : '—'; }

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function matchAddr(house, street, qParts) {
  const rowN = norm(`${house || ''} ${street || ''}`);
  if (rowN.length < 3 || !qParts.length) return false;
  return qParts.slice(0, 2).every((p) => p.length > 1 && rowN.includes(p));
}

function fmtDate(raw) {
  if (!raw) return '—';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return String(raw).slice(0, 10) || '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtMoney(val) {
  const n = parseFloat(val);
  return (!n || isNaN(n)) ? null : `$${Math.round(n).toLocaleString()}`;
}

function makeCircleGeoJSON(lon, lat, radiusM, steps = 64) {
  const coords = [];
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    coords.push([
      lon + (radiusM / (111320 * Math.cos(lat * Math.PI / 180))) * Math.sin(angle),
      lat + (radiusM / 111320) * Math.cos(angle),
    ]);
  }
  return { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] }, properties: {} }] };
}

// ── Pill ──────────────────────────────────────────────────────────────────────

function Pill({ label, color, bg }) {
  return (
    <span style={{
      display: 'inline-block', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
      color: color ?? '#fff', background: bg ?? 'rgba(255,255,255,0.1)',
      borderRadius: 4, padding: '2px 7px', border: `1px solid ${color ?? '#fff'}33`,
    }}>
      {label}
    </span>
  );
}

// ── Mini bar ──────────────────────────────────────────────────────────────────

function MiniBar({ label, value, color }) {
  const pct = Math.round(Math.min(100, value * 100));
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.06em' }}>{label}</span>
        <span style={{ fontSize: 9, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
          {value.toFixed(2)}
        </span>
      </div>
      <div style={{ height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`, borderRadius: 2,
          background: `linear-gradient(90deg,${color}55,${color})`,
          transition: 'width 0.7s ease',
        }} />
      </div>
    </div>
  );
}

// ── Detail row ────────────────────────────────────────────────────────────────

function DRow({ label, value, valueColor }) {
  if (!value && value !== 0) return null;
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
      padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
    }}>
      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)', flexShrink: 0, marginRight: 12, paddingTop: 1 }}>
        {label}
      </span>
      <span style={{
        fontSize: 10, color: valueColor ?? 'rgba(255,255,255,0.78)',
        textAlign: 'right', fontWeight: valueColor ? 700 : 400,
        wordBreak: 'break-word', maxWidth: 200,
      }}>
        {String(value)}
      </span>
    </div>
  );
}

// ── Action button ─────────────────────────────────────────────────────────────

function ActionBtn({ label, icon, onClick, color = '#00f5ff' }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: '8px 6px', background: `${color}0d`,
        border: `1px solid ${color}33`, borderRadius: 7,
        color, fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
        cursor: 'pointer', fontFamily: 'Inter, sans-serif',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
        transition: 'all 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = `${color}1a`; e.currentTarget.style.borderColor = `${color}66`; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = `${color}0d`; e.currentTarget.style.borderColor = `${color}33`; }}
    >
      <span style={{ fontSize: 14 }}>{icon}</span>
      {label}
    </button>
  );
}

// ── Violation detail by type ──────────────────────────────────────────────────

function ViolationDetail({ point, rawDatasets }) {
  const qParts = useMemo(() =>
    norm(point.address ?? '').split(' ').filter((p) => p.length > 1),
    [point.address]);

  const raw = useMemo(() => {
    if (!rawDatasets) return null;
    switch (point.type) {
      case 'restaurant':
        return (rawDatasets.restaurantInspections ?? []).find((r) => matchAddr(r.building, r.street, qParts));
      case 'housing':
        return (rawDatasets.housingViolations ?? []).find((r) => matchAddr(r.housenumber, r.streetname, qParts));
      case 'construction':
        return (rawDatasets.constructionViolations ?? []).find((r) => matchAddr(r.house_number, r.street, qParts));
      case 'permit':
        return (rawDatasets.permitIssuance ?? []).find((r) => matchAddr(r['house__'] || r.house_no, r.street_name, qParts));
      case 'fire':
        return (rawDatasets.fireIncidents ?? []).find((r) =>
          qParts.slice(0, 1).some((p) => norm(r.alarm_box_location ?? '').includes(p)));
      case 'service311':
        return (rawDatasets.serviceRequests311 ?? []).find((r) =>
          qParts.slice(0, 2).every((p) => norm(r.incident_address ?? '').includes(p)));
      case 'property':
        return (rawDatasets.propertyValuation ?? []).find((r) => matchAddr(r.staddr, '', qParts));
      default: return null;
    }
  }, [point.type, qParts, rawDatasets]);

  const color = TYPE_COLORS[point.type] ?? '#fff';

  if (!raw) {
    return (
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontStyle: 'italic', padding: '4px 0' }}>
        Detailed record not available for this point
      </div>
    );
  }

  switch (point.type) {
    case 'restaurant':
      return (
        <>
          <DRow label="Grade"       value={raw.grade || '—'} valueColor={raw.grade === 'A' ? '#33ff80' : raw.grade === 'B' ? '#ffaa00' : '#ff3366'} />
          <DRow label="Violation"   value={raw.violation_code} />
          <DRow label="Description" value={raw.violation_description || raw.action} />
          <DRow label="Critical"    value={norm(raw.critical_flag ?? '') === 'critical' ? 'YES' : 'No'} valueColor={norm(raw.critical_flag ?? '') === 'critical' ? '#ff3366' : '#33ff80'} />
          <DRow label="Date"        value={fmtDate(raw.inspection_date || raw.grade_date)} />
        </>
      );
    case 'housing':
      return (
        <>
          <DRow label="Class"       value={raw.violationclass ? `Class ${raw.violationclass}` : raw.class_} valueColor={color} />
          <DRow label="Description" value={raw.novdescription || raw.violationtype} />
          <DRow label="Status"      value={!raw.closedate ? 'OPEN' : 'CLOSED'} valueColor={!raw.closedate ? '#ff3366' : '#33ff80'} />
          <DRow label="Issued"      value={fmtDate(raw.novissuedate || raw.inspectiondate)} />
          {raw.closedate && <DRow label="Closed" value={fmtDate(raw.closedate)} />}
          {raw.penalty_imposed && <DRow label="Penalty" value={fmtMoney(raw.penalty_imposed)} valueColor="#ff9933" />}
        </>
      );
    case 'construction':
      return (
        <>
          <DRow label="Type"       value={raw.violation_type || raw.violation_category} valueColor={color} />
          <DRow label="Description" value={raw.description || raw.disposition_description} />
          <DRow label="Stop Work"  value={norm(raw.violation_type ?? '').includes('stop') ? 'YES' : 'No'} valueColor={norm(raw.violation_type ?? '').includes('stop') ? '#ff0040' : '#33ff80'} />
          <DRow label="Status"     value={raw.disposition_date ? 'CLOSED' : 'OPEN'} valueColor={raw.disposition_date ? '#33ff80' : '#ff9933'} />
          <DRow label="Date"       value={fmtDate(raw.issue_date || raw.last_modified_date)} />
        </>
      );
    case 'permit':
      return (
        <>
          <DRow label="Permit Type" value={raw.permit_type || raw.job_type} valueColor={color} />
          <DRow label="Job Type"    value={raw.job_type || raw.work_type} />
          <DRow label="Filed"       value={fmtDate(raw.filing_date || raw.pre_filing_date)} />
          <DRow label="Status"      value={raw.job_status || raw.permit_status || raw.status} />
          <DRow label="Owner"       value={raw.owner_s_first_name ? `${raw.owner_s_first_name} ${raw.owner_s_last_name || ''}` : raw.applicant_s_first_name} />
        </>
      );
    case 'fire':
      return (
        <>
          <DRow label="Type"     value={raw.incident_classification || raw.incident_classification_group} valueColor={color} />
          <DRow label="Date"     value={fmtDate(raw.incident_datetime)} />
          <DRow label="Response" value={raw.dispatch_response_seconds_qy ? `${Math.round(raw.dispatch_response_seconds_qy / 60)} min` : '—'} />
          <DRow label="Borough"  value={cap(raw.incident_borough)} />
        </>
      );
    case 'service311':
      return (
        <>
          <DRow label="Complaint" value={raw.complaint_type} valueColor={color} />
          <DRow label="Details"   value={raw.descriptor} />
          <DRow label="Status"    value={raw.status} valueColor={norm(raw.status ?? '') === 'closed' ? '#33ff80' : '#ffaa00'} />
          <DRow label="Date"      value={fmtDate(raw.created_date)} />
          <DRow label="Agency"    value={raw.agency_name} />
        </>
      );
    case 'property':
      return (
        <>
          <DRow label="Address"   value={raw.staddr} valueColor={color} />
          <DRow label="Bldg Class" value={raw.bldgcl || raw.building_class} />
          <DRow label="Land Value" value={fmtMoney(raw.avtot || raw.land_val)} />
          <DRow label="Mkt Value"  value={fmtMoney(raw.fullval || raw.mkt_val)} />
          <DRow label="Owner Type" value={raw.owntype || raw.owner_type} />
        </>
      );
    default: return null;
  }
}

// ── ClickPanel ────────────────────────────────────────────────────────────────

export default function ClickPanel({ point, data, rawDatasets, mapInstance, onClose, onSearchAddress }) {
  const [toast,    setToast]    = useState(null);
  const radiusLayerRef = useRef(false);

  const color   = TYPE_COLORS[point.type]  ?? '#ffffff';
  const boroC   = BORO_COLORS[norm(point.borough ?? '')] ?? 'rgba(255,255,255,0.3)';
  const score   = parseFloat(point.score ?? 0);
  const pct     = Math.round(score * 100);
  const uw      = UW.find((l) => score >= l.min) ?? UW[UW.length - 1];
  const scoreC  = pct >= 81 ? '#ff3366' : pct >= 61 ? '#ff9933' : pct >= 31 ? '#ffff33' : '#33ff80';
  const f1      = parseFloat(point.factor1 ?? 0);
  const f2      = parseFloat(point.factor2 ?? 0);
  const f3      = parseFloat(point.factor3 ?? 0);
  const lat     = parseFloat(point.lat ?? 0);
  const lon     = parseFloat(point.lon ?? 0);

  // ── Nearby analysis ───────────────────────────────────────────────────────
  const nearby = useMemo(() => {
    if (!data?.length || !lat || !lon) return { total: 0, byType: {}, densityRatio: 0 };
    const within = data.filter((d) => d.lat && d.lon && haversine(lat, lon, d.lat, d.lon) <= 500);
    const byType = {};
    within.forEach((d) => { byType[d.type] = (byType[d.type] ?? 0) + 1; });
    // NYC avg per 500m circle: total_records × (π×0.5²km² / 783km²)
    const nycAvgPer500m = data.length * (Math.PI * 0.25 / 783);
    const densityRatio  = nycAvgPer500m > 0 ? within.length / nycAvgPer500m : 0;
    return { total: within.length, byType, densityRatio };
  }, [data, lat, lon]);

  // ── Risk bullets ──────────────────────────────────────────────────────────
  const bullets = useMemo(() => {
    const b = [];
    if (score >= 0.65) b.push('Located in a high-risk violation zone');
    if (f1 > 0.7)      b.push('High violation density area — many incidents in same grid cell');
    if (f2 > 0.6)      b.push(`Flagged by ${Math.round(f2 * 7)} different city datasets`);
    if (nearby.densityRatio > 2) b.push(`Nearby violation density is ${nearby.densityRatio.toFixed(1)}× NYC average`);
    if (nearby.total > 20) b.push(`${nearby.total} other violations found within 500m radius`);
    if (b.length === 0) b.push('Risk within acceptable underwriting parameters');
    return b.slice(0, 3);
  }, [score, f1, f2, nearby]);

  // ── Ensure radius source/layers on mapInstance ────────────────────────────
  useEffect(() => {
    const map = mapInstance;
    if (!map || radiusLayerRef.current) return;
    const tryAdd = () => {
      if (!map.isStyleLoaded()) return;
      if (!map.getSource('click-radius')) {
        map.addSource('click-radius', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addLayer({ id: 'click-radius-fill', type: 'fill', source: 'click-radius', paint: { 'fill-color': color, 'fill-opacity': 0.06 } });
        map.addLayer({ id: 'click-radius-line', type: 'line', source: 'click-radius', paint: { 'line-color': color, 'line-width': 1.5, 'line-dasharray': [4, 3], 'line-opacity': 0.6 } });
      }
      radiusLayerRef.current = true;
    };
    if (map.isStyleLoaded()) tryAdd();
    else map.once('load', tryAdd);
  }, [mapInstance, color]);

  // Clear radius on unmount
  useEffect(() => {
    return () => {
      const map = mapInstance;
      if (!map) return;
      try { map.getSource('click-radius')?.setData({ type: 'FeatureCollection', features: [] }); } catch {}
    };
  }, [mapInstance]);

  // ── Toast helper ──────────────────────────────────────────────────────────
  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  // ── Actions ───────────────────────────────────────────────────────────────
  const viewNearby = () => {
    if (!mapInstance || !lat || !lon) return;
    const circle = makeCircleGeoJSON(lon, lat, 500);
    try { mapInstance.getSource('click-radius')?.setData(circle); } catch {}
    mapInstance.flyTo({ center: [lon, lat], zoom: 15, pitch: 50, speed: 1.4 });
  };

  const searchAddress = () => {
    onSearchAddress?.(point.address);
    onClose();
  };

  const addToPortfolio = () => {
    try {
      const list  = JSON.parse(localStorage.getItem(PORTFOLIO_KEY) || '[]');
      const entry = {
        address: point.address, borough: point.borough,
        type: point.type, score, lat, lon,
        savedAt: new Date().toISOString(),
      };
      const exists = list.findIndex((l) => l.address === entry.address && l.type === entry.type);
      if (exists >= 0) { showToast('Already in portfolio'); return; }
      list.unshift(entry);
      localStorage.setItem(PORTFOLIO_KEY, JSON.stringify(list.slice(0, 50)));
      showToast('Added to portfolio ✓');
    } catch { showToast('Could not save'); }
  };

  return (
    <>
      <div style={{
        position:       'fixed',
        right:          0,
        top:            56,
        bottom:         48,
        width:          340,
        zIndex:         550,
        background:     'rgba(5,5,20,0.97)',
        borderLeft:     '1px solid rgba(0,245,255,0.15)',
        borderTop:      `2px solid ${color}`,
        fontFamily:     'Inter, sans-serif',
        display:        'flex',
        flexDirection:  'column',
        animation:      'cpSlideIn 0.26s cubic-bezier(.25,.46,.45,.94) forwards',
        backdropFilter: 'blur(28px)',
        boxShadow:      '-14px 0 48px rgba(0,0,0,0.75)',
      }}>

        {/* ── SECTION 1: IDENTITY ── */}
        <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, marginRight: 8 }}>
              {/* Dataset badge */}
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: `${color}18`, border: `1px solid ${color}44`,
                borderRadius: 6, padding: '3px 10px', marginBottom: 8,
              }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}` }} />
                <span style={{ fontSize: 10, fontWeight: 700, color, letterSpacing: '0.1em' }}>
                  {TYPE_LABELS[point.type]?.toUpperCase() ?? point.type?.toUpperCase()}
                </span>
              </div>

              {/* Name / address */}
              <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', lineHeight: 1.25, marginBottom: 3 }}>
                {point.address || '—'}
              </div>
              <div style={{ fontSize: 11, color: '#00f5ff', marginBottom: 6 }}>
                {point.address}
              </div>

              {/* Borough + coords */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                {point.borough && (
                  <Pill label={cap(point.borough).toUpperCase()} color={boroC} bg={`${boroC}18`} />
                )}
              </div>
              {lat && lon && (
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', marginTop: 5, fontVariantNumeric: 'tabular-nums' }}>
                  {lat.toFixed(5)}, {lon.toFixed(5)}
                </div>
              )}
            </div>

            <button onClick={onClose} style={{
              background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)',
              cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '0 2px', flexShrink: 0,
            }}>×</button>
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px 16px' }}>

          {/* ── SECTION 2: RISK SCORE ── */}
          <div style={{
            padding: '10px 12px', borderRadius: 8, marginBottom: 12,
            background: `${scoreC}0d`, border: `1px solid ${scoreC}33`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', marginBottom: 2 }}>RISK SCORE</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: 38, fontWeight: 900, color: scoreC, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                    {pct}
                  </span>
                  <span style={{ fontSize: 14, color: `${scoreC}88`, fontWeight: 700 }}>%</span>
                </div>
              </div>
              <div style={{
                padding: '6px 12px', borderRadius: 8,
                background: `${scoreC}20`, border: `1px solid ${scoreC}55`,
                fontSize: 11, fontWeight: 700, color: scoreC, letterSpacing: '0.06em', textAlign: 'center',
              }}>
                {point.scoreLabel || (pct >= 75 ? 'Critical Risk' : pct >= 50 ? 'High Risk' : pct >= 25 ? 'Medium Risk' : 'Low Risk')}
              </div>
            </div>

            {/* Main gradient bar */}
            <div style={{ height: 5, background: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden', marginBottom: 10 }}>
              <div style={{
                height: '100%', width: `${pct}%`, borderRadius: 3,
                background: 'linear-gradient(90deg,#33ff80,#ffff33,#ff9933,#ff3366)',
                backgroundSize: '300px 100%', backgroundPosition: `${100 - pct}% 0`,
                transition: 'width 0.7s ease',
              }} />
            </div>

            {/* Factor mini bars */}
            <MiniBar label="DENSITY (F1)"  value={f1} color="#ff9933" />
            <MiniBar label="DIVERSITY (F2)" value={f2} color="#00f5ff" />
            <MiniBar label="SEVERITY (F3)"  value={f3} color="#ff3366" />
          </div>

          {/* ── SECTION 3: VIOLATION DETAILS ── */}
          <div style={{
            marginBottom: 12,
            borderLeft: `3px solid ${color}`,
            borderRadius: '0 7px 7px 0',
            background: `${color}07`,
            padding: '8px 10px',
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color, marginBottom: 7 }}>
              VIOLATION DETAILS
            </div>
            <ViolationDetail point={point} rawDatasets={rawDatasets} />
          </div>

          {/* ── SECTION 4: NEARBY RISK ── */}
          <div style={{
            marginBottom: 12,
            borderLeft: '3px solid rgba(123,47,255,0.6)',
            borderRadius: '0 7px 7px 0',
            background: 'rgba(123,47,255,0.05)',
            padding: '8px 10px',
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: '#7b2fff', marginBottom: 7 }}>
              NEARBY RISK — 500M RADIUS
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#7b2fff', lineHeight: 1 }}>
                  {nearby.total}
                </div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>total violations nearby</div>
              </div>
              {nearby.densityRatio > 0 && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{
                    fontSize: 16, fontWeight: 800, lineHeight: 1,
                    color: nearby.densityRatio > 3 ? '#ff3366' : nearby.densityRatio > 1.5 ? '#ff9933' : '#33ff80',
                  }}>
                    {nearby.densityRatio.toFixed(1)}×
                  </div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>vs NYC avg</div>
                </div>
              )}
            </div>

            {/* By type breakdown */}
            {Object.entries(nearby.byType)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 5)
              .map(([type, count]) => (
                <div key={type} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '3px 0', fontSize: 10,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: TYPE_COLORS[type] ?? '#fff', flexShrink: 0 }} />
                    <span style={{ color: 'rgba(255,255,255,0.55)' }}>{TYPE_LABELS[type] ?? type}</span>
                  </div>
                  <span style={{ color: TYPE_COLORS[type] ?? '#fff', fontWeight: 700 }}>{count}</span>
                </div>
              ))}
          </div>

          {/* ── SECTION 5: INSURANCE RECOMMENDATION ── */}
          <div style={{
            marginBottom: 12,
            padding: '10px 12px', borderRadius: 8,
            background: uw.bg, border: `1px solid ${uw.color}33`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: uw.color, letterSpacing: '0.1em' }}>{uw.label}</span>
              <span style={{ fontSize: 10, color: `${uw.color}99`, fontWeight: 600 }}>Premium: {uw.adj}</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: 14 }}>
              {bullets.map((b, i) => (
                <li key={i} style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', marginBottom: 3, lineHeight: 1.45 }}>{b}</li>
              ))}
            </ul>
          </div>

          {/* ── SECTION 6: ACTIONS ── */}
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.3)', marginBottom: 7 }}>
            ACTIONS
          </div>
          <div style={{ display: 'flex', gap: 7 }}>
            <ActionBtn label="VIEW NEARBY" icon="◎" color="#7b2fff" onClick={viewNearby} />
            <ActionBtn label="SEARCH ADDRESS" icon="⌕" color="#00f5ff" onClick={searchAddress} />
            <ActionBtn label="ADD TO PORTFOLIO" icon="＋" color="#33ff80" onClick={addToPortfolio} />
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 60, right: 355, zIndex: 2000,
          background: 'rgba(5,5,20,0.95)', border: '1px solid rgba(0,245,255,0.3)',
          borderRadius: 8, padding: '8px 16px', fontSize: 12, color: '#00f5ff',
          animation: 'cpSlideIn 0.2s ease forwards',
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          fontFamily: 'Inter, sans-serif',
        }}>
          {toast}
        </div>
      )}

      <style>{`
        @keyframes cpSlideIn {
          from { transform: translateX(30px); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </>
  );
}
