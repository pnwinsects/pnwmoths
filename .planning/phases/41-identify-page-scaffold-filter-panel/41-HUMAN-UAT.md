---
status: complete
phase: 41-identify-page-scaffold-filter-panel
source: [41-VERIFICATION.md]
started: 2026-06-24T00:00:00Z
updated: 2026-06-25T00:00:00Z
method: automated browser run (playwright-core driving system Google Chrome, headless) against `npm run dev` at http://localhost:8080/identify/
---

## Current Test

[all tests complete — passed]

## Tests

### 1. Accordion expand/collapse (JS enabled)
expected: Open /identify/ with JS enabled. Each click expands a section revealing question fieldsets and per-state checkboxes; aria-expanded toggles; the triangle glyph rotates.
result: PASS — 8 categories render, all default-collapsed (aria-expanded="false", content hidden). Clicking a header sets aria-expanded="true" and reveals the fieldsets; clicking again collapses it back to "false"/hidden. (Triangle glyph is CSS-driven off aria-expanded, which toggles correctly.)

### 2. Per-category count badges (JS enabled)
expected: Select two checkboxes in one category, then one in another. Each category header shows a badge with its selected-state count (e.g. '(2)' and '(1)'). A sticky 'Clear all' button becomes visible.
result: PASS — checked 2 states in category A → badge "(2)"; 1 state in category B → badge "(1)". Sticky "Clear all" became visible. 3 `pnwm-key-filter-change` events dispatched (one per checkbox change).

### 3. Clear all reset (JS enabled)
expected: Click 'Clear all' with states selected. All checkboxes deselect, all badges disappear, and the 'Clear all' button hides itself.
result: PASS — after click: 0 checkboxes checked, 0 badges, sticky bar removed from DOM.

### 4. No-JS static degradation (JS disabled)
expected: Open /identify/ with JS disabled. Two noscript sections are visible: 'Characters (JavaScript required to filter)' with all 8 category headings and states as plain text, and 'All matched key species (1,192)' with Family→Genus links. No JS console errors on JS-enabled load. (Also confirm CR-01 decision — see Gaps.)
result: PASS — JS-disabled context shows both noscript sections (8 character categories + "matched key species"), exactly 1,192 species links, `<pnwm-identify>` host empty. CR-01 confirmed fixed: family headings end with "(no family)" sorted LAST (after Drepanidae…Uraniidae). Console on JS-enabled load: only a site-wide `GET /favicon.ico 404` (no favicon in repo) — pre-existing, unrelated to Phase 41; every page/component asset returned 200.

## Summary

total: 4
passed: 4
issues: 0
pending: 0
skipped: 0
blocked: 0

## Notes

- Pre-existing, out-of-scope: `/favicon.ico` returns 404 site-wide (no favicon asset in the repo). Harmless browser-automatic request; not introduced by Phase 41. Worth a tiny follow-up (add a favicon) but not a phase gap.

## Gaps

### CR-01: no-JS species list "(no family)" group sorts to top (PARTIAL)
*Acopa perpallida* has `family === ''` in `species.csv`. `src/_data/keyMatrix.ts:53` uses `r.family ?? null` — nullish coalescing does not convert `''` to `null` — so the empty-string family sorts alphabetically before all real families, rendering a "(no family)" group at the top of the no-JS species list instead of the bottom (or omitted). Affects IDENT-06 "correct no-JS static degradation."
fix: applied `r.family?.trim() || null` in keyMatrix.ts (commit 20e3dcc1). Verified: '(no family)' now sorts last (index 11/12) in the rebuilt no-JS species list; tsc clean, 324/324 tests pass.
status: resolved
