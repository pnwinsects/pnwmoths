/**
 * scripts/extract-species-plates.ts
 *
 * Issue #53 (Link to photographic plate from species account): extract the
 * per-species -> photographic-plate assignment from the legacy reference
 * MySQL database and materialize it into data/species-plates.csv, so the
 * factsheet can render the "View Photographic Plate" link the original site
 * showed on every species page (linking to `/photographic-plates/#plateNN`).
 *
 * The assignment is NOT derivable from family/subfamily/tribe alone — several
 * subfamilies span multiple plates (e.g. Arctiinae spans five: "Arctiinae I"
 * .. "Arctiinae V"), and which genera land on which numbered plate is a
 * curatorial layout decision, not a taxonomic rule. It IS a structured
 * many-to-many relation in the reference DB:
 *
 *   species_plateimage (one row per plate; `image` embeds "PLATE <NN>")
 *     <- species_plateimage_member_species (join table)
 *     -> species_species (genus + species -> slug)
 *
 * Output: data/species-plates.csv with columns `species_slug,plate_slug` —
 * one row per species that appears on a plate, sorted by species_slug.
 * `plate_slug` matches a `slug` in data/plates.json (e.g.
 * "plate-35-noctuidae-vi-acronictinae-i"). The two "Commonly Reported Moths"
 * plates (numbers 0/00) are curated highlight sheets with no species
 * membership rows in the reference DB and are never a target here.
 *
 * A handful of source rows don't resolve to a species in this codebase:
 *  - Quoted informal epithets (e.g. `"concisa"`) are stripped of the quote
 *    marks before slugging, per the slug convention (CONTEXT.md): quoting is
 *    display-only and never appears in the slug.
 *  - Reclassified genera (e.g. Globia -> Capsula) are resolved via
 *    data/species-synonyms.csv, same as scripts/ingest-photos.ts.
 *  - Genuine legacy-only species absent from data/species.csv are dropped
 *    and reported (mirrors scripts/extract-reference-links.ts).
 * One species (parastichtis-suspecta) is a member of two adjacent plates
 * (57 and 58); the lower-numbered plate is kept deterministically.
 *
 * Reads the legacy MySQL reference database through scripts/lib/reference-db.ts,
 * which says where it runs and how to start it.
 *
 * Usage:
 *   node scripts/extract-species-plates.ts
 *   DRY_RUN=1 node scripts/extract-species-plates.ts   # print CSV; no write
 *
 * Env overrides: MYSQL_CONTAINER, MYSQL_DB, MYSQL_USER, MYSQL_PASSWORD (see reference-db.ts).
 *
 * The output CSV is committed to the repo and read by the site at build time
 * (src/_data/speciesPlates.ts). Re-run only when the reference data changes.
 */

import { resolve } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { runReferenceSql } from './lib/reference-db.ts';
import { parse } from 'csv-parse/sync';
import { DuckDBInstance } from '@duckdb/node-api';
import { pathToFileURL } from 'node:url';

// ---------------------------------------------------------------------------
// Module-level env constants (project convention).
// ---------------------------------------------------------------------------

const OUTPUT_PATH: string = resolve('data/species-plates.csv');
const SPECIES_CSV: string = resolve('data/species.csv');
const SYNONYMS_CSV: string = resolve('data/species-synonyms.csv');
const PLATES_JSON: string = resolve('data/plates.json');
const DRY_RUN: boolean = process.env['DRY_RUN'] === '1';

const SQL: string = `
SELECT sp.image AS image, ss.genus AS genus, ss.species AS species
FROM species_plateimage_member_species m
JOIN species_plateimage sp ON sp.id = m.plateimage_id
JOIN species_species ss    ON ss.id = m.species_id
ORDER BY sp.id, ss.genus, ss.species
`.trim();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlateSourceRow {
  image: string;
  genus: string;
  species: string;
}

export interface SpeciesPlate {
  species_slug: string;
  plate_slug: string;
}

// ---------------------------------------------------------------------------
// Exported helpers (exported at module level for unit tests).
// ---------------------------------------------------------------------------

/**
 * Parse mysql `--batch -N` output (tab-separated, no header) into source rows.
 */
export function parseRows(stdout: string): PlateSourceRow[] {
  const rows: PlateSourceRow[] = [];
  for (const line of stdout.split('\n')) {
    if (line === '') continue;
    const [image, genus, species] = line.split('\t');
    if (!image || !genus || !species) {
      throw new Error(`[extract-species-plates] malformed row: ${JSON.stringify(line)}`);
    }
    rows.push({ image, genus, species });
  }
  return rows;
}

/**
 * Extract the plate number from a `species_plateimage.image` path, e.g.
 * "plates/2021 PLATE 1 Drepanidae.jpg" -> "1", "plates/2021_PLATE_84_....jpg"
 * -> "84". Returns null if the filename doesn't contain a recognizable
 * "PLATE <NN>" token (not expected for real data, but guarded rather than
 * throwing so one odd row can't crash the whole extraction).
 */
export function extractPlateNumber(image: string): string | null {
  const m = image.match(/PLATE[ _]?(\d+)/i);
  return m ? (m[1] as string) : null;
}

/**
 * Build the slug convention's raw slug from a legacy genus/species pair:
 * `(genus + '-' + species).toLowerCase()`, alphanumerics and hyphens only.
 * Strips quote marks from informally-quoted epithets (e.g. `"concisa"`) —
 * quoting is display-only and never appears in the slug (CONTEXT.md).
 */
export function toSpeciesSlug(genus: string, species: string): string {
  return `${genus}-${species}`.toLowerCase().replace(/[^a-z0-9-]/g, '');
}

/**
 * Serialize species/plate slug pairs to CSV. Slugs are alphanumeric-and-hyphen
 * only by construction, so no RFC-4180 quoting is ever needed.
 */
export function toCsv(rows: SpeciesPlate[]): string {
  const lines = ['species_slug,plate_slug'];
  for (const r of rows) lines.push(`${r.species_slug},${r.plate_slug}`);
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Data sources
// ---------------------------------------------------------------------------

/** Run the extraction query; tab-separated rows, no header. */
function runQuery(): string {
  return runReferenceSql(SQL, { columnNames: false });
}

/**
 * Load the set of slugs present in data/species.csv, using the same derivation
 * as src/_data/species.ts (lower(genus || '-' || species)).
 */
async function loadCodebaseSlugs(): Promise<Set<string>> {
  const db = await DuckDBInstance.create(':memory:');
  const conn = await db.connect();
  const result = await conn.runAndReadAll(
    `SELECT lower(genus || '-' || species) AS slug
       FROM read_csv('${SPECIES_CSV}', header = true, nullstr = '')`,
  );
  conn.closeSync();
  const slugs = new Set<string>();
  for (const row of result.getRowObjectsJS()) {
    slugs.add(String((row as Record<string, unknown>)['slug']));
  }
  return slugs;
}

/**
 * Load data/species-synonyms.csv into a binomial -> target-slug map, keyed by
 * lowercased "genus species" (mirrors scripts/ingest-photos.ts loadSynonyms).
 * Missing-file path soft-fails (returns an empty map).
 */
async function loadSynonyms(): Promise<Map<string, string>> {
  if (!existsSync(SYNONYMS_CSV)) return new Map();
  const raw = await readFile(SYNONYMS_CSV, 'utf8');
  const records = parse(raw, { columns: true, skip_empty_lines: true, bom: true }) as Array<
    Record<string, unknown>
  >;
  const map = new Map<string, string>();
  for (const r of records) {
    const fromBinomial = r['from_binomial'];
    const toSlug = r['to_species_slug'];
    if (typeof fromBinomial === 'string' && typeof toSlug === 'string') {
      map.set(fromBinomial.toLowerCase(), toSlug);
    }
  }
  return map;
}

/**
 * Load data/plates.json into a plate-number -> plate-slug map.
 */
async function loadPlateNumberToSlug(): Promise<Map<string, string>> {
  const raw = await readFile(PLATES_JSON, 'utf8');
  const entries = JSON.parse(raw) as Array<{ number: string; slug: string }>;
  return new Map(entries.map(e => [e.number, e.slug]));
}

// ---------------------------------------------------------------------------
// main()
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const rows = parseRows(runQuery());
  const [codebaseSlugs, synonyms, plateNumberToSlug] = await Promise.all([
    loadCodebaseSlugs(),
    loadSynonyms(),
    loadPlateNumberToSlug(),
  ]);

  // Resolve each source row to a codebase species_slug + numeric plate number,
  // keeping the lowest plate number when a species maps to more than one
  // (a species can legitimately sit near a plate boundary in the source data).
  const bestPlateForSlug = new Map<string, number>();
  let droppedNoNumber = 0;
  let droppedNotInCodebase = 0;

  for (const row of rows) {
    const numberStr = extractPlateNumber(row.image);
    if (!numberStr) {
      droppedNoNumber++;
      continue;
    }

    const rawSlug = toSpeciesSlug(row.genus, row.species);
    let slug = rawSlug;
    if (!codebaseSlugs.has(slug)) {
      const binomial = `${row.genus} ${row.species}`.toLowerCase();
      const synonymSlug = synonyms.get(binomial);
      if (synonymSlug && codebaseSlugs.has(synonymSlug)) {
        slug = synonymSlug;
      } else {
        droppedNotInCodebase++;
        continue;
      }
    }

    const number = parseInt(numberStr, 10);
    const existing = bestPlateForSlug.get(slug);
    if (existing === undefined || number < existing) {
      bestPlateForSlug.set(slug, number);
    }
  }

  const result: SpeciesPlate[] = [];
  let droppedNoPlateSlug = 0;
  for (const [slug, number] of bestPlateForSlug) {
    const plateSlug = plateNumberToSlug.get(String(number));
    if (!plateSlug) {
      droppedNoPlateSlug++;
      continue;
    }
    result.push({ species_slug: slug, plate_slug: plateSlug });
  }
  result.sort((a, b) => a.species_slug.localeCompare(b.species_slug));

  console.log('[extract-species-plates] summary:');
  console.log(`  rows in reference DB:              ${rows.length}`);
  console.log(`  dropped (no plate number parsed):  ${droppedNoNumber}`);
  console.log(`  dropped (species not in codebase): ${droppedNotInCodebase}`);
  console.log(`  dropped (plate number unknown):    ${droppedNoPlateSlug}`);
  console.log(`  species with a plate:              ${result.length} / ${codebaseSlugs.size}`);

  const csv = toCsv(result);

  if (DRY_RUN) {
    console.log('[extract-species-plates] DRY_RUN=1 — CSV (not written):');
    console.log(csv);
    return;
  }

  await writeFile(OUTPUT_PATH, csv);
  console.log(`[extract-species-plates] wrote ${OUTPUT_PATH}`);
}

// ---------------------------------------------------------------------------
// Self-invocation guard — prevents main() from running on test import.
// ---------------------------------------------------------------------------

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error((err as Error).message);
    process.exit(1);
  });
}
