---
phase: 20-popover-ui-html-and-css
fixed_at: 2026-04-23T18:45:00Z
review_path: .planning/phases/20-popover-ui-html-and-css/20-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 20: Code Review Fix Report

**Fixed at:** 2026-04-23T18:45:00Z
**Source review:** .planning/phases/20-popover-ui-html-and-css/20-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3
- Fixed: 3
- Skipped: 0

## Fixed Issues

### WR-01: Popover position flash on show

**Files modified:** `src/components/glossary-tooltip.js`
**Commit:** e6ec3f0
**Applied fix:** Set popover position to `-9999px` off-screen before calling `showPopover()`, then measure `offsetWidth` and reposition. This eliminates the one-frame flash at the previous/default position between showing and repositioning.

### WR-02: Shared hideTimer across all term instances

**Files modified:** `src/components/glossary-tooltip.js`
**Commit:** 06986b1
**Applied fix:** Moved `let hideTimer` declaration from module scope (line 12) into the `forEach` closure so each `<abbr>` element has its own independent timer. Prevents one term's hide timer from being incorrectly canceled when another term is activated within the 80ms delay window.

### WR-03: Initial img element missing hidden attribute per UI spec

**Files modified:** `src/components/glossary-tooltip.js`
**Commit:** 4a7e5a7
**Applied fix:** Added `hidden` attribute to the `<img>` element in the popover innerHTML template, matching the UI-SPEC requirement. Prevents browsers from displaying a broken-image icon or reserving layout space for the empty `src` before `show()` conditionally sets visibility.

---

_Fixed: 2026-04-23T18:45:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
