---
phase: 18-plates-cdn-migration
plan: 02
subsystem: infra
tags: [bunny.net, cdn, upload, zoomify, openseadragon]

requires:
  - phase: 18-01
    provides: scripts/upload-plates.js, data/plates.json, CDN-wired templates

provides:
  - 16,270 Zoomify tile files live on bunny.net CDN under plates/ prefix
  - Plate index page showing 96 thumbnail images from CDN
  - Plate detail OpenSeadragon viewer loading tiles from CDN

affects: []

tech-stack:
  added: []
  patterns:
    - "upload-plates.js: progress file (.upload-plates-progress) enables resume after failure"
    - "upload-plates.js: retry with linear backoff (5 attempts, 2s steps) for transient curl errors"

key-files:
  created: []
  modified:
    - scripts/upload-plates.js

key-decisions:
  - "Added progress-file resume: .upload-plates-progress records each uploaded path; re-run skips already-done files"
  - "Added 5-attempt retry with 2s/4s/6s/8s backoff after two connection-reset failures at 6100 and 14900 files"
  - "plate-98-noctuidae spot-check slug in plan was wrong; actual last plate is plate-96-noctuidae-lxvii-noctuinae-noctuini-xxi (manifest has 96 slugs, numbers up to 98 with gaps)"

patterns-established:
  - "Long one-time upload scripts should track progress to a file for safe resume"

requirements-completed:
  - PLATES-05
  - PLATES-06

duration: ~45min (including two failed runs before resume/retry fixes)
completed: 2026-04-23
---

# Phase 18-02: Plates CDN Upload Summary

**16,270 Zoomify tile files uploaded to bunny.net CDN; plate index shows 96 thumbnails from CDN; OpenSeadragon deep-zoom viewer confirmed working in browser**

## Performance

- **Duration:** ~45 min (including two interrupted runs)
- **Completed:** 2026-04-23
- **Tasks:** 2 (upload + browser checkpoint)
- **Files modified:** 1 (upload-plates.js)

## Accomplishments

- All 16,270 tile files (96 plate slugs + manifest.json) live on bunny.net under `pnwmoths/plates/`
- CDN delivery confirmed: first tile, first thumbnail, and last-plate thumbnail all return HTTP 200
- Browser checkpoint passed: plate index shows 96 thumbnails from `pnwmoths.b-cdn.net`; OpenSeadragon viewer loads and zooms from CDN

## Task Commits

1. **Resume fix** - `8455506` (feat: add resume via .upload-plates-progress)
2. **Retry fix** - `cf5df92` (feat: add 5-attempt retry with linear backoff)
3. **Upload run** — manual execution, no commit (one-time operation)

## Files Created/Modified

- `scripts/upload-plates.js` — added progress-file resume and retry-with-backoff

## Decisions Made

- **Resume via progress file:** Two connection resets mid-upload (at 6,100 and 14,900 files) before retry logic was added. Progress file meant each re-run only uploaded remaining files.
- **Retry backoff:** 5 attempts with 2s linear steps handles transient `Connection reset by peer` (curl exit 35) without user intervention.
- **API key rotation recommended:** Key appeared in terminal error output; user should rotate after upload.

## Deviations from Plan

### Auto-fixed Issues

**1. Transient connection resets crashing upload mid-run**
- **Found during:** Task 1 (upload execution) — two crashes at 6,100 and 14,900 files
- **Issue:** `execFileSync` throws on any non-zero curl exit, including transient `Connection reset by peer` (exit 35)
- **Fix 1:** Added `.upload-plates-progress` file tracking so re-runs skip already-uploaded files
- **Fix 2:** Wrapped curl call in retry loop (5 attempts, 2s linear backoff)
- **Files modified:** scripts/upload-plates.js
- **Committed in:** 8455506, cf5df92

---

**Total deviations:** 1 auto-fixed (resilience improvement)
**Impact on plan:** Necessary for reliable upload of 16k files. No scope creep.

## Issues Encountered

- Upload failed twice before retry/resume fixes were added (connection resets at ~38% and ~92% completion)
- plan's spot-check used slug `plate-98-noctuidae` which doesn't exist — actual last slug is `plate-96-noctuidae-lxvii-noctuinae-noctuini-xxi`

## Next Phase Readiness

- Phase 18 complete — production regression fixed
- plates/ can remain gitignored; data/plates.json is the committed source of truth
- .upload-plates-progress can be deleted (upload is done)
- API key should be rotated (appeared in terminal output during failed runs)

---
*Phase: 18-plates-cdn-migration*
*Completed: 2026-04-23*
