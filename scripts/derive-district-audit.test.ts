// scripts/derive-district-audit.test.ts
// RED contract test for scripts/derive-district-audit.ts (Wave 0 — Phase 47
// Plan 01). Pins classifyRecordsForDerivation / buildDerivedDistrictRows /
// DerivedOutcome + the full-coverage invariant (D-05) the Wave 1 (47-02)
// implementation must satisfy. This file is INTENTIONALLY RED until
// scripts/derive-district-audit.ts exists — the import below will fail
// module resolution.
//
// Mirrors scripts/fill-district-from-coords.test.ts's structure: makeRecordRow
// fixture, pure classify/build unit tests, and a real+synthetic dual-fixture
// describe block for resolveByCoordinates reuse.
//
// Run via: node --test scripts/derive-district-audit.test.ts
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  classifyRecordsForDerivation,
  buildDerivedDistrictRows,
  DERIVED_COLUMNS,
  type DerivedOutcome,
} from './derive-district-audit.ts';
import { resolveByCoordinates, type RecordCsvRow } from './fill-district-from-coords.ts';

// ---------------------------------------------------------------------------
// Fixtures — copied verbatim from fill-district-from-coords.test.ts's
// makeRecordRow (default district_id empty, WA/Tacoma coords).
// ---------------------------------------------------------------------------

function makeRecordRow(overrides: Partial<RecordCsvRow>): RecordCsvRow {
  return {
    species_slug: 'genus-species',
    record_type: 'specimen',
    latitude: '47.2529',
    longitude: '-122.4443',
    state: 'WA',
    county: '',
    locality: 'Foo Creek',
    elevation_ft: '',
    year: '1998',
    month: '6',
    day: '15',
    collector: 'J. Smith',
    collection: 'WSU',
    notes: '',
    district_id: '',
    ...overrides,
  };
}

const SIX_OUTCOMES: DerivedOutcome[] = [
  'assigned-contained',
  'assigned-fallback',
  'unassigned',
  'out-of-bounds',
  'axis-order-suspect',
  'no-coords',
];

// ---------------------------------------------------------------------------
// classifyRecordsForDerivation — full-coverage classification (D-05)
// ---------------------------------------------------------------------------

describe('classifyRecordsForDerivation', () => {
  it('(a) a row with blank latitude/longitude lands in preClassified with outcome no-coords and NOT in candidates', () => {
    const rows = [makeRecordRow({ latitude: '', longitude: '' })];
    const { candidates, preClassified } = classifyRecordsForDerivation(rows);
    assert.equal(candidates.length, 0);
    assert.equal(preClassified.get(0)?.outcome, 'no-coords');
  });

  it('(a) a row with unparseable latitude/longitude lands in preClassified with outcome no-coords and NOT in candidates', () => {
    const rows = [makeRecordRow({ latitude: 'not-a-number', longitude: 'also-not' })];
    const { candidates, preClassified } = classifyRecordsForDerivation(rows);
    assert.equal(candidates.length, 0);
    assert.equal(preClassified.get(0)?.outcome, 'no-coords');
  });

  it('(b) a row whose parsed pair trips classifyCoordinate (axis-order-suspect) lands in preClassified with that outcome and NOT in candidates', () => {
    // Asotin Co., WA known-swapped pattern: latitude implausible-as-lat but
    // plausible-as-lon, longitude plausible-as-lat.
    const rows = [makeRecordRow({ latitude: '-117.047', longitude: '46.339' })];
    const { candidates, preClassified } = classifyRecordsForDerivation(rows);
    assert.equal(candidates.length, 0);
    assert.equal(preClassified.get(0)?.outcome, 'axis-order-suspect');
  });

  it('(b) a row whose parsed pair trips classifyCoordinate (out-of-bounds) lands in preClassified with that outcome and NOT in candidates', () => {
    const rows = [makeRecordRow({ latitude: '10.0', longitude: '10.0' })]; // nowhere near PNW_BOUNDS
    const { candidates, preClassified } = classifyRecordsForDerivation(rows);
    assert.equal(candidates.length, 0);
    assert.equal(preClassified.get(0)?.outcome, 'out-of-bounds');
  });

  it('(c) an in-bounds row appears in candidates with its numeric lat/lon and NOT in preClassified', () => {
    const rows = [makeRecordRow({ latitude: '47.2529', longitude: '-122.4443' })]; // Tacoma
    const { candidates, preClassified } = classifyRecordsForDerivation(rows);
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0]?.index, 0);
    assert.equal(candidates[0]?.lat, 47.2529);
    assert.equal(candidates[0]?.lon, -122.4443);
    assert.equal(preClassified.has(0), false);
  });

  it('D-05: candidates.length plus preClassified.size equals rows.length for a mixed fixture (full coverage by construction)', () => {
    const rows = [
      makeRecordRow({ latitude: '', longitude: '' }), // no-coords
      makeRecordRow({ latitude: '-117.047', longitude: '46.339' }), // axis-order-suspect
      makeRecordRow({ latitude: '10.0', longitude: '10.0' }), // out-of-bounds
      makeRecordRow({ latitude: '47.2529', longitude: '-122.4443' }), // in-bounds candidate
      makeRecordRow({ latitude: '48.4284', longitude: '-123.3656' }), // in-bounds candidate
    ];
    const { candidates, preClassified } = classifyRecordsForDerivation(rows);
    assert.equal(candidates.length + preClassified.size, rows.length);
  });
});

// ---------------------------------------------------------------------------
// buildDerivedDistrictRows — one row per input row, six-literal outcome union
// ---------------------------------------------------------------------------

describe('buildDerivedDistrictRows', () => {
  it('emits one output row per input row (length equals rows.length)', () => {
    const rows = [
      makeRecordRow({ latitude: '', longitude: '' }),
      makeRecordRow({ latitude: '47.2529', longitude: '-122.4443' }),
      makeRecordRow({ latitude: '10.0', longitude: '10.0' }),
    ];
    const resolutions = new Map([
      [0, { outcome: 'no-coords' as DerivedOutcome, districtId: null, distanceKm: null }],
      [1, { outcome: 'assigned-contained' as DerivedOutcome, districtId: 'US:53053', distanceKm: null }],
      [2, { outcome: 'out-of-bounds' as DerivedOutcome, districtId: null, distanceKm: null }],
    ]);
    const derivedRows = buildDerivedDistrictRows(rows, resolutions);
    assert.equal(derivedRows.length, rows.length);
  });

  it('row_index equals its 0-based position as a string', () => {
    const rows = [
      makeRecordRow({}),
      makeRecordRow({}),
      makeRecordRow({}),
    ];
    const resolutions = new Map([
      [0, { outcome: 'assigned-contained' as DerivedOutcome, districtId: 'US:53053', distanceKm: null }],
      [1, { outcome: 'assigned-contained' as DerivedOutcome, districtId: 'US:53053', distanceKm: null }],
      [2, { outcome: 'assigned-contained' as DerivedOutcome, districtId: 'US:53053', distanceKm: null }],
    ]);
    const derivedRows = buildDerivedDistrictRows(rows, resolutions);
    assert.deepEqual(derivedRows.map((r) => r.row_index), ['0', '1', '2']);
  });

  it('district_id is populated only for assigned-contained / assigned-fallback (blank otherwise)', () => {
    const rows = [makeRecordRow({}), makeRecordRow({}), makeRecordRow({}), makeRecordRow({})];
    const resolutions = new Map([
      [0, { outcome: 'assigned-contained' as DerivedOutcome, districtId: 'US:53053', distanceKm: null }],
      [1, { outcome: 'assigned-fallback' as DerivedOutcome, districtId: 'US:53053', distanceKm: 1.2 }],
      [2, { outcome: 'unassigned' as DerivedOutcome, districtId: null, distanceKm: null }],
      [3, { outcome: 'no-coords' as DerivedOutcome, districtId: null, distanceKm: null }],
    ]);
    const derivedRows = buildDerivedDistrictRows(rows, resolutions);
    assert.equal(derivedRows[0]?.district_id, 'US:53053');
    assert.equal(derivedRows[1]?.district_id, 'US:53053');
    assert.equal(derivedRows[2]?.district_id, '');
    assert.equal(derivedRows[3]?.district_id, '');
  });

  it('distance_km is populated only for assigned-fallback (blank otherwise)', () => {
    const rows = [makeRecordRow({}), makeRecordRow({})];
    const resolutions = new Map([
      [0, { outcome: 'assigned-contained' as DerivedOutcome, districtId: 'US:53053', distanceKm: null }],
      [1, { outcome: 'assigned-fallback' as DerivedOutcome, districtId: 'US:53053', distanceKm: 1.234 }],
    ]);
    const derivedRows = buildDerivedDistrictRows(rows, resolutions);
    assert.equal(derivedRows[0]?.distance_km, '');
    assert.notEqual(derivedRows[1]?.distance_km, '');
  });

  it('every emitted outcome is one of the six DerivedOutcome literals', () => {
    const rows = [
      makeRecordRow({}), makeRecordRow({}), makeRecordRow({}),
      makeRecordRow({}), makeRecordRow({}), makeRecordRow({}),
    ];
    const resolutions = new Map<number, { outcome: DerivedOutcome; districtId: string | null; distanceKm: number | null }>([
      [0, { outcome: 'assigned-contained', districtId: 'US:53053', distanceKm: null }],
      [1, { outcome: 'assigned-fallback', districtId: 'US:53053', distanceKm: 1.2 }],
      [2, { outcome: 'unassigned', districtId: null, distanceKm: null }],
      [3, { outcome: 'out-of-bounds', districtId: null, distanceKm: null }],
      [4, { outcome: 'axis-order-suspect', districtId: null, distanceKm: null }],
      [5, { outcome: 'no-coords', districtId: null, distanceKm: null }],
    ]);
    const derivedRows = buildDerivedDistrictRows(rows, resolutions);
    for (const row of derivedRows) {
      assert.ok(SIX_OUTCOMES.includes(row.outcome as DerivedOutcome), `unexpected outcome literal: ${row.outcome}`);
    }
    assert.deepEqual(derivedRows.map((r) => r.outcome), SIX_OUTCOMES);
  });

  it('DERIVED_COLUMNS matches the pinned full-coverage artifact column order', () => {
    assert.deepEqual(DERIVED_COLUMNS, [
      'row_index', 'species_slug', 'latitude', 'longitude', 'state', 'county',
      'outcome', 'district_id', 'distance_km', 'notes',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Real-GeoJSON reference-point sanity (mirrors fill-district-from-coords.test.ts)
// ---------------------------------------------------------------------------

const REAL_GEOJSON_PATH = new URL('../data/boundaries/pnw-districts.geojson', import.meta.url).pathname;

describe('resolveByCoordinates reuse — real committed GeoJSON reference points', () => {
  it('resolves Tacoma, Victoria, and Hanna AB to their expected district_id', async () => {
    const candidates = [
      { index: 0, lat: 47.2529, lon: -122.4443 }, // Tacoma, WA -> US:53053
      { index: 1, lat: 48.4284, lon: -123.3656 }, // Victoria, BC -> CA:5917
      { index: 2, lat: 51.424, lon: -111.258 }, // Hanna, AB -> CA:4804
    ];
    const result = await resolveByCoordinates(candidates, REAL_GEOJSON_PATH);
    assert.equal(result.get(0)?.districtId, 'US:53053');
    assert.equal(result.get(1)?.districtId, 'CA:5917');
    assert.equal(result.get(2)?.districtId, 'CA:4804');
  });
});

// ---------------------------------------------------------------------------
// Synthetic-fixture fallback-boundary determinism (mirrors the mkdtempSync
// pattern in fill-district-from-coords.test.ts)
// ---------------------------------------------------------------------------

describe('classifyRecordsForDerivation + resolveByCoordinates — synthetic fixture', () => {
  const scratchDir = mkdtempSync(join(tmpdir(), 'derive-district-audit-'));
  const syntheticGeojsonPath = join(scratchDir, 'synthetic-districts.geojson');
  writeFileSync(
    syntheticGeojsonPath,
    JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { district_id: 'TEST:0001', name: 'Test Square' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-120.01, 47.0],
                [-119.99, 47.0],
                [-119.99, 47.02],
                [-120.01, 47.02],
                [-120.01, 47.0],
              ],
            ],
          },
        },
      ],
    }),
    'utf8',
  );

  after(() => {
    rmSync(scratchDir, { recursive: true, force: true });
  });

  it('a candidate row inside the synthetic square resolves assigned-contained', async () => {
    const candidates = [{ index: 0, lat: 47.01, lon: -120.0 }];
    const result = await resolveByCoordinates(candidates, syntheticGeojsonPath);
    assert.equal(result.get(0)?.outcome, 'assigned-contained');
    assert.equal(result.get(0)?.districtId, 'TEST:0001');
  });
});
