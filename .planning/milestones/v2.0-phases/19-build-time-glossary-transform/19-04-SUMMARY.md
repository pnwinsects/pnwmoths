---
plan: 19-04
phase: 19-build-time-glossary-transform
status: complete
completed: 2026-04-23T00:00:00Z
gap_closure: true
requirements: [GLOS-01, GLOS-04, QA-01]
key-files:
  modified:
    - src/_lib/glossary-transform.js
    - src/_lib/glossary-transform.test.js
---

# Plan 19-04 Summary: Fix substituteTerms() min-index selection

## What Was Built

Replaced the single-substitution-per-call `substituteTerms()` implementation with a while-loop that wraps all unseen glossary terms in a text node in one pass.

**Root cause fixed:** The old code iterated `termMap` in longest-first order and broke after the first match, placing the remaining text (including any positionally-earlier shorter terms) into an unrevisited `before` fragment. "forewing" (index 4) was silently dropped when "outer margin" (index 17, longer) appeared in the same text node.

**Fix:** A `pos` cursor advances through the raw text. At each step, the positionally-earliest unseen term is found by scanning all entries for minimum `match.index`. The matched term is appended as `<abbr>` HTML, `pos` advances past the match, and the loop continues until no more unseen terms exist. A single `exchangeChild` call replaces the text node with the fully-substituted HTML.

**New test:** Added one test to `applyGlossaryTerms` describe block — verifies that when "forewing" (8 chars, index ~4) and "outer margin" (12 chars, index ~17) appear in the same text node, both are wrapped (abbrCount === 2) regardless of the longest-first termMap sort order.

## Results

- `npm test`: **97/97 pass, 0 fail** (96 existing + 1 new)
- Spot-check: `abbr count: 2`, `forewing wrapped: true`, `outer margin wrapped: true`
- `applyGlossaryTerms` unchanged — outer element loop unmodified
- `seen` Set continues to prevent re-wrapping across subsequent text nodes

## Self-Check: PASSED

- [x] All tasks executed
- [x] Each task committed individually
- [x] 97/97 tests pass (0 failing)
- [x] `substituteTerms` contains `entry.regex.lastIndex = pos`, `let earliest = null`, `if (!earliest)`, `if (modified)`
- [x] No `break; // one substitution per text node per call` remains
- [x] New test: "two distinct terms in the same text node" asserts `abbrCount === 2`
- [x] No other functions modified
