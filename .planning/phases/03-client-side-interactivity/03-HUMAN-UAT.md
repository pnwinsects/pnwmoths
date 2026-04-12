---
status: partial
phase: 03-client-side-interactivity
source: [03-VERIFICATION.md]
started: 2026-04-11T00:00:00Z
updated: 2026-04-11T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Leaflet map renders
expected: OSM tiles and circle markers appear at occurrence locations; popups show species name, location, and year when clicked

### 2. Phenology chart renders
expected: 12-bar Chart.js chart with real monthly occurrence counts appears; bars are proportional to data

### 3. Filter controls propagate
expected: State, record type, and year range selections in the filter bar update both map and chart; "Clear filters" button resets all filters

### 4. Slideshow and lightbox
expected: Photos cycle with prev/next buttons; clicking a photo opens lightbox overlay; Escape key and X button close it; `inert` attribute on `<main>` while lightbox is open (focus trapped)

### 5. JS-off degradation
expected: Static taxonomy table, prose, and photo figures are visible without JavaScript; noscript notice appears explaining interactive features require JS

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
