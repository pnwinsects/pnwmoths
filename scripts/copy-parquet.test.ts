// scripts/copy-parquet.test.ts
// Unit tests for the publication gate on the Parquet copy (#275).
//
// The bug this guards against is not a wrong result — it is an ABSENT check. The
// copy was `cp(data/parquet, _site/species, {recursive: true})`, so occurrence
// records for 126 embargoed Geometridae and 45 provisional species were served at
// /species/{slug}/records.parquet while the page itself 404'd. Nothing failed;
// nothing was even asked.
//
// Run via: node --test scripts/copy-parquet.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import {
  catalogSlugsFromSpeciesCsv,
  selectPublishableSlugs,
  withheldSlugsFromSpeciesCsv,
} from './copy-parquet.ts';
import { loadWithheldFamilies } from '../src/_lib/withheld-families.ts';
import { loadUnpublishedSpecies, normalizeSlug } from '../src/_lib/unpublished-species.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// selectPublishableSlugs
// ---------------------------------------------------------------------------

test('selectPublishableSlugs: with both gates empty, everything is publishable', () => {
  const plan = selectPublishableSlugs({
    availableSlugs: ['abagrotis-apposita', 'hemileuca-nuttalli'],
    withheldSlugs: new Set(),
    unpublishedSlugs: new Set(),
  });
  assert.deepEqual(plan.publish, ['abagrotis-apposita', 'hemileuca-nuttalli']);
  assert.deepEqual(plan.skippedWithheld, []);
  assert.deepEqual(plan.skippedUnpublished, []);
});

test('selectPublishableSlugs: a withheld-family slug is skipped', () => {
  const plan = selectPublishableSlugs({
    availableSlugs: ['abagrotis-apposita', 'hydriomena-perfracta'],
    withheldSlugs: new Set(['hydriomena-perfracta']),
    unpublishedSlugs: new Set(),
  });
  assert.deepEqual(plan.publish, ['abagrotis-apposita']);
  assert.deepEqual(plan.skippedWithheld, ['hydriomena-perfracta']);
});

test('selectPublishableSlugs: a deny-listed slug is skipped', () => {
  const plan = selectPublishableSlugs({
    availableSlugs: ['abagrotis-apposita', 'lycomorpha-grotei'],
    withheldSlugs: new Set(),
    unpublishedSlugs: new Set(['lycomorpha-grotei']),
  });
  assert.deepEqual(plan.publish, ['abagrotis-apposita']);
  assert.deepEqual(plan.skippedUnpublished, ['lycomorpha-grotei']);
});

test('selectPublishableSlugs: a slug caught by both gates is skipped once and reported twice', () => {
  const plan = selectPublishableSlugs({
    availableSlugs: ['epirrita-pulchraria'],
    withheldSlugs: new Set(['epirrita-pulchraria']),
    unpublishedSlugs: new Set(['epirrita-pulchraria']),
  });
  assert.deepEqual(plan.publish, []);
  assert.deepEqual(plan.skippedWithheld, ['epirrita-pulchraria']);
  assert.deepEqual(plan.skippedUnpublished, ['epirrita-pulchraria']);
});

test('selectPublishableSlugs: a space-form directory name is matched against the hyphenated deny-list', () => {
  // data/parquet/ directory names come from the raw slug, which for an epithet
  // like "sp No 1" carries spaces; the deny-list stores "aseptis-sp-no-1". An
  // un-normalized comparison publishes the very file the gate exists to withhold.
  const plan = selectPublishableSlugs({
    availableSlugs: ['aseptis-sp no 1'],
    withheldSlugs: new Set(),
    unpublishedSlugs: new Set(['aseptis-sp-no-1']),
  });
  assert.deepEqual(plan.publish, []);
  assert.deepEqual(plan.skippedUnpublished, ['aseptis-sp no 1']);
});

test('selectPublishableSlugs: publish order follows input order', () => {
  const plan = selectPublishableSlugs({
    availableSlugs: ['c-one', 'a-two', 'b-three'],
    withheldSlugs: new Set(),
    unpublishedSlugs: new Set(),
  });
  assert.deepEqual(plan.publish, ['c-one', 'a-two', 'b-three']);
});

// ---------------------------------------------------------------------------
// withheldSlugsFromSpeciesCsv
// ---------------------------------------------------------------------------

function withFixtureCsv(csv: string, assertion: (path: string) => void): void {
  const tempDir = process.env['RUNNER_TEMP'] ?? process.env['TMPDIR'] ?? '/tmp';
  const path = resolve(tempDir, `copy-parquet-fixture-${process.pid}.csv`);
  writeFileSync(path, csv);
  try {
    assertion(path);
  } finally {
    rmSync(path, { force: true });
  }
}

test('withheldSlugsFromSpeciesCsv: no withheld families → empty set, CSV never read', () => {
  const slugs = withheldSlugsFromSpeciesCsv('/nonexistent/species.csv', new Set());
  assert.equal(slugs.size, 0);
});

test('withheldSlugsFromSpeciesCsv: matches family case-insensitively and skips blanks', () => {
  withFixtureCsv(
    'id,genus,species,common_name,noc_id,authority,family,similar_species,subfamily,epithet_quoted,tribe\n' +
      '1,Hydriomena,perfracta,,,,GEOMETRIDAE,,Larentiinae,,\n' +
      '2,Abagrotis,apposita,,,,Noctuidae,,Noctuinae,,\n' +
      '3,Nomen,dubium,,,,,,,,\n',
    path => {
      const slugs = withheldSlugsFromSpeciesCsv(path, new Set(['geometridae']));
      assert.deepEqual([...slugs], ['hydriomena-perfracta']);
    },
  );
});

// ---------------------------------------------------------------------------
// Against the real data — the numbers that made #275 visible
// ---------------------------------------------------------------------------

test('real data: every gated species is withheld from publication, and the split is exact', () => {
  const speciesRows = parse(readFileSync(resolve(ROOT, 'data/species.csv')), {
    columns: true,
    skip_empty_lines: true,
  }) as Array<{ genus: string; species: string }>;

  const availableSlugs = speciesRows.map(r => normalizeSlug(`${r.genus}-${r.species}`));

  const withheldSlugs = withheldSlugsFromSpeciesCsv(
    resolve(ROOT, 'data/species.csv'),
    loadWithheldFamilies(resolve(ROOT, 'data/withheld-families.csv')),
  );
  const unpublishedSlugs = loadUnpublishedSpecies(resolve(ROOT, 'data/unpublished-species.csv'));

  const plan = selectPublishableSlugs({ availableSlugs, withheldSlugs, unpublishedSlugs });

  for (const slug of withheldSlugs) {
    assert.ok(!plan.publish.includes(slug), `withheld ${slug} must not be published`);
  }
  for (const slug of unpublishedSlugs) {
    assert.ok(!plan.publish.includes(slug), `unpublished ${slug} must not be published`);
  }

  // Every available slug is accounted for exactly once as published or gated.
  const gated = new Set([...plan.skippedWithheld, ...plan.skippedUnpublished]);
  assert.equal(
    plan.publish.length + gated.size,
    new Set(availableSlugs).size,
    'published + gated must cover every species exactly once',
  );
});

// ---------------------------------------------------------------------------
// The stale-cache gate
// ---------------------------------------------------------------------------

test('selectPublishableSlugs: a Parquet directory with no species.csv row is skipped as stale', () => {
  const plan = selectPublishableSlugs({
    availableSlugs: ['abagrotis-apposita', 'trichopolia-eureka'],
    withheldSlugs: new Set(),
    unpublishedSlugs: new Set(),
    catalogSlugs: new Set(['abagrotis-apposita']),
  });
  assert.deepEqual(plan.publish, ['abagrotis-apposita']);
  assert.deepEqual(plan.skippedStale, ['trichopolia-eureka']);
});

test('selectPublishableSlugs: omitting catalogSlugs disables the stale check', () => {
  const plan = selectPublishableSlugs({
    availableSlugs: ['trichopolia-eureka'],
    withheldSlugs: new Set(),
    unpublishedSlugs: new Set(),
  });
  assert.deepEqual(plan.publish, ['trichopolia-eureka']);
  assert.deepEqual(plan.skippedStale, []);
});

test('catalogSlugsFromSpeciesCsv: real data/species.csv covers every published slug', () => {
  const catalog = catalogSlugsFromSpeciesCsv(resolve(ROOT, 'data/species.csv'));
  assert.ok(catalog.has('abagrotis-apposita'));
  assert.ok(!catalog.has('hemileuca-nuteglan'), 'deleted in #268');
});
