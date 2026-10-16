// scripts/migrate-mpg-spelling-photos.test.ts
// Unit tests for the #369 folder rename: the retarget rule (folder only, never the
// filename) and consistency between data/cdn-retired-images.csv and what the repo
// now says it tracks.
// Run via: node --test scripts/migrate-mpg-spelling-photos.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { RENAMES, SLUG_PREFIXES, retarget } from './migrate-mpg-spelling-photos.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function csv<T>(file: string): T[] {
  return parse(readFileSync(resolve(ROOT, file)), { columns: true, skip_empty_lines: true, bom: true }) as T[];
}

const retiredRows = csv<{ old_path: string; superseded_by: string; reason: string }>('data/cdn-retired-images.csv')
  .filter(r => r.reason.endsWith('per curator (#369)'));

test('retarget: rewrites the slug folder and leaves the filename alone', () => {
  assert.equal(
    retarget('heliothodes-diminutivus/Heliothodes diminutivus-A-D.jpg'),
    'heliothodes-diminutiva/Heliothodes diminutivus-A-D.jpg',
  );
  assert.equal(
    retarget('derived/species-tiles/paonias-excaecatus/A-D_thumbnail@530.webp'),
    'derived/species-tiles/paonias-excaecata/A-D_thumbnail@530.webp',
  );
  assert.equal(
    retarget('species-tiles/manduca-quinquemaculata/A-V_files/9/0_0.webp'),
    'species-tiles/manduca-quinquemaculatus/A-V_files/9/0_0.webp',
  );
});

test('retarget: a key outside the six renamed folders is untouched', () => {
  const other = 'malacosoma-disstria/Malacosoma disstria-A-D.jpg';
  assert.equal(retarget(other), other);
});

test('SLUG_PREFIXES: every prefix of an old slug retargets onto the same prefix of the new slug', () => {
  for (const { from, to } of RENAMES) {
    assert.deepEqual(SLUG_PREFIXES.map(p => retarget(p(from))), SLUG_PREFIXES.map(p => p(to)));
  }
});

test('every #369 retirement row is this migration\'s own retarget of its old path', () => {
  assert.ok(retiredRows.length > 0);
  for (const { old_path, superseded_by } of retiredRows) {
    assert.equal(retarget(old_path), superseded_by, `retirement disagrees for ${old_path}`);
  }
});

test('the repo tracks every copy target in images.csv or image-derivatives.csv', () => {
  const imageKeys = new Set(
    csv<{ species_slug: string; filename: string }>('data/images.csv').map(r => `${r.species_slug}/${r.filename}`),
  );
  const derivedKeys = new Set(
    csv<{ derived_path: string; source_path: string }>('data/image-derivatives.csv').flatMap(r => [r.derived_path, r.source_path]),
  );
  for (const { superseded_by } of retiredRows) {
    assert.ok(imageKeys.has(superseded_by) || derivedKeys.has(superseded_by), `${superseded_by} is not a tracked object`);
  }
});

test('nothing in the repo still files a photograph under a retired slug', () => {
  const images = csv<{ species_slug: string }>('data/images.csv');
  const derivatives = readFileSync(resolve(ROOT, 'data/image-derivatives.csv'), 'utf8');
  const species = new Set(csv<{ genus: string; species: string }>('data/species.csv').map(r => `${r.genus}-${r.species}`.toLowerCase()));
  for (const { from, to } of RENAMES) {
    assert.equal(images.filter(r => r.species_slug === from).length, 0, `images.csv still files under ${from}`);
    assert.ok(!derivatives.includes(`/${from}/`) && !derivatives.startsWith(`${from}/`), `a derivative row still points at ${from}/`);
    assert.ok(species.has(to), `${to} is not a species in data/species.csv`);
    assert.ok(!species.has(from), `${from} is still a species in data/species.csv`);
  }
});
