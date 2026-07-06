import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  applyDistrictAssignments,
  resolveByCoordinates,
  type RecordCsvRow,
  type CoordResolution,
  type FillOutcome,
} from './fill-district-from-coords.ts';

// ---------------------------------------------------------------------------
// Fixtures — mirrors backfill-legacy-county.test.ts's makeCsvRow pattern
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

const FIVE_OUTCOMES: FillOutcome[] = [
  'assigned-contained',
  'assigned-fallback',
  'out-of-bounds',
  'axis-order-suspect',
  'unassigned',
];

// ---------------------------------------------------------------------------
// applyDistrictAssignments — pure unit tests (no DuckDB)
// ---------------------------------------------------------------------------

describe('applyDistrictAssignments', () => {
  it('fills a blank-district_id row that already has a stated county (D-01: county presence does not exclude)', () => {
    const rows = [makeRecordRow({ county: 'Pierce', district_id: '' })];
    const resolutions = new Map<number, CoordResolution>([
      [0, { outcome: 'assigned-contained', districtId: 'US:53053', distanceKm: null }],
    ]);
    const { filled, reportRows } = applyDistrictAssignments(rows, resolutions);
    assert.equal(filled[0]?.district_id, 'US:53053');
    assert.equal(filled[0]?.county, 'Pierce');
    assert.equal(reportRows[0]?.outcome, 'assigned-contained');
  });

  it('never overwrites a pre-existing non-blank district_id even with a differing resolution (additive-only, D-02/D-03) and emits no report row', () => {
    const rows = [makeRecordRow({ district_id: 'US:53007' })];
    const resolutions = new Map<number, CoordResolution>([
      [0, { outcome: 'assigned-contained', districtId: 'US:53053', distanceKm: null }],
    ]);
    const { filled, reportRows } = applyDistrictAssignments(rows, resolutions);
    assert.equal(filled[0]?.district_id, 'US:53007');
    assert.equal(reportRows.length, 0);
  });

  it('assigns a blank-district_id row with an assigned-contained resolution: district_id_after set, before "", county/other columns unchanged', () => {
    const rows = [makeRecordRow({ county: 'Some County', district_id: '' })];
    const resolutions = new Map<number, CoordResolution>([
      [0, { outcome: 'assigned-contained', districtId: 'US:53053', distanceKm: null }],
    ]);
    const { filled, reportRows } = applyDistrictAssignments(rows, resolutions);
    assert.equal(filled[0]?.district_id, 'US:53053');
    assert.equal(filled[0]?.county, 'Some County');
    assert.equal(filled[0]?.state, rows[0]?.state);
    assert.equal(reportRows[0]?.district_id_before, '');
    assert.equal(reportRows[0]?.district_id_after, 'US:53053');
    assert.equal(reportRows[0]?.outcome, 'assigned-contained');
  });

  it('emits report outcomes drawn only from the five FillOutcome literals (D-05)', () => {
    const rows = [
      makeRecordRow({ district_id: '' }),
      makeRecordRow({ district_id: '' }),
      makeRecordRow({ district_id: '' }),
      makeRecordRow({ district_id: '' }),
      makeRecordRow({ district_id: '' }),
    ];
    const resolutions = new Map<number, CoordResolution>([
      [0, { outcome: 'assigned-contained', districtId: 'US:53053', distanceKm: null }],
      [1, { outcome: 'assigned-fallback', districtId: 'US:53053', distanceKm: 1.2 }],
      [2, { outcome: 'out-of-bounds', districtId: '', distanceKm: null }],
      [3, { outcome: 'axis-order-suspect', districtId: '', distanceKm: null }],
      [4, { outcome: 'unassigned', districtId: '', distanceKm: null }],
    ]);
    const { reportRows } = applyDistrictAssignments(rows, resolutions);
    assert.equal(reportRows.length, 5);
    for (const r of reportRows) {
      assert.ok(FIVE_OUTCOMES.includes(r.outcome), `unexpected outcome literal: ${r.outcome}`);
    }
    assert.deepEqual(
      reportRows.map((r) => r.outcome),
      FIVE_OUTCOMES,
    );
  });

  it('preserves row order in the filled output', () => {
    const rows = [
      makeRecordRow({ species_slug: 'a-a', district_id: 'US:53001' }),
      makeRecordRow({ species_slug: 'b-b', district_id: '' }),
      makeRecordRow({ species_slug: 'c-c', district_id: '' }),
    ];
    const resolutions = new Map<number, CoordResolution>([
      [1, { outcome: 'assigned-contained', districtId: 'US:53053', distanceKm: null }],
      [2, { outcome: 'unassigned', districtId: '', distanceKm: null }],
    ]);
    const { filled } = applyDistrictAssignments(rows, resolutions);
    assert.deepEqual(
      filled.map((r) => r.species_slug),
      ['a-a', 'b-b', 'c-c'],
    );
  });
});

// ---------------------------------------------------------------------------
// resolveByCoordinates — DuckDB integration tests (real committed GeoJSON +
// a purpose-built synthetic polygon for the deterministic fallback boundary)
// ---------------------------------------------------------------------------

const REAL_GEOJSON_PATH = new URL('../data/boundaries/pnw-districts.geojson', import.meta.url).pathname;

describe('resolveByCoordinates — containment against the real committed GeoJSON', () => {
  it('resolves the three Phase-45 reference points to their expected district_id', async () => {
    const candidates = [
      { index: 0, lat: 47.2529, lon: -122.4443 }, // Tacoma, WA
      { index: 1, lat: 48.4284, lon: -123.3656 }, // Victoria, BC
      { index: 2, lat: 51.424, lon: -111.258 }, // Hanna, AB
    ];
    const result = await resolveByCoordinates(candidates, REAL_GEOJSON_PATH);
    assert.equal(result.get(0)?.outcome, 'assigned-contained');
    assert.equal(result.get(0)?.districtId, 'US:53053');
    assert.equal(result.get(1)?.outcome, 'assigned-contained');
    assert.equal(result.get(1)?.districtId, 'CA:5917');
    assert.equal(result.get(2)?.outcome, 'assigned-contained');
    assert.equal(result.get(2)?.districtId, 'CA:4804');
  });
});

describe('resolveByCoordinates — fallback boundary (synthetic single-square-polygon fixture)', () => {
  // A single 0.02deg x 0.02deg square: lon [-120.01, -119.99], lat [47.00,
  // 47.02] — distances to points due east of the right edge are exactly
  // known in degrees, giving a deterministic fallback/beyond-tolerance test
  // (RESEARCH.md Pitfall 4) without depending on any real coastal geometry.
  const scratchDir = mkdtempSync(join(tmpdir(), 'district-fallback-'));
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

  it('assigns assigned-fallback to a point within the ~2km tolerance, with a finite distance_km <= 2', async () => {
    // 0.01deg east of the right edge (-119.99) => ~1.11km, well within
    // FALLBACK_DEGREE_THRESHOLD (~2km / 111.32 km-per-degree).
    const candidates = [{ index: 0, lat: 47.01, lon: -119.98 }];
    const result = await resolveByCoordinates(candidates, syntheticGeojsonPath);
    const resolution = result.get(0);
    assert.equal(resolution?.outcome, 'assigned-fallback');
    assert.equal(resolution?.districtId, 'TEST:0001');
    assert.ok(resolution?.distanceKm !== null && Number.isFinite(resolution.distanceKm));
    assert.ok((resolution?.distanceKm ?? Infinity) <= 2);
  });

  it('leaves a point clearly beyond the ~2km tolerance unassigned', async () => {
    // 0.03deg east of the right edge => ~3.3km, beyond the ~2km fallback
    // tolerance.
    const candidates = [{ index: 0, lat: 47.01, lon: -119.96 }];
    const result = await resolveByCoordinates(candidates, syntheticGeojsonPath);
    const resolution = result.get(0);
    assert.equal(resolution?.outcome, 'unassigned');
    assert.equal(resolution?.districtId, '');
    assert.equal(resolution?.distanceKm, null);
  });

  it('is deterministic: two calls on the same fallback candidate yield the identical district_id', async () => {
    const candidates = [{ index: 0, lat: 47.01, lon: -119.98 }];
    const first = await resolveByCoordinates(candidates, syntheticGeojsonPath);
    const second = await resolveByCoordinates(candidates, syntheticGeojsonPath);
    assert.equal(first.get(0)?.districtId, second.get(0)?.districtId);
    assert.equal(first.get(0)?.outcome, second.get(0)?.outcome);
  });
});
