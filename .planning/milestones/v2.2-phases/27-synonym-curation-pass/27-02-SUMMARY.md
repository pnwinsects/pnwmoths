---
phase: 27-synonym-curation-pass
plan: "02"
subsystem: scripts/ingest-photos.js
tags:
  - cli
  - classify-cascade
  - synonym-lookup
  - tdd
  - reclassification
dependency_graph:
  requires:
    - 27-01 (data/species-synonyms.csv seed file)
  provides:
    - loadSynonyms helper — Map<from_binomial, { binomial_resolved, species_slug }>
    - classify() synonym pre-pass — resolved-via-synonym bucket (step −1)
    - RESORT_ONLY synonym-aware re-classification loop
    - scripts/ingest-photos.test.js — 9 unit tests covering D-04, D-06, D-09
  affects:
    - 27-03 (runbook references photos:investigate behavior this plan ships)
    - Phase 28 (RESORT_ONLY re-classification populates binomial_resolved + species_slug for eligible rows)
    - Phase 30 (reads binomial_resolved + species_slug from resolved-via-synonym rows)
tech_stack:
  added: []
  patterns:
    - existsSync first-run-safe guard (mirrors scripts/lib/manifest.js:73-77)
    - ESM named exports on classify and loadSynonyms (Option A — export keyword on function declaration)
    - RED-then-GREEN commit pair (Phase 26 TDD contract, D-10)
key_files:
  created:
    - scripts/ingest-photos.test.js
  modified:
    - scripts/ingest-photos.js
    - package.json
decisions:
  - "loadSynonyms is a sibling async function next to loadSpecies (D-09); exported via `export async function` keyword (Option A)"
  - "synonym pre-pass at step −1 runs before provisional short-circuit and unparseable early return (D-06 widening)"
  - "RESORT_ONLY block replaced with species+synonyms load, per-row re-classification loop with idempotency guard, then sort+write"
  - "classify() third arg `synonyms` is null-guarded (`if (synonyms && ...)`) for backward compatibility"
metrics:
  duration_seconds: 401
  completed: "2026-05-22T17:14:38Z"
  tasks_completed: 2
  files_modified: 3
---

# Phase 27 Plan 02: Synonym Pre-pass in classify() Summary

**One-liner:** Added `loadSynonyms` helper + synonym pre-pass (`resolved-via-synonym` bucket) in `classify()` and synonym-aware `RESORT_ONLY` re-classification loop; 9 unit tests committed RED-first then GREEN.

## What Was Built

### scripts/ingest-photos.js (+92 lines, +8 deletions; 467 → 553 lines)

Four insertion clusters:

1. `import { existsSync } from 'node:fs'` — first-run-safe guard (line 25)
2. `const SYNONYMS_CSV = resolve('data/species-synonyms.csv')` — module-level constant (line 38)
3. `export async function loadSynonyms(csvPath, species)` — new sibling helper below `loadSpecies`; returns `Map<from_binomial, { binomial_resolved, species_slug }>` resolved against `species.bySlug` at load time; existsSync guard; synonym-warn log for orphan rows (D-04, D-09)
4. `export function classify(...)` — added `synonyms` as third arg; synonym pre-pass at step −1 runs BEFORE provisional short-circuit (D-06 widening); existing steps 0–4 unchanged
5. RESORT_ONLY block — replaced sort-only with: `loadSpecies` + `loadSynonyms` + per-row re-classification loop with idempotency guard + `logStage('reclassify')` per promoted row + sort + write (D-05)
6. Full-run path — `loadSynonyms` called after `loadSpecies`; `synonyms` passed as third arg to `classify()` at the existing call site

**Exports added:**
```
export async function loadSynonyms(csvPath, species) {
export function classify({ binomialFromParser, bucketHintFromParser }, species, synonyms) {
```

Export option used: **Option A** — `export` keyword on the function declaration (matches Phase 26's `scripts/lib/manifest.js` and `scripts/lib/parse-photo-filename.js` pattern).

### scripts/ingest-photos.test.js (new, 146 lines)

Nine unit tests across two `describe` groups:

**`classify (with synonyms pre-pass)`** (5 tests, D-04, D-06):
- promotes a genus-only binomial to resolved-via-synonym when synonyms.csv has a matching row
- promotes a provisional-marked binomial through synonyms.csv (D-06 widening)
- falls through to clean-match when synonyms.csv does not contain the binomial
- falls through to provisional when no synonym matches and the parser flagged provisional
- falls through to unparseable when no synonym matches and the binomial is null

**`loadSynonyms`** (4 tests, D-04, D-09):
- returns an empty Map when the file does not exist (first-run safe)
- returns an empty Map when the file has only the header (D-08 seed shape)
- builds a one-row map for a single valid synonym
- drops a row whose to_species_slug is not in species.bySlug (orphan target → synonym-warn → drop)

### package.json

`scripts.test` glob extended to include `scripts/ingest-photos.test.js` between `check-page-weight.test.js` and `migrate-species.test.js`.

## Commit Pair (RED-then-GREEN)

```
dfaeccc feat(27-02): synonyms.csv pre-pass in classify() promotes matched rows to resolved-via-synonym
9bc871c test(27-02): add failing tests for synonym-aware classify cascade and loadSynonyms
279f0c1 docs(27): record planning state and roadmap annotations
```

RED commit (`9bc871c`): `scripts/ingest-photos.test.js` + `package.json` only. Test suite failed with:
```
SyntaxError: The requested module './ingest-photos.js' does not provide an export named 'classify'
```
Exit code 1 — RED signal confirmed.

GREEN commit (`dfaeccc`): `scripts/ingest-photos.js` only. All 157 tests pass, exit code 0.

## Test Results (GREEN)

```
ℹ tests 157
ℹ suites 23
ℹ pass 157
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 26715
```

Sample output confirming new tests run and pass:
```
✔ promotes a genus-only binomial to resolved-via-synonym when synonyms.csv has a matching row (0.945ms)
```

## Line Count Changes

| File | Before | After |
|------|--------|-------|
| `scripts/ingest-photos.js` | 467 lines | 553 lines |
| `scripts/ingest-photos.test.js` | (new) | 146 lines |

## scripts/lib/* Unchanged

```
git diff HEAD~2 HEAD -- scripts/lib/ | wc -l  →  0
```

Confirmed: `scripts/lib/manifest.js`, `scripts/lib/parse-photo-filename.js`, `scripts/lib/dropbox-list.js` are untouched.

## Deviations from Plan

None. Plan executed exactly as written.

- Edit 7 used **Option A** (export keyword on function declaration) as specified.
- The `synonyms` null-guard (`if (synonyms && ...)`) in `classify()` was included per plan to maintain backward compatibility with callers that may pass `undefined`.
- No deviation from 27-PATTERNS.md "scripts/ingest-photos.js (modified)" section.

## Known Stubs

None. The `loadSynonyms` function is fully wired: it reads `data/species-synonyms.csv`, resolves each row against `species.bySlug`, and returns a Map used by both the RESORT_ONLY path and the full-run classify call.

## Threat Surface Scan

No new network endpoints, auth paths, file system access beyond what the plan's `<threat_model>` already covers:
- T-27.02-01 (CSV injection) — mitigated: all manifest writes go through `writeManifest` (csv-stringify)
- T-27.02-02 (path traversal via to_species_slug) — mitigated: slug used only as Map key and CSV column value, never as a filesystem path argument
- T-27.02-06 (elevation of privilege via status column change) — mitigated: re-classification loop mutates only `match_bucket`, `binomial_resolved`, `species_slug`; status column untouched

## Self-Check

Files created/modified:
- [x] `scripts/ingest-photos.js` exists — FOUND
- [x] `scripts/ingest-photos.test.js` exists — FOUND
- [x] `package.json` updated — FOUND

Commits:
- [x] `9bc871c` RED commit — FOUND (`git log --oneline -3` confirmed)
- [x] `dfaeccc` GREEN commit — FOUND (`git log --oneline -3` confirmed)

## Self-Check: PASSED
