# 0044. Every occurrence record carries a stable `record_id`, minted by a maintainer script

**Status:** Accepted · Closes [#178](https://github.com/pnwinsects/pnwmoths/issues/178) · Extends [ADR 0002](0002-flat-files-over-cms.md)

## Context

`data/records.csv` had no per-record identity. A row was distinguished only by its fourteen
curator-entered fields, and 14,217 rows share those fields with at least one other row —
two specimens from the same site on the same night with the same collector are two records,
and nothing in the file said so. Two consequences ([#178](https://github.com/pnwinsects/pnwmoths/issues/178)):
the duplicate purge ([#173](https://github.com/pnwinsects/pnwmoths/issues/173)) can only be
a heuristic, and nothing can refer to a record — not a correction, not a re-upload, not
`data/records-derived-district.csv`, which is keyed by *row index* into the file and goes
stale the moment a row above it is deleted.

The legacy database had an id per record, and the curator suggested it might carry over.
It does not: the export dropped it, and the rows have since been deduplicated, county-
backfilled and clipped, so a field-by-field join back to the reference MySQL container
(which is not on every maintainer's machine) would be lossy at best.

## Decision

- **A `record_id` column, last in `data/records.csv`.** An opaque positive integer,
  unique within the file, assigned once and never changed, renumbered or reused. A purged
  row's id stays retired. It is source data, not a derived column: once written it is part
  of the record's identity.
- **Minted by `npm run records:assign-ids`**, which fills every blank cell with the next
  integer above the file's highest id, in file order, and changes nothing else. A curator
  appends rows with the cell blank, runs the script, builds. The first run added the column
  and numbered the existing 94,132 rows 1 to 94,132 in file order — an opaque sequence, since
  the legacy ids are gone.
- **The build refuses the file** when any id is blank, not a positive integer, or used
  twice, naming the line and the script to run. A blank id would otherwise import as NULL
  and a duplicate as two rows, and neither would fail on its own.
- **Last column, not first**, so the leading fifteen still line up with
  `data/records-inat.csv`, whose sixteenth column is `inat_id`. The two identifiers never
  meet: the iNaturalist file is machine-owned and keyed by observation.
- **Not exported to Parquet.** Nothing in the browser needs it yet; adding it later is one
  column in the union, and leaving it out keeps every per-species file the size it is.
- **The duplicate purge ignores it.** The ids were assigned to rows that already existed,
  so two identical rows with different ids are still one occurrence entered twice. The
  first copy keeps its id.
- Every script that rewrites `records.csv` takes its column list from
  `RECORDS_CSV_COLUMNS` in [`scripts/lib/records-source.ts`](../../scripts/lib/records-source.ts).
  Three of them carried a private fifteen-column copy and would have silently dropped the
  new column on their next run.

## Consequences

- Two records that agree on every field are now distinguishable, and a batch append can be
  made idempotent by id.
- The runbook gains one step. A collaborator who edits the CSV without a build will see the
  pull-request check fail with the command to run; that is the flat-file constraint's
  price, and it is one command.
- `records-derived-district.csv` is still keyed by row index. Re-keying it by `record_id`
  is the obvious follow-up and is tracked separately.
- The one-time diff touches every line of `records.csv`, appending `,<n>`. The assigner
  verifies that nothing else changed before it writes.

## Alternatives considered

- **UUIDs.** Rejected: unreadable in a diff, unreadable in a spreadsheet, and nothing here
  needs global uniqueness — the file is the namespace.
- **A content hash.** Rejected: it changes whenever a field is corrected, which is the case
  an identifier exists to survive, and it cannot tell two identical rows apart at all.
- **Recovering legacy ids.** Not now: the reference container is not on this machine and
  the join is lossy. If it is ever done it belongs in a separate column, so this one stays
  what it is.
- **Minting at build time.** Rejected: an id that a build assigns is not in the source, and
  the next build could assign it differently. Ids must live in the CSV.
