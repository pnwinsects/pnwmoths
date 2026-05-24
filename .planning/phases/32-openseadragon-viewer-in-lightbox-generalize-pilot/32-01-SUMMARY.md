---
phase: 32-openseadragon-viewer-in-lightbox-generalize-pilot
plan: "01"
subsystem: templates
tags:
  - templates
  - nunjucks
  - eleventy
  - high-res
  - osd
dependency_graph:
  requires:
    - 31-01  # data/species-photos.json build integration
  provides:
    - high-res figure rendering for pnwm-image-slideshow
  affects:
    - src/species/species.njk
tech_stack:
  added: []
  patterns:
    - "Nunjucks {% elif %} branch for high-res specimen figures"
    - "Level-0 DZI tile as static img src"
    - "onerror inline style gray placeholder (D-05)"
key_files:
  created: []
  modified:
    - src/species/species.njk
decisions:
  - "Figure order matches highResEntry.specimens array order (D-03) — {% for %} preserves JSON order; no sort applied"
  - "onerror inline style (this.style.background='#ddd') chosen over class toggle for zero CSS coupling and no shadow-DOM interference"
  - "{% else %} replaces {% elif not (highResEntry...) %} — mutually exclusive three-branch conditional is cleaner and correct"
metrics:
  duration: "5m 32s"
  completed: "2026-05-24T04:05:15Z"
  tasks_completed: 1
  tasks_total: 1
  files_modified: 1
requirements:
  - VIEWER-01
  - VIEWER-03
---

# Phase 32 Plan 01: Add High-Res Specimen Figures to species.njk Summary

**One-liner:** Three-branch Nunjucks conditional with level-0 DZI tile figures, onerror gray placeholder (D-05), and Dorsal/Ventral captions for all `high_res_available: true` species.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add {% elif highResEntry %} branch to species.njk | 33a35bec | src/species/species.njk |

## What Was Built

Restructured the two-branch conditional in `src/species/species.njk` (lines 47-70) into a three-branch conditional:

1. **Low-res branch** (unchanged): `{% if (not highRes) and spImages and spImages.length > 0 %}`
2. **NEW high-res branch**: `{% elif highResEntry and highResEntry.high_res_available %}` — renders one `<figure>` per specimen with level-0 DZI tile `<img>` and Dorsal/Ventral `<figcaption>`
3. **No-photo fallback** (converted from `{% elif not highRes %}` to `{% else %}`): "No photos on file for this species."

**Diff summary (species.njk):**
- Lines changed: +10 / -1 (net +9 lines)
- Removed: `{% elif not (highResEntry and highResEntry.high_res_available) %}` arm
- Added: `{% elif highResEntry and highResEntry.high_res_available %}` branch with `{% for specimen in highResEntry.specimens %}` loop, `<figure>`, `<img>`, `onerror`, `<figcaption>`
- Changed: no-photo arm to `{% else %}`

## Verification Results

**Build output:**
- Eleventy wrote 1484 files successfully (1380 species pages + other pages)
- Page count unchanged from Phase 31 baseline

**Pilot species (`abagrotis-apposita`) HTML inspection:**
- Figure count: 2 (exactly matching 2-specimen JSON entry)
- `<img>` srcs: `https://pnwmoths.b-cdn.net/species-tiles/abagrotis-apposita/A-D/A-D_files/0/0_0.webp` and `.../A-V/A-V_files/0/0_0.webp`
- onerror count: 2 (D-05 verified — one per figure)
- figcaptions: "Specimen A · Dorsal" and "Specimen A · Ventral" (correct order — D array first)
- No low-res `<img src="https://pnwmoths.b-cdn.net/abagrotis-apposita/...">` (DATA-03 guard preserved)

**Regression check (non-high-res species `acronicta-americana`):**
- Figure count: 6 (all low-res figures unchanged)
- No `onerror` attribute (expected)

**Test suite:** 207/207 pass (no regressions)

## Deviations from Plan

None — plan executed exactly as written.

The Vite post-processing step (`ENOTEMPTY` on rename) failed in the worktree environment but is a pre-existing infrastructure issue not caused by this template change. The Eleventy template compilation step completed successfully (1484 files) and the correct HTML is in `_site/`. This issue exists identically with the pre-change template.

## Known Stubs

None — the `{% elif %}` branch is fully wired to `highResEntry.specimens` data from `data/species-photos.json`. As `photos:materialize` adds more species to the JSON, they automatically render high-res figures without any code change.

## Threat Flags

No new security-relevant surface introduced. The threat register (T-32-01-01 through T-32-01-05) covers all interpolation points:
- `specimen.specimen_id` and `specimen.view` in figcaption text: Nunjucks auto-escapes HTML (T-32-01-02)
- Level-0 tile URL in `<img src>`: public CDN asset, no secret (T-32-01-03)
- Inline `onerror` attribute: literal string, no user input (T-32-01-05)

## Self-Check

**Files created:**
- `.planning/phases/32-openseadragon-viewer-in-lightbox-generalize-pilot/32-01-SUMMARY.md`: this file

**Files modified:**
- `src/species/species.njk`: FOUND (confirmed via grep of acceptance criteria literals)

**Commits:**
- `33a35bec`: feat(32-01): add {% elif highResEntry %} branch for high-res specimen figures

## Self-Check: PASSED
