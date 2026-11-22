import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyNumbers,
  authorityKey,
  findDifferences,
  formatAuthority,
  numberKey,
  readSpecies,
  withoutStatusLetter,
  type Mpg2025Row,
  type SpeciesRow,
} from './report-mpg-2025.ts';

const row = (fields: Partial<Mpg2025Row>): Mpg2025Row => ({
  status: 'P&N23',
  rank: '',
  Family: '',
  Subfamily: '',
  'P-No. 2025': '',
  'P-No. 2023': '',
  'CDN P-No. 2018': '',
  'P3 No. 2016': '',
  'MONA 1983': '',
  'Valid Genus': '',
  'valid species': '',
  NAME: '',
  'original genus': '',
  brackets: '',
  author: '',
  date: '',
  ...fields,
});

/** A valid species row. */
const valid = (genus: string, species: string, fields: Partial<Mpg2025Row> = {}): Mpg2025Row =>
  row({ rank: '8.0 valsp', 'Valid Genus': genus, 'valid species': species, NAME: species, ...fields });

const ours = (fields: Partial<SpeciesRow>): SpeciesRow => ({
  genus: '',
  species: '',
  noc_id: '',
  authority: '',
  family: '',
  subfamily: '',
  tribe: '',
  ...fields,
});

const differences = (species: SpeciesRow[], mpgRows: Mpg2025Row[], shown = new Set<string>()) =>
  findDifferences({ species, mpgRows, crosswalk: new Map(), shown });

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

describe('checklist numbers', () => {
  it('leaves off the status letter but keeps the n of a number added in 2025', () => {
    assert.equal(withoutStatusLetter('93-0172E'), '93-0172');
    assert.equal(withoutStatusLetter('93-0274X'), '93-0274');
    assert.equal(withoutStatusLetter('21a0019.1En'), '21a0019.1n');
    assert.equal(withoutStatusLetter('93-2497.1n'), '93-2497.1n');
  });

  it('reads a spreadsheet float as the short decimal it stands for', () => {
    assert.equal(numberKey('932249.59999999998'), numberKey('93-2249.6'));
    assert.equal(numberKey('300015.53000000003'), '300015.53');
  });

  it('treats the hyphen and trailing zeros as formatting', () => {
    assert.equal(numberKey('85-0003'), numberKey('850003'));
    assert.equal(numberKey('93-2924.50'), numberKey('932924.5'));
    assert.notEqual(numberKey('91a0700.11n'), numberKey('91a0704'));
  });
});

describe('readSpecies', () => {
  it('gives each species the tribe above it, and ends a tribe at the next subfamily', () => {
    const species = readSpecies([
      row({ rank: '3.0 subfam', NAME: 'Ennominae' }),
      row({ rank: '4.0 tribe', NAME: 'Macariini' }),
      row({ rank: '6.0 genus', NAME: 'Speranza' }),
      valid('Speranza', 'brunneata', { Subfamily: 'Ennominae' }),
      row({ rank: '8.5 spsyn', 'Valid Genus': 'Speranza', 'valid species': 'brunneata', NAME: 'coreame' }),
      row({ rank: '3.0 subfam', NAME: 'Larentiinae' }),
      valid('Hydria', 'prunivorata'),
    ]);
    assert.deepEqual(
      species.map((s) => [s.genus, s.species, s.tribe]),
      [
        ['Speranza', 'brunneata', 'Macariini'],
        ['Hydria', 'prunivorata', ''],
      ],
    );
  });

  it('reads a bracketed placeholder as blank, and keeps its text', () => {
    const [species] = readSpecies([
      row({ rank: '4.0 tribe', NAME: '[Larentiinae – unnamed tribe 1]' }),
      valid('Tyta', 'luctuosa', { Subfamily: '[Noctuidae – group 1 unplaced to subfamily]' }),
    ]);
    assert.equal(species?.tribe, '');
    assert.equal(species?.tribePlaceholder, '[Larentiinae – unnamed tribe 1]');
    assert.equal(species?.subfamily, '');
    assert.equal(species?.subfamilyPlaceholder, '[Noctuidae – group 1 unplaced to subfamily]');
  });
});

describe('findDifferences', () => {
  it('reports nothing for a species that agrees in every field', () => {
    const rows = differences(
      [ours({ genus: 'Habrosyne', species: 'scripta', family: 'Drepanidae', authority: '(Gosse, 1840)', noc_id: '85-0003' })],
      [valid('Habrosyne', 'scripta', { Family: 'Drepanidae', brackets: '(', author: 'Gosse', date: '1840', 'P-No. 2025': '85-0003' })],
    );
    assert.deepEqual(rows, []);
  });

  it('finds a moved species through its original genus and reports the new genus', () => {
    const rows = differences(
      [ours({ genus: 'Protoperigea', species: 'umbricata' })],
      [valid('Caradrina', 'umbricata', { 'original genus': 'Protoperigea' })],
    );
    assert.deepEqual(
      rows.map((r) => [r.matched_via, r.field, r.ours, r.mpg]),
      [['synonymy', 'genus', 'Protoperigea', 'Caradrina']],
    );
  });

  it("does not report MPG's quotes or group label as a genus difference", () => {
    const rows = differences([ours({ genus: 'Perizoma', species: 'curvilinea' })], [valid('"Perizoma" (group 2)', 'curvilinea')]);
    assert.deepEqual(rows, []);
  });

  it('records the curation-log ruling on a difference the curator kept', () => {
    const rows = differences(
      [ours({ genus: 'Perizoma', species: 'costiguttata', tribe: 'Euphyiini' })],
      [row({ rank: '4.0 tribe', NAME: '[Larentiinae – unplaced to tribe]' }), valid('"Perizoma" (group 2)', 'costiguttata')],
    );
    assert.deepEqual(rows.map((r) => [r.field, r.ruling]), [['tribe', 'C-043']]);
  });

  it('reports a renumbering, without the status letter', () => {
    const rows = differences(
      [ours({ genus: 'Euproctis', species: 'similis', noc_id: '93-0170' })],
      [valid('Euproctis', 'similis', { 'P-No. 2025': '93-0172E', 'P3 No. 2016': '930170' })],
    );
    assert.deepEqual(rows.map((r) => [r.field, r.ours, r.mpg, r.note]), [['number', '93-0170', '93-0172', 'MPG renumbered it']]);
  });

  it('leaves a MONA number alone, even where MPG has a P-number', () => {
    const rows = differences(
      [ours({ genus: 'Macaria', species: 'signaria', noc_id: 'MONA 6344' })],
      [valid('Macaria', 'signaria', { 'P-No. 2025': '93-0690' })],
    );
    assert.deepEqual(rows, []);
  });

  it('fills a blank number with a P-number', () => {
    const rows = differences([ours({ genus: 'Clostera', species: 'apicalis' })], [valid('Clostera', 'apicalis', { 'P-No. 2025': '93-0009' })]);
    assert.deepEqual(rows.map((r) => [r.field, r.mpg, r.note]), [['number', '93-0009', 'ours is blank']]);
  });

  // The curator's concern on #290: a number can pass to another species when MPG splits one.
  it('flags a number we hold that MPG gives another species', () => {
    const rows = differences(
      [ours({ genus: 'Clostera', species: 'multnoma', noc_id: '93-0008' })],
      [
        valid('Clostera', 'brucei', { 'P-No. 2025': '93-0008', 'P-No. 2023': '930008' }),
        valid('Clostera', 'multnoma', { 'P-No. 2025': '93-0008.1' }),
      ],
    );
    assert.deepEqual(
      rows.map((r) => [r.field, r.mpg]),
      [
        ['number', '93-0008.1'],
        ['number-of-another-species', 'Clostera brucei (2025: 93-0008)'],
      ],
    );
  });

  it('flags our old number when MPG has since given it to another species', () => {
    const rows = differences(
      [ours({ genus: 'Acronicta', species: 'mansueta', noc_id: '93-1434.2' })],
      [
        valid('Acronicta', 'mansueta', { 'P-No. 2025': '93-1427.4', 'CDN P-No. 2018': '931434.2' }),
        valid('Acronicta', 'clarescens', { 'P-No. 2025': '93-1434.2' }),
      ],
    );
    assert.deepEqual(
      rows.map((r) => [r.field, r.note.split(';')[0]]),
      [
        ['number', 'MPG renumbered it'],
        ['number-of-another-species', 'another species carries our number in some edition of MPG'],
      ],
    );
  });

  it('reports a provisional name as unmatched, and whether the site shows it', () => {
    const rows = differences([ours({ genus: 'Plataea', species: 'n sp' })], [], new Set(['plataea-n-sp']));
    assert.deepEqual(rows.map((r) => [r.species_slug, r.shown, r.field]), [['plataea-n-sp', 'yes', 'unmatched']]);
  });
});

describe('applyNumbers', () => {
  const csv = 'id,genus,species,noc_id,authority\n1,Clostera,multnoma,93-0008,"(Dyar, 1892)"\n2,Habrosyne,scripta,85-0003,"(Gosse, 1840)"\n';
  const base = { shown: 'yes', matched_via: 'exact', mpg_name: '', mpg_status: '', note: '' } as const;

  it('writes the numbers, and touches no other cell', () => {
    const { text, applied } = applyNumbers(csv, [
      { ...base, species_slug: 'clostera-multnoma', field: 'number', ours: '93-0008', mpg: '93-0008.1', ruling: '' },
    ]);
    assert.equal(text, csv.replace('93-0008,', '93-0008.1,'));
    assert.equal(applied.length, 1);
  });

  it('skips a species matched through a synonym or subspecies', () => {
    const { applied } = applyNumbers(csv, [
      { ...base, matched_via: 'synonymy', species_slug: 'clostera-multnoma', field: 'number', ours: '93-0008', mpg: '93-0008.1', ruling: '' },
    ]);
    assert.deepEqual(applied, []);
  });

  it('skips a ruled row, and a row whose number has changed since the report', () => {
    const { text, applied } = applyNumbers(csv, [
      { ...base, species_slug: 'clostera-multnoma', field: 'number', ours: '93-0008', mpg: '93-0008.1', ruling: 'C-000' },
      { ...base, species_slug: 'habrosyne-scripta', field: 'number', ours: '85-0002', mpg: '85-0004', ruling: '' },
    ]);
    assert.equal(text, csv);
    assert.deepEqual(applied, []);
  });
});
