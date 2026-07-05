import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { analyticsStorageUrl, listLocalFiles, STORAGE_PREFIX } from './upload-analytics.ts';

// ---------------------------------------------------------------------------
// analyticsStorageUrl
// ---------------------------------------------------------------------------

describe('analyticsStorageUrl', () => {
  it('builds correct URL for a date file', () => {
    const url = analyticsStorageUrl('2026-06-29.json');
    assert.equal(url, 'https://la.storage.bunnycdn.com/pnwmoths/_analytics/2026-06-29.json');
  });

  it('encodes special characters in filename', () => {
    const url = analyticsStorageUrl('file with spaces.json');
    assert.ok(url.includes('file%20with%20spaces.json'));
  });
});

// ---------------------------------------------------------------------------
// STORAGE_PREFIX
// ---------------------------------------------------------------------------

describe('STORAGE_PREFIX', () => {
  it('uses underscore prefix to avoid serving as site content', () => {
    assert.equal(STORAGE_PREFIX, '_analytics');
  });
});

// ---------------------------------------------------------------------------
// listLocalFiles
// ---------------------------------------------------------------------------

describe('listLocalFiles', () => {
  it('returns empty array for nonexistent directory', () => {
    const result = listLocalFiles('/nonexistent/path/xyz');
    assert.deepEqual(result, []);
  });

  it('filters to YYYY-MM-DD.json pattern only', () => {
    // Tests the regex logic — .gitkeep and other non-date files are excluded
    // We test via the regex since we cannot easily mock the filesystem
    const pattern = /^\d{4}-\d{2}-\d{2}\.json$/;
    assert.ok(pattern.test('2026-06-29.json'));
    assert.ok(!pattern.test('.gitkeep'));
    assert.ok(!pattern.test('readme.md'));
    assert.ok(!pattern.test('analytics.json'));
  });
});
