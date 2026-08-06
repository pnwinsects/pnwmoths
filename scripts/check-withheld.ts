// scripts/check-withheld.ts
// Post-build gate: hard-fails (exit 1) if any withheld-family species has an
// emitted page in _site/species/, ANY OTHER FILE under _site/species/<slug>/
// (occurrence Parquet — #275), OR appears in data/key-matrix.json.
// Run via: npm run build:check-withheld — AFTER build:copy-parquet, which is the
// step that used to write the data leak this gate now catches.
//
// Steps:
//   1. loadWithheldFamilies() — if empty, print skip message and exit 0.
//   2. Parse data/species.csv; compute withheld-family slugs.
//   3. PAGE GATE: assert no _site/species/<slug>/index.html exists.
//   4. DATA GATE: assert no OTHER file exists under _site/species/<slug>/.
//   5. KEY-MATRIX GATE: assert no key-matrix.json species[].slug is withheld.
//   6. Non-empty leak collections → actionable message + exit 1.
//      Otherwise print pass summary + exit 0.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'csv-parse/sync';
import { loadWithheldFamilies } from '../src/_lib/withheld-families.ts';
import { pathToFileURL } from 'node:url';

// ---------------------------------------------------------------------------
// Exported pure helper — unit-testable without a full build
// ---------------------------------------------------------------------------

export interface FindLeaksOptions {
  /** Slugs that must not appear in any emitted page or key matrix entry. */
  withheldSlugs: Set<string>;
  /**
   * Species slugs named by the emitted Checklist page (#218), if it was built.
   *
   * The checklist lists NAMES, not pages, so a gated species reaching it leaves
   * _site/species/ untouched and the page gate above sees nothing. That is the
   * #275 shape — a step that publishes what the gates excluded, through a route
   * the gates do not look at.
   */
  checklistSlugs?: string[];
  /** Root of the built site (normally PROJECT_ROOT/_site). */
  siteDir: string;
  /** Slugs that appear in key-matrix.json species[].slug. */
  keyMatrixSlugs: Set<string>;
}

export interface LeakReport {
  /** Withheld slugs with an emitted _site/species/<slug>/index.html. */
  pageLeaks: string[];
  /**
   * Withheld slugs with any OTHER file under _site/species/<slug>/ — occurrence
   * Parquet, most of the time.
   *
   * A page is not the only way to publish a species. `copy-parquet.ts` used to
   * copy data/parquet/ wholesale, serving embargoed occurrence records at
   * /species/{slug}/records.parquet while the page itself 404'd (#275). The
   * invariant this enforces is the strong one: a withheld slug has NOTHING
   * under its site directory, whatever future build steps decide to write there.
   */
  dataLeaks: string[];
  /** Withheld slugs found in key-matrix.json species[].slug. */
  keyMatrixLeaks: string[];
  /** Withheld slugs named by the emitted Checklist page. */
  checklistLeaks: string[];
}

/**
 * Detect withheld slugs that leaked into the site or key matrix.
 *
 * Pure function — takes all data as parameters so it can be tested
 * without a full build. The CLI entry-point (main()) wires the real
 * file-system and JSON artifact.
 */
export function findLeaks(opts: FindLeaksOptions): LeakReport {
  const { withheldSlugs, siteDir, keyMatrixSlugs, checklistSlugs } = opts;

  const pageLeaks: string[] = [];
  const dataLeaks: string[] = [];
  const keyMatrixLeaks: string[] = [];
  const checklistLeaks = (checklistSlugs ?? []).filter(slug => withheldSlugs.has(slug));

  for (const slug of withheldSlugs) {
    const speciesDir = resolve(siteDir, 'species', slug);
    if (existsSync(resolve(speciesDir, 'index.html'))) {
      pageLeaks.push(slug);
    }
    if (existsSync(speciesDir)) {
      const others = readdirSync(speciesDir).filter(name => name !== 'index.html');
      if (others.length > 0) {
        dataLeaks.push(`${slug} (${others.join(', ')})`);
      }
    }
    if (keyMatrixSlugs.has(slug)) {
      keyMatrixLeaks.push(slug);
    }
  }

  return { pageLeaks, dataLeaks, keyMatrixLeaks, checklistLeaks };
}

/**
 * Species slugs named by the emitted Checklist page, or [] if it was not built.
 *
 * The page tags each row `<li data-slug="…">` precisely so this is a parse of one
 * attribute rather than of HTML. Absent page → empty list → gate passes, matching
 * how the other gates treat a missing artifact.
 */
export function readChecklistSlugs(siteDir: string): string[] {
  const path = resolve(siteDir, 'checklist', 'index.html');
  if (!existsSync(path)) return [];
  const html = readFileSync(path, 'utf8');
  return [...html.matchAll(/<li data-slug="([^"]+)"/g)].map(m => m[1] ?? '');
}

// ---------------------------------------------------------------------------
// CLI entry-point
// ---------------------------------------------------------------------------

function main(): void {
  // 1. Load withheld families
  const withheld = loadWithheldFamilies();
  if (withheld.size === 0) {
    console.log('[check-withheld] no withheld families — skipping gate (pass)');
    process.exit(0);
  }

  // 2. Compute withheld-family slugs using the SAME slug rule as species.ts:
  //    lower(genus || '-' || species)  →  `${genus.toLowerCase()}-${species.toLowerCase()}`
  const allSpeciesRows = parse(
    readFileSync(resolve('data/species.csv')),
    { columns: true, skip_empty_lines: true },
  ) as Array<{ genus: string; species: string; family: string }>;

  let withheldSlugCount = 0;
  const withheldSlugs = new Set<string>();
  for (const row of allSpeciesRows) {
    const family = (row.family ?? '').trim().toLowerCase();
    if (withheld.has(family)) {
      withheldSlugs.add(`${row.genus.toLowerCase()}-${row.species.toLowerCase()}`);
      withheldSlugCount++;
    }
  }

  // 3. Load key-matrix slugs
  const keyMatrixPath = resolve('data/key-matrix.json');
  let keyMatrixSlugs = new Set<string>();
  if (existsSync(keyMatrixPath)) {
    const raw = JSON.parse(readFileSync(keyMatrixPath, 'utf8')) as {
      species: Array<{ slug: string }>;
    };
    keyMatrixSlugs = new Set(raw.species.map(s => s.slug));
  } else {
    console.warn('[check-withheld] data/key-matrix.json not found — skipping key-matrix gate');
  }

  // 4. Run the pure leak detector
  const siteDir = resolve('_site');
  // Report the count this gate actually parsed. A renamed template or a changed
  // attribute would leave readChecklistSlugs returning [] and the gate printing
  // "0 checklist leaks" while checking nothing at all — a pass that means the
  // opposite of what it says.
  const checklistSlugs = readChecklistSlugs(siteDir);
  if (existsSync(resolve(siteDir, 'checklist', 'index.html')) && checklistSlugs.length === 0) {
    console.error(
      '[check-withheld] CHECKLIST GATE UNUSABLE: _site/checklist/index.html exists but no ' +
      'species rows were parsed from it. The page markup changed and this gate is now blind.',
    );
    process.exit(1);
  }

  const { pageLeaks, dataLeaks, keyMatrixLeaks, checklistLeaks } = findLeaks({
    withheldSlugs, siteDir, keyMatrixSlugs, checklistSlugs,
  });

  // 5. Report
  const hasLeaks = pageLeaks.length > 0 || dataLeaks.length > 0 || keyMatrixLeaks.length > 0 ||
    checklistLeaks.length > 0;

  if (hasLeaks) {
    if (pageLeaks.length > 0) {
      console.error(
        `[check-withheld] PAGE GATE FAILED: ${pageLeaks.length} withheld species emitted pages:\n` +
        pageLeaks.map(s => `  _site/species/${s}/index.html`).join('\n'),
      );
    }
    if (dataLeaks.length > 0) {
      console.error(
        `[check-withheld] DATA GATE FAILED: ${dataLeaks.length} withheld species have files under ` +
        `_site/species/ (occurrence data is published even when the page is not — #275):\n` +
        dataLeaks.map(s => `  _site/species/${s}`).join('\n'),
      );
    }
    if (checklistLeaks.length > 0) {
      console.error(
        `[check-withheld] CHECKLIST GATE FAILED: ${checklistLeaks.length} withheld species named on ` +
        `the Checklist page:\n` + checklistLeaks.map(s => `  ${s}`).join('\n'),
      );
    }
    if (keyMatrixLeaks.length > 0) {
      console.error(
        `[check-withheld] KEY-MATRIX GATE FAILED: ${keyMatrixLeaks.length} withheld species in key-matrix.json:\n` +
        keyMatrixLeaks.map(s => `  ${s}`).join('\n'),
      );
    }
    process.exit(1);
  }

  console.log(
    `[check-withheld] PASS: checked ${withheldSlugCount} withheld slugs against ` +
    `${checklistSlugs.length} checklist rows — 0 page leaks, 0 data leaks, ` +
    `0 key-matrix leaks, 0 checklist leaks`,
  );
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
