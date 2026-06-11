---
status: complete
phase: 36-eleventy-data-files-config-migration
source: [36-01-SUMMARY.md, 36-02-SUMMARY.md, 36-03-SUMMARY.md, 36-04-SUMMARY.md]
started: 2026-06-10
updated: 2026-06-10
---

## Current Test

[testing complete]

## Tests

### 1. Local dev server builds and serves with `/` pathPrefix
expected: |
  `npm run dev` builds with no errors and serves the site. A species page at
  http://localhost:8080/species/<slug>/ renders normally; first-party assets
  resolve under `/` (not `/pnwmoths/`), no double-prefix, no first-party 404s.
result: pass

## Summary

total: 1
passed: 1
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
