// src/_lib/withheld-families.test.ts
// Unit tests for withheld-families loader and predicate.
// Run via: node --test src/_lib/withheld-families.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadWithheldFamilies, isWithheld } from './withheld-families.ts';

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
