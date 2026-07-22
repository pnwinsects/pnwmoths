import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MIGRATIONS, legacyReadUrl, cdnReadUrl, newStorageUrl } from './migrate-callopistria-clostera-legacy-photos.ts';

describe('MIGRATIONS', () => {
  it('covers exactly the 2 Callopistria floridensis + 2 Clostera brucei-C objects', () => {
    assert.equal(MIGRATIONS.length, 4);
    const bySlug = new Map<string, number>();
    for (const m of MIGRATIONS) {
      bySlug.set(m.slug, (bySlug.get(m.slug) ?? 0) + 1);
    }
    assert.equal(bySlug.get('callopistria-floridensis'), 2);
    assert.equal(bySlug.get('clostera-brucei'), 2);
  });

  it('maps each legacy underscore filename to a canonical space-separated filename', () => {
    for (const m of MIGRATIONS) {
      assert.ok(m.legacyFilename.includes('_'), `expected legacy filename to use underscores: ${m.legacyFilename}`);
      assert.ok(!m.canonicalFilename.includes('_'), `expected canonical filename to have no underscores: ${m.canonicalFilename}`);
      assert.match(m.canonicalFilename, /^[A-Z][a-z]+ [a-z]+-[A-Z]-[DV]\.jpg$/);
    }
  });

  it('only includes specimen C for Clostera brucei (A/B are canonical multnoma, handled in #159)', () => {
    const clostera = MIGRATIONS.filter((m) => m.slug === 'clostera-brucei');
    for (const m of clostera) {
      assert.match(m.canonicalFilename, /^Clostera brucei-C-[DV]\.jpg$/);
    }
  });
});

describe('legacyReadUrl', () => {
  it('builds the public legacy WWU site URL (no auth, underscore filename preserved)', () => {
    assert.equal(
      legacyReadUrl('Callopistria_floridensis-A-D.jpg'),
      'https://pnwmoths.biol.wwu.edu/media/moths/Callopistria_floridensis-A-D.jpg',
    );
  });
});

describe('cdnReadUrl', () => {
  it('builds the public CDN URL (space → %20) for the canonical slug', () => {
    assert.equal(
      cdnReadUrl('callopistria-floridensis', 'Callopistria floridensis-A-D.jpg'),
      'https://moths.pnwinsects.org/callopistria-floridensis/Callopistria%20floridensis-A-D.jpg',
    );
  });
});

describe('newStorageUrl', () => {
  it('builds the storage PUT URL with the canonical slug path and URL-encoded filename', () => {
    assert.equal(
      newStorageUrl('clostera-brucei', 'Clostera brucei-C-D.jpg'),
      'https://la.storage.bunnycdn.com/pnwmoths/clostera-brucei/Clostera%20brucei-C-D.jpg',
    );
  });
});
