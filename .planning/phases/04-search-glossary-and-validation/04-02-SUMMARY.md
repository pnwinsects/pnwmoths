---
phase: 04-search-glossary-and-validation
plan: 02
subsystem: search
tags: [pagefind, search, indexing, eleventy]
dependency_graph:
  requires: []
  provides: [search-page, pagefind-indexing-config]
  affects: [src/search/index.njk, src/_includes/base.njk, src/species/species.njk]
tech_stack:
  added: [Pagefind UI widget]
  patterns: [CSS custom property theming, data-pagefind-ignore exclusion]
key_files:
  created: []
  modified:
    - src/search/index.njk
    - src/_includes/base.njk
    - src/species/species.njk
decisions:
  - Pagefind built-in UI widget used directly (not a custom wrapper) — D-05, D-07
  - CSS custom properties mapped to Pico CSS tokens for theming — D-06
  - showSubResults: false to prevent sub-headings appearing as separate results
  - data-pagefind-ignore on web components is defense-in-depth; occurrence data architecturally excluded (loads from Parquet client-side, never in HTML) — D-08
metrics:
  duration: ~8 minutes
  completed: "2026-04-12T16:31:57Z"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 3
---

# Phase 4 Plan 02: Search Page and Pagefind Indexing Configuration Summary

**One-liner:** Pagefind UI widget on /search/ with Pico CSS token theming, plus data-pagefind-ignore exclusions on nav, web components, and noscript blocks across base layout and species template.

## What Was Built

**Task 1 — Search page** (`src/search/index.njk`): Replaced the "coming soon" stub with the Pagefind UI widget. The page loads Pagefind's bundled CSS and JS from `/pagefind/` (generated post-build by `pagefind --site _site`). Six CSS custom properties remap Pagefind's visual variables to Pico CSS tokens so the widget inherits the site theme. A noscript fallback with `data-pagefind-ignore` links to `/browse/` for JS-off users.

**Task 2 — Indexing exclusions** (`src/_includes/base.njk`, `src/species/species.njk`): Added `data-pagefind-ignore` to the `<nav>` element in the base layout to prevent navigation link text appearing in search results (SRCH-03/D-09). On species pages, the four web component elements (`pnwm-filter-bar`, `pnwm-occurrence-map`, `pnwm-phenology-chart`, `pnwm-image-slideshow`) and the noscript block got `data-pagefind-ignore` as defense-in-depth — occurrence data is architecturally excluded since it never appears in HTML (loads from Parquet client-side). Species content areas (h1, dl, prose article, similar species) remain fully indexed for SRCH-02.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 2b993a6 | feat(04-02): replace search stub with Pagefind UI widget |
| 2 | 5033b94 | feat(04-02): add data-pagefind-ignore to nav and web components |

## Verification

- Eleventy build succeeds: `_site/search/index.html` generated at 1.47 kB
- All acceptance criteria checked via grep — 11/11 Task 1, 7/7 Task 2

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None. The search page wires directly to Pagefind assets generated post-build. No hardcoded empty values or placeholder data.

## Threat Flags

No new security-relevant surface introduced beyond what the plan's threat model covers. Pagefind JS bundle is served from `/pagefind/` (generated locally from npm package, not fetched from CDN at runtime — T-04-04 accepted). Occurrence data exclusion is architecturally guaranteed — T-04-05 accepted.

## Self-Check: PASSED

- `src/search/index.njk` — file exists and contains all required markup
- `src/_includes/base.njk` — contains `<nav data-pagefind-ignore>`
- `src/species/species.njk` — contains 5 `data-pagefind-ignore` attributes
- Commit 2b993a6 — confirmed in git log
- Commit 5033b94 — confirmed in git log
