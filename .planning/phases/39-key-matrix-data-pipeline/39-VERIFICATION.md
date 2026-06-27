---
phase: 39-key-matrix-data-pipeline
verified: 2026-06-24T00:00:00Z
status: passed
score: 11/11 must-haves verified
overrides_applied: 0
re_verification: true
human_verification_resolved: "2026-06-24 — maintainer reviewed the 36 unmatched binomials (spot-checked Protorthodes texana: ITIS-valid, Noctuidae). Confirmed legitimate absent taxa, correctly excluded; data preserved in committed key-characters.csv. See 39-HUMAN-UAT.md and issue #19 comment 4794832893."
human_verification:
  - test: "Inspect data/key-coverage-report.json unmatched_binomials list"
    expected: "~36 entries representing plausibly reclassified or absent taxa (e.g. Grammia species not yet synonymised, historical names), not parse artefacts or whitespace failures"
    why_human: "Correctness of the unmatched set requires biological/taxonomic judgment; automated checks can only confirm the count (36) and the JSON shape, not whether the taxa are genuinely absent from the site"
---

# Phase 39: Key Matrix Data Pipeline Verification Report

**Phase Goal:** The `key.csv` character matrix is ingested into a stable, validated, client-loadable JSON artifact that all subsequent phases can depend on
**Verified:** 2026-06-24
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `node scripts/build-key.ts` emits `data/key-matrix.json` with `{characters, species, matrix}` | VERIFIED | Script exits 0 in 204ms; artifact present; JSON has all three top-level keys |
| 2 | `characters` has 237 entries with full Category[:Subcategory]:Question:State hierarchy | VERIFIED | `a.characters.length === 237` confirmed by runtime check |
| 3 | `species` contains matched binomials only (each with slug + nav_image); unmatched excluded | VERIFIED | `a.species.length === 1192`; all 1192 entries have `nav_image` field (1190 non-null); unmatched 36 excluded |
| 4 | `matrix` has 237 base64 strings, each a Uint8Array bitset over matched species | VERIFIED | `a.matrix.length === 237`; uniform base64 length 200 with 0 mismatches across all 237 entries |
| 5 | `data/key-coverage-report.json` lists every unmatched binomial with `direct_slug + reason` | VERIFIED | `matched=1192 + unmatched=36 === 1228`; `unmatched_binomials.length === 36` with `{binomial, direct_slug, reason}` shape |
| 6 | Double-space (`Tolype  laricis`), trailing-space (`Tyta luctuosa`), and Grammia->Apantesis synonyms resolve correctly | VERIFIED | `tolype-laricis` in species with correct slug; `tyta-luctuosa` resolves; `apantesis-doris` shows `genus: "Apantesis"` (not "Grammia"); 0 remaining Grammia genus entries; all 17 Apantesis entries confirmed |
| 7 | `KeyMatrixSchema.parse` rejects malformed artifacts at build time; `validateKeyMatrix` guards the client boundary | VERIFIED | `KeyMatrixSchema` in `src/types/schemas.ts`; `validateKeyMatrix` in `src/components/key-matrix-cache.ts` with zod/mini parse + two structural invariant layers; 55/55 tests pass |
| 8 | `scripts/copy-key-matrix.ts` copies `data/key-matrix.json` to `_site/key-matrix.json` after Eleventy | VERIFIED | Script exits 0, `_site/key-matrix.json` present and correct |
| 9 | `scripts/check-key-weight.ts` exits non-zero when gzip exceeds 50 KB, exits 0 otherwise | VERIFIED | Reports `41.1 KB gzip (<= 50 KB budget)`, exits 0; WR-03 NaN bypass fix confirmed at `check-key-weight.ts:8-18` |
| 10 | `npm run build` chain has `build:key` after `build:data`, before `build:eleventy`; `build:copy-key-matrix` and `build:check-key-weight` wired after `build:copy-parquet` | VERIFIED | `package.json` build script order confirmed: `build:data → build:key → build:eleventy → build:copy-parquet → build:copy-key-matrix → build:check-key-weight` |
| 11 | Both `deploy.yml` and `pr-check.yml` contain the three new steps at identical positions; `build:key` under 5s | VERIFIED | Both CI files contain identical build chain string; `build:key` measured at 204ms wall time (well under 5s) |

**Score:** 11/11 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `data/key-characters.csv` | Committed Lucid export (1229 cols x 238 rows) | VERIFIED | 238 rows, 1229 columns; `Habrosyne scripta` in row 0 |
| `scripts/build-key.ts` | Full data pipeline with exports | VERIFIED | Exports `main`, `normalizeBinomial`, `binomialToSlug`, `resolveSlug`, `parseCharacterLabel`, `buildBitset`; 322 lines; substantive implementation |
| `src/types/schemas.ts` | CharacterSchema, KeySpeciesSchema, KeyMatrixSchema | VERIFIED | All three schemas + inferred types appended at lines 155–183; uses `zod/mini`, `z.nullable()`, no `z.optional` |
| `src/components/key-matrix-cache.ts` | `validateKeyMatrix` load-time guard | VERIFIED | Exports `validateKeyMatrix(data: unknown): asserts data is KeyMatrix`; two-layer validation; no fetch/Lit code |
| `data/key-matrix.json` | Committed artifact | VERIFIED | Present; `matrix.length===237`, `species.length===1192`, uniform bitset lengths |
| `data/key-coverage-report.json` | Committed coverage report | VERIFIED | Present; `{generated, matched:1192, unmatched:36, unmatched_binomials:[]}` shape |
| `scripts/copy-key-matrix.ts` | Post-Eleventy copy | VERIFIED | Uses `copyFile + mkdir`; mirrors `copy-parquet.ts` pattern |
| `scripts/check-key-weight.ts` | gzip <= 50 KB gate | VERIFIED | Uses `gzipSync`; 50*1024 default; `KEY_MATRIX_PATH`/`KEY_BUDGET_BYTES` env overrides; WR-03 NaN fix applied |
| `scripts/check-key-weight.test.ts` | Gate exit-code tests | VERIFIED | 3 tests (under-budget, over-budget via 1-byte budget, missing artifact); all pass |
| `package.json` | build:key, build:copy-key-matrix, build:check-key-weight + wired chain + test entries | VERIFIED | All three scripts present; build chain order correct; test script includes `build-key.test.ts`, `check-key-weight.test.ts`, `src/types/schemas.test.ts` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `scripts/build-key.ts` | `data/species-synonyms.csv` | `synonymMap` with `normalizeBinomial` applied to keys (WR-01 fix) | VERIFIED | Line 211–217: `synonymRows` loaded, `synonymMap` built with `normalizeBinomial(r.from_binomial)` as keys |
| `scripts/build-key.ts` | `src/types/schemas.ts` | `KeyMatrixSchema.parse(artifact)` before `writeFileSync` | VERIFIED | Line 277: `const artifact = KeyMatrixSchema.parse({ characters, species, matrix })` |
| `scripts/build-key.ts` | `data/images.csv` | DuckDB SELECT * → JS-side `Map<slug,filename>` | VERIFIED | Lines 116–169: `read_csv('data/images.csv')`, TypeScript Map built; no slug interpolation in SQL |
| `src/components/key-matrix-cache.ts` | `src/types/schemas.ts` | `KeyMatrixSchema` import and `.parse()` call | VERIFIED | Lines 6–7: imports `KeyMatrixSchema` and `KeyMatrix` from `../types/schemas.ts`; line 25: `KeyMatrixSchema.parse(data)` |
| `package.json build` | `scripts/build-key.ts` | `build:key` after `build:data`, before `build:eleventy` | VERIFIED | Chain: `build:data && npm run build:key && npm run build:eleventy` |
| `package.json build` | `scripts/check-key-weight.ts` | `build:check-key-weight` after `build:copy-key-matrix` | VERIFIED | Chain: `build:copy-key-matrix && npm run build:check-key-weight` |
| `.github/workflows/deploy.yml` | `scripts/build-key.ts` | `build:key` in CI chain | VERIFIED | Line 41: identical chain as `package.json` |
| `.github/workflows/pr-check.yml` | `scripts/check-key-weight.ts` | `build:check-key-weight` in CI chain | VERIFIED | Line 43: identical chain as `deploy.yml` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `data/key-matrix.json` | `characters`, `species`, `matrix` | `data/key-characters.csv` (csv-parse) + `data/species.csv` (slug resolution) + `data/images.csv` (DuckDB nav-image join) | Yes — 1192 matched species from real CSV parsing; DuckDB query against real `images.csv`; 237 character-states from real Lucid export | FLOWING |
| `_site/key-matrix.json` | (copy of `data/key-matrix.json`) | `copy-key-matrix.ts` reads `data/key-matrix.json` | Yes — same artifact | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `build-key.ts` exits 0, emits correct artifact | `time node scripts/build-key.ts` | exit 0; 204ms wall; `matched=1192, unmatched=36` | PASS |
| `key-matrix.json` shape (237 chars, 1192 species, uniform bitsets) | `node -e` shape check | `characters:237, species:1192, matrix:237, mismatches:0` | PASS |
| Coverage report totals | `node -e` on `key-coverage-report.json` | `matched:1192 + unmatched:36 === 1228` | PASS |
| WR-04: apantesis-doris shows Apantesis genus | `node -e` check | `genus:"Apantesis"`, 0 Grammia genus entries | PASS |
| gzip budget gate | `node scripts/check-key-weight.ts` | `41.1 KB gzip (<= 50 KB budget)`, exit 0 | PASS |
| All 55 phase-39 tests pass | `node --test scripts/build-key.test.ts scripts/check-key-weight.test.ts src/components/key-matrix-cache.test.ts src/types/schemas.test.ts` | 55 pass, 0 fail | PASS |
| Typecheck clean | `npm run typecheck` | exit 0, zero errors | PASS |
| SQL injection absent | `grep -n "SELECT.*\${" scripts/build-key.ts` | No matches | PASS |
| CI chains identical | string comparison deploy.yml vs pr-check.yml | IDENTICAL | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| KEY-01 | 39-01-PLAN.md | 237 character-states ingested as per-character-state base64 bitsets over matched species | SATISFIED | `matrix.length===237`; LSB-first Uint8Array bitsets; `buildBitset` tested and guarded |
| KEY-02 | 39-01-PLAN.md | 237 characters with full Category[:Subcategory]:Question:State hierarchy (2- and 3-level) | SATISFIED | `characters.length===237`; `parseCharacterLabel` handles 3-part and 4-part labels; tested |
| KEY-03 | 39-01-PLAN.md | Zod build-time schema + load-time structural guard | SATISFIED | `KeyMatrixSchema.parse()` in `build-key.ts:277`; `validateKeyMatrix` in `key-matrix-cache.ts`; both tested |
| KEY-04 | 39-02-PLAN.md | Post-build gzip <= 50 KB gate fails on bloat | SATISFIED | `check-key-weight.ts` exits 1 on `> 50*1024` bytes; current artifact 41.1 KB; gate verified |
| KEY-05 | 39-02-PLAN.md | `build:key` < 5s, wired into `npm run build` + both CI gates | SATISFIED | 204ms measured; wired in `package.json` + both workflows |
| MATCH-01 | 39-01-PLAN.md | All 1,228 binomials resolved (direct + synonym), whitespace-tolerant | SATISFIED | `resolveSlug` normalizes before both lookups; `Tolype  laricis`, `Tyta luctuosa`, `Grammia doris` all resolve correctly |
| MATCH-02 | 39-01-PLAN.md | Coverage report lists every unmatched binomial | SATISFIED | 36 unmatched entries in `key-coverage-report.json` with `{binomial, direct_slug, reason}` |
| MATCH-03 | 39-01-PLAN.md + 39-02-PLAN.md | Matched species join to CDN nav thumbnail; unmatched excluded | SATISFIED | 1192 matched species each have `nav_image` field (1190 non-null); DuckDB join confirmed; unmatched excluded |

**Note on REQUIREMENTS.md traceability table:** The table maps MATCH-01/02/03 to "Phase 40" but the actual implementation is fully in Phase 39 per CONTEXT.md D-02. Phase 40 does not yet exist. The CONTEXT.md explicitly flags this roadmap discrepancy and lists it as a deferred editorial fix. The requirements are satisfied by Phase 39's implementation.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/components/key-matrix-cache.ts` | — | `image_filename: null` on all 237 characters | Info | Intentional stub per SUMMARY; Phase 43 curator pass will populate; `validateKeyMatrix` accepts null per schema |
| `data/key-matrix.json` | — | `common_name: null` on all 1192 species | Info | Intentional; key CSV has no common names; could be joined from `species.csv` in future |

No `TBD`, `FIXME`, or `XXX` markers in any modified file. No empty implementations blocking goal. Both null fields are accepted as valid by the schema and explicitly documented as known stubs in 39-01-SUMMARY.md.

### Review Findings Closure

All 4 review warnings (WR-01 through WR-04) are confirmed fixed in the codebase:

- **WR-01** (synonym key not normalized): `build-key.ts:216` — `normalizeBinomial(r.from_binomial)` applied at map construction. VERIFIED.
- **WR-02** (buildBitset silent OOB): `build-key.ts:100-103` — `RangeError` guard before bit-write. VERIFIED.
- **WR-03** (NaN bypass in weight gate): `check-key-weight.ts:9-18` — `Number.isFinite(n) && n >= 0` validation with exit 1. VERIFIED.
- **WR-04** (old genus/epithet for synonym-resolved species): `build-key.ts:238-262` — `slugToName` Map from `species.csv` used; `apantesis-doris` shows `genus:"Apantesis"`, 0 Grammia genus entries remain. VERIFIED.

### Human Verification Required

### 1. Unmatched Binomial Plausibility Review

**Test:** Open `data/key-coverage-report.json` and read through all 36 `unmatched_binomials` entries
**Expected:** Each entry should be a recognisably reclassified, historically synonymised, or genuinely absent taxon (e.g. Grammia species not yet added to `species-synonyms.csv`, obsolete names from the 2015 Lucid export). None should be a parse artefact or a whitespace failure that slipped through normalization.
**Why human:** Determining whether an unmatched binomial is a genuine curation gap vs. a data-pipeline bug requires taxonomic/biological judgment. The pipeline count (36) and JSON shape are programmatically confirmed; the content requires domain knowledge to validate.

---

_Verified: 2026-06-24_
_Verifier: Claude (gsd-verifier)_
