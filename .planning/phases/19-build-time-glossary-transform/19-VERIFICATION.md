---
phase: 19-build-time-glossary-transform
verified: 2026-04-23T22:00:00Z
status: gaps_found
score: 4/5 must-haves verified
overrides_applied: 0
gaps:
  - truth: "A species page rendered by npm run build contains <abbr class='glossary-term' title='...' data-definition='...' data-image-url='...'> wrapping the first occurrence of a matched glossary term, and the same term appearing later on the page is plain text"
    status: partial
    reason: "The per-text-node single-substitution limit (break after one match) causes terms to be silently skipped when a longer glossary term also appears in the same text node. When 'outer margin' (12 chars) and 'forewing' (8 chars) appear in the same text node, only 'outer margin' gets wrapped because it sorts earlier in the longest-first termMap. 'forewing' is in the before-fragment of the exchangeChild replacement and is never re-visited. Observable: habrosyne-scripta/index.html has 2 abbr elements; the same page processed in-process yields 6 terms wrapped."
    artifacts:
      - path: "src/_lib/glossary-transform.js"
        issue: "substituteTerms() iterates termMap in longest-first order and wraps the first term it finds in a text node, then breaks. A positionally-earlier but shorter term in the same text node is placed in the 'before' fragment and never re-processed."
      - path: "src/_lib/glossary-transform.test.js"
        issue: "No test covers the case where two distinct terms both appear in the same text node (e.g., 'forewing' then 'outer margin'). Existing tests only put one target term per text node."
    missing:
      - "Fix substituteTerms() to find the positionally-earliest unseen term in the text node (min match.index across all unseen terms), not the longest-first term. The outer applyGlossaryTerms loop already handles re-visiting the same element across multiple text nodes — the fix is within substituteTerms only."
      - "Add a test: two distinct terms in the same text node — verify the positionally-first one is wrapped, not the longer one."
---

# Phase 19: Build-time Glossary Transform Verification Report

**Phase Goal:** Species prose pages have first occurrences of glossary terms wrapped in `<abbr class="glossary-term">` elements carrying definition and image URL as data attributes, correct no-JS degradation, and a passing unit test suite
**Verified:** 2026-04-23T22:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A species page rendered by `npm run build` contains `<abbr class="glossary-term" title="..." data-definition="..." data-image-url="...">` wrapping the first occurrence of a matched glossary term, and the same term appearing later on the page is plain text | PARTIAL | 10/11 prose species pages have abbr elements; abbr element structure is correct; but per-text-node single-substitution limit skips terms when a longer term appears earlier in the same text node (see Gaps) |
| 2 | Matching is case-insensitive and whole-word: "costal" matches in "the costal margin" but not inside "subcostal" | VERIFIED | Unit test "regex does not match partial words" passes; lookbehind/lookahead guards `(?<![a-zA-Z0-9])...(?![a-zA-Z0-9])` confirmed in source |
| 3 | Terms containing regex metacharacters (1A+2A, W-mark, CuA1) are matched correctly and do not corrupt surrounding HTML | VERIFIED (unit tests only) | escapeRegex unit tests pass (1A+2A, W-mark, M1.M3, all 12 metacharacters); no metacharacter terms appear in current 11 prose files so integration path is not exercised |
| 4 | The /glossary/ page and browse pages contain no `<abbr class="glossary-term">` elements (transform is scoped to species prose only) | VERIFIED | `/glossary/index.html`: 0 abbr elements; `/browse/` (0 files with abbr); outputPath guard `includes('/species/')` confirmed in eleventy.config.js |
| 5 | Unit tests cover regex escaping, first-occurrence deduplication, and prose-scope guard; all tests pass | PARTIAL | 96/96 tests pass; tests cover regex escaping, deduplication, per-invocation seen Set, whole-word guard, metacharacter terms, abbr attribute structure; missing: test for two distinct terms in the same text node where a longer term must not prevent a shorter positionally-earlier term from being wrapped |

**Score:** 4/5 truths verified (1 partial = failed)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/_lib/glossary-transform.js` | Pure transform utility — four named exports | VERIFIED | Exports: escapeRegex, escapeHtml, buildTermMap, applyGlossaryTerms; no default export; no module-level state |
| `src/_lib/glossary-transform.test.js` | Unit tests for all four exported functions | PARTIAL | 24 tests across 4 describe blocks; all pass; missing coverage for multi-term same-text-node scenario |
| `eleventy.config.js` | glossary-terms addTransform registered; CSV loaded at startup | VERIFIED | `addTransform('glossary-terms', function(content) {...})` present at line 49; module-scope CSV load at line 21-25 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `eleventy.config.js` | `src/_lib/glossary-transform.js` | named import | WIRED | `import { applyGlossaryTerms, buildTermMap } from "./src/_lib/glossary-transform.js"` at line 7 |
| `eleventy.config.js` | `data/glossary.csv` | readFileSync + parseCsv at module scope | WIRED | `parseCsv(readFileSync("data/glossary.csv"), ...)` at line 21 |
| `addTransform callback` | `applyGlossaryTerms` | function call with content and termMap | WIRED | `return applyGlossaryTerms(content, termMap)` at line 53 |
| `src/_lib/glossary-transform.test.js` | `src/_lib/glossary-transform.js` | named import | WIRED | `from './glossary-transform.js'` at line 8 |
| `package.json test script` | `src/_lib/glossary-transform.test.js` | glob | WIRED | `src/_lib/*.test.js` appended to node --test command |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `eleventy.config.js` addTransform | `termMap` | `parseCsv(readFileSync("data/glossary.csv"))` | Yes — 149 terms from CSV | FLOWING |
| `eleventy.config.js` addTransform | `content` | Eleventy rendered HTML for each page | Yes — full rendered HTML | FLOWING |
| `src/_lib/glossary-transform.js` applyGlossaryTerms | `glossaryRows` → termMap | data/glossary.csv columns: term, definition, image_filename | Yes — real definitions and CDN image URLs | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Build succeeds without errors | `npm run build:eleventy` | Exit 0; "Wrote 1463 files in 13.95 seconds" | PASS |
| Species pages contain abbr elements | `grep -rl 'class="glossary-term"' _site/species/` | 10 files | PASS |
| Glossary page has no abbr elements | `grep 'class="glossary-term"' _site/glossary/index.html` | 0 matches | PASS |
| Browse pages have no abbr elements | `grep -rl 'class="glossary-term"' _site/browse/` | 0 files | PASS |
| Full test suite passes | `npm test` | 96/96 pass, 0 fail | PASS |
| abbr has all required attributes (title, data-definition, data-image-url) | Inspected `_site/species/habrosyne-scripta/index.html` | All three attributes present with real values | PASS |
| Per-text-node deduplication: two terms in same text node | In-process test: "forewing" (pos 41) + "outer margin" (pos later) in same text node | Only "outer margin" wrapped — "forewing" skipped | FAIL |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| GLOS-01 | 19-01, 19-03 | Build emits species prose with first occurrence wrapped in `<abbr>` carrying title, data-definition, data-image-url | PARTIAL | Abbr structure is correct; scope guard is correct; but per-text-node limit causes some first occurrences to be missed when a longer term appears in the same text node |
| GLOS-02 | 19-01 | Case-insensitive, whole-word only | SATISFIED | lookbehind/lookahead regex guards confirmed; case-insensitive `gi` flag confirmed; unit tests pass |
| GLOS-03 | 19-01 | Regex metacharacters safely escaped | SATISFIED (unit tests) | escapeRegex unit tests pass; no metacharacter terms in current prose files |
| GLOS-04 | 19-01 | Only first occurrence per page wrapped; subsequent plain text | PARTIAL | per-invocation seen Set confirmed; but when two terms are in the same text node, the positionally-earlier shorter term is not wrapped — it is dropped into the "before" fragment and the seen Set never marks it |
| GLOS-05 | 19-03 | Transform runs only on species pages | SATISFIED | outputPath guard confirmed in eleventy.config.js; glossary and browse pages have 0 abbr elements in built output |
| GLOS-06 | 19-01 | `<abbr title="...">` provides no-JS degradation | SATISFIED | `title` attribute carries full definition text; confirmed in built output |
| QA-01 | 19-02 | Unit tests cover regex escaping, first-occurrence deduplication, prose-scope guard | PARTIAL | All 96 tests pass; but the per-text-node multi-term scenario is untested — this is the root cause of the GLOS-01/GLOS-04 gap |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/_lib/glossary-transform.js` | 120 | `break; // one substitution per text node per call` — design comment describes the limit but does not account for the case where the longest-first sorted termMap skips a positionally-earlier shorter term | Warning | Causes first occurrences of shorter terms to be dropped when a longer term appears in the same text node; not a stub but a correctness gap in the substitution algorithm |

### Human Verification Required

None — all verification points were checkable programmatically.

### Gaps Summary

One gap blocks full goal achievement: the `substituteTerms` function iterates `termMap` in **longest-first** order to prevent shorter terms (e.g., "wing") from consuming matches belonging to longer terms (e.g., "forewing"). However, this also causes the longest term found in a text node to win over a positionally-earlier but shorter term. When "forewing" (8 chars) and "outer margin" (12 chars) both appear in the same text node, "outer margin" is iterated first, matched, and the text node is replaced. The "before" fragment containing "forewing" is placed into the DOM but is never re-visited by the outer loop (the snapshot of text nodes was taken before mutation).

**Root cause**: The correct fix is to find the term with the minimum `match.index` across all unseen terms (positionally-earliest), not the first term returned by the longest-first sorted array. This preserves the longest-first priority for preventing "wing" from matching inside "forewing", while also ensuring that when two different terms appear in the same text node, the one that appears first in the prose is wrapped.

**Observable evidence**: `habrosyne-scripta/index.html` shows 2 abbr elements (outer margin, subterminal line). The same page processed in-process with the full termMap produces 6 wrapped terms (forewing, outer margin, anal angle, costal margin, subterminal line, postmedial line). The difference: "forewing" (index 41 in first text node) is overtaken by "outer margin" (index 76) in the same text node because "outer margin" is longer.

**Scope**: This bug affects pages where multiple glossary terms appear in the same direct text node of a `<p>`, `<li>`, `<h2>`, or `<h3>`. The correct behavior would be to wrap all first occurrences; the actual behavior wraps only the longest first-found term per text node.

**Test gap**: No unit test exercises two distinct terms appearing sequentially in the same text node. Adding such a test would have caught this during plan 02.

---

_Verified: 2026-04-23T22:00:00Z_
_Verifier: Claude (gsd-verifier)_
