import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractDerivativeUrls,
  storagePathOf,
  findEmittedGaps,
  scopedSources,
  findSourceGaps,
  buildableSlugs,
} from './check-derivatives.ts';
import type { SourceInventory } from './lib/derivatives.ts';

const CDN = 'https://moths.pnwinsects.org';

describe('extractDerivativeUrls', () => {
  it('pulls one URL out of a src attribute', () => {
    assert.deepEqual(
      extractDerivativeUrls(`<img src="${CDN}/derived/abagrotis-apposita/a%40320h.webp">`),
      [`${CDN}/derived/abagrotis-apposita/a%40320h.webp`],
    );
  });

  it('splits a srcset on the comma and drops the width descriptor', () => {
    // The regex stops at whitespace and commas, so `530w,` never joins a URL.
    assert.deepEqual(
      extractDerivativeUrls(
        `<img srcset="${CDN}/derived/x%40530.webp 530w, ${CDN}/derived/x%401060.webp 1060w, ${CDN}/x.webp 1500w">`,
      ),
      [`${CDN}/derived/x%40530.webp`, `${CDN}/derived/x%401060.webp`],
    );
  });

  it('ignores CDN URLs that are not derivatives', () => {
    // The 1500w hero slot IS the stored _thumbnail.webp, plates and site images
    // are outside the ADR 0022 matrix, and the legacy og:image stays JPEG for
    // crawlers (ADR 0021). Flagging any of them would be wrong.
    const html =
      `<img src="${CDN}/species-tiles/abagrotis-apposita/A-D_thumbnail.webp">` +
      `<img src="${CDN}/plates/plate-1.jpg">` +
      `<meta content="${CDN}/abagrotis-apposita/Abagrotis%20apposita-A-D.jpg">`;
    assert.deepEqual(extractDerivativeUrls(html), []);
  });

  it('finds every occurrence in a page, not just the first', () => {
    const html = `<img src="${CDN}/derived/a%40full.webp" data-thumb="${CDN}/derived/a%40320h.webp">`;
    assert.equal(extractDerivativeUrls(html).length, 2);
  });
});

describe('storagePathOf', () => {
  it('decodes the %40 variant separator and %20 in Django-era filenames', () => {
    assert.equal(
      storagePathOf(`${CDN}/derived/abagrotis-apposita/Abagrotis%20apposita-A-D%40320h.webp`),
      'derived/abagrotis-apposita/Abagrotis apposita-A-D@320h.webp',
    );
  });

  it('returns null for another origin', () => {
    assert.equal(storagePathOf('https://example.com/derived/a%40320h.webp'), null);
  });

  it('does not treat a same-prefix host as ours', () => {
    assert.equal(storagePathOf('https://moths.pnwinsects.org.evil.test/derived/a.webp'), null);
  });
});

describe('findEmittedGaps', () => {
  const known = new Set(['derived/abagrotis-apposita/Abagrotis apposita-A-D@320h.webp']);

  it('passes when every emitted derivative is in the manifest', () => {
    const pages = [{
      page: 'species/abagrotis-apposita/index.html',
      html: `<img src="${CDN}/derived/abagrotis-apposita/Abagrotis%20apposita-A-D%40320h.webp">`,
    }];
    assert.deepEqual(findEmittedGaps({ pages, known }), []);
  });

  it('names the page and the URL when a manifest row is gone', () => {
    const pages = [{
      page: 'species/abagrotis-apposita/index.html',
      html: `<img src="${CDN}/derived/abagrotis-apposita/Abagrotis%20apposita-A-V%40320h.webp">`,
    }];
    const gaps = findEmittedGaps({ pages, known });
    assert.equal(gaps.length, 1);
    assert.equal(gaps[0]?.reason, 'not-in-manifest');
    assert.equal(gaps[0]?.page, 'species/abagrotis-apposita/index.html');
    assert.match(gaps[0]?.url ?? '', /A-V%40320h\.webp$/);
  });

  it('flags a derivative served from the wrong origin', () => {
    // A pathPrefix or staging host leaking into a template is a real bug, not
    // something to skip because the path happens to be unrecognizable.
    const pages = [{ page: 'index.html', html: '<img src="https://example.com/derived/a%40320h.webp">' }];
    const gaps = findEmittedGaps({ pages, known });
    assert.equal(gaps.length, 1);
    assert.equal(gaps[0]?.reason, 'wrong-origin');
  });

  it('reports one URL once however many pages emit it', () => {
    const html = `<img src="${CDN}/derived/missing%40320h.webp">`;
    const pages = [
      { page: 'a.html', html },
      { page: 'b.html', html },
    ];
    assert.equal(findEmittedGaps({ pages, known }).length, 1);
  });
});

describe('scopedSources', () => {
  const sources: SourceInventory = {
    legacy: [
      { path: 'abagrotis-apposita/a.jpg', speciesSlug: 'abagrotis-apposita' },
      { path: 'digrammia-decorata/d.jpg', speciesSlug: 'digrammia-decorata' },
    ],
    highres: [
      { path: 'species-tiles/abagrotis-apposita/A-D_thumbnail.webp', speciesSlug: 'abagrotis-apposita' },
    ],
    glossary: [{ path: 'glossary/wing.jpg', speciesSlug: null }],
    plates: [{ path: 'plates/plate-0/thumbnail.jpg', speciesSlug: null }],
  };

  it('drops sources belonging to species that do not build', () => {
    const scoped = scopedSources(sources, new Set(['abagrotis-apposita']));
    assert.deepEqual(
      scoped.map((s) => s.path).sort(),
      [
        'abagrotis-apposita/a.jpg',
        'glossary/wing.jpg',
        'plates/plate-0/thumbnail.jpg',
        'species-tiles/abagrotis-apposita/A-D_thumbnail.webp',
      ],
    );
  });

  it('keeps species-less art regardless of the species scope', () => {
    // The glossary and plates pages are unconditional, so their images are
    // never out of scope.
    const scoped = scopedSources(sources, new Set());
    assert.deepEqual(scoped.map((s) => s.path).sort(), ['glossary/wing.jpg', 'plates/plate-0/thumbnail.jpg']);
  });

  it('carries the source kind through, since it decides the variant set', () => {
    const scoped = scopedSources(sources, new Set(['abagrotis-apposita']));
    assert.equal(scoped.find((s) => s.path === 'abagrotis-apposita/a.jpg')?.kind, 'legacy');
    assert.equal(scoped.find((s) => s.path.startsWith('species-tiles/'))?.kind, 'highres');
  });

  it('deduplicates a source shared by several rows', () => {
    const shared: SourceInventory = {
      legacy: [],
      highres: [],
      // Many glossary terms illustrate with the same file.
      glossary: [
        { path: 'glossary/wing.jpg', speciesSlug: null },
        { path: 'glossary/wing.jpg', speciesSlug: null },
      ],
      plates: [],
    };
    assert.equal(scopedSources(shared, new Set()).length, 1);
  });
});

describe('findSourceGaps', () => {
  const legacyEntry = { path: 'abagrotis-apposita/a.jpg', kind: 'legacy' as const, speciesSlug: 'abagrotis-apposita' };

  it('passes when the whole variant set is on the CDN', () => {
    const known = new Set([
      'derived/abagrotis-apposita/a@320h.webp',
      'derived/abagrotis-apposita/a@full.webp',
    ]);
    assert.deepEqual(findSourceGaps([legacyEntry], known), []);
  });

  it('names the missing variant when only part of the set was uploaded', () => {
    const known = new Set(['derived/abagrotis-apposita/a@full.webp']);
    const gaps = findSourceGaps([legacyEntry], known);
    assert.equal(gaps.length, 1);
    assert.deepEqual(gaps[0]?.missingVariants, ['320h']);
  });

  it('reports every variant for a source that was never processed at all', () => {
    // The case the guard exists for: a curator uploads a JPEG and nothing else.
    const gaps = findSourceGaps([legacyEntry], new Set());
    assert.deepEqual(gaps[0]?.missingVariants, ['320h', 'full']);
  });

  it('requires the four high-res variants, including the JPEG share card', () => {
    const gaps = findSourceGaps(
      [{ path: 'species-tiles/x/A-D_thumbnail.webp', kind: 'highres', speciesSlug: 'x' }],
      new Set(),
    );
    assert.deepEqual(gaps[0]?.missingVariants, ['530', '1060', '320h', '1200']);
  });
});

describe('buildableSlugs', () => {
  const withheld = new Set(['geometridae']);

  it('applies the same withheld-family gate as src/_data/species.ts', () => {
    const slugs = buildableSlugs(
      [
        { genus: 'Abagrotis', species: 'apposita', family: 'Noctuidae' },
        { genus: 'Digrammia', species: 'decorata', family: 'Geometridae' },
      ],
      withheld,
      new Set(),
    );
    assert.deepEqual([...slugs], ['abagrotis-apposita']);
  });

  it('excludes species with a blank family, which fail closed', () => {
    const slugs = buildableSlugs([{ genus: 'Aseptis', species: 'x', family: '' }], withheld, new Set());
    assert.equal(slugs.size, 0);
  });

  it('excludes deny-listed unpublished species', () => {
    const slugs = buildableSlugs(
      [{ genus: 'Aseptis', species: 'sp no 1', family: 'Noctuidae' }],
      withheld,
      new Set(['aseptis-sp-no-1']),
    );
    assert.equal(slugs.size, 0);
  });

  it('normalizes spaces in provisional epithets to hyphens', () => {
    const slugs = buildableSlugs(
      [{ genus: 'Aseptis', species: 'sp no 1', family: 'Noctuidae' }],
      withheld,
      new Set(),
    );
    assert.deepEqual([...slugs], ['aseptis-sp-no-1']);
  });
});
