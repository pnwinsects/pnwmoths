// scripts/migrate-renamed-species-photos.test.ts
// Unit tests for the #266 CDN folder migration.
//
// The load-bearing property is that ONLY the folder moves. Filenames are historical
// specimen labels — `protorthodes-rufula`'s photos are named `Protorthodes
// perforata-*` — so a naive string replace over the whole key is the bug this file
// exists to prevent.
//
// Run via: node --test scripts/migrate-renamed-species-photos.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { RENAMES, SLUG_PREFIXES, retargetKey, storageUrl, redact } from './migrate-renamed-species-photos.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// retargetKey
// ---------------------------------------------------------------------------

test('retargetKey: rewrites the folder segment', () => {
  assert.equal(
    retargetKey('protorthodes-rufula/Protorthodes perforata-A-D.jpg', 'protorthodes-rufula', 'trichopolia-rufula'),
    'trichopolia-rufula/Protorthodes perforata-A-D.jpg',
  );
});

test('retargetKey: leaves a filename that contains the slug text alone', () => {
  // A whole-string replace would rename the file too, inventing provenance for a
  // specimen photographed under its old determination.
  assert.equal(
    retargetKey('furcula-furcula/furcula-furcula-A-D.jpg', 'furcula-furcula', 'furcula-gigans'),
    'furcula-gigans/furcula-furcula-A-D.jpg',
  );
});

test('retargetKey: rewrites a nested prefix without touching the pyramid path', () => {
  assert.equal(
    retargetKey(
      'species-tiles/protorthodes-curtica/A-D_files/12/3_4.jpeg',
      'protorthodes-curtica',
      'trichopolia-curtica',
    ),
    'species-tiles/trichopolia-curtica/A-D_files/12/3_4.jpeg',
  );
});

test('retargetKey: matches only a whole path segment', () => {
  assert.equal(
    retargetKey('derived/protorthodes-rufulaX/a.jpg', 'protorthodes-rufula', 'trichopolia-rufula'),
    'derived/protorthodes-rufulaX/a.jpg',
  );
});

test('retargetKey: a key that does not contain the slug is returned unchanged', () => {
  assert.equal(retargetKey('abagrotis-apposita/x.jpg', 'furcula-furcula', 'furcula-gigans'), 'abagrotis-apposita/x.jpg');
});

test('retargetKey: rewrites only the first matching segment', () => {
  // Contrived, but the alternative (replace-all) would corrupt any path that
  // legitimately repeats the name deeper down.
  assert.equal(
    retargetKey('a/a/b.jpg', 'a', 'z'),
    'z/a/b.jpg',
  );
});

// ---------------------------------------------------------------------------
// storageUrl
// ---------------------------------------------------------------------------

test('storageUrl: encodes each segment but not the separators', () => {
  const url = storageUrl('trichopolia-rufula/Protorthodes perforata-A-D.jpg');
  assert.ok(url.endsWith('/trichopolia-rufula/Protorthodes%20perforata-A-D.jpg'), url);
  assert.equal((url.match(/\//g) ?? []).length, 5, 'separators survive encoding');
});

test('storageUrl: a trailing slash (directory listing) is preserved', () => {
  assert.ok(storageUrl('species-tiles/trichopolia-rufula/').endsWith('/species-tiles/trichopolia-rufula/'));
});

// ---------------------------------------------------------------------------
// redact
// ---------------------------------------------------------------------------

test('redact: without a password set, the message is unchanged', () => {
  // The suite runs without BUNNY_STORAGE_PASSWORD, which is the case that must not throw.
  assert.equal(redact('list failed: 401'), 'list failed: 401');
});

// ---------------------------------------------------------------------------
// The rename table, against the repo
// ---------------------------------------------------------------------------

test('RENAMES: every source slug is gone from data/species.csv and every target is present', () => {
  const rows = parse(readFileSync(resolve(ROOT, 'data/species.csv')), {
    columns: true,
    skip_empty_lines: true,
  }) as Array<{ genus: string; species: string }>;
  const slugs = new Set(rows.map(r => `${r.genus}-${r.species}`.toLowerCase()));

  for (const { from, to } of RENAMES) {
    assert.ok(!slugs.has(from), `${from} should no longer be in species.csv`);
    assert.ok(slugs.has(to), `${to} should be in species.csv`);
  }
});

test('RENAMES: each pair appears in data/cdn-retired-images.csv, so the retirement is on record', () => {
  const rows = parse(readFileSync(resolve(ROOT, 'data/cdn-retired-images.csv')), {
    columns: true,
    skip_empty_lines: true,
  }) as Array<{ old_path: string; superseded_by: string }>;

  for (const { from, to } of RENAMES) {
    const row = rows.find(r => (r.old_path ?? '').startsWith(`${from}/`));
    assert.ok(row, `no retirement row for ${from}`);
    assert.ok(
      (row.superseded_by ?? '').startsWith(`${to}/`),
      `${from} retires to ${row.superseded_by}, expected a ${to}/ path`,
    );
  }
});

test('RENAMES: no target slug is also a source, so the copy order cannot matter', () => {
  const sources = new Set(RENAMES.map(r => r.from));
  for (const { to } of RENAMES) {
    assert.ok(!sources.has(to), `${to} is both a rename target and a source — order would matter`);
  }
});

test('SLUG_PREFIXES: covers the four image locations, each ending in a slash', () => {
  const built = SLUG_PREFIXES.map(f => f('demo-slug'));
  assert.deepEqual(built, [
    'demo-slug/',
    'derived/demo-slug/',
    'species-tiles/demo-slug/',
    'derived/species-tiles/demo-slug/',
  ]);
});
