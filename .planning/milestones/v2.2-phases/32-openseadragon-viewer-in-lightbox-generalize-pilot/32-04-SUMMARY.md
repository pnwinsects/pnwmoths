---
phase: 32-openseadragon-viewer-in-lightbox-generalize-pilot
plan: "04"
subsystem: verification
tags:
  - verification
  - human-verify
  - regression
dependency_graph:
  requires:
    - 32-01
    - 32-02
    - 32-03
  provides:
    - Phase 32 end-to-end verification
key_files:
  created: []
  modified:
    - src/species/species.njk
    - src/components/pnwm-image-slideshow.js
decisions:
  - "Thumbnail URL: tiles_path already includes specimen dir (A-D), so template uses tiles_path + _thumbnail.webp without repeating specimen_id-view"
  - "srcset 530w/1060w/1500w with sizes=530px — 2x screens get 1060w without downloading full 1500px source"
  - "Arrow keys in lightbox: high-res uses _prevSpecimen/_nextSpecimen (OSD swap); non-high-res uses _currentIndex arithmetic on _images[]"
  - "Arrow keys outside lightbox: not handled — would conflict with page scroll; deliberate omission"
metrics:
  completed: "2026-05-24"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 2
requirements:
  - VIEWER-01
  - VIEWER-02
  - VIEWER-03
  - VIEWER-04
---

# Phase 32 Plan 04: End-to-End Verification Summary

**One-liner:** Browser verification passed with three fixes applied during the checkpoint: thumbnail URL path, srcset for HiDPI, and arrow key navigation in both lightbox modes.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Build + automated regression checks | — (read-only) | — |
| 2 | Human-verify checkpoint | afdd0805, b1de2f2a, 05a2cc97 | species.njk, pnwm-image-slideshow.js |

## Automated Checks (Task 1)

- `npm test`: 217/217 pass
- `npm run build`: 1,484 files, no errors
- `abagrotis-apposita/index.html`: 2 `_thumbnail.webp` references, correct figcaption order
- Control species (`abagrotis-baueri`): 4 low-res CDN figures, zero DZI references — Phase 23 regression clean

## Human Verify Results (Task 2)

**Pilot species (abagrotis-apposita — high-res, 2 specimens):** APPROVED
- Thumbnails load from CDN (`A-D_thumbnail.webp`, `A-V_thumbnail.webp`) ✓
- OSD lightbox opens on main-slide click; pan/zoom/home work ✓
- Prev/next buttons visible; specimen swap without flicker; wrap-around ✓
- Close button (`×`) dismisses lightbox with OSD active ✓
- Escape dismisses ✓
- Arrow keys advance specimens in OSD lightbox ✓

**Control species (abagrotis-baueri — non-high-res):** APPROVED
- Phase 23 carousel + static lightbox behavior preserved ✓
- No prev/next buttons in lightbox ✓
- Arrow keys navigate photos in non-high-res lightbox ✓

**Single-specimen high-res:** n/a — only one high-res species in dataset, it has 2 specimens.

## Fixes Applied During Verification

1. **Thumbnail URL path** (`afdd0805`): template was appending `/{specimen_id}-{view}` to `tiles_path` which already ends in `A-D` → URL was 404. Fixed to `{{ tiles_path }}_thumbnail.webp`.
2. **Bunny resize + srcset** (`b1de2f2a` / `05a2cc97`): added `?width=530` base URL and `srcset="...530w, ...1060w, ...1500w" sizes="530px"` for HiDPI support.
3. **Arrow keys** (`afdd0805`, `05a2cc97`): corrected scope — keys work inside lightbox (both OSD and non-high-res modes); no carousel arrow keys outside lightbox (would conflict with page scroll).

## Deviations from Plan

- Plan must_haves referenced "level-0 tiles" — stale after Plan 03 switched to `_thumbnail.webp`. All acceptance criteria met against the actual implementation.
- Section C (single-specimen high-res) was n/a — no such species in current dataset.

## Self-Check: PASSED
