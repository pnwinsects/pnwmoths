---
phase: 29-dzi-tile-generation-pipeline-bulk
plan: 01
subsystem: infra
tags: [dropbox, vips, dzi, manifest, tile-pipeline, webp]

# Dependency graph
requires:
  - phase: 28-end-to-end-vertical-slice-pilot-one-species
    provides: PILOT-LESSONS.md with confirmed tile parameters (256/1/.webp[Q=80]/dz)
provides:
  - scripts/tile-config.json — committed tile parameters for scripts/tile-photos.js (Plan 02)
  - scripts/lib/dropbox-download.js — downloadSharedFile() for streaming TIFFs from Dropbox
  - scripts/lib/manifest.js::advanceStatus — status-transition helper for manifest rows
affects:
  - 29-02 (tile-photos.js composes all three artifacts produced here)
  - 29-03 (operator runbook verifies tile-config.json values)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Committed JSON config for pipeline parameters (tile-config.json) — operator overrides via env vars at runtime; config is the authoritative default"
    - "Dropbox content-download API: Dropbox-API-Arg header carries JSON args (not body); response body is file bytes"
    - "In-place manifest row mutation for status transitions (matches ingest-photos.js RESORT_ONLY convention)"

key-files:
  created:
    - scripts/tile-config.json
    - scripts/lib/dropbox-download.js
    - scripts/lib/dropbox-download.test.js
  modified:
    - scripts/lib/manifest.js
    - scripts/lib/manifest.test.js

key-decisions:
  - "WebP (.webp[Q=80]) pinned in tile-config.json based on Phase 28 pilot — not JPEG; ~30% smaller, OSD handles webp format correctly"
  - "downloadSharedFile has no retry logic — callers (tile-photos.js) own retry wrapping, matching dropbox-list.js 'no retry in library' stance"
  - "advanceStatus mutates row in-place (not returns copy) — mirrors RESORT_ONLY pattern in ingest-photos.js for consistency"

patterns-established:
  - "Token security: error messages from Dropbox download never echo the Authorization header value (T-29.01-01 mitigated by Dropbox not echoing auth in error bodies + test assertion)"
  - "Status transition helper: advanceStatus clears last_error on any non-failed status to prevent stale failure reasons persisting through successful retiles"

requirements-completed:
  - TILE-03

# Metrics
duration: 2min
completed: 2026-05-23
---

# Phase 29 Plan 01: DZI Tile Generation — Foundation Artifacts Summary

**Committed tile-config.json with pilot-confirmed WebP/256/overlap-1 parameters, downloadSharedFile() streaming helper with token-safe error handling, and advanceStatus() manifest row transition function.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-05-23T05:45:15Z
- **Completed:** 2026-05-23T05:47:38Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- `scripts/tile-config.json` committed with 7 pilot-confirmed keys: tileSize=256, overlap=1, suffix=.webp[Q=80], layout=dz, tileOutputDir, tiffCacheDir, dropboxShareUrl
- `scripts/lib/dropbox-download.js` exports `downloadSharedFile({ shareUrl, dropboxPath, token, destPath })` — POSTs to content.dropboxapi.com with Dropbox-API-Arg header, streams response body via node:stream/promises pipeline, creates parent dirs
- `scripts/lib/manifest.js` now exports `advanceStatus(row, nextStatus, extra)` — advances status in-place, clears last_error on success, records last_error on failure, throws TypeError on invalid inputs
- 5 new tests added (2 for dropbox-download, 3 for manifest advanceStatus); npm test passes all 165 tests

## tile-config.json (verbatim)

```json
{
  "tileSize": 256,
  "overlap": 1,
  "suffix": ".webp[Q=80]",
  "layout": "dz",
  "tileOutputDir": "/var/lib/pnwmoths/tiles",
  "tiffCacheDir": "/var/lib/pnwmoths/tiffs",
  "dropboxShareUrl": "https://www.dropbox.com/scl/fo/uf3sg1efxau1fug4f6ibe/AARZETfHfpzlvILrd6KLWlc?rlkey=7m1pm3z0rnasb9i01a5ht0ppf&st=emehj9n2&dl=0"
}
```

## New Exports and Signatures

**`scripts/lib/dropbox-download.js`**
```js
export async function downloadSharedFile({ shareUrl, dropboxPath, token, destPath })
// Throws: Error("downloadSharedFile: missing required param: <name>") if any param is falsy
// Throws: Error("/2/sharing/get_shared_link_file → ${status}: ${text}") on non-2xx
// Returns: undefined on success (file written to destPath)
```

**`scripts/lib/manifest.js` — new export added to existing 4 exports**
```js
export function advanceStatus(row, nextStatus, extra = {})
// Throws: TypeError("advanceStatus: row required") if row is null/undefined
// Throws: TypeError("advanceStatus: nextStatus must be a non-empty string") if nextStatus is empty
// Sets: row.status = nextStatus
// Sets: row.last_error = String(extra.last_error ?? '') if nextStatus === 'failed'
// Sets: row.last_error = '' otherwise
// Returns: row (same reference)
```

## Tests Added

- **scripts/lib/dropbox-download.test.js** — 2 tests:
  1. Throws "missing required param: token" when token is empty; message does not contain token value
  2. Mock fetch returns 401; error starts with "/2/sharing/get_shared_link_file → 401:"; message does not contain "sl.SECRET"

- **scripts/lib/manifest.test.js** — 3 new advanceStatus tests (appended to existing 14):
  1. `'downloaded'` clears last_error, preserves all 11 other columns (per-column loop + named spot checks)
  2. `'failed'` records last_error from extra.last_error, preserves other columns
  3. `advanceStatus({}, '')` throws TypeError with "nextStatus must be a non-empty string"

## Task Commits

1. **Task 1: scripts/tile-config.json** - `4c0890d4` (feat)
2. **Task 2: dropbox-download.js + tests** - `35801c64` (feat)
3. **Task 3: advanceStatus in manifest.js + tests** - `ab47b07f` (feat)

## npm test Result

All 165 tests pass, 0 fail. New tests (5) all pass.

```
ℹ tests 165
ℹ suites 26
ℹ pass 165
ℹ fail 0
```

## Files Created/Modified

- `scripts/tile-config.json` — committed tile parameters (tileSize, overlap, suffix, layout, tileOutputDir, tiffCacheDir, dropboxShareUrl)
- `scripts/lib/dropbox-download.js` — downloadSharedFile() for streaming TIFFs from Dropbox shared-link folder
- `scripts/lib/dropbox-download.test.js` — 2 unit tests for error handling and token security
- `scripts/lib/manifest.js` — advanceStatus() export added; existing exports and COLUMNS order unchanged
- `scripts/lib/manifest.test.js` — 3 new advanceStatus tests appended

## Decisions Made

- WebP suffix `.webp[Q=80]` is pinned in tile-config.json (not JPEG) — pilot Phase 28 confirmed ~30% size reduction and OSD handles the `Format="webp"` DZI descriptor correctly
- No retry in `downloadSharedFile` — callers (tile-photos.js Plan 02) own withRetry, matching the dropbox-list.js design principle
- `advanceStatus` does in-place mutation to match the RESORT_ONLY path in ingest-photos.js

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

- Plan 02 (`scripts/tile-photos.js`) can now compose all three artifacts: read tile-config.json at startup, call downloadSharedFile() per TIFF, call advanceStatus(row, 'tiled') on success
- All three artifacts have tests; npm test passes cleanly
- Ready for Phase 29 Plan 02 execution

---
*Phase: 29-dzi-tile-generation-pipeline-bulk*
*Completed: 2026-05-23*
