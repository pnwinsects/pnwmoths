import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { filterRecords } from './parquet-cache.ts';
import type { OccurrenceRecord } from '../types/index.ts';

describe('filterRecords edge cases', () => {
  const records = [
    { state: 'WA', record_type: 'specimen', year: 2010 },
    { state: 'OR', record_type: 'photograph', year: 2005 },
    { state: 'WA', record_type: 'photograph', year: 2015 },
    { state: 'BC', record_type: 'specimen', year: 1999 },
    { state: 'WA', record_type: 'specimen', year: 2025 },
    { state: 'OR', record_type: 'specimen', year: null },
    { state: 'WA', record_type: 'literature', year: undefined },
  ] as unknown as OccurrenceRecord[];

  it('applies combined filters (state + recordType + year range simultaneously)', () => {
    const result = filterRecords(records, {
      state: 'WA',
      recordType: 'specimen',
      yearMin: 2000,
      yearMax: 2020,
    });
    assert.equal(result.length, 1);
    const [first] = result;
    assert.equal(first?.year, 2010);
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
    const [first] = result;
    assert.equal(first?.year, 2005);
  });

  it('recordType "all" returns records of any type', () => {
    const result = filterRecords(records, { recordType: 'all' });
    assert.equal(result.length, records.length);
  });

  it('yearMin only filter', () => {
    const result = filterRecords(records, { yearMin: 2010 });
    assert.ok(result.every(r => r.year === undefined || (r.year != null && r.year >= 2010)));
  });

  it('yearMax only filter', () => {
    const result = filterRecords(records, { yearMax: 2010 });
    // null year: (null as number) > 2010 => 0 > 2010 => false => NOT filtered out
    // undefined year: (undefined as number) > 2010 => NaN > 2010 => false => NOT filtered out
    // Non-null years > 2010 are filtered out
    assert.ok(result.every(r => r.year == null || r.year <= 2010));
  });
});

describe('filterRecords — geo and elevation dimensions', () => {
  const geoRecords = [
    { county: 'King',    collection: 'UW',  elevation_ft: 100  },
    { county: 'Pierce',  collection: 'PSU', elevation_ft: 500  },
    { county: 'King',    collection: 'UW',  elevation_ft: 2000 },
    { county: null,      collection: null,  elevation_ft: null },
    { county: 'Whatcom', collection: 'UW',  elevation_ft: 5000 },
  ] as unknown as OccurrenceRecord[];

  it('filters by county', () => {
    const result = filterRecords(geoRecords, { county: 'King' });
    assert.equal(result.length, 2);
  });

  it('county "all" returns all records', () => {
    const result = filterRecords(geoRecords, { county: 'all' });
    assert.equal(result.length, geoRecords.length);
  });

  it('null county record included when county is "all"', () => {
    const result = filterRecords(geoRecords, { county: 'all' });
    assert.ok(result.some(r => r.county === null));
  });

  it('filters by collection', () => {
    const result = filterRecords(geoRecords, { collection: 'UW' });
    assert.equal(result.length, 3);
  });

  it('collection "all" returns all records', () => {
    const result = filterRecords(geoRecords, { collection: 'all' });
    assert.equal(result.length, geoRecords.length);
  });

  it('filters by elevationMin', () => {
    // 500, 2000, 5000 pass; 100 excluded; null coerces to 0 so 0 < 500 → excluded
    const result = filterRecords(geoRecords, { elevationMin: 500 });
    assert.ok(result.every(r => r.elevation_ft === null || (r.elevation_ft != null && r.elevation_ft >= 500)));
  });

  it('filters by elevationMax', () => {
    // 100, 500 pass; 2000, 5000 excluded; null coerces to 0 so 0 <= 1000 → included
    const result = filterRecords(geoRecords, { elevationMax: 1000 });
    assert.ok(result.every(r => r.elevation_ft === null || (r.elevation_ft != null && r.elevation_ft <= 1000)));
  });

  it('elevation range excludes out-of-range', () => {
    const result = filterRecords(geoRecords, { elevationMin: 200, elevationMax: 3000 });
    // 500 and 2000 pass; 100 and 5000 excluded; null excluded (0 < 200)
    assert.equal(result.length, 2);
    assert.ok(result.every(r => r.elevation_ft != null && r.elevation_ft >= 200 && r.elevation_ft <= 3000));
  });

  it('null elevation_ft passes through at default bounds (0, 15000)', () => {
    const result = filterRecords(geoRecords, { elevationMin: 0, elevationMax: 15000 });
    // null < 0 → false; null > 15000 → false; null record passes
    assert.ok(result.some(r => r.elevation_ft === null));
  });

  it('combined county + collection + elevation', () => {
    const result = filterRecords(geoRecords, {
      county: 'King', collection: 'UW', elevationMin: 0, elevationMax: 500,
    });
    assert.equal(result.length, 1);
    const [first] = result;
    assert.equal(first?.elevation_ft, 100);
  });
});

describe('filterRecords — compound state:county keys (ISSUE-133)', () => {
  // Same-named county in two different states — the exact scenario the bug allowed
  // to silently aggregate: selecting "Lincoln" used to return both states' records.
  const crossStateRecords = [
    { county: 'Lincoln', state: 'WA', collection: 'UW' },
    { county: 'Lincoln', state: 'MT', collection: 'UM' },
    { county: 'Lincoln', state: 'OR', collection: 'OSU' },
    { county: 'Whatcom', state: 'WA', collection: 'UW' },
  ] as unknown as OccurrenceRecord[];

  it('a bare county name still matches every state (back-compat / unambiguous case)', () => {
    const result = filterRecords(crossStateRecords, { county: 'Lincoln' });
    assert.equal(result.length, 3);
    assert.ok(result.every(r => r.county === 'Lincoln'));
  });

  it('a compound state:county key matches only that state\'s records', () => {
    const result = filterRecords(crossStateRecords, { county: 'MT:Lincoln' });
    assert.equal(result.length, 1);
    assert.equal(result[0]?.state, 'MT');
    assert.equal(result[0]?.collection, 'UM');
  });

  it('a compound key for a different state excludes the others sharing the name', () => {
    const result = filterRecords(crossStateRecords, { county: 'WA:Lincoln' });
    assert.equal(result.length, 1);
    assert.equal(result[0]?.state, 'WA');
  });

  it('a compound key does not match records with the same county in a state it does not name', () => {
    const result = filterRecords(crossStateRecords, { county: 'OR:Lincoln' });
    assert.ok(result.every(r => r.state === 'OR'));
    assert.equal(result.length, 1);
  });

  it('a compound key for an unambiguous county still works', () => {
    const result = filterRecords(crossStateRecords, { county: 'WA:Whatcom' });
    assert.equal(result.length, 1);
    assert.equal(result[0]?.county, 'Whatcom');
  });

  it('a compound key naming a state/county pair with no matching records returns empty', () => {
    const result = filterRecords(crossStateRecords, { county: 'ID:Lincoln' });
    assert.equal(result.length, 0);
  });
});
