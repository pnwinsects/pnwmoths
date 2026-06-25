---
status: partial
phase: 42-results-grid
source: [42-VERIFICATION.md]
started: 2026-06-25
updated: 2026-06-25
---

## Current Test

[awaiting human testing]

## Tests

### 1. At-rest state (GRID-01 / SC1, D-02/D-03)
expected: On `/identify/` with nothing selected, the count line reads "Showing all 1,192 species" and a prompt "Select characters to narrow the 1,192 key species" is shown in the grid area — NOT a flood of ~1,190 thumbnails.
result: [pending]

### 2. Live grid update without page reload (GRID-01/GRID-02 / SC2)
expected: Selecting a character state switches the count to "N species match" and renders CDN thumbnail cards; selecting/deselecting updates the grid live with no full-page reload/navigation. Off-screen images are lazy (visible in the Network panel as you scroll). Clicking a card navigates to that species page.
result: [pending]

### 3. Gray placeholder render (GRID-03 / SC3)
expected: Filter to a combination that includes a photo-less species (`autographa-v-alba` or `xestia-c-nigrum`); that card shows a gray `.similar-species-placeholder` block — no broken `<img>` icon.
result: [pending]

### 4. Empty-state "Clear all" reset (GRID-04 / SC4, D-09)
expected: Narrow the filter until "No species match the selected characters" appears with a "Clear all" CTA; clicking the CTA clears the selection and returns the grid to the at-rest prompt (no flash of the empty state).
result: [pending]

### 5. Two-column sticky layout (D-04/D-05)
expected: On desktop, the filter panel is a sticky left column while the grid scrolls in the main column, with the count pinned above the grid. At ≤768px the layout stacks (panel above grid).
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
