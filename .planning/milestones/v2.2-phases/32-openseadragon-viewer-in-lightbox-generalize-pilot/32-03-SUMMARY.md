---
phase: 32-openseadragon-viewer-in-lightbox-generalize-pilot
plan: "03"
subsystem: pipeline
tags:
  - pipeline
  - thumbnails
  - vips
  - bunny
dependency_graph:
  requires:
    - 32-01
    - 32-02
  provides:
    - per-specimen thumbnail WebP generation in tile-photos.js
    - thumbnail upload + cleanup in upload-tiles.js
    - carousel img pointing to _thumbnail.webp
  affects:
    - scripts/tile-photos.js
    - scripts/upload-tiles.js
    - scripts/tile-config.json
    - src/species/species.njk
tech_stack:
  added: []
  patterns:
    - "vips thumbnail at thumbnailWidth=1500 produces single-file WebP after dzsave"
    - "existsSync guard in upload-tiles.js skips rows tiled before thumbnail support"
    - "Bunny CDN PUT for _thumbnail.webp alongside _files/ and .dzi assets"
key_files:
  created: []
  modified:
    - scripts/tile-config.json
    - scripts/tile-photos.js
    - scripts/upload-tiles.js
    - src/species/species.njk
decisions:
  - "runVipsThumbnail placed immediately after runVipsDzsave so both run from the same cached TIFF before deletion"
  - "existsSync guard in upload-tiles.js means rows tiled before this change are silently skipped (no upload failure)"
  - "Thumbnail cleanup uses same existsSync guard pattern as the upload"
  - "Backfill thumbnails reconstructed from CDN DZI level-12 tiles (stitched via vips arrayjoin) instead of re-downloading TIFFs due to expired DROPBOX_TOKEN — see deviation"
  - "Worktree node_modules symlinked to main repo for build verification (removed after, not committed)"
metrics:
  duration: "25m"
  completed: "2026-05-24T16:10:00Z"
  tasks_completed: 6
  tasks_total: 6
  files_modified: 4
requirements:
  - VIEWER-01
  - VIEWER-03
---

# Phase 32 Plan 03: Thumbnail Pipeline Summary

**One-liner:** Added per-specimen WebP thumbnail generation (`vips thumbnail` at 1500px) to the tiling and upload pipeline, backfilled thumbnails for 2 pilot specimens via CDN tile stitching, and wired `species.njk` carousel to `_thumbnail.webp`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add thumbnailWidth to tile-config.json | 03717119 | scripts/tile-config.json |
| 2 | Add runVipsThumbnail to tile-photos.js | c6013d35 | scripts/tile-photos.js |
| 3 | Add thumbnail upload + cleanup to upload-tiles.js | c4a35605 | scripts/upload-tiles.js |
| 4 | Backfill pilot thumbnails (operational) | n/a | CDN: A-D_thumbnail.webp, A-V_thumbnail.webp |
| 5 | Update species.njk to use thumbnail URL | 5d0dbf98 | src/species/species.njk |
| 6 | Build and test (verification) | n/a | verified: 1484 files, 217 tests pass |

## What Was Built

### Task 1: tile-config.json
Added `"thumbnailWidth": 1500` field so all tiling and backfill scripts read the desired thumbnail width from a single source of truth.

### Task 2: tile-photos.js
Added `runVipsThumbnail(sourceTiff, prefix, config)` function that invokes `vips thumbnail sourceTiff[unlimited] {prefix}_thumbnail.webp {thumbnailWidth}`. Called immediately after `runVipsDzsave()` in the tile stage of `main()`, before the cached TIFF is deleted.

### Task 3: upload-tiles.js
In the per-row upload loop:
- Added thumbnail upload block (with `existsSync` guard) between `_files/` tile upload and `.dzi` descriptor upload
- Added thumbnail file deletion after `advanceStatus(row, 'uploaded')` in the post-upload cleanup block

### Task 4: Backfill (operational)
Thumbnails for both pilot specimens uploaded to:
- `https://pnwmoths.b-cdn.net/species-tiles/abagrotis-apposita/A-D_thumbnail.webp` — HTTP 200
- `https://pnwmoths.b-cdn.net/species-tiles/abagrotis-apposita/A-V_thumbnail.webp` — HTTP 200

### Task 5: species.njk
Changed carousel `<img src>` from `_files/8/0_0.webp` to `_thumbnail.webp` in the high-res specimen figure loop.

### Task 6: Build and test verification
- Eleventy: 1484 files written (1380+ species pages) — passes
- `grep -o '_thumbnail.webp' _site/species/abagrotis-apposita/index.html | wc -l` → 2 (A-D and A-V)
- Test suite: 217/217 pass (0 failures)

## Deviations from Plan

### Rule 3 — DROPBOX_TOKEN Expired During Backfill

**Found during:** Task 4
**Issue:** The `DROPBOX_TOKEN` in `species-tiffs/env` returned a 401 `expired_access_token` error when the backfill script attempted to download the TIFF files from Dropbox.
**Fix:** Bypassed Dropbox entirely. Instead of downloading the source TIFFs, the thumbnail was reconstructed by:
1. Downloading all 54 level-12 DZI tiles from the CDN (9 cols × 6 rows per specimen)
2. Stitching them using `vips arrayjoin ... --across 9`
3. Thumbnailing the stitched image to 1500px with `vips thumbnail`
4. Uploading the resulting WebP to Bunny Storage via curl

The stitched image is 2322×1548 (slightly smaller than the 2382×1588 TIFF due to DZI overlap semantics), but produces a clean 1500×1000 WebP thumbnail meeting the acceptance criteria (HTTP 200 on both CDN URLs).
**Files modified:** None (operational workaround only — no committed code change)
**Backfill script:** Created as `scripts/backfill-thumbnails.mjs`, used, and deleted without committing (per plan instructions).

### Worktree Build Environment (pre-existing)
The worktree lacks a `node_modules` directory. For Task 6 build verification, a temporary symlink was created (`ln -s /Users/rainhead/dev/pnwmoths/node_modules ./node_modules`), the build was verified, then the symlink was removed. The symlink was not committed (gitignored by `node_modules/`).

## Known Stubs

None. All thumbnail references are fully wired:
- `tile-photos.js` generates `_thumbnail.webp` from each tiled TIFF
- `upload-tiles.js` uploads and cleans up `_thumbnail.webp` per row
- `species.njk` carousel references `_thumbnail.webp` from CDN
- Pilot thumbnails are live on CDN (HTTP 200 confirmed)

## Threat Flags

No new security-relevant surface introduced. Template interpolation points (`specimen.tiles_path`, `specimen.specimen_id`, `specimen.view`) are operator-controlled manifest data — same trust boundary as established in 32-01-SUMMARY.md.

## Self-Check

**Files modified:**
- `scripts/tile-config.json`: FOUND (thumbnailWidth: 1500 present)
- `scripts/tile-photos.js`: FOUND (runVipsThumbnail at lines 246 + 364)
- `scripts/upload-tiles.js`: FOUND (_thumbnail upload at line 341-356, cleanup at line 381)
- `src/species/species.njk`: FOUND (_thumbnail.webp at line 67)

**CDN verification:**
- `https://pnwmoths.b-cdn.net/species-tiles/abagrotis-apposita/A-D_thumbnail.webp`: HTTP 200
- `https://pnwmoths.b-cdn.net/species-tiles/abagrotis-apposita/A-V_thumbnail.webp`: HTTP 200

**Commits:**
- `03717119`: chore(32-03): add thumbnailWidth: 1500 to tile-config.json
- `c6013d35`: feat(32-03): add runVipsThumbnail helper to tile-photos.js
- `c4a35605`: feat(32-03): add thumbnail upload and cleanup to upload-tiles.js
- `5d0dbf98`: feat(32-03): update species.njk carousel to use _thumbnail.webp

**Build:** 1484 files, `_thumbnail.webp` count: 2 in abagrotis-apposita/index.html
**Tests:** 217/217 pass

## Self-Check: PASSED
