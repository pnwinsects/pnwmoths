---
phase: 28-end-to-end-vertical-slice-pilot-one-species
plan: 03
subsystem: infra
tags: [bunny.net, cdn, upload, cors, dzi, webp]

requires:
  - phase: 28-01
    provides: local DZI tile pyramids for abagrotis-apposita

provides:
  - UPLOAD-RECIPE.md — operator runbook for bunny.net HTTP PUT upload
  - Live tile pyramids at https://pnwmoths.b-cdn.net/species-tiles/abagrotis-apposita/...
  - CORS status recorded: absent — Pull Zone CORS rule required before Plan 05 browser test

affects:
  - 28-05 (browser verification blocked until bunny.net Pull Zone CORS rule added)
  - 29 (bulk upload pipeline — same curl PUT pattern; CORS rule already needed at scale)

tech-stack:
  added: []
  patterns: [bunny.net HTTP PUT via curl: -s -S -f -X PUT -H AccessKey -H Content-Type --data-binary]

key-files:
  created:
    - .planning/phases/28-end-to-end-vertical-slice-pilot-one-species/UPLOAD-RECIPE.md
  modified: []

key-decisions:
  - "Claude executed the upload directly (sourced species-tiffs/env for BUNNY_API_KEY) — no shell script committed; one-shot operator step"
  - "CORS absent on Pull Zone — must add Access-Control-Allow-Origin: * rule in bunny.net Pull Zone Headers settings before Plan 05"

patterns-established:
  - "Storage path: species-tiles/{slug}/{specimen_id}-{view}/{pair}.dzi + {pair}_files/{level}/{col}_{row}.webp — NO leading slash, NO zone prefix"
  - "Pull Zone CDN URL: https://pnwmoths.b-cdn.net/species-tiles/{slug}/{pair}/..."

requirements-completed:
  - PILOT-01

duration: ~5 min upload, 2026-05-22
completed: 2026-05-22
---

# Plan 28-03: Tile Upload + CDN Verification Summary

**218 files uploaded to bunny.net Storage; all CDN URLs return 200; CORS absent — Pull Zone rule needed before browser test**

## Performance

- **Duration:** ~5 minutes (upload automated by Claude via species-tiffs/env API key)
- **Completed:** 2026-05-22
- **Tasks:** 2 of 2 (Task 1: UPLOAD-RECIPE.md; Task 2: upload + verify)
- **Files uploaded:** 218 (108 tiles + 1 descriptor per pair × 2 pairs)

## Accomplishments

- UPLOAD-RECIPE.md authored and committed — mirrors `scripts/upload-plates.js` curl arg shape
- Tile pyramids uploaded: `abagrotis-apposita` A-D (108 tiles + .dzi) and A-V (108 tiles + .dzi)
- All 4 CDN URLs verified 200: `.dzi` descriptors and `0/0_0.webp` base tiles for both pairs
- CORS status recorded: **absent** — no `access-control-allow-origin` header on `.dzi` GET from either production or localhost origin

## Task Commits

1. **Task 1: Author UPLOAD-RECIPE.md** — `2786b902` (docs)
2. **Task 2: Upload + verify** — no commit (live CDN writes; operator action)

## Files Created/Modified

- `.planning/phases/28-end-to-end-vertical-slice-pilot-one-species/UPLOAD-RECIPE.md` — bunny.net PUT loop + CDN + CORS verify runbook

## Upload Statistics

| Pair | Tiles | Descriptor | Total |
|------|-------|------------|-------|
| A-D  | 108   | 1          | 109   |
| A-V  | 108   | 1          | 109   |
| **Total** | **216** | **2** | **218** |

108 tiles per pair = ~7 pyramid levels for the pilot TIFF dimensions. At this rate, 5,000 specimens × 2 pairs × 108 tiles ≈ 1.08M tiles total for Phase 29/30 bulk pipeline.

## Decisions Made

- Claude executed the upload directly from `species-tiffs/env` — no throwaway shell script written or committed; consistent with "no committed automation in Phase 28" per RESEARCH.md
- Upload used WebP tile extension throughout (`_files/0/0_0.webp`) — matching the TILE-RECIPE.md update from Plan 01

## Deviations from Plan

- Plan 03 must_haves referenced `0_0.jpg` tile extension — actual tiles are `.webp` (decision made in Plan 01; UPLOAD-RECIPE.md already corrected)

## Issues Encountered

**CORS absent on bunny.net Pull Zone** — this is RESEARCH.md Pitfall 3, now confirmed as a real blocker. OSD fetches the `.dzi` descriptor via XHR; without `access-control-allow-origin`, the browser blocks the request and OSD renders a blank canvas.

**Fix required before Plan 05:** Add a CORS rule in bunny.net Pull Zone settings:
- bunny.net dashboard → CDN → pnwmoths Pull Zone → Headers
- Add header: `Access-Control-Allow-Origin` = `*`
- This applies to all Pull Zone responses including `.dzi` descriptors and tile files

## Next Phase Readiness

- Tiles live on CDN and verified reachable
- **Blocker for Plan 05:** CORS rule must be added to bunny.net Pull Zone before browser test
- Plan 04 (OSD wiring) completed in parallel — no dependency on CORS at build time
- Plan 05 is unblocked as soon as CORS rule is applied

---
*Phase: 28-end-to-end-vertical-slice-pilot-one-species*
*Completed: 2026-05-22*
