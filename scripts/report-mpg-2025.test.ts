import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  authorityKey,
  findDifferences,
  formatAuthority,
  pNumberKey,
  readSpecies,
  type Mpg2025Row,
  type Mpg2025Species,
  type SpeciesRow,
} from './report-mpg-2025.ts';

const row = (fields: Partial<Mpg2025Row>): Mpg2025Row => ({
  'SORT 2025': '',
  status: 'P&N23',
  rank: '',
  Family: '',
  Subfamily: '',
  'P-No. 2025': '',
  'P-No. 2023': '',
  'Valid Genus': '',
  'valid species': '',
  NAME: '',
  brackets: '',
  author: '',
  date: '',
  ...fields,
});

const ours = (fields: Partial<SpeciesRow>): SpeciesRow => ({
  genus: '',
  species: '',
  authority: '',
  family: '',
  subfamily: '',
  tribe: '',
  ...fields,
});

const mpgSpecies = (fields: Partial<Mpg2025Species>): Mpg2025Species => ({
  genus: '',
  species: '',
  status: 'P&N23',
  family: '',
  subfamily: '',
  tribe: '',
  tribePlaceholder: '',
  pNo2025: '',
  pNo2023: '',
  authority: '',
  ...fields,
});

describe('formatAuthority', () => {
  it('writes brackets only where MPG marks them', () => {
    assert.equal(formatAuthority({ brackets: '(', author: 'Walker', date: '1862' }), '(Walker, 1862)');
    assert.equal(formatAuthority({ brackets: '', author: 'Hulst', date: '1896' }), 'Hulst, 1896');
  });

  it('is blank when MPG gives no author', () => {
    assert.equal(formatAuthority({ brackets: '(', author: '', date: '' }), '');
  });
});

describe('authorityKey', () => {
  it('ignores initials and spacing', () => {
    assert.equal(authorityKey('(Hy. Edwards,1890)'), authorityKey('(Edwards, 1890)'));
    assert.equal(authorityKey('(W. Kirby, 1837)'), authorityKey('(Kirby, 1837)'));
  });

  it('keeps a bracketed year, which is a difference of fact', () => {
    assert.notEqual(authorityKey('(Stretch, [1874])'), authorityKey('(Stretch, 1874)'));
  });
});

describe('pNumberKey', () => {
  it('treats the hyphen as formatting', () => {
    assert.equal(pNumberKey('85-0003'), pNumberKey('850003'));
    assert.notEqual(pNumberKey('91a0700.11n'), pNumberKey('91a0704'));
  });
});

describe('readSpecies', () => {
  it('gives each species the tribe above it, and ends a tribe at the next subfamily', () => {
    const species = readSpecies([
      row({ rank: '3.0 subfam', NAME: 'Ennominae' }),
      row({ rank: '4.0 tribe', NAME: 'Macariini' }),
      row({ rank: '6.0 genus', NAME: 'Speranza' }),
      row({ rank: '8.0 valsp', 'Valid Genus': 'Speranza', 'valid species': 'brunneata', Subfamily: 'Ennominae' }),
      row({ rank: '8.5 spsyn', 'Valid Genus': 'Speranza', 'valid species': 'brunneata', NAME: 'coreame' }),
      row({ rank: '3.0 subfam', NAME: 'Larentiinae' }),
      row({ rank: '8.0 valsp', 'Valid Genus': 'Hydria', 'valid species': 'prunivorata' }),
    ]);
    assert.deepEqual(
      species.map((s) => [s.genus, s.species, s.tribe]),
      [
        ['Speranza', 'brunneata', 'Macariini'],
        ['Hydria', 'prunivorata', ''],
      ],
    );
  });

  it('reads a bracketed placeholder as no tribe, and keeps its text', () => {
    const [species] = readSpecies([
      row({ rank: '4.0 tribe', NAME: '[Larentiinae – unnamed tribe 1]' }),
      row({ rank: '8.0 valsp', 'Valid Genus': 'Lampropteryx', 'valid species': 'suffumata' }),
    ]);
    assert.equal(species?.tribe, '');
    assert.equal(species?.tribePlaceholder, '[Larentiinae – unnamed tribe 1]');
  });
});

describe('findDifferences', () => {
  const shown = new Set<string>();

  it('reports nothing for a species that agrees in every field', () => {
    const rows = findDifferences({
      species: [ours({ genus: 'Habrosyne', species: 'scripta', family: 'Drepanidae', authority: '(Gosse, 1840)' })],
      pNo2023BySlug: new Map([['habrosyne-scripta', '850003']]),
      mpg: [mpgSpecies({ genus: 'Habrosyne', species: 'scripta', family: 'Drepanidae', authority: '(Gosse, 1840)', pNo2025: '85-0003', pNo2023: '850003' })],
      shown,
    });
    assert.deepEqual(rows, []);
  });

  it('finds a moved species by its 2023 number and reports the new genus', () => {
    const rows = findDifferences({
      species: [ours({ genus: 'Speranza', species: 'boreata' })],
      pNo2023BySlug: new Map([['speranza-boreata', '91a0710']]),
      mpg: [mpgSpecies({ genus: 'Macaria', species: 'boreata', pNo2025: '91a0710', pNo2023: '91a0710' })],
      shown,
    });
    assert.deepEqual(
      rows.map((r) => [r.matched_via, r.field, r.ours, r.mpg]),
      [['p-no-2023', 'genus', 'Speranza', 'Macaria']],
    );
  });

  it("does not report MPG's quotes or group label as a genus difference", () => {
    const rows = findDifferences({
      species: [ours({ genus: 'Perizoma', species: 'curvilinea' })],
      pNo2023BySlug: new Map(),
      mpg: [mpgSpecies({ genus: '"Perizoma" (group 2)', species: 'curvilinea' })],
      shown,
    });
    assert.deepEqual(rows, []);
  });

  it('reports a renumbering, and an old number that now sits on two species', () => {
    const rows = findDifferences({
      species: [ours({ genus: 'Speranza', species: 'brunneata' })],
      pNo2023BySlug: new Map([['speranza-brunneata', '91a0704']]),
      mpg: [
        mpgSpecies({ genus: 'Speranza', species: 'brunneata', pNo2025: '91a0700.11n', pNo2023: '91a0704' }),
        mpgSpecies({ genus: 'Speranza', species: 'amboflava', pNo2025: '91a0700.15n', pNo2023: '91a0704' }),
      ],
      shown,
    });
    assert.deepEqual(
      rows.map((r) => [r.field, r.mpg, r.note]),
      [
        ['p-number', '91a0700.11n', 'ours is the 2023 number in data/checklist-order.csv'],
        ['p-number-split', 'Speranza brunneata 91a0700.11n; Speranza amboflava 91a0700.15n', 'we hold 1 of the 2'],
      ],
    );
  });

  it("counts a held species as held when MPG writes its genus in quotes", () => {
    const rows = findDifferences({
      species: [ours({ genus: 'Perizoma', species: 'alpha' })],
      pNo2023BySlug: new Map([['perizoma-alpha', '91a1000']]),
      mpg: [
        mpgSpecies({ genus: '"Perizoma" (group 2)', species: 'alpha', pNo2025: '91a1000', pNo2023: '91a1000' }),
        mpgSpecies({ genus: '"Perizoma" (group 2)', species: 'beta', pNo2025: '91a1000.1n', pNo2023: '91a1000' }),
      ],
      shown,
    });
    assert.deepEqual(rows.map((r) => r.note), ['we hold 1 of the 2']);
  });

  it('prefers the exact name when the 2023 number has moved to another species', () => {
    const rows = findDifferences({
      species: [ours({ genus: 'Speranza', species: 'amboflava' })],
      pNo2023BySlug: new Map([['speranza-amboflava', '91a0704']]),
      mpg: [
        mpgSpecies({ genus: 'Speranza', species: 'brunneata', pNo2023: '91a0704' }),
        mpgSpecies({ genus: 'Speranza', species: 'amboflava', pNo2023: '' }),
      ],
      shown,
    });
    assert.deepEqual(new Set(rows.map((r) => r.mpg_name)), new Set(['Speranza amboflava']));
  });

  it('reports a provisional name as unmatched, and whether the site shows it', () => {
    const rows = findDifferences({
      species: [ours({ genus: 'Plataea', species: 'n sp' })],
      pNo2023BySlug: new Map(),
      mpg: [],
      shown: new Set(['plataea-n-sp']),
    });
    assert.deepEqual(
      rows.map((r) => [r.species_slug, r.shown, r.field]),
      [['plataea-n-sp', 'yes', 'unmatched']],
    );
  });
});
