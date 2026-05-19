---
phase: 20-popover-ui-html-and-css
plan: 01
subsystem: ui
tags: [popover-api, css, vanilla-js, accessibility, aria, tooltip]

# Dependency graph
requires:
  - phase: 19-build-time-glossary-transform
    provides: "<abbr class='glossary-term'> elements with data-definition and data-image-url attributes"
provides:
  - "Native Popover API tooltip on hover/focus of glossary terms"
  - "CSS .glossary-popover selector with absolute positioning for popover top layer"
  - "Keyboard accessibility via tabindex='0' on glossary terms"
  - "ARIA tooltip role with aria-hidden state management"
  - "CDN image display in popover when data-image-url is present"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-element popover pattern: one <div popover> per trigger element, positioned via getBoundingClientRect"
    - "title-to-aria-label swap at runtime to suppress native tooltip when custom popover is active"

key-files:
  created: []
  modified:
    - src/components/glossary-tooltip.js
    - src/styles/theme.css

key-decisions:
  - "Used per-term popover elements (one div per abbr) rather than a single shared tooltip div -- enables Popover API auto-dismiss and avoids show/hide race conditions"

patterns-established:
  - "Popover API usage: popover='auto' with manual showPopover/hidePopover and absolute positioning via getBoundingClientRect"
  - "80ms debounce timer on mouseleave/blur to prevent flicker during pointer travel"

requirements-completed: [TIP-01, TIP-02, TIP-03, QA-02]

# Metrics
duration: ~10min
completed: 2026-04-23
---

# Phase 20 Plan 01: Popover API Tooltip Rewrite Summary

**Native Popover API tooltip replacing cursor-following div: CSS selectors migrated to .glossary-popover, JS rewritten with per-term popovers, keyboard/mouse/Escape/click-outside dismiss, CDN image conditional display**

## Performance

- **Duration:** ~10 min (across two executor sessions with human verification)
- **Started:** 2026-04-23
- **Completed:** 2026-04-23
- **Tasks:** 3 (2 auto + 1 human-verify checkpoint)
- **Files modified:** 2

## Accomplishments
- Migrated CSS from `#glossary-tooltip` ID selector to `.glossary-popover` class selector with Popover API adjustments (absolute positioning, margin/inset reset, removed display:none and z-index)
- Rewrote `glossary-tooltip.js` from a single shared cursor-following div to per-term `<div popover="auto">` elements using the native Popover API
- Added keyboard accessibility: `tabindex="0"` on all glossary terms, focus/blur triggers popover show/hide
- Implemented ARIA attributes: `role="tooltip"`, `aria-hidden` state management, title-to-aria-label swap
- CDN image conditional display: shows image when `data-image-url` is present, hides with `hidden` attribute when absent
- Viewport edge clamping prevents popover from overflowing right edge
- Human visual verification passed: hover, keyboard, Escape, and click-outside dismiss all working

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate CSS from #glossary-tooltip to .glossary-popover** - `a08268c` (feat)
2. **Task 2: Rewrite glossary-tooltip.js to use Popover API** - `3b939fb` (feat)
3. **Task 3: Visual verification checkpoint** - no commit (human-verify, approved)

## Files Created/Modified
- `src/styles/theme.css` - Replaced `#glossary-tooltip` block with `.glossary-popover` using Popover API-compatible properties (absolute positioning, margin/inset reset, no display:none or z-index)
- `src/components/glossary-tooltip.js` - Full rewrite: per-term popover creation, Popover API show/hide, getBoundingClientRect positioning, keyboard accessibility, ARIA attributes, CDN image conditional

## Decisions Made
- Used per-term popover elements instead of a single shared tooltip div -- the Popover API's auto-dismiss (Escape, click-outside) works per-element, and this avoids race conditions between show/hide timers and the API's toggle events
- Followed plan as specified for all other implementation details

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 20 is complete (single plan). The popover UI is fully functional with definition text and CDN images
- Phase 21 (JS Hover Enhancement and Glossary Images) may be redundant since this plan already implements CDN image display in the popover -- the planner should evaluate whether Phase 21 has remaining scope
- All TIP-01, TIP-02, TIP-03, and QA-02 requirements are satisfied

## Self-Check: PASSED

- FOUND: src/components/glossary-tooltip.js
- FOUND: src/styles/theme.css
- FOUND: .planning/phases/20-popover-ui-html-and-css/20-01-SUMMARY.md
- FOUND: commit a08268c (Task 1)
- FOUND: commit 3b939fb (Task 2)

---
*Phase: 20-popover-ui-html-and-css*
*Completed: 2026-04-23*
