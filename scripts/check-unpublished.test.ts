// scripts/check-unpublished.test.ts
// Unit tests for the check-unpublished.ts pure leak-detection helper (ISSUE-80).
// Run via: node --test scripts/check-unpublished.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

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

// ---------------------------------------------------------------------------
// findUnpublishedLeaks — data leak detection (#275)
// ---------------------------------------------------------------------------

test('findUnpublishedLeaks: a deny-listed directory with no index.html is a DATA leak', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'check-unpublished-data-'));
  const slug = 'lycomorpha-grotei';
  mkdirSync(join(tmpDir, 'species', slug), { recursive: true });
  writeFileSync(join(tmpDir, 'species', slug, 'records.parquet'), 'PAR1');

  try {
    const leaks = findUnpublishedLeaks({
      unpublishedSlugs: new Set([slug]),
      emittedSlugs: [slug],
      keyMatrixSlugs: [],
      siteDir: tmpDir,
    });
    assert.deepStrictEqual(leaks.pageLeaks, []);
    assert.deepStrictEqual(leaks.dataLeaks, [slug]);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('findUnpublishedLeaks: a deny-listed directory WITH index.html is still a page leak', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'check-unpublished-page-'));
  const slug = 'lycomorpha-grotei';
  mkdirSync(join(tmpDir, 'species', slug), { recursive: true });
  writeFileSync(join(tmpDir, 'species', slug, 'index.html'), '<html>leaked</html>');

  try {
    const leaks = findUnpublishedLeaks({
      unpublishedSlugs: new Set([slug]),
      emittedSlugs: [slug],
      keyMatrixSlugs: [],
      siteDir: tmpDir,
    });
    assert.deepStrictEqual(leaks.pageLeaks, [slug]);
    assert.deepStrictEqual(leaks.dataLeaks, []);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('findUnpublishedLeaks: without siteDir every leak stays a page leak (callers that cannot stat)', () => {
  const leaks = findUnpublishedLeaks({
    unpublishedSlugs: new Set(['drasteria-sp']),
    emittedSlugs: ['drasteria-sp'],
    keyMatrixSlugs: [],
  });
  assert.deepStrictEqual(leaks.pageLeaks, ['drasteria-sp']);
  assert.deepStrictEqual(leaks.dataLeaks, []);
});

test('findUnpublishedLeaks: a percent-encoded directory holding index.html is a PAGE leak', () => {
  // The directory on disk is "aseptis-sp%20no%201"; the deny-list stores
  // "aseptis-sp-no-1". Matching needs the decoded form, the filesystem probe needs
  // the encoded one — get that backwards and a real page leak is filed as a data leak.
  const tmpDir = mkdtempSync(join(tmpdir(), 'check-unpublished-encoded-'));
  const onDisk = 'aseptis-sp%20no%201';
  mkdirSync(join(tmpDir, 'species', onDisk), { recursive: true });
  writeFileSync(join(tmpDir, 'species', onDisk, 'index.html'), '<html>leaked</html>');

  try {
    const leaks = findUnpublishedLeaks({
      unpublishedSlugs: new Set(['aseptis-sp-no-1']),
      emittedSlugs: [onDisk],
      keyMatrixSlugs: [],
      siteDir: tmpDir,
    });
    assert.deepStrictEqual(leaks.pageLeaks, [onDisk]);
    assert.deepStrictEqual(leaks.dataLeaks, []);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('findUnpublishedLeaks: a percent-encoded directory with only data is a DATA leak', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'check-unpublished-encoded-data-'));
  const onDisk = 'aseptis-sp%20no%201';
  mkdirSync(join(tmpDir, 'species', onDisk), { recursive: true });
  writeFileSync(join(tmpDir, 'species', onDisk, 'records.parquet'), 'PAR1');

  try {
    const leaks = findUnpublishedLeaks({
      unpublishedSlugs: new Set(['aseptis-sp-no-1']),
      emittedSlugs: [onDisk],
      keyMatrixSlugs: [],
      siteDir: tmpDir,
    });
    assert.deepStrictEqual(leaks.pageLeaks, []);
    assert.deepStrictEqual(leaks.dataLeaks, [onDisk]);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('findUnpublishedLeaks: a basename that is not a valid encoding is matched as-is, not thrown on', () => {
  // decodeURIComponent("100%") throws URIError. A gate that dies on an odd
  // filename fails the build for the wrong reason and hides the real answer.
  const leaks = findUnpublishedLeaks({
    unpublishedSlugs: new Set(['drasteria-sp']),
    emittedSlugs: ['weird-100%-name', 'drasteria-sp'],
    keyMatrixSlugs: [],
  });
  assert.deepStrictEqual(leaks.pageLeaks, ['drasteria-sp']);
});
