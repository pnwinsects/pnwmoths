// scripts/migrate-inat-records.ts
// Hand an already-curated iNaturalist record over to the sync (GitHub #23).
//
// data/records.csv contains 145 iNaturalist observations the curator entered
// by hand over the years, long before this import existed. As those same
// observations are added to the iNaturalist project, each one ends up
// described in two places: once by hand, once by the sync. The sync refuses to
// emit an observation already cited in records.csv, so nothing is duplicated —
// but the hand-entered copy stays frozen while the synced copy would track
// iNaturalist's taxonomy.
//
// This script performs the handover: it deletes the hand-entered row from
// data/records.csv so the next sync can import the same observation. Net
// effect on the site is nil — the record does not disappear, it changes owner
// and becomes self-updating.
//
// It reads data/inat-sync-report.csv, NOT data/records-inat.csv. The sync
// refuses to emit an observation that records.csv already cites, so a
// hand-entered record can never appear in records-inat.csv while its
// hand-entered row exists — keying off that file would deadlock, and nothing
// would ever migrate. The report's `already-curated` rows are the sync saying
// "this observation is in the project and eligible; I am standing off because
// you have it by hand", which is exactly the handover signal.
//
// Order of operations (the runbook spells this out):
//   1. npm run inat:sync      writes the report
//   2. npm run inat:migrate   removes the hand-entered rows
//   3. npm run inat:sync      imports them under the sync's ownership
//
// Why this is a separate, deliberately-run script and not part of the sync:
// deleting from data/records.csv is a curator-file mutation, and it must be
// something a human chooses and reviews, not a side effect of fetching from a
// remote server.
//
// Why it does NOT bulk-migrate all 145: only observations the sync has
// actually seen in the project, and found eligible, are handed over. Of the
// 145, one qualifies today; 17 are `needs_id` and can never qualify under the
// project's research-grade-only rule; and two have identifications iNaturalist
// has moved to taxa with no page on this site. Deleting the hand-entered rows
// wholesale would destroy every one of those. Convergence on a single file
// therefore happens by PULL — a record migrates only once the sync has
// demonstrated it will take it.
//
//   node scripts/migrate-inat-records.ts [--dry-run]
//
// Idempotent: a second run finds nothing to do.
//
// Run: npm run inat:migrate
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { isLineDeletionOnly } from './dedup-records.ts';
import { extractObservationIds } from './lib/inat.ts';
import { RECORDS_CSV_PATH } from './lib/records-source.ts';
import type { RecordRow } from './lib/records-source.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RECORDS_PATH = resolve(ROOT, RECORDS_CSV_PATH);
const REPORT_PATH = resolve(ROOT, 'data/inat-sync-report.csv');

export interface MigrationCandidate {
  /** 0-based index into the parsed records.csv rows. */
  index: number;
  row: RecordRow;
  /** The observation ids that row cites, all of which the sync will take. */
  inatIds: string[];
}

export interface MigrationPlan {
  /** Rows to keep, in original order. */
  kept: RecordRow[];
  /** Rows to delete, because the sync already carries the same observation. */
  migrated: MigrationCandidate[];
}

/**
 * Decide which hand-entered rows the sync is ready to take over.
 *
 * A row qualifies only when it cites at least one observation id AND EVERY id
 * it cites was reported `already-curated` by the last sync. The all-or-nothing rule
 * matters for the handful of rows citing more than one observation: migrating
 * one whose second observation is not synced would silently drop that second
 * observation from the site.
 *
 * Nothing else about the row is considered. In particular the hand-entered
 * values are NOT compared against the synced ones — they routinely differ
 * (the curator writes `M. Patterson` where iNaturalist says `Mike Patterson`),
 * and the synced row is the one that will stay current.
 */
export function planMigration(
  records: RecordRow[],
  handoverIds: Set<string>,
): MigrationPlan {
  const kept: RecordRow[] = [];
  const migrated: MigrationCandidate[] = [];

  records.forEach((row, index) => {
    const inatIds = extractObservationIds(row.notes);
    const takenOver = inatIds.length > 0 && inatIds.every((id) => handoverIds.has(id));
    if (takenOver) migrated.push({ index, row, inatIds });
    else kept.push(row);
  });

  return { kept, migrated };
}

/**
 * Apply a migration to raw records.csv text, deletion-only.
 *
 * Shares scripts/dedup-records.ts's byte-faithfulness guard so the git diff is
 * pure deletions and the change stays reviewable (and revertible) by someone
 * reading the diff rather than trusting this script.
 *
 * @throws {Error} If deletion-only, byte-faithful output cannot be guaranteed.
 */
export function migrateCsv(
  raw: string,
  handoverIds: Set<string>,
): { output: string; plan: MigrationPlan } {
  const rows: RecordRow[] = parse(raw, { columns: true, skip_empty_lines: true });
  const [first] = rows;
  const columns = first ? Object.keys(first) : [];
  const plan = planMigration(rows, handoverIds);
  const output = stringify(plan.kept, { header: true, columns });
  if (!isLineDeletionOnly(raw, output)) {
    throw new Error(
      'Refusing to rewrite records.csv: the parse/stringify round-trip is not ' +
        'byte-faithful (the input may use CRLF line endings or contain blank ' +
        'lines). Re-save the file as UTF-8 with Unix (LF) line endings and no ' +
        'blank lines, then re-run.',
    );
  }
  return { output, plan };
}

/**
 * Observation ids the last sync reported as `already-curated` — the handover
 * worklist.
 */
export function readHandoverIds(reportPath: string = REPORT_PATH): Set<string> {
  if (!existsSync(reportPath)) return new Set();
  const rows = parse(readFileSync(reportPath), {
    columns: true,
    skip_empty_lines: true,
  }) as Array<{ inat_id: string; outcome: string }>;
  return new Set(
    rows.filter((r) => r.outcome === 'already-curated').map((r) => r.inat_id),
  );
}

export function main(argv: string[] = process.argv.slice(2)): void {
  const dryRun = argv.includes('--dry-run');

  const handoverIds = readHandoverIds();
  if (handoverIds.size === 0) {
    console.log(
      'Nothing to migrate — the last sync found no hand-entered record whose ' +
        'observation is also in the iNaturalist project. ' +
        '(Run "npm run inat:sync" first if you have not.)',
    );
    return;
  }

  const raw = readFileSync(RECORDS_PATH, 'utf8');
  const { output, plan } = migrateCsv(raw, handoverIds);

  if (plan.migrated.length === 0) {
    console.log('Nothing to migrate — those records are no longer in records.csv.');
    return;
  }

  console.log(
    `Handing ${plan.migrated.length} hand-entered record${plan.migrated.length === 1 ? '' : 's'} ` +
      `over to the iNaturalist sync:`,
  );
  for (const candidate of plan.migrated) {
    const { row } = candidate;
    const place = [row.locality, row.state].filter(Boolean).join(', ');
    console.log(`  - ${row.species_slug}  |  ${row.collector || 'unknown'}  |  ${place}`);
    for (const id of candidate.inatIds) {
      console.log(`      now maintained from https://www.inaturalist.org/observations/${id}`);
    }
  }

  if (dryRun) {
    console.log('--dry-run: nothing written.');
    return;
  }

  writeFileSync(RECORDS_PATH, output);
  console.log('');
  console.log(
    `Removed ${plan.migrated.length} row${plan.migrated.length === 1 ? '' : 's'} from ` +
      `${RECORDS_CSV_PATH}. Review with "git diff data/records.csv".`,
  );
  console.log(
    'Now run "npm run inat:sync" again — it will import the same observations, ' +
      'this time under the sync\'s ownership.',
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
