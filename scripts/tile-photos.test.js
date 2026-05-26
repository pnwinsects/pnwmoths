import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tilePrefix, tiffCachePath, isAlreadyTiled, isTileable, isMissingThumbnail } from './tile-photos.js';

// ---------------------------------------------------------------------------
// Row factory — supplies all 13 COLUMNS values so tests don't accidentally
// pass because a property was absent rather than falsy.
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
  let tmpDir;

  it('returns true when the .dzi file exists at the computed prefix', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'tile-test-'));
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
    assert.equal(isTileable(row()), true);
  });

  it('returns true for match_bucket resolved-via-synonym', () => {
    assert.equal(isTileable(row({ match_bucket: 'resolved-via-synonym' })), true);
  });

  it('returns true for match_bucket slug-match', () => {
    assert.equal(isTileable(row({ match_bucket: 'slug-match' })), true);
  });

  it('returns false when status is tiled (manifest-level idempotency)', () => {
    assert.equal(isTileable(row({ status: 'tiled' })), false);
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
