import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSpeciesPhotos, isMaterializable, toTilesPath } from './generate-species-photos.js';

// ---------------------------------------------------------------------------
// Row factory — supplies all 13 COLUMNS values so tests don't accidentally
// pass because a property was absent rather than falsy.
// Default status is 'uploaded' (Phase 31 eligible status).
// ---------------------------------------------------------------------------

function row(overrides) {
  return {
    content_hash: 'h'.repeat(64),
    dropbox_path: '/folder/a.tif',
    size_bytes: '1',
    server_modified: '2026-01-01T00:00:00Z',
    filename_raw: 'a.tif',
    binomial_raw: 'abagrotis apposita',
    specimen_id: 'A',
    view: 'D',
    binomial_resolved: 'abagrotis apposita',
    species_slug: 'abagrotis-apposita',
    match_bucket: 'clean-match',
    status: 'uploaded',
    last_error: '',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Suite 1: isMaterializable
// ---------------------------------------------------------------------------

describe('isMaterializable', () => {
  it('returns true for status uploaded', () => {
    assert.equal(isMaterializable(row({ status: 'uploaded' })), true);
  });

  it('returns false for status tiled', () => {
    assert.equal(isMaterializable(row({ status: 'tiled' })), false);
  });

  it('returns false for status downloaded', () => {
    assert.equal(isMaterializable(row({ status: 'downloaded' })), false);
  });

  it('returns false for status discovered', () => {
    assert.equal(isMaterializable(row({ status: 'discovered' })), false);
  });

  it('returns false for status failed', () => {
    assert.equal(isMaterializable(row({ status: 'failed' })), false);
  });

  it('returns false for empty status', () => {
    assert.equal(isMaterializable(row({ status: '' })), false);
  });
});

// ---------------------------------------------------------------------------
// Suite 2: toTilesPath
// ---------------------------------------------------------------------------

describe('toTilesPath', () => {
  it('returns species-tiles/abagrotis-apposita/A-D for default row (no trailing slash)', () => {
    const result = toTilesPath(row());
    assert.equal(result, 'species-tiles/abagrotis-apposita/A-D');
  });

  it('lowercases mixed-case species_slug', () => {
    const result = toTilesPath(row({ species_slug: 'Abagrotis-Apposita' }));
    assert.equal(result, 'species-tiles/abagrotis-apposita/A-D');
  });

  it('composes specimen_id and view as {specimen_id}-{view}', () => {
    const result = toTilesPath(row({ specimen_id: 'OSAC_12345', view: 'V' }));
    assert.equal(result, 'species-tiles/abagrotis-apposita/OSAC_12345-V');
  });
});

// ---------------------------------------------------------------------------
// Suite 3: buildSpeciesPhotos
// ---------------------------------------------------------------------------

describe('buildSpeciesPhotos', () => {
  it('returns {} for empty input', () => {
    assert.deepEqual(buildSpeciesPhotos([]), {});
  });

  it('filters out non-uploaded rows (mix of tiled + uploaded)', () => {
    const rows = [
      row({ status: 'tiled', specimen_id: 'B' }),
      row({ status: 'uploaded', specimen_id: 'A' }),
    ];
    const result = buildSpeciesPhotos(rows);
    const specimens = result['abagrotis-apposita'].specimens;
    assert.equal(specimens.length, 1);
    assert.equal(specimens[0].specimen_id, 'A');
  });

  it('groups two specimens of one species under one slug key with high_res_available: true', () => {
    const rows = [
      row({ specimen_id: 'A', view: 'D' }),
      row({ specimen_id: 'A', view: 'V' }),
    ];
    const result = buildSpeciesPhotos(rows);
    assert.ok('abagrotis-apposita' in result);
    assert.equal(result['abagrotis-apposita'].high_res_available, true);
    assert.equal(result['abagrotis-apposita'].specimens.length, 2);
  });

  it('groups two species into two top-level keys', () => {
    const rows = [
      row({ species_slug: 'abagrotis-apposita', specimen_id: 'A', view: 'D' }),
      row({ species_slug: 'feltia-herilis', specimen_id: 'B', view: 'D' }),
    ];
    const result = buildSpeciesPhotos(rows);
    assert.ok('abagrotis-apposita' in result);
    assert.ok('feltia-herilis' in result);
  });

  it('sorts specimens: specimen_id alphabetical, then D before V', () => {
    const rows = [
      row({ specimen_id: 'B', view: 'V' }),
      row({ specimen_id: 'A', view: 'D' }),
      row({ specimen_id: 'A', view: 'V' }),
      row({ specimen_id: 'B', view: 'D' }),
    ];
    const result = buildSpeciesPhotos(rows);
    const specimens = result['abagrotis-apposita'].specimens;
    assert.equal(specimens[0].specimen_id, 'A');
    assert.equal(specimens[0].view, 'D');
    assert.equal(specimens[1].specimen_id, 'A');
    assert.equal(specimens[1].view, 'V');
    assert.equal(specimens[2].specimen_id, 'B');
    assert.equal(specimens[2].view, 'D');
    assert.equal(specimens[3].specimen_id, 'B');
    assert.equal(specimens[3].view, 'V');
  });

  it('matches pilot JSON shape for abagrotis-apposita exactly', () => {
    const rows = [
      row({ specimen_id: 'A', view: 'D' }),
      row({ specimen_id: 'A', view: 'V' }),
    ];
    const result = buildSpeciesPhotos(rows);
    assert.deepEqual(result, {
      'abagrotis-apposita': {
        high_res_available: true,
        specimens: [
          { specimen_id: 'A', view: 'D', tiles_path: 'species-tiles/abagrotis-apposita/A-D' },
          { specimen_id: 'A', view: 'V', tiles_path: 'species-tiles/abagrotis-apposita/A-V' },
        ],
      },
    });
  });

  it('lowercases species_slug in both the top-level key and tiles_path', () => {
    const rows = [
      row({ species_slug: 'Abagrotis-Apposita', specimen_id: 'A', view: 'D' }),
    ];
    const result = buildSpeciesPhotos(rows);
    assert.ok('abagrotis-apposita' in result);
    assert.equal(result['abagrotis-apposita'].specimens[0].tiles_path, 'species-tiles/abagrotis-apposita/A-D');
  });
});
