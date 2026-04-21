// ── Constants ─────────────────────────────────────────────────────────────────

const GRID_SIZE = 0.003; // degrees (~300 m per cell)

const BOROUGH_CENTERS = {
  manhattan:      { lat: 40.7831, lon: -73.9712 },
  brooklyn:       { lat: 40.6782, lon: -73.9442 },
  queens:         { lat: 40.7282, lon: -73.7949 },
  bronx:          { lat: 40.8448, lon: -73.8648 },
  'staten island':{ lat: 40.5795, lon: -74.1502 },
};

// Factor 3 base weight per dataset type
const TYPE_SEVERITY = {
  housing:      0.9,
  fire:         0.85,
  construction: 0.8,
  service311:   0.6,
  restaurant:   0.5,
  permit:       0.4,
  property:     0.3,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function addrKey(houseNum, street) {
  if (!houseNum && !street) return null;
  return `${String(houseNum || '').toLowerCase().trim()}|${String(street || '').toLowerCase().trim()}`;
}

function toFloat(val) {
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

function normalizeBoro(raw) {
  if (!raw) return null;
  const s = String(raw).toLowerCase().trim();
  if (s === 'mn' || s === 'manhattan'    || s === '1') return 'manhattan';
  if (s === 'bk' || s === 'brooklyn'     || s === '3') return 'brooklyn';
  if (s === 'qn' || s === 'queens'       || s === '4') return 'queens';
  if (s === 'bx' || s === 'bronx'        || s === '2') return 'bronx';
  if (s === 'si' || s === 'staten island'|| s === '5') return 'staten island';
  return s || null;
}

// Canonical grid-cell key for a lat/lon pair
function cellKey(lat, lon) {
  return `${Math.floor(lat / GRID_SIZE)},${Math.floor(lon / GRID_SIZE)}`;
}

function scoreLabel(score) {
  if (score >= 0.75) return 'Critical Risk';
  if (score >= 0.50) return 'High Risk';
  if (score >= 0.25) return 'Medium Risk';
  return 'Low Risk';
}

// ── Mappers ───────────────────────────────────────────────────────────────────

function mapHousing(rows) {
  return rows.map((r) => ({
    lat:     toFloat(r.latitude),
    lon:     toFloat(r.longitude),
    borough: normalizeBoro(r.boro),
    address: [r.housenumber, r.streetname].filter(Boolean).join(' '),
    type:    'housing',
  })).filter((r) => r.lat !== null && r.lon !== null);
}

function mapRestaurant(rows) {
  return rows.map((r) => ({
    lat:     toFloat(r.latitude),
    lon:     toFloat(r.longitude),
    borough: normalizeBoro(r.boro),
    address: [r.building, r.street].filter(Boolean).join(' '),
    type:    'restaurant',
  })).filter((r) => r.lat !== null && r.lon !== null);
}

function mapConstruction(rows) {
  return rows.map((r) => {
    const borough = normalizeBoro(r.boro);
    const center  = borough ? BOROUGH_CENTERS[borough] : null;
    return {
      lat:     center ? center.lat : null,
      lon:     center ? center.lon : null,
      borough,
      address: [r.house_number, r.street].filter(Boolean).join(' '),
      type:    'construction',
    };
  }).filter((r) => r.lat !== null && r.lon !== null);
}

function mapService311(rows) {
  return rows.map((r) => ({
    lat:     toFloat(r.latitude),
    lon:     toFloat(r.longitude),
    borough: normalizeBoro(r.borough),
    address: r.incident_address || '',
    type:    'service311',
  })).filter((r) => r.lat !== null && r.lon !== null);
}

function mapPermit(rows) {
  return rows.map((r) => ({
    lat:     toFloat(r.gis_latitude),
    lon:     toFloat(r.gis_longitude),
    borough: normalizeBoro(r.borough),
    address: [r['house__'], r.street_name].filter(Boolean).join(' '),
    type:    'permit',
  })).filter((r) => r.lat !== null && r.lon !== null);
}

function mapProperty(rows) {
  return rows.map((r) => ({
    lat:     toFloat(r.latitude),
    lon:     toFloat(r.longitude),
    borough: normalizeBoro(r.boro),
    address: r.staddr || '',
    type:    'property',
  })).filter((r) => r.lat !== null && r.lon !== null);
}

function mapFire(rows) {
  return rows.map((r) => {
    const borough = normalizeBoro(r.incident_borough);
    const center  = borough ? BOROUGH_CENTERS[borough] : null;
    return {
      lat:     center ? center.lat : null,
      lon:     center ? center.lon : null,
      borough,
      address: r.alarm_box_location || '',
      type:    'fire',
    };
  }).filter((r) => r.lat !== null && r.lon !== null);
}

// ── Bonus-set builders ────────────────────────────────────────────────────────

function buildEcbSet(rows) {
  const s = new Set();
  for (const r of rows) {
    const k = addrKey(r.respondent_house_number, r.respondent_street);
    if (k) s.add(k);
  }
  return s;
}

function buildOathSet(rows) {
  const s = new Set();
  for (const r of rows) {
    const k = addrKey(r.violation_location_house, r.violation_location_street_name);
    if (k) s.add(k);
  }
  return s;
}

function buildRodentFailedSet(rows) {
  const s = new Set();
  for (const r of rows) {
    const result = String(r.result || '').toLowerCase();
    if (result.includes('failed') || result.includes('rat activity')) {
      // prefer lat/lon key if available, else address key
      const lat = toFloat(r.latitude);
      const lon = toFloat(r.longitude);
      if (lat !== null && lon !== null) {
        s.add(cellKey(lat, lon));
      }
      const k = addrKey(r.house_number, r.street_name);
      if (k) s.add(k);
    }
  }
  return s;
}

// ── Grid aggregation ──────────────────────────────────────────────────────────

function buildGrid(records) {
  // First pass: accumulate count and type set per cell
  const grid = {}; // cellKey → { count, types: Set }

  for (const r of records) {
    const key = cellKey(r.lat, r.lon);
    if (!grid[key]) grid[key] = { count: 0, types: new Set() };
    grid[key].count++;
    grid[key].types.add(r.type);
  }

  // Convert Set → size for serialisability
  const result = {};
  for (const [k, v] of Object.entries(grid)) {
    result[k] = { count: v.count, uniqueTypes: v.types.size };
  }
  return result;
}

// ── Scoring ───────────────────────────────────────────────────────────────────

function scoreRecords(records, grid, ecbSet, oathSet, rodentFailedSet) {
  return records.map((r) => {
    const cell = grid[cellKey(r.lat, r.lon)] ?? { count: 1, uniqueTypes: 1 };

    // Factor 1 — location density (log scale, cap at 1)
    const f1 = Math.min(1, Math.log1p(cell.count) / Math.log1p(50));

    // Factor 2 — dataset diversity in cell (0–1)
    const f2 = cell.uniqueTypes / 7;

    // Factor 3 — violation type severity weight
    const f3 = TYPE_SEVERITY[r.type] ?? 0.5;

    const base = f1 * 0.5 + f2 * 0.3 + f3 * 0.2;

    // Enforcement bonuses — address or cell key match
    const addrK = addrKey(
      r.address.split(' ')[0],
      r.address.split(' ').slice(1).join(' ')
    );
    const cellK = cellKey(r.lat, r.lon);

    let bonus = 0;
    if (ecbSet.size && (addrK && ecbSet.has(addrK)))          bonus += 0.3;
    if (oathSet.size && (addrK && oathSet.has(addrK)))        bonus += 0.2;
    if (rodentFailedSet.size && (
      (addrK && rodentFailedSet.has(addrK)) || rodentFailedSet.has(cellK)
    )) bonus += 0.25;

    const raw   = Math.min(1, base + bonus);
    const score = Math.round(raw * 100) / 100;

    return {
      lat:        r.lat,
      lon:        r.lon,
      type:       r.type,
      borough:    r.borough,
      address:    r.address,
      score,
      scoreLabel: scoreLabel(score),
      factor1:    Math.round(f1 * 100) / 100,
      factor2:    Math.round(f2 * 100) / 100,
      factor3:    f3,
    };
  });
}

// ── Console diagnostics ───────────────────────────────────────────────────────

function logDistribution(scored) {
  // Bucket counts: [0,0.1), [0.1,0.2), … [0.9,1.0]
  const buckets = Array(10).fill(0);
  for (const r of scored) {
    const idx = Math.min(9, Math.floor(r.score * 10));
    buckets[idx]++;
  }

  const lines = buckets.map(
    (n, i) => `  ${(i * 0.1).toFixed(1)}–${(i * 0.1 + 0.1).toFixed(1)}: ${n} records`
  );

  const sorted   = [...scored].sort((a, b) => b.score - a.score);
  const top5     = sorted.slice(0, 5);
  const bottom5  = sorted.slice(-5).reverse();

  const fmt = (r) =>
    `  score=${r.score}  type=${r.type}  borough=${r.borough}  lat=${r.lat?.toFixed(4)}  lon=${r.lon?.toFixed(4)}`;

  console.groupCollapsed(`[FraudLens] Score distribution — ${scored.length} records`);
  console.log('Buckets:\n' + lines.join('\n'));
  console.log('Top 5:\n'    + top5.map(fmt).join('\n'));
  console.log('Bottom 5:\n' + bottom5.map(fmt).join('\n'));
  console.groupEnd();
}

// ── Public API ────────────────────────────────────────────────────────────────

export function processData({
  housingViolations,
  restaurantInspections,
  constructionViolations,
  serviceRequests311,
  permitIssuance,
  propertyValuation,
  fireIncidents,
  ecbViolations      = [],
  oathHearings       = [],
  rodentInspections  = [],
  activeBusinesses   = [],  // eslint-disable-line no-unused-vars
  dcaComplaints      = [],  // eslint-disable-line no-unused-vars
}) {
  const records = [
    ...mapHousing(housingViolations),
    ...mapRestaurant(restaurantInspections),
    ...mapConstruction(constructionViolations),
    ...mapService311(serviceRequests311),
    ...mapPermit(permitIssuance),
    ...mapProperty(propertyValuation),
    ...mapFire(fireIncidents),
  ];

  const grid            = buildGrid(records);
  const ecbSet          = buildEcbSet(ecbViolations);
  const oathSet         = buildOathSet(oathHearings);
  const rodentFailedSet = buildRodentFailedSet(rodentInspections);

  const scored = scoreRecords(records, grid, ecbSet, oathSet, rodentFailedSet);

  logDistribution(scored);
  return scored;
}
