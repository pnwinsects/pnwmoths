---
status: partial
phase: 27-synonym-curation-pass
source: [27-VERIFICATION.md]
started: 2026-05-22T18:20:00Z
updated: 2026-05-22T18:20:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Runbook over-promises RESORT_ONLY output (WR-03)
expected: Run `npm run photos:investigate` against a synonyms.csv with one real row and confirm the output does NOT include a per-bucket distribution. The RESORT_ONLY path prints `[ingest-photos] re-sorted manifest; N rows; M promoted to resolved-via-synonym`, but the runbook (line 121) claims it shows "the new per-bucket distribution". Human decides: fix runbook wording or add bucket tally to RESORT_ONLY code.
result: [pending]

### 2. BOM silent-drop on Windows curator hardware (WR-02)
expected: Save `data/species-synonyms.csv` with a UTF-8 BOM using Notepad or Excel on Windows, then run `npm run photos:investigate` with a synonym row present. `csv-parse` without `bom: true` silently drops all rows whose first column becomes `<U+FEFF>from_binomial`. Human assesses likelihood of curator using Notepad/Excel on Windows and decides whether to add `bom: true` to `loadSynonyms`.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
