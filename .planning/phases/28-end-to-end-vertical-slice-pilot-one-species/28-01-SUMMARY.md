---
phase: 28-end-to-end-vertical-slice-pilot-one-species
plan: 01
subsystem: infra
tags: [vips, libvips, dzi, deep-zoom, webp, tile-pipeline]

requires: []

provides:
  - TILE-RECIPE.md — operator runbook for vips dzsave with confirmed parameters
  - Local DZI tile pyramids for abagrotis-apposita (2 pairs, operator hardware)

affects:
  - 28-03 (operator uploads these local tiles to bunny.net)
  - 29 (bulk tile generation — pins the same confirmed vips parameters)

tech-stack:
  added: [libvips 8.18.2 (operator local)]
  patterns: [vips dzsave --tile-size 256 --overlap 1 --suffix .webp[Q=80] --layout dz]

key-files:
  created:
    - .planning/phases/28-end-to-end-vertical-slice-pilot-one-species/TILE-RECIPE.md
  modified: []

key-decisions:
  - "WebP over JPEG for tile format — ~30% smaller (1.2 MB → ~850 KB per pair on pilot TIFFs); OSD handles Format=\"webp\" in .dzi descriptor correctly"
  - "Pilot species: abagrotis-apposita — 1 specimen (A), 2 views (D+V), clean-match bucket"

patterns-established:
  - "Tile output prefix: {specimen_id}-{view} (hyphen-separated) — matches bunny.net upload path species-tiles/{slug}/{specimen_id}-{view}/"
  - "vips confirmed flags: --tile-size 256 --overlap 1 --suffix .webp[Q=80] --layout dz"

requirements-completed:
  - PILOT-01

duration: ~1 session (split across maderas + laptop due to OOM)
completed: 2026-05-22
---

# Plan 28-01: Tile Recipe + Local Pilot Tiles Summary

**Operator runbook (TILE-RECIPE.md) authored and confirmed; vips 8.18.2 produces correct DZI WebP pyramids; abagrotis-apposita tiled locally (2 pairs, ~1.7 MB total)**

## Performance

- **Duration:** split session (maderas OOM → resumed on laptop)
- **Completed:** 2026-05-22
- **Tasks:** 2 of 2
- **Files created:** 1 committed (TILE-RECIPE.md)

## Accomplishments

- TILE-RECIPE.md authored as operator runbook — section structure mirrors `_instructions/ADDING_PLATE.md`
- Pilot species selected: `abagrotis-apposita` (1 specimen, D+V views, clean-match bucket)
- 2 tile pyramids produced locally: `A-D` and `A-V`, ~850 KB each (WebP)
- WebP chosen over JPEG: ~30% size reduction confirmed on real TIFF input; Format="webp" in .dzi descriptor; OSD resolves tile URLs correctly
- TILE-RECIPE.md updated post-run to reflect confirmed WebP parameters and drop [ASSUMED] qualifier

## Task Commits

1. **Task 1: Author TILE-RECIPE.md** — `ac1e3555` (docs), updated `ef81c82f` (WebP switch)
2. **Task 2: Operator tiles pilot species** — local only; no commit (tiles in /tmp/)

## Files Created/Modified

- `.planning/phases/28-end-to-end-vertical-slice-pilot-one-species/TILE-RECIPE.md` — operator runbook; confirmed vips parameters; WebP throughout

## Decisions Made

- **WebP over JPEG** — user raised during checkpoint; ~30% smaller confirmed on pilot; adopted for all tile output going forward. Phase 29 bulk pipeline should use the same `--suffix .webp[Q=80]` flag.

## Deviations from Plan

- **Format changed from JPEG to WebP** — plan specified `--suffix .jpg[Q=85]`; confirmed WebP is both feasible and desirable; TILE-RECIPE.md updated accordingly before closing.

## Issues Encountered

- Session OOM-killed on maderas mid-Wave-1; resumed on laptop. Images not available on laptop initially; user tiled on whichever machine had the TIFFs and reported results.
- Erroneous second species directory (`Agagrotis-cupida`) created by typo; discarded — local /tmp/ only, no committed artifacts affected.
- Local tile directories use mixed-case (`Abagrotis-apposita`) — Plan 03 upload path must use lowercase slug (`species-tiles/abagrotis-apposita/...`).

## Next Phase Readiness

- Local tiles ready for Plan 03 (operator upload to bunny.net Storage)
- Confirmed vips parameters ready for Phase 29 bulk pipeline
- Lowercase slug convention must be enforced at upload time (Plan 03)

---
*Phase: 28-end-to-end-vertical-slice-pilot-one-species*
*Completed: 2026-05-22*
