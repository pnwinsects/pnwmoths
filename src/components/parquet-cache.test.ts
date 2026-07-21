import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { filterRecords, aggregateByMonth, loadParquet, assertParquetColumns, isRearedRecord, REARED_TERMS } from './parquet-cache.ts';
import type { OccurrenceRecord } from '../types/index.ts';

/** Build a valid OccurrenceRecord with overridable notes/month for fixtures. */
function makeRecord(overrides: Partial<OccurrenceRecord> = {}): OccurrenceRecord {
  return {
    species_slug: 'acronicta-americana',
    record_type: 'specimen',
    latitude: 47.6,
    longitude: -122.3,
    state: 'WA',
    county: null,
    locality: null,
    elevation_ft: null,
    year: null,
    month: null,
    day: null,
    collector: null,
    collection: null,
    notes: null,
    district_id: null,
    ...overrides,
  };
}

describe('filterRecords', () => {
  const records = [
    { state: 'WA', record_type: 'specimen', year: 2010 },
    { state: 'OR', record_type: 'photograph', year: 2005 },
    { state: 'WA', record_type: 'photograph', year: 2015 },
    { state: 'BC', record_type: 'specimen', year: 1999 },
    { state: 'WA', record_type: 'specimen', year: 2025 },
  ] as unknown as OccurrenceRecord[];

  it('filters by state', () => {
    const result = filterRecords(records, { state: 'WA' });
    assert.equal(result.length, 3);
    assert.ok(result.every(r => r.state === 'WA'));
  });

  it('filters by recordType', () => {
    const result = filterRecords(records, { recordType: 'specimen' });
    assert.equal(result.length, 3);
    assert.ok(result.every(r => r.record_type === 'specimen'));
  });

  it('filters by yearMin and yearMax', () => {
    const result = filterRecords(records, { yearMin: 2000, yearMax: 2020 });
    assert.equal(result.length, 3);
    assert.ok(result.every(r => r.year != null && r.year >= 2000 && r.year <= 2020));
  });

  it('returns all records when state is "all"', () => {
    const result = filterRecords(records, { state: 'all' });
    assert.equal(result.length, records.length);
  });

  it('returns all records with empty filters object', () => {
    const result = filterRecords(records, {});
    assert.equal(result.length, records.length);
  });
});

describe('aggregateByMonth', () => {
  it('aggregates month counts', () => {
    const result = aggregateByMonth([
      { month: 1 },
      { month: 1 },
      { month: 6 },
    ] as unknown as OccurrenceRecord[]);
    assert.deepEqual(result, [2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]);
  });

  it('returns all zeros for empty array', () => {
    const result = aggregateByMonth([]);
    assert.deepEqual(result, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('ignores records with month=0', () => {
    const result = aggregateByMonth([{ month: 0 }, { month: 1 }] as unknown as OccurrenceRecord[]);
    assert.equal(result[0], 1);
    assert.equal(result.reduce((a, b) => a + b, 0), 1);
  });

  it('ignores records with month=13', () => {
    const result = aggregateByMonth([{ month: 13 }, { month: 1 }] as unknown as OccurrenceRecord[]);
    assert.equal(result[0], 1);
    assert.equal(result.reduce((a, b) => a + b, 0), 1);
  });

  it('ignores records with month=null', () => {
    const result = aggregateByMonth([{ month: null }, { month: 3 }] as unknown as OccurrenceRecord[]);
    assert.equal(result[2], 1);
    assert.equal(result.reduce((a, b) => a + b, 0), 1);
  });
});

describe('loadParquet', () => {
  it('is an async function', () => {
    assert.equal(typeof loadParquet, 'function');
    // async functions return a Promise when called; check constructor name
    // We call with a dummy slug but don't await — just check it's a function
    const result = loadParquet('test-slug');
    assert.ok(result instanceof Promise, 'loadParquet should return a Promise');
    // Prevent unhandled rejection by catching
    result.catch(() => {});
  });
});

describe('REARED_TERMS', () => {
  it('preserves the legacy keyword list minus foodplant terms (order + casing)', () => {
    assert.deepEqual(REARED_TERMS, [
      'reared', 'larva', 'em.', 'pupa', 'immature',
      'ovum', 'emerged', 'emgd', 'em in', 'em ex', 'eggs',
    ]);
  });

  it('carries no foodplant genus terms', () => {
    for (const plant of ['Rubus', 'Taraxacum', 'broadleaf']) {
      assert.ok(!REARED_TERMS.includes(plant), `${plant} should not flag a record as reared`);
    }
  });
});

describe('isRearedRecord', () => {
  it('returns true for a "reared ex pupa" note (matches reared, pupa)', () => {
    assert.equal(isRearedRecord(makeRecord({ notes: 'reared ex pupa, collected late April 2014' })), true);
  });

  it('returns true for a "larva on limestone ridge" note', () => {
    assert.equal(isRearedRecord(makeRecord({ notes: 'larva on limestone ridge; Jul. 29, 2011' })), true);
  });

  it('returns true for "Larva" (case-insensitive match of larva)', () => {
    assert.equal(isRearedRecord(makeRecord({ notes: 'Larva' })), true);
  });

  it('returns true for "ex. larva on Lactuca serriola; August 13, 2009"', () => {
    assert.equal(isRearedRecord(makeRecord({ notes: 'ex. larva on Lactuca serriola; August 13, 2009' })), true);
  });

  it('returns true for a note containing "em."', () => {
    assert.equal(isRearedRecord(makeRecord({ notes: 'em. ex pupa' })), true);
  });

  it('returns false for notes = null', () => {
    assert.equal(isRearedRecord(makeRecord({ notes: null })), false);
  });

  it('returns false for notes = "" (empty string)', () => {
    assert.equal(isRearedRecord(makeRecord({ notes: '' })), false);
  });

  it('returns false for a non-reared note', () => {
    assert.equal(isRearedRecord(makeRecord({ notes: 'At UV light trap, MV lamp' })), false);
  });

  it('returns false for an adult nectaring on a foodplant genus', () => {
    assert.equal(isRearedRecord(makeRecord({ notes: 'nectaring on Taraxacum; May 24, 2009' })), false);
  });

  it('returns true for a larva on a foodplant (the larva term still matches)', () => {
    assert.equal(isRearedRecord(makeRecord({ notes: 'larva on Rubus spectabilis' })), true);
  });
});

describe('aggregateByMonth reared exclusion', () => {
  it('counts only the clean record when two reared + one clean share month 6', () => {
    const records = [
      makeRecord({ month: 6, notes: 'reared ex pupa' }),
      makeRecord({ month: 6, notes: 'Larva' }),
      makeRecord({ month: 6, notes: 'At UV light trap' }),
    ];
    const counts = aggregateByMonth(records);
    assert.equal(counts[5], 1);
  });

  it('does not increment any bucket for a reared record with a populated month', () => {
    const counts = aggregateByMonth([makeRecord({ month: 6, notes: 'reared ex pupa' })]);
    assert.deepEqual(counts, new Array(12).fill(0));
  });

  it('preserves existing behavior: a clean record with month=null contributes 0', () => {
    const counts = aggregateByMonth([makeRecord({ month: null, notes: 'At UV light trap' })]);
    assert.deepEqual(counts, new Array(12).fill(0));
  });
});

describe('Parquet column validator', () => {
  // The root group element at schema[0] is named 'duckdb_schema' (no type/logicalType).
  // schema.slice(1) gives the 15 leaf column elements, each with .name.
  const ALL_15_COLUMNS = [
    'species_slug', 'record_type', 'latitude', 'longitude', 'state',
    'county', 'locality', 'elevation_ft', 'year', 'month', 'day',
    'collector', 'collection', 'notes', 'district_id',
  ];

  it('passes for a complete column set', () => {
    const goodMeta = {
      schema: [
        { name: 'duckdb_schema' },
        ...ALL_15_COLUMNS.map(name => ({ name })),
      ],
    };
    // Should not throw
    assert.doesNotThrow(() => assertParquetColumns(goodMeta));
  });

  it('throws when a required column is missing', () => {
    const missingCollection = ALL_15_COLUMNS.filter(c => c !== 'collection');
    const badMeta = {
      schema: [
        { name: 'duckdb_schema' },
        ...missingCollection.map(name => ({ name })),
      ],
    };
    assert.throws(
      () => assertParquetColumns(badMeta),
      /schema mismatch/
    );
  });
});
