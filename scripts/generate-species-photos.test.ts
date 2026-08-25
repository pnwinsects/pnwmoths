import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyDeterminations,
  buildSpeciesPhotos,
  isMaterializable,
  toTilesPath,
  DEFAULT_PHOTOGRAPHER,
  DEFAULT_LICENSE,
} from './generate-species-photos.ts';
import { readManifest } from './lib/manifest.ts';
import { readPhotoDeterminations } from './lib/photo-determinations.ts';
import type { ManifestRow } from './lib/manifest.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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

// ---------------------------------------------------------------------------
// Staleness gate — ADR 0017 (#197 amendment)
// ---------------------------------------------------------------------------

describe('data/species-photos.json', () => {
  // ADR 0017 already requires this of "any future committed artifact", and
  // build-key.test.ts has enforced it for data/key-matrix.json since #197 —
  // after that file "sat stale for months" while data/images.csv moved under it.
  //
  // The identical failure then happened here, and this is the check that was
  // missing. `photos:materialize` is NOT part of `build:site`, so nothing ever
  // reproduces this artifact: it can disagree with the manifest and the
  // determinations indefinitely while every gate stays green. That is how the
  // tiles for eleven species stayed keyed to the species their photographs were
  // *named* after rather than the one the catalogue files them under, and eleven
  // accounts published another species' moth at full resolution (#330, #336).
  //
  // Like build-key.test.ts this runs in `npm test`, which every workflow runs
  // ahead of any `build:*` step, so it reads the committed bytes rather than
  // ones a build just overwrote.
  it('is not stale — matches a fresh run of photos:materialize', async () => {
    const committedRaw = readFileSync(resolve(ROOT, 'data/species-photos.json'), 'utf-8');
    const committed = JSON.parse(committedRaw) as Record<string, Record<string, unknown>>;

    const rows = await readManifest(resolve(ROOT, 'data/species-photos-manifest.csv'));
    const determinations = readPhotoDeterminations(resolve(ROOT, 'data/photo-determinations.csv'));
    // `existing` carries photographer/license forward by design — those are
    // curator-entered and not derived, so feeding the committed file back in is
    // what a real run does, not a way of making the comparison pass.
    const fresh = buildSpeciesPhotos(applyDeterminations(rows, determinations), committed);

    if (JSON.stringify(fresh, null, 2) + '\n' === committedRaw) return;

    // Name the differing species rather than diffing 200 KB of JSON, which is
    // unreadable in test output — the same reasoning as build-key.test.ts.
    const slugs = [...new Set([...Object.keys(committed), ...Object.keys(fresh)])].sort();
    const drifted = slugs
      .filter(slug => JSON.stringify(committed[slug]) !== JSON.stringify(fresh[slug]))
      .map(slug => {
        if (!(slug in committed)) return `${slug} (missing from the committed file)`;
        if (!(slug in fresh)) return `${slug} (committed, but no longer materialized)`;
        return slug;
      });

    assert.fail(
      'data/species-photos.json is stale — run `npm run photos:materialize` and commit the result. ' +
        (drifted.length > 0
          ? `Differing species: ${drifted.slice(0, 10).join(', ')}` +
            (drifted.length > 10 ? ` … and ${drifted.length - 10} more` : '')
          : 'The species all match; the difference is in formatting.'),
    );
  });
});
