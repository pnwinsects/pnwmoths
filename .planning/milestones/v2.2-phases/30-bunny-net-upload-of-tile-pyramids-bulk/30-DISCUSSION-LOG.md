# Phase 30: bunny.net Upload of Tile Pyramids (bulk) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-23
**Phase:** 30-bunny-net-upload-of-tile-pyramids-bulk
**Areas discussed:** Upload concurrency, Tile dir deletion, Footprint check (UPLOAD-03), Mid-directory crash recovery

---

## Upload concurrency

| Option | Description | Selected |
|--------|-------------|----------|
| Serial | One curl call at a time, same as upload-plates.js. Simple, debuggable, follows established pattern. ~27h for 1.9M files at 50ms/PUT — unattended tmux run so wall-clock time acceptable. | ✓ |
| Parallel pool (10 concurrent) | 10 simultaneous curl calls per directory using Promise.all with a semaphore. ~3h upload time. Adds complexity to error handling. | |

**User's choice:** Serial
**Notes:** Simplicity and debuggability preferred. The run is unattended in tmux so ~27h is acceptable.

---

## Tile dir deletion

| Option | Description | Selected |
|--------|-------------|----------|
| Immediately on success | Delete `_files/` dir + `.dzi` after advancing to status=uploaded. Matches D-06 streaming intent. Keeps disk usage bounded. | ✓ |
| DELETE_TILES=1 flag (opt-in) | Deletion skipped unless flag set. Safer for first test runs. Adds extra invocation step. | |
| Never (separate cleanup pass) | upload-tiles.js only uploads; separate script deletes. Cleanest separation but requires third script. | |

**User's choice:** Immediately on success
**Notes:** Unconditional deletion — no flag needed. D-06 (Phase 26) was already locked; this confirms the implementation timing.

---

## Footprint check (UPLOAD-03)

| Option | Description | Selected |
|--------|-------------|----------|
| CHECK_FOOTPRINT=1 mode | Separate env flag mode that walks tiles and exits without uploading. | |
| Pre-flight at startup (always runs) | Walk tile dirs and print total GB before first upload, every run. No extra env var. | ✓ |
| Document in runbook only | Operator runs `du -sh` manually; no code change. | |

**User's choice:** Pre-flight at startup (always runs)
**Notes:** Follow-up question on cost projection → size only (no hardcoded pricing rates). Operator cross-references bunny.net pricing page manually.

---

## Mid-directory crash recovery

| Option | Description | Selected |
|--------|-------------|----------|
| Re-upload whole directory | On restart, re-PUT all files in tile dir for any row still at status=tiled. Matches manifest-as-state model. Safe idempotent PUT. No extra code. | ✓ |
| Sidecar file-level progress | Per-row file tracking sidecar. Zero redundant work after crash. More code, more state. | |

**User's choice:** Re-upload whole directory
**Notes:** Simple and consistent with the manifest-as-state model established in Phase 26.

---

## Claude's Discretion

- npm alias: `photos:upload` (following `photos:ingest` / `photos:tile` pattern)
- `BUNNY_STORAGE_HOST` / `BUNNY_ZONE` env var defaults: `la.storage.bunnycdn.com` / `pnwmoths`
- Eligible rows filter: `status: tiled` only
- Manifest not git-committed by the script (operator does this manually after run)

## Deferred Ideas

- Concurrent file PUTs — rejected for Phase 30; could revisit if serial proves too slow in practice
- DELETE_TILES=1 safety flag — rejected; D-06 unconditional deletion is cleaner
- Per-file sidecar progress tracker — rejected; whole-directory re-upload is sufficient
- Cost projection in footprint check — rejected; hardcoded rates drift
- Separate check-storage-footprint.js script — rejected; pre-flight in main script preferred
