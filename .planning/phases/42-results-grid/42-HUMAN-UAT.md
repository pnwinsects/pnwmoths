---
status: passed
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
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

- **RESOLVED (grid hardening):** the grid now degrades a failed thumbnail to the gray
  placeholder via an `<img @error>` handler (commit 03512064), so SC3 ("no broken `<img>`
  tags") holds even with bad `nav_image` data. Re-verified in-browser: 0 broken images.
- **TRACKED (upstream data fix):** ~35 of 1,190 `nav_image` values in `data/key-matrix.json`
  still 404 on the CDN (underscore filenames / genus-spelling mismatch, e.g. slug
  `eudeilinia-herminiata` → `Eudeilinea_herminiata-A-D.jpg`). Those species now show the
  placeholder instead of their photo. The real fix is in the key-matrix pipeline
  (`build-key.ts`) — captured as a todo and filed as a GitHub issue.
