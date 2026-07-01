// scripts/check-unpublished.test.ts
// Unit tests for the check-unpublished.ts pure leak-detection helper (ISSUE-80).
// Run via: node --test scripts/check-unpublished.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { findUnpublishedLeaks } from './check-unpublished.ts';

// ---------------------------------------------------------------------------
// findUnpublishedLeaks — clean cases
// ---------------------------------------------------------------------------

test('findUnpublishedLeaks: clean case — empty deny set → no leaks', () => {
  const leaks = findUnpublishedLeaks({
    unpublishedSlugs: new Set<string>(),
    emittedSlugs: ['drasteria-parallela', 'aseptis-binotata'],
    keyMatrixSlugs: ['drasteria-parallela'],
  });
  assert.deepStrictEqual(leaks.pageLeaks, [], 'no page leaks for empty deny set');
  assert.deepStrictEqual(leaks.keyMatrixLeaks, [], 'no key-matrix leaks for empty deny set');
});

test('findUnpublishedLeaks: deny-listed slug absent from both emitted and key-matrix → no leaks', () => {
  const leaks = findUnpublishedLeaks({
    unpublishedSlugs: new Set(['aseptis-sp-no-1']),
    emittedSlugs: ['aseptis-binotata', 'drasteria-parallela'],
    keyMatrixSlugs: ['aseptis-binotata'],
  });
  assert.deepStrictEqual(leaks.pageLeaks, []);
  assert.deepStrictEqual(leaks.keyMatrixLeaks, []);
});

// ---------------------------------------------------------------------------
// findUnpublishedLeaks — page leak detection (normalization)
// ---------------------------------------------------------------------------

test('findUnpublishedLeaks: planted space-slug "aseptis-sp no 1" is reported as a page leak', () => {
  // Proves normalization: emitted dir may have literal space; deny-list has hyphen form.
  const leaks = findUnpublishedLeaks({
    unpublishedSlugs: new Set(['aseptis-sp-no-1']),
    emittedSlugs: ['aseptis-sp no 1', 'aseptis-binotata'],
    keyMatrixSlugs: [],
  });
  assert.ok(
    leaks.pageLeaks.includes('aseptis-sp no 1'),
    `Expected 'aseptis-sp no 1' in pageLeaks, got: ${JSON.stringify(leaks.pageLeaks)}`,
  );
  assert.deepStrictEqual(leaks.keyMatrixLeaks, []);
});

test('findUnpublishedLeaks: non-deny emitted slug "drasteria-parallela" is not a leak', () => {
  const leaks = findUnpublishedLeaks({
    unpublishedSlugs: new Set(['drasteria-sp']),
    emittedSlugs: ['drasteria-parallela', 'drasteria-sp'],
    keyMatrixSlugs: [],
  });
  // drasteria-sp is a leak; drasteria-parallela is NOT
  assert.ok(leaks.pageLeaks.includes('drasteria-sp'), 'drasteria-sp should be a leak');
  assert.ok(!leaks.pageLeaks.includes('drasteria-parallela'), 'drasteria-parallela should not be a leak');
});

// ---------------------------------------------------------------------------
// findUnpublishedLeaks — key-matrix leak detection
// ---------------------------------------------------------------------------

test('findUnpublishedLeaks: planted key-matrix slug is reported as a key-matrix leak', () => {
  const leaks = findUnpublishedLeaks({
    unpublishedSlugs: new Set(['holoarctia-sp']),
    emittedSlugs: [],
    keyMatrixSlugs: ['holoarctia-sp', 'aseptis-binotata'],
  });
  assert.ok(
    leaks.keyMatrixLeaks.includes('holoarctia-sp'),
    `Expected 'holoarctia-sp' in keyMatrixLeaks, got: ${JSON.stringify(leaks.keyMatrixLeaks)}`,
  );
  assert.deepStrictEqual(leaks.pageLeaks, []);
});
