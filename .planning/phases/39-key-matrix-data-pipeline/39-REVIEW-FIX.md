---
phase: 39-key-matrix-data-pipeline
fixed_at: 2026-06-24T00:00:00Z
review_path: .planning/phases/39-key-matrix-data-pipeline/39-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 39: Code Review Fix Report

**Fixed at:** 2026-06-24
**Source review:** .planning/phases/39-key-matrix-data-pipeline/39-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4 (WR-01 through WR-04; IN-01..IN-03 excluded per fix_scope=critical_warning)
- Fixed: 4
- Skipped: 0

## Fixed Issues

### WR-01: `synonymMap` key not normalized

**Files modified:** `scripts/build-key.ts`
**Commit:** 8c6e8048
**Applied fix:** Wrapped `r.from_binomial` in `normalizeBinomial()` at map-construction time so the synonym lookup is invariant to whitespace anomalies (double-spaces, trailing spaces) in `species-synonyms.csv`.

---

### WR-02: `buildBitset` silently discards out-of-bounds indices

**Files modified:** `scripts/build-key.ts`, `scripts/build-key.test.ts`
**Commit:** 2cd545e6
**Applied fix:** Added a `RangeError` guard before the bit-write: `if (i < 0 || i >= speciesCount) throw new RangeError(...)`. Added three new tests covering index-equal-to-speciesCount, index-greater-than, and negative-index paths. All 27 tests pass.

---

### WR-03: `KEY_BUDGET_BYTES=<non-numeric>` silently bypasses the weight gate

**Files modified:** `scripts/check-key-weight.ts`
**Commit:** d4ea84c1
**Applied fix:** Replaced the bare `parseInt` + truthy check with an IIFE that calls `Number.isFinite(n) && n >= 0`; exits 1 with a clear error message if the env var is set to a non-numeric or negative value.

---

### WR-04: Synonym-resolved species stores old genus/epithet from key CSV

**Files modified:** `scripts/build-key.ts`
**Commit:** 16afcdbf (code fix) + dfe9f361 (regenerated artifacts)
**Applied fix:** Built a `slugToName` Map from `speciesRows` (species.csv) keyed by slug. In the `species[]` construction, `genus` and `epithet` are now taken from `accepted?.genus`/`accepted?.epithet` (the accepted name from species.csv), falling back to the binomial-derived parts only if the slug has no matching species row. After re-running `node scripts/build-key.ts`, `apantesis-doris` now shows `genus: "Apantesis"` and no `Grammia` genus entries remain for synonym-resolved species.

---

## Post-Fix Verification

**Tests:** 27 pass, 0 fail (`node --test scripts/build-key.test.ts scripts/check-key-weight.test.ts`)

**Typecheck:** Pre-existing error in `scripts/check-key-weight.test.ts:7` (`gzipSync` declared but never read — TS6133). Confirmed pre-existing: present before any of these fixes, not introduced by any modified file.

**Gzip budget:** `_site/key-matrix.json` is 41.1 KB gzip (<= 50 KB budget). PASS.

**Synonym spot-check:** `apantesis-doris` entry in `data/key-matrix.json`:
```json
{
  "slug": "apantesis-doris",
  "genus": "Apantesis",
  "epithet": "doris",
  "common_name": null,
  "nav_image": "Grammia doris-A-D.jpg"
}
```
Accepted name correctly displayed. Zero remaining `Grammia` genus entries in the artifact (all 17 synonym-resolved Grammia→Apantesis species now carry the accepted Apantesis name).

---

_Fixed: 2026-06-24_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
