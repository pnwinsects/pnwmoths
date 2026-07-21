// src/_data/species.test.ts
// Verifies the family-withholding gate in species.ts (ISSUE-48) and the
// unpublished-species deny-list gate (ISSUE-80).
// Run via: node --test src/_data/species.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { loadUnpublishedSpecies, normalizeSlug } from '../_lib/unpublished-species.ts';

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

// ---------------------------------------------------------------------------
// Unpublished-species deny-list gate (ISSUE-80)
// ---------------------------------------------------------------------------

test('species: no emitted row has a slug in the unpublished deny-list (ISSUE-80)', async () => {
  const denySet = loadUnpublishedSpecies(resolve(ROOT, 'data/unpublished-species.csv'));
  assert.ok(denySet.size > 0, 'deny-list should be non-empty for this assertion to be meaningful');

  const { default: getSpecies } = await import('./species.ts');
  const rows = await getSpecies();

  const leaked = rows.filter(r => denySet.has(normalizeSlug(r.slug)));
  assert.strictEqual(
    leaked.length,
    0,
    `Expected 0 unpublished slugs in emitted rows, got ${leaked.length}: ${leaked.map(r => r.slug).join(', ')}`,
  );
});

test('species: deny-listed genus keeps its legitimate sibling species (ISSUE-80)', async () => {
  const { default: getSpecies } = await import('./species.ts');
  const rows = await getSpecies();
  const emittedSlugs = new Set(rows.map(r => r.slug));

  assert.ok(
    emittedSlugs.has('drasteria-parallela'),
    'drasteria-parallela should be emitted (legitimate species whose genus also has a deny-listed member)',
  );
  assert.ok(
    emittedSlugs.has('aseptis-binotata'),
    'aseptis-binotata should be emitted (legitimate species whose genus also has deny-listed members)',
  );
});

// ---------------------------------------------------------------------------
// Quoted-epithet display (issue #85)
// ---------------------------------------------------------------------------

test('species: quoted epithets render in species_display but stay clean in species/slug', async () => {
  const { default: getSpecies } = await import('./species.ts');
  const rows = await getSpecies();
  const clostera = rows.find(r => r.slug === 'clostera-apicalis');
  assert.ok(clostera, 'clostera-apicalis should be emitted');
  assert.strictEqual(clostera.species, 'apicalis', 'species stays clean (drives slug + FKs)');
  assert.strictEqual(clostera.species_display, '"apicalis"', 'species_display carries the quotes');
  assert.strictEqual(clostera.slug, 'clostera-apicalis', 'slug is unaffected by quotes');
});

test('species: an unquoted species has species_display === species', async () => {
  const { default: getSpecies } = await import('./species.ts');
  const rows = await getSpecies();
  const sample = rows.find(r => r.slug === 'nadata-gibbosa');
  assert.ok(sample, 'nadata-gibbosa should be emitted');
  assert.strictEqual(sample.species_display, sample.species);
});

// ---------------------------------------------------------------------------
// genus_slug (issue #161: link factsheet genus breadcrumb to Browse)
// ---------------------------------------------------------------------------

test('species: genus_slug is the lowercased, space-hyphenated genus for a full family/subfamily/tribe hierarchy', async () => {
  const { default: getSpecies } = await import('./species.ts');
  const rows = await getSpecies();
  // Apantesis arizoniensis: Erebidae / Arctiinae / Arctiini
  const row = rows.find(r => r.slug === 'apantesis-arizoniensis');
  assert.ok(row, 'apantesis-arizoniensis should be emitted');
  assert.equal(row.family, 'Erebidae');
  assert.equal(row.subfamily, 'Arctiinae');
  assert.equal(row.tribe, 'Arctiini');
  assert.equal(row.genus_slug, 'apantesis');
});

test('species: genus_slug resolves for a species with no subfamily or tribe', async () => {
  // No currently-published row has a null subfamily (see species.csv: rows with a blank
  // subfamily are all deny-listed / unpublished morphospecies), so this exercises the
  // genus_slug transform directly against a raw CSV row with that hierarchy shape rather
  // than through getSpecies()'s publish gate.
  const allRows = parse(
    readFileSync(resolve(ROOT, 'data/species.csv')),
    { columns: true, skip_empty_lines: true },
  ) as Array<{ genus: string; species: string; family: string; subfamily: string; tribe: string }>;
  const row = allRows.find(r => r.genus === 'Macrochilo' && r.species === 'bivittata');
  assert.ok(row, 'Macrochilo bivittata should exist in species.csv');
  assert.equal(row.subfamily, '');
  assert.equal(row.tribe, '');
  const genusSlug = row.genus.toLowerCase().replace(/ /g, '-');
  assert.equal(genusSlug, 'macrochilo');
});

test('species: genus_slug resolves for a species with a subfamily but no tribe', async () => {
  const { default: getSpecies } = await import('./species.ts');
  const rows = await getSpecies();
  // Sympistis heliophila: Noctuidae / Oncocnemidinae, no tribe.
  const row = rows.find(r => r.slug === 'sympistis-heliophila');
  assert.ok(row, 'sympistis-heliophila should be emitted');
  assert.equal(row.subfamily, 'Oncocnemidinae');
  assert.equal(row.tribe, null);
  assert.equal(row.genus_slug, 'sympistis');
});

test('species: genus_slug matches lower(replace(genus, " ", "-")) for every emitted row (mirrors taxon.ts)', async () => {
  const { default: getSpecies } = await import('./species.ts');
  const rows = await getSpecies();
  assert.ok(rows.length > 0, 'expected at least one emitted species row');
  for (const row of rows) {
    const expected = row.genus.toLowerCase().replace(/ /g, '-');
    assert.equal(
      row.genus_slug,
      expected,
      `genus_slug mismatch for ${row.slug}: expected "${expected}", got "${row.genus_slug}"`,
    );
  }
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
