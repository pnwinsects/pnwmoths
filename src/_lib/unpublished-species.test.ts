// src/_lib/unpublished-species.test.ts
// Unit tests for unpublished-species loader and predicate (ISSUE-80).
// Run via: node --test src/_lib/unpublished-species.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  loadUnpublishedSpecies,
  isUnpublished,
  normalizeSlug,
} from './unpublished-species.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

// ---------------------------------------------------------------------------
// normalizeSlug
// ---------------------------------------------------------------------------

test('normalizeSlug: spaces converted to hyphens — "aseptis-sp no 1" → "aseptis-sp-no-1"', () => {
  assert.strictEqual(normalizeSlug('aseptis-sp no 1'), 'aseptis-sp-no-1');
});

test('normalizeSlug: leading/trailing whitespace trimmed and uppercase lowercased — " Drasteria-SP " → "drasteria-sp"', () => {
  assert.strictEqual(normalizeSlug(' Drasteria-SP '), 'drasteria-sp');
});

test('normalizeSlug: multiple consecutive spaces collapse to a single hyphen', () => {
  assert.strictEqual(normalizeSlug('resapamea-n sp nr innota'), 'resapamea-n-sp-nr-innota');
});

test('normalizeSlug: already-hyphenated slug unchanged modulo case', () => {
  assert.strictEqual(normalizeSlug('drasteria-sp'), 'drasteria-sp');
});

// ---------------------------------------------------------------------------
// loadUnpublishedSpecies
// ---------------------------------------------------------------------------

test('loadUnpublishedSpecies: real data/unpublished-species.csv yields exactly 22 entries', () => {
  const unpublished = loadUnpublishedSpecies(resolve(ROOT, 'data/unpublished-species.csv'));
  assert.ok(unpublished instanceof Set, 'result should be a Set');
  assert.strictEqual(unpublished.size, 22, `expected 22 entries, got ${unpublished.size}: ${[...unpublished].join(', ')}`);
});

test('loadUnpublishedSpecies: real CSV contains "aseptis-sp-no-1"', () => {
  const unpublished = loadUnpublishedSpecies(resolve(ROOT, 'data/unpublished-species.csv'));
  assert.ok(unpublished.has('aseptis-sp-no-1'), 'should contain aseptis-sp-no-1');
});

test('loadUnpublishedSpecies: real CSV contains "xylophanes-nr-libya"', () => {
  const unpublished = loadUnpublishedSpecies(resolve(ROOT, 'data/unpublished-species.csv'));
  assert.ok(unpublished.has('xylophanes-nr-libya'), 'should contain xylophanes-nr-libya');
});

test('loadUnpublishedSpecies: header-only CSV (no data rows) yields an empty set (deny-list lifted)', () => {
  const tmpDir = resolve(ROOT, '.tmp-unpublished-test-header');
  mkdirSync(tmpDir, { recursive: true });
  const tmpFile = resolve(tmpDir, 'header-only.csv');
  try {
    writeFileSync(tmpFile, 'slug,reason\n');
    const unpublished = loadUnpublishedSpecies(tmpFile);
    assert.ok(unpublished instanceof Set, 'result should be a Set');
    assert.strictEqual(unpublished.size, 0, 'header-only CSV should produce an empty set');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('loadUnpublishedSpecies: missing file yields an empty set without throwing', () => {
  const missingPath = resolve(ROOT, '.tmp-unpublished-nonexistent', 'nonexistent.csv');
  let threw = false;
  let unpublished: Set<string> | undefined;
  try {
    unpublished = loadUnpublishedSpecies(missingPath);
  } catch {
    threw = true;
  }
  assert.ok(!threw, 'missing file should not throw');
  assert.ok(unpublished instanceof Set, 'result should be a Set even for missing file');
  assert.strictEqual(unpublished.size, 0, 'missing file should produce an empty set');
});

// ---------------------------------------------------------------------------
// isUnpublished
// ---------------------------------------------------------------------------

test('isUnpublished: raw space-slug "aseptis-sp no 1" matches hyphenated deny entry', () => {
  const denySet = new Set(['aseptis-sp-no-1']);
  assert.ok(isUnpublished('aseptis-sp no 1', denySet), 'space-slug should match hyphenated deny entry');
});

test('isUnpublished: non-deny slug "drasteria-parallela" returns false', () => {
  const denySet = new Set(['drasteria-sp']);
  assert.ok(!isUnpublished('drasteria-parallela', denySet), 'non-deny slug should return false');
});

test('isUnpublished: null returns false', () => {
  const denySet = new Set(['aseptis-sp-no-1']);
  assert.ok(!isUnpublished(null, denySet), 'null should return false');
});

test('isUnpublished: anything returns false against empty set', () => {
  const emptySet = new Set<string>();
  assert.ok(!isUnpublished('aseptis-sp-no-1', emptySet), 'deny-listed slug should return false for empty set');
  assert.ok(!isUnpublished('drasteria-sp', emptySet), 'any slug should return false for empty set');
});
