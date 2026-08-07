// scripts/check-referential-integrity.ts
// Pre-build gate: hard-fails (exit 1) when any file that references a species by
// slug references one that `data/species.csv` does not contain (#287).
// Run via: npm run build:check-integrity — BEFORE build:data, since an orphan slug
// is a data fault, not a build fault, and should be reported before anything is built.
//
// Why this exists: `species_slug` is the foreign key across every CSV (ADR 0010),
// but only ONE of its relations was enforced at build time — records → species, in
// build-data.ts. The rest were enforced in unit tests or not at all. The split was
// historical: every unguarded relation was added without anyone deciding not to
// check it, and #232 closed having asked for exactly this and got a derivative-
// manifest gate instead.
//
// An orphan slug fails silently by nature. The join produces nothing, the page
// renders without the thing, and no error is raised anywhere — which is how five
// tiled high-res photo sets (`macaria-*`, #279) and a whole species account
// (`lacinipolia-vicina`, #285) sat unreferenced without a single build complaining.
//
// FOUR THINGS CAN BE WRONG, reported apart because the fixes differ:
//   orphan    — the slug matches no species at all.
//   near-miss — it matches only after normalization. Consumers join on the RAW
//               cell (src/_data/images.ts, speciesLinks.ts and species.njk all use
//               exact string equality), so "aseptis-sp no 1" resolves to nothing
//               even though the species exists as "aseptis-sp-no-1". A gate that
//               normalized both sides would bless exactly the silent empty join it
//               is here to prevent.
//   duplicate — a one-row-per-species file names the same species twice.
//   empty     — a declared source exists but yields NO references. Almost always a
//               renamed column, a truncated file, or a UTF-8 BOM (which turns the
//               first header into a different string and makes every row read as
//               undefined). Without this, the gate passes having checked nothing —
//               the one failure it must never have.
//
// EXISTENCE, NOT VISIBILITY. A relation may legitimately point at a species that
// is gated — a deny-listed taxon still has images, records and Parquet on purpose
// (ADR 0015). This gate asserts the species.csv row EXISTS; check-withheld and
// check-unpublished own what is published.
//
// KNOWN EXCEPTIONS RATCHET. `data/referential-integrity-exceptions.csv` lists the
// violations that exist today, each with the issue that will resolve it. A new one
// fails the build; a listed one does not. A listed one that no longer describes a
// real violation ALSO fails, so the file cannot quietly accumulate stale entries —
// the point is to let the gate land while curator questions are open, not to make
// it optional. The key includes `kind`, so an orphan waiver cannot silently start
// excusing a duplicate of the same slug.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'csv-parse/sync';
import { normalizeSlug } from '../src/_lib/unpublished-species.ts';

/**
 * Shared parse options for every CSV this gate reads.
 *
 * `bom: true` is load-bearing, not defensive: Excel and Notepad on Windows prepend
 * a UTF-8 BOM, which without stripping becomes part of the first column's name and
 * makes every row's slug read as `undefined` — a relation that checks nothing while
 * reporting success. The same option for the same reason is in ingest-photos.ts,
 * build-key.ts and extract-species-plates.ts.
 *
 * `info: true` yields the real physical line for each record, so a blank line or a
 * quoted embedded newline (species.csv has them) cannot shift the numbers a failure
 * message reports.
 */
const CSV_OPTIONS = { columns: true, skip_empty_lines: true, bom: true, info: true } as const;

// ---------------------------------------------------------------------------
// The declared relations
// ---------------------------------------------------------------------------

/**
 * How a source names the species it references.
 *
 * - `csv-column`       — one slug per row in `column`.
 * - `csv-pipe-list`    — `column` holds a `|`-separated slug list (species.csv's `similar_species`).
 * - `json-keys`        — the object's keys are slugs (data/species-photos.json).
 * - `json-array`       — the document is an array of slug strings (src/_data/speciesSlugs.json).
 * - `json-array-field` — `arrayKey` holds objects; `column` names their slug field
 *                        (data/key-matrix.json `species[].slug`).
 * - `md-basenames`     — one Markdown file per species in the directory.
 */
export type RelationKind =
  | 'csv-column'
  | 'csv-pipe-list'
  | 'json-keys'
  | 'json-array'
  | 'json-array-field'
  | 'md-basenames';

export interface Relation {
  /** Stable identifier, unique across RELATIONS, used in the exceptions file and in output. */
  readonly name: string;
  /** Path to the CSV/JSON file, or the directory for `md-basenames`. */
  readonly path: string;
  readonly kind: RelationKind;
  /** Column (CSV) or object field (`json-array-field`) holding the slug(s). */
  readonly column?: string;
  /** For `json-array-field`: the top-level key holding the array. */
  readonly arrayKey?: string;
  /**
   * `unique` means no two references may name the same species — a per-species file
   * where a repeat is itself a fault. `repeated` means many per species is normal.
   *
   * Note that `unique` is unenforceable for `json-keys` (JSON.parse collapses repeated
   * keys before we see them) and `md-basenames` (a directory cannot hold two files with
   * one name). It is declared there to document intent; the duplicate check never fires.
   */
  readonly cardinality: 'unique' | 'repeated';
  /** What the relation is for, printed with any violation so the fix is obvious. */
  readonly note: string;
}

/**
 * Every place a species is referenced by slug.
 *
 * ADDING A FILE THAT NAMES SPECIES MEANS ADDING A LINE HERE. That is the whole
 * point: the failure mode this gate addresses is not a wrong check, it is a file
 * nobody thought to check. A test enforces it for `data/*.csv` and `data/*.json`.
 *
 * Deliberately absent:
 * - `data/records.csv` / `records-inat.csv` — build-data.ts already fails on orphaned
 *   records through DuckDB, over the unioned table, with the same semantics. Checking
 *   94k rows twice buys nothing.
 * - `data/records-derived-district.csv` — keyed by `row_index` into records.csv, and
 *   emit-records-district-audit.ts already fails on both coverage gaps and field
 *   divergence at a shared index, which is the stronger check.
 * - the one-shot run reports (`coord-fill-report`, `legacy-rejoin-report`,
 *   `inat-sync-report`, `records-bad*`) — historical records of what a script saw,
 *   not live references. They are expected to name species that have since changed.
 */
export const RELATIONS: readonly Relation[] = [
  {
    name: 'images.csv',
    path: 'data/images.csv',
    kind: 'csv-column',
    column: 'species_slug',
    cardinality: 'repeated',
    note: 'specimen photos; a row whose slug does not join renders nowhere',
  },
  {
    name: 'species-links.csv',
    path: 'data/species-links.csv',
    kind: 'csv-column',
    column: 'species_slug',
    cardinality: 'repeated',
    note: 'external reference links shown on the factsheet',
  },
  {
    name: 'species-plates.csv',
    path: 'data/species-plates.csv',
    kind: 'csv-column',
    column: 'species_slug',
    cardinality: 'unique',
    note: 'plate membership, one row per species',
  },
  {
    name: 'checklist-order.csv',
    path: 'data/checklist-order.csv',
    kind: 'csv-column',
    column: 'species_slug',
    cardinality: 'unique',
    note: 'taxonomic sequence for the Checklist page; regenerate with `node scripts/build-checklist-order.ts` rather than editing by hand (ADR 0030)',
  },
  {
    name: 'unpublished-species.csv',
    path: 'data/unpublished-species.csv',
    kind: 'csv-column',
    column: 'slug',
    cardinality: 'unique',
    note: 'display deny-list; check-unpublished.ts asserts the same thing and keeps doing so',
  },
  {
    name: 'species-synonyms.csv',
    path: 'data/species-synonyms.csv',
    kind: 'csv-column',
    column: 'to_species_slug',
    cardinality: 'repeated',
    note: 'synonym targets; several binomials may resolve to one species',
  },
  {
    name: 'species-redirects.csv',
    path: 'data/species-redirects.csv',
    kind: 'csv-column',
    column: 'new_slug',
    cardinality: 'repeated',
    note: 'redirect targets; a retired slug must land on a species that exists. Its old_slug is the INVERSE rule (must be absent) and is owned by speciesRedirects.test.ts',
  },
  {
    name: 'mpg-crosswalk.csv',
    path: 'data/mpg-crosswalk.csv',
    kind: 'csv-column',
    column: 'species_slug',
    cardinality: 'unique',
    note: 'hand-authored MPG matches for names the mechanical tiers missed',
  },
  {
    name: 'species.csv:similar_species',
    path: 'data/species.csv',
    kind: 'csv-pipe-list',
    column: 'similar_species',
    cardinality: 'repeated',
    note: 'cross-references between factsheets; species.njk matches on exact equality, so an unresolved entry renders nothing at all — no anchor, no error',
  },
  {
    name: 'species-photos.json',
    path: 'data/species-photos.json',
    kind: 'json-keys',
    cardinality: 'unique',
    note: 'high-res tile manifest; an unresolved key means tiles that can never be shown',
  },
  {
    name: 'key-matrix.json',
    path: 'data/key-matrix.json',
    kind: 'json-array-field',
    arrayKey: 'species',
    column: 'slug',
    cardinality: 'unique',
    note: 'committed Identify artifact; build-key.ts derives it from species.csv, so a failure here means the artifact is stale — re-run `npm run build:key` and commit (ADR 0017)',
  },
  {
    name: 'speciesSlugs.json',
    path: 'src/_data/speciesSlugs.json',
    kind: 'json-array',
    cardinality: 'unique',
    note: 'committed legacy-redirect slug list; speciesSlugs.test.ts owns the reverse direction (every species must appear here)',
  },
  {
    name: 'src/content/species',
    path: 'src/content/species',
    kind: 'md-basenames',
    cardinality: 'unique',
    note: 'species accounts; a file whose slug does not join is prose no page can reach',
  },
];

// ---------------------------------------------------------------------------
// Reading references
// ---------------------------------------------------------------------------

/** One slug reference, kept with enough context to name it in a failure. */
export interface Reference {
  /** The slug exactly as written in the source, before any normalization. */
  readonly raw: string;
  /** Physical line in the file, for CSV sources. */
  readonly line?: number;
}

function parseFailure(path: string, e: unknown): Error {
  return new Error(
    `[check-referential-integrity] cannot parse ${path}: ${(e as Error).message}`,
    { cause: e },
  );
}

/** csv-parse's `info: true` record shape, narrowed to the field we use. */
interface CsvRecord {
  readonly record: Record<string, string>;
  readonly info: { readonly lines: number };
}

function parseCsv(path: string, full: string): CsvRecord[] {
  try {
    // csv-parse's sync `parse` is generic over the record type, so the shape is
    // declared rather than asserted — no cast, and a wrong field name is a type error.
    return parse<CsvRecord>(readFileSync(full), CSV_OPTIONS);
  } catch (e) {
    throw parseFailure(path, e);
  }
}

/**
 * Read every species reference a relation makes.
 *
 * Returns null when the source is absent. Every declared relation's file exists
 * today and a test asserts that it stays that way; the null branch is what keeps a
 * deleted file from crashing the gate instead of being reported.
 */
export function readReferences(relation: Relation, root = '.'): Reference[] | null {
  const full = resolve(root, relation.path);
  if (!existsSync(full)) return null;

  const readJson = (): unknown => {
    try {
      return JSON.parse(readFileSync(full, 'utf8'));
    } catch (e) {
      throw parseFailure(relation.path, e);
    }
  };

  switch (relation.kind) {
    case 'csv-column':
    case 'csv-pipe-list': {
      const column = relation.column;
      if (column === undefined) {
        throw new Error(`[check-referential-integrity] relation "${relation.name}" is a CSV kind with no column`);
      }
      const refs: Reference[] = [];
      for (const { record, info } of parseCsv(relation.path, full)) {
        const cell = record[column];
        if (cell === undefined || cell.trim() === '') continue;
        const parts = relation.kind === 'csv-pipe-list' ? cell.split('|') : [cell];
        for (const part of parts) {
          if (part.trim() !== '') refs.push({ raw: part, line: info.lines });
        }
      }
      return refs;
    }
    case 'json-keys': {
      const parsed = readJson();
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error(`[check-referential-integrity] ${relation.path} is not a JSON object`);
      }
      return Object.keys(parsed).map((raw) => ({ raw }));
    }
    case 'json-array': {
      const parsed = readJson();
      if (!Array.isArray(parsed) || parsed.some((v) => typeof v !== 'string')) {
        throw new Error(`[check-referential-integrity] ${relation.path} is not a JSON array of strings`);
      }
      return (parsed as string[]).map((raw) => ({ raw }));
    }
    case 'json-array-field': {
      const { arrayKey, column } = relation;
      if (arrayKey === undefined || column === undefined) {
        throw new Error(
          `[check-referential-integrity] relation "${relation.name}" needs both arrayKey and column`,
        );
      }
      const parsed = readJson();
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error(`[check-referential-integrity] ${relation.path} is not a JSON object`);
      }
      const arr = (parsed as Record<string, unknown>)[arrayKey];
      if (!Array.isArray(arr)) {
        throw new Error(`[check-referential-integrity] ${relation.path} has no array at "${arrayKey}"`);
      }
      // Strict like `json-array`, not lenient like the CSV kinds: this file is a
      // generated artifact, so an entry without a usable slug is corruption, and
      // skipping it would shrink the checked set while the gate still passed.
      const refs: Reference[] = [];
      for (const [i, entry] of arr.entries()) {
        if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
          throw new Error(
            `[check-referential-integrity] ${relation.path}: ${arrayKey}[${i}] is not an object`,
          );
        }
        const value = (entry as Record<string, unknown>)[column];
        if (typeof value !== 'string' || value.trim() === '') {
          throw new Error(
            `[check-referential-integrity] ${relation.path}: ${arrayKey}[${i}] has a missing, ` +
              `non-string, or blank "${column}"`,
          );
        }
        refs.push({ raw: value });
      }
      return refs;
    }
    case 'md-basenames': {
      return readdirSync(full, { withFileTypes: true })
        .filter((e) => e.isFile() && e.name.endsWith('.md'))
        .map((e) => ({ raw: basename(e.name, '.md') }));
    }
  }
}

// ---------------------------------------------------------------------------
// The species side
// ---------------------------------------------------------------------------

/**
 * The two forms of the species key.
 *
 * `site` is what the built site actually uses: `src/_data/species.ts` derives it in
 * SQL as `replace(lower(genus || '-' || species), ' ', '-')`, and every consumer
 * compares raw strings against it. References are checked against THIS set.
 *
 * `normalized` additionally collapses whitespace runs and trims, via normalizeSlug.
 * A reference absent from `site` but present here is a near-miss: the species exists,
 * and the reference will still join to nothing.
 */
export interface SpeciesKeys {
  readonly site: Set<string>;
  readonly normalized: Set<string>;
}

export function loadSpeciesSlugs(root = '.'): SpeciesKeys {
  const path = 'data/species.csv';
  const full = resolve(root, path);
  if (!existsSync(full)) {
    throw new Error(
      `[check-referential-integrity] ${path} not found — there is nothing to check references against`,
    );
  }
  const site = new Set<string>();
  const normalized = new Set<string>();
  for (const { record } of parseCsv(path, full)) {
    const binomial = `${record['genus'] ?? ''}-${record['species'] ?? ''}`;
    site.add(binomial.toLowerCase().replaceAll(' ', '-'));
    normalized.add(normalizeSlug(binomial));
  }
  return { site, normalized };
}

// ---------------------------------------------------------------------------
// The pure check
// ---------------------------------------------------------------------------

export type ViolationKind = 'orphan' | 'near-miss' | 'duplicate' | 'empty';

export interface Violation {
  readonly relation: string;
  readonly kind: ViolationKind;
  /** The slug at fault, as written. Empty for `empty`, which is about the file. */
  readonly slug: string;
  /** The form it would take after normalization, when that differs. */
  readonly normalized?: string;
  /** Every physical line it appears on, for CSV sources. */
  readonly lines?: number[];
  /** How many references name this slug in the relation. */
  readonly count: number;
}

/** An entry in `data/referential-integrity-exceptions.csv`. */
export interface Exception {
  readonly relation: string;
  readonly slug: string;
  readonly kind: ViolationKind;
  readonly issue: string;
}

export interface IntegrityReport {
  /** Violations with no matching exception. Non-empty means fail. */
  readonly violations: Violation[];
  /** Exceptions that matched a real violation — expected, reported for visibility. */
  readonly excused: Violation[];
  /**
   * Exceptions matching nothing: the fault was fixed and the line was left behind,
   * or two lines describe the same one. Also a failure, so the file shrinks.
   */
  readonly staleExceptions: Exception[];
  /** Relations whose source file is absent. */
  readonly skipped: string[];
  readonly checkedReferences: number;
}

function exceptionKey(relation: string, slug: string, kind: ViolationKind): string {
  // JSON-encoded triple rather than a delimiter-joined string: a raw slug may contain
  // spaces (the pre-normalization form of a provisional epithet), so any single-character
  // separator could make two different triples collide.
  return JSON.stringify([relation, slug, kind]);
}

/**
 * Compare every declared relation against the species keys.
 *
 * Pure: takes the already-read references so it is testable without a filesystem.
 * `references` maps relation name to its refs, or null for an absent source.
 */
export function findViolations(
  species: SpeciesKeys,
  references: ReadonlyMap<string, Reference[] | null>,
  exceptions: readonly Exception[],
  relations: readonly Relation[] = RELATIONS,
): IntegrityReport {
  const duplicateNames = [...new Set(
    relations.map((r) => r.name).filter((name, i, all) => all.indexOf(name) !== i),
  )];
  if (duplicateNames.length > 0) {
    // Two relations sharing a name collide in the references map: the last write
    // wins and the other is silently checked against the wrong file's references.
    throw new Error(
      `[check-referential-integrity] duplicate relation name(s): ${duplicateNames.join(', ')}`,
    );
  }

  const violations: Violation[] = [];
  const excused: Violation[] = [];
  const skipped: string[] = [];
  let checkedReferences = 0;

  // How many exception lines exist per key, and how many real violations each key
  // matched. Counting rather than set-membership is what makes a DUPLICATED waiver
  // line report as stale: one line is consumed by the violation, the copy is not.
  const available = new Map<string, number>();
  for (const e of exceptions) {
    const key = exceptionKey(e.relation, e.slug, e.kind);
    available.set(key, (available.get(key) ?? 0) + 1);
  }
  const matched = new Map<string, number>();

  const record = (v: Violation): void => {
    const key = exceptionKey(v.relation, v.slug, v.kind);
    if ((available.get(key) ?? 0) > 0) {
      matched.set(key, (matched.get(key) ?? 0) + 1);
      excused.push(v);
    } else {
      violations.push(v);
    }
  };

  for (const relation of relations) {
    const refs = references.get(relation.name);
    if (refs === null || refs === undefined) {
      skipped.push(relation.name);
      continue;
    }

    if (refs.length === 0) {
      // A declared source that yields nothing is the gate's own worst failure: it
      // reports success having checked nothing. Renamed column, truncated file, BOM.
      record({ relation: relation.name, kind: 'empty', slug: '', count: 0 });
      continue;
    }

    // Group by the raw form: the unit of a fault is a slug, not a row. #232's 83
    // broken images spanned 27 species, and reporting per row would have made one
    // problem look three times its size.
    const seen = new Map<string, { lines: number[]; count: number }>();
    for (const ref of refs) {
      checkedReferences++;
      const entry = seen.get(ref.raw) ?? { lines: [], count: 0 };
      entry.count++;
      if (ref.line !== undefined) entry.lines.push(ref.line);
      seen.set(ref.raw, entry);
    }

    for (const [raw, { lines, count }] of seen) {
      const common = {
        relation: relation.name,
        slug: raw,
        count,
        ...(lines.length > 0 ? { lines } : {}),
      };
      if (!species.site.has(raw)) {
        const normalized = normalizeSlug(raw);
        // Consumers join on the raw cell, so a slug that only resolves after
        // normalization joins to nothing — reported apart from a true orphan
        // because the fix is to correct the reference, not to add a species.
        record(
          species.normalized.has(normalized)
            ? { ...common, kind: 'near-miss', normalized }
            : { ...common, kind: 'orphan' },
        );
        continue;
      }
      if (relation.cardinality === 'unique' && count > 1) {
        record({ ...common, kind: 'duplicate' });
      }
    }
  }

  // Walk the exceptions in file order, letting each key consume as many lines as it
  // matched violations. Whatever is left over is stale: a fault that was fixed, or a
  // copy-pasted line.
  const unconsumed = new Map(matched);
  const staleExceptions = exceptions.filter((e) => {
    const key = exceptionKey(e.relation, e.slug, e.kind);
    const left = unconsumed.get(key) ?? 0;
    if (left > 0) {
      unconsumed.set(key, left - 1);
      return false;
    }
    return true;
  });

  return { violations, excused, staleExceptions, skipped, checkedReferences };
}

const VIOLATION_KINDS: readonly ViolationKind[] = ['orphan', 'near-miss', 'duplicate', 'empty'];

function isViolationKind(value: string): value is ViolationKind {
  return (VIOLATION_KINDS as readonly string[]).includes(value);
}

/**
 * Load the known-exceptions ratchet.
 *
 * A missing file means "no exceptions" rather than an error: deleting it is a
 * legitimate way to demand a fully clean tree. A malformed one is reported by name —
 * this is the file a curator hand-edits, and its `issue` column is free prose, so an
 * unquoted comma is a matter of time.
 *
 * Duplicate lines are kept rather than deduplicated: findViolations matches one
 * exception per violation, so extra copies surface as stale and get deleted.
 */
export function loadExceptions(root = '.'): Exception[] {
  const path = 'data/referential-integrity-exceptions.csv';
  const full = resolve(root, path);
  if (!existsSync(full)) return [];
  let rows: Array<Record<string, string>>;
  try {
    rows = parse<Record<string, string>>(readFileSync(full), {
      columns: true,
      skip_empty_lines: true,
      bom: true,
    });
  } catch (e) {
    throw parseFailure(path, e);
  }
  return rows
    .filter((r) => (r['relation'] ?? '').trim() !== '' && (r['slug'] ?? '').trim() !== '')
    .map((r) => {
      const relation = (r['relation'] ?? '').trim();
      // A typo'd relation would otherwise surface as a STALE EXCEPTION, which tells
      // the maintainer the violation was fixed when really the waiver names nothing.
      if (!RELATIONS.some((rel) => rel.name === relation)) {
        throw new Error(
          `[check-referential-integrity] ${path}: unknown relation "${relation}" for ` +
            `"${(r['slug'] ?? '').trim()}" — expected one of ${RELATIONS.map((rel) => rel.name).join(', ')}`,
        );
      }
      const kind = (r['kind'] ?? '').trim();
      if (!isViolationKind(kind)) {
        throw new Error(
          `[check-referential-integrity] ${path}: unknown kind "${kind}" for ` +
            `"${relation} ${(r['slug'] ?? '').trim()}" — expected one of ${VIOLATION_KINDS.join(', ')}`,
        );
      }
      return {
        relation,
        slug: (r['slug'] ?? '').trim(),
        kind,
        issue: (r['issue'] ?? '').trim(),
      };
    });
}

// ---------------------------------------------------------------------------
// CLI entry-point
// ---------------------------------------------------------------------------

function noteFor(relationName: string): string {
  return RELATIONS.find((r) => r.name === relationName)?.note ?? '';
}

function describe(v: Violation): string {
  const where =
    v.lines === undefined || v.lines.length === 0
      ? ''
      : ` (line${v.lines.length > 1 ? 's' : ''} ${v.lines.slice(0, 6).join(', ')}` +
        `${v.lines.length > 6 ? `, +${v.lines.length - 6} more` : ''})`;
  const times = v.count > 1 ? `, ${v.count} references` : '';
  const head = `  ${v.relation} — `;
  switch (v.kind) {
    case 'empty':
      return `${head}the file exists but yields NO references. Renamed column, truncated file, or a UTF-8 BOM.\n      ${noteFor(v.relation)}`;
    case 'near-miss':
      return `${head}"${v.slug}" resolves only after normalization, to "${v.normalized}"${times}${where}.\n      Consumers join on the raw value, so this reference joins to nothing. Write "${v.normalized}".`;
    case 'duplicate':
      return `${head}"${v.slug}" appears ${v.count}× in a one-row-per-species file${where}.\n      ${noteFor(v.relation)}`;
    case 'orphan':
      return `${head}"${v.slug}" has no data/species.csv row${times}${where}.\n      ${noteFor(v.relation)}`;
  }
}

function main(): void {
  let species: SpeciesKeys;
  let exceptions: Exception[];
  const references = new Map<string, Reference[] | null>();
  try {
    species = loadSpeciesSlugs();
    exceptions = loadExceptions();
    for (const relation of RELATIONS) {
      references.set(relation.name, readReferences(relation));
    }
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }

  const report = findViolations(species, references, exceptions);

  for (const name of report.skipped) {
    console.warn(`[check-referential-integrity] ${name} not found — relation skipped`);
  }

  if (report.staleExceptions.length > 0) {
    console.error(
      `[check-referential-integrity] STALE EXCEPTIONS: ${report.staleExceptions.length} line(s) in ` +
        `data/referential-integrity-exceptions.csv no longer describe a real violation. ` +
        `The fault was fixed, or the line is a duplicate — delete it:\n` +
        report.staleExceptions
          .map((e) => `  ${e.relation} — ${e.kind} "${e.slug}" (${e.issue})`)
          .join('\n'),
    );
  }

  if (report.violations.length > 0) {
    console.error(
      `[check-referential-integrity] FAILED: ${report.violations.length} violation(s):\n` +
        report.violations.map(describe).join('\n') +
        `\n\nEvery slug must match a data/species.csv row exactly — see ADR 0010. Fix the reference, ` +
        `add the species, or (only for a documented curator question) add a line to ` +
        `data/referential-integrity-exceptions.csv naming the issue that will resolve it.`,
    );
  }

  if (report.violations.length > 0 || report.staleExceptions.length > 0) {
    process.exit(1);
  }

  const excusedNote = report.excused.length > 0 ? `, ${report.excused.length} known exception(s)` : '';
  console.log(
    `[check-referential-integrity] PASS: ${report.checkedReferences} references across ` +
      `${RELATIONS.length - report.skipped.length} relations resolve to ${species.site.size} species${excusedNote}`,
  );
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
