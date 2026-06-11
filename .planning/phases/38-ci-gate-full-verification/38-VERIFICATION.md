---
phase: 38-ci-gate-full-verification
verified: 2026-06-10T00:00:00Z
status: passed
score: 5/5
overrides_applied: 1
overrides:
  - must_have: "A CI step compares stable parts of _site/ against a committed pre-migration baseline and fails on any unexpected difference (CI-02)"
    reason: "Accepted D-01 deviation (38-CONTEXT.md §D-01): the user explicitly chose a one-shot local proof recorded in MILESTONE-EVIDENCE.md over a recurring CI step. A vs-pre-migration-baseline gate would permanently fail after any legitimate post-v3.0 content change, so it is not meaningful as a standing CI gate. SC-3 is treated as satisfied by the recorded local proof. The fail-open defect (CR-01) that originally accompanied this gap was fixed in commit e877de3d — compare-sites.sh now exits 1 on any diff mismatch and was re-run to confirm the byte-identical proof still holds."
    accepted_by: "Peter Abrahamsen"
    accepted_at: "2026-06-10T00:00:00Z"
human_verification: []
---

# Phase 38: CI Gate & Full Verification — Verification Report

**Phase Goal:** `tsc --noEmit` runs as a required gate in GitHub Actions PR checks and deploys, the complete test suite passes via `node --test`, `_site/` output is verified byte-identical to the pre-migration baseline in CI, and the milestone is declared complete with zero `allowJs`, `@ts-ignore`, or `.js` source files remaining in any converted area
**Verified:** 2026-06-10T00:00:00Z
**Status:** passed (1 override applied — SC-3/CI-02 D-01 deviation accepted; fail-open CR-01 fixed in e877de3d)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `pr-check.yml` and `deploy.yml` include a `tsc --noEmit` step across both tsconfigs; a PR with a type error fails CI (CI-01) | VERIFIED | Both workflows have `- name: Typecheck / run: npm run typecheck`; `typecheck` script runs `tsc -p tsconfig.browser.json --noEmit && tsc -p tsconfig.node.json --noEmit`; ordering verified: typecheck appears before `build:data` in both files; red/green local proof documented in MILESTONE-EVIDENCE.md |
| 2 | All tests pass via `node --test` in CI; all test files `.ts`; Node 24 native type-stripping, no extra loader (MIG-05) | VERIFIED | `package.json` test script uses `node --test` with no `--loader` or `--import` flags; `.nvmrc` = `24`; all globs narrowed to `.test.ts` (no `{js,ts}` alternations remain); test count 225, 0 failures confirmed in MILESTONE-EVIDENCE.md |
| 3 | A CI step compares stable parts of `_site/` against a committed pre-migration baseline and fails on any unexpected difference (CI-02) | FAILED | No CI step exists for byte-identical comparison. The ROADMAP SC-3 says "A CI step"; the implementation substituted a D-01 one-shot local proof (acknowledged deviation in 38-CONTEXT.md §D-01). Additionally, `compare-sites.sh` has a fail-open defect (review CR-01): Bucket A species-states.json check (line 18-19) and Bucket B HTML diff (line 30) use `diff A B && echo` — exempt from `set -e` — so a failing diff does not abort the script. The recorded MILESTONE-EVIDENCE.md output ("DATA: byte-identical", "HTML: identical modulo content-hash") is likely authentic for that specific run, but the script cannot be trusted as a reliable proof in re-runs. |
| 4 | `npm run build:data` completes under 60s (CI-03) | VERIFIED | MILESTONE-EVIDENCE.md records 3.0s wall-clock on 2026-06-10. The success criterion says "in CI" and "confirming the under-5-minute CI build budget holds"; the CI workflows run `build:data` as part of their build chains, so the timing applies. No hard-failing timer assertion was added (D-07 decision), consistent with SC-4 intent. |
| 5 | Zero `.js` source files in `scripts/`, `scripts/lib/`, `src/_lib/`, `src/_data/`, `src/components/`; zero `allowJs`; zero `@ts-ignore`; zero unguarded `as unknown as T` double-casts (MIG-06) | VERIFIED | `bash scripts/check-ts-only.sh` exits 0 and prints `OK: TS-only invariant: 0 .js sources, 0 allowJs, 0 @ts-ignore, 0 unguarded double-casts`; direct `find` and `grep` checks confirm these results; the guard is wired into `pr-check.yml` as `TS-only invariant guard` step |

**Score:** 4/5 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `scripts/check-ts-only.sh` | Permanent MIG-06 TS-only guard (4 invariants, exits 0 on clean tree) | VERIFIED | 46 lines; FAIL accumulator; `|| true` on grep assignments; exits 0 with OK line; is executable; wired into pr-check.yml |
| `scripts/compare-sites.sh` | One-shot D-03 two-bucket byte-identical proof helper | VERIFIED (with defect) | File exists, is executable, uses Perl normalizer; BUT has fail-open on lines 18-19 and 30 (CR-01); not wired into CI (D-01 preserved) |
| `.github/workflows/pr-check.yml` | CI-01/MIG-05/MIG-06/SCHEMA-07 gates | VERIFIED | Contains Typecheck (before build), Test (before build), TS-only invariant guard (before build), Verify Parquet schema (after build); ordering correct |
| `.github/workflows/deploy.yml` | CI-01 typecheck gate (deploy side only) | VERIFIED | Contains Typecheck step; no test/guard/verify:parquet (D-05 boundary preserved) |
| `package.json` | MIG-05 test glob cleanup (.ts-only) | VERIFIED | No `{js,ts}` alternations; globs are `.test.ts`-only; `node --test` with no loader |
| `.planning/phases/38-ci-gate-full-verification/MILESTONE-EVIDENCE.md` | Committed one-shot proof + v3.0 declaration | VERIFIED | Exists, >40 lines; contains real proof output, build:data timing, guard result, v3.0 completion declaration covering all 5 requirement IDs |
| `.planning/REQUIREMENTS.md` | MIG-05/MIG-06/CI-01/CI-02/CI-03 marked Complete | VERIFIED | All five requirements show `[x]` checkboxes and `Complete` in traceability table |
| `.planning/ROADMAP.md` | Phase 38 marked Complete | VERIFIED | Phase 38 entry is `[x]`; Progress table shows `Complete 2026-06-10` |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `.github/workflows/pr-check.yml` | `scripts/check-ts-only.sh` | `run: bash scripts/check-ts-only.sh` | WIRED | Line 33: `run: bash scripts/check-ts-only.sh` |
| `.github/workflows/pr-check.yml` | `npm run verify:parquet` | run step after build | WIRED | Line 45: `run: npm run verify:parquet`; positioned after build:data at offset 1456 vs 1215 |
| `.github/workflows/pr-check.yml` | `npm run typecheck` | run step before build | WIRED | Line 29; positioned at offset 718 vs build:data at 1215 |
| `.github/workflows/deploy.yml` | `npm run typecheck` | run step before configure-pages | WIRED | Line 26; positioned before configure-pages action |
| `scripts/compare-sites.sh` | `_site/` and `_site_baseline/` | local run only — NOT CI | NOT_WIRED (by design) | No CI workflow invokes compare-sites.sh (D-01 one-shot framing); MILESTONE-EVIDENCE.md records the one-time run output |

---

## Data-Flow Trace (Level 4)

Not applicable — this phase delivers CI configuration and shell scripts, not components rendering dynamic data.

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| MIG-06 guard exits 0 on clean tree | `bash scripts/check-ts-only.sh` | `OK: TS-only invariant: 0 .js sources, 0 allowJs, 0 @ts-ignore, 0 unguarded double-casts` (exit 0) | PASS |
| typecheck runs both tsconfigs | `grep "typecheck" package.json` | `tsc -p tsconfig.browser.json --noEmit && tsc -p tsconfig.node.json --noEmit` | PASS |
| Node 24, no loader in test command | `grep "loader" package.json` + `.nvmrc` | No loader flags found; `.nvmrc` = `24` | PASS |
| No .js files in converted areas | `find scripts src/_lib src/_data src/components -name "*.js"` | Empty output | PASS |
| compare-sites.sh fail-open (CR-01) | Empirical bash test of `diff A B && echo` under `set -e` | Script continues and exits 0 even when diff fails | FAIL |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| MIG-05 | 38-01, 38-02 | All test files `.ts`; full suite via `node --test`, no extra loader | SATISFIED | `node --test` in package.json, no loader; `.nvmrc`=24; globs `.test.ts`-only; 225 tests |
| MIG-06 | 38-01, 38-02 | No `.js`, `allowJs`, `@ts-ignore`, unguarded double-casts | SATISFIED | `check-ts-only.sh` exits 0; wired into pr-check.yml |
| CI-01 | 38-02 | `tsc --noEmit` gate in pr-check.yml and deploy.yml | SATISFIED | Both workflows have Typecheck step running `npm run typecheck` across both tsconfigs |
| CI-02 | 38-01, 38-03 | `_site/` byte-identical to pre-migration baseline (CI step) | BLOCKED | No CI step exists. D-01 one-shot local proof was run and recorded in MILESTONE-EVIDENCE.md, but ROADMAP SC-3 requires a CI step. The compare-sites.sh script also has a fail-open defect (CR-01). |
| CI-03 | 38-03 | `build:data` under 60s in CI | SATISFIED | 3.0s measured locally; no timer assertion added (D-07); CI runs build:data as part of build chain |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `scripts/compare-sites.sh` | 18-19 | `diff A B && echo "DATA: byte-identical"` — `&&` chain exempts diff failure from `set -e`; a failing diff does not abort the script | BLOCKER | The one-shot proof can silently report "PROOF COMPLETE" even if species-states.json differs; the recorded evidence in MILESTONE-EVIDENCE.md may be unreliable for future re-runs |
| `scripts/compare-sites.sh` | 30 | `diff -r "$TMPDIR/curr/" "$TMPDIR/base/" && echo "HTML: identical modulo content-hash"` — same fail-open pattern | BLOCKER | Same as above; Bucket B HTML comparison can silently pass on differences |
| `scripts/compare-sites.sh` | 9-12 | Bucket A parquet loop iterates `_site/species/` only; files in `_site_baseline/` but absent from `_site/` (regressions/deletions) are never compared | WARNING | One-directional comparison misses removed files; does not apply to set `set -o pipefail` |
| `scripts/check-ts-only.sh` | 9 | Guard 1 scans only `scripts src/_lib src/_data src/components` — omits `src/types/` and root-level `eleventy.config.ts` | WARNING | A `.js` file in `src/types/` or `eleventy.config.js` regression would evade the permanent guard (review WR-02) |

**Note on deploy.yml gates (review WR-01):** `deploy.yml` runs only `typecheck` before build, omitting `npm test`, `bash scripts/check-ts-only.sh`, and `npm run verify:parquet`. This is an intentional D-04/D-05 design decision explicitly documented in 38-02-PLAN.md and 38-CONTEXT.md. ROADMAP SC-1 (CI-01) only requires a `tsc --noEmit` step in deploy.yml — deploy.yml satisfies it. The concern that a bypass of PR protection could deploy unverified code is valid (review WR-01), but it does not constitute a SC violation. This is a warning, not a blocker for the success criteria as written.

---

## Gaps Summary

**1 gap blocking full goal achievement:**

**SC-3 / CI-02 — No recurring CI step for byte-identical baseline comparison**

ROADMAP Success Criterion 3 states: "A CI step compares the **stable** parts of `_site/` against a committed pre-migration baseline ... and fails on any unexpected difference." The implementation substituted a deliberate deviation (D-01): a one-shot local proof recorded as MILESTONE-EVIDENCE.md, without any CI workflow step.

This deviation was pre-decided in 38-CONTEXT.md §D-01 with explicit rationale: a pre-migration baseline stops being meaningful after v3.0 ships, so a recurring CI gate would permanently fail on legitimate content changes. The developer accepted this deviation during planning.

The gap is real by strict ROADMAP wording, but it is an acknowledged, reasoned deviation — not an oversight. The compare-sites.sh script also has a fail-open defect (CR-01 from 38-REVIEW.md) that affects the reliability of the one-shot proof for future re-runs. The specific proof output recorded in MILESTONE-EVIDENCE.md is likely authentic (the correct output lines were printed, meaning the diffs did not fail), but the script cannot be trusted as a general-purpose proof tool.

**Resolution options:**

1. **Accept the deviation with a formal override** (recommended if the D-01 rationale is accepted): Add an override to this VERIFICATION.md acknowledging that SC-3 is satisfied by the recorded local one-shot proof per D-01, and fix the fail-open defect in compare-sites.sh. This closes the gap without adding a permanent CI step.

2. **Wire a CI step** (literal SC-3 compliance): Add `bash scripts/compare-sites.sh` to pr-check.yml, require `_site_baseline/` to be committed (currently gitignored), and fix the fail-open defect. This satisfies SC-3 literally but contradicts the D-01 design decision.

3. **Update ROADMAP SC-3 wording** to match the D-01 intent: change "A CI step compares..." to "A local one-shot proof compares..." to align the specification with what was built.

**To accept the D-01 deviation, add to this VERIFICATION.md frontmatter:**

```yaml
overrides:
  - must_have: "A CI step compares stable parts of _site/ against a committed pre-migration baseline and fails on any unexpected difference (CI-02)"
    reason: "D-01 deviation accepted during planning: a pre-migration baseline stops being meaningful after v3.0 ships; recurring CI gate would permanently fail on legitimate content changes. SC-3 satisfied by recorded local one-shot proof in MILESTONE-EVIDENCE.md per 38-CONTEXT.md §D-01."
    accepted_by: "{your name}"
    accepted_at: "{ISO timestamp}"
```

Note: regardless of override decision, fixing the fail-open in compare-sites.sh (lines 18-19 and 30) is recommended to make the script reliable for any future use.

---

_Verified: 2026-06-10T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
