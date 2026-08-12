// scripts/migrate-cleopatra-photos.test.ts
// Unit tests for the #298 folder rename. The client mechanics live in
// scripts/lib/bunny-storage.ts and are tested there; this file pins the
// rename's own contract: the slug pair, the four prefixes, and consistency
// with the repo's record of the move in data/cdn-retired-images.csv.
// Run via: node --test scripts/migrate-cleopatra-photos.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { retargetSlugSegment } from './lib/bunny-storage.ts';
import { FROM_SLUG, TO_SLUG, SLUG_PREFIXES } from './migrate-cleopatra-photos.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('the rename pair and the four #266 prefixes', () => {
  assert.equal(FROM_SLUG, 'catocala-allusa');
  assert.equal(TO_SLUG, 'catocala-cleopatra');
  assert.deepEqual(SLUG_PREFIXES.map(p => p('x')), ['x/', 'derived/x/', 'species-tiles/x/', 'derived/species-tiles/x/']);
});

test('every #298 retirement row is a pure folder retarget under a walked prefix', () => {
  const retired = parse(readFileSync(resolve(ROOT, 'data/cdn-retired-images.csv')), {
    columns: true, skip_empty_lines: true, bom: true,
  }) as Array<{ old_path: string; superseded_by: string; reason: string }>;
  const rows = retired.filter(r => r.reason.includes('#298'));
  assert.ok(rows.length >= 16, `expected the 16 repo-tracked objects, got ${rows.length}`);
  for (const { old_path, superseded_by } of rows) {
    assert.ok(
      SLUG_PREFIXES.some(p => old_path.startsWith(p(FROM_SLUG))),
      `${old_path} is not under a walked prefix`,
    );
    assert.equal(
      retargetSlugSegment(old_path, FROM_SLUG, TO_SLUG),
      superseded_by,
      `retirement disagrees with the folder retarget for ${old_path}`,
    );
  }
});

test('the repo tracks the new folder: images.csv and image-derivatives.csv rows exist for every retirement target', () => {
  const retired = parse(readFileSync(resolve(ROOT, 'data/cdn-retired-images.csv')), {
    columns: true, skip_empty_lines: true, bom: true,
  }) as Array<{ superseded_by: string; reason: string }>;
  const images = parse(readFileSync(resolve(ROOT, 'data/images.csv')), {
    columns: true, skip_empty_lines: true, bom: true,
  }) as Array<{ species_slug: string; filename: string }>;
  const imageKeys = new Set(images.map(r => `${r.species_slug}/${r.filename}`));
  const derivatives = parse(readFileSync(resolve(ROOT, 'data/image-derivatives.csv')), {
    columns: true, skip_empty_lines: true, bom: true,
  }) as Array<{ derived_path: string; source_path: string }>;
  const derivedKeys = new Set(derivatives.flatMap(r => [r.derived_path, r.source_path]));

  for (const { superseded_by } of retired.filter(r => r.reason.includes('#298'))) {
    assert.ok(
      imageKeys.has(superseded_by) || derivedKeys.has(superseded_by),
      `${superseded_by} is not a tracked object — the repo would never serve what this copies`,
    );
  }
});
