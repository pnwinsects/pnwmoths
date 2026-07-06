import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isInFootprint,
  featureWithinBounds,
  checkCrosswalkCoverage,
  PNW_BOUNDS,
  type GeoFeature,
  type PolygonCoordinates,
  type MultiPolygonCoordinates,
} from './build-boundaries.ts';

// ---------------------------------------------------------------------------
// isInFootprint
// ---------------------------------------------------------------------------

describe('isInFootprint', () => {
  it('accepts US counties in the four PNW states (WA/OR/ID/MT)', () => {
    assert.equal(isInFootprint('US:53053'), true); // WA
    assert.equal(isInFootprint('US:41051'), true); // OR
    assert.equal(isInFootprint('US:16001'), true); // ID
    assert.equal(isInFootprint('US:30063'), true); // MT
  });

  it('rejects US counties outside the PNW footprint and malformed US ids', () => {
    assert.equal(isInFootprint('US:06001'), false); // California
    assert.equal(isInFootprint('US:53'), false); // malformed, no county part
    assert.equal(isInFootprint(''), false);
  });

  it('accepts BC census divisions and the single Alberta division (D-04)', () => {
    assert.equal(isInFootprint('CA:5917'), true); // BC
    assert.equal(isInFootprint('CA:4804'), true); // the one AB division
  });

  it('rejects other Alberta divisions and other Canadian provinces', () => {
    assert.equal(isInFootprint('CA:4805'), false); // AB, not the crosswalk's one division
    assert.equal(isInFootprint('CA:1001'), false); // other province
  });
});

// ---------------------------------------------------------------------------
// featureWithinBounds
// ---------------------------------------------------------------------------

function polygonFeature(coordinates: PolygonCoordinates): GeoFeature {
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates },
  };
}

function multiPolygonFeature(coordinates: MultiPolygonCoordinates): GeoFeature {
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'MultiPolygon', coordinates },
  };
}

describe('featureWithinBounds', () => {
  it('accepts a Polygon whose every ring position is inside the PNW box', () => {
    const feature = polygonFeature([
      [
        [-122.4, 47.2],
        [-122.3, 47.3],
        [-122.5, 47.1],
        [-122.4, 47.2],
      ],
    ]);
    assert.equal(featureWithinBounds(feature), true);
  });

  it('rejects a MultiPolygon with one position far outside the box (unprojected easting leaked through)', () => {
    const feature = multiPolygonFeature([
      [
        [
          [-122, 47],
          [-121, 47],
          [-121.5, 48],
          [-122, 47],
        ],
      ],
      [
        [
          [5, 47],
          [6, 47],
          [5.5, 48],
          [5, 47],
        ],
      ],
    ]);
    assert.equal(featureWithinBounds(feature), false);
  });

  it('rejects a feature with a position north of the bound (lat 65)', () => {
    const feature = polygonFeature([
      [
        [-122, 47],
        [-121, 47],
        [-121.5, 65],
        [-122, 47],
      ],
    ]);
    assert.equal(featureWithinBounds(feature), false);
  });

  it('uses the exported PNW_BOUNDS constant for its checks', () => {
    assert.equal(PNW_BOUNDS.latMin, 41);
    assert.equal(PNW_BOUNDS.latMax, 61);
    assert.equal(PNW_BOUNDS.lonMin, -140);
    // -103 (not -109) so full-Montana counties (D-05, east to -104.04) pass.
    assert.equal(PNW_BOUNDS.lonMax, -103);
  });
});

// ---------------------------------------------------------------------------
// checkCrosswalkCoverage
// ---------------------------------------------------------------------------

describe('checkCrosswalkCoverage', () => {
  it('reports no missing/duplicated when every crosswalk id has exactly one matching polygon (extra polygons are fine, D-05)', () => {
    const result = checkCrosswalkCoverage(
      ['US:53053', 'CA:5917'],
      ['US:53053', 'CA:5917', 'US:30063'],
    );
    assert.deepEqual(result, { missing: [], duplicated: [] });
  });

  it('reports a crosswalk id with no matching polygon as missing', () => {
    const result = checkCrosswalkCoverage(['US:53053', 'US:16999'], ['US:53053']);
    assert.deepEqual(result, { missing: ['US:16999'], duplicated: [] });
  });

  it('reports a polygon district_id that appears more than once as duplicated', () => {
    const result = checkCrosswalkCoverage(['US:53053'], ['US:53053', 'US:53053']);
    assert.deepEqual(result, { missing: [], duplicated: ['US:53053'] });
  });
});
