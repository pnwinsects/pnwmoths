---
phase: 25-similar-species-thumbnails
plan: 01
subsystem: ui
tags: [eleventy, nunjucks, css, species-fact-sheet, cdn, thumbnails]

# Dependency graph
requires:
  - phase: 23-photo-thumbnail-carousel
    provides: CDN URL pattern, urlencode filter discipline, thumbnail strip CSS model
  - phase: 24-county-collection-and-elevation-filters
    provides: species.njk surrounding structure (species-photos div, species-data div)
provides:
  - Horizontal scrollable similar-species thumbnail row on species fact sheets
  - Eight .similar-species-* CSS rules in theme.css for layout, hover, and placeholder
affects:
  - Any future phase modifying species.njk layout or species-photos div structure

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "images[slug] lookup for per-species image data inside Nunjucks double-loop slug resolution"
    - "similar-species-placeholder div as graceful no-image fallback alongside CDN thumbnail"

key-files:
  created: []
  modified:
    - src/species/species.njk
    - src/styles/theme.css

key-decisions:
  - "Label uses scientific name only (em-wrapped genus+species) — user-directed change from original common-name-with-scientific-fallback plan"
  - "Section placed inside .species-photos div under carousel, not after .species-prose — user-directed change for visual proximity to photos"
  - "No .similar-species-thumb wrapper div in original PATTERNS target — kept in implementation per UI-SPEC action spec (adds flex container for 93px height alignment)"

patterns-established:
  - "loading=lazy on all below-fold CDN thumbnails in species.njk"
  - "Gray literal #d6d0bc placeholder (not a Pico token) for missing-image slots in species UI"

requirements-completed: [SIM-01, SIM-02]

# Metrics
duration: ~15min
completed: 2026-05-20
---

# Phase 25 Plan 01: Similar Species Thumbnails Summary

**Horizontal scrollable CDN thumbnail row replacing plain-text similar-species list on species fact sheets, with 93px thumbnails, gray placeholder fallback, and clickable links — pure static HTML, no JS**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-20T17:30:00Z (approx)
- **Completed:** 2026-05-20T17:35:06Z (CSS task commit timestamp)
- **Tasks:** 2 auto tasks + 1 human-verify checkpoint
- **Files modified:** 2

## Accomplishments

- Replaced plain `<ul>` similar species list with `<div class="similar-species-row">` horizontal flex layout inside `.species-photos` div
- Each entry is an `<a class="similar-species-entry">` wrapping a 93px CDN thumbnail (`loading="lazy"`, `object-fit: contain`) and a centered `<em>genus species</em>` label
- Gray `#d6d0bc` placeholder (`<div class="similar-species-placeholder" aria-hidden="true">`) renders for species with no images; link and label still present
- Eight CSS rules appended to theme.css: flex row with hidden scrollbar, hover outline via `var(--pico-primary)`, 14px centered name label
- Human visual sign-off received ("ok") — build passes, section renders correctly

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace similar species ul with thumbnail row in species.njk** - `b6e6f293` (feat)
2. **Task 2: Append similar-species CSS rules to theme.css** - `c651f522` (feat)

## Files Created/Modified

- `src/species/species.njk` — Lines 64-90: similar-species section added inside `.species-photos` div, directly after `</pnwm-image-slideshow>` (lines 62-90 in current file). Replaces former `<ul>` block (previously at lines 83-96 before post-task corrections moved it to inside the div).
- `src/styles/theme.css` — 8 CSS rule blocks appended at end of file under `/* --- Similar species thumbnail row (Phase 25) --- */` section comment.

## Sample Species Pages

- `_site/species/abagrotis-apposita/index.html` — has images; exercises the CDN thumbnail path
- Any species whose `similar_slugs` point to species with no `images.csv` entries exercises the placeholder path (data has 100% image coverage for the abagrotis-apposita similar slugs; placeholder coverage verified via build-time `grep` across the corpus per Task 1 acceptance criteria)

## Decisions Made

1. Scientific name only in label: `<em>{{ s.genus }} {{ s.species }}</em>` — original plan called for `{{ s.common_name or (s.genus + ' ' + s.species) }}`; user directed change to always show scientific name in italics for taxonomic consistency.
2. Section placed inside `.species-photos` div: positioned directly after `</pnwm-image-slideshow>` — original plan located it outside `.species-photos`, between `.species-prose` and the `<script>` block; user directed move for visual proximity to the photo carousel.

## Deviations from Plan

### User-Directed Changes (Post-Task Corrections Applied by Orchestrator)

**1. Label changed to scientific name only**
- **Found during:** Post-task correction by orchestrator after human review
- **Original plan:** `{{ s.common_name or (s.genus + ' ' + s.species) }}` (common name with scientific fallback)
- **Applied change:** `<em>{{ s.genus }} {{ s.species }}</em>` (always scientific name, italicized)
- **Files modified:** src/species/species.njk (line 83)
- **Reason:** User-directed for taxonomic consistency; scientific name is unambiguous cross-reference

**2. Section moved inside .species-photos div**
- **Found during:** Post-task correction by orchestrator after human review
- **Original plan:** Section placed outside `.species-photos`, after `.species-prose`
- **Applied change:** Section now inside `.species-photos` div, directly below `</pnwm-image-slideshow>` (lines 64-90)
- **Files modified:** src/species/species.njk
- **Reason:** User-directed for visual proximity to photo carousel — similar species as extension of the photos context rather than an appendix after prose

---

**Total deviations:** 2 user-directed post-task corrections
**Impact on plan:** Both changes improve UX consistency and layout logic. No functionality regressions. Build passes. SIM-01 and SIM-02 requirements satisfied.

## Issues Encountered

None — template and CSS tasks executed cleanly. Build passed after each task commit.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None — all thumbnail data flows from live `images.csv` via `images[slug]` lookup; placeholder path handles missing images gracefully; no hardcoded empty values in the rendering path.

## Threat Flags

None — the similar-species section uses the same CDN URL construction, `| urlencode` filter, and `| url` filter discipline as the existing slideshow. Nunjucks auto-escaping covers all interpolations. No new network endpoints, auth paths, or trust boundaries introduced.

## Next Phase Readiness

- Phase 25 is the final phase in milestone v2.1 (Species Fact Sheet Gaps). All planned phases complete.
- No blockers or concerns — build passes, human visual sign-off received.
- The `.species-photos` div now contains both the photo carousel and the similar-species row; any future phase modifying species.njk layout should be aware of this structure.

---
*Phase: 25-similar-species-thumbnails*
*Completed: 2026-05-20*

## Self-Check: PASSED

- `src/species/species.njk` exists and contains `class="similar-species-row"` at line 67
- `src/styles/theme.css` exists and contains `/* --- Similar species thumbnail row (Phase 25) --- */`
- Commit `b6e6f293` (Task 1) confirmed in git log
- Commit `c651f522` (Task 2) confirmed in git log
