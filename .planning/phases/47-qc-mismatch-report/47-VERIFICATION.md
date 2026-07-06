---
phase: 47-qc-mismatch-report
verified: 2026-07-05T23:53:37Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
---

# Phase 47: QC Mismatch Report Verification Report

**Phase Goal:** Curators can see, in a non-blocking build artifact, every record whose stated district disagrees with its coordinate-derived district (or whose coordinates fall outside all known boundaries), tiered by severity so the report stays reviewable rather than becoming noise.
**Verified:** 2026-07-05T23:53:37Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 (SC#1/QC-01) | `npm run build` emits `_site/records-district-audit.csv` every run; mismatches never fail the build | VERIFIED | `package.json`'s `build:site` chain runs `... && npm run build:species-audit && npm run build:records-district-audit && npm run build:pagefind ...`. Ran full `npm run build` — exit 0, `_site/records-district-audit.csv` written (95,397 data rows) with 217 far-mismatch + 1230 adjacent-and-close + 2460 outside-all-boundaries rows present, build still succeeded. Directly forced a coverage gap (deleted one row from `data/records-derived-district.csv`) and re-ran `node scripts/emit-records-district-audit.ts`: it printed `COVERAGE GAP: 1 record(s)...` and exited 1 (input restored afterward, verified byte-identical via `git diff`). Confirms D-07: only an artifact-absence gap fails the build, never a tier mismatch. |
| 2 (SC#2/QC-02) | Every row is bucketed into one of the four tiers, sorted by severity, with per-tier summary counts available | VERIFIED | `awk` over the emitted CSV's `tier` column shows four contiguous blocks in severity order: `far-mismatch`(217) → `adjacent-and-close`(1230) → `outside-all-boundaries`(2460) → `same`(91490), summing to 95,397. `_site/records-district-audit-summary.json` exists with the same four counts + `total: 95397`. The CSV itself is valid RFC-4180 — `head -1` is the plain header (`row_index,species_slug,...`), `grep -c '^#'` is 0 (no comment/preamble lines), confirming the checkpoint-driven fix (commit `39ccf37a`) that moved summary counts out of the CSV body into the JSON sidecar to preserve CSV validity. |
| 3 (SC#3/QC-03) | A record with missing/null coordinates passes through with no district assigned and is never flagged as a mismatch | VERIFIED | `assignTier`'s D-08 branch (`derivedDistrictId === null → outside-all-boundaries`, unconditional on stated side) is implemented exactly this way in `scripts/emit-records-district-audit.ts:66-89`, and `scripts/derive-district-audit.ts` emits an explicit `no-coords` `DerivedOutcome` (blank/unparseable lat-lon) distinct from `out-of-bounds`/`axis-order-suspect`, verified by dedicated unit tests in both `*.test.ts` files (`no-coords` outcome tests, D-08 outside-all-boundaries tests). Real committed data currently has 0 `no-coords` rows (all coordinates parse), so the pass-through path is proven by the pinned/passing unit tests reading the actual production module rather than by a live example row — acceptable since the logic is directly exercised, not stubbed. |
| 4 (SC#4/QC-01) | The audit CSV is unlinked — reachable only by direct URL | VERIFIED | After a full `npm run build`, `grep -rl "records-district-audit" _site --include="*.html"` returns 0 matches (same result as the `species-audit.csv` precedent, also 0 matches). |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `scripts/derive-district-audit.ts` | Full-coverage maintainer derivation, report-only | VERIFIED | Exists, exports `classifyRecordsForDerivation`, `buildDerivedDistrictRows`, `DERIVED_COLUMNS`, `DerivedOutcome`, `main`; `grep` confirms no `writeFileSync` targets `data/records.csv` and `applyDistrictAssignments` is never imported (only writes `data/records-derived-district.csv`, line 223). |
| `data/records-derived-district.csv` | Committed, one row per record, 100% coverage, row_index-keyed | VERIFIED | Parsed with `csv-parse`: 95,397 data rows, matches `data/records.csv`'s 95,397 data rows exactly; `row_index` set is exactly `{0..95396}` — 0 missing indexes. |
| `scripts/build-district-adjacency.ts` | Precomputed district-adjacency table, fail-loud on empty boundary | VERIFIED | Exists, exports `computeAdjacency`, `AdjacencyPair`, `ADJACENCY_COLUMNS`; zero-row guard present (`throw ... FAIL: districts table loaded zero rows`, line 72-73). |
| `data/district-adjacency.csv` | Committed canonical `a<b` adjacency pairs | VERIFIED | Exists, 535 pairs, consumed by the emit step's adjacency `Set`. |
| `scripts/emit-records-district-audit.ts` | Pure CSV/JSON build-time emit step, tiering + coverage gate | VERIFIED | Exists (458 lines), imports only `node:fs`/`node:path`/`csv-parse/sync` — no `@duckdb/node-api` (grep-confirmed). Exports `assignTier`, `findCoverageGaps`, `buildRecordsDistrictAuditRows`, `toCsv`, `buildSummary`, `main`, `AUDIT_HEADER`, `TIER_SEVERITY`, `Tier`. `findCoverageGaps` runs first in `main()`, before any join/write. |
| `_instructions/ASSIGNING_DISTRICTS.md` / `_instructions/REFRESHING_BOUNDARIES.md` | Maintainer runbooks updated | VERIFIED | Both contain numbered steps referencing `derive-district-audit` / `build-district-adjacency` respectively, with real example output. |
| `package.json` | `build:records-district-audit` wired into `build:site` after `build:species-audit`; 3 new test files registered | VERIFIED | `build:site` chain: `...&& npm run build:species-audit && npm run build:records-district-audit && npm run build:pagefind...`. `test` script string includes `derive-district-audit.test.ts`, `build-district-adjacency.test.ts`, `emit-records-district-audit.test.ts`. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `emit-records-district-audit.ts` | `data/records-derived-district.csv` + `data/records.csv` | row_index positional join, coverage gate first | WIRED | Confirmed by direct fault-injection test (removed a derived row → build exited 1 with actionable message; restored, re-verified byte-identical). |
| `emit-records-district-audit.ts` | `data/district-adjacency.csv`, `data/district-crosswalk.csv`, `data/boundaries/pnw-districts.geojson` | JSON/CSV parse, no DuckDB | WIRED | All four sources read via `csv-parse`/`JSON.parse` in `main()`; no SQL/spatial extension at build time. |
| `package.json build:site` | `scripts/emit-records-district-audit.ts` | `npm run build:records-district-audit` | WIRED | Ran full `npm run build` — exit 0, step executed in sequence, file present afterward. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `_site/records-district-audit.csv` | `rows` (AuditRow[]) | `buildRecordsDistrictAuditRows` over real `data/records.csv` (95,397 rows) + real `data/records-derived-district.csv` | Yes — real per-outcome tier distribution (217/1230/2460/91490) computed from committed production data, not fixtures | FLOWING |
| `_site/records-district-audit-summary.json` | `summary` (AuditSummary) | `buildSummary(rows)` tallying the same real rows | Yes — counts cross-checked against CSV's own tier-column tally (exact match) | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Emit step runs standalone | `npm run build:records-district-audit` | exit 0, prints tier counts, writes CSV + sidecar | PASS |
| Full build succeeds with mismatches present | `npm run build` | exit 0, all steps completed including `build:records-district-audit`, `verify:parquet`, `build:validate-links` | PASS |
| Coverage-gap gate fires on artifact staleness | Removed one row from `data/records-derived-district.csv`, re-ran `node scripts/emit-records-district-audit.ts` | `COVERAGE GAP: 1 record(s)...`, exit 1, no CSV write | PASS |
| Unlinked assertion | `grep -rl "records-district-audit" _site --include="*.html"` | 0 matches | PASS |
| Full test suite | `npm test` | 652/652 pass, 0 fail | PASS |
| Typecheck | `npm run typecheck` | clean, no errors | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|--------------|-------------|--------------|--------|----------|
| QC-01 | 47-01, 47-02, 47-04, 47-05 | Non-blocking, unlinked `_site/records-district-audit.csv` emitted each build; build never fails on a mismatch | SATISFIED | Truths #1 and #4 above; live fault-injection proves the coverage-gap/mismatch distinction. |
| QC-02 | 47-01, 47-03, 47-04, 47-05 | Four confidence tiers, sorted by severity, with summary counts | SATISFIED | Truth #2 above; sidecar JSON + valid CSV. |
| QC-03 | 47-01, 47-02, 47-04 | Missing-coordinate records pass through with no district and no false flag | SATISFIED | Truth #3 above; D-08 branch + `no-coords` outcome, unit-tested. |

No orphaned requirements — REQUIREMENTS.md maps only QC-01/02/03 to Phase 47, and all three appear in every relevant plan's frontmatter `requirements:` field.

### Anti-Patterns Found

None. Scanned `scripts/emit-records-district-audit.ts`, `scripts/derive-district-audit.ts`, `scripts/build-district-adjacency.ts`, their three test files, `package.json`, and both updated runbooks for `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`/"not yet implemented" — zero matches.

### Human Verification Required

None outstanding. The phase's one `checkpoint:human-verify` task (47-05 Task 2, curator legibility) was executed during phase execution — the maintainer's first pass found the emitted CSV was not valid RFC-4180 (a `#`-prefixed preamble broke the header-on-line-1 contract), which was fixed in commit `39ccf37a` (sidecar JSON pattern) and re-approved. This verification independently confirms the resulting artifact is valid: header is line 1, zero `#` lines, sidecar JSON present with matching counts, full suite green. The human sign-off itself is not independently re-verifiable from the codebase (it was an interactive judgment call), but the concrete fix it produced is directly confirmed here.

### Gaps Summary

No gaps. All four ROADMAP success criteria and all three requirement IDs (QC-01, QC-02, QC-03) are verified against the live codebase and real committed data, not merely SUMMARY claims:

- The `build:site` wiring, coverage-gap gate, and non-blocking-mismatch behavior were independently re-proven with a live fault-injection test (not just re-reading the SUMMARY's claim).
- Full coverage (95,397/95,397, row_index exactly `0..95396`, zero gaps) was independently recomputed via `csv-parse`, not taken from the SUMMARY's stated numbers.
- The checkpoint-driven CSV-validity fix (hash-preamble → JSON sidecar) was independently confirmed present in the current `scripts/emit-records-district-audit.ts` and its live build output, not assumed from the SUMMARY narrative.
- Full test suite (652/652) and typecheck were re-run fresh, not read from a prior log.

---

*Verified: 2026-07-05T23:53:37Z*
*Verifier: Claude (gsd-verifier)*
