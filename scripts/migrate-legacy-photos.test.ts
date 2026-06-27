import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhotoName, legacyPhotoStorageUrl, cdnReadUrl } from './migrate-legacy-photos.ts';

describe('normalizePhotoName', () => {
  it('converts underscores to spaces (binomial)', () => {
    assert.equal(normalizePhotoName('Xestia_atrata-A-D.jpg'), 'Xestia atrata-A-D.jpg');
  });
  it('converts every underscore (irregular old-site names)', () => {
    assert.equal(normalizePhotoName('Apantesis_bolanderi_D.jpg'), 'Apantesis bolanderi D.jpg');
  });
  it('is idempotent on already-normalized names', () => {
    assert.equal(normalizePhotoName('Xestia atrata-A-D.jpg'), 'Xestia atrata-A-D.jpg');
  });
});

describe('legacyPhotoStorageUrl', () => {
  it('builds the storage PUT URL with the slug path and URL-encoded filename', () => {
    assert.equal(
      legacyPhotoStorageUrl('xestia-atrata', 'Xestia atrata-A-D.jpg'),
      'https://la.storage.bunnycdn.com/pnwmoths/xestia-atrata/Xestia%20atrata-A-D.jpg',
    );
  });
});

describe('cdnReadUrl', () => {
  it('builds the public CDN URL (space → %20)', () => {
    assert.equal(
      cdnReadUrl('xestia-atrata', 'Xestia atrata-A-D.jpg'),
      'https://pnwmoths.b-cdn.net/xestia-atrata/Xestia%20atrata-A-D.jpg',
    );
  });
});
