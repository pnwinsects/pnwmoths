---
phase: 28-end-to-end-vertical-slice-pilot-one-species
plan: 05
subsystem: data
tags: [species-photos, eleventy, osd, pilot, cors, webp]

requires:
  - phase: 28-01
    provides: confirmed vips parameters + local tile pyramids
  - phase: 28-02
    provides: data loader + empty JSON manifest
  - phase: 28-03
    provides: live CDN tiles + CORS status
  - phase: 28-04
    provides: OSD wiring in pnwm-image-slideshow + species.njk attributes

provides:
  - data/species-photos.json — real pilot entry for abagrotis-apposita
  - PILOT-LESSONS.md — config seed for Phase 29/30/32
  - OSD viewer verified end-to-end against production CDN in real browser
  - Eleventy variable naming issue discovered and fixed (kebab filename → camelCase)

affects:
  - 29 (reads PILOT-LESSONS.md tile params + URL convention for committed config)
  - 30 (reads PILOT-LESSONS.md storage footprint estimates)
  - 31 (uses speciesPhotos.js loader — camelCase filename required)
  - 32 (reads PILOT-LESSONS.md OSD config surprises; WebGL CORS note)

tech-stack:
  added: []
  patterns: [Eleventy _data filename must be a valid JS identifier — use camelCase, not kebab]

key-files:
  created:
    - .planning/phases/28-end-to-end-vertical-slice-pilot-one-species/PILOT-LESSONS.md
  modified:
    - data/species-photos.json
    - src/_data/speciesPhotos.js (renamed from species-photos.js)
    - src/components/pnwm-image-slideshow.js (showNavigator: false)

key-decisions:
  - "Eleventy 3.x uses filename stem verbatim — renamed species-photos.js to speciesPhotos.js"
  - "showNavigator: false — navigator renders black rectangle due to WebGL cross-origin texture limitation"
  - "WebGL CORS warning is non-fatal; OSD falls back to Canvas; deferred to Phase 32"

patterns-established:
  - "Eleventy _data files with camelCase filenames are safe; kebab filenames produce invalid Nunjucks identifiers"

requirements-completed:
  - PILOT-01

duration: ~1 session (2026-05-22)
completed: 2026-05-22
---

# Plan 28-05: Pilot Cap — JSON Entry + Browser Verification + Lessons Summary

**OSD viewer verified end-to-end on `abagrotis-apposita` against production CDN; Eleventy filename bug fixed; PILOT-LESSONS.md committed as Phase 29/30/32 config seed**

## Performance

- **Completed:** 2026-05-22
- **Tasks:** 3 of 3
- **Files modified:** 4 (data/species-photos.json, speciesPhotos.js rename, component fix, PILOT-LESSONS.md)

## Accomplishments

- `data/species-photos.json` populated with real `abagrotis-apposita` entry; build produces exactly 1 page with `high-res-available` attribute
- OSD viewer verified in browser: tiles load from CDN, pan/zoom/home work, open/close cycle clean, no errors
- Two non-pilot species pages confirmed unchanged (Phase 23 static lightbox)
- Eleventy camelCase filename issue discovered and fixed (`species-photos.js` → `speciesPhotos.js`)
- `showNavigator: false` applied after pilot revealed black rectangle from WebGL CORS limitation
- PILOT-LESSONS.md authored with all required sections; answers RESEARCH.md Open Questions 1–3

## Task Commits

1. **Task 1: Add JSON entry + build verify** — `5d71b7cd` (fix — includes rename)
2. **Task 2: Browser verify** — no commit (visual verification)
3. **Task 3: PILOT-LESSONS.md + showNavigator fix** — `bc2981cd`

## Decisions Made

- Eleventy 3.1.5 uses filename stem verbatim (not camelCased). Renamed the data file; pattern documented in PILOT-LESSONS.md for Phase 31.
- `showNavigator` disabled after pilot confirmed black rectangle. Root cause: WebGL can't texture cross-origin images even with `Access-Control-Allow-Origin: *` without additional `crossOrigin` handling. OSD Canvas fallback works fine.

## Issues Encountered

- **Eleventy variable naming (silent failure):** `species-photos.js` exposed as `species-photos` (not `speciesPhotos`); Nunjucks silently resolved it to `undefined` so the `{% if %}` block never fired and zero pages emitted `high-res-available`. Fixed by renaming the file.
- **WebGL CORS warning (non-fatal):** `tex(Sub)Image[23]D: Cross-origin elements require CORS` — OSD falls back to Canvas; all tiles load correctly. Navigator mini-map cannot use WebGL path and rendered black. Deferred WebGL fix to Phase 32.

## RESEARCH.md Open Questions Resolved

| Question | Answer |
|----------|--------|
| OQ-1: CORS on .dzi XHR | `access-control-allow-origin: *` after enabling bunny.net Pull Zone CORS toggle + adding `dzi` to extension list |
| OQ-2: vips tile params | `--tile-size 256 --overlap 1 --suffix .webp[Q=80] --layout dz` confirmed correct |
| OQ-3: OSD config surprises | `showNavigator` → black rectangle (WebGL CORS); disabled. All other defaults fine. |

## Next Phase Readiness

Phase 28 is complete. PILOT-LESSONS.md is the config seed for:
- **Phase 29** (bulk tiling): vips params, WebP format, tile count estimates
- **Phase 30** (bulk upload): storage footprint (~8.5 GB), CORS already configured
- **Phase 32** (generalized OSD): WebGL CORS issue, filename convention, no navigator

---
*Phase: 28-end-to-end-vertical-slice-pilot-one-species*
*Completed: 2026-05-22*
