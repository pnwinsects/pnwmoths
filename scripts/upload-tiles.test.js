import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tileUploadPath, tilePullZoneUrl, isUploadable } from './upload-tiles.js';

// ---------------------------------------------------------------------------
// Row factory — supplies all 13 COLUMNS values so tests don't accidentally
// pass because a property was absent rather than falsy.
// Default status is 'tiled' (Phase 30 eligible status, not 'discovered').
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
    status: 'tiled',
    last_error: '',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Suite 1: tileUploadPath
// ---------------------------------------------------------------------------

describe('tileUploadPath', () => {
  it('lowercases a mixed-case species_slug in the output path', () => {
    const r = row({ species_slug: 'Abagrotis-apposita', specimen_id: 'A', view: 'D' });
    const result = tileUploadPath('/tmp/tiles', r);
    assert.equal(result, '/tmp/tiles/abagrotis-apposita/A-D');
  });

  it('preserves uppercase accession IDs in the specimen_id component', () => {
    const r = row({ species_slug: 'feltia-herilis', specimen_id: 'WWUC0000003275', view: 'V' });
    const result = tileUploadPath('/tmp/tiles', r);
    assert.equal(result, '/tmp/tiles/feltia-herilis/WWUC0000003275-V');
  });
});

// ---------------------------------------------------------------------------
// Suite 2: tilePullZoneUrl
// ---------------------------------------------------------------------------

describe('tilePullZoneUrl', () => {
  it('returns Pull Zone URL with trailing slash', () => {
    const r = row({ species_slug: 'abagrotis-apposita', specimen_id: 'A', view: 'D' });
    const result = tilePullZoneUrl(r);
    assert.equal(result, 'https://pnwmoths.b-cdn.net/species-tiles/abagrotis-apposita/A-D/');
  });

  it('lowercases a mixed-case species_slug in the Pull Zone URL', () => {
    const r = row({ species_slug: 'Abagrotis-Apposita', specimen_id: 'A', view: 'D' });
    const result = tilePullZoneUrl(r);
    assert.equal(result, 'https://pnwmoths.b-cdn.net/species-tiles/abagrotis-apposita/A-D/');
  });
});

// ---------------------------------------------------------------------------
// Suite 3: isUploadable
// ---------------------------------------------------------------------------

describe('isUploadable', () => {
  it('returns true for status tiled', () => {
    assert.equal(isUploadable(row({ status: 'tiled' })), true);
  });

  it('returns false for status uploaded (manifest-level idempotency)', () => {
    assert.equal(isUploadable(row({ status: 'uploaded' })), false);
  });

  it('returns false for status discovered', () => {
    assert.equal(isUploadable(row({ status: 'discovered' })), false);
  });

  it('returns false for status downloaded', () => {
    assert.equal(isUploadable(row({ status: 'downloaded' })), false);
  });

  it('returns false for status failed', () => {
    assert.equal(isUploadable(row({ status: 'failed' })), false);
  });
});
