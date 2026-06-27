// scripts/check-withheld.test.ts
// Unit tests for the check-withheld.ts pure leak-detection helper.
// Run via: node --test scripts/check-withheld.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { findLeaks } from './check-withheld.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// findLeaks — clean cases
// ---------------------------------------------------------------------------

test('findLeaks: clean case — no withheld slugs → no leaks', () => {
  const leaks = findLeaks({
    withheldSlugs: new Set<string>(),
    siteDir: resolve(ROOT, '_site'),
    keyMatrixSlugs: new Set<string>(),
  });
  assert.deepStrictEqual(leaks.pageLeaks, [], 'no page leaks for empty withheld set');
  assert.deepStrictEqual(leaks.keyMatrixLeaks, [], 'no key-matrix leaks for empty withheld set');
});

test('findLeaks: withheld slugs with no emitted pages or key entries → no leaks', () => {
  // Use a temp empty siteDir so no pages exist — independent of build state
  const tmpDir = resolve(ROOT, '.tmp-check-withheld-empty-site');
  mkdirSync(tmpDir, { recursive: true });
  try {
    const leaks = findLeaks({
      withheldSlugs: new Set(['euthyatira-lorata', 'rheumaptera-hastata']),
      siteDir: tmpDir,
      keyMatrixSlugs: new Set<string>(),
    });
    assert.deepStrictEqual(leaks.pageLeaks, []);
    assert.deepStrictEqual(leaks.keyMatrixLeaks, []);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// findLeaks — page leak detection
// ---------------------------------------------------------------------------

test('findLeaks: planted emitted-page slug is reported as a page leak', () => {
  const tmpDir = resolve(ROOT, '.tmp-check-withheld-page-test');
  const slug = 'euthyatira-lorata';
  const pageDir = resolve(tmpDir, 'species', slug);
  mkdirSync(pageDir, { recursive: true });
  writeFileSync(resolve(pageDir, 'index.html'), '<html>leaked</html>');

  try {
    const leaks = findLeaks({
      withheldSlugs: new Set([slug]),
      siteDir: tmpDir,
      keyMatrixSlugs: new Set<string>(),
    });
    assert.ok(leaks.pageLeaks.includes(slug), `Expected ${slug} in pageLeaks, got: ${JSON.stringify(leaks.pageLeaks)}`);
    assert.deepStrictEqual(leaks.keyMatrixLeaks, []);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// findLeaks — key-matrix leak detection
// ---------------------------------------------------------------------------

test('findLeaks: planted key-matrix slug is reported as a key-matrix leak', () => {
  // Use a temp empty siteDir so no page leak is possible — independent of build state
  const tmpDir = resolve(ROOT, '.tmp-check-withheld-key-test');
  mkdirSync(tmpDir, { recursive: true });
  const slug = 'rheumaptera-hastata';
  try {
    const leaks = findLeaks({
      withheldSlugs: new Set([slug]),
      siteDir: tmpDir,
      keyMatrixSlugs: new Set([slug, 'acronicta-americana']),
    });
    assert.ok(
      leaks.keyMatrixLeaks.includes(slug),
      `Expected ${slug} in keyMatrixLeaks, got: ${JSON.stringify(leaks.keyMatrixLeaks)}`,
    );
    assert.deepStrictEqual(leaks.pageLeaks, []);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// findLeaks — both gates
// ---------------------------------------------------------------------------

test('findLeaks: page leak and key-matrix leak both reported', () => {
  const tmpDir = resolve(ROOT, '.tmp-check-withheld-both-test');
  const slug = 'euthyatira-lorata';
  const pageDir = resolve(tmpDir, 'species', slug);
  mkdirSync(pageDir, { recursive: true });
  writeFileSync(resolve(pageDir, 'index.html'), '<html>leaked</html>');

  try {
    const leaks = findLeaks({
      withheldSlugs: new Set([slug]),
      siteDir: tmpDir,
      keyMatrixSlugs: new Set([slug]),
    });
    assert.ok(leaks.pageLeaks.includes(slug), 'expected page leak');
    assert.ok(leaks.keyMatrixLeaks.includes(slug), 'expected key-matrix leak');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
