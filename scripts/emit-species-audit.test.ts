// scripts/emit-species-audit.test.ts
// Unit tests for the emit-species-audit.ts pure helpers (buildSpeciesAuditRows + toCsv).
// No build required — all data is passed in directly.
// Run via: node --test scripts/emit-species-audit.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSpeciesAuditRows,
  toCsv,
  AUDIT_HEADER,
  type SpeciesInput,
} from './emit-species-audit.ts';

const WITHHELD = new Set(['geometridae']);

function row(overrides: Partial<SpeciesInput>): SpeciesInput {
  return {
    genus: 'Aseptis',
    species: 'binotata',
    common_name: '',
    family: 'Noctuidae',
    subfamily: 'Noctuinae',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// buildSpeciesAuditRows — flag computation
// ---------------------------------------------------------------------------

test('buildSpeciesAuditRows: visible species with records and in key → true,true,true', () => {
  const rows = buildSpeciesAuditRows({
    speciesRows: [row({ genus: 'Aseptis', species: 'binotata' })],
    recordSlugs: new Set(['aseptis-binotata']),
    keySlugs: new Set(['aseptis-binotata']),
    withheldFamilies: WITHHELD,
    unpublishedSlugs: new Set(),
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.slug, 'aseptis-binotata');
  assert.equal(rows[0]!.has_records, true);
  assert.equal(rows[0]!.visible, true);
  assert.equal(rows[0]!.in_key, true);
});

test('buildSpeciesAuditRows: withheld family → visible=false even with records and key', () => {
  const rows = buildSpeciesAuditRows({
    speciesRows: [row({ genus: 'Drasteria', species: 'parallela', family: 'Geometridae' })],
    recordSlugs: new Set(['drasteria-parallela']),
    keySlugs: new Set(['drasteria-parallela']),
    withheldFamilies: WITHHELD,
    unpublishedSlugs: new Set(),
  });
  assert.equal(rows[0]!.visible, false);
  assert.equal(rows[0]!.has_records, true);
  assert.equal(rows[0]!.in_key, true);
});

test('buildSpeciesAuditRows: slug on the unpublished deny-list → visible=false', () => {
  const rows = buildSpeciesAuditRows({
    speciesRows: [row({ genus: 'Aseptis', species: 'sp no 1' })],
    recordSlugs: new Set(),
    keySlugs: new Set(),
    withheldFamilies: WITHHELD,
    unpublishedSlugs: new Set(['aseptis-sp-no-1']),
  });
  assert.equal(rows[0]!.visible, false);
});

test('buildSpeciesAuditRows: blank/null family → visible=false (fail-closed)', () => {
  const rowsBlank = buildSpeciesAuditRows({
    speciesRows: [row({ genus: 'Foo', species: 'bar', family: '' })],
    recordSlugs: new Set(),
    keySlugs: new Set(),
    withheldFamilies: WITHHELD,
    unpublishedSlugs: new Set(),
  });
  assert.equal(rowsBlank[0]!.visible, false);

  const rowsNull = buildSpeciesAuditRows({
    speciesRows: [row({ genus: 'Foo', species: 'baz', family: null as unknown as string })],
    recordSlugs: new Set(),
    keySlugs: new Set(),
    withheldFamilies: WITHHELD,
    unpublishedSlugs: new Set(),
  });
  assert.equal(rowsNull[0]!.visible, false);
});

test('buildSpeciesAuditRows: slug reconciliation — embedded space matches hyphenated record/deny slug', () => {
  // species.csv row has an embedded space ("sp no 1"); records and deny-list use
  // the hyphenated form. normalizeSlug on both sides reconciles them to one slug.
  const rows = buildSpeciesAuditRows({
    speciesRows: [row({ genus: 'Aseptis', species: 'sp no 1' })],
    recordSlugs: new Set(['aseptis-sp-no-1']),
    keySlugs: new Set(['aseptis-sp-no-1']),
    withheldFamilies: WITHHELD,
    unpublishedSlugs: new Set(['aseptis-sp-no-1']),
  });
  assert.equal(rows[0]!.slug, 'aseptis-sp-no-1');
  assert.equal(rows[0]!.has_records, true, 'space form must match hyphenated record slug');
  assert.equal(rows[0]!.in_key, true, 'space form must match hyphenated key slug');
  assert.equal(rows[0]!.visible, false, 'space form must match hyphenated deny slug');
});

test('buildSpeciesAuditRows: rows returned sorted by slug', () => {
  const rows = buildSpeciesAuditRows({
    speciesRows: [
      row({ genus: 'Zzz', species: 'zzz' }),
      row({ genus: 'Aaa', species: 'aaa' }),
    ],
    recordSlugs: new Set(),
    keySlugs: new Set(),
    withheldFamilies: WITHHELD,
    unpublishedSlugs: new Set(),
  });
  assert.deepEqual(rows.map((r) => r.slug), ['aaa-aaa', 'zzz-zzz']);
});

// ---------------------------------------------------------------------------
// toCsv — serialization
// ---------------------------------------------------------------------------

test('toCsv: header is exact and booleans render as true/false', () => {
  const csv = toCsv([
    {
      slug: 'aseptis-binotata',
      genus: 'Aseptis',
      species: 'binotata',
      common_name: '',
      family: 'Noctuidae',
      subfamily: 'Noctuinae',
      has_records: true,
      visible: false,
      in_key: true,
    },
  ]);
  const lines = csv.trimEnd().split('\n');
  assert.equal(lines[0], AUDIT_HEADER);
  assert.equal(lines[0], 'slug,genus,species,common_name,family,subfamily,has_records,visible,in_key');
  assert.equal(
    lines[1],
    'aseptis-binotata,Aseptis,binotata,,Noctuidae,Noctuinae,true,false,true',
  );
});

test('toCsv: a common_name containing a comma is quoted', () => {
  const csv = toCsv([
    {
      slug: 'foo-bar',
      genus: 'Foo',
      species: 'bar',
      common_name: 'Big, Spotted Moth',
      family: 'Noctuidae',
      subfamily: '',
      has_records: false,
      visible: true,
      in_key: false,
    },
  ]);
  const lines = csv.trimEnd().split('\n');
  assert.equal(
    lines[1],
    'foo-bar,Foo,bar,"Big, Spotted Moth",Noctuidae,,false,true,false',
  );
});

test('toCsv: a field containing a double-quote is quoted and the quote doubled', () => {
  const csv = toCsv([
    {
      slug: 'foo-bar',
      genus: 'Foo',
      species: 'bar',
      common_name: 'The "Great" Moth',
      family: 'Noctuidae',
      subfamily: '',
      has_records: false,
      visible: true,
      in_key: false,
    },
  ]);
  const lines = csv.trimEnd().split('\n');
  assert.equal(
    lines[1],
    'foo-bar,Foo,bar,"The ""Great"" Moth",Noctuidae,,false,true,false',
  );
});
