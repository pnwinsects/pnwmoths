// scripts/rename-species.ts
//
// Rename one species: `npm run species:rename -- <old-slug> "<New Genus> <new epithet>"`.
//
// The species slug is derived from the scientific name, and the curator keeps changing
// scientific names. Until ADR 0054 a rename meant editing about 25 files by hand and
// copying every photograph to a new CDN folder (#416 did that for six species). Now the
// folder is data (`cdn_folder`), so a rename edits data files and moves nothing on the CDN.
//
// WHAT IT CHANGES
//
//   data/species.csv        the genus and epithet of the species' row; its slug follows
//   every file in RELATIONS (scripts/check-referential-integrity.ts), the cell holding the slug
//   data/records.csv, records-inat.csv, records-derived-district.csv,
//   data/species-photos-manifest.csv, data/referential-integrity-exceptions.csv
//                           the slug column (these hold slugs but are not in RELATIONS)
//   data/images.csv         the slug, and `cdn_folder` set to the old slug so no photograph moves
//   data/species-photos-manifest.csv
//                           `cdn_folder` set to the old slug for rows whose tiles are on disk or CDN
//   data/species-photos.json  the key; the `tiles_path` values stay (they name the frozen folder)
//   data/species-redirects.csv  a row from the old address to the new one
//   data/species-synonyms.csv   a row from the old binomial to the new slug
//   src/_data/speciesSlugs.json, src/content/species/<slug>.md  the entry and the file name
//   scripts/check-photo-determinations.ts  the species' entries in KNOWN_COLLISIONS
//
// then regenerates the two committed files derived from the above (checklist order and the
// Identify matrix), and fails — before writing anything — if any file that should be free of
// the old slug still holds it.
//
// WHAT IT LEAVES ALONE
//
//   - the authority, common name and `noc_id` of the species (curator decisions; edit by hand);
//   - the prose of the species account, which says the old name in Lars's words;
//   - `cdn_folder` cells, `tiles_path` values, `image-derivatives.csv` and `cdn-retired-images.csv`,
//     which name where an object IS, not what the species is called;
//   - the one-off run reports (coord-fill, legacy-rejoin, ...), which are history;
//   - files `npm run build:site` regenerates (the hidden-images and CDN inventory reports).
//
// Usage:
//   DRY_RUN=1 npm run species:rename -- malacosoma-californicum malacosoma-californica
//   npm run species:rename -- malacosoma-californicum "Malacosoma californica" --reason "MPG spelling (#369)"
//
// Idempotent: when the new species exists and the old one does not, it reports that and exits 0.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'csv-parse/sync';
import { RELATIONS, type Relation } from './check-referential-integrity.ts';
import { readPhotoDeterminations, toPhotoStem } from './lib/photo-determinations.ts';
import { normalizeSlug } from '../src/_lib/unpublished-species.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TAG = '[rename-species]';

// ---------------------------------------------------------------------------
// CSV editing that changes only the cells it means to change
// ---------------------------------------------------------------------------
//
// Parsing and re-stringifying a CSV rewrites quoting the edit never touched
// (docs/lessons-learned.md), and records.csv has 94,000 rows. These helpers split a record into
// its raw fields, change the ones the caller changed, and join the rest back exactly as read.

/** The raw fields of one CSV line, quotes and all, so that `join(',')` gives the line back. */
export function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '""';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      cur += ch;
    } else if (ch === ',' && !inQuotes) {
      fields.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

function unquote(raw: string): string {
  if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) return raw.slice(1, -1).replaceAll('""', '"');
  return raw;
}

function quoteIfNeeded(value: string, wasQuoted: boolean): string {
  return wasQuoted || /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/**
 * Split CSV text into its raw records. A record ends at a newline outside quotes, so a quoted
 * field that holds a line break (records.csv has some in its notes) stays in one record.
 */
export function splitCsvRecords(text: string): string[] {
  const records: string[] = [];
  let start = 0;
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === '\n' && !inQuotes) {
      records.push(text.slice(start, i));
      start = i + 1;
    }
  }
  if (start < text.length) records.push(text.slice(start));
  return records;
}

/**
 * Apply `rowFn` to every data row, as a column-name → value record. Only the cells `rowFn`
 * changed are written back; every other byte of the file is as it was.
 */
export function editCsv(
  text: string,
  label: string,
  rowFn: (record: Record<string, string>) => void,
): { text: string; changed: number } {
  const trailingNewline = text.endsWith('\n');
  const records = splitCsvRecords(text);
  const header = splitCsvLine(records[0] ?? '').map(unquote);
  let changed = 0;
  const out: string[] = [records[0] ?? ''];
  for (let i = 1; i < records.length; i++) {
    const line = records[i]!;
    if (line === '') {
      out.push(line);
      continue;
    }
    const raw = splitCsvLine(line);
    if (raw.length !== header.length) {
      throw new Error(`${TAG} ${label} record ${i + 1} has ${raw.length} fields, not ${header.length}`);
    }
    const record: Record<string, string> = {};
    header.forEach((name, k) => { record[name] = unquote(raw[k]!); });
    const before = { ...record };
    rowFn(record);
    let dirty = false;
    header.forEach((name, k) => {
      if (record[name] !== before[name]) {
        raw[k] = quoteIfNeeded(record[name]!, raw[k]!.startsWith('"'));
        dirty = true;
      }
    });
    if (dirty) changed++;
    out.push(dirty ? raw.join(',') : line);
  }
  return { text: out.join('\n') + (trailingNewline ? '\n' : ''), changed };
}

function csvHeader(text: string): string[] {
  return splitCsvLine(text.split('\n')[0] ?? '').map(unquote);
}

// ---------------------------------------------------------------------------
// The request and the plan
// ---------------------------------------------------------------------------

export interface RenameRequest {
  oldSlug: string;
  /** Either the new binomial ("Malacosoma californica") or the new slug. */
  target: string;
  /** Why, for the redirect row. */
  reason?: string;
}

export interface RenamePlan {
  status: 'planned' | 'already-renamed';
  oldSlug: string;
  newSlug: string;
  newBinomial: string;
  /** Path (relative to the root) → full new contents. */
  edits: Map<string, string>;
  /** Files to move, relative to the root. */
  moves: Array<{ from: string; to: string }>;
  /** Rows changed per file, for the summary. */
  counts: Map<string, number>;
  /** Things the script cannot do and the maintainer should look at. */
  notes: string[];
}

interface SpeciesRow {
  genus: string;
  species: string;
}

function speciesSlug(row: SpeciesRow): string {
  return normalizeSlug(`${row.genus}-${row.species}`);
}

/**
 * Work out the new genus and epithet. A binomial (contains a space) is taken as written.
 * A slug is read against the old name: it must keep the old genus or the old epithet, since
 * "malacosoma-californica" alone cannot say where the genus ends when an epithet has spaces.
 */
export function resolveTarget(old: SpeciesRow, target: string): SpeciesRow {
  const t = target.trim();
  if (/\s/.test(t)) {
    const [genus, ...rest] = t.split(/\s+/);
    if (!genus || rest.length === 0) throw new Error(`${TAG} "${target}" is not a binomial (genus and epithet)`);
    return { genus, species: rest.join(' ') };
  }
  const oldGenusSlug = normalizeSlug(old.genus);
  const oldEpithetSlug = normalizeSlug(old.species);
  const sameGenus = t.startsWith(`${oldGenusSlug}-`);
  const sameEpithet = t.endsWith(`-${oldEpithetSlug}`);
  if (sameGenus && !sameEpithet) {
    return { genus: old.genus, species: t.slice(oldGenusSlug.length + 1).replaceAll('-', ' ') };
  }
  if (sameEpithet && !sameGenus) {
    const genusSlug = t.slice(0, t.length - oldEpithetSlug.length - 1);
    return { genus: genusSlug.charAt(0).toUpperCase() + genusSlug.slice(1).replaceAll('-', ' '), species: old.species };
  }
  throw new Error(
    `${TAG} cannot tell from "${target}" where the genus ends. Give the new name as a binomial in quotes, ` +
      `for example "${old.genus} new-epithet".`,
  );
}

/** Reads files from disk, but sees what the plan has already changed. */
export class Workspace {
  readonly edits = new Map<string, string>();
  readonly root: string;
  constructor(root: string) {
    this.root = root;
  }

  exists(path: string): boolean {
    return this.edits.has(path) || existsSync(join(this.root, path));
  }
  read(path: string): string {
    return this.edits.get(path) ?? readFileSync(join(this.root, path), 'utf8');
  }
  write(path: string, text: string): void {
    this.edits.set(path, text);
  }
}

/** Files that are regenerated from the ones the plan edits, rather than edited. */
const REGENERATED = new Set(['key-matrix.json']);

/**
 * Files whose slugs name where an object IS or what a script once saw, not what a species
 * is called. They keep the old slug on purpose, and the check at the end does not look in them.
 */
const KEEPS_OLD_SLUG = new Set([
  'data/image-derivatives.csv',
  'data/cdn-retired-images.csv',
  'data/cdn-inventory-report.csv',
  'data/cdn-duplicates-report.csv',
  'data/hidden-images-report.csv',
  'data/coord-fill-report.csv',
  'data/legacy-rejoin-report.csv',
  'data/inat-sync-report.csv',
  'data/records-bad.csv',
  'data/key-coverage-report.json',
]);

/** Columns that are exempt from the final check in files that are otherwise checked. */
const EXEMPT_COLUMNS: Record<string, readonly string[]> = {
  'data/images.csv': ['cdn_folder'],
  'data/species-photos-manifest.csv': ['cdn_folder'],
  'data/species-redirects.csv': ['old_slug'],
};

/** The slug columns of files that hold slugs but are not in RELATIONS. */
const EXTRA_SLUG_COLUMNS: ReadonlyArray<{ path: string; column: string }> = [
  { path: 'data/records.csv', column: 'species_slug' },
  { path: 'data/records-inat.csv', column: 'species_slug' },
  { path: 'data/records-derived-district.csv', column: 'species_slug' },
  { path: 'data/species-photos-manifest.csv', column: 'species_slug' },
  { path: 'data/referential-integrity-exceptions.csv', column: 'slug' },
];

function rekeyCsvColumn(ws: Workspace, plan: RenamePlan, path: string, column: string, from: string, to: string): void {
  if (!ws.exists(path)) return;
  const text = ws.read(path);
  if (!csvHeader(text).includes(column)) throw new Error(`${TAG} ${path} has no ${column} column`);
  const result = editCsv(text, path, (rec) => {
    if (rec[column] === from) rec[column] = to;
  });
  if (result.changed > 0) {
    ws.write(path, result.text);
    plan.counts.set(path, (plan.counts.get(path) ?? 0) + result.changed);
  }
}

function appendLine(text: string, line: string): string {
  return `${text.endsWith('\n') ? text : `${text}\n`}${line}\n`;
}

function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** Build the whole set of edits in memory. Nothing is written here. */
export function planRename(root: string, request: RenameRequest): RenamePlan {
  const ws = new Workspace(root);
  const oldSlug = normalizeSlug(request.oldSlug);

  const speciesText = ws.read('data/species.csv');
  const speciesRows = parse(speciesText, { columns: true, skip_empty_lines: true }) as SpeciesRow[];
  const oldRow = speciesRows.find((r) => speciesSlug(r) === oldSlug);

  const emptyPlan = (status: RenamePlan['status'], newSlug: string, newBinomial: string): RenamePlan => ({
    status, oldSlug, newSlug, newBinomial,
    edits: new Map(), moves: [], counts: new Map(), notes: [],
  });

  if (!oldRow) {
    // Already done? The target exists and the old name does not.
    const asSlug = normalizeSlug(request.target);
    if (speciesRows.some((r) => speciesSlug(r) === asSlug)) {
      return emptyPlan('already-renamed', asSlug, request.target);
    }
    throw new Error(`${TAG} no species has the slug "${oldSlug}" in data/species.csv`);
  }

  const next = resolveTarget(oldRow, request.target);
  const newSlug = speciesSlug(next);
  const newBinomial = `${next.genus} ${next.species}`;
  if (newSlug === oldSlug) throw new Error(`${TAG} "${request.target}" gives the same slug as the old name`);
  if (speciesRows.some((r) => speciesSlug(r) === newSlug)) {
    throw new Error(`${TAG} a species with the slug "${newSlug}" already exists; merging two species is not a rename`);
  }

  const plan: RenamePlan = {
    status: 'planned', oldSlug, newSlug, newBinomial,
    edits: ws.edits, moves: [], counts: new Map(), notes: [],
  };

  // --- Freeze the folders first, while the old slug still means the old folder. -------------
  freezeFolders(ws, plan, root, oldSlug);

  // --- species.csv: the name itself, and the pipe lists that mention the species. ----------
  const speciesEdit = editCsv(speciesText, 'data/species.csv', (rec) => {
    if (normalizeSlug(`${rec['genus']}-${rec['species']}`) === oldSlug) {
      rec['genus'] = next.genus;
      rec['species'] = next.species;
    }
    if (rec['similar_species']) {
      rec['similar_species'] = rec['similar_species'].split('|').map((s) => (s === oldSlug ? newSlug : s)).join('|');
    }
  });
  ws.write('data/species.csv', speciesEdit.text);
  plan.counts.set('data/species.csv', speciesEdit.changed);

  // --- Every file in RELATIONS. -------------------------------------------------------------
  for (const relation of RELATIONS) rekeyRelation(ws, plan, relation, oldSlug, newSlug);

  // --- The slug columns RELATIONS does not cover. -------------------------------------------
  for (const { path, column } of EXTRA_SLUG_COLUMNS) rekeyCsvColumn(ws, plan, path, column, oldSlug, newSlug);

  // --- Redirect and synonym rows. -----------------------------------------------------------
  addRedirect(ws, plan, oldSlug, newSlug, request.reason ?? `renamed to ${newBinomial}`);
  addSynonym(ws, plan, `${oldRow.genus} ${oldRow.species}`, newSlug);

  // --- Hard-coded slugs in source. ----------------------------------------------------------
  rekeyKnownCollisions(ws, plan, oldSlug, newSlug);

  // --- Nothing may be left behind. ----------------------------------------------------------
  const leftovers = findOldSlug(ws, oldSlug);
  if (leftovers.length > 0) {
    throw new Error(
      `${TAG} the old slug "${oldSlug}" would still appear in ${leftovers.length} place(s) after the rename, ` +
        `so nothing was written. Re-key these by hand, or add the file to the script if it should be handled:\n  ` +
        leftovers.slice(0, 20).join('\n  '),
    );
  }

  plan.notes.push(
    `The authority, common name and noc_id of ${newBinomial} are unchanged; edit data/species.csv if the rename changes them.`,
    `The prose in src/content/species/${newSlug}.md still says the old name.`,
    `data/species-synonyms.csv now maps "${oldRow.genus} ${oldRow.species}" to ${newSlug}. Delete that row if the old name is a different taxon, not a synonym.`,
    'No CDN copy is needed: photographs and tiles stay in their folders (ADR 0054).',
  );
  return plan;
}

// ---------------------------------------------------------------------------
// The steps
// ---------------------------------------------------------------------------

function rekeyRelation(ws: Workspace, plan: RenamePlan, relation: Relation, oldSlug: string, newSlug: string): void {
  const { path, kind, column } = relation;
  if (REGENERATED.has(path.split('/').pop() ?? '')) return;
  if (path === 'data/species.csv') return; // handled with the name itself

  switch (kind) {
    case 'csv-column':
      rekeyCsvColumn(ws, plan, path, column!, oldSlug, newSlug);
      return;

    case 'json-keys': {
      if (!ws.exists(path)) return;
      const text = ws.read(path);
      const data = JSON.parse(text) as Record<string, unknown>;
      if (JSON.stringify(data, null, 2) + '\n' !== text) {
        throw new Error(`${TAG} ${path} is not formatted as JSON.stringify(…, null, 2); format it first so the rename changes only the key`);
      }
      if (!(oldSlug in data)) return;
      // generate-species-photos.ts writes its keys in `Object.entries(…).sort()` order. Keep a
      // file that was in that order in that order, so the next `npm run photos:materialize`
      // does not move the renamed entry and show up as a diff.
      const entries = Object.entries(data);
      const wasSorted = JSON.stringify(entries.map(([k]) => k)) === JSON.stringify([...entries].sort().map(([k]) => k));
      let renamedEntries = entries.map(([key, value]): [string, unknown] => [key === oldSlug ? newSlug : key, value]);
      if (wasSorted) renamedEntries = renamedEntries.sort();
      ws.write(path, JSON.stringify(Object.fromEntries(renamedEntries), null, 2) + '\n');
      plan.counts.set(path, 1);
      return;
    }

    case 'json-array': {
      if (!ws.exists(path)) return;
      const text = ws.read(path);
      const list = JSON.parse(text) as string[];
      if (JSON.stringify(list, null, 2) + '\n' !== text) {
        throw new Error(`${TAG} ${path} is not formatted as JSON.stringify(…, null, 2)`);
      }
      if (!list.includes(oldSlug)) return;
      const wasSorted = JSON.stringify(list) === JSON.stringify([...list].sort());
      const next = list.map((s) => (s === oldSlug ? newSlug : s));
      ws.write(path, JSON.stringify(wasSorted ? next.sort() : next, null, 2) + '\n');
      plan.counts.set(path, 1);
      return;
    }

    case 'md-basenames': {
      const from = `${path}/${oldSlug}.md`;
      if (ws.exists(from)) plan.moves.push({ from, to: `${path}/${newSlug}.md` });
      return;
    }

    case 'csv-pipe-list':
      return; // species.csv, handled with the name

    case 'json-array-field':
      return; // key-matrix.json, regenerated
  }
}

/**
 * Set `cdn_folder` to the old slug wherever an object is stored under it. Run before any slug
 * is changed, because "stored under the old slug" is read off the old slug.
 */
function freezeFolders(ws: Workspace, plan: RenamePlan, root: string, oldSlug: string): void {
  // Legacy photographs: every row of the species, unless it already names a folder.
  if (ws.exists('data/images.csv')) {
    const images = editCsv(ws.read('data/images.csv'), 'data/images.csv', (rec) => {
      if (rec['species_slug'] === oldSlug && !rec['cdn_folder']) rec['cdn_folder'] = oldSlug;
    });
    if (images.changed > 0) {
      ws.write('data/images.csv', images.text);
      plan.counts.set('data/images.csv (cdn_folder)', images.changed);
    }
  }

  // Tiles: rows already tiled or uploaded, whose pyramid sits under the folder of the species
  // they are filed under *after* determinations (the same rule generate-species-photos.ts applies).
  const manifestPath = 'data/species-photos-manifest.csv';
  if (ws.exists(manifestPath)) {
    const determinations = readPhotoDeterminations(join(root, 'data/photo-determinations.csv'));
    const manifest = editCsv(ws.read(manifestPath), manifestPath, (rec) => {
      const ruling = determinations.get(toPhotoStem(rec['filename_raw'] ?? ''));
      const filedUnder = (ruling ? ruling.species_slug : rec['species_slug'])?.toLowerCase();
      if (filedUnder === oldSlug && (rec['status'] === 'uploaded' || rec['status'] === 'tiled') && !rec['cdn_folder']) {
        rec['cdn_folder'] = oldSlug;
      }
    });
    if (manifest.changed > 0) {
      ws.write(manifestPath, manifest.text);
      plan.counts.set(`${manifestPath} (cdn_folder)`, manifest.changed);
    }
  }
}

function addRedirect(ws: Workspace, plan: RenamePlan, oldSlug: string, newSlug: string, reason: string): void {
  const path = 'data/species-redirects.csv';
  if (!ws.exists(path)) throw new Error(`${TAG} ${path} is missing`);
  let changed = 0;
  // A retired slug that points at the old one now points at the new one (no chains), and a
  // redirect away from the new slug is dropped: the slug is live again.
  let text = ws.read(path);
  const lines = text.split('\n');
  const kept = lines.filter((line, i) => {
    if (i === 0 || line === '') return true;
    const [from] = splitCsvLine(line);
    if (unquote(from ?? '') === newSlug) {
      plan.notes.push(`Removed the redirect from "${newSlug}": the slug is a live species again.`);
      changed++;
      return false;
    }
    return true;
  });
  text = kept.join('\n');
  text = editCsv(text, path, (rec) => {
    if (rec['new_slug'] === oldSlug) {
      rec['new_slug'] = newSlug;
      changed++;
    }
  }).text;
  text = appendLine(text, `${csvField(oldSlug)},${csvField(newSlug)},${csvField(reason)}`);
  ws.write(path, text);
  plan.counts.set(path, changed + 1);
}

function addSynonym(ws: Workspace, plan: RenamePlan, oldBinomial: string, newSlug: string): void {
  const path = 'data/species-synonyms.csv';
  if (!ws.exists(path)) throw new Error(`${TAG} ${path} is missing`);
  // Rows that now say "the species is its own synonym" are redundant: the key and the photo
  // pipeline match the new name directly.
  let removed = 0;
  const lines = ws.read(path).split('\n');
  const kept = lines.filter((line, i) => {
    if (i === 0 || line === '') return true;
    const [from, to] = splitCsvLine(line).map(unquote);
    if (from !== undefined && to === newSlug && normalizeSlug(from) === newSlug) {
      removed++;
      return false;
    }
    return true;
  });
  let text = kept.join('\n');
  const exists = text.split('\n').some((line, i) => i > 0 && unquote(splitCsvLine(line)[0] ?? '') === oldBinomial);
  if (!exists) text = appendLine(text, `${csvField(oldBinomial)},${csvField(newSlug)}`);
  ws.write(path, text);
  plan.counts.set(path, removed + (exists ? 0 : 1));
}

/** The ratchet list in check-photo-determinations.ts spells slugs out in source. */
function rekeyKnownCollisions(ws: Workspace, plan: RenamePlan, oldSlug: string, newSlug: string): void {
  const path = 'scripts/check-photo-determinations.ts';
  if (!ws.exists(path)) return;
  const text = ws.read(path);
  const pattern = new RegExp(`'${oldSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\|`, 'g');
  if (!pattern.test(text)) return;
  ws.write(path, text.replace(pattern, `'${newSlug}|`));
  plan.counts.set(path, (text.match(pattern) ?? []).length);
}

// ---------------------------------------------------------------------------
// The check that nothing was missed
// ---------------------------------------------------------------------------

function tokenPattern(slug: string): RegExp {
  // Case-sensitive on purpose: slugs are lower-case, and an external URL such as
  // `.../species/Macaria-notata` is the other site's name for the moth, not our slug.
  return new RegExp(`(^|[^a-z0-9-])${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9-])`);
}

/** Files under `dir` (one level, no recursion) whose names match. */
function listFiles(root: string, dir: string, test: (name: string) => boolean): string[] {
  const full = join(root, dir);
  if (!existsSync(full)) return [];
  return readdirSync(full, { withFileTypes: true })
    .filter((e) => e.isFile() && test(e.name))
    .map((e) => `${dir}/${e.name}`)
    .sort();
}

/**
 * Where does the old slug still appear, in files that should be free of it?
 * Regenerated files are skipped here and checked by the build that regenerates them.
 */
export function findOldSlug(ws: Workspace, oldSlug: string): string[] {
  const pattern = tokenPattern(oldSlug);
  const hits: string[] = [];
  const candidates = [
    ...listFiles(ws.root, 'data', (n) => /\.(csv|json)$/.test(n)),
    ...listFiles(ws.root, 'src/_data', (n) => /\.(json|ts)$/.test(n) && !n.endsWith('.test.ts')),
    ...listFiles(ws.root, 'scripts', (n) => n.endsWith('.ts') && !n.endsWith('.test.ts') && !n.startsWith('migrate-')),
  ];
  for (const path of candidates) {
    if (KEEPS_OLD_SLUG.has(path) || REGENERATED.has(path.split('/').pop() ?? '')) continue;
    if (path === 'scripts/rename-species.ts') continue; // its usage examples name real slugs
    if (path === 'data/checklist-order.csv') continue; // regenerated from species.csv, and re-keyed above
    let text = ws.read(path);
    const exempt = EXEMPT_COLUMNS[path];
    if (exempt) {
      text = editCsv(text, path, (rec) => { for (const c of exempt) rec[c] = ''; }).text;
    }
    if (path === 'data/species-photos.json') text = text.replace(/"species-tiles\/[^"]*"/g, '""');
    const isSource = path.endsWith('.ts');
    text.split('\n').forEach((line, i) => {
      // A comment in source can name a species as an example without depending on it.
      const t = line.trim();
      if (isSource && (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'))) return;
      if (pattern.test(line)) hits.push(`${path}:${i + 1}`);
    });
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Applying the plan
// ---------------------------------------------------------------------------

export function applyPlan(root: string, plan: RenamePlan): void {
  for (const [path, text] of plan.edits) writeFileSync(join(root, path), text);
  for (const { from, to } of plan.moves) renameSync(join(root, from), join(root, to));
}

function printPlan(plan: RenamePlan, dryRun: boolean): void {
  console.log(`${TAG} ${dryRun ? 'DRY RUN — ' : ''}${plan.oldSlug} → ${plan.newSlug} (${plan.newBinomial})`);
  for (const [path, n] of [...plan.counts].sort()) console.log(`  ${String(n).padStart(6)}  ${path}`);
  for (const { from, to } of plan.moves) console.log(`  move   ${from} → ${to}`);
  for (const note of plan.notes) console.log(`  note: ${note}`);
}

/** Regenerate the two committed files derived from the ones the rename edits. */
function regenerate(root: string): void {
  for (const script of ['scripts/build-checklist-order.ts', 'scripts/build-key.ts']) {
    console.log(`${TAG} running ${script}`);
    execFileSync(process.execPath, [script], { cwd: root, stdio: 'inherit' });
  }
}

export function parseArgs(argv: readonly string[]): RenameRequest {
  const positional: string[] = [];
  let reason: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--reason') reason = argv[++i];
    else if (arg.startsWith('--reason=')) reason = arg.slice('--reason='.length);
    else positional.push(arg);
  }
  const [oldSlug, target] = positional;
  if (!oldSlug || !target || positional.length > 2) {
    throw new Error(`usage: npm run species:rename -- <old-slug> "<New Genus> <new epithet>" [--reason "..."]`);
  }
  return { oldSlug, target, ...(reason ? { reason } : {}) };
}

export function main(argv: readonly string[] = process.argv.slice(2)): void {
  const request = parseArgs(argv);
  const dryRun = process.env['DRY_RUN'] === '1';
  const plan = planRename(ROOT, request);
  if (plan.status === 'already-renamed') {
    console.log(`${TAG} ${plan.newSlug} already exists and ${plan.oldSlug} does not; nothing to do.`);
    return;
  }
  printPlan(plan, dryRun);
  if (dryRun) return;
  applyPlan(ROOT, plan);
  regenerate(ROOT);
  console.log(`${TAG} done. Next: npm run build:site, then commit. Add a docs/curation-log.md entry if a curator ruled on this.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
}
