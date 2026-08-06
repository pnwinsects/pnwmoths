// scripts/check-referential-integrity.ts
// Pre-build gate: hard-fails (exit 1) when any file that references a species by
// slug references one that `data/species.csv` does not contain (#287).
// Run via: npm run build:check-integrity — BEFORE build:data, since an orphan slug
// is a data fault, not a build fault, and should be reported before anything is built.
//
// Why this exists: `species_slug` is the foreign key across every CSV (ADR 0010),
// but only ONE of its relations was ever enforced at build time — records → species,
// in build-data.ts. The rest were enforced in unit tests (speciesSlugs, redirects,
// checklist order) or not at all (images, links, plates, synonyms, crosswalk,
// similar_species, the content directory, the photo manifest). The split was
// historical: every unguarded relation was added without anyone deciding not to
// check it, and #232 closed having asked for exactly this and got a derivative-
// manifest gate instead.
//
// An orphan slug fails silently by nature. The join produces nothing, the page
// renders without the thing, and no error is raised anywhere — which is how five
// tiled high-res photo sets (`macaria-*`, #279) and a whole species account
// (`lacinipolia-vicina`, #285) sat unreferenced without a single build complaining.
//
// EXISTENCE, NOT VISIBILITY. A relation may legitimately point at a species that
// is gated — a deny-listed taxon still has images, records and Parquet on purpose
// (ADR 0015). This gate asserts the species.csv row EXISTS; check-withheld and
// check-unpublished own what is published.
//
// KNOWN EXCEPTIONS RATCHET. `data/referential-integrity-exceptions.csv` lists the
// orphans that exist today, each with the issue that will resolve it. A new orphan
// fails the build; a listed one does not. A listed one that is no longer an orphan
// ALSO fails, so the file cannot quietly accumulate stale entries — the point is to
// let the gate land while curator questions are open, not to make it optional.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'csv-parse/sync';
import { normalizeSlug } from '../src/_lib/unpublished-species.ts';

// ---------------------------------------------------------------------------
// The declared relations
// ---------------------------------------------------------------------------

/**
 * How a source names the species it references.
 *
 * - `csv-column`    — one slug per row in `column`.
 * - `csv-pipe-list` — `column` holds a `|`-separated slug list (species.csv's `similar_species`).
 * - `json-keys`     — the object's keys are slugs (data/species-photos.json).
 * - `md-basenames`  — one Markdown file per species in `dir` (src/content/species).
 */
export type RelationKind = 'csv-column' | 'csv-pipe-list' | 'json-keys' | 'md-basenames';

export interface Relation {
  /** Stable identifier used in the exceptions file and in failure output. */
  readonly name: string;
  /** Path to the CSV/JSON file, or the directory for `md-basenames`. */
  readonly path: string;
  readonly kind: RelationKind;
  /** Column holding the slug(s). Required for the two CSV kinds. */
  readonly column?: string;
  /**
   * `unique` means no two rows may name the same species — a per-species file
   * (one plate row, one deny-list row) where a duplicate is itself a fault.
   * `repeated` means many rows per species is normal (images, records, links).
   */
  readonly cardinality: 'unique' | 'repeated';
  /** Why this relation exists, for whoever reads a failure. */
  readonly note: string;
}

/**
 * Every place a species is referenced by slug.
 *
 * ADDING A DATA FILE THAT NAMES SPECIES MEANS ADDING A LINE HERE. That is the
 * whole point: the failure mode this gate addresses is not a wrong check, it is a
 * file nobody thought to check.
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
    note: 'specimen photos; an orphan row renders nowhere and #232 found 83 of them',
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
    note: 'taxonomic sequence for the Checklist page (ADR 0030)',
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
    note: 'redirect targets; a retired slug must land on a species that exists',
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
    note: 'cross-references between factsheets; an orphan renders a dead link',
  },
  {
    name: 'species-photos.json',
    path: 'data/species-photos.json',
    kind: 'json-keys',
    cardinality: 'unique',
    note: 'high-res tile manifest; an orphan key means tiles that can never be shown',
  },
  {
    name: 'src/content/species',
    path: 'src/content/species',
    kind: 'md-basenames',
    cardinality: 'unique',
    note: 'species accounts; an orphan file is prose that no page can reach',
  },
];

// ---------------------------------------------------------------------------
// Reading references
// ---------------------------------------------------------------------------

/** One slug reference, kept with enough context to name it in a failure. */
export interface Reference {
  /** The slug as written in the source, before normalization. */
  readonly raw: string;
  /** 1-based line number for CSVs (header is line 1), or undefined otherwise. */
  readonly line?: number;
}

/**
 * Read every species reference a relation makes.
 *
 * A missing source is not a failure: `data/records-inat.csv` is absent until the
 * first sync, and a gate that fails on an optional file fails for the wrong reason.
 * Callers get an empty list and the CLI reports the file as skipped.
 */
export function readReferences(relation: Relation, root = '.'): Reference[] | null {
  const full = resolve(root, relation.path);
  if (!existsSync(full)) return null;

  switch (relation.kind) {
    case 'csv-column':
    case 'csv-pipe-list': {
      const column = relation.column;
      if (column === undefined) {
        throw new Error(`[check-referential-integrity] relation "${relation.name}" is a CSV kind with no column`);
      }
      // This gate runs before build-data.ts, so it is the first thing to touch these
      // files: a malformed CSV must produce a readable failure naming the file, not a
      // csv-parse stack trace about a column count.
      let rows: Array<Record<string, string>>;
      try {
        rows = parse(readFileSync(full), { columns: true, skip_empty_lines: true }) as Array<Record<string, string>>;
      } catch (e) {
        throw new Error(
          `[check-referential-integrity] cannot parse ${relation.path}: ${(e as Error).message}`,
          { cause: e },
        );
      }
      const refs: Reference[] = [];
      rows.forEach((row, i) => {
        const cell = row[column];
        if (cell === undefined || cell.trim() === '') return;
        const line = i + 2; // header occupies line 1
        if (relation.kind === 'csv-pipe-list') {
          for (const part of cell.split('|')) {
            if (part.trim() !== '') refs.push({ raw: part, line });
          }
        } else {
          refs.push({ raw: cell, line });
        }
      });
      return refs;
    }
    case 'json-keys': {
      let parsed: unknown;
      try {
        parsed = JSON.parse(readFileSync(full, 'utf8'));
      } catch (e) {
        throw new Error(
          `[check-referential-integrity] cannot parse ${relation.path}: ${(e as Error).message}`,
          { cause: e },
        );
      }
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error(`[check-referential-integrity] ${relation.path} is not a JSON object`);
      }
      return Object.keys(parsed).map((raw) => ({ raw }));
    }
    case 'md-basenames': {
      return readdirSync(full, { withFileTypes: true })
        .filter((e) => e.isFile() && e.name.endsWith('.md'))
        .map((e) => ({ raw: basename(e.name, '.md') }));
    }
  }
}

/**
 * Species slugs from `data/species.csv`, normalized.
 *
 * Derived here rather than imported so the gate depends on the CSV and not on a
 * committed artifact that could itself be stale — `src/_data/speciesSlugs.json`
 * is checked against this same file by its own test.
 */
export function loadSpeciesSlugs(root = '.'): Set<string> {
  const rows = parse(readFileSync(resolve(root, 'data/species.csv')), {
    columns: true,
    skip_empty_lines: true,
  }) as Array<{ genus: string; species: string }>;
  return new Set(rows.map((r) => normalizeSlug(`${r.genus}-${r.species}`)));
}

// ---------------------------------------------------------------------------
// The pure check
// ---------------------------------------------------------------------------

export interface Violation {
  readonly relation: string;
  readonly kind: 'orphan' | 'duplicate';
  /** The normalized slug at fault. */
  readonly slug: string;
  /** As first written in the source, when it differs from the normalized form. */
  readonly raw: string;
  /**
   * Every line the slug appears on (CSV sources only), so a fault that spans rows
   * is one violation naming all of them.
   *
   * One missing species is ONE fault, however many rows reference it: #232's 83
   * broken images spanned 27 species, and reporting 83 violations would have made
   * the same problem look three times bigger than it was.
   */
  readonly lines?: number[];
  /** How many references name this slug in the relation. */
  readonly count: number;
}

/** An entry in `data/referential-integrity-exceptions.csv`. */
export interface Exception {
  readonly relation: string;
  readonly slug: string;
  readonly issue: string;
}

export interface IntegrityReport {
  /** Violations with no matching exception. Non-empty means fail. */
  readonly violations: Violation[];
  /** Exceptions that matched a real violation — expected, and reported for visibility. */
  readonly excused: Violation[];
  /**
   * Exceptions matching nothing: the orphan was fixed and the line was left behind.
   * Also a failure, so the file shrinks as the questions get answered.
   */
  readonly staleExceptions: Exception[];
  /** Relations whose source file is absent. */
  readonly skipped: string[];
  readonly checkedReferences: number;
}

function exceptionKey(relation: string, slug: string): string {
  return `${relation} ${slug}`;
}

/**
 * Compare every declared relation against the species set.
 *
 * Pure: takes the already-read references so it is testable without a filesystem.
 * `references` maps relation name → refs, or null for an absent source.
 */
export function findViolations(
  speciesSlugs: Set<string>,
  references: ReadonlyMap<string, Reference[] | null>,
  exceptions: readonly Exception[],
  relations: readonly Relation[] = RELATIONS,
): IntegrityReport {
  const violations: Violation[] = [];
  const excused: Violation[] = [];
  const skipped: string[] = [];
  const matchedExceptions = new Set<string>();
  let checkedReferences = 0;

  for (const relation of relations) {
    const refs = references.get(relation.name);
    if (refs === null || refs === undefined) {
      skipped.push(relation.name);
      continue;
    }

    // Group by normalized slug first: the unit of a fault is a slug, not a row.
    const seen = new Map<string, { raw: string; lines: number[]; count: number }>();
    for (const ref of refs) {
      checkedReferences++;
      const slug = normalizeSlug(ref.raw);
      const entry = seen.get(slug) ?? { raw: ref.raw, lines: [], count: 0 };
      entry.count++;
      if (ref.line !== undefined) entry.lines.push(ref.line);
      seen.set(slug, entry);
    }

    const record = (violation: Violation): void => {
      const key = exceptionKey(relation.name, violation.slug);
      if (exceptions.some((e) => exceptionKey(e.relation, e.slug) === key)) {
        matchedExceptions.add(key);
        excused.push(violation);
      } else {
        violations.push(violation);
      }
    };

    for (const [slug, { raw, lines, count }] of seen) {
      const common = { relation: relation.name, slug, raw, count, ...(lines.length > 0 ? { lines } : {}) };
      if (!speciesSlugs.has(slug)) {
        record({ ...common, kind: 'orphan' });
        continue; // An orphan that also duplicates is still one missing species.
      }
      if (relation.cardinality === 'unique' && count > 1) {
        record({ ...common, kind: 'duplicate' });
      }
    }
  }

  const staleExceptions = exceptions.filter(
    (e) => !matchedExceptions.has(exceptionKey(e.relation, e.slug)),
  );

  return { violations, excused, staleExceptions, skipped, checkedReferences };
}

/**
 * Load the known-exceptions ratchet.
 *
 * A missing file means "no exceptions" rather than an error: deleting it is a
 * legitimate way to demand a fully clean tree.
 */
export function loadExceptions(root = '.'): Exception[] {
  const full = resolve(root, 'data/referential-integrity-exceptions.csv');
  if (!existsSync(full)) return [];
  const rows = parse(readFileSync(full), { columns: true, skip_empty_lines: true }) as Array<{
    relation: string;
    slug: string;
    issue: string;
  }>;
  return rows
    .filter((r) => (r.relation ?? '').trim() !== '' && (r.slug ?? '').trim() !== '')
    .map((r) => ({ relation: r.relation.trim(), slug: normalizeSlug(r.slug), issue: (r.issue ?? '').trim() }));
}

// ---------------------------------------------------------------------------
// CLI entry-point
// ---------------------------------------------------------------------------

function describe(v: Violation): string {
  const where = v.lines === undefined || v.lines.length === 0
    ? ''
    : ` (line${v.lines.length > 1 ? 's' : ''} ${v.lines.slice(0, 6).join(', ')}${v.lines.length > 6 ? `, +${v.lines.length - 6} more` : ''})`;
  if (v.kind === 'duplicate') {
    return `  ${v.relation} — "${v.slug}" appears ${v.count}× in a one-row-per-species file${where}`;
  }
  const asWritten = v.raw === v.slug ? '' : ` written "${v.raw}"`;
  const times = v.count > 1 ? `, ${v.count} references` : '';
  return `  ${v.relation} — "${v.slug}"${asWritten} has no data/species.csv row${times}${where}`;
}

function main(): void {
  const speciesSlugs = loadSpeciesSlugs();
  const exceptions = loadExceptions();

  const references = new Map<string, Reference[] | null>();
  for (const relation of RELATIONS) {
    try {
      references.set(relation.name, readReferences(relation));
    } catch (e) {
      console.error((e as Error).message);
      process.exit(1);
    }
  }

  const report = findViolations(speciesSlugs, references, exceptions);

  for (const name of report.skipped) {
    console.warn(`[check-referential-integrity] ${name} not found — relation skipped`);
  }

  if (report.staleExceptions.length > 0) {
    console.error(
      `[check-referential-integrity] STALE EXCEPTIONS: ${report.staleExceptions.length} line(s) in ` +
        `data/referential-integrity-exceptions.csv no longer describe a real violation. ` +
        `The fault was fixed — delete the line:\n` +
        report.staleExceptions.map((e) => `  ${e.relation} — "${e.slug}" (${e.issue})`).join('\n'),
    );
  }

  if (report.violations.length > 0) {
    console.error(
      `[check-referential-integrity] FAILED: ${report.violations.length} reference(s) to species ` +
        `that data/species.csv does not contain:\n` +
        report.violations.map(describe).join('\n') +
        `\n\nEvery slug must match a data/species.csv row — see ADR 0010. Fix the reference, add the ` +
        `species, or (only for a documented curator question) add a line to ` +
        `data/referential-integrity-exceptions.csv naming the issue that will resolve it.`,
    );
  }

  if (report.violations.length > 0 || report.staleExceptions.length > 0) {
    process.exit(1);
  }

  const excusedNote = report.excused.length > 0 ? `, ${report.excused.length} known exception(s)` : '';
  console.log(
    `[check-referential-integrity] PASS: ${report.checkedReferences} references across ` +
      `${RELATIONS.length - report.skipped.length} relations resolve to ${speciesSlugs.size} species${excusedNote}`,
  );
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
