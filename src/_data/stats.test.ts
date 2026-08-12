// src/_data/stats.test.ts
// Verifies the home-page vanity metrics in stats.ts: counts are real, the species
// count reflects written narratives, and the family-withholding gate (ISSUE-48)
// is respected.
// Run via: node --test src/_data/stats.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { readAllRecordRows } from '../../scripts/lib/records-source.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

/** Slugs (genus-species, lowercased) that have a narrative markdown file. */
function narrativeSlugs(): Set<string> {
  return new Set(
    readdirSync(resolve(ROOT, 'src/content/species'))
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.slice(0, -'.md'.length)),
  );
}

/** Shown (non-withheld, non-unpublished) species slugs from species.csv. */
function shownSpecies(): Array<{ slug: string; family: string }> {
  const rows = parse(readFileSync(resolve(ROOT, 'data/species.csv')), {
    columns: true,
    skip_empty_lines: true,
  }) as Array<{ genus: string; species: string; family: string }>;
  const unpublished = new Set(
    (parse(readFileSync(resolve(ROOT, 'data/unpublished-species.csv')), {
      columns: true,
      skip_empty_lines: true,
    }) as Array<{ slug: string }>).map((r) => (r.slug ?? '').trim().toLowerCase().replace(/\s+/g, '-')),
  );
  return rows
    .filter((r) => (r.family ?? '').trim().toLowerCase() !== 'geometridae')
    .map((r) => ({ slug: `${r.genus}-${r.species}`.toLowerCase().replace(/\s+/g, '-'), family: r.family }))
    .filter((sp) => !unpublished.has(sp.slug));
}

test('stats: all three counts are positive integers', async () => {
  const { default: getStats } = await import('./stats.ts');
  const s = await getStats();
  for (const [key, n] of Object.entries(s)) {
    assert.ok(Number.isInteger(n) && n > 0, `Expected ${key} to be a positive integer, got ${n}`);
  }
});

test('stats: species count equals the number of shown species with a narrative', async () => {
  const { default: getStats } = await import('./stats.ts');
  const s = await getStats();

  const narratives = narrativeSlugs();
  const shown = shownSpecies();
  const expected = shown.filter((sp) => narratives.has(sp.slug)).length;

  assert.strictEqual(
    s.species,
    expected,
    `Species count must equal shown species that have a narrative (${expected})`,
  );
});

test('stats: withheld families (Geometridae) are excluded from the species count', async () => {
  const allRows = parse(readFileSync(resolve(ROOT, 'data/species.csv')), {
    columns: true,
    skip_empty_lines: true,
  }) as Array<{ genus: string; species: string; family: string }>;

  // The withholding gate must drop every Geometridae species from the shown set, so
  // none can contribute to the narrative-based species count. This holds structurally
  // even though no Geometridae currently has a narrative (Euthyatira lorata — formerly
  // the only one — was reclassified to Drepanidae in #73).
  const geometridae = allRows.filter(
    (r) => (r.family ?? '').trim().toLowerCase() === 'geometridae',
  );
  assert.ok(geometridae.length > 0, 'Expected Geometridae rows in species.csv');
  const shownSlugs = new Set(shownSpecies().map((sp) => sp.slug));
  const leaked = geometridae.filter((r) =>
    shownSlugs.has(`${r.genus}-${r.species}`.toLowerCase()),
  );
  assert.strictEqual(leaked.length, 0, 'No Geometridae species may appear in the shown set');

  const { default: getStats } = await import('./stats.ts');
  const s = await getStats();

  // Counting Geometridae narratives would inflate the species count; the gate must drop them.
  const narratives = narrativeSlugs();
  const expected = shownSpecies().filter((sp) => narratives.has(sp.slug)).length;
  assert.strictEqual(s.species, expected);
});

// #156: euxoa-aurantiaca was added to data/unpublished-species.csv (not featured on the
// legacy site, no completed legacy species account) while its occurrence records stay in
// data/records.csv. The records vanity count must exclude it, but the underlying data must
// not be touched.
test('stats: unpublished euxoa-aurantiaca is excluded from the records count while its records remain in the data', async () => {
  // Counted against EVERY occurrence source, the same union stats.ts reads
  // (#23) — reading data/records.csv alone would under-count by the size of
  // the iNaturalist import and fail for a reason unrelated to this invariant.
  const recordRows = readAllRecordRows(
    resolve(ROOT, 'data/records.csv'),
    resolve(ROOT, 'data/records-inat.csv'),
  );

  const euxoaRecords = recordRows.filter((r) => r.species_slug === 'euxoa-aurantiaca');
  assert.ok(euxoaRecords.length > 0, 'Expected euxoa-aurantiaca occurrence records to remain in data/records.csv');

  const shownSlugs = new Set(shownSpecies().map((sp) => sp.slug));
  assert.ok(!shownSlugs.has('euxoa-aurantiaca'), 'euxoa-aurantiaca must not be in the shown set');

  const { default: getStats } = await import('./stats.ts');
  const s = await getStats();

  const expectedRecords = recordRows.filter((r) => shownSlugs.has(r.species_slug)).length;
  assert.strictEqual(
    s.records,
    expectedRecords,
    'Records count must exclude euxoa-aurantiaca while every other shown species record is still counted',
  );
  assert.ok(
    expectedRecords < recordRows.length,
    'Excluding euxoa-aurantiaca records should make the shown-records count strictly less than the raw row count',
  );
});
