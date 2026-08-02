import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSpeciesPhotos,
  isMaterializable,
  toTilesPath,
  DEFAULT_PHOTOGRAPHER,
  DEFAULT_LICENSE,
} from './generate-species-photos.ts';
import type { ManifestRow } from './lib/manifest.ts';

// ---------------------------------------------------------------------------
// Row factory — supplies all 13 COLUMNS values so tests don't accidentally
// pass because a property was absent rather than falsy.
// Default status is 'uploaded' (Phase 31 eligible status).
// ---------------------------------------------------------------------------

function row(overrides: Partial<ManifestRow>): ManifestRow {
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
    const result = toTilesPath(row({}));
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
    const entry = result['abagrotis-apposita'];
    assert.ok(entry !== undefined);
    const { specimens } = entry;
    assert.equal(specimens.length, 1);
    const [firstSpecimen] = specimens;
    assert.ok(firstSpecimen !== undefined);
    assert.equal(firstSpecimen.specimen_id, 'A');
  });

  it('groups two specimens of one species under one slug key with high_res_available: true', () => {
    const rows = [
      row({ specimen_id: 'A', view: 'D' }),
      row({ specimen_id: 'A', view: 'V' }),
    ];
    const result = buildSpeciesPhotos(rows);
    assert.ok('abagrotis-apposita' in result);
    const entry = result['abagrotis-apposita'];
    assert.ok(entry !== undefined);
    assert.equal(entry.high_res_available, true);
    assert.equal(entry.specimens.length, 2);
  });

  // #214: photographer/license are curator-entered and have no manifest column.
  // Regenerating used to drop them, which failed `tsc --noEmit` against
  // SpeciesPhotoSchema and stripped every photo's credit from the site.
  it('carries forward curator-entered photographer and license', () => {
    const result = buildSpeciesPhotos([row({})], {
      'abagrotis-apposita': { photographer: 'Lars Crabo', license: 'CC BY-SA' },
    });
    const entry = result['abagrotis-apposita'];
    assert.ok(entry !== undefined);
    assert.equal(entry.photographer, 'Lars Crabo');
    assert.equal(entry.license, 'CC BY-SA');
  });

  it('applies default attribution to a species absent from the existing output', () => {
    const result = buildSpeciesPhotos([row({})], {});
    const entry = result['abagrotis-apposita'];
    assert.ok(entry !== undefined);
    assert.equal(entry.photographer, DEFAULT_PHOTOGRAPHER);
    assert.equal(entry.license, DEFAULT_LICENSE);
  });

  it('treats a blank curator value as absent rather than emitting an empty credit', () => {
    const result = buildSpeciesPhotos([row({})], {
      'abagrotis-apposita': { photographer: '', license: '' },
    });
    const entry = result['abagrotis-apposita'];
    assert.ok(entry !== undefined);
    assert.equal(entry.photographer, DEFAULT_PHOTOGRAPHER);
    assert.equal(entry.license, DEFAULT_LICENSE);
  });

  it('does not resurrect attribution for a species that dropped out of the manifest', () => {
    const result = buildSpeciesPhotos([row({})], {
      'feltia-herilis': { photographer: 'Merrill Peterson', license: 'CC BY-NC' },
    });
    assert.ok(!('feltia-herilis' in result));
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
    const entry = result['abagrotis-apposita'];
    assert.ok(entry !== undefined);
    const { specimens } = entry;
    const [s0, s1, s2, s3] = specimens;
    assert.ok(s0 !== undefined);
    assert.ok(s1 !== undefined);
    assert.ok(s2 !== undefined);
    assert.ok(s3 !== undefined);
    assert.equal(s0.specimen_id, 'A');
    assert.equal(s0.view, 'D');
    assert.equal(s1.specimen_id, 'A');
    assert.equal(s1.view, 'V');
    assert.equal(s2.specimen_id, 'B');
    assert.equal(s2.view, 'D');
    assert.equal(s3.specimen_id, 'B');
    assert.equal(s3.view, 'V');
  });

  it('matches pilot JSON shape for abagrotis-apposita exactly', () => {
    const rows = [
      row({ specimen_id: 'A', view: 'D' }),
      row({ specimen_id: 'A', view: 'V' }),
    ];
    const result = buildSpeciesPhotos(rows, {
      'abagrotis-apposita': { photographer: 'Merrill Peterson', license: 'CC BY-NC' },
    });
    // Full committed shape, attribution included — this is what data/species-photos.json
    // holds and what SpeciesPhotoSchema requires (#214).
    assert.deepEqual(result, {
      'abagrotis-apposita': {
        high_res_available: true,
        specimens: [
          { specimen_id: 'A', view: 'D', tiles_path: 'species-tiles/abagrotis-apposita/A-D' },
          { specimen_id: 'A', view: 'V', tiles_path: 'species-tiles/abagrotis-apposita/A-V' },
        ],
        photographer: 'Merrill Peterson',
        license: 'CC BY-NC',
      },
    });
  });

  it('lowercases species_slug in both the top-level key and tiles_path', () => {
    const rows = [
      row({ species_slug: 'Abagrotis-Apposita', specimen_id: 'A', view: 'D' }),
    ];
    const result = buildSpeciesPhotos(rows);
    assert.ok('abagrotis-apposita' in result);
    const entry = result['abagrotis-apposita'];
    assert.ok(entry !== undefined);
    const [firstSpecimen] = entry.specimens;
    assert.ok(firstSpecimen !== undefined);
    assert.equal(firstSpecimen.tiles_path, 'species-tiles/abagrotis-apposita/A-D');
  });
});
