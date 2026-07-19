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
  // Sanity: the narrative gate actually removes some species (stubs without prose).
  assert.ok(expected < shown.length, 'Expected some shown species to lack a narrative');
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
