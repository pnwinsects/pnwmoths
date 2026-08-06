// scripts/check-unpublished.ts
// Post-build gate: hard-fails (exit 1) if any deny-listed provisional/undescribed
// species has an emitted page in _site/species/, has any OTHER file under
// _site/species/<slug>/ (occurrence Parquet — #275), OR appears in
// data/key-matrix.json.
// Run via: npm run build:check-unpublished — AFTER build:copy-parquet, which is
// the step that used to write the data leak this gate now catches.
//
// Steps:
//   1. loadUnpublishedSpecies() — if empty, print skip message and exit 0.
//   2. Well-formedness: assert each deny-list slug matches exactly one species.csv row.
//   3. PAGE/DATA GATE: readdir _site/species; decode + normalize each basename to
//      match the deny-list; a deny-listed directory is a page leak if it holds an
//      index.html, a data leak otherwise.
//   4. KEY-MATRIX GATE: read data/key-matrix.json species[].slug; check for leaks.
//   5. Non-empty leak collections → actionable message + exit 1.
//      Otherwise print pass summary + exit 0.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'csv-parse/sync';
import { loadUnpublishedSpecies, normalizeSlug } from '../src/_lib/unpublished-species.ts';
import { readChecklistSlugs } from './check-withheld.ts';
import { pathToFileURL } from 'node:url';

// ---------------------------------------------------------------------------
// Exported pure helper — unit-testable without a full build
// ---------------------------------------------------------------------------

export interface FindUnpublishedLeaksOptions {
  /** Normalized deny-list slugs (hyphenated, lowercased). */
  unpublishedSlugs: Set<string>;
  /**
   * Directory basenames from _site/species/, EXACTLY as they appear on disk —
   * percent-encoded forms included. They are decoded for slug matching and used
   * verbatim for the filesystem probe; passing a pre-decoded name would make the
   * probe miss "aseptis-sp%20no%201" and misreport a page leak as a data leak.
   */
  emittedSlugs: string[];
  /**
   * Root of the built site, used to tell a page leak from a data-only leak.
   * Omit to classify every emitted directory as a page leak (the pre-#275 behaviour).
   */
  siteDir?: string;
  /**
   * Species slugs named by the emitted Checklist page (#218), if it was built.
   *
   * The checklist lists NAMES, not pages, so a deny-listed species reaching it
   * leaves _site/species/ untouched and every gate above sees nothing.
   */
  checklistSlugs?: string[];
  /** Raw slugs from data/key-matrix.json species[].slug. */
  keyMatrixSlugs: string[];
}

export interface UnpublishedLeakReport {
  /** Deny-listed slugs with an emitted _site/species/<dir>/index.html. */
  pageLeaks: string[];
  /**
   * Deny-listed slugs whose site directory exists but holds no page — occurrence
   * Parquet, most of the time.
   *
   * Reported apart from pageLeaks because the two have different causes and
   * different fixes: a page leak means the display gate failed, a data leak means
   * a build step wrote into _site/species/ without consulting the gate at all,
   * which is exactly what copy-parquet.ts did for 45 deny-listed species (#275).
   */
  dataLeaks: string[];
  /** Deny-listed slugs found in key-matrix.json species[].slug. */
  keyMatrixLeaks: string[];
  /** Deny-listed slugs named by the emitted Checklist page. */
  checklistLeaks: string[];
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
/**
 * Percent-decode a directory basename, tolerating names that are not valid encodings.
 *
 * A literal "%" in a filename ("100% cotton") makes decodeURIComponent throw a
 * URIError. A gate that throws on an odd filename fails the build for the wrong
 * reason and hides whatever it was actually looking for, so an undecodable name
 * is matched as-is.
 */
function decodeBasename(basename: string): string {
  try {
    return decodeURIComponent(basename);
  } catch {
    return basename;
  }
}

export function findUnpublishedLeaks(opts: FindUnpublishedLeaksOptions): UnpublishedLeakReport {
  const { unpublishedSlugs, emittedSlugs, keyMatrixSlugs, siteDir, checklistSlugs } = opts;
  const checklistLeaks = (checklistSlugs ?? []).filter(slug => unpublishedSlugs.has(normalizeSlug(slug)));

  const pageLeaks: string[] = [];
  const dataLeaks: string[] = [];
  const keyMatrixLeaks: string[] = [];

  for (const raw of emittedSlugs) {
    if (!unpublishedSlugs.has(normalizeSlug(decodeBasename(raw)))) continue;
    // The probe uses `raw`, not the decoded form: the directory on disk is the
    // encoded one, and resolve() would build a path that does not exist.
    const hasPage =
      siteDir === undefined || existsSync(resolve(siteDir, 'species', raw, 'index.html'));
    if (hasPage) {
      pageLeaks.push(raw);
    } else {
      dataLeaks.push(raw);
    }
  }

  for (const slug of keyMatrixSlugs) {
    if (unpublishedSlugs.has(normalizeSlug(slug))) {
      keyMatrixLeaks.push(slug);
    }
  }

  return { pageLeaks, dataLeaks, keyMatrixLeaks, checklistLeaks };
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
    // Pass the on-disk basenames through untouched. findUnpublishedLeaks decodes
    // them for matching (so "aseptis-sp%20no%201" and the literal-space form
    // normalize identically) and needs the undecoded form to stat the directory.
    emittedSlugs = readdirSync(siteSpeciesDir);
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
  // Same blindness guard as check-withheld: a page that exists but parses to zero
  // rows means the markup moved and this gate is checking nothing.
  const checklistSlugs = readChecklistSlugs(resolve('_site'));
  if (existsSync(resolve('_site/checklist/index.html')) && checklistSlugs.length === 0) {
    console.error(
      '[check-unpublished] CHECKLIST GATE UNUSABLE: _site/checklist/index.html exists but no ' +
      'species rows were parsed from it. The page markup changed and this gate is now blind.',
    );
    process.exit(1);
  }

  const { pageLeaks, dataLeaks, keyMatrixLeaks, checklistLeaks } = findUnpublishedLeaks({
    unpublishedSlugs: unpublished,
    emittedSlugs,
    keyMatrixSlugs,
    siteDir: resolve('_site'),
    checklistSlugs,
  });

  const hasLeaks = pageLeaks.length > 0 || dataLeaks.length > 0 || keyMatrixLeaks.length > 0 ||
    checklistLeaks.length > 0;

  if (hasLeaks) {
    if (pageLeaks.length > 0) {
      console.error(
        `[check-unpublished] PAGE GATE FAILED: ${pageLeaks.length} unpublished species emitted pages:\n` +
        pageLeaks.map(s => `  _site/species/${s}/`).join('\n'),
      );
    }
    if (dataLeaks.length > 0) {
      console.error(
        `[check-unpublished] DATA GATE FAILED: ${dataLeaks.length} unpublished species have files ` +
        `under _site/species/ with no page (occurrence data is published even when the page is ` +
        `not — #275):\n` +
        dataLeaks.map(s => `  _site/species/${s}/`).join('\n'),
      );
    }
    if (checklistLeaks.length > 0) {
      console.error(
        `[check-unpublished] CHECKLIST GATE FAILED: ${checklistLeaks.length} unpublished species ` +
        `named on the Checklist page:\n` + checklistLeaks.map(s => `  ${s}`).join('\n'),
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
    `[check-unpublished] PASS: checked ${unpublished.size} deny-list slugs against ` +
    `${checklistSlugs.length} checklist rows — 0 page leaks, 0 data leaks, ` +
    `0 key-matrix leaks, 0 checklist leaks`,
  );
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
