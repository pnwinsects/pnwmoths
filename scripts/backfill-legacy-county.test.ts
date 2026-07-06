import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveDbSpeciesId,
  joinNaturalKey,
  type DbRow,
  type JoinCsvRow,
} from './backfill-legacy-county.ts';

// ---------------------------------------------------------------------------
// resolveDbSpeciesId
// ---------------------------------------------------------------------------

describe('resolveDbSpeciesId', () => {
  it('trusts the csv id when the DB row species epithet matches (straight match)', () => {
    const csvRow = { id: '100', genus: 'Xestia', species: 'atrata' };
    const dbSpeciesById = new Map([['100', { genus: 'Xestia', species: 'atrata' }]]);
    const dbIdsByNormalizedBinomial = new Map<string, string[]>();
    assert.equal(resolveDbSpeciesId(csvRow, dbSpeciesById, dbIdsByNormalizedBinomial), '100');
  });

  it('trusts the csv id despite a genus rename, as long as the species epithet matches', () => {
    const csvRow = { id: '200', genus: 'Speranza', species: 'behrensaria' };
    const dbSpeciesById = new Map([['200', { genus: 'Macaria', species: 'behrensaria' }]]);
    const dbIdsByNormalizedBinomial = new Map<string, string[]>();
    assert.equal(resolveDbSpeciesId(csvRow, dbSpeciesById, dbIdsByNormalizedBinomial), '200');
  });

  it('falls back to the normalized-binomial lookup when the csv id points to an unrelated species', () => {
    const csvRow = { id: '300', genus: 'Coelodasys', species: 'unicornis' };
    const dbSpeciesById = new Map([['300', { genus: 'Xestia', species: 'lorezi' }]]); // unrelated
    const dbIdsByNormalizedBinomial = new Map([['coelodasys|unicornis', ['999']]]);
    assert.equal(resolveDbSpeciesId(csvRow, dbSpeciesById, dbIdsByNormalizedBinomial), '999');
  });

  it('falls back to the normalized-binomial lookup when the csv id is missing from the DB', () => {
    const csvRow = { id: '400', genus: 'Hemileuca', species: 'nuttalli' };
    const dbSpeciesById = new Map<string, { genus: string; species: string }>();
    const dbIdsByNormalizedBinomial = new Map([['hemileuca|nuttalli', ['555']]]);
    assert.equal(resolveDbSpeciesId(csvRow, dbSpeciesById, dbIdsByNormalizedBinomial), '555');
  });

  it('returns null when neither strategy resolves (never guesses)', () => {
    const csvRow = { id: '999999', genus: 'Schizura', species: 'concinna' };
    const dbSpeciesById = new Map<string, { genus: string; species: string }>();
    const dbIdsByNormalizedBinomial = new Map<string, string[]>();
    assert.equal(resolveDbSpeciesId(csvRow, dbSpeciesById, dbIdsByNormalizedBinomial), null);
  });

  it('returns null when the normalized-binomial lookup is itself ambiguous (>1 candidate)', () => {
    const csvRow = { id: '888', genus: 'Foo', species: 'bar' };
    const dbSpeciesById = new Map<string, { genus: string; species: string }>();
    const dbIdsByNormalizedBinomial = new Map([['foo|bar', ['1', '2']]]);
    assert.equal(resolveDbSpeciesId(csvRow, dbSpeciesById, dbIdsByNormalizedBinomial), null);
  });
});

// ---------------------------------------------------------------------------
// joinNaturalKey
// ---------------------------------------------------------------------------

function makeCsvRow(overrides: Partial<JoinCsvRow>): JoinCsvRow {
  return {
    species_slug: 'genus-species',
    species_id: '1',
    record_type: 'specimen',
    latitude: '46.6',
    longitude: '-120.5',
    state: 'WA',
    county: '',
    locality: 'Foo Creek',
    elevation_ft: '',
    year: '1998',
    month: '6',
    day: '15',
    collector: 'J. Smith',
    collection: 'WSU',
    notes: '',
    district_id: '',
    ...overrides,
  };
}

function makeDbRow(overrides: Partial<DbRow>): DbRow {
  return {
    species_id: '1',
    latitude: '46.600',
    longitude: '-120.500',
    year: '1998',
    month: '6',
    day: '15',
    collector: 'J. Smith',
    collection: 'WSU',
    record_type: 'specimen',
    locality: 'Foo Creek',
    county: 'Yakima',
    state: 'WA',
    ...overrides,
  };
}

const CROSSWALK = new Map<string, string>([
  ['WA|Yakima', 'US:53077'],
  ['WA|Kittitas', 'US:53037'],
  ['BC|North Coast', 'CA:5947'],
]);

describe('joinNaturalKey', () => {
  it('fills a uniquely-matching unfilled row', () => {
    const csvRows = [makeCsvRow({ species_id: '1' })];
    const dbRows = [makeDbRow({ species_id: '1', county: 'Yakima', state: 'WA' })];
    const result = joinNaturalKey(csvRows, dbRows, CROSSWALK);
    assert.equal(result.filled[0]?.county, 'Yakima');
    assert.equal(result.filled[0]?.district_id, 'US:53077');
    assert.ok(result.reportRows.some((r) => r.outcome === 'filled'));
    assert.equal(result.unmappedNames.size, 0);
  });

  it('fills a multi-match group that agrees on county', () => {
    const csvRows = [makeCsvRow({ species_id: '2' })];
    const dbRows = [
      makeDbRow({ species_id: '2', county: 'Kittitas', state: 'WA', locality: 'Swauk Cr.; site 3' }),
      makeDbRow({ species_id: '2', county: 'Kittitas', state: 'WA', locality: 'Different Locality Text' }),
    ];
    const result = joinNaturalKey(csvRows, dbRows, CROSSWALK);
    assert.equal(result.filled[0]?.county, 'Kittitas');
    assert.equal(result.filled[0]?.district_id, 'US:53037');
    assert.equal(
      result.reportRows.find((r) => r.species_slug === 'genus-species')?.outcome,
      'filled',
    );
  });

  it('resolves a multi-match county conflict via an exact case-insensitive locality tie-break', () => {
    const csvRows = [makeCsvRow({ species_id: '3', locality: 'little rattlesnake cr.' })];
    const dbRows = [
      makeDbRow({ species_id: '3', county: 'Kittitas', state: 'WA', locality: 'Swauk Cr.; site 3' }),
      makeDbRow({ species_id: '3', county: 'Yakima', state: 'WA', locality: 'Little Rattlesnake Cr.' }),
    ];
    const result = joinNaturalKey(csvRows, dbRows, CROSSWALK);
    assert.equal(result.filled[0]?.county, 'Yakima');
    assert.equal(result.filled[0]?.district_id, 'US:53077');
    assert.ok(result.reportRows.some((r) => r.outcome === 'filled'));
  });

  it('leaves a still-conflicting multi-match group blank and reports conflict_unresolved', () => {
    const csvRows = [makeCsvRow({ species_id: '4', locality: 'Some other locality entirely' })];
    const dbRows = [
      makeDbRow({ species_id: '4', county: 'Kittitas', state: 'WA', locality: 'Swauk Cr.; site 3' }),
      makeDbRow({ species_id: '4', county: 'Yakima', state: 'WA', locality: 'Little Rattlesnake Cr.' }),
    ];
    const result = joinNaturalKey(csvRows, dbRows, CROSSWALK);
    assert.equal(result.filled[0]?.county, '');
    assert.equal(result.filled[0]?.district_id, '');
    assert.ok(result.reportRows.some((r) => r.outcome === 'conflict_unresolved'));
    assert.equal(result.unmappedNames.size, 0);
  });

  it('never overwrites an already-filled row (additive-only) and reports already_had_value', () => {
    const csvRows = [makeCsvRow({ species_id: '5', county: 'Chelan', district_id: 'US:53007' })];
    // A DB row that *would* match and suggest a different county, proving the
    // join never even considers overwriting a non-blank county.
    const dbRows = [makeDbRow({ species_id: '5', county: 'Yakima', state: 'WA' })];
    const result = joinNaturalKey(csvRows, dbRows, CROSSWALK);
    assert.equal(result.filled[0]?.county, 'Chelan');
    assert.equal(result.filled[0]?.district_id, 'US:53007');
    assert.ok(result.reportRows.some((r) => r.outcome === 'already_had_value'));
  });

  it('surfaces an unmapped (state, legacy_name) crosswalk pair and fills nothing partial', () => {
    const csvRows = [makeCsvRow({ species_id: '6' })];
    const dbRows = [makeDbRow({ species_id: '6', county: 'Ghostcounty', state: 'WA' })];
    const result = joinNaturalKey(csvRows, dbRows, CROSSWALK);
    assert.equal(result.filled[0]?.county, '');
    assert.equal(result.filled[0]?.district_id, '');
    assert.ok(result.unmappedNames.has('WA|Ghostcounty'));
  });

  it('reports species_unresolved and leaves the row blank when species_id could not be resolved', () => {
    const csvRows = [makeCsvRow({ species_id: null })];
    const dbRows = [makeDbRow({ species_id: '1', county: 'Yakima', state: 'WA' })];
    const result = joinNaturalKey(csvRows, dbRows, CROSSWALK);
    assert.equal(result.filled[0]?.county, '');
    assert.ok(result.reportRows.some((r) => r.outcome === 'species_unresolved'));
  });

  it('is idempotent: re-running over its own filled output changes nothing', () => {
    const csvRows = [
      makeCsvRow({ species_id: '1' }),
      makeCsvRow({ species_id: '5', county: 'Chelan', district_id: 'US:53007' }),
    ];
    const dbRows = [
      makeDbRow({ species_id: '1', county: 'Yakima', state: 'WA' }),
      makeDbRow({ species_id: '5', county: 'Yakima', state: 'WA' }),
    ];
    const first = joinNaturalKey(csvRows, dbRows, CROSSWALK);
    const second = joinNaturalKey(first.filled, dbRows, CROSSWALK);
    assert.deepEqual(second.filled, first.filled);
    assert.ok(second.reportRows.every((r) => r.outcome === 'already_had_value'));
  });
});
