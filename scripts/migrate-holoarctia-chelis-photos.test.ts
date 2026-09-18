// scripts/migrate-holoarctia-chelis-photos.test.ts
// Unit tests for the #278 Holoarctia -> Chelis folder rename: the retarget rule
// (folder only, never the filename) and consistency between the retirement rows
// in data/cdn-retired-images.csv and what the repo now says it tracks.
// Run via: node --test scripts/migrate-holoarctia-chelis-photos.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { NEW_SLUG, OLD_SLUG, SOURCE_PREFIXES, retarget } from './migrate-holoarctia-chelis-photos.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REASON = 'Holoarctia->Chelis genus rename per curator (#278)';

function retiredRows(): Array<{ old_path: string; superseded_by: string }> {
  const rows = parse(readFileSync(resolve(ROOT, 'data/cdn-retired-images.csv')), {
    columns: true, skip_empty_lines: true, bom: true,
  }) as Array<{ old_path: string; superseded_by: string; reason: string }>;
  return rows.filter(r => r.reason === REASON);
}

test('retarget: rewrites the slug folder and leaves the filename alone', () => {
  assert.equal(
    retarget('holoarctia-sp/Holoarctia sp-A-D.jpg'),
    'chelis-sp/Holoarctia sp-A-D.jpg',
  );
  assert.equal(
    retarget('derived/holoarctia-sp/Holoarctia sp-A-V@320h.webp'),
    'derived/chelis-sp/Holoarctia sp-A-V@320h.webp',
  );
});

test('retarget: a key outside the renamed folder is untouched', () => {
  const other = 'chelis-sordida/Holoarctia sordida-A-D.jpg';
  assert.equal(retarget(other), other);
});

test('SOURCE_PREFIXES: both prefixes retarget onto the new slug', () => {
  assert.deepEqual(
    SOURCE_PREFIXES.map(retarget),
    [`${NEW_SLUG}/`, `derived/${NEW_SLUG}/`],
  );
  assert.ok(SOURCE_PREFIXES.every(p => p.includes(OLD_SLUG)));
});

test('every #278 retirement row is this migration\'s own retarget of its old path', () => {
  const rows = retiredRows();
  assert.equal(rows.length, 6); // 2 originals + 4 derivative variants
  for (const { old_path, superseded_by } of rows) {
    assert.equal(retarget(old_path), superseded_by, `retirement disagrees for ${old_path}`);
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
  for (const { superseded_by } of retiredRows()) {
    assert.ok(imageKeys.has(superseded_by) || derivedKeys.has(superseded_by), `${superseded_by} is not a tracked object`);
  }
});

test('nothing in the repo still files a photograph under the retired slug', () => {
  const images = parse(readFileSync(resolve(ROOT, 'data/images.csv')), {
    columns: true, skip_empty_lines: true, bom: true,
  }) as Array<{ species_slug: string }>;
  assert.equal(images.filter(r => r.species_slug === OLD_SLUG).length, 0);
  const derivatives = readFileSync(resolve(ROOT, 'data/image-derivatives.csv'), 'utf8');
  assert.ok(!derivatives.includes(`${OLD_SLUG}/`), 'a derivative row still points at holoarctia-sp/');
});
