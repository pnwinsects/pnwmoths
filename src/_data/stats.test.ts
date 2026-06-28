// src/_data/stats.test.ts
// Verifies the home-page vanity metrics in stats.ts: counts are real, tied to the
// species pages, and respect the family-withholding gate (ISSUE-48).
// Run via: node --test src/_data/stats.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

test('stats: all three counts are positive integers', async () => {
  const { default: getStats } = await import('./stats.ts');
  const s = await getStats();
  for (const [key, n] of Object.entries(s)) {
    assert.ok(Number.isInteger(n) && n > 0, `Expected ${key} to be a positive integer, got ${n}`);
  }
});

test('stats: species count equals the number of species pages', async () => {
  const { default: getStats } = await import('./stats.ts');
  const { default: getSpecies } = await import('./species.ts');
  const [s, species] = await Promise.all([getStats(), getSpecies()]);
  assert.strictEqual(
    s.species,
    species.length,
    'Vanity species count must match the species collection that gets pages',
  );
});

test('stats: withheld families (Geometridae) are excluded from the species count', async () => {
  const allRows = parse(readFileSync(resolve(ROOT, 'data/species.csv')), {
    columns: true,
    skip_empty_lines: true,
  }) as Array<{ family: string }>;
  const total = allRows.length;
  const withheld = allRows.filter((r) => r.family === 'Geometridae').length;
  assert.ok(withheld > 0, 'Expected some Geometridae rows in species.csv to make this test meaningful');

  const { default: getStats } = await import('./stats.ts');
  const s = await getStats();
  assert.strictEqual(
    s.species,
    total - withheld,
    `Expected species count ${total} - ${withheld} withheld = ${total - withheld}, got ${s.species}`,
  );
});
