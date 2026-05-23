---
plan: 29-03
phase: 29-dzi-tile-generation-pipeline-bulk
status: complete
completed_at: 2026-05-23
---

# Plan 29-03 Summary — Operator Runbook + Verification

## Task 1: _instructions/TILING_HIGH_RES_PHOTOS.md

Created `_instructions/TILING_HIGH_RES_PHOTOS.md` (271 lines). All nine required sections present:
Overview, Prerequisites, Configuration, Dry-run preview, Full pipeline, Resume after interruption,
When things go wrong (7 entries), Verification, Next phase handoff.

All automated gates passed: `photos:tile` (3), `DROPBOX_TOKEN` (3), `tile-config.json` (2),
`DRY_RUN` (2), `vips`/`libvips` (23/6), `TILE_OUTPUT_DIR`/`TIFF_CACHE_DIR`, `webp`,
"When Things Go Wrong" section, `resume`, `Phase 30` (6).

## Task 2: Operator verification (local)

Checks performed locally with updated DROPBOX_TOKEN (sharing.read + files.content.read + files.metadata.read).

**Check 1 — DRY_RUN:**
```
[tile-photos] manifest: 4935 rows total; 3808 eligible for tiling
[tile-photos] DRY_RUN=1 — printing first 5 eligible rows, not invoking fetch or vips, not writing manifest
  -> tile prefix : /var/lib/pnwmoths/tiles/abagrotis-apposita/A-D
     source TIFF : /var/lib/pnwmoths/tiffs/e6f226797116...-Abagrotis apposita-A-D.tif
     dropbox_path: /Abagrotis apposita-A-D.tif
     status      : discovered
  ... (3803 more)
```
Slugs are lowercase. No manifest write. `git diff data/species-photos-manifest.csv` empty after dry-run.

**Check 2 — Idempotency:**
Re-ran against an already-tiled row (tiles present on disk, manifest at `discovered`).
Output: `already-on-disk-advance` — no vips invocation, no download. Second run:
```
2026-05-23T15:40:37Z e6f226797116 tile already-on-disk-advance abagrotis-apposita
tiled (new): 0 | skipped (already tiled): 1 | failed: 0
```

**Check 3 — Tile parameters from .dzi:**
```xml
<Image xmlns="http://schemas.microsoft.com/deepzoom/2008"
  Format="webp"
  Overlap="1"
  TileSize="256"
```
Matches PILOT-LESSONS.md exactly: webp, overlap=1, tileSize=256.

**Check 4 — npm test:** exit 0 — 182/182 passing.

## Gap closures discovered during verification

**Phase 26 data gap — empty `dropbox_path`:** The Dropbox `/2/files/list_folder` with
`shared_link` does not return `path_display` on entries. All 4935 manifest rows had empty
`dropbox_path`. Fixed in `ingest-photos.js` (fallback to `'/' + entry.name`) and backfilled
the manifest with `'/' + filename_raw`. Committed in fix(29).

**Non-retriable 4xx errors:** `withRetry` was retrying permanent 4xx errors (e.g. missing
OAuth scope). `downloadSharedFile` now sets `err.retriable = false` for non-429 4xx responses;
`withRetry` in tile-photos.js bails immediately. Added `err.retriable` assertions to tests.

## Recommendations for Phase 30 (bulk upload)

- 3808 rows are ready to tile once run on a machine with disk capacity (~9 GB tile output + ~204 GB TIFF cache).
- The TIFF cache (`/var/lib/pnwmoths/tiffs/`) is safe to delete after Phase 30 uploads succeed — tiles are the durable artifact.
- DZI output paths follow `{tileOutputDir}/{slug}/{specimen_id}-{view}.dzi` with lowercase slug — Phase 30 upload script must use the same lowercasing convention.
- Log format from tile run: save `tile-run-$(date +%F-%H%M).log` for Phase 30's storage-footprint cross-check.
- `sharing.read` + `files.content.read` are both required on the Dropbox app token for tile-photos.js; `files.metadata.read` is additionally needed for ingest-photos.js listing.
