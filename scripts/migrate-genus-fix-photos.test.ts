// scripts/migrate-genus-fix-photos.test.ts
// Unit tests for the #303 genus-fix migration: the bitactata letter map, the
// decorata exclusion, and consistency between the copy table and the repo's
// own record of the move (cdn-retired-images.csv, images.csv, derivatives).
// Run via: node --test scripts/migrate-genus-fix-photos.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { FILE_COPIES, TILE_TREES, retargetBitactataKey } from './migrate-genus-fix-photos.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('retargetBitactataKey: maps the ruled letters on the view directory', () => {
  assert.equal(
    retargetBitactataKey('species-tiles/macaria-bitactata/A-D_files/9/1_2.webp'),
    'species-tiles/speranza-bitactata/D-D_files/9/1_2.webp',
  );
  assert.equal(
    retargetBitactataKey('species-tiles/macaria-bitactata/B-V.dzi'),
    'species-tiles/speranza-bitactata/E-V.dzi',
  );
  // C keeps its letter — only the slug changes.
  assert.equal(
    retargetBitactataKey('derived/species-tiles/macaria-bitactata/C-D_thumbnail@530.webp'),
    'derived/species-tiles/speranza-bitactata/C-D_thumbnail@530.webp',
  );
});

test('retargetBitactataKey: letter rewrite is scoped to the segment after the slug', () => {
  assert.equal(
    retargetBitactataKey('species-tiles/macaria-bitactata/A-D_files/B-9/1_2.webp'),
    'species-tiles/speranza-bitactata/D-D_files/B-9/1_2.webp',
  );
  const other = 'species-tiles/macaria-colata/A-D_files/9/1_2.webp';
  assert.equal(retargetBitactataKey(other), other);
});

test('FILE_COPIES: no decorata anywhere — that half of the ruling is on hold', () => {
  for (const { from, to } of FILE_COPIES) {
    assert.ok(!from.includes('decorata') && !to.includes('decorata'), `${from} -> ${to}`);
  }
  assert.ok(TILE_TREES.every(t => !t.includes('decorata')));
});

test('FILE_COPIES: 30 legacy objects, unique targets, historical binomials preserved', () => {
  assert.equal(FILE_COPIES.length, 30); // colata 12 + lorquinaria 6 + plumosata 12
  const targets = new Set(FILE_COPIES.map(p => p.to));
  assert.equal(targets.size, FILE_COPIES.length);
  for (const { from, to } of FILE_COPIES) {
    const strip = (k: string) => k.split('/').pop()!.replace(/-[A-E]-([DV])/, '-$1');
    assert.equal(strip(from), strip(to), `binomial rewritten: ${from} -> ${to}`);
  }
});

test('every #303 retirement row is either an explicit copy or a bitactata tile object', () => {
  const retired = parse(readFileSync(resolve(ROOT, 'data/cdn-retired-images.csv')), {
    columns: true, skip_empty_lines: true, bom: true,
  }) as Array<{ old_path: string; superseded_by: string; reason: string }>;
  const rows = retired.filter(r => r.reason.includes('#303'));
  assert.equal(rows.length, 60);
  const explicit = new Map(FILE_COPIES.map(p => [p.from, p.to]));
  for (const { old_path, superseded_by } of rows) {
    if (explicit.has(old_path)) {
      assert.equal(explicit.get(old_path), superseded_by, `retirement disagrees for ${old_path}`);
    } else {
      assert.ok(
        TILE_TREES.some(t => old_path.startsWith(t)),
        `${old_path} is neither an explicit copy nor under a walked tile tree`,
      );
      assert.equal(retargetBitactataKey(old_path), superseded_by, `tile retirement disagrees for ${old_path}`);
    }
  }
});

test('the repo tracks every copy target in images.csv or image-derivatives.csv', () => {
  const images = parse(readFileSync(resolve(ROOT, 'data/images.csv')), {
    columns: true, skip_empty_lines: true, bom: true,
  }) as Array<{ species_slug: string; filename: string }>;
  const imageKeys = new Set(images.map(r => `${r.species_slug}/${r.filename}`));
  const derivatives = parse(readFileSync(resolve(ROOT, 'data/image-derivatives.csv')), {
    columns: true, skip_empty_lines: true, bom: true,
  }) as Array<{ derived_path: string; source_path: string }>;
  const derivedKeys = new Set(derivatives.flatMap(r => [r.derived_path, r.source_path]));
  for (const { to } of FILE_COPIES) {
    assert.ok(imageKeys.has(to) || derivedKeys.has(to), `${to} is not a tracked object`);
  }
});
