---
phase: 27-synonym-curation-pass
verified: 2026-05-22T18:15:00Z
status: human_needed
score: 4/4 must-haves verified
overrides_applied: 0
re_verification: null
gaps: []
human_verification:
  - test: "Run `npm run photos:investigate` against a synonyms.csv with one real row and confirm the output does NOT include 'per-bucket distribution'"
    expected: "The RESORT_ONLY path only prints `[ingest-photos] re-sorted manifest; N rows; M promoted to resolved-via-synonym`. The runbook (line 121) claims it shows 'the new per-bucket distribution', which does not match the actual code output. A human curator using the runbook to self-verify match-rate progress will be confused."
    why_human: "WR-03 from code review: the runbook over-promises RESORT_ONLY output. This is a usability/documentation gap that requires a human to decide whether to (a) fix the runbook wording or (b) add bucket tally to the RESORT_ONLY code path. The verifier can confirm the mismatch from code inspection but cannot evaluate which correction is preferred."
  - test: "Save data/species-synonyms.csv with a UTF-8 BOM using Notepad or Excel (Windows), then run `npm run photos:investigate` with a synonym row present"
    expected: "WR-02: csv-parse without `bom: true` will silently drop all rows whose `from_binomial` column becomes `<U+FEFF>from_binomial`. A human on Windows should reproduce and confirm the silent failure mode before the first curator pass on Windows hardware."
    why_human: "Cannot test BOM corruption in this environment without Windows/Notepad. The code path (loadSynonyms missing `bom: true`) is confirmed by inspection, but the actual curator risk depends on the operating systems curators use. The decision to accept or fix WR-02 is a human call."
---

# Phase 27: Synonym Curation Pass Verification Report

**Phase Goal:** A curator can convert the spike's bounded "needs investigation" workload (~30–80 unique unresolved binomials) into committed `data/species-synonyms.csv` decisions and rerun classification on the existing manifest to reclassify affected rows without re-downloading any source files.
**Verified:** 2026-05-22T18:15:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC-1 | A flat `data/species-synonyms.csv` (committed) maps outdated binomials to current species slugs and is editable by a non-technical curator following the `_instructions/` pattern | VERIFIED | File exists at correct path, header-only per D-08, two-column schema confirmed, 30 bytes, no BOM (`66726f` first bytes), zero data rows, csv-parse yields 0 records. Runbook exists at `_instructions/CURATING_SPECIES_SYNONYMS.md` following v2.x section structure. |
| SC-2 | Re-running classification against an updated `species-synonyms.csv` reclassifies affected manifest rows from `genus-only`/`likely-synonym` to `resolved-via-synonym`, updates `binomial_resolved` and `species_slug`, and does not redownload source TIFFs | VERIFIED | `loadSynonyms` + synonym pre-pass in `classify()` implemented and exported. RESORT_ONLY block loads species + synonyms, walks manifest rows, mutates `match_bucket`/`binomial_resolved`/`species_slug` only (status untouched). No Dropbox calls in RESORT_ONLY path. 9/9 unit tests pass. `npm run photos:investigate` alias confirmed. |
| SC-3 | The manifest exposes a readable "needs investigation" view sorted by frequency — curator immediately sees highest-impact unresolved binomials at the top | VERIFIED | `sortForInvestigation` is explicitly left unchanged (L-03); it is called in both the RESORT_ONLY path (line 354) and the full-run path (line 524). The runbook (Step 1) explains this view to the curator. `resolved-via-synonym` rows trail with `clean-match` rows per L-03. |
| SC-4 | The MECHANISM for a curation pass exists (curatable CSV + reclassification path) | VERIFIED | Per verifier note: this criterion requires the mechanism, not the >=95% outcome metric. The mechanism is fully present: `data/species-synonyms.csv` (editable seed), `loadSynonyms` (loads it), `classify()` pre-pass (applies it), `photos:investigate` alias (triggers reclassification without Dropbox), runbook (explains the loop). |

**Score:** 4/4 truths verified

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| CURATE-01 | 27-01, 27-03 | Maintainer can author a flat `data/species-synonyms.csv` editable by a non-technical curator | SATISFIED | File committed with correct schema; `_instructions/CURATING_SPECIES_SYNONYMS.md` provides the non-technical curator workflow |
| CURATE-02 | 27-02 | Re-running classification reclassifies affected rows without re-downloading source files | SATISFIED | RESORT_ONLY path: loads synonyms, re-classifies per row, writes manifest, returns without any Dropbox calls; `photos:investigate` alias is the curator command |
| CURATE-03 | 27-02, 27-03 | Manifest exposes a readable "needs investigation" view sorted by frequency | SATISFIED | `sortForInvestigation` preserved intact; RESORT_ONLY path calls it; runbook explains the sorted view to the curator |

All 3 required CURATE requirements are satisfied. No orphaned requirements found.

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `data/species-synonyms.csv` | Header-only seed, two-column schema | VERIFIED | 30 bytes, `from_binomial,to_species_slug\n`, no BOM, no data rows, csv-parse yields 0 records |
| `scripts/ingest-photos.js` | `loadSynonyms` + classify pre-pass + RESORT_ONLY reclassification | VERIFIED | 553 lines; exports `loadSynonyms` (line 164) and `classify` (line 218); `SYNONYMS_CSV` constant (line 39); `existsSync` import (line 25); synonym pre-pass at step −1 (line 227–230); RESORT_ONLY block (lines 329–358) |
| `scripts/ingest-photos.test.js` | 9 unit tests covering D-04, D-06, D-09 | VERIFIED | 146 lines; 9 tests across 2 describe groups; all 9 pass; uses `node:test`, `node:assert/strict`, tmpdir pattern |
| `package.json` | Test glob includes `scripts/ingest-photos.test.js` | VERIFIED | `scripts.test` includes the file between `check-page-weight.test.js` and `migrate-species.test.js`; `photos:investigate` alias = `RESORT_ONLY=1 node scripts/ingest-photos.js` |
| `_instructions/CURATING_SPECIES_SYNONYMS.md` | v2.x runbook, 80-250 lines, locked structure | VERIFIED | 128 lines; 5 required `##` headers; 7 `### N.` step sub-headers; all 12 top binomials present; `npm run photos:investigate` referenced 3 times; forbidden topics grep = 0 |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `scripts/ingest-photos.js` | `data/species-synonyms.csv` | `loadSynonyms` + `existsSync` guard | WIRED | `SYNONYMS_CSV = resolve('data/species-synonyms.csv')` at line 39; passed to `loadSynonyms(SYNONYMS_CSV, species)` at lines 331, 393 |
| `scripts/ingest-photos.js` | `data/species.csv` | `species.bySlug` lookup in `loadSynonyms` | WIRED | `target = species.bySlug.get(to)` at line 173; species fixture from `loadSpecies(SPECIES_CSV)` |
| `scripts/ingest-photos.test.js` | `scripts/ingest-photos.js` | Named imports `classify`, `loadSynonyms` | WIRED | Line 6: `import { classify, loadSynonyms } from './ingest-photos.js'`; both are consumed in test bodies |
| `classify()` | `loadSynonyms()` | `synonyms` Map as 3rd arg | WIRED | Signature `classify({ ... }, species, synonyms)` at line 218; pre-pass uses `synonyms.has(binomialFromParser)` at line 227; Map built by `loadSynonyms` and passed at lines 331+469, 393+469 |
| `_instructions/CURATING_SPECIES_SYNONYMS.md` | `data/species-synonyms.csv` | Curator instructions for adding rows | WIRED | Referenced 6 times; Step 4 walks curator through editing the file |
| `_instructions/CURATING_SPECIES_SYNONYMS.md` | `npm run photos:investigate` | Command reference | WIRED | Referenced 3 times in Steps 5, Verify, When Things Go Wrong |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| `loadSynonyms()` | `synonyms` Map | `csv-parse/sync` on `data/species-synonyms.csv` + `species.bySlug` validation | Yes — reads file, validates slugs, builds Map | FLOWING |
| RESORT_ONLY block | `existing` rows | `readManifest(MANIFEST_PATH)` | Yes — reads manifest CSV; mutates rows per synonym Map | FLOWING |
| `classify()` pre-pass | `synonyms.get(binomialFromParser)` | `synonyms` Map from `loadSynonyms` | Yes — Map lookup returns `{binomial_resolved, species_slug}` when key found | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 9 new tests pass | `npm test 2>&1 \| grep -E "(pass\|fail)"` | `pass 157, fail 0` | PASS |
| `classify` and `loadSynonyms` exported | `grep -n "^export" scripts/ingest-photos.js` | Lines 164 and 218 export both | PASS |
| `SYNONYMS_CSV` constant wired | `grep -cF "const SYNONYMS_CSV"` | 1 match | PASS |
| `existsSync` imported | `grep -cE "^import.*existsSync.*node:fs"` | 1 match | PASS |
| `synonym-warn` logged in loadSynonyms | `grep -cF "'synonym-warn'"` | 1 match | PASS |
| `reclassify` logged in RESORT_ONLY | `grep -cF "'reclassify'"` | 1 match | PASS |
| Syntax valid | `node --check scripts/ingest-photos.js` | Exit 0, SYNTAX_OK | PASS |
| `photos:investigate` alias exists | `node -e "..."` JSON introspection | `RESORT_ONLY=1 node scripts/ingest-photos.js` | PASS |
| Forbidden topics absent from runbook | `grep -cE '(GBIF\|ITIS\|...)' _instructions/...` | 0 | PASS |
| All 12 binomials in runbook | per-name grep | 12/12 present | PASS |
| Runbook line count in band | `wc -l` | 128 (80-250 band) | PASS |

---

### RED-then-GREEN Commit Verification

| Commit | Hash | Files | Status |
|--------|------|-------|--------|
| feat(27-01): seed data/species-synonyms.csv | `35090b2` | `data/species-synonyms.csv` only | VERIFIED |
| test(27-02): add failing tests for synonym-aware classify cascade and loadSynonyms | `9bc871c` | `package.json`, `scripts/ingest-photos.test.js` only | VERIFIED |
| feat(27-02): synonyms.csv pre-pass in classify() promotes matched rows to resolved-via-synonym | `dfaeccc` | `scripts/ingest-photos.js` only | VERIFIED — RED before GREEN confirmed |
| docs(27-03): curator runbook for data/species-synonyms.csv | `6a80990` | `_instructions/CURATING_SPECIES_SYNONYMS.md` only | VERIFIED |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `scripts/ingest-photos.js` | 338 | `(row.binomial_raw \|\| '').toLowerCase()` missing `.trim()` vs `loadSynonyms` line 171 which does `.trim().toLowerCase()` | Info (IN-01 from code review) | Asymmetric normalization — if `binomial_raw` ever has leading/trailing whitespace from csv-parse, the RESORT_ONLY synonym lookup silently misses; Phase 26 writer never injects whitespace, so currently risk-free |
| `scripts/ingest-photos.js` | 329-358 | No demotion branch in RESORT_ONLY — removing a synonyms.csv row does not demote promoted manifest rows | Warning (WR-01 from code review) | A curator who deletes a synonym row and re-runs `photos:investigate` will see stale `resolved-via-synonym` rows persisted. The runbook frames synonyms.csv as the source of truth; this breaks that mental model. |
| `scripts/ingest-photos.js` | 167 | `parse(raw, { columns: true, skip_empty_lines: true })` — no `bom: true` | Warning (WR-02 from code review) | A curator who saves `species-synonyms.csv` with a UTF-8 BOM (Notepad default on Windows, Excel UTF-8 export) will see all rows silently dropped. No error is emitted. |
| `_instructions/CURATING_SPECIES_SYNONYMS.md` | 121 | "shows the promoted count and the new per-bucket distribution" | Warning (WR-03 from code review) | RESORT_ONLY path only prints the promoted count, not a per-bucket distribution. The distribution tally is only in the full-run path (line 535). Runbook claim does not match code behavior. |
| `scripts/ingest-photos.test.js` | 45-56 | Test name "promotes a provisional-marked binomial through synonyms.csv (D-06 widening)" | Warning (WR-04 from code review) | The parser always returns `binomial: null` when `bucketHint: 'provisional'` — these are mutually exclusive in production. The test verifies cascade ordering correctly but its framing as "D-06 widening" implies end-to-end reachability that does not exist in the current parser. |

**Debt-marker gate check:** No TBD, FIXME, or XXX markers found in phase-modified files.

---

### Code Review Cross-Reference (27-REVIEW.md)

The code review identified 4 warnings and 5 info findings. The verifier confirms:

- **WR-01** (stale promotions): Confirmed by code inspection — no demotion branch in lines 329-358. Not a blocker for SC-1 through SC-4 (the mechanism works for adding synonyms; the delete-synonym case is a gap). No formal follow-up reference documented.
- **WR-02** (BOM handling): Confirmed — `bom: true` absent from `parse()` call at line 167. Affects curator usability on Windows. No formal follow-up reference documented.
- **WR-03** (runbook/code mismatch): Confirmed — RESORT_ONLY path (lines 329-358) has no per-bucket tally; the runbook line 121 claims it does. This is a documentation/usability gap requiring human decision on fix approach.
- **WR-04** (misleading test framing): Confirmed — parser source shows `binomial: null` is always returned with `bucketHint: 'provisional'`. Test passes (cascade ordering is correct) but the framing misleads about production reachability.

None of the 4 warnings constitute a blocker against the phase goal: the core mechanism (editable CSV + reclassification without TIFF downloads) is fully functional. The warnings are pre-first-curator-pass quality concerns.

---

### Human Verification Required

#### 1. Runbook per-bucket distribution claim vs. actual RESORT_ONLY output

**Test:** Run `npm run photos:investigate` with a populated `data/species-synonyms.csv` (one or more real rows) and read the terminal output tail.
**Expected per runbook:** Output includes "the new per-bucket distribution."
**Actual code behavior:** Only `[ingest-photos] re-sorted manifest; N rows; M promoted to resolved-via-synonym` is printed. No bucket distribution.
**Why human:** The discrepancy is confirmed by code inspection (WR-03), but the fix decision requires human judgment: (a) update runbook to remove the bucket distribution claim, or (b) add bucket tally to the RESORT_ONLY code path. Option (b) is the better curator UX per the code review, but the verifier cannot make that choice.

#### 2. BOM handling assessment for curator operating environment

**Test:** Identify whether any curators work on Windows and would use Notepad or Excel to edit `data/species-synonyms.csv`.
**Expected:** If yes, `bom: true` should be added to the `parse()` call in `loadSynonyms` before the first curator pass. If the environment is macOS/Linux only, WR-02 is lower priority.
**Why human:** Cannot determine curator OS from codebase inspection. The code defect (missing `bom: true`) is confirmed; the risk level depends on curator operating environment.

---

### Gaps Summary

No blockers. All four success criteria are verified. The phase goal — "a curator can convert the spike's bounded workload into committed `data/species-synonyms.csv` decisions and rerun classification without re-downloading source files" — is achievable with the shipped mechanism.

The human verification items surface two pre-first-curator-pass quality concerns from the code review (WR-01 through WR-04) that require human decision on whether to address before the first curator uses the tooling. They do not block the phase goal itself.

**WR-01 note:** Stale promotions (removing a synonym row does not demote manifest rows) is the most behaviorally surprising gap — a curator following the runbook's "synonyms.csv is the source of truth" framing could produce a manifest inconsistency. This is worth addressing in a follow-up micro-plan before the first production curation pass.

---

_Verified: 2026-05-22T18:15:00Z_
_Verifier: Claude (gsd-verifier)_
