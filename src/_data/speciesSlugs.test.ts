// src/_data/speciesSlugs.test.ts
// Guards src/_data/speciesSlugs.json against drift from data/species.csv.
//
// speciesSlugs.json is hand-maintained, but it is not free-form: it is the species slug
// lookup consumed by the legacy-URL resolver in two places at once —
//   * src/redirect.njk  — the live /redirect.html page that sends visitors from an old
//     pnwmoths.biol.wwu.edu /browse/… URL to /species/{slug}/, and
//   * scripts/fetch-analytics.ts — the nightly CDN-log replay that lists everything the
//     resolver missed under "Unmapped Legacy Links" on /analytics/.
// A slug that exists in data/species.csv but is absent here therefore fails twice: real
// visitors get dumped on Browse, and the miss is reported as a mapping nobody has written
// even though the species page is published and live. That is exactly how
// /browse/…/clostera-brucei/ regressed — commit 5a31a09 added Callopistria floridensis and
// Clostera brucei to data/species.csv without updating this file (#181).
//
// Run via: node --test src/_data/speciesSlugs.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'csv-parse/sync';
import { normalizeSlug } from '../_lib/unpublished-species.ts';

/**
 * Derive the expected contents of speciesSlugs.json from data/species.csv.
 *
 * csv-parse (not a naive line split) because species.csv carries newlines inside quoted
 * authority fields; normalizeSlug because species epithets such as "sp No 1" produce a raw
 * slug with spaces that the site stores hyphenated ("aseptis-sp-no-1").
 */
function deriveSpeciesSlugs(csvPath = resolve('data/species.csv')): string[] {
  const rows = parse(readFileSync(csvPath), { columns: true, skip_empty_lines: true }) as Array<{
    genus?: string;
    species?: string;
  }>;
  const slugs = rows
    .map(r => normalizeSlug(`${r.genus ?? ''}-${r.species ?? ''}`))
    .filter(s => s.length > 1);
  return [...new Set(slugs)].sort();
}

function loadJson(): string[] {
  return JSON.parse(readFileSync(resolve('src/_data/speciesSlugs.json'), 'utf8')) as string[];
}

test('speciesSlugs.json covers every species in data/species.csv (no legacy /browse/ link left unmapped)', () => {
  const inJson = new Set(loadJson());
  const missing = deriveSpeciesSlugs().filter(s => !inJson.has(s));
  assert.deepEqual(
    missing,
    [],
    'these species.csv slugs are missing from src/_data/speciesSlugs.json — add them (sorted) or ' +
      'legacy /browse/…/{slug}/ URLs will strand visitors on Browse and show up under ' +
      '"Unmapped Legacy Links" on /analytics/',
  );
});

test('speciesSlugs.json contains no slug that is absent from data/species.csv (would redirect to a page that is never emitted)', () => {
  const derived = new Set(deriveSpeciesSlugs());
  const stale = loadJson().filter(s => !derived.has(s));
  assert.deepEqual(
    stale,
    [],
    'these entries in src/_data/speciesSlugs.json no longer exist in data/species.csv — remove them, ' +
      'or add a data/species-redirects.csv row if the species was renamed',
  );
});

test('speciesSlugs.json is sorted and duplicate-free (keeps hand edits reviewable)', () => {
  const slugs = loadJson();
  assert.deepEqual(slugs, [...new Set(slugs)].sort(), 'expected a sorted, de-duplicated array');
});

test('speciesSlugs.json entries are all normalized (lowercase, hyphenated, no whitespace)', () => {
  const unnormalized = loadJson().filter(s => s !== normalizeSlug(s));
  assert.deepEqual(unnormalized, []);
});

test('deriveSpeciesSlugs: hyphenates whitespace in provisional epithets and de-duplicates', () => {
  const csv =
    'id,genus,species,common_name,noc_id,authority,family,similar_species,subfamily,epithet_quoted,tribe\n' +
    '1,Aseptis,sp No 1,,,"(Smith,\n1892)",Noctuidae,,Noctuinae,,\n' +
    '2,Clostera,brucei,,,"(Hy. Edwards, 1885)",Notodontidae,,Pygaerinae,,\n' +
    '3,Clostera,brucei,,,"(Hy. Edwards, 1885)",Notodontidae,,Pygaerinae,,\n';
  const path = resolve(
    process.env.RUNNER_TEMP ?? process.env.TMPDIR ?? process.env.TEMP ?? '/tmp',
    `species-slugs-fixture-${process.pid}.csv`,
  );
  writeFileSync(path, csv);
  try {
    assert.deepEqual(deriveSpeciesSlugs(path), ['aseptis-sp-no-1', 'clostera-brucei']);
  } finally {
    rmSync(path, { force: true });
  }
});
