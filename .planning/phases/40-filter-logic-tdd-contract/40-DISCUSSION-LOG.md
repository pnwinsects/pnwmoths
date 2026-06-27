# Phase 40: Filter Logic TDD Contract - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-24
**Phase:** 40-filter-logic-tdd-contract
**Areas discussed:** Polymorphic match rule, Distribution/Seasonality questions

---

## Gray-area selection

Four gray areas were presented. User selected **Polymorphic match rule** and
**Distribution/Seasonality questions**. **computeMatching() return shape** and
**KeyMatrixMetaSchema contents** were deliberately left to planner/Claude discretion.

---

## Polymorphic match rule — keep/drop

| Option | Description | Selected |
|--------|-------------|----------|
| Keep — selected match wins | A positive `1` on any selected state keeps the species, regardless of opposing `1`s. Eliminate only when `0` on all selected AND `1` on ≥1 opposing. Handles all 15,492 polymorphic cases. | ✓ |
| Drop — any opposing 1 eliminates | Literal PITFALLS wording; would drop a WA moth filtered for Washington because it's also in Oregon. | |

**User's choice:** Keep — selected match wins.
**Notes:** Grounded in a data check — 15,492 species×question polymorphic instances exist
(e.g. `habrosyne-scripta` recorded in WA+ID+OR+MT+BC). Resolves the contradiction between
STACK.md's naive union/intersect pseudocode and PITFALLS.md's literal text.

---

## Polymorphic match rule — fully-unscored species

| Option | Description | Selected |
|--------|-------------|----------|
| Always keep (honest unknown) | Two matched species with zero `1`s across all 237 chars can never be eliminated; appear in every result set. No special-casing. | ✓ |
| Drop once any filter active | Hide fully-unscored species as soon as any state is selected. Adds a special-case branch. | |

**User's choice:** Always keep (honest unknown).
**Notes:** Data check found two such species in the matched matrix (`hypenodes-fractilinea`,
`xestia-normanianus`). User asked to note this on GitHub Issue #19 — done
(issue comment 4795082064).

---

## Distribution/Seasonality questions

| Option | Description | Selected |
|--------|-------------|----------|
| Category-agnostic; defer UX to 41 | Filter functions operate uniformly on whatever states are passed; include/exclude/separate UX deferred to Phase 41 panel. | ✓ |
| Exclude them in buildQuestionGroups now | Drop Distribution/Seasonality so they never reach the filter. | |
| Separate them as a distinct group | Tag them as a separate group in buildQuestionGroups output. | |

**User's choice:** Category-agnostic; defer UX to Phase 41.
**Notes:** Keeps Phase 40 a pure, fully-testable logic contract with no product policy baked in.

---

## Claude's Discretion

- `computeMatching()` return shape (bitset/indices vs. resolved species list + count).
- `KeyMatrixMetaSchema` field set.
- `buildQuestionGroups()` question-identity key (full path vs. question string).

## Deferred Ideas

- Distribution/Seasonality include/exclude/separate **UX** → Phase 41 (+ record as a PROJECT.md
  Key Decision per PITFALLS Pitfall 3).
- Curating the two fully-unscored matched species → ongoing curator work; noted on Issue #19.
