---
quick_id: 260702-ega
title: Contingent character reveal in the Identify key (issue #97)
status: complete
date: 2026-07-02
issue: https://github.com/pnwinsects/pnwmoths/issues/97
---

# Summary — 260702-ega

Implemented the contingent character reveal requested in issue #97: dependent
questions in the `/identify/` Lucid key now stay hidden until their parent
character's trigger state is selected.

## What changed

- **New pure module `src/_lib/key-dependencies.ts`** — authors the 15 parent→child
  reveal rules (empty in the Lucid `key.data` `<filter_tree>`), keyed on the
  globally-unique question string:
  - Stigma: 3 questions gated by `Does the forewing have a stigma?` = Yes
  - Ecoregions: each `In which ecoregion in {State}?` gated by that state
  - Precise size: each bucket gated by the matching `Approximate size` state
  - Hindwing discal strength gated by `…have a discal spot?` = Yes
  - Marginal-band darkness + spots gated by `…strongly-contrasting band…?` = Yes
  - `isQuestionVisible()` (recursion-safe for future chaining) and
    `pruneHiddenSelections()` (fixpoint).
- **`src/components/pnwm-identify.ts`** — build `_questionGroups` from inlined data
  so visibility resolves before the async matrix fetch; render only visible
  questions per category; prune orphaned child selections on every checkbox change.

## Key decision

Hidden child selections are **cleared**, not merely un-rendered. A hidden question
that retained a selection would silently constrain `computeMatching` (invisible
filtering) and inflate category count badges. Pruning on parent deselect keeps the
result set honest and makes a re-revealed child start unchecked.

## Verification

- `src/_lib/key-dependencies.test.ts` — 25 tests incl. a real-data guard asserting
  all 15 rules' question/state strings exist in `data/key-matrix.json` (drift trap).
- `src/components/pnwm-identify.test.ts` — 3 new tests for reveal + prune-on-deselect.
- Full suite green (565 tests), `npm run typecheck` clean, full `build:eleventy`
  succeeds (client bundle links the new module; `_site/identify/index.html` built).

## Not done / out of scope

- `<noscript>` fallback still lists every question flat (no JS = no reveal;
  acceptable degradation).
- No change to `key.data`, `build-key.ts`, or `key-matrix.json`.

## Commits

- `feat(identify): add contingent character-reveal logic (#97)`
- `feat(identify): reveal contingent questions only when parent trigger set (#97)`
