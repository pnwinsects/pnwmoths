---
phase: 35-build-pipeline-scripts-migration
plan: "01"
subsystem: scripts
tags: [typescript, migration, parquet, validation, cleanup]
dependency_graph:
  requires: []
  provides:
    - scripts/verify-parquet.ts (SCHEMA-07 standalone Parquet validator)
    - "package.json: verify:parquet npm script"
  affects:
    - package.json
    - _instructions/ADDING_PLATE.md
    - _instructions/UPLOADING_TILES.md
tech_stack:
  added: []
  patterns:
    - "hyparquet parquetReadObjects with ArrayBuffer pool fix (raw.buffer.slice)"
    - "OccurrenceRecordSchema.safeParse per-row validation (D-11 sanctioned offline check)"
    - "Scan-all-then-summarize failure reporting (D-04)"
key_files:
  created:
    - scripts/verify-parquet.ts
  modified:
    - package.json
    - _instructions/ADDING_PLATE.md
    - _instructions/UPLOADING_TILES.md
  deleted:
    - scripts/migrate-species.js
    - scripts/migrate-species.test.js
    - scripts/migrate-images.js
    - scripts/migrate-species-accounts.js
    - scripts/cdn-copy-reclassified.js
    - scripts/cdn-fix-bad-slugs.js
    - scripts/upload-plates.js
    - scripts/add-image-metadata.js
    - scripts/test-redirect.js
decisions:
  - "D-01: Deleted 9 spent one-off scripts via git rm; history preserved"
  - "D-02: Updated both _instructions docs; replaced upload-plates.js invocation with manual curl PUT recipe"
  - "D-03/D-07/D-11: verify-parquet.ts reads data/parquet/ (not _site/species/); validates every row via OccurrenceRecordSchema.safeParse"
  - "D-04: scan-all-then-summarize; never fail-fast mid-scan"
  - "D-05: single quiet summary line OK: N species, M rows validated"
  - "Pitfall 1 fix applied: raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) isolates from Node shared pool"
metrics:
  duration: "~10 minutes"
  completed: "2026-06-10"
  tasks_completed: 3
  files_created: 1
  files_modified: 3
  files_deleted: 9
---

# Phase 35 Plan 01: Foundation — Delete Spent Scripts, Create verify-parquet.ts Summary

Deleted 9 spent one-off migration scripts, added standalone `scripts/verify-parquet.ts` with per-row Parquet validation via OccurrenceRecordSchema (1453 species, 92648 rows validated in ~0.5s), and updated both operator `_instructions/` docs to remove references to the deleted `upload-plates.js`.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Delete 9 spent one-off scripts; remove migrate:* npm scripts | 570793f2 | 9 scripts deleted, package.json |
| 2 | Create scripts/verify-parquet.ts + verify:parquet npm script | ce53c127 | scripts/verify-parquet.ts, package.json |
| 3 | Update _instructions docs (remove upload-plates references) | 8bde480f | _instructions/ADDING_PLATE.md, _instructions/UPLOADING_TILES.md |

## Verification Results

- `npm run typecheck` exits 0
- `npm run verify:parquet` exits 0: `OK: 1453 species, 92648 rows validated`
- No deleted one-off script remains in `scripts/`
- `grep -rl 'upload-plates' _instructions/` returns empty (no references remain)
- `grep 'raw.buffer.slice' scripts/verify-parquet.ts` confirms Pitfall 1 fix
- `grep 'OccurrenceRecordSchema' scripts/verify-parquet.ts` confirms per-row validation

## Deviations from Plan

None — plan executed exactly as written. All task acceptance criteria met on first attempt.

## Known Stubs

None — `scripts/verify-parquet.ts` reads real production data from `data/parquet/` and produces a real validation result; no mock or placeholder data.

## Threat Flags

No new security-relevant surface introduced. `scripts/verify-parquet.ts` reads operator-controlled local build artifacts (`data/parquet/`); not web-facing. Threat register in plan was already complete (T-35P1-01, T-35P1-02, T-35P1-SC all accepted/mitigated with no action required).

## Self-Check: PASSED

- `scripts/verify-parquet.ts` exists and runs: CONFIRMED
- `package.json` contains `verify:parquet`: CONFIRMED
- 9 deleted scripts absent from `scripts/`: CONFIRMED
- No `upload-plates` references in `_instructions/`: CONFIRMED
- Commits 570793f2, ce53c127, 8bde480f all exist in git log: CONFIRMED
