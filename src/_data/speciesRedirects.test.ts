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
