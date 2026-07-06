// scripts/build-district-adjacency.test.ts
// RED contract test for scripts/build-district-adjacency.ts (Wave 0 — Phase
// 47 Plan 01). Pins computeAdjacency's synthetic-square adjacency contract
// (ST_Touches + ST_DWithin near-miss fallback, canonical a<b pair ordering)
// the Wave 1 (47-03) implementation must satisfy. This file is
// INTENTIONALLY RED until scripts/build-district-adjacency.ts exists — the
// import below will fail module resolution.
//
// Mirrors scripts/fill-district-from-coords.test.ts's synthetic-fixture
// mkdtempSync scratch-dir pattern (lines 155-222).
//
// Run via: node --test scripts/build-district-adjacency.test.ts
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { computeAdjacency, type AdjacencyPair } from './build-district-adjacency.ts';

// ---------------------------------------------------------------------------
// Synthetic fixture — three squares:
//   TEST:0001 and TEST:0002 share an exact edge (ST_Touches true)
//   TEST:0003 separated from the pair by a gap smaller than ~2 km
//     (a near-miss inside FALLBACK_DEGREE_THRESHOLD, still adjacent)
//   TEST:0009 placed clearly far away (over ~2 km, adjacent to nothing)
// ---------------------------------------------------------------------------

describe('computeAdjacency — synthetic squares', () => {
  const scratchDir = mkdtempSync(join(tmpdir(), 'build-district-adjacency-'));
  const syntheticGeojsonPath = join(scratchDir, 'synthetic-adjacency.geojson');

  writeFileSync(
    syntheticGeojsonPath,
    JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          // Square 1: lon [-120.02, -120.00], lat [47.00, 47.02]
          type: 'Feature',
          properties: { district_id: 'TEST:0001', name: 'Square One' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-120.02, 47.0],
                [-120.0, 47.0],
                [-120.0, 47.02],
                [-120.02, 47.02],
                [-120.02, 47.0],
              ],
            ],
          },
        },
        {
          // Square 2: shares the exact edge lon = -120.00 with Square 1
          // (ST_Touches true). lon [-120.00, -119.98], lat [47.00, 47.02]
          type: 'Feature',
          properties: { district_id: 'TEST:0002', name: 'Square Two' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-120.0, 47.0],
                [-119.98, 47.0],
                [-119.98, 47.02],
                [-120.0, 47.02],
                [-120.0, 47.0],
              ],
            ],
          },
        },
        {
          // Square 3: separated from Square 2's right edge (-119.98) by a
          // ~0.01deg gap (~1.11km), a near-miss inside FALLBACK_DEGREE_THRESHOLD
          // (~2km / 111.32 km-per-degree ~= 0.018deg) — still adjacent via
          // ST_DWithin. lon [-119.97, -119.95], lat [47.00, 47.02]
          type: 'Feature',
          properties: { district_id: 'TEST:0003', name: 'Square Three (near-miss)' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-119.97, 47.0],
                [-119.95, 47.0],
                [-119.95, 47.02],
                [-119.97, 47.02],
                [-119.97, 47.0],
              ],
            ],
          },
        },
        {
          // Square 9: clearly far away from all others (> 2km from any
          // other square) — adjacent to nothing.
          type: 'Feature',
          properties: { district_id: 'TEST:0009', name: 'Square Nine (far)' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-119.0, 47.0],
                [-118.98, 47.0],
                [-118.98, 47.02],
                [-119.0, 47.02],
                [-119.0, 47.0],
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

  it('returns canonical pairs (district_id_a lexicographically before district_id_b)', async () => {
    const pairs = await computeAdjacency(syntheticGeojsonPath);
    for (const pair of pairs) {
      assert.ok(
        pair.district_id_a < pair.district_id_b,
        `expected canonical a<b ordering, got ${pair.district_id_a} / ${pair.district_id_b}`,
      );
    }
  });

  it('INCLUDES the touching pair (TEST:0001, TEST:0002)', async () => {
    const pairs = await computeAdjacency(syntheticGeojsonPath);
    const found = pairs.some(
      (p: AdjacencyPair) => p.district_id_a === 'TEST:0001' && p.district_id_b === 'TEST:0002',
    );
    assert.ok(found, 'expected TEST:0001/TEST:0002 (touching edge) to be adjacent');
  });

  it('INCLUDES the near-miss pair (TEST:0002, TEST:0003) within FALLBACK_DEGREE_THRESHOLD', async () => {
    const pairs = await computeAdjacency(syntheticGeojsonPath);
    const found = pairs.some(
      (p: AdjacencyPair) => p.district_id_a === 'TEST:0002' && p.district_id_b === 'TEST:0003',
    );
    assert.ok(found, 'expected TEST:0002/TEST:0003 (near-miss gap) to be adjacent');
  });

  it('EXCLUDES any pair involving TEST:0009 (clearly far away, adjacent to nothing)', async () => {
    const pairs = await computeAdjacency(syntheticGeojsonPath);
    const found = pairs.some(
      (p: AdjacencyPair) => p.district_id_a === 'TEST:0009' || p.district_id_b === 'TEST:0009',
    );
    assert.equal(found, false, 'TEST:0009 must not appear in any adjacency pair');
  });

  it('emits pairs in the canonical a-before-b orientation with no reverse duplicates', async () => {
    const pairs = await computeAdjacency(syntheticGeojsonPath);
    const seen = new Set<string>();
    for (const pair of pairs) {
      const key = `${pair.district_id_a}|${pair.district_id_b}`;
      const reverseKey = `${pair.district_id_b}|${pair.district_id_a}`;
      assert.equal(seen.has(reverseKey), false, `found a reverse-duplicate pair for ${key}`);
      seen.add(key);
    }
  });
});

// ---------------------------------------------------------------------------
// WR-01 regression: MultiPolygon operands against the ST_Boundary() workaround
//
// 20 of the 205 committed districts in data/boundaries/pnw-districts.geojson
// are MultiPolygon (e.g. Island, San Juan, Kitsap), but the fixture above
// only ever exercises single-Polygon squares. This fixture mirrors that
// mkdtemp scratch-dir pattern with a dedicated, non-overlapping set of
// features (TEST:0020/0021/0022/0029, all on the same lat band as the
// squares above but shifted well clear of them in longitude) so a future
// `spatial` extension version change affecting ST_Boundary()'s handling of
// MultiPolygon specifically would be caught here.
// ---------------------------------------------------------------------------

describe('computeAdjacency — MultiPolygon operands (WR-01)', () => {
  const scratchDir = mkdtempSync(join(tmpdir(), 'build-district-adjacency-multipolygon-'));
  const multiPolygonGeojsonPath = join(scratchDir, 'synthetic-multipolygon-adjacency.geojson');

  writeFileSync(
    multiPolygonGeojsonPath,
    JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          // Anchor square: lon [-119.50, -119.48], lat [47.00, 47.02]
          type: 'Feature',
          properties: { district_id: 'TEST:0020', name: 'Anchor Square' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-119.5, 47.0],
                [-119.48, 47.0],
                [-119.48, 47.02],
                [-119.5, 47.02],
                [-119.5, 47.0],
              ],
            ],
          },
        },
        {
          // MultiPolygon whose SECOND part shares the exact edge lon = -119.50
          // with the anchor square (ST_Touches true on that component); its
          // FIRST part is isolated and far from everything. Proves ST_Touches
          // (topological, unaffected by the ST_Boundary() workaround) still
          // detects an edge-touch when one operand is a MultiPolygon.
          type: 'Feature',
          properties: { district_id: 'TEST:0021', name: 'MultiPolygon (touches anchor)' },
          geometry: {
            type: 'MultiPolygon',
            coordinates: [
              [
                [
                  [-119.3, 47.0],
                  [-119.28, 47.0],
                  [-119.28, 47.02],
                  [-119.3, 47.02],
                  [-119.3, 47.0],
                ],
              ],
              [
                [
                  [-119.52, 47.0],
                  [-119.5, 47.0],
                  [-119.5, 47.02],
                  [-119.52, 47.02],
                  [-119.52, 47.0],
                ],
              ],
            ],
          },
        },
        {
          // MultiPolygon whose SECOND part is a ~0.01deg (~1.11km) near-miss
          // gap from the anchor square's right edge (-119.48) — inside
          // FALLBACK_DEGREE_THRESHOLD, not touching. Its FIRST part is
          // isolated and far. Proves the ST_Boundary()-wrapped ST_DWithin
          // near-miss fallback still works when one operand is a
          // MultiPolygon (this is the exact bug class WR-01 flags: the
          // workaround was only ever verified against single Polygons).
          type: 'Feature',
          properties: { district_id: 'TEST:0022', name: 'MultiPolygon (near-miss to anchor)' },
          geometry: {
            type: 'MultiPolygon',
            coordinates: [
              [
                [
                  [-117.0, 47.0],
                  [-116.98, 47.0],
                  [-116.98, 47.02],
                  [-117.0, 47.02],
                  [-117.0, 47.0],
                ],
              ],
              [
                [
                  [-119.47, 47.0],
                  [-119.45, 47.0],
                  [-119.45, 47.02],
                  [-119.47, 47.02],
                  [-119.47, 47.0],
                ],
              ],
            ],
          },
        },
        {
          // MultiPolygon clearly separated (both parts) from every other
          // feature in this fixture, by well over FALLBACK_DEGREE_THRESHOLD.
          // Proves a MultiPolygon is correctly excluded when genuinely far.
          type: 'Feature',
          properties: { district_id: 'TEST:0029', name: 'MultiPolygon (far from everything)' },
          geometry: {
            type: 'MultiPolygon',
            coordinates: [
              [
                [
                  [-115.0, 47.0],
                  [-114.98, 47.0],
                  [-114.98, 47.02],
                  [-115.0, 47.02],
                  [-115.0, 47.0],
                ],
              ],
              [
                [
                  [-114.9, 47.0],
                  [-114.88, 47.0],
                  [-114.88, 47.02],
                  [-114.9, 47.02],
                  [-114.9, 47.0],
                ],
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

  it('detects a MultiPolygon adjacent to a Polygon via a touching component (TEST:0020, TEST:0021)', async () => {
    const pairs = await computeAdjacency(multiPolygonGeojsonPath);
    const found = pairs.some(
      (p: AdjacencyPair) => p.district_id_a === 'TEST:0020' && p.district_id_b === 'TEST:0021',
    );
    assert.ok(found, 'expected TEST:0020/TEST:0021 (MultiPolygon touching component) to be adjacent');
  });

  it('detects a MultiPolygon adjacent to a Polygon via a near-miss component within FALLBACK_DEGREE_THRESHOLD (TEST:0020, TEST:0022)', async () => {
    const pairs = await computeAdjacency(multiPolygonGeojsonPath);
    const found = pairs.some(
      (p: AdjacencyPair) => p.district_id_a === 'TEST:0020' && p.district_id_b === 'TEST:0022',
    );
    assert.ok(found, 'expected TEST:0020/TEST:0022 (MultiPolygon near-miss component) to be adjacent');
  });

  it('EXCLUDES a clearly-separated MultiPolygon from every pair (TEST:0029)', async () => {
    const pairs = await computeAdjacency(multiPolygonGeojsonPath);
    const found = pairs.some(
      (p: AdjacencyPair) => p.district_id_a === 'TEST:0029' || p.district_id_b === 'TEST:0029',
    );
    assert.equal(found, false, 'TEST:0029 (far MultiPolygon) must not appear in any adjacency pair');
  });

  it('returns canonical a<b pairs for MultiPolygon operands too', async () => {
    const pairs = await computeAdjacency(multiPolygonGeojsonPath);
    for (const pair of pairs) {
      assert.ok(
        pair.district_id_a < pair.district_id_b,
        `expected canonical a<b ordering, got ${pair.district_id_a} / ${pair.district_id_b}`,
      );
    }
  });
});
