// scripts/check-unpublished.ts
// Post-build gate: hard-fails (exit 1) if any deny-listed provisional/undescribed
// species has an emitted page in _site/species/ OR appears in data/key-matrix.json.
// Run via: npm run build:check-unpublished (after build:eleventy and build:key)
//
// Steps:
//   1. loadUnpublishedSpecies() — if empty, print skip message and exit 0.
//   2. Well-formedness: assert each deny-list slug matches exactly one species.csv row.
//   3. PAGE GATE: readdir _site/species; decode percent-encoding; normalize; check for leaks.
//   4. KEY-MATRIX GATE: read data/key-matrix.json species[].slug; check for leaks.
//   5. Non-empty leak collections → actionable message + exit 1.
//      Otherwise print pass summary + exit 0.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'csv-parse/sync';
import { loadUnpublishedSpecies, normalizeSlug } from '../src/_lib/unpublished-species.ts';

// ---------------------------------------------------------------------------
// Exported pure helper — unit-testable without a full build
// ---------------------------------------------------------------------------

export interface FindUnpublishedLeaksOptions {
  /** Normalized deny-list slugs (hyphenated, lowercased). */
  unpublishedSlugs: Set<string>;
  /** Raw directory basenames from _site/species/ (may be space-encoded or percent-encoded). */
  emittedSlugs: string[];
  /** Raw slugs from data/key-matrix.json species[].slug. */
  keyMatrixSlugs: string[];
}

export interface UnpublishedLeakReport {
  /** Deny-listed slugs with an emitted _site/species/<dir>/. */
  pageLeaks: string[];
  /** Deny-listed slugs found in key-matrix.json species[].slug. */
  keyMatrixLeaks: string[];
}

/**
 * Detect deny-listed slugs that leaked into the emitted site or key matrix.
 *
 * Pure function — takes all data as parameters so it can be tested without
 * a full build. The CLI entry-point (main()) wires the real file-system and JSON artifact.
 *
 * A leak is any emitted or key-matrix slug whose normalizeSlug form is a member
 * of unpublishedSlugs.
 */
export function findUnpublishedLeaks(opts: FindUnpublishedLeaksOptions): UnpublishedLeakReport {
  const { unpublishedSlugs, emittedSlugs, keyMatrixSlugs } = opts;

  const pageLeaks: string[] = [];
  const keyMatrixLeaks: string[] = [];

  for (const raw of emittedSlugs) {
    if (unpublishedSlugs.has(normalizeSlug(raw))) {
      pageLeaks.push(raw);
    }
  }

  for (const slug of keyMatrixSlugs) {
    if (unpublishedSlugs.has(normalizeSlug(slug))) {
      keyMatrixLeaks.push(slug);
    }
  }

  return { pageLeaks, keyMatrixLeaks };
}

// ---------------------------------------------------------------------------
// CLI entry-point
// ---------------------------------------------------------------------------

function main(): void {
  // 1. Load deny-list
  const unpublished = loadUnpublishedSpecies();
  if (unpublished.size === 0) {
    console.log('[check-unpublished] deny-list is empty — skipping gate (pass)');
    process.exit(0);
  }

  // 2. Well-formedness: each deny-list slug must match exactly one species.csv row.
  const allSpeciesRows = parse(
    readFileSync(resolve('data/species.csv')),
    { columns: true, skip_empty_lines: true },
  ) as Array<{ genus: string; species: string }>;

  const speciesNormSlugs = allSpeciesRows.map(
    r => normalizeSlug(`${r.genus}-${r.species}`),
  );

  const wellFormedErrors: string[] = [];
  for (const denySlug of unpublished) {
    const matches = speciesNormSlugs.filter(s => s === denySlug).length;
    if (matches === 0) {
      wellFormedErrors.push(`  "${denySlug}" — 0 matches in species.csv (typo or stale slug?)`);
    } else if (matches > 1) {
      wellFormedErrors.push(`  "${denySlug}" — ${matches} matches in species.csv (ambiguous slug)`);
    }
  }
  if (wellFormedErrors.length > 0) {
    console.error(
      `[check-unpublished] WELL-FORMEDNESS FAILED: deny-list slug(s) do not match exactly one species.csv row:\n` +
      wellFormedErrors.join('\n'),
    );
    process.exit(1);
  }

  // 3. PAGE GATE: read _site/species directory basenames
  const siteSpeciesDir = resolve('_site', 'species');
  let emittedSlugs: string[] = [];
  if (existsSync(siteSpeciesDir)) {
    emittedSlugs = readdirSync(siteSpeciesDir).map(basename =>
      // Decode percent-encoding so both "aseptis-sp%20no%201" and literal-space
      // forms normalize identically via normalizeSlug.
      decodeURIComponent(basename)
    );
  } else {
    console.warn('[check-unpublished] _site/species not found — skipping page gate');
  }

  // 4. KEY-MATRIX GATE: read data/key-matrix.json species[].slug
  const keyMatrixPath = resolve('data/key-matrix.json');
  let keyMatrixSlugs: string[] = [];
  if (existsSync(keyMatrixPath)) {
    const raw = JSON.parse(readFileSync(keyMatrixPath, 'utf8')) as {
      species: Array<{ slug: string }>;
    };
    keyMatrixSlugs = raw.species.map(s => s.slug);
  } else {
    console.warn('[check-unpublished] data/key-matrix.json not found — skipping key-matrix gate');
  }

  // 5. Run the pure leak detector
  const { pageLeaks, keyMatrixLeaks } = findUnpublishedLeaks({ unpublishedSlugs: unpublished, emittedSlugs, keyMatrixSlugs });

  const hasLeaks = pageLeaks.length > 0 || keyMatrixLeaks.length > 0;

  if (hasLeaks) {
    if (pageLeaks.length > 0) {
      console.error(
        `[check-unpublished] PAGE GATE FAILED: ${pageLeaks.length} unpublished species emitted pages:\n` +
        pageLeaks.map(s => `  _site/species/${s}/`).join('\n'),
      );
    }
    if (keyMatrixLeaks.length > 0) {
      console.error(
        `[check-unpublished] KEY-MATRIX GATE FAILED: ${keyMatrixLeaks.length} unpublished species in key-matrix.json:\n` +
        keyMatrixLeaks.map(s => `  ${s}`).join('\n'),
      );
    }
    process.exit(1);
  }

  console.log(
    `[check-unpublished] PASS: checked ${unpublished.size} deny-list slugs — 0 page leaks, 0 key-matrix leaks`,
  );
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
