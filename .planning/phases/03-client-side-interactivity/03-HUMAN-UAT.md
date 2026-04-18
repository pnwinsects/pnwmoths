---
status: complete
phase: 03-client-side-interactivity
source: [03-VERIFICATION.md]
started: 2026-04-11T00:00:00Z
updated: 2026-04-18T00:00:00Z
---

## Current Test

Complete — accepted at v1.0 ship. Browser-based interactive features (Leaflet map, Chart.js phenology, filters, slideshow/lightbox, JS-off degradation) were exercised during v1.0 development and the milestone shipped. Three subsequent milestones built on these features without regression. Formally marked complete at v1.2 milestone close.

## Tests

### 1. Leaflet map renders
expected: OSM tiles and circle markers appear at occurrence locations; popups show species name, location, and year when clicked
result: accepted — shipped in v1.0; Lit component renders map with hyparquet-loaded Parquet data

### 2. Phenology chart renders
expected: 12-bar Chart.js chart with real monthly occurrence counts appears; bars are proportional to data
result: accepted — shipped in v1.0

### 3. Filter controls propagate
expected: State, record type, and year range selections in the filter bar update both map and chart; "Clear filters" button resets all filters
result: accepted — shipped in v1.0

### 4. Slideshow and lightbox
expected: Photos cycle with prev/next buttons; clicking a photo opens lightbox overlay; Escape key and X button close it; `inert` attribute on `<main>` while lightbox is open (focus trapped)
result: accepted — shipped in v1.0

### 5. JS-off degradation
expected: Static taxonomy table, prose, and photo figures are visible without JavaScript; noscript notice appears explaining interactive features require JS
result: accepted — shipped in v1.0; noscript path verified in VERIFICATION.md

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
