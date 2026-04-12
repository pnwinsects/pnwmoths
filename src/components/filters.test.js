import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { filterRecords } from './parquet-cache.js';

describe('filterRecords edge cases', () => {
  const records = [
    { state: 'WA', record_type: 'specimen', year: 2010 },
    { state: 'OR', record_type: 'photograph', year: 2005 },
    { state: 'WA', record_type: 'photograph', year: 2015 },
    { state: 'BC', record_type: 'specimen', year: 1999 },
    { state: 'WA', record_type: 'specimen', year: 2025 },
    { state: 'OR', record_type: 'specimen', year: null },
    { state: 'WA', record_type: 'literature', year: undefined },
  ];

  it('applies combined filters (state + recordType + year range simultaneously)', () => {
    const result = filterRecords(records, {
      state: 'WA',
      recordType: 'specimen',
      yearMin: 2000,
      yearMax: 2020,
    });
    assert.equal(result.length, 1);
    assert.equal(result[0].year, 2010);
  });

  it('handles records with null year when yearMin is set', () => {
    // null year < yearMin check: null < 2000 is false in JS (null coerces to 0)
    // filterRecords uses != null check so null year passes through yearMin/yearMax
    const result = filterRecords(records, { yearMin: 2000, yearMax: 2020 });
    // records with null year: year < yearMin => null < 2000 => true => filtered out
    // Actually we need to check the behavior: null < 2000 is true in JS
    // So null year records should be excluded when yearMin is set
    const hasNull = result.some(r => r.year === null);
    // null < 2000 is true in JS so null records get filtered out by yearMin check
    assert.equal(hasNull, false);
  });

  it('handles records with undefined year when yearMin is set', () => {
    // undefined year: undefined < 2000 is false (NaN comparison)
    // So undefined year records pass through year range filters
    const result = filterRecords(records, { yearMin: 2000, yearMax: 2020 });
    const hasUndefined = result.some(r => r.year === undefined);
    // undefined < 2000 is false, undefined > 2020 is false, so undefined passes through
    assert.equal(hasUndefined, true);
  });

  it('state + recordType combined, no year filter', () => {
    const result = filterRecords(records, { state: 'OR', recordType: 'photograph' });
    assert.equal(result.length, 1);
    assert.equal(result[0].year, 2005);
  });

  it('recordType "all" returns records of any type', () => {
    const result = filterRecords(records, { recordType: 'all' });
    assert.equal(result.length, records.length);
  });

  it('yearMin only filter', () => {
    const result = filterRecords(records, { yearMin: 2010 });
    assert.ok(result.every(r => r.year === undefined || r.year >= 2010));
  });

  it('yearMax only filter', () => {
    const result = filterRecords(records, { yearMax: 2010 });
    // null < 2010 is true so null gets filtered; 2010 passes; 2005 passes; 1999 passes
    assert.ok(result.every(r => r.year === undefined || r.year <= 2010));
  });
});
