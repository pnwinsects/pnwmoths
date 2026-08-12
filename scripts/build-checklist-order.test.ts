import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import {
  buildMpgIndex,
  genderVariants,
  loadInputs,
  matchSpecies,
  monaKey,
  normalizeEpithet,
  normalizeGenus,
  orderSpecies,
  slugOf,
  type MpgRow,
  type SpeciesRow,
} from './build-checklist-order.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const mpgRow = (over: Partial<MpgRow>): MpgRow => ({
  'P No': '000000', MONA: '', Genus: 'Genus', Species: 'species', Family: 'Noctuidae', Synonymy: '',
  ...over,
});
const speciesRow = (over: Partial<SpeciesRow>): SpeciesRow => ({
  genus: 'Genus', species: 'species', noc_id: '', family: 'Noctuidae', ...over,
});

describe('normalizeGenus', () => {
  it('strips the quotes MPG uses for unresolved generic placement', () => {
    assert.equal(normalizeGenus('"Cryphia"'), 'Cryphia');
  });

  it('strips the disambiguating parenthetical', () => {
    assert.equal(normalizeGenus('"Perizoma" (Group 2)'), 'Perizoma');
  });

  it('leaves an ordinary genus alone', () => {
    assert.equal(normalizeGenus('Macaria'), 'Macaria');
  });
});

describe('normalizeEpithet', () => {
  it('strips the "of authors" qualifier', () => {
    assert.equal(normalizeEpithet('concisa of authors'), 'concisa');
  });

  // Truncating a trinomial to its first word would make the subspecies collide
  // with the nominate species and silently steal its checklist position.
  it('leaves a trinomial whole', () => {
    assert.equal(normalizeEpithet('laticapitana heinrichi'), 'laticapitana heinrichi');
  });
});

describe('monaKey', () => {
  it('strips the MONA prefix and leading zeros', () => {
    assert.equal(monaKey('MONA 7731'), '7731');
    assert.equal(monaKey('0001'), '1');
    assert.equal(monaKey('6287.1'), '6287.1');
  });

  // 93- values are Poole 1989 Noctuoidea numbers. MPG's MONA column does not
  // carry that series, so treating one as a MONA number matches another moth.
  it('refuses a 93- Poole number', () => {
    assert.equal(monaKey('93-3115.3'), null);
  });

  it('refuses blanks and non-numeric junk', () => {
    assert.equal(monaKey(''), null);
    assert.equal(monaKey('n/a'), null);
  });
});

describe('genderVariants', () => {
  it('offers the other Latin endings for the stem', () => {
    assert.ok(genderVariants('californicum').includes('californica'));
    assert.ok(genderVariants('californica').includes('californicum'));
  });

  it('never offers the input back', () => {
    assert.ok(!genderVariants('californicum').includes('californicum'));
  });

  it('declines to guess from a stem too short to be meaningful', () => {
    assert.deepEqual(genderVariants('ala'), []);
  });
});

describe('matchSpecies', () => {
  const rows = [
    mpgRow({ 'P No': '000001', Genus: 'Macaria', Species: 'signaria', MONA: '6344' }),
    mpgRow({ 'P No': '000002', Genus: '"Oligia"', Species: 'obtusa', MONA: '9418' }),
    mpgRow({ 'P No': '000003', Genus: 'Idia', Species: 'concisa of authors' }),
    mpgRow({ 'P No': '000004', Genus: 'Drasteria', Species: 'maculosa', Synonymy: 'Syneda nubicola Behr, 1870' }),
    mpgRow({ 'P No': '000005', Genus: 'Trichopolia', Species: 'rufula' }),
    mpgRow({ 'P No': '000006', Genus: 'Eupithecia', Species: 'nevadata' }),
  ];
  const index = buildMpgIndex(rows);
  const noCrosswalk = new Map<string, string>();

  it('matches an ordinary binomial exactly', () => {
    const hit = matchSpecies(speciesRow({ genus: 'Macaria', species: 'signaria' }), index, noCrosswalk);
    assert.deepEqual(hit, { index: 0, via: 'exact' });
  });

  it('sees through MPG\'s quoted genus', () => {
    const hit = matchSpecies(speciesRow({ genus: 'Oligia', species: 'obtusa' }), index, noCrosswalk);
    assert.deepEqual(hit, { index: 1, via: 'exact' });
  });

  it('sees through "of authors"', () => {
    const hit = matchSpecies(speciesRow({ genus: 'Idia', species: 'concisa' }), index, noCrosswalk);
    assert.deepEqual(hit, { index: 2, via: 'exact' });
  });

  it('falls back to the MONA number when the genus differs', () => {
    const hit = matchSpecies(
      speciesRow({ genus: 'Speranza', species: 'somethingelse', noc_id: 'MONA 6344' }),
      index, noCrosswalk,
    );
    assert.deepEqual(hit, { index: 0, via: 'mona' });
  });

  // Synonymy cells name the ORIGINAL combination, so the genus there is
  // usually not the current one — the match has to be on the pair as written.
  it('matches an original combination named in the synonymy', () => {
    const hit = matchSpecies(speciesRow({ genus: 'Syneda', species: 'nubicola' }), index, noCrosswalk);
    assert.deepEqual(hit, { index: 3, via: 'synonymy' });
  });

  it('uses the crosswalk only after every mechanical tier has failed', () => {
    const crosswalk = new Map([['protorthodes-rufula', 'Trichopolia rufula']]);
    const hit = matchSpecies(speciesRow({ genus: 'Protorthodes', species: 'rufula' }), index, crosswalk);
    assert.deepEqual(hit, { index: 4, via: 'crosswalk' });
  });

  it('throws rather than silently dropping a crosswalk row that names no MPG taxon', () => {
    const crosswalk = new Map([['x-y', 'Nonexistent taxon']]);
    assert.throws(
      () => matchSpecies(speciesRow({ genus: 'X', species: 'y' }), index, crosswalk),
      /crosswalk target not in MPG/,
    );
  });

  it('returns null when nothing resolves', () => {
    assert.equal(matchSpecies(speciesRow({ genus: 'Nothing', species: 'here' }), index, noCrosswalk), null);
  });
});

describe('orderSpecies', () => {
  const rows = [
    mpgRow({ 'P No': '000001', Genus: 'Aaa', Species: 'one' }),
    mpgRow({ 'P No': '000002', Genus: 'Aaa', Species: 'two' }),
    mpgRow({ 'P No': '000003', Genus: 'Bbb', Species: 'one' }),
  ];
  const index = buildMpgIndex(rows);
  const noCrosswalk = new Map<string, string>();

  it('emits species in MPG sequence, not input order', () => {
    const result = orderSpecies(
      [
        speciesRow({ genus: 'Bbb', species: 'one' }),
        speciesRow({ genus: 'Aaa', species: 'two' }),
        speciesRow({ genus: 'Aaa', species: 'one' }),
      ],
      index, noCrosswalk,
    );
    assert.deepEqual(result.ordered.map((r) => r.species_slug), ['aaa-one', 'aaa-two', 'bbb-one']);
    assert.deepEqual(result.ordered.map((r) => r.mpg_p_no), ['000001', '000002', '000003']);
  });

  // An unmatched species has a known genus but no known position inside it,
  // so the end of its own genus is the only defensible place for it.
  it('puts an unmatched species at the end of its own genus, not the file', () => {
    const result = orderSpecies(
      [
        speciesRow({ genus: 'Aaa', species: 'one' }),
        speciesRow({ genus: 'Aaa', species: 'zzz' }),
        speciesRow({ genus: 'Bbb', species: 'one' }),
      ],
      index, noCrosswalk,
    );
    assert.deepEqual(result.ordered.map((r) => r.species_slug), ['aaa-one', 'aaa-zzz', 'bbb-one']);
    assert.deepEqual(result.unplaced, ['aaa-zzz']);
    assert.equal(result.ordered[1]?.mpg_p_no, '');
    assert.equal(result.ordered[1]?.matched_via, 'unplaced');
  });

  // Appending an anchorless genus to the end of the file would split its
  // family in two, and the checklist page renders families as blocks.
  it('places a genus with no anchor at the end of its family, not the file', () => {
    const result = orderSpecies(
      [
        speciesRow({ genus: 'Aaa', species: 'one', family: 'Erebidae' }),
        speciesRow({ genus: 'Zzz', species: 'sp', family: 'Erebidae' }),
        speciesRow({ genus: 'Bbb', species: 'one', family: 'Noctuidae' }),
      ],
      index, noCrosswalk,
    );
    assert.deepEqual(result.unplacedGenera, ['zzz']);
    assert.deepEqual(result.ordered.map((r) => r.species_slug), ['aaa-one', 'zzz-sp', 'bbb-one']);
  });

  it('breaks ties deterministically when two species share an MPG row', () => {
    const shared = buildMpgIndex([mpgRow({ 'P No': '000001', Genus: 'Aaa', Species: 'one', MONA: '10' })]);
    const result = orderSpecies(
      [
        speciesRow({ genus: 'Zzz', species: 'later', noc_id: '10' }),
        speciesRow({ genus: 'Aaa', species: 'one' }),
      ],
      shared, new Map(),
    );
    assert.deepEqual(result.ordered.map((r) => r.species_slug), ['aaa-one', 'zzz-later']);
  });
});

// The committed file is what the checklist page will read, so assert the
// properties the page depends on — not just the functions that produced it.
describe('data/checklist-order.csv', () => {
  const ordered: Array<{ species_slug: string; mpg_p_no: string; matched_via: string }> = parse(
    readFileSync(resolve(ROOT, 'data/checklist-order.csv')),
    { columns: true, skip_empty_lines: true },
  );
  const { species, crosswalk, mpg } = loadInputs(ROOT);
  const slugs = species.map(slugOf);
  const familyOf = new Map(species.map((s) => [slugOf(s), s.family]));

  it('holds every species exactly once, and nothing else', () => {
    assert.deepEqual([...ordered.map((r) => r.species_slug)].sort(), [...slugs].sort());
  });

  // Genus blocks are the page's job, not this file's: src/_data/checklist.ts
  // groups by genus and anchors each block at its earliest species' position,
  // so interleaved rows here still render as unbroken blocks. Fragmentation
  // in this file is nonetheless worth noticing — it means our genus label
  // disagrees with MPG's sequence somewhere — so the known cases are pinned:
  // C-026 keeps bitactata/decorata in Speranza while colata/lorquinaria/
  // plumosata returned to Macaria, and MPG (which places them all in Macaria)
  // sequences the two sets interleaved. A new genus appearing here deserves
  // the same scrutiny before it is added.
  it('fragments only the genera the curation log explains', () => {
    const spans = new Map<string, number[]>();
    ordered.forEach((row, rank) => {
      const genus = row.species_slug.slice(0, row.species_slug.indexOf('-'));
      const seen = spans.get(genus);
      if (seen) seen.push(rank);
      else spans.set(genus, [rank]);
    });
    const fragmented = [...spans.entries()]
      .filter(([, ranks]) => (ranks.at(-1) ?? 0) - (ranks[0] ?? 0) !== ranks.length - 1)
      .map(([genus]) => genus)
      .sort();
    assert.deepEqual(fragmented, ['macaria', 'speranza']);
  });

  it('puts families in the standard Pohl sequence', () => {
    const sequence: string[] = [];
    for (const row of ordered) {
      const family = familyOf.get(row.species_slug);
      if (family && sequence[sequence.length - 1] !== family) sequence.push(family);
    }
    assert.deepEqual(sequence, [
      'Drepanidae', 'Lasiocampidae', 'Saturniidae', 'Sphingidae', 'Uraniidae', 'Geometridae',
      'Notodontidae', 'Erebidae', 'Euteliidae', 'Nolidae', 'Noctuidae',
    ]);
  });

  it('gives a placed species a P No and an unplaced one none', () => {
    for (const row of ordered) {
      if (row.matched_via === 'unplaced') assert.equal(row.mpg_p_no, '', row.species_slug);
      else assert.notEqual(row.mpg_p_no, '', row.species_slug);
    }
  });

  // Compared as STRINGS, deliberately. `P No` is an alphanumeric hierarchical code —
  // `09a0001`, `16a0082X`, `300007.85n` — so Number() is NaN for two thirds of MPG's
  // rows, and a numeric comparator would leave `regressions` empty no matter what the
  // file said. The character-set pin below is what keeps lexicographic ordering
  // meaningful: a future MPG release that introduced a separator would change the
  // sort silently, and this fails instead.
  it('never regresses in MPG sequence across the placed rows', () => {
    const placed = ordered.filter((r) => r.matched_via !== 'unplaced').map((r) => r.mpg_p_no);
    assert.ok(placed.length > 1000, `only ${placed.length} placed rows — the check below would be vacuous`);
    assert.deepEqual(placed.filter((p) => !/^[0-9a-zA-Z.]+$/.test(p)), [], 'P No outside the known character set');
    const regressions = placed.filter((p, i) => i > 0 && p < (placed[i - 1] ?? ''));
    assert.deepEqual(regressions, []);
  });

  it('leaves only provisional names unplaced', () => {
    const unplaced = ordered.filter((r) => r.matched_via === 'unplaced').map((r) => r.species_slug);
    const provisional = unplaced.filter((s) => /\b(sp|species|aff|nr)\b/.test(s));
    // Was two, then one, now none. `hemileuca-nuteglan` left the catalog in #268;
    // `macaria-marmorata` — long the sole named species without a position, because
    // MPG's master list has no row for the name — was ruled a synonym of
    // M. signaria (C-017) and merged in #294. Every named species now places.
    assert.deepEqual(unplaced.filter((s) => !provisional.includes(s)), []);
    assert.equal(provisional.length, 21);
  });

  it('has no crosswalk row that a mechanical tier already covers', () => {
    // A crosswalk entry is a curator decision; one that duplicates an exact
    // match is dead weight that will silently rot when MPG next changes.
    const index = buildMpgIndex(mpg);
    for (const [slug] of crosswalk) {
      const row = species.find((s) => slugOf(s) === slug);
      assert.ok(row, `crosswalk names a species not in species.csv: ${slug}`);
      assert.equal(matchSpecies(row, index, new Map()), null, `crosswalk row is redundant: ${slug}`);
    }
  });

  // species_slug here is a foreign key to data/species.csv and a URL segment.
  // Provisional epithets carry spaces ("nr libya"), and lowercasing alone leaves them
  // in — 14 rows of this file once joined to nothing and could not appear in a URL
  // (#221 review). Membership is already pinned above; this is about the SHAPE.
  it('emits only canonical slugs — lowercase alphanumerics and single hyphens', () => {
    const invalid = ordered.map((r) => r.species_slug).filter((s) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s));
    assert.deepEqual(invalid, []);
  });

  it('slugOf collapses whitespace in a provisional epithet', () => {
    assert.equal(slugOf({ genus: 'Xylophanes', species: 'nr libya' }), 'xylophanes-nr-libya');
    assert.equal(slugOf({ genus: 'Aseptis', species: 'sp No 1' }), 'aseptis-sp-no-1');
  });
});
