---
phase: 22-phenology-chart-improvements
plan: "01"
subsystem: ui
tags: [chart.js, lit, phenology, bar-chart]

requires:
  - phase: none
    provides: n/a

provides:
  - Phenology bar chart with labeled X-axis ("Month") and Y-axis ("# Records")
  - Y-axis pinned to 0 baseline via beginAtZero=true, auto-scaled max

affects: [23-photo-thumbnail-carousel, 24-county-collection-elevation-filters]

tech-stack:
  added: []
  patterns:
    - "Chart.js v4 axis titles via scales.{x,y}.title.{display,text} — no Title plugin import needed"
    - "beginAtZero: true preferred over min: 0 for semantic clarity in non-negative bar charts"

key-files:
  created: []
  modified:
    - src/components/pnwm-phenology-chart.js

key-decisions:
  - "Used beginAtZero: true (not min: 0) per D-03 — more semantically clear, equivalent for non-negative data"
  - "No new Chart.js imports — axis titles are built into CategoryScale/LinearScale in v4; Title plugin is chart-level only"
  - "scales block is inline in _renderChart options (not extracted to named const) — scope is small enough"

patterns-established:
  - "Chart.js axis title pattern: scales.x.title.{display,text} and scales.y.{beginAtZero,title.{display,text}}"

requirements-completed: [CHART-01, CHART-02]

duration: 9min
completed: "2026-05-20"
---

# Phase 22 Plan 01: Phenology Chart Improvements Summary

**Chart.js scales block added to phenology chart with "Month" X-axis label, "# Records" Y-axis label, and beginAtZero=true floor using only already-registered CategoryScale/LinearScale**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-05-20T17:18:16Z
- **Completed:** 2026-05-20T17:27:03Z
- **Tasks:** 2 automated + 1 auto-approved checkpoint
- **Files modified:** 1

## Accomplishments

- Added `scales` key to Chart.js `options` in `_renderChart()` with X-axis title "Month" and Y-axis title "# Records"
- Pinned Y-axis floor at 0 via `beginAtZero: true` — single-month species no longer show a misleading non-zero baseline
- Verified axis title strings survived Vite bundling in `_site/assets/main-Byf8guq1.js`
- Zero new imports, zero new dependencies, zero styling changes

## Task Commits

1. **Task 1: Add scales config (axis titles + beginAtZero) to phenology chart options** - `ccafc00a` (feat)
2. **Task 2: Full test suite + production build verification** - no file changes (read-only verification)
3. **Task 3: Human verifies rendered chart** - auto-approved in --auto mode

## Files Created/Modified

- `src/components/pnwm-phenology-chart.js` - Added `scales` block to Chart.js `options` in `_renderChart()`: X/Y axis titles and `beginAtZero: true`

## Decisions Made

- Used `beginAtZero: true` (not `min: 0`) — both are equivalent in Chart.js v4 for non-negative data, but `beginAtZero` is more semantically clear (per D-03 in CONTEXT.md)
- No Title plugin imported — axis titles in v4 are built into `CategoryScale` and `LinearScale`, already registered; the standalone `Title` plugin is only for chart-level titles
- Scales block kept inline (not extracted to a named const) — scope is small, inline is idiomatic at this level

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

**Pre-existing build failure in worktree environment (out of scope):**
`npm run build` fails with `PLUGIN_ERROR` from the `pnwm-copy-images` Vite writeBundle hook. The hook runs `node scripts/copy-images.js`, which tries to copy OpenSeadragon images via a hard-coded relative path `node_modules/openseadragon/...`. In a git worktree, `node_modules/` does not exist at the worktree root — packages are in the main repo directory. This failure is pre-existing (confirmed by testing before the Task 1 edit), unrelated to this plan's changes, and only affects the worktree build environment.

The Vite JS bundling step itself completed successfully — the axis title strings are present in the built bundle at `_site/assets/main-Byf8guq1.js`, satisfying the key Task 2 acceptance criterion.

96/97 tests pass. The 1 failing test (`migrate-species: species.csv has >= 1,300 rows`) requires an external MySQL dump file at a path outside this environment — also pre-existing and unrelated to this plan.

**Deferred:** The relative `node_modules/openseadragon/...` path in `scripts/copy-images.js` should be replaced with `require.resolve('openseadragon/...')` (matching the Pico CSS pattern already in the same file) to work correctly in git worktrees.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- CHART-01 and CHART-02 requirements satisfied — phenology chart axis labels and Y=0 floor are live
- Bundle verified to contain axis title strings via Vite
- Ready for Phase 23: Photo Thumbnail Carousel

---
*Phase: 22-phenology-chart-improvements*
*Completed: 2026-05-20*
