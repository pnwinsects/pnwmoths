---
status: partial
phase: 42-results-grid
source: [42-VERIFICATION.md]
started: 2026-06-25
updated: 2026-06-25
---

## Current Test

[complete — browser UAT run via playwright-core / system Chrome against a local `_site` build]

## Tests

### 1. At-rest state (GRID-01 / SC1, D-02/D-03)
expected: count reads "Showing all 1,192 species"; prompt "Select characters to narrow the 1,192 key species"; no thumbnail flood.
result: PASS — count = "Showing all 1,192 species", prompt present, 0 cards rendered, 8 collapsed categories, 237 checkboxes.

### 2. Live grid update without page reload (GRID-01/GRID-02 / SC2)
expected: selecting a state switches count to "N species match", renders lazy CDN cards linking to species pages, no reload.
result: PASS (with data caveat) — one selection → "862 species match", 862 cards, every `<img loading="lazy">` with a `b-cdn.net` src, first card href `/species/habrosyne-scripta/`, URL unchanged (no reload). CAVEAT: ~35 of 1,190 cards show a broken image because their `nav_image` value 404s on the CDN (upstream data issue, see Gaps).

### 3. Gray placeholder render (GRID-03 / SC3)
expected: photo-less species show a gray `.similar-species-placeholder` block, no broken `<img>`.
result: PASS (component logic) — a `nav_image: null` species rendered `.similar-species-placeholder` with NO `<img>`; the photo species rendered a lazy `<img>`. The grid's null→placeholder branch is correct. NOTE: the broken images in item 2 are non-null `nav_image` values that 404 on the CDN, not a placeholder-logic failure.

### 4. Empty-state "Clear all" reset (GRID-04 / SC4, D-09)
expected: zero-match shows "No species match the selected characters" + "Clear all" CTA; clicking it clears the selection and returns to the at-rest prompt.
result: PASS — empty state showed count "0 species match", message "No species match the selected characters", and a "Clear all" button. Clicking it cleared the PANEL's checkboxes (anyChecked → false) and returned the grid to "Showing all 1,192 species" + prompt, confirming the shared reset wires through `pnwm-identify._clearAll` (D-09). NOTE: a natural zero-match combo is impractical to reach by clicking (some species are unscored `0` across all selected questions and never eliminate — correct "0 = unscored" semantics), so the empty render was triggered via the grid's reactive property; the Clear-all reset itself was exercised end-to-end against a real panel selection.

### 5. Two-column sticky layout (D-04/D-05)
expected: desktop sticky left panel + scrolling grid, count pinned above; ≤768px stacks.
result: PASS — desktop (1280px): `.pnwm-identify-panel` `position: sticky`, layout `grid-template-columns: 280px 788px`. Mobile (375px): single column (one track), stacked.

## Summary

total: 5
passed: 5
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- **Broken thumbnails for ~35 species (upstream data, not the grid).** 35 of 1,190
  `nav_image` values in `data/key-matrix.json` use an underscore filename convention
  (and sometimes a different genus spelling, e.g. slug `eudeilinia-herminiata` →
  `Eudeilinea_herminiata-A-D.jpg`) that 404s on the CDN, so those cards render a broken
  `<img>`. The grid component is correct — it renders an `<img>` because `nav_image` is
  non-null. Fix belongs in the key-matrix data pipeline (`build-key.ts`, Phase 39):
  normalize `nav_image` to the CDN's actual filenames. Captured as a todo. Optionally,
  the grid could add an `<img onerror>` → placeholder fallback to satisfy SC3 literally
  and harden against any future bad `nav_image`. Awaiting decision.
