import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRows,
  extractPlateNumber,
  toSpeciesSlug,
  toCsv,
} from './extract-species-plates.ts';
import type { SpeciesPlate } from './extract-species-plates.ts';

// ---------------------------------------------------------------------------
// parseRows — converts mysql `--batch -N` (tab-separated, no header) output.
// ---------------------------------------------------------------------------

describe('parseRows', () => {
  it('parses tab-separated rows into PlateSourceRow objects', () => {
    const out = parseRows(
      'plates/2021 PLATE 1 Drepanidae.jpg\tEuthyatira\tlorata\n' +
        'plates/2021_PLATE_3_Saturniidae_I.jpg\tHemileuca\tnevadensis\n',
    );
    assert.deepEqual(out, [
      { image: 'plates/2021 PLATE 1 Drepanidae.jpg', genus: 'Euthyatira', species: 'lorata' },
      { image: 'plates/2021_PLATE_3_Saturniidae_I.jpg', genus: 'Hemileuca', species: 'nevadensis' },
    ]);
  });

  it('ignores blank trailing lines', () => {
    const out = parseRows('plates/2021 PLATE 1 Drepanidae.jpg\tEuthyatira\tlorata\n\n');
    assert.equal(out.length, 1);
  });

  it('returns [] for empty input', () => {
    assert.deepEqual(parseRows(''), []);
  });

  it('throws on a row missing fields', () => {
    assert.throws(() => parseRows('plates/foo.jpg\tEuthyatira\n'), /malformed row/);
  });
});

// ---------------------------------------------------------------------------
// extractPlateNumber — pulls the plate number out of the image path.
// ---------------------------------------------------------------------------

describe('extractPlateNumber', () => {
  it('extracts the number from a space-separated filename', () => {
    assert.equal(extractPlateNumber('plates/2021 PLATE 1 Drepanidae.jpg'), '1');
  });

  it('extracts the number from an underscore-separated filename', () => {
    assert.equal(extractPlateNumber('plates/2021_PLATE_84_Noctuidae_LV_Noctuinae_Noctuini_IX.jpg'), '84');
  });

  it('extracts multi-digit numbers', () => {
    assert.equal(extractPlateNumber('plates/2021 PLATE 96 Noctuidae LXVII.jpg'), '96');
  });

  it('is case-insensitive', () => {
    assert.equal(extractPlateNumber('plates/2021 plate 35 Acronictinae I.jpg'), '35');
  });

  it('returns null when no plate token is present', () => {
    assert.equal(extractPlateNumber('plates/unrelated-file.jpg'), null);
  });
});

// ---------------------------------------------------------------------------
// toSpeciesSlug — genus/species -> slug, per the slug convention (CONTEXT.md).
// ---------------------------------------------------------------------------

describe('toSpeciesSlug', () => {
  it('lowercases and joins genus + species with a hyphen', () => {
    assert.equal(toSpeciesSlug('Euthyatira', 'lorata'), 'euthyatira-lorata');
  });

  it('strips quote marks from an informally-quoted epithet', () => {
    assert.equal(toSpeciesSlug('Idia', '"concisa"'), 'idia-concisa');
  });

  it('strips other non-alphanumeric, non-hyphen characters', () => {
    assert.equal(toSpeciesSlug('Some Genus', 'sp.'), 'somegenus-sp');
  });
});

// ---------------------------------------------------------------------------
// toCsv — serializes to species_slug,plate_slug.
// ---------------------------------------------------------------------------

describe('toCsv', () => {
  const rows: SpeciesPlate[] = [
    { species_slug: 'euthyatira-lorata', plate_slug: 'plate-1-drepanidae' },
    { species_slug: 'hemileuca-nevadensis', plate_slug: 'plate-3-saturniidae-i' },
  ];

  it('emits a header row', () => {
    assert.equal(toCsv(rows).split('\n')[0], 'species_slug,plate_slug');
  });

  it('emits one line per row plus a trailing newline', () => {
    assert.equal(
      toCsv(rows),
      'species_slug,plate_slug\n' +
        'euthyatira-lorata,plate-1-drepanidae\n' +
        'hemileuca-nevadensis,plate-3-saturniidae-i\n',
    );
  });

  it('returns just the header for an empty array', () => {
    assert.equal(toCsv([]), 'species_slug,plate_slug\n');
  });
});
