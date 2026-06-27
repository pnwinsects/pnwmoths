---
status: resolved
phase: 39-key-matrix-data-pipeline
source: [39-VERIFICATION.md]
started: 2026-06-24T00:00:00Z
updated: 2026-06-24T00:00:00Z
---

## Current Test

[complete]

## Tests

### 1. Unmatched binomial plausibility review
expected: Each of the 36 entries in `data/key-coverage-report.json` `unmatched_binomials` represents a genuinely reclassified, absent, or not-yet-synonymised taxon — not a parse artefact or a whitespace-normalization failure that slipped through. (The count of 36 and the entry shape `{binomial, direct_slug, reason}` are already programmatically confirmed; only the taxonomic judgment is human.)
result: passed — reviewed by maintainer 2026-06-24. The 36 are valid taxa absent from the site (spot-checked *Protorthodes texana*: ITIS-valid, Noctuidae, no synonyms). They are correctly excluded from the Identify results for lack of a species page; raw data is preserved in the committed `data/key-characters.csv` and re-included automatically if pages are added. Documented in issue #19 (comment 4794832893).

## Summary

total: 1
passed: 1
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
