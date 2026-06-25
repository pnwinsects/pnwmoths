---
status: partial
phase: 41-identify-page-scaffold-filter-panel
source: [41-VERIFICATION.md]
started: 2026-06-24T00:00:00Z
updated: 2026-06-24T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Accordion expand/collapse (JS enabled)
expected: Open /identify/ with JS enabled. Each click expands a section revealing question fieldsets and per-state checkboxes; aria-expanded toggles; the triangle glyph rotates.
result: [pending]

### 2. Per-category count badges (JS enabled)
expected: Select two checkboxes in one category, then one in another. Each category header shows a badge with its selected-state count (e.g. '(2)' and '(1)'). A sticky 'Clear all' button becomes visible.
result: [pending]

### 3. Clear all reset (JS enabled)
expected: Click 'Clear all' with states selected. All checkboxes deselect, all badges disappear, and the 'Clear all' button hides itself.
result: [pending]

### 4. No-JS static degradation (JS disabled)
expected: Open /identify/ with JS disabled. Two noscript sections are visible: 'Characters (JavaScript required to filter)' with all 8 category headings and states as plain text, and 'All matched key species (1,192)' with Family→Genus links. No JS console errors on JS-enabled load. (Also confirm CR-01 decision — see Gaps.)
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps

### CR-01: no-JS species list "(no family)" group sorts to top (PARTIAL)
*Acopa perpallida* has `family === ''` in `species.csv`. `src/_data/keyMatrix.ts:53` uses `r.family ?? null` — nullish coalescing does not convert `''` to `null` — so the empty-string family sorts alphabetically before all real families, rendering a "(no family)" group at the top of the no-JS species list instead of the bottom (or omitted). Affects IDENT-06 "correct no-JS static degradation."
fix: applied `r.family?.trim() || null` in keyMatrix.ts (commit 20e3dcc1). Verified: '(no family)' now sorts last (index 11/12) in the rebuilt no-JS species list; tsc clean, 324/324 tests pass.
status: resolved
