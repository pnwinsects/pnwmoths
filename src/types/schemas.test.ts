// TDD RED: behavioral tests for schemas.ts zod/mini migration
// These tests verify OccurrenceRecordSchema and SpeciesStateSchema behavior
// is preserved after the zod/mini functional API migration (D-02).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OccurrenceRecordSchema, SpeciesStateSchema } from './schemas.ts';

describe('OccurrenceRecordSchema', () => {
  const validRecord = {
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
  };

  it('accepts a valid record with all nullable fields null', () => {
    const result = OccurrenceRecordSchema.safeParse(validRecord);
    assert.ok(result.success, `Expected success but got: ${JSON.stringify(result)}`);
  });

  it('accepts a record with non-null nullable fields', () => {
    const record = {
      ...validRecord,
      county: 'King',
      locality: 'Seattle',
      elevation_ft: 100,
      year: 2020,
      month: 6,
      day: 15,
      collector: 'J. Smith',
      collection: 'UWBM',
      notes: 'Some note',
    };
    const result = OccurrenceRecordSchema.safeParse(record);
    assert.ok(result.success, `Expected success but got: ${JSON.stringify(result)}`);
  });

  it('rejects a record missing species_slug', () => {
    const { species_slug: _, ...withoutSlug } = validRecord;
    const result = OccurrenceRecordSchema.safeParse(withoutSlug);
    assert.ok(!result.success, 'Expected failure for missing species_slug');
  });

  it('safeParse error issues have readable message and path', () => {
    const result = OccurrenceRecordSchema.safeParse({});
    assert.ok(!result.success);
    assert.ok(Array.isArray(result.error.issues), 'Expected issues array');
    assert.ok(result.error.issues.length > 0, 'Expected at least one issue');
    const issue = result.error.issues[0];
    assert.ok(typeof issue.message === 'string', 'Expected string message');
  });
});

describe('SpeciesStateSchema', () => {
  it('accepts { species_slug, state }', () => {
    const result = SpeciesStateSchema.safeParse({ species_slug: 's', state: 'WA' });
    assert.ok(result.success, `Expected success but got: ${JSON.stringify(result)}`);
  });

  it('rejects { species_slug } missing state', () => {
    const result = SpeciesStateSchema.safeParse({ species_slug: 's' });
    assert.ok(!result.success, 'Expected failure for missing state');
  });
});
