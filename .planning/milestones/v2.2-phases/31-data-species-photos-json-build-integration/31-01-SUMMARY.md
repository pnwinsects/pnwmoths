---
phase: 31-data-species-photos-json-build-integration
plan: 01
subsystem: build-pipeline
tags: [eleventy, manifest, photos, csv, node-scripts]

requires:
  - phase: 30-data-photos-manifest-tile-upload
    provides: "data/species-photos-manifest.csv with status=uploaded rows on the datacenter server"

provides:
  - "scripts/generate-species-photos.js: photos:materialize script that reads the manifest and writes data/species-photos.json"
  - "16-test unit test suite covering isMaterializable, toTilesPath, buildSpeciesPhotos"
  - "photos:materialize npm alias in package.json"

affects: [phase-32, species-photos-json, eleventy-data-tree]

tech-stack:
  added: []
  patterns:
    - "Self-contained photos pipeline script pattern (D-13): logStage and redact copied verbatim; only readManifest imported from shared lib"
    - "Row factory pattern for unit tests: all 13 COLUMNS fields supplied to prevent absent-vs-falsy test bugs"
    - "DRY_RUN=1 guard before writeFile side-effect, with explicit print-and-return path"

key-files:
  created:
    - scripts/generate-species-photos.js
    - scripts/generate-species-photos.test.js
  modified:
    - package.json

key-decisions:
  - "BUNNY_API_KEY declared as empty string constant so verbatim redact() copy compiles without modification (no API key needed for this script)"
  - "buildSpeciesPhotos sorts Object.entries(bySlug) for deterministic top-level key order, matching pilot JSON shape"
  - "DRY_RUN invocation against local manifest writes nothing; non-DRY_RUN writes {} (graceful empty-set behavior) because local manifest has 0 uploaded rows"

patterns-established:
  - "photos:materialize is the post-upload materialization step: run on server after photos:upload, commit resulting JSON, pull locally"
  - "data/species-photos.json is a committed artifact; Eleventy reads it at build time via src/_data/speciesPhotos.js"

requirements-completed: [DATA-01, DATA-02]

duration: 15min
completed: 2026-05-23
---

# Phase 31 Plan 01: generate-species-photos.js with unit tests Summary

**`photos:materialize` script materializes `data/species-photos.json` from manifest's `status=uploaded` rows, with 16 passing unit tests and DRY_RUN support**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-23T00:00:00Z
- **Completed:** 2026-05-23
- **Tasks:** 1 auto (Task 2 is a human checkpoint, not executed)
- **Files modified:** 3

## Accomplishments

- `scripts/generate-species-photos.js` implemented following the `upload-tiles.js` self-contained pattern: verbatim `redact()` and `logStage()` copies, `readManifest` import from `./lib/manifest.js`, and self-invocation guard
- Exported pure functions (`isMaterializable`, `toTilesPath`, `buildSpeciesPhotos`) match the locked Phase 28 pilot output shape exactly: `{high_res_available: true, specimens: [{specimen_id, view, tiles_path}]}` with no trailing slash and lowercased slugs
- 16 unit tests (3 suites) with full row factory; full `npm test` suite (207 tests) green
- `photos:materialize` alias added to `package.json`; test file registered in `npm test` glob

## Task Commits

1. **Task 1: Create generate-species-photos.js and unit tests** - `043646fd` (feat)

## Files Created/Modified

- `scripts/generate-species-photos.js` - Reads manifest, filters `status=uploaded`, groups/sorts by species_slug, writes `data/species-photos.json`; exports `isMaterializable`, `toTilesPath`, `buildSpeciesPhotos`
- `scripts/generate-species-photos.test.js` - 16 unit tests with row factory covering all three exported functions and the pilot JSON shape
- `package.json` - Added `photos:materialize` alias after `photos:upload`; added test file to `npm test` glob

## Decisions Made

- `BUNNY_API_KEY = ''` declared at module level so the verbatim `redact()` copy compiles without modification (the guard `if (BUNNY_API_KEY)` naturally returns msg unchanged when key is empty)
- `buildSpeciesPhotos` sorts `Object.entries(bySlug)` before building result to ensure deterministic top-level key order across Node.js versions

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The local manifest has 4935 rows, all with `status` other than `uploaded` (uploads ran on the datacenter server per RESEARCH.md Pitfall 1). Running locally without `DRY_RUN` writes `{}\n` as expected.

## Known Stubs

None — the script produces the correct output shape from real manifest data. Locally it writes `{}` because there are no `status=uploaded` rows on the development machine; this is documented expected behavior, not a stub.

## Next Phase Readiness

- Task 2 (checkpoint) is blocked awaiting operator decision: either run `photos:materialize` on the datacenter server and commit the result, or restore the Phase 28 pilot entry locally
- Phase 32 development requires a non-empty `data/species-photos.json`; the operator must resolve Task 2 before Phase 32 work proceeds

---
*Phase: 31-data-species-photos-json-build-integration*
*Completed: 2026-05-23*
