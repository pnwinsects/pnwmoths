// src/_data/species.test.ts
// Verifies the family-withholding gate in species.ts (ISSUE-48).
// Run via: node --test src/_data/species.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

test('species: no emitted row has family === "Geometridae"', async () => {
  const { default: getSpecies } = await import('./species.ts');
  const rows = await getSpecies();
  const leaked = rows.filter(r => r.family === 'Geometridae');
  assert.strictEqual(
    leaked.length,
    0,
    `Expected 0 Geometridae rows, got ${leaked.length}: ${leaked.map(r => r.slug).join(', ')}`,
  );
});

test('species: non-withheld family Noctuidae is still present in full', async () => {
  const { default: getSpecies } = await import('./species.ts');
  const rows = await getSpecies();
  const noctuidae = rows.filter(r => r.family === 'Noctuidae');
  assert.ok(noctuidae.length > 0, 'Expected at least one Noctuidae row in the emitted collection');
});

test('species: no emitted slug belongs to a Geometridae genus (spot-check via species.csv)', async () => {
  // Load species.csv to find all Geometridae slugs (source of truth — data is NOT deleted)
  const allRows = parse(
    readFileSync(resolve(ROOT, 'data/species.csv')),
    { columns: true, skip_empty_lines: true },
  ) as Array<{ genus: string; species: string; family: string }>;

  const withheldSlugs = new Set(
    allRows
      .filter(r => r.family === 'Geometridae')
      .map(r => `${r.genus.toLowerCase()}-${r.species.toLowerCase()}`),
  );

  assert.ok(withheldSlugs.size > 0, 'Expected at least some Geometridae slugs in species.csv');

  const { default: getSpecies } = await import('./species.ts');
  const rows = await getSpecies();
  const emittedSlugs = new Set(rows.map(r => r.slug));

  const leaked = [...withheldSlugs].filter(s => emittedSlugs.has(s));
  assert.strictEqual(
    leaked.length,
    0,
    `Expected 0 withheld slugs in emitted collection, got ${leaked.length}: ${leaked.slice(0, 5).join(', ')}`,
  );
});
