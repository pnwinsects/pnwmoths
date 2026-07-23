import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dedupeRecords, dedupeCsv, type RecordRow } from './dedup-records.ts';

const COLUMNS = [
  'species_slug', 'record_type', 'latitude', 'longitude', 'state', 'county',
  'locality', 'elevation_ft', 'year', 'month', 'day', 'collector', 'collection',
  'notes', 'district_id',
];

// A representative records.csv row. Helpers vary one field at a time so each
// test's intent is obvious.
function row(overrides: Partial<RecordRow> = {}): RecordRow {
  return {
    species_slug: 'euxoa-aurantiaca',
    record_type: 'specimen',
    latitude: '42.02',
    longitude: '-113.115',
    state: 'ID',
    county: 'Cassia',
    locality: 'Black Pine Mts, Formation Cyn',
    elevation_ft: '6312',
    year: '2012',
    month: '7',
    day: '12',
    collector: 'L. G. Crabo',
    collection: 'LGCC',
    notes: '',
    district_id: 'US:16031',
    ...overrides,
  };
}

describe('dedupeRecords', () => {
  it('removes exact duplicates and keeps the first occurrence', () => {
    const rows = [row(), row(), row()];
    const { kept, removedCount, duplicateGroups } = dedupeRecords(rows, COLUMNS);
    assert.equal(removedCount, 2);
    assert.equal(duplicateGroups, 1);
    assert.deepEqual(kept, [row()]);
  });

  it('preserves the order of retained rows', () => {
    const a = row({ year: '2011' });
    const b = row({ year: '2012' });
    const { kept } = dedupeRecords([a, b, a, b], COLUMNS);
    assert.deepEqual(kept, [a, b]);
  });

  it('treats rows differing in a curator-entered field as distinct', () => {
    const rows = [
      row({ locality: 'Everett' }),
      row({ locality: '' }), // blank vs filled locality — a real variant, not a dup
    ];
    const { removedCount, kept } = dedupeRecords(rows, COLUMNS);
    assert.equal(removedCount, 0);
    assert.equal(kept.length, 2);
  });

  it('collapses rows that differ only in the derived district_id', () => {
    const rows = [row({ district_id: 'US:16031' }), row({ district_id: 'US:99999' })];
    const { removedCount, kept } = dedupeRecords(rows, COLUMNS);
    assert.equal(removedCount, 1);
    assert.equal(kept.length, 1);
  });

  it('retains a district_id from a duplicate when the first occurrence lacks one', () => {
    const first = row({ district_id: '' });
    const later = row({ district_id: 'US:16031' });
    const { kept } = dedupeRecords([first, later], COLUMNS);
    assert.equal(kept.length, 1);
    assert.equal(kept[0]?.district_id, 'US:16031');
  });

  it('is idempotent — a second pass removes nothing', () => {
    const rows = [row(), row(), row({ year: '2011' })];
    const first = dedupeRecords(rows, COLUMNS);
    const second = dedupeRecords(first.kept, COLUMNS);
    assert.equal(second.removedCount, 0);
    assert.deepEqual(second.kept, first.kept);
  });

  it('returns everything unchanged when there are no duplicates', () => {
    const rows = [row({ year: '2011' }), row({ year: '2012' })];
    const { kept, removedCount, duplicateGroups } = dedupeRecords(rows, COLUMNS);
    assert.equal(removedCount, 0);
    assert.equal(duplicateGroups, 0);
    assert.deepEqual(kept, rows);
  });
});

describe('dedupeCsv', () => {
  const header = COLUMNS.join(',') + '\n';
  // A row with a comma-quoted field, to exercise stringify's quoting.
  const line = 'euxoa-aurantiaca,specimen,42.02,-113.115,ID,Cassia,"Black Pine Mts, Formation Cyn",6312,2012,7,12,L. G. Crabo,LGCC,,US:16031\n';
  const other = 'euxoa-aurantiaca,specimen,42.02,-113.115,ID,Cassia,"Black Pine Mts, Formation Cyn",6312,2011,7,22,L. G. Crabo,LGCC,,US:16031\n';

  it('is byte-faithful when there are no duplicates', () => {
    const raw = header + line + other;
    const { output, result } = dedupeCsv(raw);
    assert.equal(result.removedCount, 0);
    assert.equal(output, raw); // only-deletions guarantee: unchanged input round-trips exactly
  });

  it('removes duplicate lines and leaves the rest byte-identical', () => {
    const raw = header + line + line + other;
    const { output, result } = dedupeCsv(raw);
    assert.equal(result.removedCount, 1);
    assert.equal(output, header + line + other);
  });
});
