# Phase 40: Filter Logic TDD Contract - Context

**Gathered:** 2026-06-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 40 delivers the **pure filter-logic TDD contract** for the Identify feature —
nothing renders. Concretely:

- `src/_lib/key-filter.ts` exporting two pure functions:
  - `buildQuestionGroups()` — groups the 237 character-states by their question so the
    OR-within-question / AND-across-question boundaries are explicit and testable.
  - `computeMatching()` — given a selection of character-states and the loaded matrix,
    returns the matching species set under the locked semantics below.
- `src/_lib/key-filter.test.ts` — `node --test` suite proving the named TDD cases
  (single-state narrows, two-states widen via OR, two-question AND narrows, `0,0` passes).
- **`KeyMatrixMetaSchema`** added to `src/types/schemas.ts` (the one SC4 schema not already
  built in Phase 39).
- **`pnwm-key-filter-change`** event detail type added to `src/types/events.ts`.
- `npm run typecheck` passes with zero errors.

**Already delivered by Phase 39 (do NOT redo):** slug matching, `data/key-coverage-report.json`,
`data/key-matrix.json` (1,192 matched species × 237 states), and `CharacterSchema` /
`KeySpeciesSchema` / `KeyMatrixSchema`. ROADMAP SC1/SC2 and three of SC4's four schemas are
done — Phase 40 is the **remaining logic + the two new type artifacts**.

**Out of scope (later phases):** Identify page, Lit components, the filter panel, results grid
(Phases 41–42); character illustration images (Phase 43). No UI in this phase.

</domain>

<decisions>
## Implementation Decisions

### Filter semantics (the core contract)
- **D-01 — Base rule (carried forward, LOCKED by IDENT-04 + PITFALLS Pitfall 2):**
  OR within a question, AND across questions, with "0 = unscored, not absent." A raw `0`/blank
  never excludes a species; elimination requires a positively-scored *opposing* state.
- **D-02 — Polymorphic match: selected match wins.** When a species scores `1` on BOTH a
  selected state AND an opposing state of the same question (15,492 such instances exist in the
  matrix; e.g. `habrosyne-scripta` is recorded in WA+OR+ID+MT+BC), a positive `1` on **any
  selected state keeps the species**. This resolves the contradiction between STACK.md's naive
  union/intersect pseudocode and PITFALLS.md's literal "eliminate on any opposing 1" wording —
  the literal PITFALLS text would wrongly drop a Washington moth when filtering for Washington.
- **D-03 — Canonical elimination predicate.** For each question `Q` with ≥1 selected state,
  eliminate a species **iff** it scores `0` on **all** selected states of `Q` **AND** `1` on
  ≥1 opposing (unselected) state of `Q`. Otherwise keep. Across constrained questions = AND
  (species must survive every constrained question). Questions with no selected states impose
  no constraint. Empty total selection ⇒ full result set (full 1,192). This is a **single
  uniform rule — no special-casing.**
- **D-04 — Fully-unscored species always kept.** The two matched species with zero `1`s across
  all 237 characters (`hypenodes-fractilinea`, `xestia-normanianus`) can never be eliminated
  and will appear in every result set, including heavily-narrowed ones. This is intentional:
  absence of evidence is not evidence of mismatch; the tool never falsely claims a species
  doesn't match. No "drop once a filter is active" branch — keeps `computeMatching()` uniform.
  (Noted on GitHub Issue #19 for curator awareness.)

### Distribution / Seasonality characters
- **D-05 — Filter functions stay category-agnostic.** `buildQuestionGroups()` and
  `computeMatching()` operate uniformly on whatever character-states they are given and have no
  special knowledge of category names. The PITFALLS Pitfall 3 overlap between the key's
  Distribution ("which State/Province") + Seasonality questions and the site's existing
  occurrence-record browse filters is a **UX/product decision deferred to Phase 41** (the panel
  can choose which categories to feed in / how to separate them). No product policy is baked
  into the Phase 40 math.

### Claude's Discretion (user skipped — left to research/planning)
- **`computeMatching()` return shape** — raw result bitset/indices vs. a fully-resolved matched
  species list (`slug` + `nav_image` + count). Constrained by what the Phase 42 results grid and
  the `pnwm-key-filter-change` event detail need; planner decides the concrete signature.
- **`KeyMatrixMetaSchema` contents** — e.g. matched/unmatched counts, source total (1,228),
  generator version/timestamp to support a "showing N of 1,228" affordance. Planner decides
  fields; coordinate with whether `build-key.ts` should emit a `meta` block (currently
  `key-matrix.json` has none).
- **`buildQuestionGroups()` question-identity key** — whether a "question" is keyed by the full
  `category[:subcategory]:question` path or the question string alone. Determine from the data
  (researcher); the matrix already carries `category`/`subcategory`/`question`/`state` per
  character.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` § "Phase 40: Filter Logic TDD Contract" — goal + SC3/SC4 are the live
  work (SC1/SC2 already satisfied by Phase 39).
- `.planning/REQUIREMENTS.md` — IDENT-04 (filter semantics, the "0 = unscored" trap, TDD-first);
  MATCH-01..03 (already Complete, context only).
- `.planning/phases/39-key-matrix-data-pipeline/39-CONTEXT.md` — the 39/40 boundary (D-02/D-03),
  the locked matrix shape, and the bitset format.

### Filter-semantics research (read BOTH — they conflict; D-02/D-03 resolve it)
- `.planning/research/PITFALLS.md` § "Pitfall 2" — the "0 = unscored, not absent" trap and the
  opposing-state elimination rule. **Authoritative on the principle**, but its literal "eliminate
  on any opposing 1" sentence does not account for polymorphism — see D-02.
- `.planning/research/PITFALLS.md` § "Pitfall 3" — Distribution/Seasonality overlap with browse
  filters (drives D-05).
- `.planning/research/STACK.md` § "Client-side filter algorithm" — bitset format + pseudocode.
  ⚠ Its naive union/intersect `filterSpecies()` is the WRONG semantics (treats `0` as exclusion);
  use D-03's predicate, not this pseudocode, for `computeMatching()`. The bitset *encoding*
  details (base64, LSB-first, `nBytes = ceil(species/8)`) are correct and reusable.

### Existing code to extend / mirror
- `src/types/schemas.ts` — `CharacterSchema`/`KeySpeciesSchema`/`KeyMatrixSchema` already here;
  add `KeyMatrixMetaSchema`. `zod/mini` (browser) + build-only full-Zod pattern.
- `src/types/events.ts` — `FilterChangeDetail` + `HTMLElementEventMap` augmentation pattern to
  mirror for `pnwm-key-filter-change`. **Do NOT extend `FilterChangeDetail`** (event-bus
  isolation, PITFALLS anti-pattern table) — add a separate detail type.
- `src/components/key-matrix-cache.ts` — `validateKeyMatrix()` load-time guard + bitset
  byte-length math; shows how the matrix is decoded at the client boundary.
- `scripts/build-key.ts` / `data/key-matrix.json` — the artifact `computeMatching()` consumes.

### Data inputs
- `data/key-matrix.json` — `{ characters, species, matrix }`; 237 base64 bitsets over 1,192
  matched species.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/key-matrix-cache.ts`: bitset decode + byte-length math (`nBytes =
  ceil(species/8)`, base64 LSB-first) — `computeMatching()` reuses this decode approach.
- `src/types/schemas.ts` / `src/types/events.ts`: established schema + event-typing patterns to
  extend (not rewrite).
- Existing `*.test.ts` files under `scripts/` and `src/_lib/` already run via `node --test`
  (e.g. `build-key.test.ts`, `schemas.test.ts`) — `key-filter.test.ts` joins that glob.

### Established Patterns
- Pure build/logic functions live in `src/_lib/` with a co-located `*.test.ts` (glossary
  transform precedent in Phase 19).
- `zod/mini` for browser-boundary guards; full Zod only at build time.
- Event types use `declare global { interface HTMLElementEventMap }` augmentation so listeners
  type without casts; module boundary required (`verbatimModuleSyntax`).

### Integration Points
- `key-filter.ts` will be imported by `pnwm-identify` (Phase 41) — design the signatures for
  that consumer and the Phase 42 results grid (live count + matched species + thumbnails).
- `pnwm-key-filter-change` is the event the Phase 41 panel dispatches and the Phase 42 grid
  listens for — its detail type is defined here, used later.

</code_context>

<specifics>
## Specific Ideas

- Concrete polymorphism example to anchor a TDD case: `habrosyne-scripta` scores `1` on
  Distribution states WA/ID/OR/Western MT/BC; filtering for "Washington" alone MUST keep it.
- The two perpetually-kept unscored species (`hypenodes-fractilinea`, `xestia-normanianus`)
  make a good explicit TDD assertion: any non-empty selection still contains them.
- TDD cases named by ROADMAP SC3: single-question single-state narrows; single-question
  two-states widens (OR); two-question AND narrows; a `0,0` pair is NOT eliminated.

</specifics>

<deferred>
## Deferred Ideas

- **Distribution/Seasonality include / exclude / separate-section UX** → Phase 41 (the panel
  decides which categories to feed the filter and how to present them). Should also be recorded
  as a PROJECT.md Key Decision per PITFALLS Pitfall 3 when settled.
- **`computeMatching()` return shape & `KeyMatrixMetaSchema` fields** → research/planning
  discretion (see Claude's Discretion above), constrained by Phase 42 grid needs.
- **Curating the two fully-unscored matched species** (`hypenodes-fractilinea`,
  `xestia-normanianus`) so they gain character scores → ongoing curator work; noted on Issue #19,
  not a Phase 40 blocker.

</deferred>

---

*Phase: 40-filter-logic-tdd-contract*
*Context gathered: 2026-06-24*
