// src/_lib/withheld-families.test.ts
// Unit tests for withheld-families loader and predicate.
// Run via: node --test src/_lib/withheld-families.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  loadWithheldFamilies,
  isWithheld,
  isUnclassifiedFamily,
  isWithheldOrUnclassified,
} from './withheld-families.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

// ---------------------------------------------------------------------------
// loadWithheldFamilies
// ---------------------------------------------------------------------------

test('loadWithheldFamilies: real data/withheld-families.csv yields a set containing "geometridae"', () => {
  const withheld = loadWithheldFamilies(resolve(ROOT, 'data/withheld-families.csv'));
  assert.ok(withheld instanceof Set, 'result should be a Set');
  assert.ok(withheld.has('geometridae'), 'set should contain "geometridae" (lowercased)');
});

test('loadWithheldFamilies: header-only CSV (no data rows) yields an empty set', () => {
  const tmpDir = resolve(ROOT, '.tmp-withheld-test');
  mkdirSync(tmpDir, { recursive: true });
  const tmpFile = resolve(tmpDir, 'header-only.csv');
  try {
    writeFileSync(tmpFile, 'family\n');
    const withheld = loadWithheldFamilies(tmpFile);
    assert.ok(withheld instanceof Set, 'result should be a Set');
    assert.strictEqual(withheld.size, 0, 'header-only CSV should produce an empty set (embargo lifted)');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('loadWithheldFamilies: missing file yields an empty set without throwing', () => {
  const missingPath = resolve(ROOT, '.tmp-withheld-test', 'nonexistent.csv');
  let threw = false;
  let withheld: Set<string> | undefined;
  try {
    withheld = loadWithheldFamilies(missingPath);
  } catch {
    threw = true;
  }
  assert.ok(!threw, 'missing file should not throw');
  assert.ok(withheld instanceof Set, 'result should be a Set even for missing file');
  assert.strictEqual(withheld.size, 0, 'missing file should produce an empty set');
});

test('loadWithheldFamilies: multiple families in CSV are all loaded (lowercased)', () => {
  const tmpDir = resolve(ROOT, '.tmp-withheld-multi');
  mkdirSync(tmpDir, { recursive: true });
  const tmpFile = resolve(tmpDir, 'multi.csv');
  try {
    writeFileSync(tmpFile, 'family\nGeometridae\nNoctuidae\n');
    const withheld = loadWithheldFamilies(tmpFile);
    assert.strictEqual(withheld.size, 2, 'should have 2 entries');
    assert.ok(withheld.has('geometridae'));
    assert.ok(withheld.has('noctuidae'));
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// isWithheld
// ---------------------------------------------------------------------------

test('isWithheld: case-insensitive match — "GEOMETRIDAE" matches withheld set', () => {
  const withheld = new Set(['geometridae']);
  assert.ok(isWithheld('GEOMETRIDAE', withheld), 'uppercase family should match');
});

test('isWithheld: mixed-case "Geometridae" matches withheld set', () => {
  const withheld = new Set(['geometridae']);
  assert.ok(isWithheld('Geometridae', withheld), 'mixed-case family should match');
});

test('isWithheld: whitespace-padded " geometridae " matches withheld set', () => {
  const withheld = new Set(['geometridae']);
  assert.ok(isWithheld(' geometridae ', withheld), 'whitespace-padded family should match');
});

test('isWithheld: unlisted family "Noctuidae" returns false', () => {
  const withheld = new Set(['geometridae']);
  assert.ok(!isWithheld('Noctuidae', withheld), 'unlisted family should return false');
});

test('isWithheld: null returns false', () => {
  const withheld = new Set(['geometridae']);
  assert.ok(!isWithheld(null, withheld), 'null should return false');
});

test('isWithheld: undefined returns false', () => {
  const withheld = new Set(['geometridae']);
  assert.ok(!isWithheld(undefined, withheld), 'undefined should return false');
});

test('isWithheld: empty string returns false', () => {
  const withheld = new Set(['geometridae']);
  assert.ok(!isWithheld('', withheld), 'empty string should return false');
});

test('isWithheld: empty withheld set always returns false', () => {
  const withheld = new Set<string>();
  assert.ok(!isWithheld('Geometridae', withheld), 'empty withheld set: any family should return false');
});

// ---------------------------------------------------------------------------
// isUnclassifiedFamily
// ---------------------------------------------------------------------------

test('isUnclassifiedFamily: null / undefined / empty / whitespace are unclassified', () => {
  assert.ok(isUnclassifiedFamily(null), 'null');
  assert.ok(isUnclassifiedFamily(undefined), 'undefined');
  assert.ok(isUnclassifiedFamily(''), 'empty string');
  assert.ok(isUnclassifiedFamily('   '), 'whitespace-only');
});

test('isUnclassifiedFamily: a real family name is classified', () => {
  assert.ok(!isUnclassifiedFamily('Geometridae'), 'named family should not be unclassified');
  assert.ok(!isUnclassifiedFamily(' Noctuidae '), 'padded named family should not be unclassified');
});

// ---------------------------------------------------------------------------
// isWithheldOrUnclassified — fail-closed gate
// ---------------------------------------------------------------------------

test('isWithheldOrUnclassified: explicitly embargoed family is hidden', () => {
  const withheld = loadWithheldFamilies(resolve(ROOT, 'data/withheld-families.csv'));
  assert.ok(isWithheldOrUnclassified('Geometridae', withheld), 'embargoed family should be hidden');
});

test('isWithheldOrUnclassified: blank family is hidden even when not in the embargo set', () => {
  const withheld = new Set<string>(); // embargo lifted
  assert.ok(isWithheldOrUnclassified(null, withheld), 'null family should be hidden (fail-closed)');
  assert.ok(isWithheldOrUnclassified('', withheld), 'empty family should be hidden (fail-closed)');
  assert.ok(isWithheldOrUnclassified('  ', withheld), 'whitespace family should be hidden (fail-closed)');
});

test('isWithheldOrUnclassified: a classified, non-embargoed family is shown', () => {
  const withheld = loadWithheldFamilies(resolve(ROOT, 'data/withheld-families.csv'));
  assert.ok(!isWithheldOrUnclassified('Noctuidae', withheld), 'classified non-embargoed family should be shown');
});

// ---------------------------------------------------------------------------
// Data integrity — every species in data/species.csv has a family (ISSUE-62)
// A blank family produced the empty "" Browse heading and an embargo leak.
// ---------------------------------------------------------------------------

test('data/species.csv: every species row has a non-blank family', () => {
  const rows = parse(readFileSync(resolve(ROOT, 'data/species.csv')), {
    columns: true,
    skip_empty_lines: true,
  }) as Array<{ genus: string; species: string; family: string }>;
  const blanks = rows.filter(r => isUnclassifiedFamily(r.family));
  assert.equal(
    blanks.length,
    0,
    `unclassified species (would form a blank Browse heading / bypass the embargo): ${blanks
      .map(r => `${r.genus} ${r.species}`)
      .join(', ')}`,
  );
});
