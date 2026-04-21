import Papa from 'papaparse';

const DATA_FILES = {
  // ── Original 7 ──────────────────────────────────────────────────────────
  housingViolations:      '/data/housing_violations.csv',
  restaurantInspections:  '/data/restaurant_inspections.csv',
  constructionViolations: '/data/construction_violations.csv',
  serviceRequests311:     '/data/service_requests_311.csv',
  permitIssuance:         '/data/permit_issuance.csv',
  propertyValuation:      '/data/property_valuation.csv',
  fireIncidents:          '/data/fire_incidents.csv',
  // ── 5 new commercial / enforcement datasets ──────────────────────────────
  ecbViolations:          '/data/ecb_violations.csv',
  oathHearings:           '/data/oath_hearings.csv',
  rodentInspections:      '/data/rodent_inspections.csv',
  activeBusinesses:       '/data/active_businesses.csv',
  dcaComplaints:          '/data/dca_complaints.csv',
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
