// scripts/migrate-species.test.js
// Smoke tests for the species data migration output CSVs.
// Tests run against data/species.csv and data/records.csv after migrate-species.js executes.
// In Wave 0 (Plan 01), these tests are intentionally RED — migrate-species.js does not yet exist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { validateCsv } from '../scripts/build-data.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// 1. Missing dump exits non-zero (unit test — runs immediately, no output files needed)
test('migrate-species: missing dump file exits non-zero', () => {
  let threw = false;
  try {
    execSync('DUMP_PATH=/nonexistent/file.sql node scripts/migrate-species.js', {
      cwd: ROOT,
      stdio: 'pipe',
      timeout: 10000,
    });
  } catch (_err) {
    threw = true;
  }
  assert.ok(threw, 'migrate-species.js should exit non-zero when dump file is absent');
});

// 2. Integration: run migration, then check species.csv row count.
// If the dump file is unavailable (neither DUMP_PATH env nor the default path exists),
// skip the re-run and validate whatever data/species.csv is already on disk.
const DEFAULT_DUMP_PATH = '/Users/rainhead/dev/pnwinsects-app/pnwmoths_https/root/pnwmoths-mysqldump--20210201-123033.sql';
const dumpAvailable = existsSync(process.env.DUMP_PATH ?? DEFAULT_DUMP_PATH);
test('migrate-species: species.csv has ≥ 1,300 rows', { timeout: 120000 }, () => {
  if (dumpAvailable) {
    execSync('node scripts/migrate-species.js', { cwd: ROOT, stdio: 'pipe', timeout: 120000 });
  }
  const raw = readFileSync(resolve(ROOT, 'data/species.csv'));
  const rows = parse(raw, { columns: true, skip_empty_lines: true });
  assert.ok(rows.length >= 1300, `Expected ≥1300 species rows, got ${rows.length}`);
});

// 3. species.csv has all required columns (uses validateCsv from build-data.js)
test('migrate-species: species.csv has required columns', () => {
  validateCsv(resolve(ROOT, 'data/species.csv'), [
    'id', 'genus', 'species', 'common_name', 'noc_id', 'authority',
    'family', 'similar_species', 'subfamily',
  ]);
});

// 4. records.csv has ≥ 3,000 rows (assumes migration already ran from test 2)
test('migrate-species: records.csv has ≥ 3,000 rows', () => {
  const raw = readFileSync(resolve(ROOT, 'data/records.csv'));
  const rows = parse(raw, { columns: true, skip_empty_lines: true });
  assert.ok(rows.length >= 3000, `Expected ≥3000 record rows, got ${rows.length}`);
});

// 5. records.csv has all required columns
test('migrate-species: records.csv has required columns', () => {
  validateCsv(resolve(ROOT, 'data/records.csv'), [
    'species_slug', 'record_type', 'latitude', 'longitude', 'state', 'county',
    'locality', 'elevation_ft', 'year', 'month', 'day', 'collector', 'collection', 'notes',
  ]);
});

// 6. No non-PNW state codes in records.csv
test('migrate-species: records.csv has no non-PNW state codes', () => {
  const raw = readFileSync(resolve(ROOT, 'data/records.csv'));
  const rows = parse(raw, { columns: true, skip_empty_lines: true });
  const PNW_STATES = new Set(['WA', 'OR', 'ID', 'BC', 'AB', 'MT']);
  const badStates = [...new Set(rows.map(r => r.state).filter(s => s && !PNW_STATES.has(s)))];
  assert.deepStrictEqual(badStates, [], `Non-PNW states found: ${badStates.join(', ')}`);
});

// 7. No blank latitude or longitude in records.csv
test('migrate-species: records.csv has no blank lat/lon', () => {
  const raw = readFileSync(resolve(ROOT, 'data/records.csv'));
  const rows = parse(raw, { columns: true, skip_empty_lines: true });
  const blanks = rows.filter(r => !r.latitude || !r.longitude);
  assert.strictEqual(blanks.length, 0, `${blanks.length} records have blank lat or lon`);
});
