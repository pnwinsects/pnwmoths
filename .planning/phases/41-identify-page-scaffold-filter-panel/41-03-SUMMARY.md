---
phase: 41-identify-page-scaffold-filter-panel
plan: "03"
subsystem: identify-page
tags: [lit, web-component, light-dom, tdd, accordion, checkbox-filter]
dependency_graph:
  requires: [#key-char-data inline JSON contract (Plan 41-02), data/key-matrix.json with 8 clean categories (Plan 41-01)]
  provides: [pnwm-identify custom element, buildCategoryMap pure helper, .pnwm-kfp-* CSS accordion/badge/sticky styles]
  affects: [Phase 42 results grid (consumes pnwm-key-filter-change event), browser bundle main.js (pnwm-identify registered)]
tech_stack:
  added: []
  patterns: [Light-DOM Lit component, new-Set/new-Map reactivity, aria-expanded accordion, TDD RED→GREEN gate sequence]
key_files:
  created:
    - src/components/pnwm-identify.ts
    - src/components/pnwm-identify.test.ts
  modified:
    - src/components/main.ts
    - src/styles/theme.css
decisions:
  - "buildCategoryMap is a pure exported function so unit tests can test it without any DOM (no connectedCallback invoked)"
  - "_dispatchFilterChange is overrideable in tests to avoid DOM dependency in selection method tests"
  - "KEY_DATA_CATEGORIES Set used for Distribution/Seasonality sub-note (Key data, 2015) — avoids string comparison at render time"
metrics:
  duration: "~6 minutes"
  completed: "2026-06-25T05:07:00Z"
  tasks_completed: 3
  tasks_total: 3
  files_modified: 4
---

# Phase 41 Plan 03: pnwm-identify Lit Component + Filter Panel Styles Summary

One-liner: Light-DOM `pnwm-identify` Lit component reads `#key-char-data`, renders 8 default-collapsed collapsible categories with `<fieldset>/<legend>` question groups, per-category count badges, sticky "Clear all" reset, and dispatches `pnwm-key-filter-change` — TDD RED→GREEN verified, 324/324 tests pass.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Write pnwm-identify.test.ts unit suite | 20a5da9d | src/components/pnwm-identify.test.ts |
| 2 (GREEN) | Implement pnwm-identify.ts + register in main.ts | bee09c0c | src/components/pnwm-identify.ts, src/components/main.ts |
| 3 | Add .pnwm-kfp-* styles + verify full build | 828f80df | src/styles/theme.css |

## What Was Built

### Task 1 (RED): `src/components/pnwm-identify.test.ts`

17-case unit suite using `node:test` + `node:assert/strict`. Tests four target symbols:

1. `buildCategoryMap`: 5 cases — category count, question-Map structure, insertion order (categories and questions), per-question Character grouping, and **real-data gate** (`data/key-matrix.json` must yield exactly 8 categories, locking Plan 41-01 stray-quote fix end-to-end)
2. `_selectionCountForCategory`: 4 cases — zero on fresh instance, single-category count, cross-category isolation, multi-question aggregation
3. `_hasSelection`: 4 cases — false/true/false-after-clear/false-with-empty-Set
4. `_clearAll`: 3 cases — empties Map, `_hasSelection()` false, all category counts zero

Tests construct `PnwmIdentify` instances and set state directly (`c._categoryMap = ...`, `c._selection = ...`) without invoking `connectedCallback` or rendering — no DOM required.

Suite was RED before Task 2 (`ERR_MODULE_NOT_FOUND` for missing `./pnwm-identify.ts`).

### Task 2 (GREEN): `src/components/pnwm-identify.ts` + `src/components/main.ts`

`PnwmIdentify` Lit component (exported for testability):

- **`buildCategoryMap(characters: Character[]): CategoryMap`** — pure exported helper, O(n) insertion-order grouping
- **`createRenderRoot(): this { return this; }`** — Light DOM; Pico CSS reaches `<input type="checkbox">`, `<fieldset>`, `<legend>`
- **Reactive state** declared via `static get properties()` with `{ attribute: false, state: true }`: `_categoryMap`, `_expandedCategories` (Set), `_selection` (Map<question→Set<charId>>)
- **`connectedCallback()`** — synchronous; reads `document.getElementById('key-char-data')`, parses `.textContent`, calls `buildCategoryMap(data.characters)`
- **`_toggleCategory(name)`** — new-Set replacement reactivity (never `.add()` in place)
- **`_onCheckboxChange(question, charId, checked)`** — new-Set + new-Map replacement; calls `_dispatchFilterChange()`
- **`_clearAll()`** — `_selection = new Map()`; calls `_dispatchFilterChange()`
- **`_hasSelection()`** — iterates `_selection.values()`, returns true if any Set is non-empty
- **`_selectionCountForCategory(catName)`** — sums selected char ids across all questions in the category (RESEARCH Pitfall 7 pattern)
- **`_dispatchFilterChange()`** — dispatches `CustomEvent<KeyFilterChangeDetail>('pnwm-key-filter-change', ...)` with placeholder `matchedSlugs: [], count: 0`
- **`render()`** — sticky Clear-all button (conditionally rendered), then `_categoryMap` entries mapped to `_renderCategory()`
- **`_renderCategory()`** — `<div class="pnwm-kfp-category">`, `<h2><button aria-expanded="...">`, badge span when `selCount > 0`, `<small>(Key data, 2015)</small>` for Distribution/Seasonality, content `<div ?hidden=${!expanded}>` with questions
- **`_renderQuestion()`** — `<fieldset class="pnwm-kfp-question"><legend>`, one `<label><input type="checkbox">` per character state
- **`customElements.define('pnwm-identify', PnwmIdentify)`** at file end

`src/components/main.ts`: added `import './pnwm-identify.ts';` after existing imports.

All 17 unit tests pass. `npx tsc --noEmit` clean. No in-place Set/Map mutation on reactive fields.

### Task 3: `src/styles/theme.css`

Appended `.pnwm-kfp-*` rules mirroring the `.pnwm-tb-*` accordion block:

- `.pnwm-kfp-category h2 button` — `all: unset`, `cursor: pointer`, `display: inline-flex`, `align-items: center`, `gap: 0.35em`
- `.pnwm-kfp-category h2 button::before` — `content: '▶'`, `font-size: 0.6em`, `transition: transform 0.15s`
- `.pnwm-kfp-category h2 button[aria-expanded="true"]::before` — `transform: rotate(90deg)`
- `.pnwm-kfp-category > div` — `padding-left: 1.5rem` (expanded content indent)
- `.pnwm-kfp-badge` — `background: #a4ab78; color: #fff; border-radius: 1em; padding: 0 0.4em; font-size: 0.75em` (olive pill)
- `.pnwm-kfp-sticky` — `position: sticky; top: 0; z-index: 1; background: #ffffff; padding: 8px 0`
- `.pnwm-kfp-question` — `margin: 0 0 0.75rem 0; border: 0; padding: 0` (strips Pico fieldset chrome)

No new color tokens introduced.

**Build verification:**
- `npm run build` — completed; `_site/identify/index.html` written
- `npm run build:check-weight` — no warning for `identify/index.html` (343 KB, under 500 KB threshold); pre-existing warnings for `browse/index.html` and `euxoa-comosa` are unrelated
- `_site/identify/index.html` contains `<pnwm-identify>` and `id="key-char-data"` ✓
- `npm test` — 324/324 pass (includes all 17 new pnwm-identify tests + all prior tests) ✓

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

- `_dispatchFilterChange()` sends `matchedSlugs: [], count: 0` in the event detail. This is intentional — Phase 41 has no consumer; Phase 42 will wire `computeMatching()` and emit real matched slugs. The event is produced for the Phase 42 results-grid consumer.
- `<pnwm-identify>` renders as an empty accordion until the browser executes the Vite bundle and `connectedCallback` reads `#key-char-data`. This is expected Light-DOM + Lit behavior.

## TDD Gate Compliance

- RED commit `20a5da9d`: `test(41-03)` — test suite fails with `ERR_MODULE_NOT_FOUND` before Task 2
- GREEN commit `bee09c0c`: `feat(41-03)` — all 17 tests pass
- REFACTOR: not needed (implementation clean, no further cleanup)

Gate sequence: RED → GREEN confirmed.

## Threat Flags

None. Static client-side filter; no network boundary, auth, or user data storage. `document.getElementById` reads build-time-validated inline JSON; Lit `html` template escapes all interpolated character labels. No `innerHTML` of untrusted content.

## Self-Check: PASSED

- `src/components/pnwm-identify.ts` exists and contains `customElements.define('pnwm-identify'`: confirmed
- `src/components/pnwm-identify.test.ts` exists and references `buildCategoryMap`, `_selectionCountForCategory`, `_hasSelection`, `_clearAll`: confirmed
- `src/components/main.ts` contains `import './pnwm-identify.ts'`: confirmed
- `src/styles/theme.css` contains `.pnwm-kfp-category`, `.pnwm-kfp-badge`, `.pnwm-kfp-sticky`, `.pnwm-kfp-question`: confirmed
- `_site/identify/index.html` exists with `<pnwm-identify>` and `key-char-data`: confirmed
- Commits `20a5da9d`, `bee09c0c`, `828f80df` exist in git log: confirmed
