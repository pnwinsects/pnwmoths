import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { filterRecords, aggregateByMonth, loadParquet } from './parquet-cache.js';

describe('filterRecords', () => {
  const records = [
    { state: 'WA', record_type: 'specimen', year: 2010 },
    { state: 'OR', record_type: 'photograph', year: 2005 },
    { state: 'WA', record_type: 'photograph', year: 2015 },
    { state: 'BC', record_type: 'specimen', year: 1999 },
    { state: 'WA', record_type: 'specimen', year: 2025 },
  ];

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
    assert.ok(result.every(r => r.year >= 2000 && r.year <= 2020));
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
    ]);
    assert.deepEqual(result, [2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]);
  });

  it('returns all zeros for empty array', () => {
    const result = aggregateByMonth([]);
    assert.deepEqual(result, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('ignores records with month=0', () => {
    const result = aggregateByMonth([{ month: 0 }, { month: 1 }]);
    assert.equal(result[0], 1);
    assert.equal(result.reduce((a, b) => a + b, 0), 1);
  });

  it('ignores records with month=13', () => {
    const result = aggregateByMonth([{ month: 13 }, { month: 1 }]);
    assert.equal(result[0], 1);
    assert.equal(result.reduce((a, b) => a + b, 0), 1);
  });

  it('ignores records with month=null', () => {
    const result = aggregateByMonth([{ month: null }, { month: 3 }]);
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
