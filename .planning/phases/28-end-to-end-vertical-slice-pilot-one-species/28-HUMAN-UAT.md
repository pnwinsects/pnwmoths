---
status: partial
phase: 28-end-to-end-vertical-slice-pilot-one-species
source: [28-VERIFICATION.md]
started: 2026-05-24T00:00:00Z
updated: 2026-05-24T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. OSD Viewer End-to-End (pilot species)

expected: Navigate to the pilot species page (`/species/abagrotis-apposita/`), click the photo. OSD canvas appears, tiles load from the bunny.net CDN, pan/zoom/home-reset all work, no CORS errors in the browser Console, and the open/close cycle is clean (no ghost viewer on reopen).
result: [pending]

### 2. No Regression on Two Non-Pilot Species Pages

expected: Click the lightbox on any two species that do NOT have a `high_res_available: true` entry in `data/species-photos.json`. The Phase 23 static `<img>` lightbox opens with no OSD canvas and no OSD-related console errors.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
