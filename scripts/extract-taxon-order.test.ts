import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRows,
  normalizeSlug,
  taxonKey,
  buildPositionIndex,
  buildSpeciesPositionIndex,
  sortByPosition,
  orderGenusSpecies,
  findDeviatingGenera,
  toCsv,
  toSpeciesCsv,
} from './extract-taxon-order.ts';

describe('parseRows', () => {
  it('parses mysql --batch -N output into lft/slug pairs', () => {
    assert.deepEqual(parseRows('5\tgeometridae\n1283\tfamily-drepanidae\n'), [
      { lft: 5, slug: 'geometridae' },
      { lft: 1283, slug: 'family-drepanidae' },
    ]);
  });

  it('ignores the trailing blank line mysql always emits', () => {
    assert.equal(parseRows('5\tgeometridae\n').length, 1);
  });

  it('throws on a row with the wrong column count rather than mis-parsing it', () => {
    assert.throws(() => parseRows('5\tgeometridae\textra\n'), /malformed row/);
    assert.throws(() => parseRows('geometridae\n'), /malformed row/);
  });

  it('throws on a non-numeric lft or an empty slug', () => {
    assert.throws(() => parseRows('abc\tgeometridae\n'), /malformed row/);
    assert.throws(() => parseRows('5\t\n'), /malformed row/);
  });
});

describe('normalizeSlug', () => {
  it('strips the rank prefix published lineages use in their URLs', () => {
    assert.equal(normalizeSlug('family-erebidae'), 'erebidae');
    assert.equal(normalizeSlug('subfamily-lymantriinae'), 'lymantriinae');
    assert.equal(normalizeSlug('tribe-orgyiini'), 'orgyiini');
  });

  it('leaves the unprefixed Geometridae-subtree convention alone', () => {
    assert.equal(normalizeSlug('larentiinae'), 'larentiinae');
    assert.equal(normalizeSlug('xanthorhoini'), 'xanthorhoini');
  });

  it('strips the -copy suffix left by duplicated CMS pages', () => {
    assert.equal(normalizeSlug('xanthorhoe-alticolata-copy'), 'xanthorhoe-alticolata');
    assert.equal(normalizeSlug('macaria-andersoni-copy2'), 'macaria-andersoni');
  });

  it('does not strip a prefix that only looks like one mid-name', () => {
    // A binomial whose epithet starts with a rank word must survive intact.
    assert.equal(normalizeSlug('idia-tribe'), 'idia-tribe');
  });
});

describe('taxonKey', () => {
  it('lowercases and trims, so whitespace-dirty legacy names still join', () => {
    assert.equal(taxonKey('  Erebidae '), 'erebidae');
    assert.equal(taxonKey('Lymantriini'), 'lymantriini');
  });
});

describe('buildPositionIndex', () => {
  it('indexes higher taxa by normalized name', () => {
    const index = buildPositionIndex([
      { lft: 1283, slug: 'family-drepanidae' },
      { lft: 1284, slug: 'subfamily-thyatirinae' },
      { lft: 1285, slug: 'habrosyne' },
    ]);
    assert.deepEqual([...index.entries()], [
      ['drepanidae', 1283],
      ['thyatirinae', 1284],
      ['habrosyne', 1285],
    ]);
  });

  it('skips binomial (species) pages — this file records higher taxa only', () => {
    const index = buildPositionIndex([
      { lft: 1285, slug: 'habrosyne' },
      { lft: 1286, slug: 'habrosyne-scripta' },
    ]);
    assert.deepEqual([...index.keys()], ['habrosyne']);
  });

  it('keeps the leftmost position when a -copy duplicate shares a name', () => {
    const index = buildPositionIndex([
      { lft: 90, slug: 'xanthorhoe' },
      { lft: 40, slug: 'xanthorhoe-copy' },
    ]);
    assert.equal(index.get('xanthorhoe'), 40);
  });
});

describe('sortByPosition', () => {
  it('orders by nested-set position, which nests children inside their parent', () => {
    const sorted = sortByPosition([
      { rank: 'genus', name: 'Habrosyne', lft: 1285 },
      { rank: 'family', name: 'Drepanidae', lft: 1283 },
      { rank: 'subfamily', name: 'Thyatirinae', lft: 1284 },
    ]);
    assert.deepEqual(sorted.map(t => t.name), ['Drepanidae', 'Thyatirinae', 'Habrosyne']);
  });

  it('breaks a position tie outermost-rank-first', () => {
    const sorted = sortByPosition([
      { rank: 'genus', name: 'B', lft: 7 },
      { rank: 'subfamily', name: 'A', lft: 7 },
    ]);
    assert.deepEqual(sorted.map(t => t.name), ['A', 'B']);
  });

  it('does not mutate its input', () => {
    const input = [
      { rank: 'genus' as const, name: 'B', lft: 9 },
      { rank: 'genus' as const, name: 'A', lft: 1 },
    ];
    sortByPosition(input);
    assert.deepEqual(input.map(t => t.name), ['B', 'A']);
  });
});

describe('buildSpeciesPositionIndex', () => {
  const known = new Set(['sphinx-chersis', 'sphinx-luscitiosa']);

  it('keeps only species the site actually has', () => {
    const index = buildSpeciesPositionIndex(
      [
        { lft: 10, slug: 'sphinx-chersis' },
        { lft: 11, slug: 'sphinx-obsoleta' }, // legacy-only
        { lft: 12, slug: 'sphinx-luscitiosa' },
      ],
      known,
    );
    assert.deepEqual([...index.keys()], ['sphinx-chersis', 'sphinx-luscitiosa']);
  });

  it('admits a hyphenated genus page if the site set says it is a species', () => {
    // A genus whose name contains a space slugs with a hyphen; membership is
    // decided by the caller's set, not by counting hyphens.
    const index = buildSpeciesPositionIndex(
      [{ lft: 3, slug: 'foo-bar' }],
      new Set(['foo-bar']),
    );
    assert.equal(index.get('foo-bar'), 3);
  });

  it('collapses a -copy duplicate onto the leftmost position', () => {
    const index = buildSpeciesPositionIndex(
      [
        { lft: 90, slug: 'sphinx-chersis' },
        { lft: 40, slug: 'sphinx-chersis-copy' },
      ],
      known,
    );
    assert.equal(index.get('sphinx-chersis'), 40);
  });
});

describe('orderGenusSpecies', () => {
  it('orders by legacy position, not alphabetically', () => {
    const positions = new Map([['noctua-pronuba', 5], ['noctua-comes', 9]]);
    assert.deepEqual(
      orderGenusSpecies(['noctua-comes', 'noctua-pronuba'], positions),
      ['noctua-pronuba', 'noctua-comes'],
    );
  });

  it('appends species with no legacy position, alphabetically among themselves', () => {
    const positions = new Map([['euxoa-zeta', 1]]);
    assert.deepEqual(
      orderGenusSpecies(['euxoa-scandens', 'euxoa-aurantiaca', 'euxoa-zeta'], positions),
      ['euxoa-zeta', 'euxoa-aurantiaca', 'euxoa-scandens'],
    );
  });

  it('does not mutate its input', () => {
    const slugs = ['b', 'a'];
    orderGenusSpecies(slugs, new Map());
    assert.deepEqual(slugs, ['b', 'a']);
  });
});

describe('findDeviatingGenera', () => {
  it('emits a genus whose legacy order is not alphabetical, in full', () => {
    const species = [
      { genus: 'Noctua', slug: 'noctua-comes' },
      { genus: 'Noctua', slug: 'noctua-pronuba' },
    ];
    const positions = new Map([['noctua-pronuba', 5], ['noctua-comes', 9]]);
    assert.deepEqual(findDeviatingGenera(species, positions), [
      { genus: 'Noctua', slugs: ['noctua-pronuba', 'noctua-comes'] },
    ]);
  });

  it('omits an alphabetical genus entirely', () => {
    const species = [
      { genus: 'Drepana', slug: 'drepana-arcuata' },
      { genus: 'Drepana', slug: 'drepana-bilineata' },
    ];
    const positions = new Map([['drepana-arcuata', 1], ['drepana-bilineata', 2]]);
    assert.deepEqual(findDeviatingGenera(species, positions), []);
  });

  it('does not flag a genus merely because a new species has no legacy position', () => {
    // euxoa-aurantiaca sorts first alphabetically but lands last for want of a
    // position. That is our fallback, not evidence the legacy order differed.
    const species = [
      { genus: 'Euxoa', slug: 'euxoa-aurantiaca' },
      { genus: 'Euxoa', slug: 'euxoa-basalis' },
      { genus: 'Euxoa', slug: 'euxoa-cana' },
    ];
    const positions = new Map([['euxoa-basalis', 1], ['euxoa-cana', 2]]);
    assert.deepEqual(findDeviatingGenera(species, positions), []);
  });

  it('still emits unpositioned species when the genus does deviate', () => {
    const species = [
      { genus: 'Amphipoea', slug: 'amphipoea-americana' },
      { genus: 'Amphipoea', slug: 'amphipoea-keiferi' },
      { genus: 'Amphipoea', slug: 'amphipoea-interoceanica' },
      { genus: 'Amphipoea', slug: 'amphipoea-n-sp' },
    ];
    const positions = new Map([
      ['amphipoea-americana', 1],
      ['amphipoea-keiferi', 2],
      ['amphipoea-interoceanica', 3],
    ]);
    assert.deepEqual(findDeviatingGenera(species, positions), [
      {
        genus: 'Amphipoea',
        slugs: [
          'amphipoea-americana',
          'amphipoea-keiferi',
          'amphipoea-interoceanica',
          'amphipoea-n-sp',
        ],
      },
    ]);
  });

  it('handles a single-species genus without flagging it', () => {
    assert.deepEqual(
      findDeviatingGenera([{ genus: 'Tolype', slug: 'tolype-laricis' }], new Map()),
      [],
    );
  });
});

describe('toSpeciesCsv', () => {
  it('emits a genus,species_slug header and one row per species, in order', () => {
    assert.equal(
      toSpeciesCsv([{ genus: 'Noctua', slugs: ['noctua-pronuba', 'noctua-comes'] }]),
      'genus,species_slug\nNoctua,noctua-pronuba\nNoctua,noctua-comes\n',
    );
  });

  it('emits a header-only file when every genus is alphabetical', () => {
    assert.equal(toSpeciesCsv([]), 'genus,species_slug\n');
  });
});

describe('toCsv', () => {
  it('emits a rank,name header and one row per taxon, preserving order', () => {
    assert.equal(
      toCsv([
        { rank: 'family', name: 'Drepanidae' },
        { rank: 'subfamily', name: 'Thyatirinae' },
      ]),
      'rank,name\nfamily,Drepanidae\nsubfamily,Thyatirinae\n',
    );
  });

  it('emits a header-only file for no taxa', () => {
    assert.equal(toCsv([]), 'rank,name\n');
  });
});
