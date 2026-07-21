import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MIGRATIONS, cdnReadUrl, newStorageUrl } from './migrate-drasteria-maculosa-photos.ts';

describe('MIGRATIONS', () => {
  it('covers exactly the A-D and A-V specimen pair, old -> new', () => {
    assert.equal(MIGRATIONS.length, 2);
    for (const m of MIGRATIONS) {
      assert.equal(m.oldSlug, 'drasteria-nubicola');
      assert.equal(m.newSlug, 'drasteria-maculosa');
      assert.match(m.oldFilename, /^Drasteria nubicola-A-[DV]\.jpg$/);
      assert.match(m.newFilename, /^Drasteria maculosa-A-[DV]\.jpg$/);
    }
  });
});

describe('cdnReadUrl', () => {
  it('builds the public CDN URL (space → %20) for the old slug', () => {
    assert.equal(
      cdnReadUrl('drasteria-nubicola', 'Drasteria nubicola-A-D.jpg'),
      'https://moths.pnwinsects.org/drasteria-nubicola/Drasteria%20nubicola-A-D.jpg',
    );
  });
  it('builds the public CDN URL for the new canonical slug', () => {
    assert.equal(
      cdnReadUrl('drasteria-maculosa', 'Drasteria maculosa-A-V.jpg'),
      'https://moths.pnwinsects.org/drasteria-maculosa/Drasteria%20maculosa-A-V.jpg',
    );
  });
});

describe('newStorageUrl', () => {
  it('builds the storage PUT URL with the new slug path and URL-encoded filename', () => {
    assert.equal(
      newStorageUrl('drasteria-maculosa', 'Drasteria maculosa-A-D.jpg'),
      'https://la.storage.bunnycdn.com/pnwmoths/drasteria-maculosa/Drasteria%20maculosa-A-D.jpg',
    );
  });
});
