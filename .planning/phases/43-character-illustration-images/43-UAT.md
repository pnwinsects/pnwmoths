---
status: complete
phase: 43-character-illustration-images
source: [43-01-SUMMARY.md, 43-02-SUMMARY.md, 43-03-SUMMARY.md]
started: 2026-06-27T19:39:25Z
updated: 2026-06-27T19:39:25Z
---

## Current Test

[testing complete]

## Tests

### 1. Identify page loads
expected: Open /identify/. The character-filter panel renders with category/question groups and checkboxes (no errors, no blank page).
result: pass

### 2. Illustration expander appears
expected: Under character states that have an illustration (e.g. Forewing/Hindwing color, Distribution ecoregions), a small "ⓘ illustration" disclosure appears beneath the checkbox label.
result: pass

### 3. Expander reveals a working image
expected: Clicking "ⓘ illustration" expands it and shows the character illustration; the image loads from the CDN (not a broken/blank image).
result: pass
note: image loads, but is small with no affordance to view larger (logged as enhancement gap)

### 4. No expander when there is no illustration
expected: Character states with no illustration (e.g. Size ranges, Seasonality months) show just the checkbox — no "ⓘ illustration" line.
result: pass

### 5. Illustration has alt text
expected: The illustration image has alt text (curator description, or the state name as fallback).
result: pass
note: confirmed from source — the original Lucid key (data/key.data) has NO character descriptions, so alt_text is blank for all 180 and renders the state name as fallback. Faithful to source; curated descriptions would be a fresh curator task.

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0

## Gaps

- truth: "Character illustration should be viewable at a larger size"
  status: enhancement
  reason: "User: image loads but is small with no way to view it larger"
  severity: minor
  test: 3
  artifacts: [src/components/pnwm-identify.ts, src/styles/theme.css]
  missing: [lightbox/enlarge affordance for the .pnwm-kfp-help <img> (capped at max-height 320px); pairs with the disclosure-marker UI follow-up from 43-03]
