// scripts/migrate-merged-species-photos.test.ts
// Unit tests for the #265 merge CDN migration.
//
// The load-bearing properties: the specimen letter is rewritten only where it is
// the site's catalog key (the segment after the slug), the historical binomial in
// a filename is never touched, and the hard-coded copy table stays consistent
// with the repo's own record of the merge — data/images.csv,
// data/image-derivatives.csv and data/cdn-retired-images.csv.
//
// Run via: node --test scripts/migrate-merged-species-photos.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { FILE_COPIES, TILE_TREES, retargetMergedTileKey, storageUrl, redact } from './migrate-merged-species-photos.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// retargetMergedTileKey
// ---------------------------------------------------------------------------

test('retargetMergedTileKey: rewrites slug and specimen letter on a pyramid key', () => {
  assert.equal(
    retargetMergedTileKey('species-tiles/speranza-andersoni/A-D_files/9/1_2.webp'),
    'species-tiles/speranza-occiduaria/B-D_files/9/1_2.webp',
  );
});

test('retargetMergedTileKey: rewrites a .dzi descriptor and a thumbnail derivative', () => {
  assert.equal(
    retargetMergedTileKey('species-tiles/speranza-andersoni/A-D.dzi'),
    'species-tiles/speranza-occiduaria/B-D.dzi',
  );
  assert.equal(
    retargetMergedTileKey('derived/species-tiles/speranza-andersoni/A-V_thumbnail@1060.webp'),
    'derived/species-tiles/speranza-occiduaria/B-V_thumbnail@1060.webp',
  );
});

test('retargetMergedTileKey: letter rewrite is scoped to the segment after the slug', () => {
  // A deeper pyramid segment that happens to start with "A-" must survive: only
  // the catalog key (the view directory) is the site's to rename.
  assert.equal(
    retargetMergedTileKey('species-tiles/speranza-andersoni/B-D_files/A-9/1_2.webp'),
    'species-tiles/speranza-occiduaria/B-D_files/A-9/1_2.webp',
  );
});

test('retargetMergedTileKey: leaves keys outside the merged slug alone', () => {
  const key = 'species-tiles/speranza-occiduaria/A-D_files/9/1_2.webp';
  assert.equal(retargetMergedTileKey(key), key);
});

// ---------------------------------------------------------------------------
// FILE_COPIES table invariants
// ---------------------------------------------------------------------------

test('FILE_COPIES: every pair changes the key, keeps the historical binomial, no duplicate targets', () => {
  const targets = new Set<string>();
  for (const { from, to } of FILE_COPIES) {
    assert.notEqual(from, to, `no-op copy: ${from}`);
    targets.add(to);
    // The filename's binomial is a historical specimen label; only the folder
    // and the specimen letter may differ.
    const fromBinomial = from.split('/').pop()!.replace(/ ?-? ?[A-E]-[DV]/, '');
    const toBinomial = to.split('/').pop()!.replace(/ ?-? ?[A-E]-[DV]/, '');
    assert.equal(fromBinomial, toBinomial, `binomial rewritten: ${from} -> ${to}`);
  }
  assert.equal(targets.size, FILE_COPIES.length, 'duplicate copy targets');
});

test('FILE_COPIES: every target is tracked in images.csv or image-derivatives.csv', () => {
  const images = parse(readFileSync(resolve(ROOT, 'data/images.csv')), {
    columns: true, skip_empty_lines: true, bom: true,
  }) as Array<{ species_slug: string; filename: string }>;
  const imageKeys = new Set(images.map(r => `${r.species_slug}/${r.filename}`));

  const derivatives = parse(readFileSync(resolve(ROOT, 'data/image-derivatives.csv')), {
    columns: true, skip_empty_lines: true, bom: true,
  }) as Array<{ derived_path: string }>;
  const derivedKeys = new Set(derivatives.map(r => r.derived_path));

  for (const { to } of FILE_COPIES) {
    assert.ok(
      imageKeys.has(to) || derivedKeys.has(to),
      `${to} is not a tracked object — the repo would never serve what this copies`,
    );
  }
});

test('FILE_COPIES: mirrored one-to-one by the #265 rows of cdn-retired-images.csv', () => {
  const retired = parse(readFileSync(resolve(ROOT, 'data/cdn-retired-images.csv')), {
    columns: true, skip_empty_lines: true, bom: true,
  }) as Array<{ old_path: string; superseded_by: string; reason: string }>;
  const merged = new Map(
    retired.filter(r => r.reason.includes('#265')).map(r => [r.old_path, r.superseded_by]),
  );

  // Every explicit copy is recorded as a retirement…
  for (const { from, to } of FILE_COPIES) {
    assert.equal(merged.get(from), to, `retirement row missing or disagreeing for ${from}`);
  }
  // …and every #265 retirement is either an explicit copy or a tile-tree object.
  const explicit = new Set(FILE_COPIES.map(p => p.from));
  for (const [oldPath, supersededBy] of merged) {
    if (explicit.has(oldPath)) continue;
    assert.ok(
      TILE_TREES.some(tree => oldPath.startsWith(tree)),
      `#265 retirement ${oldPath} is neither an explicit copy nor under a walked tile tree`,
    );
    assert.equal(
      retargetMergedTileKey(oldPath),
      supersededBy,
      `tile retirement disagrees with retargetMergedTileKey for ${oldPath}`,
    );
  }
});

// ---------------------------------------------------------------------------
// storageUrl / redact (same contracts as the #266 script)
// ---------------------------------------------------------------------------

test('storageUrl: encodes each segment but not the separators', () => {
  assert.equal(
    storageUrl('speranza-occiduaria/Speranza andersoni-B-D.jpg'),
    'https://la.storage.bunnycdn.com/pnwmoths/speranza-occiduaria/Speranza%20andersoni-B-D.jpg',
  );
});

test('redact: passes messages through when no password is set', () => {
  assert.equal(redact('list species-tiles/x: 401 Unauthorized'), 'list species-tiles/x: 401 Unauthorized');
});
