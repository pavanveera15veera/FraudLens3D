import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Papa from 'papaparse';
import { processData } from './processData.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR  = path.resolve(__dirname, '../../../data');

// ── Read a CSV from disk and parse it synchronously ──────────────────────────

function readCSV(filename) {
  const full    = path.join(DATA_DIR, filename);
  const content = fs.readFileSync(full, 'utf8');
  const { data } = Papa.parse(content, { header: true, skipEmptyLines: true });
  return data;
}

// ── Load all datasets ────────────────────────────────────────────────────────

console.log('Loading CSVs…');
const raw = {
  housingViolations:      readCSV('housing_violations.csv'),
  restaurantInspections:  readCSV('restaurant_inspections.csv'),
  constructionViolations: readCSV('construction_violations.csv'),
  serviceRequests311:     readCSV('service_requests_311.csv'),
  permitIssuance:         readCSV('permit_issuance.csv'),
  propertyValuation:      readCSV('property_valuation.csv'),
  fireIncidents:          readCSV('fire_incidents.csv'),
};

const counts = Object.entries(raw).map(([k, v]) => `  ${k}: ${v.length}`).join('\n');
console.log(`Rows loaded:\n${counts}\n`);

// ── Score ────────────────────────────────────────────────────────────────────

console.log('Scoring…');
const scored = processData(raw);
console.log(`Total scored records: ${scored.length}\n`);

// ── 1. Bucket distribution ───────────────────────────────────────────────────

const buckets = Array(10).fill(0);
for (const r of scored) {
  const idx = Math.min(9, Math.floor(r.score * 10));
  buckets[idx]++;
}

console.log('── Score distribution (0.1 buckets) ──────────────────────────');
buckets.forEach((n, i) => {
  const lo  = (i * 0.1).toFixed(1);
  const hi  = (i * 0.1 + 0.1).toFixed(1);
  const pct = ((n / scored.length) * 100).toFixed(1);
  const bar = '█'.repeat(Math.round(n / scored.length * 50));
  console.log(`  ${lo}–${hi}  ${String(n).padStart(6)}  (${String(pct).padStart(5)}%)  ${bar}`);
});

// ── 2. Top 10 highest scoring ────────────────────────────────────────────────

const sorted = [...scored].sort((a, b) => b.score - a.score);

console.log('\n── Top 10 highest scoring records ────────────────────────────');
sorted.slice(0, 10).forEach((r, i) => {
  console.log(
    `  #${String(i + 1).padStart(2)}  score=${r.score.toFixed(2)}` +
    `  f1=${r.factor1.toFixed(2)} f2=${r.factor2.toFixed(2)} f3=${r.factor3.toFixed(2)}` +
    `  type=${r.type.padEnd(12)}  borough=${String(r.borough).padEnd(13)}` +
    `  lat=${r.lat.toFixed(5)}  lon=${r.lon.toFixed(5)}`
  );
});

// ── 3. Bottom 10 lowest scoring ──────────────────────────────────────────────

console.log('\n── Bottom 10 lowest scoring records ──────────────────────────');
sorted.slice(-10).reverse().forEach((r, i) => {
  console.log(
    `  #${String(i + 1).padStart(2)}  score=${r.score.toFixed(2)}` +
    `  f1=${r.factor1.toFixed(2)} f2=${r.factor2.toFixed(2)} f3=${r.factor3.toFixed(2)}` +
    `  type=${r.type.padEnd(12)}  borough=${String(r.borough).padEnd(13)}` +
    `  lat=${r.lat.toFixed(5)}  lon=${r.lon.toFixed(5)}`
  );
});

console.log('');
