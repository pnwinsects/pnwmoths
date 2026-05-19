---
phase: 19-build-time-glossary-transform
verified: 2026-04-23T23:00:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 4/5
  gaps_closed:
    - "substituteTerms() only wrapped the longest-first term in a text node, silently dropping positionally-earlier shorter terms into unrevisited 'before' fragments — fixed by while-loop with min-index selection"
    - "No test covered two distinct terms in the same text node — new test added and passing"
  gaps_remaining: []
  regressions: []
---

# Phase 19: Build-time Glossary Transform Verification Report

**Phase Goal:** Species prose pages have first occurrences of glossary terms wrapped in `<abbr class="glossary-term">` elements carrying definition and image URL as data attributes, correct no-JS degradation, and a passing unit test suite
**Verified:** 2026-04-23T23:00:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure via plan 19-04

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A species page rendered by `npm run build` contains `<abbr class="glossary-term" title="..." data-definition="..." data-image-url="...">` wrapping the first occurrence of a matched glossary term, and the same term appearing later on the page is plain text | VERIFIED | while-loop substituteTerms() confirmed in source; spot-check: forewing + outer margin in same text node both wrapped (abbrCount=2); seen Set prevents re-wrap across text nodes |
| 2 | Matching is case-insensitive and whole-word: "costal" matches in "the costal margin" but not inside "subcostal" | VERIFIED | Unit test "regex does not match partial words" passes; lookbehind/lookahead guards `(?<![a-zA-Z0-9])...(?![a-zA-Z0-9])` confirmed in source |
| 3 | Terms containing regex metacharacters (1A+2A, W-mark, CuA1) are matched correctly and do not corrupt surrounding HTML | VERIFIED (unit tests) | escapeRegex unit tests pass (1A+2A, W-mark, M1.M3, all 12 metacharacters) |
| 4 | The /glossary/ page and browse pages contain no `<abbr class="glossary-term">` elements (transform is scoped to species prose only) | VERIFIED | outputPath guard `includes('/species/')` confirmed in eleventy.config.js at line 52 |
| 5 | Unit tests cover regex escaping, first-occurrence deduplication, and prose-scope guard; all tests pass | VERIFIED | 97/97 tests pass (0 fail); new test "two distinct terms in the same text node: positionally-first is wrapped, not the longer one" asserts abbrCount === 2 |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/_lib/glossary-transform.js` | Pure transform utility — four named exports; substituteTerms() uses while-loop with min-index selection | VERIFIED | Exports: escapeRegex, escapeHtml, buildTermMap, applyGlossaryTerms; substituteTerms contains `let earliest = null`, `entry.regex.lastIndex = pos`, `if (!earliest)`, `if (modified)`; no `break; // one substitution per text node` remains |
| `src/_lib/glossary-transform.test.js` | Unit tests for all four exported functions; includes two-terms-same-text-node test | VERIFIED | 10 tests in applyGlossaryTerms block (was 9); new test asserts `abbrCount === 2`; all 97 tests pass |
| `eleventy.config.js` | glossary-terms addTransform registered; CSV loaded at startup | VERIFIED | `addTransform('glossary-terms', function(content) {...})` at line 49; module-scope CSV load at lines 21-25 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `eleventy.config.js` | `src/_lib/glossary-transform.js` | named import | WIRED | `import { applyGlossaryTerms, buildTermMap } from "./src/_lib/glossary-transform.js"` at line 7 |
| `eleventy.config.js` | `data/glossary.csv` | readFileSync + parseCsv at module scope | WIRED | `parseCsv(readFileSync("data/glossary.csv"), ...)` at line 21 |
| `addTransform callback` | `applyGlossaryTerms` | function call with content and termMap | WIRED | `return applyGlossaryTerms(content, termMap)` at line 53 |
| `substituteTerms()` | earliest.match.index selection | min-index scan over all unseen terms in while-loop | WIRED | `earliest === null \|\| match.index < earliest.match.index` at line 114 of glossary-transform.js |
| `src/_lib/glossary-transform.test.js` | `src/_lib/glossary-transform.js` | named import | WIRED | `from './glossary-transform.js'` at line 8 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `eleventy.config.js` addTransform | `termMap` | `parseCsv(readFileSync("data/glossary.csv"))` | Yes — 149 terms from CSV | FLOWING |
| `eleventy.config.js` addTransform | `content` | Eleventy rendered HTML for each page | Yes — full rendered HTML | FLOWING |
| `src/_lib/glossary-transform.js` applyGlossaryTerms | `glossaryRows` → termMap | data/glossary.csv columns: term, definition, image_filename | Yes — real definitions and CDN image URLs | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite passes (97 tests) | `npm test` | 97/97 pass, 0 fail | PASS |
| Two terms in same text node: both wrapped | node --input-type=module spot-check | abbr count: 2; forewing wrapped: true; outer margin wrapped: true | PASS |
| Longest-first sort still intact | node --input-type=module spot-check | termMap[0].term = "outer margin" (12 chars); termMap[1].term = "forewing" (8 chars) | PASS |
| "wing" not separately matched inside "forewing" | node --input-type=module spot-check | abbrCount = 1 (forewing only); "wing" not separately wrapped | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| GLOS-01 | 19-01, 19-03, 19-04 | Build emits species prose with first occurrence wrapped in `<abbr>` carrying title, data-definition, data-image-url | SATISFIED | while-loop substituteTerms() wraps all first occurrences in a text node; seen Set prevents re-wrap; abbr attribute structure confirmed |
| GLOS-02 | 19-01 | Case-insensitive, whole-word only | SATISFIED | lookbehind/lookahead regex guards confirmed; case-insensitive `gi` flag confirmed; unit tests pass |
| GLOS-03 | 19-01 | Regex metacharacters safely escaped | SATISFIED (unit tests) | escapeRegex unit tests pass for all 12 metacharacters |
| GLOS-04 | 19-01, 19-04 | Only first occurrence per page wrapped; subsequent plain text | SATISFIED | per-invocation seen Set confirmed; while-loop adds each matched term to seen before continuing; no re-wrap across text nodes |
| GLOS-05 | 19-03 | Transform runs only on species pages | SATISFIED | outputPath guard `includes('/species/')` confirmed in eleventy.config.js at line 52 |
| GLOS-06 | 19-01 | `<abbr title="...">` provides no-JS degradation | SATISFIED | `title` attribute carries full definition text; confirmed in source and test assertions |
| QA-01 | 19-02, 19-04 | Unit tests cover regex escaping, first-occurrence deduplication, prose-scope guard | SATISFIED | 97 tests pass; new test covers two-terms-same-text-node scenario that was the sole gap |

### Anti-Patterns Found

None. The `break; // one substitution per text node per call` pattern identified in the prior verification has been removed. No TODOs, placeholders, empty handlers, or stub returns found in the modified files.

### Human Verification Required

None — all verification points were checkable programmatically.

### Gaps Summary

No gaps. The single gap from the initial verification (substituteTerms() single-substitution-per-text-node limit) was closed by plan 19-04. The while-loop replacement finds the positionally-earliest unseen term at each step, wraps all unseen terms in a single pass, and makes one `exchangeChild` call per text node. The new test explicitly asserts abbrCount === 2 for the forewing + outer margin scenario. All 97 tests pass with 0 failures.

---

_Verified: 2026-04-23T23:00:00Z_
_Verifier: Claude (gsd-verifier)_
