import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { analyticsListUrl, analyticsFileUrl, STORAGE_PREFIX } from './download-analytics.ts';

// ---------------------------------------------------------------------------
// analyticsListUrl
// ---------------------------------------------------------------------------

describe('analyticsListUrl', () => {
  it('builds correct list URL with trailing slash', () => {
    const url = analyticsListUrl();
    assert.equal(url, 'https://la.storage.bunnycdn.com/pnwmoths/_analytics/');
  });
});

// ---------------------------------------------------------------------------
// analyticsFileUrl
// ---------------------------------------------------------------------------

describe('analyticsFileUrl', () => {
  it('builds correct file download URL', () => {
    const url = analyticsFileUrl('2026-06-29.json');
    assert.equal(url, 'https://la.storage.bunnycdn.com/pnwmoths/_analytics/2026-06-29.json');
  });

  it('encodes special characters', () => {
    const url = analyticsFileUrl('file name.json');
    assert.ok(url.includes('file%20name.json'));
  });
});

// ---------------------------------------------------------------------------
// STORAGE_PREFIX
// ---------------------------------------------------------------------------

describe('STORAGE_PREFIX', () => {
  it('matches upload-analytics prefix', () => {
    assert.equal(STORAGE_PREFIX, '_analytics');
  });
});
