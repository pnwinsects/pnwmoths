---
quick_id: 260702-ega
title: Contingent character reveal in the Identify key (issue #97)
status: planned
date: 2026-07-02
issue: https://github.com/pnwinsects/pnwmoths/issues/97
---

# Quick Task 260702-ega — Contingent character reveal in the Identify key

## Problem

The Identify key (`/identify/`) renders all 55 character questions flat. Several
questions are only meaningful once a parent character is answered a certain way.
Per @MerrillPeterson (issue #97), these should be hidden until the parent trigger
is selected:

- **Stigma** — 3 questions (`Is the stigma very large?`, `What type of stigma
  does it have?`, `Is the area behind the stigma much darker than the rest of the
  forewing?`) appear only after `Does the forewing have a stigma?` = **Yes**.
- **Ecoregions** — each `In which ecoregion in {State}?` appears only after that
  state is chosen in `In which State/Province was the moth found?`.
- **Precise size** — each `Precise size (forewing length) of {small|medium|large|
  very large} moths` appears only after the matching bucket in `Approximate size
  (forewing length)`.
- **Hindwing discal** — `Is the discal spot on the hindwing strong or weak?`
  appears only after `Does the hindwing have a discal spot?` = **Yes**.
- **Hindwing marginal band** — `Is the marginal band darker or lighter than the
  adjacent area?` and `Does the marginal band contain one or more spots?` appear
  only after `Does the hindwing have a wide, distinct, strongly-contrasting band
  on the outer margin?` = **Yes**.

15 child questions across 4 categories, keyed on the (globally-unique) question
string. The Lucid source (`data/key.data`) has an empty `<filter_tree>`, so these
relationships do not exist in the data and must be authored explicitly.

## Approach

Pure-logic module + minimal wiring into the existing Lit component. No data-model
or build-script change (question strings are stable, from `key.data`).

### Task 1 — Dependency logic module (`src/_lib/key-dependencies.ts`) [TDD]

- `CHARACTER_DEPENDENCIES`: readonly list of `{ childQuestion, parentQuestion,
  triggerStates[] }` — the 15 rules above, exact strings.
- `isQuestionVisible(question, selection, groups)`: `true` for non-dependent
  questions; for a dependent child, `true` iff its parent is itself visible AND
  ≥1 trigger state is selected (recursion supports future nesting; flat today).
- `pruneHiddenSelections(selection, groups)`: returns a new `Selection` with any
  now-hidden question's selections removed (fixpoint). Prevents a hidden child
  from silently constraining `computeMatching`.
- Tests (`src/_lib/key-dependencies.test.ts`): visibility on/off, prune on parent
  deselect, non-dependent always visible, and a **real-data guard** asserting
  every parent/child question and trigger state exists in `data/key-matrix.json`.

**verify:** `node --test src/_lib/key-dependencies.test.ts` green.
**done:** module + tests committed.

### Task 2 — Wire reveal into `pnwm-identify.ts` [TDD]

- `connectedCallback`: also build `_questionGroups` from the inlined char data so
  visibility is resolvable before the async matrix fetch resolves.
- `_onCheckboxChange`: after applying the change, `pruneHiddenSelections` the
  selection (so deselecting a parent clears orphaned child selections) before
  dispatch.
- `_renderCategory`: render only visible questions.
- Tests (extend `pnwm-identify.test.ts`): child hidden until parent trigger set;
  child selection pruned when parent deselected; category count stays consistent.

**verify:** `node --test src/components/pnwm-identify.test.ts` green; `npm run
typecheck` clean.
**done:** component + tests committed.

## Out of scope

- `<noscript>` fallback keeps listing all questions flat (no JS = no reveal;
  acceptable degradation).
- No change to `key.data`, `build-key.ts`, or `key-matrix.json`.

## must_haves

- **truths:** Dependent questions are hidden until their parent trigger is
  selected; hidden questions never constrain results (selections pruned).
- **artifacts:** `src/_lib/key-dependencies.ts`, `src/_lib/key-dependencies.test.ts`,
  edits to `src/components/pnwm-identify.ts` + `src/components/pnwm-identify.test.ts`.
- **key_links:** `src/components/pnwm-identify.ts`, `src/_lib/key-filter.ts`,
  `data/key-matrix.json`.
