---
phase: 20-popover-ui-html-and-css
reviewed: 2026-04-23T18:30:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - src/components/glossary-tooltip.js
  - src/styles/theme.css
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 20: Code Review Report

**Reviewed:** 2026-04-23T18:30:00Z
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found

## Summary

Reviewed the Popover API tooltip rewrite (`glossary-tooltip.js`) and supporting CSS (`theme.css`). The implementation correctly uses the native Popover API with `popover="auto"`, properly handles accessibility attributes (`aria-hidden`, `aria-label`, `role="tooltip"`), and the CSS migration from `#glossary-tooltip` to `.glossary-popover` is clean.

Three warnings found: a position flash caused by measuring the popover after showing it, a shared timer variable across all term instances, and an initial `<img>` element missing the `hidden` attribute specified in the UI contract. Two informational items: a missing CSS semicolon and a missing left-edge viewport clamp.

## Warnings

### WR-01: Popover position flash on show

**File:** `src/components/glossary-tooltip.js:71-82`
**Issue:** `showPopover()` is called on line 71 before the final `left`/`top` styles are applied on lines 81-82. The popover must be visible to measure `offsetWidth` (line 75), but between showing and repositioning, the popover renders at its previous position (or the browser default for popovers) for one frame, causing a visible flash/jump.
**Fix:** Set the popover off-screen before showing, then measure and reposition:
```javascript
// Position off-screen before showing to prevent flash
popover.style.left = '-9999px';
popover.style.top = '-9999px';

popover.showPopover();
popover.removeAttribute('aria-hidden');

// Viewport edge clamp
const popoverWidth = popover.offsetWidth;
const viewportWidth = window.innerWidth;
if (left + popoverWidth > viewportWidth - 8) {
  left = viewportWidth - popoverWidth - 8;
}

popover.style.left = left + 'px';
popover.style.top = top + 'px';
```

### WR-02: Shared hideTimer across all term instances

**File:** `src/components/glossary-tooltip.js:12`
**Issue:** A single `hideTimer` variable is shared across all `<abbr>` elements. When a user rapidly moves from one glossary term to another, `clearTimeout(hideTimer)` on the second term cancels the first term's hide timer. With `popover="auto"`, the browser auto-dismisses the previous popover when a new one opens via `showPopover()`, which mitigates this in practice. However, if the user hovers term A, leaves (starting the 80ms hide timer), then focuses term B via keyboard within 80ms, term A's hide timer is canceled and `hide()` for term A is never called -- leaving `aria-hidden` incorrect on term A's popover element (the Popover API will have hidden it visually, but the `aria-hidden="true"` attribute is never restored).
**Fix:** Move `hideTimer` inside the `forEach` closure so each term has its own independent timer:
```javascript
terms.forEach((abbr, index) => {
  let hideTimer;
  // ... rest of setup
});
```

### WR-03: Initial img element missing hidden attribute per UI spec

**File:** `src/components/glossary-tooltip.js:22`
**Issue:** The HTML template string creates `<img class="gt-img" alt="">` without the `hidden` attribute. The UI-SPEC (line 54) specifies `<img class="gt-img" alt="" hidden>` for the initial state. Without `hidden`, browsers may briefly display a broken-image icon (or reserve layout space for the empty `src`) before `show()` runs and conditionally hides it.
**Fix:**
```javascript
popover.innerHTML = '<img class="gt-img" alt="" hidden><p class="gt-def"></p>';
```

## Info

### IN-01: Missing semicolon in CSS declaration

**File:** `src/styles/theme.css:46`
**Issue:** `padding-left: 24px` is missing a trailing semicolon. This works because it is the last declaration in the `.site-nav` rule block, but adding a property after it will silently break the preceding declaration.
**Fix:**
```css
.site-nav {
  max-width: 1140px;
  margin: 0 auto;
  padding-left: 24px;
}
```

### IN-02: No left-edge viewport clamp

**File:** `src/components/glossary-tooltip.js:77-79`
**Issue:** The right-edge clamp prevents the popover from overflowing the right side of the viewport, but there is no corresponding clamp for the left edge. If `left` computes to a negative value (possible on narrow viewports when the right-edge clamp pushes `left` below zero, since `viewportWidth - popoverWidth - 8` can be negative when `popoverWidth > viewportWidth - 8`), the popover will overflow the left viewport edge.
**Fix:** Add a `Math.max(8, left)` clamp after the right-edge adjustment:
```javascript
if (left + popoverWidth > viewportWidth - 8) {
  left = viewportWidth - popoverWidth - 8;
}
left = Math.max(8, left);
```

---

_Reviewed: 2026-04-23T18:30:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
