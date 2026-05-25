---
phase: 28-end-to-end-vertical-slice-pilot-one-species
plan: 02
subsystem: data
tags: [eleventy, 11ty-data, json, species-photos, esm]

requires:
  - phase: 26-dropbox-ingest-filename-parser-manifest
    provides: data/species-photos-manifest.csv — source of truth for which species have high-res photos

provides:
  - data/species-photos.json — committed JSON manifest keyed by species slug (empty object, populated in Plan 05)
  - src/_data/species-photos.js — Eleventy 11ty-data loader exposing speciesPhotos template variable
  - build integration verified: Eleventy reads loader, produces full species build without regression

affects:
  - 28-04 (OSD viewer wiring — consumes speciesPhotos template variable)
  - 28-05 (hand-edits data/species-photos.json with real pilot entry)
  - 31 (replaces data/species-photos.json with manifest-derived version at scale)

tech-stack:
  added: []
  patterns: [11ty-data ESM loader with existsSync soft-fail (mirrors src/_data/plates.js manifest-only branch)]

key-files:
  created:
    - data/species-photos.json
    - src/_data/species-photos.js
  modified: []

key-decisions:
  - "Loader returns plain object (JSON as-is) — no field mapping transform, unlike plates.js which remaps fields"
  - "Soft-fail to {} when manifest missing — consistent with build-time graceful degradation pattern"

patterns-established:
  - "species-photos.js loader: existsSync check → JSON.parse(readFile) → return plain object; warn on missing"
  - "data/ JSON manifest + src/_data/ loader pair: same pattern as data/plates.json + src/_data/plates.js"

requirements-completed:
  - PILOT-01

duration: resumed 2026-05-22 (tasks committed on maderas; Task 3 build verification completed on laptop 2026-05-22)
completed: 2026-05-22
---

# Plan 28-02: Species-Photos Data Layer Summary

**ESM Eleventy data loader (`src/_data/species-photos.js`) + empty JSON manifest (`data/species-photos.json`) wired into build; 1,380 species pages produced, 158 tests pass**

## Performance

- **Duration:** resumed across sessions (Tasks 1–2 committed on maderas; Task 3 on laptop)
- **Started:** 2026-05-22
- **Completed:** 2026-05-22
- **Tasks:** 3 of 3
- **Files created:** 2

## Accomplishments

- `data/species-photos.json` committed as empty `{}` — placeholder for Plan 05's hand-edited pilot entry
- `src/_data/species-photos.js` mirrors `plates.js` manifest-only-branch idiom; soft-fails with `console.warn` when JSON missing
- Full Eleventy build green: `npm run build:data && npm run build:eleventy` exits 0; `npm test` passes 158/158

## Task Commits

1. **Task 1: Create data/species-photos.json** — `dd060973` (feat)
2. **Task 2: Create src/_data/species-photos.js loader** — `f4aa7d0d` (feat)
3. **Task 3: Build verification** — (no commit — verification only)

## Files Created/Modified

- `data/species-photos.json` — empty JSON object; schema placeholder for pilot entry (Plan 05)
- `src/_data/species-photos.js` — Eleventy data loader; returns parsed JSON keyed by slug; soft-fails to `{}`

## Decisions Made

- Loader does no field-mapping transform (unlike `plates.js`) — JSON shape IS the template shape per RESEARCH.md Pattern 2
- No unit test for the loader — consistent with existing `_data/` conventions; build integration test (Task 3) is the verification

## Deviations from Plan

### Page count baseline updated

- **Issue:** Plan specified 1,364 species pages (Phase 17 baseline); actual count is **1,380**
- **Cause:** Species database has grown across v2.1 phases (Phases 22–25 added records)
- **Impact:** Not a regression — data loader is not the cause; build is healthy
- **Action:** Updated baseline to 1,380 for downstream plans referencing this figure

## Issues Encountered

Session was OOM-killed on maderas before Task 3 (build verification) ran. Resumed on laptop; verification completed cleanly.

## Next Phase Readiness

- `speciesPhotos` Eleventy template variable is now available in all Nunjucks templates — Plan 04 (OSD wiring) can consume it directly
- Plan 05 hand-edits `data/species-photos.json` with the real pilot entry after the operator tiles + uploads (Plans 01–03)
- Blocking dependency: Plan 28-01 Task 2 (operator must run `vips dzsave` locally) is still outstanding

---
*Phase: 28-end-to-end-vertical-slice-pilot-one-species*
*Completed: 2026-05-22*
