// scripts/check-withheld.test.ts
// Unit tests for the check-withheld.ts pure leak-detection helper.
// Run via: node --test scripts/check-withheld.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { findLeaks, readChecklistSlugs } from './check-withheld.ts';

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

// ---------------------------------------------------------------------------
// findLeaks — data leak detection (#275)
// ---------------------------------------------------------------------------

test('findLeaks: a withheld slug with only records.parquet is a DATA leak, not a page leak', () => {
  // The #275 shape exactly: the display gate worked (no index.html), and the
  // occurrence records were published anyway by a later build step.
  const tmpDir = resolve(ROOT, '.tmp-check-withheld-data-test');
  const slug = 'hydriomena-perfracta';
  const speciesDir = resolve(tmpDir, 'species', slug);
  mkdirSync(speciesDir, { recursive: true });
  writeFileSync(resolve(speciesDir, 'records.parquet'), 'PAR1');

  try {
    const leaks = findLeaks({
      withheldSlugs: new Set([slug]),
      siteDir: tmpDir,
      keyMatrixSlugs: new Set<string>(),
    });
    assert.deepStrictEqual(leaks.pageLeaks, [], 'no page was emitted');
    assert.equal(leaks.dataLeaks.length, 1);
    assert.match(leaks.dataLeaks[0] ?? '', /^hydriomena-perfracta \(records\.parquet\)$/);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('findLeaks: any unexpected file under a withheld slug is caught, not just Parquet', () => {
  // The invariant is "nothing under the directory", so a future build step that
  // writes something new is caught without anyone remembering to update the gate.
  const tmpDir = resolve(ROOT, '.tmp-check-withheld-future-test');
  const slug = 'rheumaptera-hastata';
  const speciesDir = resolve(tmpDir, 'species', slug);
  mkdirSync(speciesDir, { recursive: true });
  writeFileSync(resolve(speciesDir, 'occurrences.json'), '[]');

  try {
    const leaks = findLeaks({
      withheldSlugs: new Set([slug]),
      siteDir: tmpDir,
      keyMatrixSlugs: new Set<string>(),
    });
    assert.equal(leaks.dataLeaks.length, 1);
    assert.match(leaks.dataLeaks[0] ?? '', /occurrences\.json/);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('findLeaks: a withheld slug whose directory holds only index.html is a page leak alone', () => {
  const tmpDir = resolve(ROOT, '.tmp-check-withheld-page-only-test');
  const slug = 'euthyatira-lorata';
  const speciesDir = resolve(tmpDir, 'species', slug);
  mkdirSync(speciesDir, { recursive: true });
  writeFileSync(resolve(speciesDir, 'index.html'), '<html>leaked</html>');

  try {
    const leaks = findLeaks({
      withheldSlugs: new Set([slug]),
      siteDir: tmpDir,
      keyMatrixSlugs: new Set<string>(),
    });
    assert.deepStrictEqual(leaks.pageLeaks, [slug]);
    assert.deepStrictEqual(leaks.dataLeaks, [], 'index.html is the page, not extra data');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// findLeaks — Checklist gate (#218)
// ---------------------------------------------------------------------------

test('findLeaks: a withheld species named on the Checklist page is a checklist leak', () => {
  // The checklist lists NAMES, not pages, so this leak leaves _site/species/
  // untouched and every other gate here sees nothing — the #275 shape.
  const leaks = findLeaks({
    withheldSlugs: new Set(['hydriomena-perfracta']),
    siteDir: resolve(ROOT, '.tmp-nonexistent-site'),
    keyMatrixSlugs: new Set<string>(),
    checklistSlugs: ['abagrotis-apposita', 'hydriomena-perfracta'],
  });
  assert.deepStrictEqual(leaks.checklistLeaks, ['hydriomena-perfracta']);
  assert.deepStrictEqual(leaks.pageLeaks, [], 'no page was emitted — that is the point');
});

test('findLeaks: a clean Checklist page produces no leak', () => {
  const leaks = findLeaks({
    withheldSlugs: new Set(['hydriomena-perfracta']),
    siteDir: resolve(ROOT, '.tmp-nonexistent-site'),
    keyMatrixSlugs: new Set<string>(),
    checklistSlugs: ['abagrotis-apposita', 'hemileuca-nuttalli'],
  });
  assert.deepStrictEqual(leaks.checklistLeaks, []);
});

test('findLeaks: omitting checklistSlugs (page not built) is not a leak', () => {
  const leaks = findLeaks({
    withheldSlugs: new Set(['hydriomena-perfracta']),
    siteDir: resolve(ROOT, '.tmp-nonexistent-site'),
    keyMatrixSlugs: new Set<string>(),
  });
  assert.deepStrictEqual(leaks.checklistLeaks, []);
});

test('readChecklistSlugs: parses the data-slug attributes the page emits', () => {
  const tmpDir = resolve(ROOT, '.tmp-check-withheld-checklist');
  mkdirSync(resolve(tmpDir, 'checklist'), { recursive: true });
  writeFileSync(
    resolve(tmpDir, 'checklist', 'index.html'),
    '<ul class="checklist-species"><li data-slug="abagrotis-apposita"><a>x</a></li>' +
      '<li data-slug="hemileuca-nuttalli"><a>y</a></li></ul>',
  );
  try {
    assert.deepStrictEqual(readChecklistSlugs(tmpDir), ['abagrotis-apposita', 'hemileuca-nuttalli']);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('readChecklistSlugs: an unbuilt page yields an empty list, not a throw', () => {
  assert.deepStrictEqual(readChecklistSlugs(resolve(ROOT, '.tmp-nonexistent-site')), []);
});
