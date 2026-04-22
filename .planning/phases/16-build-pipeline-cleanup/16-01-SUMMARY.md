---
phase: 16-build-pipeline-cleanup
plan: 01
subsystem: infra
tags: [build, copy-images, npm, pipeline, cdn, lfs]

requires:
  - phase: 15-lfs-removal
    provides: images/ directory removed from repo; Git LFS fully purged from history

provides:
  - scripts/copy-images.js without dead speciesSrc block (no ENOENT on fresh clone)
  - Confirmed: no image resize scripts anywhere in scripts/ or package.json
  - npm run build:copy-images copies exactly 4 assets (banner, styles, Pico CSS, OSD)

affects: [ci-deploy, fresh-clone-builds, phase-17-species-data]

tech-stack:
  added: []
  patterns:
    - "copy-images.js has exactly 4 copy operations: banner, styles, Pico CSS, OSD nav images"

key-files:
  created: []
  modified:
    - scripts/copy-images.js

key-decisions:
  - "No resize scripts ever existed in scripts/ — PIPE-02 confirmed clean by inspection"
  - "package.json required no changes — build chain already contained no resize step"

patterns-established:
  - "copy-images.js is the single post-Vite asset copy script; species photos are served from CDN only"

requirements-completed: [PIPE-01, PIPE-02]

duration: ~10min
completed: 2026-04-22
---

# Phase 16 Plan 01: Build Pipeline Cleanup Summary

**Removed dead `speciesSrc` copy block from `scripts/copy-images.js` that would throw ENOENT on fresh clone; confirmed no image resize scripts exist in the build pipeline**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-04-22T22:44:00Z
- **Completed:** 2026-04-22T22:54:02Z
- **Tasks:** 3 (2 auto + 1 auto-approved checkpoint)
- **Files modified:** 1

## Accomplishments

- Removed the 5-line species photo copy block (`speciesSrc`/`speciesDest`) from `scripts/copy-images.js` that referenced the now-absent `images/` directory — would have caused `ENOENT` crashes on every fresh clone
- Updated the JSDoc comment block to list only the 4 remaining copy operations (banner, styles, Pico CSS, OSD)
- Verified no image resize scripts (`sharp`, `jimp`, `imagemin`, `magick`) exist anywhere in `scripts/` or `package.json`; PIPE-02 is confirmed clean
- `npm run build:copy-images` exits 0 and prints exactly 4 "Copied ..." lines; `npm run build` exits 0

## Task Commits

1. **Task 1: Remove species photo copy block** - `27767a0` (fix)
2. **Task 2: Verify no resize scripts, confirm build clean** - no commit (verification only; no files changed)
3. **Task 3: Push to main and verify CI deploy + CDN image delivery** - auto-approved checkpoint (auto_advance mode)

## Files Created/Modified

- `scripts/copy-images.js` — removed speciesSrc/speciesDest block and updated JSDoc; 4 copy operations remain

## Decisions Made

- No changes to `package.json` were needed — inspection confirmed the build script chain already contained no resize step (PIPE-02 already satisfied)
- Task 2 was verification-only; no commit was created since no files were modified

## Deviations from Plan

None — plan executed exactly as written. The plan correctly anticipated that Task 2 would likely be verification-only.

## Issues Encountered

None. The `browse/index.html` page-weight warning (711 KB > 500 KB threshold) is pre-existing and unrelated to this task.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. T-16-03 (ENOENT DoS on `cp(speciesSrc, ...)`) is fully mitigated by this plan — the offending block is removed.

## Known Stubs

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Build pipeline is clean: fresh clones will no longer encounter ENOENT from the dead species photo copy block
- `npm run build` and `npm run build:copy-images` verified working locally
- Pending: push to main and watch GitHub Actions CI complete (Task 3 checkpoint — user verifies when convenient)
- Phase 17 (Migrate Full Species Data) can proceed independently; no dependency on CI deploy

---
*Phase: 16-build-pipeline-cleanup*
*Completed: 2026-04-22*
