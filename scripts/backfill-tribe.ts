// scripts/backfill-tribe.ts
// Maintainer-run backfill: derives each genus' tribe from the reference DB's
// CMS browse-URL paths and writes a `tribe` column into data/species.csv.
//
// Tribe, like subfamily, is not a column in the legacy `species` data. It is
// encoded in the browse-URL paths (`cms_title.path`) as a `tribe-<name>`
// segment: `browse/family-X/subfamily-Y/tribe-Z/<genus>/<species>`. Tribe is a
// genus-level property — every species of a genus shares it — so we derive a
// genus -> tribe map from the paths and apply it by genus. Subfamilies without
// tribal subdivision (and genera added after the 2021 migration, absent from
// the legacy hierarchy) simply get a blank tribe and render one level shallower
// ("tribe where present"). See docs/reference/data-provenance.md.
//
// Additive-only and idempotent (matches the district/county backfills): a row
// that already has a non-blank `tribe` is never overwritten, so re-running
// after a curator hand-edit is safe. Genera the legacy paths don't classify are
// left blank, never guessed.
//
// Run: node scripts/backfill-tribe.ts   (pnwmoths-mysql container must be running)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// species.csv column order, with `tribe` appended after `epithet_quoted`.
const SPECIES_COLUMNS = [
  'id', 'genus', 'species', 'common_name', 'noc_id', 'authority', 'family',
  'similar_species', 'subfamily', 'epithet_quoted', 'tribe',
];

// Fixed literal SQL — no CSV/DB field value is ever interpolated. Projects one
// (genus, tribe) row per genus that sits under a `tribe-` segment. The
// `.../tribe-%/%/%` shape requires species-depth paths, so segment 5 is always
// the genus and segment 4 the `tribe-<name>` slug. genus/tribe segments are
// single lowercase words (no commas, quotes, or spaces).
const TRIBE_SQL = `
SELECT DISTINCT
  SUBSTRING_INDEX(SUBSTRING_INDEX(path, '/', 5), '/', -1) AS genus,
  REPLACE(SUBSTRING_INDEX(SUBSTRING_INDEX(path, '/', 4), '/', -1), 'tribe-', '') AS tribe
FROM cms_title
WHERE path LIKE 'browse/family-%/subfamily-%/tribe-%/%/%'
`;

export interface SpeciesCsvRow {
  id: string;
  genus: string;
  species: string;
  common_name: string;
  noc_id: string;
  authority: string;
  family: string;
  similar_species: string;
  subfamily: string;
  epithet_quoted: string;
  tribe: string;
}

export interface ApplyTribesResult {
  rows: SpeciesCsvRow[];
  filled: number;       // rows a tribe was newly written to
  alreadyHad: number;   // rows that already carried a non-blank tribe (kept as-is)
  leftBlank: number;    // rows the legacy paths don't classify (no tribe available)
}

/** Title-case a tribe slug to match the `subfamily` column convention
 *  (`arctiini` -> `Arctiini`). Tribe slugs are single lowercase words. */
export function titleCaseTribe(slug: string): string {
  if (!slug) return '';
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

/** Build a genus (lowercased) -> Title-cased tribe map from the DB rows. The
 *  legacy paths map each genus to exactly one tribe (verified: zero conflicts);
 *  if a duplicate ever appears, the first wins and the rest are ignored. */
export function buildTribeMap(dbRows: Array<{ genus: string; tribe: string }>): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of dbRows) {
    const genus = (r.genus ?? '').toLowerCase();
    const tribe = titleCaseTribe(r.tribe ?? '');
    if (!genus || !tribe) continue;
    if (!map.has(genus)) map.set(genus, tribe);
  }
  return map;
}

/** Apply the genus -> tribe map to species rows. Additive-only: a row that
 *  already has a non-blank `tribe` keeps it; otherwise the row's genus is looked
 *  up and filled, or left blank when the legacy paths don't classify it. */
export function applyTribes(
  speciesRows: Array<Record<string, string>>,
  tribeMap: Map<string, string>,
): ApplyTribesResult {
  let filled = 0;
  let alreadyHad = 0;
  let leftBlank = 0;
  const rows: SpeciesCsvRow[] = speciesRows.map((r) => {
    const existing = (r.tribe ?? '').trim();
    let tribe: string;
    if (existing) {
      tribe = existing;
      alreadyHad++;
    } else {
      const mapped = tribeMap.get((r.genus ?? '').toLowerCase());
      if (mapped) {
        tribe = mapped;
        filled++;
      } else {
        tribe = '';
        leftBlank++;
      }
    }
    return {
      id: r.id ?? '',
      genus: r.genus ?? '',
      species: r.species ?? '',
      common_name: r.common_name ?? '',
      noc_id: r.noc_id ?? '',
      authority: r.authority ?? '',
      family: r.family ?? '',
      similar_species: r.similar_species ?? '',
      subfamily: r.subfamily ?? '',
      epithet_quoted: r.epithet_quoted ?? '',
      tribe,
    };
  });
  return { rows, filled, alreadyHad, leftBlank };
}

// ---------------------------------------------------------------------------
// CLI entry-point — wires Docker extraction to the write-back
// ---------------------------------------------------------------------------

/** Decode mysql --batch escaping (\t \n \\ within tab-separated fields). */
function unescapeBatch(s: string): string {
  return s.replace(/\\(.)/g, (_m, c) =>
    c === 't' ? '\t' : c === 'n' ? '\n' : c === '0' ? '\0' : c);
}

/** Run a fixed literal SQL string against the container; array-args
 *  execFileSync (no shell) — no CSV/DB field value is interpolated into `sql`. */
function queryContainer(sql: string): Record<string, string>[] {
  const out = execFileSync(
    'docker',
    ['exec', '-i', 'pnwmoths-mysql', 'mysql', '-upnwmoths', '-ppnwmoths', 'pnwmoths', '--batch'],
    { input: sql, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  const lines = out.replace(/\n$/, '').split('\n');
  const header = (lines[0] ?? '').split('\t');
  return lines.slice(1).map((line) => {
    const cells = line.split('\t').map(unescapeBatch);
    return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? '']));
  });
}

export async function main(): Promise<void> {
  const speciesCsvPath = resolve(ROOT, 'data/species.csv');
  const speciesRows = parse(readFileSync(speciesCsvPath), {
    columns: true,
    skip_empty_lines: true,
  }) as Array<Record<string, string>>;

  const dbRows = queryContainer(TRIBE_SQL).map((r) => ({
    genus: r.genus ?? '',
    tribe: r.tribe ?? '',
  }));
  const tribeMap = buildTribeMap(dbRows);

  const { rows, filled, alreadyHad, leftBlank } = applyTribes(speciesRows, tribeMap);

  writeFileSync(speciesCsvPath, stringify(rows, { header: true, columns: SPECIES_COLUMNS }), 'utf8');

  const distinctTribes = new Set(rows.map((r) => r.tribe).filter(Boolean)).size;
  console.log(`[backfill-tribe] genus->tribe map size:   ${tribeMap.size}`);
  console.log(`[backfill-tribe] newly filled:            ${filled}`);
  console.log(`[backfill-tribe] already had a value:     ${alreadyHad}`);
  console.log(`[backfill-tribe] left blank (no tribe):   ${leftBlank}`);
  console.log(`[backfill-tribe] distinct tribes written: ${distinctTribes}`);
  console.log('[backfill-tribe] wrote data/species.csv');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error((err as Error).message);
    process.exit(1);
  });
}
