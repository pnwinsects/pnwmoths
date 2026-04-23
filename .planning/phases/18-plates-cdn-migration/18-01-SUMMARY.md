---
phase: 18-plates-cdn-migration
plan: "01"
subsystem: infra
tags: [eleventy, bunny-cdn, zoomify, plates, nunjucks]

# Dependency graph
requires:
  - phase: 15-lfs-removal
    provides: plates/ gitignored after LFS purge; plates/manifest.json only on local dev machines
  - phase: 13-image-cdn
    provides: cdnBaseUrl global in eleventy.config.js; bunny.net CDN infrastructure
provides:
  - data/plates.json committed to git (98-record manifest, tracked)
  - Eleventy build generates 98 plate pages in CI using data/plates.json
  - plate.njk and index.njk serve tiles and thumbnails from bunny.net CDN
  - scripts/upload-plates.js ready for one-time tile upload to CDN
affects: [18-02-upload, ci-build, plate-pages]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Committed manifest pattern: write source-of-truth JSON to data/ (tracked) rather than build-time dirs (gitignored)"
    - "CDN URL in templates: use cdnBaseUrl global directly, never pipe through | url filter"
    - "One-time upload script: HTTP PUT to bunny.net Storage via curl, BUNNY_API_KEY from env only"

key-files:
  created:
    - data/plates.json
    - scripts/upload-plates.js
  modified:
    - src/_data/plates.js
    - src/plates/plate.njk
    - src/plates/index.njk
    - scripts/copy-plates.js

key-decisions:
  - "Commit manifest to data/plates.json (tracked) rather than plates/manifest.json (gitignored post-LFS-removal)"
  - "CDN URLs constructed directly in templates using cdnBaseUrl global — no | url filter on absolute URLs"
  - "upload-plates.js is a standalone manual script (not wired to package.json build) — run once when plates/ tiles are ready"

patterns-established:
  - "CDN URL pattern: {{ cdnBaseUrl }}/plates/{{ plate.slug }}/ with trailing slash for OSD getTileUrl"
  - "No | url filter on absolute CDN URLs — filter is only for site-relative paths"

requirements-completed: [PLATES-01, PLATES-02, PLATES-03, PLATES-04]

# Metrics
duration: 4min
completed: 2026-04-23
---

# Phase 18 Plan 01: Plates CDN Migration Summary

**Committed 98-plate manifest to data/plates.json, wired plate templates to bunny.net CDN URLs, and wrote one-time upload script — fixing "No plates available" production regression from Phase 15 LFS removal**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-23T05:36:59Z
- **Completed:** 2026-04-23T05:40:46Z
- **Tasks:** 3 completed
- **Files modified:** 6

## Accomplishments

- Committed `data/plates.json` with 98 plate records (manifest previously only existed at gitignored `plates/manifest.json`)
- Updated `src/_data/plates.js` to read from `data/plates.json` so CI gets plate data without `PLATES_Z_SOURCE`
- Updated `plate.njk` and `index.njk` to use `cdnBaseUrl` for tilesUrl, noscript link, and thumbnail src (removed broken `| url` usage on CDN paths)
- Updated `copy-plates.js` manifest write path to `data/plates.json`
- Written `scripts/upload-plates.js` following `migrate-images.js` HTTP PUT pattern with `BUNNY_API_KEY` env guard
- Full build generates exactly 98 plate pages; 72/72 tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Commit data/plates.json and update plates.js + copy-plates.js** - `1247596` (feat)
2. **Task 2: Update plate.njk and index.njk to use CDN URLs** - `d30cf26` (feat)
3. **Task 3: Write scripts/upload-plates.js and verify full build** - `c6d80c9` (feat)

## Files Created/Modified

- `data/plates.json` - Committed 98-plate manifest with number/family/slug/width/height fields
- `src/_data/plates.js` - MANIFEST_PATH now reads from `data/plates.json` (was `plates/manifest.json`)
- `src/plates/plate.njk` - tilesUrl and noscript href use `cdnBaseUrl` (no `| url` filter)
- `src/plates/index.njk` - thumbnail img src uses `cdnBaseUrl` (no `| url` filter); anchor href unchanged
- `scripts/copy-plates.js` - manifest writeFile target changed to `data/plates.json`
- `scripts/upload-plates.js` - new one-time upload script for 16,270 tile files

## Decisions Made

- Committed manifest to `data/plates.json` (tracked) rather than the gitignored `plates/` directory — fixes CI which has no access to `plates/manifest.json` after Phase 15 LFS removal
- CDN URLs constructed directly with `{{ cdnBaseUrl }}/plates/{{ plate.slug }}/` — the `| url` filter corrupts absolute URLs by prepending the site pathPrefix
- Trailing slash on tilesUrl is required by OpenSeadragon's `getTileUrl` which concatenates `tilesUrl + 'TileGroup0/0-0-0.jpg'` directly

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `src/plates/` is matched by the `.gitignore` `plates/` entry (which was intended to gitignore only the top-level tile directory). Files are already tracked in git, so `git add` errored with "ignored" hint but the staged changes committed successfully. This is a pre-existing gitignore over-match; out of scope for this plan.
- `npm run build` emits `ENOTEMPTY: directory not empty, rename .11ty-vite -> _site/` at the Vite rename step when run inside a worktree. This is a known worktree-environment artifact — Eleventy itself reported "Copied 1362 Wrote 1463 files" and generated all 98 plate pages correctly before the Vite rename step. The issue is in the test environment, not the code.

## User Setup Required

None - no external service configuration required for this plan. The `upload-plates.js` script is ready to run when the operator is ready to upload tiles to CDN (Plan 02 scope).

## Next Phase Readiness

- Build now generates 98 plate pages in CI using committed `data/plates.json`
- Templates serve tilesUrl and thumbnails from `https://pnwmoths.b-cdn.net/plates/{slug}/`
- `scripts/upload-plates.js` is ready for Plan 02: run `BUNNY_API_KEY=xxx node scripts/upload-plates.js` from the local dev machine where `plates/` tile directories exist

---
*Phase: 18-plates-cdn-migration*
*Completed: 2026-04-23*
