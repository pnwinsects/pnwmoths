// src/_data/speciesRedirects.test.ts
// Verifies the retired-slug -> canonical-slug redirect CSV parser (issues #155/#156)
// and cross-checks the real data/species-redirects.csv against data/species.csv +
// src/_data/speciesSlugs.json so a stale or colliding redirect entry fails fast.
// Run via: node --test src/_data/speciesRedirects.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseRedirectsCsv } from './speciesRedirects.ts';

test('parseRedirectsCsv: parses old_slug,new_slug,reason rows', () => {
  const csv =
    'old_slug,new_slug,reason\n' +
    'eilema-bicolor,manulea-bicolor,eilema-bicolor->manulea-bicolor canonical genus migration (#155)\n';
  assert.deepEqual(parseRedirectsCsv(csv), [
    {
      oldSlug: 'eilema-bicolor',
      newSlug: 'manulea-bicolor',
      reason: 'eilema-bicolor->manulea-bicolor canonical genus migration (#155)',
    },
  ]);
});

test('parseRedirectsCsv: ignores blank trailing lines', () => {
  const csv = 'old_slug,new_slug,reason\neilema-bicolor,manulea-bicolor,x\n\n';
  assert.equal(parseRedirectsCsv(csv).length, 1);
});

test('parseRedirectsCsv: returns [] for a header-only CSV', () => {
  assert.deepEqual(parseRedirectsCsv('old_slug,new_slug,reason\n'), []);
});

test('parseRedirectsCsv: a reason containing a comma is preserved verbatim (no re-split)', () => {
  const csv = 'old_slug,new_slug,reason\nfoo-bar,baz-qux,migration, per curator note\n';
  const rows = parseRedirectsCsv(csv);
  assert.equal(rows[0]?.reason, 'migration, per curator note');
});

test('default export: resolves the real data/species-redirects.csv', async () => {
  const { default: getSpeciesRedirects } = await import('./speciesRedirects.ts');
  const rows = getSpeciesRedirects();
  assert.ok(rows.length > 0, 'expected at least one redirect row');
  const bySlug = new Map(rows.map(r => [r.oldSlug, r.newSlug]));
  assert.equal(bySlug.get('eilema-bicolor'), 'manulea-bicolor');
  assert.equal(bySlug.get('saturnia-mendocino'), 'calosaturnia-mendocino');
});

test('real data/species-redirects.csv: no duplicate old_slug rows (would collide on the emitted permalink)', () => {
  const rows = parseRedirectsCsv(readFileSync(resolve('data/species-redirects.csv'), 'utf8'));
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const r of rows) {
    if (seen.has(r.oldSlug)) dupes.push(r.oldSlug);
    seen.add(r.oldSlug);
  }
  assert.deepEqual(dupes, []);
});

test('real data/species-redirects.csv: no old_slug is also a live species.csv slug (retired vs. published collision)', () => {
  const rows = parseRedirectsCsv(readFileSync(resolve('data/species-redirects.csv'), 'utf8'));
  const speciesCsv = readFileSync(resolve('data/species.csv'), 'utf8').trimEnd().split('\n');
  const liveSlugs = new Set(
    speciesCsv.slice(1).map(line => {
      const cols = line.split(',');
      return `${cols[1]}-${cols[2]}`.toLowerCase();
    })
  );
  const collisions = rows.filter(r => liveSlugs.has(r.oldSlug)).map(r => r.oldSlug);
  assert.deepEqual(collisions, [], 'a retired old_slug must not also be a currently-published species.csv row');
});

test('real data/species-redirects.csv: every new_slug resolves to a live species.csv slug', () => {
  const rows = parseRedirectsCsv(readFileSync(resolve('data/species-redirects.csv'), 'utf8'));
  const speciesCsv = readFileSync(resolve('data/species.csv'), 'utf8').trimEnd().split('\n');
  const liveSlugs = new Set(
    speciesCsv.slice(1).map(line => {
      const cols = line.split(',');
      return `${cols[1]}-${cols[2]}`.toLowerCase();
    })
  );
  const dangling = rows.filter(r => !liveSlugs.has(r.newSlug)).map(r => r.newSlug);
  assert.deepEqual(dangling, [], 'every redirect target must be a currently-published species');
});

test('real data/species-redirects.csv: no new_slug is in the unpublished-species deny-list (would send the redirect to a page that never gets emitted, i.e. a 404)', async () => {
  const { loadUnpublishedSpecies } = await import('../_lib/unpublished-species.ts');
  const unpublished = loadUnpublishedSpecies();
  const rows = parseRedirectsCsv(readFileSync(resolve('data/species-redirects.csv'), 'utf8'));
  const gated = rows.filter(r => unpublished.has(r.newSlug)).map(r => `${r.oldSlug} -> ${r.newSlug}`);
  assert.deepEqual(
    gated,
    [],
    'a redirect canonical target must never be a gated/unpublished species — the target page would not be emitted, ' +
      'so the redirect (meta refresh, canonical link, JS fallback) would resolve to a 404',
  );
});

test('filterToEmittedTargets: suppresses gated targets, keeps live and unknown ones', async () => {
  const { filterToEmittedTargets } = await import('./speciesRedirects.ts');
  const rows = [
    { oldSlug: 'a-b', newSlug: 'c-d', reason: 'published target' },
    { oldSlug: 'e-f', newSlug: 'g-h', reason: 'withheld-family target' },
    { oldSlug: 'i-j', newSlug: 'k-l', reason: 'deny-listed target' },
    { oldSlug: 'm-n', newSlug: 'o-p', reason: 'target unknown to species.csv — integrity gate owns it' },
  ];
  const slugToFamily = new Map([
    ['c-d', 'Noctuidae'],
    ['g-h', 'Geometridae'],
    ['k-l', 'Noctuidae'],
  ]);
  const emitted = filterToEmittedTargets(rows, slugToFamily, new Set(['geometridae']), new Set(['k-l']));
  assert.deepEqual(emitted.map(r => r.oldSlug), ['a-b', 'm-n']);
});

test('real data: the #265 Geometridae merge redirects stay in the CSV but emit no stub while the family is withheld', async () => {
  // speranza-occiduaria and macaria-signaria are display-gated by the #48 embargo, so a
  // stub pointing at them is a built-in 404 (the blocking link check catches it). The
  // rows must survive in the CSV — the retirement is a fact, and the stubs appear
  // automatically when the embargo lifts.
  const raw = parseRedirectsCsv(readFileSync(resolve('data/species-redirects.csv'), 'utf8'));
  const rawOld = new Set(raw.map(r => r.oldSlug));
  for (const retired of ['speranza-andersoni', 'macaria-unipunctaria', 'macaria-submarmorata']) {
    assert.ok(rawOld.has(retired), `${retired} must stay recorded in species-redirects.csv`);
  }

  const { default: getSpeciesRedirects } = await import('./speciesRedirects.ts');
  const { loadWithheldFamilies, isWithheldOrUnclassified } = await import('../_lib/withheld-families.ts');
  const { loadUnpublishedSpecies, normalizeSlug } = await import('../_lib/unpublished-species.ts');
  const { parse } = await import('csv-parse/sync');
  const withheld = loadWithheldFamilies();
  const unpublished = loadUnpublishedSpecies();
  // csv-parse, not a naive line split: authority fields like "(Packard, 1874)" carry
  // commas, and the family column sits after them.
  const speciesRows = parse(readFileSync(resolve('data/species.csv')), {
    columns: true, skip_empty_lines: true, bom: true,
  }) as Array<{ genus?: string; species?: string; family?: string }>;
  const slugToFamily = new Map(
    speciesRows.map(r => [normalizeSlug(`${r.genus ?? ''}-${r.species ?? ''}`), r.family ?? ''] as const)
  );
  assert.equal(slugToFamily.get('speranza-occiduaria'), 'Geometridae', 'family lookup sanity check');

  const gatedButEmitted = getSpeciesRedirects().filter(r => {
    const family = slugToFamily.get(r.newSlug);
    if (family === undefined) return false;
    return isWithheldOrUnclassified(family, withheld) || unpublished.has(r.newSlug);
  });
  assert.deepEqual(
    gatedButEmitted.map(r => `${r.oldSlug} -> ${r.newSlug}`),
    [],
    'every emitted redirect stub must target a page the build actually produces',
  );
});
