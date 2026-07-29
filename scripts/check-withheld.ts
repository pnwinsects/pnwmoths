// scripts/check-withheld.ts
// Post-build gate: hard-fails (exit 1) if any withheld-family species has an
// emitted page in _site/species/ OR appears in data/key-matrix.json.
// Run via: npm run build:check-withheld (after build:eleventy)
//
// Steps:
//   1. loadWithheldFamilies() — if empty, print skip message and exit 0.
//   2. Parse data/species.csv; compute withheld-family slugs.
//   3. PAGE GATE: assert no _site/species/<slug>/index.html exists.
//   4. KEY-MATRIX GATE: assert no key-matrix.json species[].slug is withheld.
//   5. Non-empty leak collections → actionable message + exit 1.
//      Otherwise print pass summary + exit 0.
import { readFileSync, existsSync } from 'node:fs';
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
  /** Root of the built site (normally PROJECT_ROOT/_site). */
  siteDir: string;
  /** Slugs that appear in key-matrix.json species[].slug. */
  keyMatrixSlugs: Set<string>;
}

export interface LeakReport {
  /** Withheld slugs with an emitted _site/species/<slug>/index.html. */
  pageLeaks: string[];
  /** Withheld slugs found in key-matrix.json species[].slug. */
  keyMatrixLeaks: string[];
}

/**
 * Detect withheld slugs that leaked into the site or key matrix.
 *
 * Pure function — takes all data as parameters so it can be tested
 * without a full build. The CLI entry-point (main()) wires the real
 * file-system and JSON artifact.
 */
export function findLeaks(opts: FindLeaksOptions): LeakReport {
  const { withheldSlugs, siteDir, keyMatrixSlugs } = opts;

  const pageLeaks: string[] = [];
  const keyMatrixLeaks: string[] = [];

  for (const slug of withheldSlugs) {
    const pagePath = resolve(siteDir, 'species', slug, 'index.html');
    if (existsSync(pagePath)) {
      pageLeaks.push(slug);
    }
    if (keyMatrixSlugs.has(slug)) {
      keyMatrixLeaks.push(slug);
    }
  }

  return { pageLeaks, keyMatrixLeaks };
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
  const { pageLeaks, keyMatrixLeaks } = findLeaks({ withheldSlugs, siteDir, keyMatrixSlugs });

  // 5. Report
  const hasLeaks = pageLeaks.length > 0 || keyMatrixLeaks.length > 0;

  if (hasLeaks) {
    if (pageLeaks.length > 0) {
      console.error(
        `[check-withheld] PAGE GATE FAILED: ${pageLeaks.length} withheld species emitted pages:\n` +
        pageLeaks.map(s => `  _site/species/${s}/index.html`).join('\n'),
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
    `[check-withheld] PASS: checked ${withheldSlugCount} withheld slugs — 0 page leaks, 0 key-matrix leaks`,
  );
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
