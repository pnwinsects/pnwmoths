---
phase: 32-openseadragon-viewer-in-lightbox-generalize-pilot
plan: "02"
subsystem: pnwm-image-slideshow
tags:
  - lit
  - web-component
  - openseadragon
  - lightbox
  - tdd
dependency_graph:
  requires:
    - 32-01-PLAN.md (high-res-specimens attribute wiring in species.njk)
  provides:
    - _prevSpecimen / _nextSpecimen methods in pnwm-image-slideshow.js
    - lightbox prev/next button render branch
    - CSS rules for .lightbox-prev / .lightbox-next
    - .lightbox-close z-index fix
  affects:
    - src/components/pnwm-image-slideshow.js
    - src/components/pnwm-image-slideshow.test.js
tech_stack:
  added: []
  patterns:
    - TDD RED/GREEN/REFACTOR cycle
    - optional-chaining null-safety for OSD viewer (this._osdViewer?.open())
    - Lit reactive state (_currentIndex: state: true) drives caption re-render
    - Unicode arrow glyphs (&#x276E;/&#x276F;) without icon library
key_files:
  created: []
  modified:
    - src/components/pnwm-image-slideshow.js
    - src/components/pnwm-image-slideshow.test.js
decisions:
  - "z-index: 1 on .lightbox-close is sufficient to fix the Phase 23 close-button issue (static analysis + OSD stacking context reasoning — empirical live confirmation deferred to Plan 03 human-verify)"
  - "Buttons placed AFTER the useOsd ternary and BEFORE .lightbox-close in the HTML template, so close button remains DOM-last and visually top-right"
  - "No length-guard in _prevSpecimen/_nextSpecimen — buttons only rendered when _highResSpecimens.length > 1"
metrics:
  duration: "7m"
  completed: "2026-05-24"
  tasks_completed: 2
  files_modified: 2
---

# Phase 32 Plan 02: Lightbox Prev/Next Navigation and Close-Button Fix Summary

Add in-lightbox specimen navigation (`_prevSpecimen`/`_nextSpecimen`) with wrap-around index arithmetic, conditional prev/next button rendering, CSS per UI-SPEC, and close-button z-index fix to `pnwm-image-slideshow.js`.

## What Was Built

### Task 1: _prevSpecimen/_nextSpecimen methods + 7 new unit tests

**Method bodies (final committed form):**

```javascript
_prevSpecimen() {
  this._currentIndex = (this._currentIndex - 1 + this._highResSpecimens.length) % this._highResSpecimens.length;
  this._osdViewer?.open(this._buildDziUrl(this._highResSpecimens[this._currentIndex]));
}

_nextSpecimen() {
  this._currentIndex = (this._currentIndex + 1) % this._highResSpecimens.length;
  this._osdViewer?.open(this._buildDziUrl(this._highResSpecimens[this._currentIndex]));
}
```

Both methods are placed immediately after `_buildDziUrl()` (after the existing line 251), before `_scrollLeft()`.

**Test counts:**
- Before: 7 tests (5 `_formatCaption`, 2 `_buildDziUrl`) across 2 `describe` blocks
- After: 17 tests across 6 `describe` blocks
- New `describe` blocks added: `_nextSpecimen`, `_prevSpecimen`, `useOsd derivation`, `view-to-label mapping`

**TDD flow:** RED (03052995) → GREEN (c7f6eec5) — no refactor needed.

### Task 2: Lightbox prev/next button render + CSS + close-button fix

**CSS rules added (verbatim from `static styles`):**

```css
.lightbox-prev, .lightbox-next {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 44px;
  height: 44px;
  background: rgba(0, 0, 0, 0.5);
  border: none;
  color: #ffffff;
  font-size: 20px;
  cursor: pointer;
  z-index: 1;
}
.lightbox-prev { left: 16px; }
.lightbox-next { right: 16px; }
.lightbox-prev:hover, .lightbox-next:hover,
.lightbox-prev:focus, .lightbox-next:focus {
  background: rgba(0, 0, 0, 0.7);
  outline: 2px solid var(--pico-primary);
}
```

**Close-button fix outcome:** `z-index: 1` added to `.lightbox-close` rule. Static analysis confirms the button is a flex sibling of `#osd-viewer` (not inside it), so the z-index fix addresses both possible failure modes:
1. Paint-order issue: `z-index: 1` promotes `.lightbox-close` above any auto-z-indexed positioned descendants of `#osd-viewer`
2. Pointer-capture issue: a button with explicit `z-index` reliably receives clicks above OSD's canvas listener scope

No HTML restructuring was needed. The fix is z-index only, as anticipated in RESEARCH.md Pattern 4.

**Live confirmation:** Deferred to Plan 03 human-verify checkpoint (SC-3: close button click test while OSD is active).

## Deviations from Plan

### Pre-existing Build Failure in Worktree Environment

**Found during:** Task 2 verification
**Issue:** `npm run build` fails in the worktree environment with `ENOENT: node_modules/openseadragon/build/openseadragon/images` because the worktree has no local `node_modules` directory — Node resolves packages from the parent repo (`/Users/rainhead/dev/pnwmoths/node_modules/`) but `scripts/copy-images.js` constructs an absolute path from `resolve('node_modules/...')` relative to the worktree CWD.
**Fix:** None applied. This is a pre-existing worktree environment limitation, not caused by this plan's changes. The main repo build (`/Users/rainhead/dev/pnwmoths`) passes successfully. All unit tests pass. JS syntax validity confirmed via `node --test`.
**Tracking:** Logged as environment deviation. Plan 03 build gate is in the main repo context.
**Files modified:** None (no fix applied)

## Known Stubs

None. The implementation is fully wired:
- `_prevSpecimen`/`_nextSpecimen` methods are complete with index arithmetic and `viewer.open()` calls
- Render branch conditional (`useOsd && this._highResSpecimens.length > 1`) is wired to the actual methods
- CSS is complete per UI-SPEC

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. The new `_prevSpecimen`/`_nextSpecimen` methods construct URLs only via `_buildDziUrl()` from operator-controlled manifest data (threat T-32-02-06 — accepted). Optional chaining guards against null-viewer DoS (T-32-02-02 — mitigated).

## Self-Check: PASSED

| Item | Result |
|------|--------|
| `src/components/pnwm-image-slideshow.js` | FOUND |
| `src/components/pnwm-image-slideshow.test.js` | FOUND |
| `32-02-SUMMARY.md` | FOUND |
| Commit 03052995 (test/RED) | FOUND |
| Commit c7f6eec5 (feat/GREEN methods) | FOUND |
| Commit 18a1a7b3 (feat buttons+CSS+z-index) | FOUND |
| `_prevSpecimen()` method definition in JS | FOUND |
| `_nextSpecimen()` method definition in JS | FOUND |
| `this._osdViewer?.open(...)` calls: 2 | FOUND |
| `useOsd && this._highResSpecimens.length > 1` conditional | FOUND |
| 17 tests pass, 0 fail | PASSED |
