import { describe, it, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildReport,
  classify,
  findMissing,
  isPyramidDir,
  loadSources,
  plateSlugOf,
  speciesSlugOf,
  summarize,
  tilePairOf,
  type Sources,
  type Unit,
} from './emit-cdn-inventory.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** A Sources with every index empty, so each test states exactly what accounts for what. */
function sources(overrides: Partial<Sources> = {}): Sources {
  return {
    site: new Set(),
    derivatives: new Set(),
    photos: new Set(),
    retired: new Map(),
    glossaryImages: new Set(),
    keyImages: new Set(),
    tilePairs: new Set(),
    plateSlugs: new Set(),
    speciesSlugs: new Set(),
    gatedSlugs: new Set(),
    siteDirs: new Set(),
    ...overrides,
  };
}

const object = (path: string, bytes = 1): Unit => ({ path, kind: 'object', bytes });
const pyramid = (path: string): Unit => ({ path, kind: 'tile-pyramid', bytes: null });

// ---------------------------------------------------------------------------
// Path shapes
// ---------------------------------------------------------------------------

describe('isPyramidDir', () => {
  it('recognises both tile conventions', () => {
    assert.equal(isPyramidDir('species-tiles/abagrotis-apposita/A-D_files/'), true);
    assert.equal(isPyramidDir('plates/plate-1-drepanidae/TileGroup0/'), true);
  });

  it('leaves ordinary directories alone', () => {
    assert.equal(isPyramidDir('species-tiles/abagrotis-apposita/'), false);
    assert.equal(isPyramidDir('plates/plate-1-drepanidae/'), false);
    assert.equal(isPyramidDir('species/abagrotis-apposita/'), false);
  });

  it('does not mistake a TileGroup-ish name for a pyramid', () => {
    assert.equal(isPyramidDir('plates/x/TileGroupNotes/'), false);
  });
});

describe('tilePairOf', () => {
  // One photo scatters into three sibling names; all three must land on one pair.
  it('folds the descriptor, the pyramid and the thumbnail onto one prefix', () => {
    const pair = 'species-tiles/abagrotis-apposita/A-D';
    assert.equal(tilePairOf('species-tiles/abagrotis-apposita/A-D.dzi'), pair);
    assert.equal(tilePairOf('species-tiles/abagrotis-apposita/A-D_files'), pair);
    assert.equal(tilePairOf('species-tiles/abagrotis-apposita/A-D_files/12/3_4.webp'), pair);
    assert.equal(tilePairOf('species-tiles/abagrotis-apposita/A-D_thumbnail.webp'), pair);
  });

  it('keeps a WWUC specimen id intact', () => {
    assert.equal(
      tilePairOf('species-tiles/feltia-herilis/WWUC0000003275-V_files/0/0_0.webp'),
      'species-tiles/feltia-herilis/WWUC0000003275-V',
    );
  });

  it('is null outside the tile prefix', () => {
    assert.equal(tilePairOf('abagrotis-apposita/Abagrotis apposita-A-D.jpg'), null);
    assert.equal(tilePairOf('species-tiles/abagrotis-apposita'), null);
  });
});

describe('speciesSlugOf', () => {
  it('reads the slug out of each prefix that carries one', () => {
    assert.equal(speciesSlugOf('species/abagrotis-apposita/index.html'), 'abagrotis-apposita');
    assert.equal(speciesSlugOf('species-tiles/abagrotis-apposita/A-D.dzi'), 'abagrotis-apposita');
    assert.equal(speciesSlugOf('abagrotis-apposita/Abagrotis apposita-A-D.jpg'), 'abagrotis-apposita');
  });

  it('sees through the derived/ mirror to the source path', () => {
    assert.equal(
      speciesSlugOf('derived/abagrotis-apposita/Abagrotis apposita-A-D@320h.webp'),
      'abagrotis-apposita',
    );
    assert.equal(
      speciesSlugOf('derived/species-tiles/abagrotis-apposita/A-D_thumbnail@1060.webp'),
      'abagrotis-apposita',
    );
  });

  // The zone predates normalizeSlug: `plataea-n sp` and `caripeta -divisata`
  // are real folders. Naming the species they claim beats calling them unknown.
  it('reads a malformed folder as the species claim it makes', () => {
    assert.equal(speciesSlugOf('plataea-n sp/Plataea n sp-A-D.jpg'), 'plataea-n sp');
    assert.equal(speciesSlugOf('caripeta -divisata/x.jpg'), 'caripeta -divisata');
  });

  it('claims no slug for site paths or non-species prefixes', () => {
    assert.equal(speciesSlugOf('css/style.css'), null);
    assert.equal(speciesSlugOf('assets/index-a1b2c3.js'), null);
    assert.equal(speciesSlugOf('favicon.ico'), null);
    assert.equal(speciesSlugOf('glossary/Veins_jpg.jpg'), null);
    assert.equal(speciesSlugOf('key-images/US_Coast Range.webp'), null);
    assert.equal(speciesSlugOf('plates/plate-1-drepanidae/thumbnail.jpg'), null);
  });
});

describe('plateSlugOf', () => {
  it('reads the plate slug, and only under plates/', () => {
    assert.equal(plateSlugOf('plates/plate-1-drepanidae/TileGroup0'), 'plate-1-drepanidae');
    assert.equal(plateSlugOf('plates/'), null);
    assert.equal(plateSlugOf('plate-1-drepanidae/thumbnail.jpg'), null);
  });
});

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

describe('classify', () => {
  it('attributes each object to the artifact that explains it', () => {
    const s = sources({
      site: new Set(['species/abagrotis-apposita/index.html']),
      derivatives: new Set(['derived/abagrotis-apposita/x@320h.webp']),
      photos: new Set(['abagrotis-apposita/x.jpg']),
      retired: new Map([['capsula-alameda/y.jpg', 'globia-alameda/y.jpg']]),
      glossaryImages: new Set(['glossary/Veins_jpg.jpg']),
      keyImages: new Set(['key-images/US_Coast Range.webp']),
      tilePairs: new Set(['species-tiles/abagrotis-apposita/A-D']),
      plateSlugs: new Set(['plate-1-drepanidae']),
    });
    const at = (path: string): string => classify(object(path), s).accounting;

    assert.equal(at('_site-manifest.json'), 'deploy-manifest');
    assert.equal(at('species/abagrotis-apposita/index.html'), 'site');
    assert.equal(at('derived/abagrotis-apposita/x@320h.webp'), 'derivative');
    assert.equal(at('abagrotis-apposita/x.jpg'), 'photo');
    assert.equal(at('capsula-alameda/y.jpg'), 'retired-photo');
    assert.equal(at('glossary/Veins_jpg.jpg'), 'glossary-image');
    assert.equal(at('key-images/US_Coast Range.webp'), 'key-image');
    assert.equal(at('species-tiles/abagrotis-apposita/A-D.dzi'), 'tiles');
    assert.equal(at('plates/plate-1-drepanidae/TileGroup0/0-0-0.jpg'), 'plate');
  });

  // 99,082 of the zone's objects are abandoned Vite bundles and Pagefind shards.
  // Reporting them would bury the ~800 findings a human can act on.
  it('accounts for content-addressed build output instead of reporting it', () => {
    const s = sources({ siteDirs: new Set(['assets', 'pagefind']) });
    assert.equal(classify(object('assets/about/credits/index-BGogE89j.js'), s).accounting, 'superseded-build');
    assert.equal(classify(object('pagefind/fragment/en_011a5db.pf_fragment'), s).accounting, 'superseded-build');
    assert.equal(classify(object('_analytics/2026-06-29.json'), s).accounting, 'analytics');
  });

  it('accounts for a whole pyramid without listing it', () => {
    const s = sources({ tilePairs: new Set(['species-tiles/abagrotis-apposita/A-D']) });
    assert.equal(classify(pyramid('species-tiles/abagrotis-apposita/A-D_files/'), s).accounting, 'tiles');
  });

  it('says why a retired image is still there', () => {
    const s = sources({ retired: new Map([['capsula-alameda/y.jpg', 'globia-alameda/y.jpg']]) });
    assert.equal(classify(object('capsula-alameda/y.jpg'), s).detail, 'superseded by globia-alameda/y.jpg');
  });

  // The #268/#273/#275 shape: a page or its Parquet, published once and never
  // removed, absent from the manifest of the build that is live now.
  it('calls a site path outside the current manifest a stale-site leftover', () => {
    const s = sources({
      speciesSlugs: new Set(['holoarctia-sp']),
      gatedSlugs: new Set(['holoarctia-sp']),
      siteDirs: new Set(['species']),
    });
    const page = classify(object('species/holoarctia-sp/index.html'), s);
    assert.equal(page.accounting, 'unaccounted');
    assert.equal(page.shape, 'stale-site');
    assert.match(page.detail, /not in the current _site-manifest\.json/);
    assert.match(page.detail, /holoarctia-sp is gated and gets no page/);

    assert.equal(classify(object('species/holoarctia-sp/records.parquet'), s).shape, 'stale-site');
  });

  it('names the species a leftover belongs to, and whether it exists at all', () => {
    const s = sources({ speciesSlugs: new Set(['globia-alameda']) });
    assert.match(
      classify(object('capsula-alameda/Capsula alameda-A-D.jpg'), s).detail,
      /capsula-alameda is not in data\/species\.csv/,
    );
    assert.match(classify(object('globia-alameda/extra.jpg'), s).detail, /globia-alameda is published/);
  });

  it('distinguishes the shapes a maintainer would act on differently', () => {
    const s = sources();
    assert.equal(classify(object('abagrotis-apposita/x.jpg'), s).shape, 'photo-no-row');
    assert.equal(classify(object('derived/abagrotis-apposita/x@320h.webp'), s).shape, 'derivative-no-source');
    assert.equal(classify(pyramid('species-tiles/abagrotis-apposita/A-D_files/'), s).shape, 'tiles-no-photo');
    assert.equal(classify(object('plates/plate-99-nope/thumbnail.jpg'), s).shape, 'plate-no-manifest');
    assert.equal(classify(object('glossary/unused.jpg'), s).shape, 'glossary-no-row');
    assert.equal(classify(object('key-images/unused.webp'), s).shape, 'key-image-no-row');
    assert.equal(classify(object('some-file.txt'), s).shape, 'unknown');
  });

  // ADDING_PLATE.md strips the local `plates/` prefix on upload while every
  // template reads `plates/{slug}/`. If that ever ran, the tiles land at the
  // zone root — a shape worth naming rather than filing under "unknown".
  it('names plate tiles that landed at the zone root', () => {
    const found = classify(object('plate-1-drepanidae/ImageProperties.xml'), sources());
    assert.equal(found.shape, 'plate-at-zone-root');
    assert.match(found.detail, /ADDING_PLATE\.md/);
  });
});

// ---------------------------------------------------------------------------
// The artifacts
// ---------------------------------------------------------------------------

describe('buildReport', () => {
  const s = sources({ photos: new Set(['abagrotis-apposita/x.jpg']) });
  const units = [object('zzz-orphan/late.jpg'), object('abagrotis-apposita/x.jpg'), object('aaa-orphan/early.jpg')];

  it('reports only what nothing accounts for', () => {
    assert.deepEqual(buildReport(units, s).map((r) => r.path), ['aaa-orphan/early.jpg', 'zzz-orphan/late.jpg']);
  });

  // The report is committed, so a stable order is what keeps its diff readable
  // — the listing arrives in whatever order concurrent directory walks finish.
  it('sorts by path regardless of listing order', () => {
    const forward = buildReport(units, s).map((r) => r.path);
    const reversed = buildReport([...units].reverse(), s).map((r) => r.path);
    assert.deepEqual(forward, reversed);
  });

  it('leaves bytes blank for a pyramid, whose contents were never listed', () => {
    const [row] = buildReport([pyramid('species-tiles/x/A-D_files/')], sources());
    assert.equal(row?.bytes, '');
    assert.equal(row?.unit, 'tile-pyramid');
  });
});

// The inventory's other direction. #232's 83 rows were invisible for months
// because every other check runs repo→zone over derived paths only.
describe('findMissing', () => {
  it('names a photo row whose object was never uploaded', () => {
    const s = sources({ photos: new Set(['a-b/there.jpg', 'a-b/gone.jpg']) });
    const rows = findMissing([object('a-b/there.jpg')], s);
    assert.deepEqual(rows.map((r) => r.path), ['a-b/gone.jpg']);
    assert.equal(rows[0]?.shape, 'missing-photo');
    assert.equal(rows[0]?.species_slug, 'a-b');
  });

  it('matches tiles by pyramid, not by object — the listing stops at _files/', () => {
    const s = sources({ tilePairs: new Set(['species-tiles/a-b/A-D', 'species-tiles/a-b/A-V']) });
    const rows = findMissing([pyramid('species-tiles/a-b/A-D_files/')], s);
    assert.deepEqual(rows.map((r) => r.path), ['species-tiles/a-b/A-V']);
    assert.equal(rows[0]?.shape, 'missing-tiles');
  });

  it('finds nothing when the zone holds everything the repo claims', () => {
    const s = sources({
      photos: new Set(['a-b/x.jpg']),
      derivatives: new Set(['derived/a-b/x@320h.webp']),
      glossaryImages: new Set(['glossary/v.jpg']),
      keyImages: new Set(['key-images/k.webp']),
    });
    const units = [object('a-b/x.jpg'), object('derived/a-b/x@320h.webp'), object('glossary/v.jpg'), object('key-images/k.webp')];
    assert.deepEqual(findMissing(units, s), []);
  });
});

test('summarize counts every unit exactly once', () => {
  const s = sources({ photos: new Set(['a-b/x.jpg']) });
  const totals = summarize([object('a-b/x.jpg', 10), object('c-d/y.jpg', 5), pyramid('species-tiles/e/A-D_files/')], s);
  assert.equal(totals.get('photo')?.units, 1);
  assert.equal(totals.get('photo')?.bytes, 10);
  assert.equal(totals.get('unaccounted')?.units, 2);
  // A pyramid contributes no bytes, so a byte total is never a claim about tiles.
  assert.equal(totals.get('unaccounted')?.bytes, 5);
});

// ---------------------------------------------------------------------------
// Wiring to the real data files
// ---------------------------------------------------------------------------

describe('loadSources', () => {
  const loaded = loadSources(resolve(ROOT, 'data'), new Set(['species/abagrotis-apposita/index.html', 'favicon.ico']));

  it('reads a non-empty index from every source of truth', () => {
    // An index that silently reads empty turns its whole asset class into
    // orphans — the failure this report exists to prevent, not to cause.
    for (const [name, size] of [
      ['derivatives', loaded.derivatives.size],
      ['photos', loaded.photos.size],
      ['retired', loaded.retired.size],
      ['glossaryImages', loaded.glossaryImages.size],
      ['keyImages', loaded.keyImages.size],
      ['tilePairs', loaded.tilePairs.size],
      ['plateSlugs', loaded.plateSlugs.size],
      ['speciesSlugs', loaded.speciesSlugs.size],
      ['gatedSlugs', loaded.gatedSlugs.size],
      ['siteDirs', loaded.siteDirs.size],
    ] as const) {
      assert.ok(size > 0, `${name} index is empty — everything it covers would report as an orphan`);
    }
  });

  it('reads the site directories off the manifest, ignoring root-level files', () => {
    assert.deepEqual([...loaded.siteDirs], ['species']);
  });

  it('indexes photos by the raw CSV cell, exactly as the object is named', () => {
    const first = readFileSync(resolve(ROOT, 'data/images.csv'), 'utf8').split('\n')[1] ?? '';
    const [slug, filename] = first.split(',');
    assert.ok(loaded.photos.has(`${slug}/${filename}`), `images.csv row 1 should index as ${slug}/${filename}`);
  });

  it('only counts tiles the uploader confirmed reached the zone', () => {
    // `tiled` means the pyramid is on the workstation. A pyramid in the zone for
    // a `tiled` row is a real finding, so it must not be pre-excused here.
    for (const pair of loaded.tilePairs) assert.match(pair, /^species-tiles\/[^/]+\/.+/);
    assert.ok(loaded.tilePairs.size < 4938, 'every manifest row cannot be an uploaded row');
  });
});
