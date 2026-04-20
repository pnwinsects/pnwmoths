---
status: complete
phase: 11-accordion-component
source: [11-02-SUMMARY.md, 11-03-SUMMARY.md]
started: "2026-04-20T00:00:00Z"
updated: "2026-04-20T00:01:00Z"
---

## Current Test

number: 8
name: "All states" restores full opacity
expected: |
  With a state selected and some taxa muted, switch the dropdown back to "All states" — all taxa return to full opacity.
awaiting: user response

## Tests

### 1. Families collapsed by default with images
expected: Open http://localhost:8080/pnwmoths/browse/ — all families should be collapsed (no genera or species visible). Up to 4 navigation photos appear beside each family name as a horizontal strip (93px tall).
result: pass

### 2. Expand family reveals subfamilies or genera
expected: Click a family heading — it expands to show its subfamilies (or genera for families without subfamilies). The family's image strip disappears while it is expanded.
result: pass

### 3. Expand subfamily reveals genera with images
expected: Click a subfamily heading — it expands to show genera, each with their own image strip. The subfamily's image strip disappears while expanded.
result: skipped
reason: No subfamily data entered in data/species.csv — subfamily column is blank for all species. Component handles this correctly by flattening genera under family.

### 4. Expand genus reveals species links
expected: Click a genus heading — it expands to show a list of species as links (e.g. "Phyllodesma americana"). Each link goes to the correct factsheet at /pnwmoths/species/{slug}/.
result: pass

### 5. No broken images in navigation strips
expected: Expand several families and subfamilies. All images in the 93px horizontal strips load correctly — no broken-image icons.
result: pass

### 6. Show/hide images toggle
expected: Uncheck the "Show images" checkbox — all navigation image strips disappear site-wide. Re-check it — strips reappear. Toggle works at all levels (family, subfamily, genus).
result: pass

### 7. State filter dims unmatched taxa
expected: Choose a state from the "Filter by state" dropdown. Taxa with no occurrence records in that state become visually muted (roughly 35% opacity) but remain visible. Taxa with records appear at full opacity.
result: issue
reported: "Show images and Filter by state run into each other. There should be some visual separation, with the dropdown listing full state/province names, and not wider than necessary for that (it's currently nearly the full width of the containing box)."
severity: minor

### 8. "All states" restores full opacity
expected: With a state selected and some taxa muted, switch the dropdown back to "All states" — all taxa return to full opacity.
result: pass

## Summary

total: 8
passed: 6
issues: 1
skipped: 1
pending: 0

## Gaps

- truth: "Toolbar controls (Show images checkbox + Filter by state dropdown) have clear visual separation; dropdown shows full state/province names; dropdown width fits its content, not the container."
  status: failed
  reason: "User reported: Show images and Filter by state run into each other. Dropdown shows abbreviated codes, not full names. Dropdown stretches nearly full container width."
  severity: minor
  test: 7
  artifacts: [src/components/pnwm-taxon-browser.js]
  missing:
    - Visual separator between toolbar controls (e.g. margin or divider)
    - Full state/province name labels in dropdown options
    - Dropdown width constrained to fit-content
