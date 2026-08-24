// scripts/emit-hidden-images.test.ts
// Guards for the hidden-images advisory report (#299).
//
// The load-bearing behaviours, each of which fails SILENTLY and plausibly:
//   - view normalisation (dorsal/ventral vs D/V) — get it wrong and every row on every
//     tiled species is reported hidden, which reads fine at 3,500 rows
//   - cause precedence — a gated species must not be described as "hidden by tiles"
//   - cdn_status never overstating what the inventory establishes
//   - the binomial comparison catching coturnix, which a genus-only test does not
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeView,
  coverageKey,
  tileCoverage,
  classifyTileOutcome,
  filenameNameDiffers,
  buildHiddenImageRows,
  summarize,
  toCsv,
  loadMissingOnCdn,
  CAUSE_SEVERITY,
  HIDDEN_IMAGE_COLUMNS,
  type ImageInput,
  type SpeciesInput,
  type TileSpecimen,
  type BuildHiddenImageRowsOptions,
} from './emit-hidden-images.ts';

const NOCTUID: SpeciesInput = { genus: 'Phyllodesma', species: 'americana', common_name: '', family: 'Lasiocampidae' };

function image(overrides: Partial<ImageInput> = {}): ImageInput {
  return {
    species_slug: 'phyllodesma-americana',
    filename: 'Phyllodesma americana-A-D.jpg',
    specimen: 'A',
    view: 'dorsal',
    ...overrides,
  };
}

function options(overrides: Partial<BuildHiddenImageRowsOptions> = {}): BuildHiddenImageRowsOptions {
  return {
    images: [image()],
    species: new Map([['phyllodesma-americana', NOCTUID]]),
    tiled: new Map(),
    withheldFamilies: new Set(),
    unpublished: new Set(),
    missingOnCdn: new Set(),
    ...overrides,
  };
}

const TILES_A: TileSpecimen[] = [
  { specimen_id: 'A', view: 'D' },
  { specimen_id: 'A', view: 'V' },
];

describe('normalizeView', () => {
  it('maps both vocabularies onto D and V', () => {
    for (const raw of ['dorsal', 'Dorsal', ' DORSAL ', 'd', 'D']) {
      assert.equal(normalizeView(raw), 'D', raw);
    }
    for (const raw of ['ventral', 'Ventral', ' v ', 'V']) {
      assert.equal(normalizeView(raw), 'V', raw);
    }
  });

  it('returns empty for anything it cannot map, rather than guessing', () => {
    for (const raw of ['', '   ', 'lateral', 'label', 'dorsal-ish']) {
      assert.equal(normalizeView(raw), '', raw);
    }
  });
});

describe('coverageKey', () => {
  it('is case- and whitespace-insensitive on both halves', () => {
    assert.equal(coverageKey(' a ', 'Dorsal'), 'A|D');
    assert.equal(coverageKey('b', 'v'), 'B|V');
  });

  it('is null when either half is missing — never a partial key', () => {
    assert.equal(coverageKey('', 'dorsal'), null);
    assert.equal(coverageKey('A', ''), null);
    assert.equal(coverageKey('A', 'lateral'), null);
  });
});

describe('tileCoverage', () => {
  it('keys every published specimen', () => {
    assert.deepEqual([...tileCoverage(TILES_A)].sort(), ['A|D', 'A|V']);
  });

  it('skips specimens it cannot key rather than emitting a partial one', () => {
    assert.deepEqual([...tileCoverage([{ specimen_id: 'A', view: '' }])], []);
  });
});

describe('classifyTileOutcome', () => {
  const coverage = tileCoverage(TILES_A);

  it('calls a row superseded when the same specimen and view is tiled', () => {
    assert.equal(classifyTileOutcome(image(), coverage), 'superseded-by-tiles');
  });

  // The regression this exists for: dorsal vs D. Comparing raw strings matches
  // nothing, so every row looks hidden and the report is 100x too big.
  it('matches across the two view vocabularies', () => {
    assert.equal(classifyTileOutcome(image({ view: 'ventral' }), coverage), 'superseded-by-tiles');
  });

  it('calls a row hidden when no tile covers its specimen', () => {
    assert.equal(classifyTileOutcome(image({ specimen: 'C' }), coverage), 'hidden-by-tiles');
  });

  it('calls a row hidden when the specimen is tiled but that view is not', () => {
    const dorsalOnly = tileCoverage([{ specimen_id: 'A', view: 'D' }]);
    assert.equal(classifyTileOutcome(image({ view: 'ventral' }), dorsalOnly), 'hidden-by-tiles');
  });

  it('calls a row unmatchable rather than hidden when it cannot be keyed', () => {
    assert.equal(classifyTileOutcome(image({ specimen: '' }), coverage), 'unmatchable-by-tiles');
    assert.equal(classifyTileOutcome(image({ view: '' }), coverage), 'unmatchable-by-tiles');
  });
});

describe('filenameNameDiffers', () => {
  // The case the report is named after: same genus, different epithet.
  it('catches coturnix, which a genus-only comparison would miss', () => {
    assert.equal(filenameNameDiffers('Phyllodesma coturnix-C-D.jpg', 'Phyllodesma', 'americana'), true);
    assert.equal(filenameNameDiffers('Lacinipolia vicina-B-D.jpg', 'Lacinipolia', 'sareta'), true);
  });

  it('catches a changed genus', () => {
    assert.equal(filenameNameDiffers('Grammia margo-C-D.jpg', 'Apantesis', 'margo'), true);
  });

  it('accepts the matching name whichever separator follows it', () => {
    assert.equal(filenameNameDiffers('Phyllodesma americana-A-D.jpg', 'Phyllodesma', 'americana'), false);
    assert.equal(filenameNameDiffers('Euxoa absona A-D.jpg', 'Euxoa', 'absona'), false);
  });

  it('accepts an epithet containing a hyphen', () => {
    assert.equal(filenameNameDiffers('Xestia c-nigrum-A-v.jpg', 'Xestia', 'c-nigrum'), false);
  });

  it('accepts a provisional epithet containing a space', () => {
    assert.equal(filenameNameDiffers('Euxoa aff simulata-B-D.jpg', 'Euxoa', 'aff simulata'), false);
  });

  it('is case-insensitive', () => {
    assert.equal(filenameNameDiffers('phyllodesma AMERICANA-A-D.jpg', 'Phyllodesma', 'americana'), false);
  });
});

describe('buildHiddenImageRows — what is reported', () => {
  it('reports nothing for a displayed photograph', () => {
    assert.deepEqual(buildHiddenImageRows(options()), []);
  });

  it('skips a slug that joins to no species — the integrity gate owns that', () => {
    const rows = buildHiddenImageRows(options({ species: new Map() }));
    assert.deepEqual(rows, []);
  });

  it('normalizes the slug it joins and emits the normalized form', () => {
    const rows = buildHiddenImageRows(options({
      images: [image({ species_slug: 'Phyllodesma Americana' })],
      withheldFamilies: new Set(['lasiocampidae']),
    }));
    assert.equal(rows[0]?.species_slug, 'phyllodesma-americana');
  });
});

describe('buildHiddenImageRows — cause precedence', () => {
  // A gated species has no page at all, so "hidden by tiles" would be a false
  // explanation even though the tiles branch would also have hidden the row.
  it('reports a withheld family ahead of the tile rules', () => {
    const rows = buildHiddenImageRows(options({
      images: [image({ specimen: 'C' })],
      tiled: new Map([['phyllodesma-americana', TILES_A]]),
      withheldFamilies: new Set(['lasiocampidae']),
    }));
    assert.equal(rows[0]?.cause, 'family-withheld');
    assert.match(rows[0]?.detail ?? '', /no species page is built/);
  });

  it('reports a blank family as withheld, and says so in the detail', () => {
    const rows = buildHiddenImageRows(options({
      species: new Map([['phyllodesma-americana', { ...NOCTUID, family: '' }]]),
    }));
    assert.equal(rows[0]?.cause, 'family-withheld');
    assert.match(rows[0]?.detail ?? '', /no family/);
  });

  it('reports the deny-list ahead of the tile rules', () => {
    const rows = buildHiddenImageRows(options({
      images: [image({ specimen: 'C' })],
      tiled: new Map([['phyllodesma-americana', TILES_A]]),
      unpublished: new Set(['phyllodesma-americana']),
    }));
    assert.equal(rows[0]?.cause, 'species-unpublished');
  });

  it('reports cdn-missing only for a row that would otherwise render', () => {
    const rows = buildHiddenImageRows(options({
      missingOnCdn: new Set(['phyllodesma-americana/Phyllodesma americana-A-D.jpg']),
    }));
    assert.equal(rows[0]?.cause, 'cdn-missing');
  });

  it('keeps cdn_status on a row whose cause is something else', () => {
    const rows = buildHiddenImageRows(options({
      tiled: new Map([['phyllodesma-americana', TILES_A]]),
      missingOnCdn: new Set(['phyllodesma-americana/Phyllodesma americana-A-D.jpg']),
    }));
    assert.equal(rows[0]?.cause, 'superseded-by-tiles');
    assert.equal(rows[0]?.cdn_status, 'missing');
  });
});

describe('buildHiddenImageRows — cdn_status', () => {
  it('never claims presence: a row the inventory did not flag is not-reported-missing', () => {
    const rows = buildHiddenImageRows(options({
      tiled: new Map([['phyllodesma-americana', TILES_A]]),
    }));
    assert.equal(rows[0]?.cdn_status, 'not-reported-missing');
  });

  // An absent inventory is no evidence either way. An empty set would be a claim.
  it('is unknown for every row when there is no inventory report', () => {
    const rows = buildHiddenImageRows(options({
      tiled: new Map([['phyllodesma-americana', TILES_A]]),
      missingOnCdn: null,
    }));
    assert.equal(rows[0]?.cdn_status, 'unknown');
  });

  it('does not raise cdn-missing as a cause when the inventory is absent', () => {
    const rows = buildHiddenImageRows(options({ missingOnCdn: null }));
    assert.deepEqual(rows, []);
  });
});

describe('buildHiddenImageRows — links', () => {
  it('percent-encodes the filename in the image URL', () => {
    const rows = buildHiddenImageRows(options({
      withheldFamilies: new Set(['lasiocampidae']),
    }));
    assert.equal(
      rows[0]?.image_url,
      'https://moths.pnwinsects.org/phyllodesma-americana/Phyllodesma%20americana-A-D.jpg',
    );
  });

  it('omits the species page URL when no page is built', () => {
    const withheld = buildHiddenImageRows(options({ withheldFamilies: new Set(['lasiocampidae']) }));
    assert.equal(withheld[0]?.species_page_url, '');
    const denied = buildHiddenImageRows(options({ unpublished: new Set(['phyllodesma-americana']) }));
    assert.equal(denied[0]?.species_page_url, '');
  });

  it('gives the species page URL when the page exists', () => {
    const rows = buildHiddenImageRows(options({
      images: [image({ specimen: 'C' })],
      tiled: new Map([['phyllodesma-americana', TILES_A]]),
    }));
    assert.equal(rows[0]?.species_page_url, 'https://moths.pnwinsects.org/species/phyllodesma-americana/');
  });
});

describe('buildHiddenImageRows — ordering', () => {
  it('sorts worst-first by cause, then by slug, then by filename', () => {
    const rows = buildHiddenImageRows(options({
      images: [
        image({ species_slug: 'zzz-species', filename: 'Zzz species-A-D.jpg' }),
        image({ specimen: 'C', filename: 'Phyllodesma americana-C-D.jpg' }),
        image({ filename: 'Phyllodesma americana-A-V.jpg', view: 'ventral' }),
      ],
      species: new Map([
        ['phyllodesma-americana', NOCTUID],
        ['zzz-species', { genus: 'Zzz', species: 'species', common_name: '', family: 'Geometridae' }],
      ]),
      tiled: new Map([['phyllodesma-americana', TILES_A]]),
      withheldFamilies: new Set(['geometridae']),
    }));
    assert.deepEqual(rows.map((r) => r.cause), [
      'hidden-by-tiles',
      'family-withheld',
      'superseded-by-tiles',
    ]);
  });

  it('puts superseded-by-tiles last in the severity table', () => {
    const worst = Math.max(...Object.values(CAUSE_SEVERITY));
    assert.equal(CAUSE_SEVERITY['superseded-by-tiles'], worst);
    assert.equal(CAUSE_SEVERITY['hidden-by-tiles'], 0);
  });
});

describe('toCsv', () => {
  it('emits the declared columns in order', () => {
    assert.equal(toCsv([]).trim(), HIDDEN_IMAGE_COLUMNS.join(','));
  });

  it('quotes a detail containing a comma, doubling embedded quotes', () => {
    const rows = buildHiddenImageRows(options({
      images: [image({ filename: 'Odd, "quoted" name-A-D.jpg' })],
      withheldFamilies: new Set(['lasiocampidae']),
    }));
    const line = toCsv(rows).split('\n')[1] ?? '';
    assert.match(line, /"Odd, ""quoted"" name-A-D\.jpg"/);
  });
});

describe('summarize', () => {
  it('counts by cause', () => {
    const rows = buildHiddenImageRows(options({
      images: [image({ specimen: 'C' }), image({ specimen: 'D' }), image()],
      tiled: new Map([['phyllodesma-americana', TILES_A]]),
    }));
    assert.deepEqual(summarize(rows), { 'hidden-by-tiles': 2, 'superseded-by-tiles': 1 });
  });
});

describe('loadMissingOnCdn', () => {
  it('returns null — not an empty set — when the inventory is absent', () => {
    assert.equal(loadMissingOnCdn('data/no-such-inventory-report.csv'), null);
  });

  it('reads only missing-photo findings from the real report', () => {
    const missing = loadMissingOnCdn('data/cdn-inventory-report.csv');
    assert.ok(missing !== null, 'the committed inventory report should be on disk');
    assert.ok(missing.size > 0);
    for (const path of missing) assert.ok(path.includes('/'), `${path} should be slug/filename`);
  });
});
