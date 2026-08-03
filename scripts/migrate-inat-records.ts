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
// The handover list comes from a LIVE fetch (computeHandoverIds), not from the
// committed data/inat-sync-report.csv. Two reasons. The sync refuses to emit an
// observation records.csv already cites, so a hand-entered record can never
// appear in records-inat.csv while its hand-entered row exists — keying off
// that file would deadlock and nothing would ever migrate. And the report is
// committed, so its mtime is the checkout time: a fresh clone or a `git switch`
// makes a months-old report look like it was written seconds ago, and deleting
// curator rows on that basis is unrecoverable. Asking iNaturalist directly
// makes the question unambiguous.
//
// Order of operations (the runbook spells this out):
//   1. npm run inat:migrate   removes the hand-entered rows
//   2. npm run inat:sync      imports them under the sync's ownership
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
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { isLineDeletionOnly } from './dedup-records.ts';
import { extractObservationIds } from './lib/inat.ts';
import { RECORDS_CSV_PATH } from './lib/records-source.ts';
import { computeHandoverIds } from './sync-inat-records.ts';
import type { RecordRow } from './lib/records-source.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RECORDS_PATH = resolve(ROOT, RECORDS_CSV_PATH);

export interface MigrationCandidate {
  /** 0-based index into the parsed records.csv rows. */
  index: number;
  row: RecordRow;
  /** The observation ids that row cites, all of which the sync will take. */
  inatIds: string[];
  /** Why it is being held back. Empty for rows that will be migrated. */
  blockedReason: string;
}

export interface MigrationPlan {
  /** Rows to keep, in original order. */
  kept: RecordRow[];
  /** Rows to delete, because the sync already carries the same observation. */
  migrated: MigrationCandidate[];
  /** Rows the sync would take, held back because they carry curator content. */
  blocked: MigrationCandidate[];
}

/**
 * True when a row is a plain iNaturalist photograph record — the only shape
 * the sync can faithfully reproduce.
 *
 * Four rows in data/records.csv cite an observation as DOCUMENTATION for a
 * record that is not the observation: three specimens (one of them a Canadian
 * National Collection specimen, `collection = CNC`) and one photograph whose
 * notes read "Record documented at: <url>". Migrating any of them would delete
 * a specimen and let the sync recreate it as
 * `record_type = photograph, collection = iNaturalist`, with the observer's
 * display name replacing the collector and the institutional attribution gone
 * — a change a reviewer would read as one line moving between two files.
 *
 * So the test is not "does it cite an observation" but "is the observation all
 * this row is". Notes must be the URL alone, optionally preceded by the
 * accuracy annotation the sync itself writes.
 */
export function isPlainInatPhotograph(row: RecordRow): boolean {
  if (row.record_type !== 'photograph') return false;
  if (row.collection !== '' && row.collection !== 'iNaturalist') return false;
  const notes = (row.notes ?? '').trim();
  const withoutAccuracy = notes.replace(/^locat(?:ion|ity) accuracy:[^;]*;\s*/i, '');
  return /^https?:\/\/(?:www\.)?inaturalist\.org\/observations\/\d+(?:#\S*)?$/.test(
    withoutAccuracy.trim(),
  );
}

/**
 * Columns a curator may have filled that the sync cannot reproduce, so a
 * handover would silently destroy them.
 *
 * `elevation_ft` is the whole list, and it is not hypothetical: the single
 * handover candidate in the project today is the Astoria *Lophocampa roseata*
 * record, carrying `elevation_ft = 230`. iNaturalist does not supply elevation,
 * so the sync writes that column blank unconditionally — the runbook says as
 * much. Migrating the row would drop 230 permanently, and because the
 * migration diff is deletions only, nothing about the change would look like a
 * loss to anyone reviewing it.
 *
 * Every other column the sync does populate: differently, sometimes (iNat's
 * `Mike Patterson` where the curator wrote `M. Patterson`), but the synced
 * value is the one that will stay current, which is the point of handing over.
 */
export const UNREPRODUCIBLE_COLUMNS: Array<keyof RecordRow> = ['elevation_ft'];

/** Columns of `row` that a handover would destroy, if any. */
export function unreproducibleValues(row: RecordRow): Array<keyof RecordRow> {
  return UNREPRODUCIBLE_COLUMNS.filter((c) => (row[c] ?? '').trim() !== '');
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
  const blocked: MigrationCandidate[] = [];

  records.forEach((row, index) => {
    const inatIds = extractObservationIds(row.notes);
    const takenOver = inatIds.length > 0 && inatIds.every((id) => handoverIds.has(id));
    if (!takenOver) {
      kept.push(row);
      return;
    }
    // Reported, never silently skipped: these are rows a maintainer might
    // reasonably expect to migrate, and the reasons they cannot are judgements
    // he may disagree with.
    if (!isPlainInatPhotograph(row)) {
      blocked.push({
        index,
        row,
        inatIds,
        blockedReason:
          'it cites an observation as documentation but is not itself a plain iNaturalist ' +
          'photograph — handing it over would replace it with one and lose the collection ' +
          'attribution',
      });
      kept.push(row);
      return;
    }
    const wouldLose = unreproducibleValues(row);
    if (wouldLose.length > 0) {
      blocked.push({
        index,
        row,
        inatIds,
        blockedReason:
          `it carries ${wouldLose.map((c) => `${c} = ${row[c]}`).join(', ')}, which ` +
          'iNaturalist does not supply — handing it over would erase that permanently',
      });
      kept.push(row);
      return;
    }
    migrated.push({ index, row, inatIds, blockedReason: '' });
  });

  return { kept, migrated, blocked };
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
  // Nothing to delete means nothing to rewrite. Running the round-trip anyway
  // would reject a CRLF records.csv with a byte-faithfulness error when the
  // honest answer is "there is nothing to migrate".
  if (plan.migrated.length === 0) return { output: raw, plan };
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

/** Accepted flags. An unrecognised one is an error, never a silent no-op. */
const MIGRATE_FLAGS = new Set(['--dry-run']);

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const unknown = argv.filter((a) => !MIGRATE_FLAGS.has(a));
  if (unknown.length > 0) {
    console.error(`Unrecognised option${unknown.length === 1 ? '' : 's'}: ${unknown.join(' ')}`);
    console.error('Usage: npm run inat:migrate [-- --dry-run]');
    process.exit(2);
  }
  const dryRun = argv.includes('--dry-run');

  console.log('Checking the iNaturalist project for records it can take over...');
  const handoverIds = await computeHandoverIds();
  if (handoverIds.size === 0) {
    console.log(
      'Nothing to migrate — no hand-entered record in records.csv has an observation the ' +
        'sync is currently able to import.',
    );
    return;
  }

  const raw = readFileSync(RECORDS_PATH, 'utf8');
  const { output, plan } = migrateCsv(raw, handoverIds);

  for (const held of plan.blocked) {
    console.warn(`Not migrating ${held.row.species_slug}: ${held.blockedReason}.`);
  }

  if (plan.migrated.length === 0) {
    console.log('Nothing to migrate.');
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
    'Now run "npm run inat:sync" — it will import the same observations, this time under ' +
      "the sync's ownership.",
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error((err as Error).message);
    process.exit(1);
  });
}
