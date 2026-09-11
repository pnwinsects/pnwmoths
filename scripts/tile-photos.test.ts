import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tilePrefix, tiffCachePath, isAlreadyTiled, isTileable, isMissingThumbnail, findSlotCollisions, excludedBySlugFilter } from './tile-photos.ts';
import type { ManifestRow } from './lib/manifest.ts';

// ---------------------------------------------------------------------------
// Row factory — supplies all 13 COLUMNS values so tests don't accidentally
// pass because a property was absent rather than falsy.
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
    status: 'discovered',
    last_error: '',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Suite 1: tilePrefix
// ---------------------------------------------------------------------------

describe('tilePrefix', () => {
  it('lowercases a mixed-case species_slug in the output path', () => {
    const r = row({ species_slug: 'Abagrotis-apposita', specimen_id: 'A', view: 'D' });
    const result = tilePrefix('/tmp/tiles', r);
    assert.equal(result, '/tmp/tiles/abagrotis-apposita/A-D');
  });

  it('preserves uppercase accession IDs in the specimen_id component', () => {
    const r = row({ species_slug: 'feltia-herilis', specimen_id: 'WWUC0000003275', view: 'V' });
    const result = tilePrefix('/tmp/tiles', r);
    assert.equal(result, '/tmp/tiles/feltia-herilis/WWUC0000003275-V');
  });
});

// ---------------------------------------------------------------------------
// Suite 2: tiffCachePath
// ---------------------------------------------------------------------------

describe('tiffCachePath', () => {
  it('returns join(tiffCacheDir, content_hash + hyphen + filename_raw)', () => {
    const hash = 'deadbeef0123456789abcdef'.padEnd(64, '0');
    const r = row({ content_hash: hash, filename_raw: 'Abagrotis apposita-A-D.tif' });
    const result = tiffCachePath('/tmp/tiffs', r);
    assert.equal(result, `/tmp/tiffs/${hash}-Abagrotis apposita-A-D.tif`);
  });
});

// ---------------------------------------------------------------------------
// Suite 3: isAlreadyTiled
// ---------------------------------------------------------------------------

describe('isAlreadyTiled', () => {
  it('returns true when the .dzi file exists at the computed prefix', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'tile-test-'));
    try {
      // Create the directory tree and write a dummy .dzi file.
      const slugDir = join(tmpDir, 'abagrotis-apposita');
      mkdirSync(slugDir, { recursive: true });
      writeFileSync(join(slugDir, 'A-D.dzi'), '<Image/>');
      const r = row({ species_slug: 'abagrotis-apposita', specimen_id: 'A', view: 'D' });
      assert.equal(isAlreadyTiled(tmpDir, r), true);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns false when the .dzi file does not exist', () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'tile-test-empty-'));
    try {
      const r = row({ species_slug: 'abagrotis-apposita', specimen_id: 'A', view: 'D' });
      assert.equal(isAlreadyTiled(emptyDir, r), false);
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 4: isTileable
// ---------------------------------------------------------------------------

describe('isTileable', () => {
  it('returns true for a complete clean-match row with status discovered', () => {
    assert.equal(isTileable(row({})), true);
  });

  it('returns true for match_bucket resolved-via-synonym', () => {
    assert.equal(isTileable(row({ match_bucket: 'resolved-via-synonym' })), true);
  });

  // A curator's ruling is curation: the six #342 TIFFs sat in genus-only, ruled on
  // and untileable, until photos:investigate learned to file them by determination.
  it('returns true for match_bucket resolved-via-determination', () => {
    assert.equal(isTileable(row({ match_bucket: 'resolved-via-determination' })), true);
  });

  it('returns true for match_bucket slug-match', () => {
    assert.equal(isTileable(row({ match_bucket: 'slug-match' })), true);
  });

  it('returns false when status is tiled (manifest-level idempotency)', () => {
    assert.equal(isTileable(row({ status: 'tiled' })), false);
  });

  // #214: upload-tiles.ts deletes the local tile directory after a successful
  // upload, so isAlreadyTiled() finds no .dzi for an uploaded row and cannot be
  // the guard here. If isTileable let these through, a routine tile run would
  // re-download the entire processed corpus and walk finished rows backwards
  // from 'uploaded' to 'tiled', queueing them all for re-upload.
  it('returns false when status is uploaded (tiles are on the CDN, local copy deleted)', () => {
    assert.equal(isTileable(row({ status: 'uploaded' })), false);
  });

  it('returns true when status is failed (a failed row is retried)', () => {
    assert.equal(isTileable(row({ status: 'failed' })), true);
  });

  it('returns false for match_bucket genus-only (needs curation)', () => {
    assert.equal(isTileable(row({ match_bucket: 'genus-only' })), false);
  });

  it('returns false for match_bucket unparseable', () => {
    assert.equal(isTileable(row({ match_bucket: 'unparseable' })), false);
  });

  it('returns false for match_bucket provisional', () => {
    assert.equal(isTileable(row({ match_bucket: 'provisional' })), false);
  });

  it('returns false when specimen_id is empty', () => {
    assert.equal(isTileable(row({ specimen_id: '' })), false);
  });

  it('returns false when view is empty', () => {
    assert.equal(isTileable(row({ view: '' })), false);
  });

  it('returns false when species_slug is empty', () => {
    assert.equal(isTileable(row({ species_slug: '' })), false);
  });

  it('returns false when dropbox_path is empty (download step would fail)', () => {
    assert.equal(isTileable(row({ dropbox_path: '' })), false);
  });
});

// ---------------------------------------------------------------------------
// Suite 5: isMissingThumbnail
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Suite: findSlotCollisions — never overwrite another photograph's tiles
// ---------------------------------------------------------------------------
describe('findSlotCollisions', () => {
  const held = row({ content_hash: 'a'.repeat(64), filename_raw: 'Macaria colata-A-D.tif', species_slug: 'macaria-colata', status: 'uploaded' });

  it('blocks a tileable row whose slot is already tiled or uploaded by another photograph', () => {
    const incoming = row({ content_hash: 'b'.repeat(64), filename_raw: 'Speranza colata-A-D.tif', species_slug: 'macaria-colata' });
    const blocked = findSlotCollisions([held, incoming]);
    assert.equal(blocked.size, 1);
    assert.match(blocked.get(incoming.content_hash)!, /macaria-colata\/A-D is already held by Macaria colata-A-D.tif \(uploaded\)/);
    assert.match(blocked.get(incoming.content_hash)!, /photo-determinations\.csv/);
  });

  it('lets the row that already holds the slot through (a re-run of itself)', () => {
    const retry = row({ content_hash: 'a'.repeat(64), filename_raw: 'Macaria colata-A-D.tif', species_slug: 'macaria-colata', status: 'failed' });
    assert.equal(findSlotCollisions([retry]).size, 0);
  });

  // The Macaria signaria case: three photographs, one slot, none tiled yet.
  it('lets the first claimant of a free slot through and blocks the rest', () => {
    const rows = ['marmorata', 'unipunctaria', 'submarmorata'].map((name, i) =>
      row({ content_hash: String(i).repeat(64), filename_raw: `Macaria ${name}-A-D.tif`, species_slug: 'macaria-signaria' }));
    const blocked = findSlotCollisions(rows);
    assert.deepEqual([...blocked.keys()], ['1'.repeat(64), '2'.repeat(64)]);
    assert.match(blocked.get('1'.repeat(64))!, /also claimed by Macaria marmorata-A-D.tif/);
  });

  // An interrupted run left a .dzi on disk; two untiled rows claim that slot. Letting
  // the first through would have isAlreadyTiled() hand it the other photograph's
  // tiles and mark it tiled.
  it('holds every claimant of a contested slot whose tiles are already on disk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tiles-'));
    try {
      mkdirSync(join(dir, 'macaria-signaria'), { recursive: true });
      writeFileSync(join(dir, 'macaria-signaria', 'A-D.dzi'), '');
      const rows = ['marmorata', 'unipunctaria'].map((name, i) =>
        row({ content_hash: String(i).repeat(64), filename_raw: `Macaria ${name}-A-D.tif`, species_slug: 'macaria-signaria' }));
      const blocked = findSlotCollisions(rows, (r) => isAlreadyTiled(dir, r));
      assert.deepEqual([...blocked.keys()].sort(), ['0'.repeat(64), '1'.repeat(64)]);
      assert.match(blocked.get('0'.repeat(64))!, /already has tiles on disk .* 2 untiled rows claim it/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('lets a lone claimant keep tiles it left on disk itself', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tiles-'));
    try {
      mkdirSync(join(dir, 'amphipoea-keiferi'), { recursive: true });
      writeFileSync(join(dir, 'amphipoea-keiferi', 'A-D.dzi'), '');
      const only = row({ content_hash: 'b'.repeat(64), species_slug: 'amphipoea-keiferi' });
      assert.equal(findSlotCollisions([only], (r) => isAlreadyTiled(dir, r)).size, 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('treats slugs case-insensitively, like tilePrefix does', () => {
    const incoming = row({ content_hash: 'b'.repeat(64), species_slug: 'Macaria-Colata' });
    assert.equal(findSlotCollisions([held, incoming]).size, 1);
  });

  it('ignores different views and different specimens', () => {
    const ventral = row({ content_hash: 'b'.repeat(64), species_slug: 'macaria-colata', view: 'V' });
    const specimenB = row({ content_hash: 'c'.repeat(64), species_slug: 'macaria-colata', specimen_id: 'B' });
    assert.equal(findSlotCollisions([held, ventral, specimenB]).size, 0);
  });

  it('never blocks a row that is not tileable anyway', () => {
    const parked = row({ content_hash: 'b'.repeat(64), species_slug: 'macaria-colata', match_bucket: 'genus-only' });
    assert.equal(findSlotCollisions([held, parked]).size, 0);
  });
});

describe('excludedBySlugFilter', () => {
  it('excludes nothing when no filter is set', () => {
    assert.equal(excludedBySlugFilter(row({}), new Set()), false);
  });
  it('keeps only the listed slugs, case-insensitively', () => {
    const only = new Set(['amphipoea-keiferi', 'nycteola-cinereana']);
    assert.equal(excludedBySlugFilter(row({ species_slug: 'Amphipoea-keiferi' }), only), false);
    assert.equal(excludedBySlugFilter(row({ species_slug: 'macaria-signaria' }), only), true);
  });
});

describe('isMissingThumbnail', () => {
  it('returns true for a complete clean-match row with status uploaded', () => {
    assert.equal(isMissingThumbnail(row({ status: 'uploaded' })), true);
  });

  it('returns true for match_bucket resolved-via-synonym', () => {
    assert.equal(isMissingThumbnail(row({ status: 'uploaded', match_bucket: 'resolved-via-synonym' })), true);
  });

  it('returns true for match_bucket slug-match', () => {
    assert.equal(isMissingThumbnail(row({ status: 'uploaded', match_bucket: 'slug-match' })), true);
  });

  it('returns false when status is not uploaded', () => {
    assert.equal(isMissingThumbnail(row({ status: 'tiled' })), false);
    assert.equal(isMissingThumbnail(row({ status: 'discovered' })), false);
    assert.equal(isMissingThumbnail(row({ status: 'failed' })), false);
  });

  it('returns false for match_bucket genus-only (needs curation)', () => {
    assert.equal(isMissingThumbnail(row({ status: 'uploaded', match_bucket: 'genus-only' })), false);
  });

  it('returns false when specimen_id is empty', () => {
    assert.equal(isMissingThumbnail(row({ status: 'uploaded', specimen_id: '' })), false);
  });

  it('returns false when dropbox_path is empty', () => {
    assert.equal(isMissingThumbnail(row({ status: 'uploaded', dropbox_path: '' })), false);
  });
});
