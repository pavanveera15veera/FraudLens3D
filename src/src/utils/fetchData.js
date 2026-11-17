import Papa from 'papaparse';

// Served from the app's own base path, so the build works at a subpath
// (e.g. /FraudLens3D/) as well as at the domain root.
const BASE = process.env.PUBLIC_URL || '';

const DATA_FILES = {
  // ── Original 7 ──────────────────────────────────────────────────────────
  housingViolations:      BASE + '/data/housing_violations.csv',
  restaurantInspections:  BASE + '/data/restaurant_inspections.csv',
  constructionViolations: BASE + '/data/construction_violations.csv',
  serviceRequests311:     BASE + '/data/service_requests_311.csv',
  permitIssuance:         BASE + '/data/permit_issuance.csv',
  propertyValuation:      BASE + '/data/property_valuation.csv',
  fireIncidents:          BASE + '/data/fire_incidents.csv',
  // ── 5 new commercial / enforcement datasets ──────────────────────────────
  ecbViolations:          BASE + '/data/ecb_violations.csv',
  oathHearings:           BASE + '/data/oath_hearings.csv',
  rodentInspections:      BASE + '/data/rodent_inspections.csv',
  activeBusinesses:       BASE + '/data/active_businesses.csv',
  dcaComplaints:          BASE + '/data/dca_complaints.csv',
};

function parseCSV(url) {
  return new Promise((resolve, reject) => {
    Papa.parse(url, {
      download:      true,
      header:        true,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data),
      error:    (err)     => reject(new Error(`Failed to parse ${url}: ${err.message}`)),
    });
  });
}

export async function fetchAllData() {
  const entries = Object.entries(DATA_FILES);
  // Fetch all in parallel; on individual failure return [] so the app still runs
  const results = await Promise.all(
    entries.map(([, url]) => parseCSV(url).catch(() => []))
  );
  return Object.fromEntries(entries.map(([key], i) => [key, results[i]]));
}

export async function fetchDataset(key) {
  const url = DATA_FILES[key];
  if (!url) throw new Error(`Unknown key: "${key}". Valid: ${Object.keys(DATA_FILES).join(', ')}`);
  return parseCSV(url);
}
