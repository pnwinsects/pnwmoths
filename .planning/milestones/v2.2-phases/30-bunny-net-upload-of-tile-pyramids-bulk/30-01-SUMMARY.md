---
phase: 30-bunny-net-upload-of-tile-pyramids-bulk
plan: 01
subsystem: infra
tags: [bunny-net, upload, manifest-pipeline, dzi, tile-pyramid, nodejs-cli, curl]

# Dependency graph
requires:
  - phase: 29-dzi-tile-generation-pipeline-bulk
    provides: "status=tiled rows in manifest + var/tiles/ DZI corpus"
  - phase: 26-species-photos-manifest
    provides: "readManifest / writeManifest / advanceStatus / COLUMNS from scripts/lib/manifest.js"
  - phase: 18-upload-plates
    provides: "curl PUT argv pattern, BUNNY env vars, async walk() helper"
provides:
  - "scripts/upload-tiles.js — manifest-driven bunny.net tile upload CLI"
  - "scripts/upload-tiles.test.js — 9 unit tests for tileUploadPath, tilePullZoneUrl, isUploadable"
  - "package.json photos:upload alias and test glob inclusion"
affects:
  - 30-02-runbook
  - phase-31 (reads status=uploaded rows)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Self-contained per-script helpers (redact, withRetry, logStage, walk copied verbatim — not imported)"
    - "DRY_RUN guard before secret guard — enables dry-run without API key"
    - "advanceStatus before tile deletion (D-03 ordering)"
    - "Periodic manifest flush every 25 rows + try/finally always-flush"
    - "Pre-flight footprint walk prints total GB before first upload"

key-files:
  created:
    - scripts/upload-tiles.js
    - scripts/upload-tiles.test.js
  modified:
    - package.json

key-decisions:
  - "DRY_RUN prints Pull Zone URLs (pnwmoths.b-cdn.net) not Storage Zone URLs — for operator browser verification"
  - "advanceStatus(row, 'uploaded') happens before rm/unlink deletion (D-03 ordering is non-negotiable)"
  - "isUploadable: status === 'tiled' only — other statuses are filtered out at the loop level"
  - "preflightFootprint uses synchronous readdirSync/statSync since it runs once at startup in an already-async main()"
  - "CDN_BASE_URL hardcoded as literal string — not imported from eleventy.config.js"

patterns-established:
  - "tileUploadPath(tileOutputDir, row) mirrors tilePrefix() from tile-photos.js — lowercase slug, uppercase specimen_id preserved"
  - "tilePullZoneUrl(row) uses CDN_BASE_URL constant for DRY_RUN output, NOT the Storage Zone URL"
  - "isUploadable(row) is the sole eligibility predicate — single responsibility, easy to test"

requirements-completed: [UPLOAD-01, UPLOAD-02, UPLOAD-03]

# Metrics
duration: 6min
completed: 2026-05-23
---

# Phase 30 Plan 01: upload-tiles.js Summary

**Manifest-driven bunny.net tile upload script with pre-flight footprint check, exponential retry, API key redaction, and immediate post-upload tile deletion**

## Performance

- **Duration:** 6 min
- **Started:** 2026-05-23T18:43:10Z
- **Completed:** 2026-05-23T18:49:04Z
- **Tasks:** 3 (TDD RED + GREEN + package.json wiring)
- **Files modified:** 3 (upload-tiles.js created, upload-tiles.test.js created, package.json modified)

## Accomplishments

- Implemented `scripts/upload-tiles.js` — a complete manifest-driven CLI that uploads each `status=tiled` row's DZI tile directory to `https://la.storage.bunnycdn.com/pnwmoths/species-tiles/{slug}/{pair}/` via `execFileSync('curl', argsArray)`, advances manifest to `status=uploaded`, and immediately deletes local tiles
- Exported `tileUploadPath`, `tilePullZoneUrl`, `isUploadable` at module level with 9/9 unit tests passing
- Test count delta: 182 baseline → 191 after this plan (9 new tests)
- `DRY_RUN=1 npm run photos:upload` works without BUNNY_API_KEY, prints first 5 upload plans with Pull Zone CDN URLs

## Exported Function Signatures

```javascript
// On-disk prefix: {tileOutputDir}/{slug-lowercase}/{specimen_id}-{view}
export function tileUploadPath(tileOutputDir, row): string

// Pull Zone URL: https://pnwmoths.b-cdn.net/species-tiles/{slug-lowercase}/{specimen_id}-{view}/
export function tilePullZoneUrl(row): string

// Returns true only for row.status === 'tiled'
export function isUploadable(row): boolean
```

## Pre-flight Footprint Output Format

```
[upload-tiles] Pre-flight: measuring tile corpus size (this may take 30-90s)...
[upload-tiles] Pre-flight footprint check:
  3808 rows with status=tiled
  Tile output dir: var/tiles
  Total on-disk size: 3.2 GB (measured)
  Estimated full-run size (extrapolated): ~1.1 TB (3808 rows × avg 0 MB/dir)
Proceeding with upload...
```

Note: "Estimated" line only appears when `measuredRows < tiledRows.length` (partial corpus on disk).

## DRY_RUN Output Format

```
[upload-tiles] manifest: 4935 rows total; 3808 eligible (status=tiled)
[upload-tiles] DRY_RUN=1 — printing first 5 upload plans, not uploading
  slug: abagrotis-apposita  pair: A-D
    CDN URL: https://pnwmoths.b-cdn.net/species-tiles/abagrotis-apposita/A-D/
    Files to upload: 88 (87 tiles + 1 .dzi)
  slug: abagrotis-apposita  pair: A-V
    CDN URL: https://pnwmoths.b-cdn.net/species-tiles/abagrotis-apposita/A-V/
    Files to upload: 88 (87 tiles + 1 .dzi)
  ... (3803 more)
```

Note: File count and "more" count will vary as Phase 29 completes more rows.

## Progress Summary Output Format (end of run)

```
[upload-tiles] 25/3808
[upload-tiles] 50/3808
...
[upload-tiles] summary:
  uploaded (new):              3750
  skipped (already uploaded):  0
  failed (per-row errors):     58
  total eligible rows:         3808
[upload-tiles] wrote /path/to/data/species-photos-manifest.csv
```

Note: `skipped (already uploaded)` is always 0 because `isUploadable` filters them before the loop.

## logStage Output Format

```
2026-05-23T18:00:00.000Z e6f226797116 upload           ok  abagrotis-apposita/A-D  88 files
2026-05-23T18:00:05.000Z f7a337898227 upload           failed  PUT failed after 5 attempts: ...
```

## Task Commits

Each task was committed atomically:

1. **Task 1: Write upload-tiles.test.js (TDD RED)** - `91898cb3` (test)
2. **Task 2: Implement upload-tiles.js (TDD GREEN)** - `82ef565d` (feat)
3. **Task 3: Wire package.json** - `33e8bd6f` (feat)

## Files Created/Modified

- `scripts/upload-tiles.js` — manifest-driven tile upload CLI, 405 lines
- `scripts/upload-tiles.test.js` — 9 unit tests for the 3 exported helpers
- `package.json` — added `photos:upload` alias and `scripts/upload-tiles.test.js` to test glob

## Decisions Made

- DRY_RUN check precedes BUNNY_API_KEY guard — enables `DRY_RUN=1 npm run photos:upload` without needing a key
- `advanceStatus(row, 'uploaded')` before `rm`/`unlink` — status committed to in-memory row before deletion (D-03 ordering preserved)
- `isUploadable` checks only `status === 'tiled'` — all other statuses excluded at filter time, not inside the loop
- CDN_BASE_URL hardcoded as `'https://pnwmoths.b-cdn.net'` — matches the plan constraint, not imported from eleventy.config.js
- Pre-flight uses synchronous `readdirSync`/`statSync` — acceptable one-time overhead at startup (30-90s for ~447k files)

## Deviations from Plan

None — plan executed exactly as written. All locked decisions (D-01 through L-08) honored. No remote-server paths introduced.

## Issues Encountered

None. The environment had `BUNNY_API_KEY` set, so the "missing API key" smoke test was verified by passing `BUNNY_API_KEY=` explicitly (`BUNNY_API_KEY= node scripts/upload-tiles.js` exits 1 with expected message). Script logic is correct.

## Known Stubs

None — no placeholder values, no TODO/FIXME, no empty data sources.

## Threat Flags

No new security surface beyond what the plan's threat model covers. `redact()` verifiably guards all error paths; `execFileSync` array form prevents shell injection; slug lowercasing applied on all CDN path constructions.

## Next Phase Readiness

- **Plan 02 (runbook `_instructions/UPLOADING_TILES.md`):** This SUMMARY contains all CLI output format strings needed to quote verbatim in the runbook. Key strings to use:
  - Pre-flight header: `[upload-tiles] Pre-flight: measuring tile corpus size (this may take 30-90s)...`
  - DRY_RUN trigger line: `[upload-tiles] DRY_RUN=1 — printing first 5 upload plans, not uploading`
  - Missing key error: `[upload-tiles] BUNNY_API_KEY is required. Set it to your bunny.net Storage Zone password.`
  - Summary header: `[upload-tiles] summary:`
- **Phase 31 (CDN integration):** reads `status=uploaded` rows from the manifest. The CDN URL format is `https://pnwmoths.b-cdn.net/species-tiles/{slug-lowercase}/{specimen_id}-{view}/` as produced by `tilePullZoneUrl()`.

## Self-Check: PASSED

- FOUND: scripts/upload-tiles.js
- FOUND: scripts/upload-tiles.test.js
- FOUND commits: 91898cb3, 82ef565d, 33e8bd6f
- Tests: 191/191 pass, 0 fail

---
*Phase: 30-bunny-net-upload-of-tile-pyramids-bulk*
*Completed: 2026-05-23*
