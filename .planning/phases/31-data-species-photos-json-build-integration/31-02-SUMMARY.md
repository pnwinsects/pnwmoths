---
phase: 31-data-species-photos-json-build-integration
plan: "02"
subsystem: ui
tags: [eleventy, nunjucks, template, photos, species]

requires:
  - phase: 31-data-species-photos-json-build-integration-01
    provides: speciesPhotos Eleventy data variable (highResEntry) wired into species.njk template context

provides:
  - DATA-03 guard in species.njk — low-res figure loop suppressed for high_res_available species

affects:
  - 31-data-species-photos-json-build-integration (Phase 32 slot fill — empty slot is the correct intermediate state)
  - Phase 32 OSD viewer wiring (will populate the empty pnwm-image-slideshow slot)

tech-stack:
  added: []
  patterns:
    - "Nunjucks not-and guard with explicit inner parentheses to avoid operator-precedence bugs"

key-files:
  created: []
  modified:
    - src/species/species.njk

key-decisions:
  - "D-04 guard uses explicit inner parentheses (not (highResEntry and highResEntry.high_res_available)) — required by Nunjucks operator precedence (Pitfall 3 in RESEARCH.md)"
  - "Empty figure slot for high-res species is the correct intermediate state; Phase 32 fills it via component-side rendering"

patterns-established:
  - "Nunjucks boolean negation: use `not` keyword (not `!`); wrap compound subexpressions in parentheses"

requirements-completed: [DATA-03]

duration: 15min
completed: 2026-05-24
---

# Phase 31 Plan 02: DATA-03 Template Guard Summary

**One-line Nunjucks guard in species.njk suppresses legacy low-res figure loop for species where high_res_available is true, leaving the pnwm-image-slideshow slot empty for Phase 32 to fill**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-24T00:00:00Z
- **Completed:** 2026-05-24T00:10:27Z
- **Tasks:** 1 of 2 (Task 2 is a human-verify checkpoint)
- **Files modified:** 1

## Accomplishments

- Replaced the single `{% if spImages and spImages.length > 0 %}` conditional at species.njk line 47 with the D-04 guard that also checks `(not (highResEntry and highResEntry.high_res_available))`
- abagrotis-apposita (the only `high_res_available: true` pilot species) now renders with `high-res-available` + `high-res-specimens` attributes but zero low-res `<figure>` elements inside pnwm-image-slideshow
- All 1,380 non-high-res species continue rendering their low-res figure loops unchanged
- Eleventy build exits 0; 1,380 species pages generated (exceeds 1,364 baseline)

## Task Commits

1. **Task 1: Add DATA-03 guard to species.njk** - `fdecb099` (feat)

## Files Created/Modified

- `src/species/species.njk` — line 47 conditional replaced with D-04 guard; no other lines changed

## Decisions Made

None — followed plan as specified. The exact guard wording is locked by D-04 in CONTEXT.md.

## Deviations from Plan

None — plan executed exactly as written.

## Verification Results

| Check | Result |
|-------|--------|
| D-04 guard substring present in species.njk | PASS |
| Old conditional absent from species.njk | PASS |
| `npm run build:eleventy` exits 0 | PASS |
| `_site/species/abagrotis-apposita/index.html` exists | PASS |
| abagrotis-apposita carries `high-res-available` attribute | PASS |
| abagrotis-apposita carries `species-tiles/abagrotis-apposita/A-D` and `A-V` in specimens | PASS |
| abagrotis-apposita slideshow contains zero `<img src=` (low-res suppressed) | PASS (count: 0) |
| Non-high-res species (abagrotis-baueri) still renders `<figure>` elements | PASS (count: 4) |
| Total species page count >= 1,364 | PASS (1,380) |

## Issues Encountered

None.

## Phase 32 Observations

- The empty slot in abagrotis-apposita's pnwm-image-slideshow renders as a zero-height region in browsers — Phase 32 must fill it with OSD-driven thumbnail content before shipping to avoid a visual gap.
- The `high-res-available` and `high-res-specimens="[...]"` attributes are already present and ready for Phase 32's component to consume.
- The `pnwm-image-slideshow` element's `else` branch (the "No photos on file for this species." placeholder) now also fires when a high-res species has an empty `spImages` array — this is correct per the plan semantics and gives Phase 32 a clean no-slot state to replace.

## Next Phase Readiness

- Task 2 (checkpoint:human-verify) is pending human visual confirmation.
- After approval, Phase 32 can wire OSD into the empty pnwm-image-slideshow slot for high-res species.
- No blockers for Phase 32 — the empty slot + high-res-* attributes are the correct intermediate state.

## Self-Check

- [x] `src/species/species.njk` modified file exists
- [x] Commit `fdecb099` exists (`git log --oneline | grep fdecb099`)
- [x] SUMMARY.md created at correct path

## Self-Check: PASSED

---
*Phase: 31-data-species-photos-json-build-integration*
*Completed: 2026-05-24*
