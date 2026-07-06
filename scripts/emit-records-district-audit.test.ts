// scripts/emit-records-district-audit.test.ts
// RED contract test for scripts/emit-records-district-audit.ts (Wave 0 —
// Phase 47 Plan 01). Pins the exact exported function signatures, Tier
// literals, and CSV column contract the Wave 2 (47-04) implementation must
// satisfy. This file is INTENTIONALLY RED until scripts/emit-records-
// district-audit.ts exists — the import below will fail module resolution.
//
// Mirrors scripts/emit-species-audit.test.ts's structure: plain node:test
// test() blocks (not describe), no I/O — all fixtures passed directly into
// pure exported functions.
//
// Run via: node --test scripts/emit-records-district-audit.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'csv-parse/sync';

import {
  assignTier,
  findCoverageGaps,
  findContentDrift,
  buildRecordsDistrictAuditRows,
  toCsv,
  buildSummary,
  AUDIT_HEADER,
  type Tier,
  type RecordsCsvRow,
} from './emit-records-district-audit.ts';

// ---------------------------------------------------------------------------
// assignTier — tier classification (QC-02, D-02, D-03, D-08)
// ---------------------------------------------------------------------------

interface AssignTierInput {
  derivedDistrictId: string | null;
  statedDistrictId: string | null;
  statedCounty: string;
  derivedDistrictName: string | null;
  adjacency: Set<string>;
}

function tierInput(overrides: Partial<AssignTierInput>): AssignTierInput {
  return {
    derivedDistrictId: 'US:53053',
    statedDistrictId: 'US:53053',
    statedCounty: 'Pierce',
    derivedDistrictName: 'Pierce',
    adjacency: new Set<string>(),
    ...overrides,
  };
}

test('assignTier: (a) derivedDistrictId null -> outside-all-boundaries regardless of stated side (D-08, QC-03)', () => {
  const tier = assignTier(
    tierInput({
      derivedDistrictId: null,
      statedDistrictId: 'US:53053',
      statedCounty: 'Pierce',
      derivedDistrictName: null,
    }),
  );
  assert.equal(tier, 'outside-all-boundaries');
});

test('assignTier: (a) derivedDistrictId null -> outside-all-boundaries even with no stated assertion at all', () => {
  const tier = assignTier(
    tierInput({
      derivedDistrictId: null,
      statedDistrictId: null,
      statedCounty: '',
      derivedDistrictName: null,
    }),
  );
  assert.equal(tier, 'outside-all-boundaries');
});

test('assignTier: (b) blank statedCounty with a non-null derived id -> same (D-03, never a mismatch)', () => {
  const tier = assignTier(
    tierInput({
      derivedDistrictId: 'US:53053',
      statedDistrictId: null,
      statedCounty: '',
      derivedDistrictName: 'Pierce',
    }),
  );
  assert.equal(tier, 'same');
});

test('assignTier: (b) blank (whitespace-only) statedCounty -> same (D-03)', () => {
  const tier = assignTier(
    tierInput({
      derivedDistrictId: 'US:53053',
      statedDistrictId: null,
      statedCounty: '   ',
      derivedDistrictName: 'Pierce',
    }),
  );
  assert.equal(tier, 'same');
});

test('assignTier: (c) statedDistrictId equal to derivedDistrictId -> same', () => {
  const tier = assignTier(
    tierInput({
      derivedDistrictId: 'US:53053',
      statedDistrictId: 'US:53053',
      statedCounty: 'Pierce',
    }),
  );
  assert.equal(tier, 'same');
});

test('assignTier: (d) differing stated/derived ids whose sorted a|b pair IS in adjacency -> adjacent-and-close', () => {
  const derivedDistrictId = 'US:53053';
  const statedDistrictId = 'US:53007';
  const [a, b] = [statedDistrictId, derivedDistrictId].sort();
  const tier = assignTier(
    tierInput({
      derivedDistrictId,
      statedDistrictId,
      statedCounty: 'Some County',
      adjacency: new Set([`${a}|${b}`]),
    }),
  );
  assert.equal(tier, 'adjacent-and-close');
});

test('assignTier: (e) differing ids NOT in adjacency -> far-mismatch', () => {
  const tier = assignTier(
    tierInput({
      derivedDistrictId: 'US:53053',
      statedDistrictId: 'US:53001',
      statedCounty: 'Adams',
      adjacency: new Set<string>(),
    }),
  );
  assert.equal(tier, 'far-mismatch');
});

test('assignTier: (f) D-02 name-fallback — statedDistrictId null, non-empty statedCounty, derivedDistrictName equal (case/space insensitive) -> same', () => {
  const tier = assignTier(
    tierInput({
      derivedDistrictId: 'CA:5917',
      statedDistrictId: null,
      statedCounty: '  capital  ',
      derivedDistrictName: 'Capital',
    }),
  );
  assert.equal(tier, 'same');
});

test('assignTier: (g) D-02 name-fallback with differing names -> far-mismatch (conservative Pitfall-3 default)', () => {
  const tier = assignTier(
    tierInput({
      derivedDistrictId: 'CA:5917',
      statedDistrictId: null,
      statedCounty: 'Skeena-Queen Charlotte',
      derivedDistrictName: 'North Coast',
    }),
  );
  assert.equal(tier, 'far-mismatch');
});

test('assignTier: never throws across a battery of edge-case input combinations (only coverage gaps hard-fail — QC-01)', () => {
  const battery: AssignTierInput[] = [
    tierInput({ derivedDistrictId: null, statedDistrictId: null, statedCounty: '', derivedDistrictName: null }),
    tierInput({ derivedDistrictId: 'US:1', statedDistrictId: 'US:1', statedCounty: '' }),
    tierInput({ derivedDistrictId: 'US:1', statedDistrictId: null, statedCounty: 'Nowhere', derivedDistrictName: null }),
    tierInput({ derivedDistrictId: 'US:1', statedDistrictId: 'US:2', statedCounty: 'Foo', adjacency: new Set(['US:1|US:2']) }),
    tierInput({ derivedDistrictId: 'CA:1', statedDistrictId: null, statedCounty: '', derivedDistrictName: '' }),
  ];
  for (const input of battery) {
    assert.doesNotThrow(() => assignTier(input));
  }
});

// ---------------------------------------------------------------------------
// findCoverageGaps — D-07 build gate
// ---------------------------------------------------------------------------

test('findCoverageGaps: a Set missing index 3 out of the 0..4 range yields missingIndexes containing 3', () => {
  const artifactRowIndexes = new Set([0, 1, 2, 4]);
  const result = findCoverageGaps(5, artifactRowIndexes);
  assert.equal(result.recordsCount, 5);
  assert.equal(result.artifactCount, 4);
  assert.deepEqual(result.missingIndexes, [3]);
});

test('findCoverageGaps: artifactCount less than recordsCount yields a non-empty missingIndexes', () => {
  const artifactRowIndexes = new Set([0, 1]);
  const result = findCoverageGaps(10, artifactRowIndexes);
  assert.equal(result.artifactCount, 2);
  assert.ok(result.missingIndexes.length > 0);
});

test('findCoverageGaps: exact 0..N-1 coverage yields an empty missingIndexes', () => {
  const artifactRowIndexes = new Set([0, 1, 2, 3, 4]);
  const result = findCoverageGaps(5, artifactRowIndexes);
  assert.deepEqual(result.missingIndexes, []);
  assert.equal(result.recordsCount, result.artifactCount);
});

// ---------------------------------------------------------------------------
// findContentDrift — CR-01 hardening of D-07: presence isn't identity
// ---------------------------------------------------------------------------

function contentRow(overrides: Partial<RecordsCsvRow>): RecordsCsvRow {
  return {
    row_index: 0,
    species_slug: 'agrotis-vancouverensis',
    latitude: '49.1',
    longitude: '-116.45',
    state: 'BC',
    county: 'Central Kootenay',
    ...overrides,
  };
}

test('findContentDrift: aligned records.csv and artifact rows at every shared row_index -> no drift', () => {
  const recordsRows = [
    contentRow({ row_index: 0 }),
    contentRow({ row_index: 1, species_slug: 'aseptis-binotata', latitude: '47.2529', longitude: '-122.4443', state: 'WA', county: 'Pierce' }),
  ];
  const derivedRows = [
    contentRow({ row_index: 0 }),
    contentRow({ row_index: 1, species_slug: 'aseptis-binotata', latitude: '47.2529', longitude: '-122.4443', state: 'WA', county: 'Pierce' }),
  ];
  const drift = findContentDrift(recordsRows, derivedRows);
  assert.deepEqual(drift, []);
});

test('findContentDrift: latitude/longitude formatting differences (same numeric value) do NOT count as drift', () => {
  const recordsRows = [contentRow({ row_index: 0, latitude: '49.10', longitude: '-116.450' })];
  const derivedRows = [contentRow({ row_index: 0, latitude: '49.1', longitude: '-116.45' })];
  const drift = findContentDrift(recordsRows, derivedRows);
  assert.deepEqual(drift, []);
});

test('findContentDrift: a species_slug divergence at a shared row_index is reported, naming the row_index and field', () => {
  const recordsRows = [contentRow({ row_index: 5, species_slug: 'aseptis-binotata' })];
  const derivedRows = [contentRow({ row_index: 5, species_slug: 'some-other-species' })];
  const drift = findContentDrift(recordsRows, derivedRows);
  assert.equal(drift.length, 1);
  assert.equal(drift[0]?.rowIndex, 5);
  assert.equal(drift[0]?.field, 'species_slug');
  assert.equal(drift[0]?.recordsValue, 'aseptis-binotata');
  assert.equal(drift[0]?.derivedValue, 'some-other-species');
});

test('findContentDrift: a latitude divergence (genuinely different coordinate) at a shared row_index is reported', () => {
  const recordsRows = [contentRow({ row_index: 2, latitude: '49.1' })];
  const derivedRows = [contentRow({ row_index: 2, latitude: '50.2' })];
  const drift = findContentDrift(recordsRows, derivedRows);
  assert.equal(drift.length, 1);
  assert.equal(drift[0]?.rowIndex, 2);
  assert.equal(drift[0]?.field, 'latitude');
});

test('findContentDrift: state and county divergences at a shared row_index are both reported', () => {
  const recordsRows = [contentRow({ row_index: 3, state: 'WA', county: 'Pierce' })];
  const derivedRows = [contentRow({ row_index: 3, state: 'OR', county: 'Multnomah' })];
  const drift = findContentDrift(recordsRows, derivedRows);
  const fields = drift.map((d) => d.field).sort();
  assert.deepEqual(fields, ['county', 'state']);
});

test('findContentDrift: a records.csv row absent from the artifact is skipped (findCoverageGaps\' concern, not this function\'s)', () => {
  const recordsRows = [contentRow({ row_index: 0 }), contentRow({ row_index: 1, species_slug: 'no-derived-row' })];
  const derivedRows = [contentRow({ row_index: 0 })];
  const drift = findContentDrift(recordsRows, derivedRows);
  assert.deepEqual(drift, []);
});

// ---------------------------------------------------------------------------
// toCsv — serialization: severity sort, summary preamble, RFC-4180 quoting
// ---------------------------------------------------------------------------

interface AuditRowFixture {
  row_index: string;
  species_slug: string;
  latitude: string;
  longitude: string;
  state: string;
  county: string;
  stated_district_id: string;
  stated_district_name: string;
  derived_district_id: string;
  derived_district_name: string;
  derived_outcome: string;
  tier: Tier;
  stated_resolution_method: string;
  distance_km: string;
}

function auditRow(overrides: Partial<AuditRowFixture>): AuditRowFixture {
  return {
    row_index: '0',
    species_slug: 'aseptis-binotata',
    latitude: '47.2529',
    longitude: '-122.4443',
    state: 'WA',
    county: 'Pierce',
    stated_district_id: 'US:53053',
    stated_district_name: 'Pierce',
    derived_district_id: 'US:53053',
    derived_district_name: 'Pierce',
    derived_outcome: 'assigned-contained',
    tier: 'same',
    stated_resolution_method: 'crosswalk',
    distance_km: '',
    ...overrides,
  };
}

test('toCsv: a species_slug/county containing a comma is quoted (RFC-4180)', () => {
  const csv = toCsv([
    auditRow({ county: 'Big, County', tier: 'same' }),
  ]);
  const lines = csv.trimEnd().split('\n');
  const dataLine = lines.find((l) => l.includes('Big'));
  assert.ok(dataLine, 'expected a data line containing the comma-bearing county');
  assert.match(dataLine as string, /"Big, County"/);
});

test('toCsv: a field containing a double-quote is quoted and the quote doubled (RFC-4180)', () => {
  const csv = toCsv([
    auditRow({ derived_district_name: 'The "Great" District', tier: 'same' }),
  ]);
  const lines = csv.trimEnd().split('\n');
  const dataLine = lines.find((l) => l.includes('Great'));
  assert.ok(dataLine, 'expected a data line containing the quoted district name');
  assert.match(dataLine as string, /"The ""Great"" District"/);
});

test('toCsv: output is pure RFC-4180 CSV — AUDIT_HEADER is the first line, no hash-prefixed preamble anywhere', () => {
  const rows = [
    auditRow({ row_index: '0', tier: 'same' }),
    auditRow({ row_index: '1', tier: 'far-mismatch' }),
    auditRow({ row_index: '2', tier: 'adjacent-and-close' }),
    auditRow({ row_index: '3', tier: 'outside-all-boundaries' }),
  ];
  const csv = toCsv(rows);
  const lines = csv.trimEnd().split('\n');

  assert.equal(lines[0], AUDIT_HEADER, 'first line must be AUDIT_HEADER, no preamble above it');
  assert.ok(
    !lines.some((l) => l.startsWith('#')),
    'no line anywhere in the CSV output may start with # (must be parseable by standard CSV readers)',
  );
});

test('toCsv: parses cleanly as single-header-row CSV — every data row has the same column count as the header', () => {
  const rows = [
    auditRow({ row_index: '0', tier: 'same' }),
    auditRow({ row_index: '1', tier: 'far-mismatch', county: 'Big, County' }),
  ];
  const csv = toCsv(rows);
  const lines = csv.trimEnd().split('\n');

  assert.equal(lines[0], AUDIT_HEADER);
  const headerColumnCount = AUDIT_HEADER.split(',').length;

  const parsed = parse(csv, { columns: true, skip_empty_lines: true }) as Record<string, string>[];
  assert.equal(parsed.length, rows.length, 'parser must recover exactly one record per data row');
  for (const record of parsed) {
    assert.equal(
      Object.keys(record).length,
      headerColumnCount,
      'every parsed record must have the same column count as the header',
    );
  }
});

test('toCsv: rows below the header are sorted by severity (far-mismatch, adjacent-and-close, outside-all-boundaries, same)', () => {
  const rows = [
    auditRow({ row_index: '0', tier: 'same' }),
    auditRow({ row_index: '1', tier: 'outside-all-boundaries' }),
    auditRow({ row_index: '2', tier: 'far-mismatch' }),
    auditRow({ row_index: '3', tier: 'adjacent-and-close' }),
  ];
  const csv = toCsv(rows);
  const lines = csv.trimEnd().split('\n');
  const headerIndex = lines.indexOf(AUDIT_HEADER);
  const dataLines = lines.slice(headerIndex + 1);

  const tierColumnIndex = AUDIT_HEADER.split(',').indexOf('tier');
  assert.ok(tierColumnIndex >= 0, 'AUDIT_HEADER must contain a tier column');

  const observedTiers = dataLines.map((line) => line.split(',')[tierColumnIndex]);
  assert.deepEqual(observedTiers, [
    'far-mismatch',
    'adjacent-and-close',
    'outside-all-boundaries',
    'same',
  ]);
});

test('toCsv: AUDIT_HEADER is a fixed, known column order', () => {
  assert.equal(
    AUDIT_HEADER,
    'row_index,species_slug,latitude,longitude,state,county,stated_district_id,stated_district_name,derived_district_id,derived_district_name,derived_outcome,tier,stated_resolution_method,distance_km',
  );
});

// ---------------------------------------------------------------------------
// buildRecordsDistrictAuditRows — row_index join, stated_resolution_method
// ---------------------------------------------------------------------------

test('buildRecordsDistrictAuditRows: joins the derived side by row_index (never by content) and carries stated_resolution_method', () => {
  const recordsRows = [
    { row_index: 0, species_slug: 'agrotis-vancouverensis', latitude: '49.1', longitude: '-116.45', state: 'BC', county: 'Central Kootenay' },
    { row_index: 1, species_slug: 'agrotis-vancouverensis', latitude: '49.1', longitude: '-116.45', state: 'BC', county: 'Central Kootenay' },
    { row_index: 2, species_slug: 'aseptis-binotata', latitude: '47.2529', longitude: '-122.4443', state: 'WA', county: '' },
  ];

  const derivedRows = [
    { row_index: 0, outcome: 'assigned-contained', district_id: 'CA:5915', distance_km: '' },
    { row_index: 1, outcome: 'assigned-fallback', district_id: 'CA:5915', distance_km: '1.200' },
    { row_index: 2, outcome: 'assigned-contained', district_id: 'US:53053', distance_km: '' },
  ];

  // Deliberately duplicate content across row_index 0 and 1 to prove the
  // join is positional/row_index-keyed, not content-keyed (RESEARCH.md
  // Pattern 3 — the empirically-duplicated (species_slug, lat, lon, state,
  // county) key must not cause cross-attribution).
  const crosswalk = new Map<string, string>([['BC|Central Kootenay', 'CA:5915']]);
  const nameById = new Map<string, string>([
    ['CA:5915', 'Central Kootenay'],
    ['US:53053', 'Pierce'],
  ]);
  const adjacency = new Set<string>();

  const rows = buildRecordsDistrictAuditRows({
    recordsRows,
    derivedRows,
    crosswalk,
    nameById,
    adjacency,
  });

  assert.equal(rows.length, 3);
  assert.equal(rows.find((r) => r.row_index === '1')?.stated_resolution_method, 'crosswalk');
  assert.equal(rows.find((r) => r.row_index === '1')?.derived_district_id, 'CA:5915');
  assert.equal(rows.find((r) => r.row_index === '2')?.stated_resolution_method, 'none');
});

test('buildRecordsDistrictAuditRows: stated_resolution_method is name-fallback when the crosswalk has no entry for (state, county)', () => {
  const recordsRows = [
    { row_index: 0, species_slug: 'foo-bar', latitude: '48.4284', longitude: '-123.3656', state: 'BC', county: 'Capital' },
  ];
  const derivedRows = [
    { row_index: 0, outcome: 'assigned-contained', district_id: 'CA:5917', distance_km: '' },
  ];
  const crosswalk = new Map<string, string>(); // no entry for BC|Capital
  const nameById = new Map<string, string>([['CA:5917', 'Capital']]);
  const adjacency = new Set<string>();

  const rows = buildRecordsDistrictAuditRows({
    recordsRows,
    derivedRows,
    crosswalk,
    nameById,
    adjacency,
  });

  assert.equal(rows[0]?.stated_resolution_method, 'name-fallback');
  assert.equal(rows[0]?.tier, 'same');
});

// ---------------------------------------------------------------------------
// buildSummary — per-tier counts + total (D-06 summary, now a JSON sidecar)
// ---------------------------------------------------------------------------

test('buildSummary: tallies per-tier counts and a total that equals the sum of tiers', () => {
  const rows = [
    auditRow({ row_index: '0', tier: 'same' }),
    auditRow({ row_index: '1', tier: 'same' }),
    auditRow({ row_index: '2', tier: 'far-mismatch' }),
    auditRow({ row_index: '3', tier: 'adjacent-and-close' }),
    auditRow({ row_index: '4', tier: 'outside-all-boundaries' }),
    auditRow({ row_index: '5', tier: 'outside-all-boundaries' }),
  ];
  const summary = buildSummary(rows);

  assert.equal(summary.same, 2);
  assert.equal(summary['far-mismatch'], 1);
  assert.equal(summary['adjacent-and-close'], 1);
  assert.equal(summary['outside-all-boundaries'], 2);
  assert.equal(summary.total, rows.length);
  assert.equal(
    summary.same + summary['far-mismatch'] + summary['adjacent-and-close'] + summary['outside-all-boundaries'],
    summary.total,
  );
});

test('buildSummary: an empty row set yields all-zero counts and a zero total', () => {
  const summary = buildSummary([]);
  assert.deepEqual(summary, {
    'far-mismatch': 0,
    'adjacent-and-close': 0,
    'outside-all-boundaries': 0,
    same: 0,
    total: 0,
  });
});
