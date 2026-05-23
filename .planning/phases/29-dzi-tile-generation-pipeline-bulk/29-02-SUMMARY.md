---
phase: 29-dzi-tile-generation-pipeline-bulk
plan: "02"
subsystem: infra
tags: [vips, dzi, dropbox, manifest, tiling, pipeline]

requires:
  - phase: 29-dzi-tile-generation-pipeline-bulk
    provides: tile-config.json, downloadSharedFile, advanceStatus helper (29-01)
  - phase: 26-dropbox-ingest-filename-parser-and-manifest
    provides: data/species-photos-manifest.csv schema and readManifest/writeManifest

provides:
  - scripts/tile-photos.js — bulk DZI tiling CLI (download + vips dzsave + manifest advance)
  - scripts/tile-photos.test.js — 16 unit tests for path helpers and idempotency guards
  - npm alias photos:tile

affects:
  - 29-03 (upload-tiles — consumes tileOutputDir produced by this script)
  - 31-data-build-integration (consumes manifest status=tiled rows)

tech-stack:
  added: []
  patterns:
    - "withRetry/redact/logStage helpers copied verbatim from ingest-photos.js (project-wide idiom)"
    - "Periodic 25-row checkpoint write for resumability (OPS-03 carry-forward)"
    - "Four named exports for testability without module mocking"

key-files:
  created:
    - scripts/tile-photos.js
    - scripts/tile-photos.test.js
  modified:
    - package.json

key-decisions:
  - "Export tilePrefix/tiffCachePath/isAlreadyTiled/isTileable to allow unit tests without network or vips"
  - "Filesystem idempotency (isAlreadyTiled) layered on top of manifest idempotency (status=tiled) to recover from interrupted runs"
  - "species_slug lowercased unconditionally in tilePrefix (Phase 28 mixed-case lesson)"

patterns-established:
  - "isTileable: guard both manifest status and required-field presence before any I/O"
  - "Per-row try/catch: mark failed, continue — never crash the run on a single row error"

requirements-completed:
  - TILE-01
  - TILE-02
  - TILE-03

duration: 3min
completed: 2026-05-23
---

# Phase 29 Plan 02: DZI Tile Generation Pipeline (Bulk) Summary

**Bulk DZI tiling CLI: downloads TIFFs from Dropbox via downloadSharedFile, invokes `vips dzsave` with tile-config.json parameters, advances manifest rows from discovered/downloaded to tiled — idempotently, with per-row error isolation and 25-row checkpoint writes**

## Performance

- **Duration:** 3 min
- **Started:** 2026-05-23T05:51:06Z
- **Completed:** 2026-05-23T05:54:23Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Created `scripts/tile-photos.js` (378 lines): full download→tile→advance pipeline with DRY_RUN support, slug lowercasing, redacted errors, periodic checkpoint writes, and four named exports
- Created `scripts/tile-photos.test.js`: 16 unit tests covering tilePrefix, tiffCachePath, isAlreadyTiled, and all 11 isTileable cases
- Updated `package.json`: added `photos:tile` alias and `scripts/tile-photos.test.js` to the test script; full suite passes at 181/181

## Named Exports (confirmed)

All four are exported from `scripts/tile-photos.js` and verified via dynamic import:

1. `tilePrefix(tileOutputDir, row)` — `join(tileOutputDir, row.species_slug.toLowerCase(), \`${row.specimen_id}-${row.view}\`)`
2. `tiffCachePath(tiffCacheDir, row)` — `join(tiffCacheDir, row.content_hash + '-' + row.filename_raw)`
3. `isAlreadyTiled(tileOutputDir, row)` — `existsSync(\`${tilePrefix(tileOutputDir, row)}.dzi\`)`
4. `isTileable(row)` — checks status, match_bucket, specimen_id, view, species_slug, dropbox_path

## vips argv Array (as written)

```js
execFileSync('vips', [
  'dzsave',
  sourceTiff,
  prefix,
  '--tile-size', String(config.tileSize),
  '--overlap', String(config.overlap),
  '--suffix', config.suffix,
  '--layout', config.layout,
], { stdio: ['pipe', 'pipe', 'pipe'] });
```

Parameters are read from `scripts/tile-config.json` at startup (TILE-03). Confirmed values: `tileSize=256`, `overlap=1`, `suffix=".webp[Q=80]"`, `layout="dz"`.

## redact() and logStage() Bodies (verbatim from ingest-photos.js)

```js
function redact(msg) {
  return DROPBOX_TOKEN
    ? msg.replace(new RegExp(DROPBOX_TOKEN, 'g'), '[REDACTED]')
    : msg;
}
```

```js
function logStage(content_hash, action, outcome, extra = '') {
  const hashPrefix = (content_hash ?? '').slice(0, 12).padEnd(12);
  const actionField = String(action).padEnd(16);
  console.log(
    `${new Date().toISOString()} ${hashPrefix} ${actionField} ${outcome}${extra ? '  ' + extra : ''}`
  );
}
```

Both match `scripts/ingest-photos.js` lines 71–74 and 111–116 verbatim (module-name prefix in console.log not applicable — logStage omits the script name by design as both scripts share the same function body pattern).

## Test Count

**16 tests, 4 suites** (node --test scripts/tile-photos.test.js, all pass):

| Suite | Tests |
|-------|-------|
| tilePrefix | 2 |
| tiffCachePath | 1 |
| isAlreadyTiled | 2 |
| isTileable | 11 |
| **Total** | **16** |

## npm test Result

```
ℹ tests 181
ℹ pass 181
ℹ fail 0
```

165 pre-existing tests + 16 new tests from tile-photos.test.js.

## Task Commits

1. **Task 1: scripts/tile-photos.js** - `1bdbe1a8` (feat)
2. **Task 2: scripts/tile-photos.test.js** - `170b1668` (test)
3. **Task 3: package.json** - `6f883cd5` (feat)

## Files Created/Modified

- `/Users/rainhead/dev/pnwmoths/scripts/tile-photos.js` — bulk DZI tiling CLI, 378 lines
- `/Users/rainhead/dev/pnwmoths/scripts/tile-photos.test.js` — 16 unit tests
- `/Users/rainhead/dev/pnwmoths/package.json` — added photos:tile alias and test inclusion

## Decisions Made

- Exported the four path/predicate helpers to avoid module mocking in tests — pure functions with no I/O side effects
- `isAlreadyTiled` provides filesystem-level idempotency layered on top of `isTileable`'s manifest-level check to recover from interrupted runs where the manifest wasn't flushed
- `species_slug.toLowerCase()` called unconditionally in `tilePrefix` per Phase 28 PILOT-LESSONS.md mixed-case lesson

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

- Phase 29 Plan 03 (upload-tiles to bunny.net) can now consume `tileOutputDir` produced by this script
- `npm run photos:tile` is the operator command for bulk tiling; pair with `TILE_OUTPUT_DIR` + `TIFF_CACHE_DIR` env overrides for datacenter deployment
- Phase 31 (data build integration) will read `status=tiled` rows from the manifest

## Self-Check: PASSED

- scripts/tile-photos.js: FOUND
- scripts/tile-photos.test.js: FOUND
- 29-02-SUMMARY.md: FOUND
- Commits 1bdbe1a8, 170b1668, 6f883cd5: all present in git log

---
*Phase: 29-dzi-tile-generation-pipeline-bulk*
*Completed: 2026-05-23*
