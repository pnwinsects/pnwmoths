---
phase: 42-results-grid
plan: 02
subsystem: identify-page
tags: [lit, web-components, results-grid, tdd, key-results-grid, pnwm-identify, two-column-layout]
dependency_graph:
  requires: [42-01]
  provides: [42-UAT]
  affects:
    - src/components/key-results-grid.ts
    - src/components/pnwm-identify.ts
    - src/components/main.ts
    - src/identify/index.njk
    - src/styles/theme.css
    - eleventy.config.ts
tech_stack:
  added: []
  patterns:
    - Light DOM Lit component with createRenderRoot()
    - repeat() keyed diffing from lit/directives/repeat.js
    - async connectedCallback with fetch + validateKeyMatrix + soft degradation
    - path-prefix attribute + _prefix getter (mirror of taxon-browser)
    - parent-passes-down wiring (no event re-listening in child)
    - bubbling CustomEvent (pnwm-key-clear-all) for shared reset via @event binding
key_files:
  created: []
  modified:
    - src/components/key-results-grid.ts
    - src/components/pnwm-identify.ts
    - src/components/main.ts
    - src/identify/index.njk
    - src/styles/theme.css
    - eleventy.config.ts
decisions:
  - "_hasSelection kept as a METHOD in pnwm-identify — no new reactive prop to avoid name collision; grid receives .hasSelection=${this._hasSelection()}"
  - "eleventy.config.ts required src/_lib passthrough copy for Vite to resolve key-filter.ts import (Rule 3 auto-fix)"
  - "buildCardUrl/buildCountText pure helper exports preserved alongside the full LitElement class so Wave 0 unit tests remain GREEN"
metrics:
  duration: "30 minutes"
  completed: "2026-06-25T19:25:00Z"
  tasks_completed: 2
  files_changed: 6
  commits: 3
---

# Phase 42 Plan 02: Live Results Grid — Summary

KeyResultsGrid Lit component built and wired to pnwm-identify: async key-matrix.json fetch, computeMatching() on every selection change, three-state grid (at-rest prompt / active cards / zero-match empty), two-column sticky layout, CDN thumbnail cards with gray placeholder for 2 null-nav_image species, shared Clear-all via bubbling custom event. All 340 tests GREEN (2 previously RED Wave 0 tests now pass); build exits 0 with identify page at 343 KB.

## What Was Built

### Task 1: `key-results-grid.ts` — Presentational Lit Component

Expanded `src/components/key-results-grid.ts` from helper stubs into a full `KeyResultsGrid extends LitElement`:

- **Light DOM** (`createRenderRoot(): this { return this; }`) so `theme.css .similar-species-placeholder` reaches card internals without Shadow DOM piercing
- **Three mutually-exclusive states** rendered by `render()`:
  - **At-rest** (`!hasSelection`): count line "Showing all 1,192 species" + prompt paragraph
  - **Active + results**: count line "N species match" + `.pnwm-krg-grid` with keyed `repeat()`
  - **Zero-match**: count line "0 species match" + "No species match…" message + "Clear all" button
- **Keyed `repeat()`** from `'lit/directives/repeat.js'` with `slug` as key — efficient diffing for up to 1,190 cards
- **CDN card rendering**: `buildCardUrl(slug, nav_image, 320)` with `encodeURIComponent`, `loading="lazy"`, `alt="${genus} ${epithet}"` for images; `.pnwm-krg-placeholder-wrap > .similar-species-placeholder[aria-hidden]` for 2 null-nav_image species (GRID-03)
- **`aria-live="polite" aria-atomic="true"`** on count line `<p>` (GRID-01 a11y)
- **`pnwm-key-clear-all` bubbling CustomEvent** on empty-state button click (D-09)
- **`_prefix` getter** mirroring taxon-browser line 106
- Exports `buildCardUrl`, `buildCountText` helpers (Wave 0 unit test contracts kept GREEN)
- Registered via `customElements.define('key-results-grid', KeyResultsGrid)`
- Added `import './key-results-grid.ts'` in `src/components/main.ts`

### Task 2: `pnwm-identify.ts` — Async Matrix Fetch + Grid Wiring

Upgraded `pnwm-identify` with:

- **`path-prefix` property + `_prefix` getter** (Pitfall 1 fix)
- **`async connectedCallback`**: retains sync inline `#key-char-data` read + `buildCategoryMap`, then `fetch(${this._prefix}key-matrix.json)` → `validateKeyMatrix()` → stores `_keyMatrix` and `buildQuestionGroups()` result; soft-degrades on ALL errors with `console.error`
- **Four new reactive state props**: `_keyMatrix: KeyMatrix | null`, `_questionGroups: QuestionGroups | null`, `_matchedSpecies: KeySpecies[]`, `_matchedCount: number` — all initialized in constructor
- **`_dispatchFilterChange` upgraded**: calls `computeMatching(_keyMatrix, _selection, _questionGroups)`, builds slug Set, filters `species[]` into `_matchedSpecies` (new array — Pitfall 2 avoided), sets `_matchedCount`; falls back to placeholder dispatch if matrix not yet loaded
- **`_clearAll` upgraded**: resets `_matchedSpecies = []` and `_matchedCount = 0` before `_dispatchFilterChange()` (Pitfalls 3+4 — single sync sequence, no stale empty-state flash)
- **`_hasSelection` remains a METHOD** — no reactive prop name collision
- **`render()`**: wraps in `.pnwm-identify-layout` (CSS grid two-column); filter panel in `<aside class="pnwm-identify-panel">`; grid area in `<div class="pnwm-identify-grid-area">` with `<key-results-grid>` receiving `.matchedSpecies`, `.hasSelection`, `.matchedCount`, `.totalCount` (from `meta.matchedSpecies`), `.pathPrefix`, and `@pnwm-key-clear-all=${() => this._clearAll()}` (D-09 single reset path)
- **`src/identify/index.njk`**: `<pnwm-identify path-prefix="{{ '/' | url }}">` — GITHUB_PAGES-safe, never hardcoded `/pnwmoths/`
- **`src/styles/theme.css`**: appended `.pnwm-identify-layout` / `.pnwm-identify-panel` / `.pnwm-identify-grid-area` two-column layout block; `.pnwm-krg-*` grid/card/count/placeholder/prompt/empty CSS block; `@media (max-width: 768px)` stacked collapse. `.similar-species-placeholder` NOT redefined.

## Verification

- `node --test src/components/key-results-grid.test.ts` → 14/14 PASS (Wave 0 GREEN maintained)
- `node --test src/components/pnwm-identify.test.ts` → 19/19 PASS (2 Wave 0 RED tests now GREEN)
- `npm test` → 340/340 PASS (full suite)
- `npm run build` → exits 0
- `node scripts/check-page-weight.ts` → `_site/identify/index.html` is 343 KB (under 500 KB threshold); pre-existing warnings for `browse/index.html` (779 KB) and `euxoa-comosa` (516 KB) are out of scope
- `grep -rn "/pnwmoths/" src/` → no new hardcoded path-prefix
- `grep -n "innerHTML" src/components/key-results-grid.ts` → no results (no unsafe string interpolation)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing `_lib` passthrough copy in `eleventy.config.ts`**
- **Found during:** Task 2 — first `npm run build` after implementing `pnwm-identify.ts`
- **Issue:** `pnwm-identify.ts` imports `computeMatching`/`buildQuestionGroups` from `'../_lib/key-filter.ts'`. The Eleventy Vite plugin copies `src/components` → `components` and `src/types` → `types` but not `src/_lib` → `_lib`, so the relative import `../_lib/key-filter.ts` resolved to a non-existent path in the Vite build temp directory (`.11ty-vite/`). Build error: "Module not found."
- **Fix:** Added `eleventyConfig.addPassthroughCopy({ "src/_lib": "_lib" });` to `eleventy.config.ts` alongside the existing `components` and `types` copies.
- **Files modified:** `eleventy.config.ts`
- **Commit:** `be09de6c`

## Known Stubs

None — all data flows are wired. The grid renders live data from key-matrix.json.

## Threat Flags

No new threat surface beyond what is documented in the plan's threat model.

## Commits

| Hash | Task | Description |
|------|------|-------------|
| 3ccee157 | Task 1 | feat(42-02): build KeyResultsGrid Lit component (3 states, Light DOM, keyed repeat) |
| c6135b61 | Task 2 | feat(42-02): wire pnwm-identify — async matrix fetch, computeMatching, two-column layout |
| be09de6c | Rule 3 | fix(42-02): add _lib passthrough copy so Vite can resolve key-filter.ts import |

## HUMAN-UAT Status

Task 3 (HUMAN-UAT) is a `checkpoint:human-verify`. Per auto-mode instructions, automated gates were run and passed (npm test, npm run build, node scripts/check-page-weight.ts). Browser-only verifications are awaiting human approval:

1. **GRID-01/SC1**: Count reads "Showing all 1,192 species" at rest; prompt "Select characters to narrow the 1,192 key species" visible; no thumbnail flood.
2. **GRID-02/SC2**: Ticking a character state shows "N species match" count + thumbnail grid live (no reload); unticking updates live; images lazy-load on scroll; card links navigate to `/species/{slug}/`.
3. **GRID-03/SC3**: Photo-less species (`autographa-v-alba` / `xestia-c-nigrum`) show gray placeholder, no broken `<img>`.
4. **GRID-04/SC4**: Zero-match shows "No species match the selected characters" + "Clear all" CTA returns to at-rest prompt (no empty-state flash).
5. **D-04**: Desktop = sticky two-column; mobile ≤768px = stacked.

## Self-Check: PASSED

Files verified:
- `src/components/key-results-grid.ts` — FOUND (expanded from stubs)
- `src/components/pnwm-identify.ts` — FOUND (upgraded)
- `src/components/main.ts` — FOUND (import added)
- `src/identify/index.njk` — FOUND (path-prefix added)
- `src/styles/theme.css` — FOUND (.pnwm-krg-* CSS appended)
- `eleventy.config.ts` — FOUND (_lib passthrough added)

Commits verified:
- 3ccee157 — FOUND
- c6135b61 — FOUND
- be09de6c — FOUND
