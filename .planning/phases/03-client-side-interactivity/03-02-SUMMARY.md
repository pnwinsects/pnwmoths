---
phase: 03-client-side-interactivity
plan: "02"
subsystem: client-side-components
tags: [lit, web-components, unit-tests, node-test, image-slideshow, lightbox, filter-wiring, vite, parquet]
dependency_graph:
  requires:
    - vite-build-pipeline
    - parquet-cache-module
    - pnwm-occurrence-map-component
    - pnwm-phenology-chart-component
    - pnwm-filter-bar-component
  provides:
    - pnwm-image-slideshow-component
    - filter-event-wiring
    - component-unit-tests
  affects:
    - species-pages
    - build-pipeline
tech_stack:
  added:
    - node:test (built-in Node.js test runner, no extra dependency)
  patterns:
    - Lit LitElement with shadow DOM for slideshow/lightbox
    - Light DOM figure extraction in connectedCallback (reads static HTML before hiding it)
    - inert attribute for focus trap on lightbox open
    - Escape key handler via document keydown listener (added/removed in connected/disconnectedCallback)
    - Post-build npm script to copy binary assets that Vite drops (parquet files)
key_files:
  created:
    - src/components/pnwm-image-slideshow.js
    - src/components/parquet-cache.test.js
    - src/components/phenology.test.js
    - src/components/filters.test.js
    - scripts/copy-parquet.js
  modified:
    - src/components/main.js (added pnwm-image-slideshow import)
    - src/species/species.njk (added pnwm-filter-change event wiring script)
    - package.json (updated test script, added build:copy-parquet step)
    - eleventy.config.js (no net change — cp import added then removed)
decisions:
  - "Post-build copy script for parquet: eleventy-plugin-vite renames _site to .11ty-vite and builds into fresh _site/, dropping binary passthrough files; scripts/copy-parquet.js runs after build:eleventy to restore them"
  - "eleventy.after hook rejected for parquet copy: fires before Vite finishes creating _site/species/ directories, causing ENOENT"
  - "T-03-05 mitigated: slideshow reads img src from build-time Nunjucks-generated figure elements; Lit html template auto-escapes all values"
metrics:
  duration: "~20 minutes"
  completed: "2026-04-11"
  tasks_completed: 3
  tasks_total: 3
  files_created: 5
  files_modified: 4
---

# Phase 03 Plan 02: Image Slideshow, Filter Wiring, Unit Tests, Build Verification Summary

Lit image slideshow component with lightbox and focus trap, filter-bar-to-map/chart event wiring, 29-test suite for pure logic functions, and a post-build parquet copy fix for the Vite pipeline.

## Tasks Completed

| # | Task | Commit | Key Files |
|---|------|--------|-----------|
| 1 | Unit tests + slideshow component + filter wiring | f511dd1 | parquet-cache.test.js, phenology.test.js, filters.test.js, pnwm-image-slideshow.js, main.js, species.njk, package.json |
| 2 | Full build verification + parquet fix | 972f61d | scripts/copy-parquet.js, package.json |
| 3 | Visual smoke test (auto-approved) | — | — |

## Verification

- `npm test` exits 0: 29 tests pass (23 component tests + 6 build-data tests)
- `npm run build` exits 0: Eleventy HTML + Vite-bundled assets + Parquet files all present
- All four `pnwm-*` elements in built species HTML: occurrence-map, phenology-chart, filter-bar, image-slideshow
- `noscript` block present in species pages
- Parquet files present: `_site/species/acronicta-americana/records.parquet`
- Vite-bundled JS assets: 6 files in `_site/assets/`
- Species pages: 5 (all test species built correctly)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Parquet files missing from built _site/ after Vite step**
- **Found during:** Task 2
- **Issue:** `eleventy-plugin-vite` renames `_site/` to `.11ty-vite/`, then Vite builds into a fresh `_site/` directory (`emptyOutDir: true` from plugin defaults). Binary files passthrough-copied by Eleventy (parquet files) exist in `.11ty-vite/` but are not processed/copied by Vite, so they're absent from the final `_site/`.
- **Fix:** Added `scripts/copy-parquet.js` and a `build:copy-parquet` npm script that copies `data/parquet/{slug}/records.parquet` to `_site/species/{slug}/` as a post-build step chained in the `build` script.
- **Files modified:** `scripts/copy-parquet.js` (new), `package.json`
- **Commit:** 972f61d

**2. [Rule 1 - Bug] eleventy.after hook fires before Vite completes species dirs**
- **Found during:** Task 2 (first fix attempt)
- **Issue:** Attempted to use `eleventyConfig.on('eleventy.after', ...)` to copy parquet, but the hook fires mid-Vite-build before `_site/species/*/` directories exist, causing ENOENT.
- **Fix:** Rejected the hook approach; used post-build npm script instead (see deviation 1).
- **Files modified:** `eleventy.config.js` (import added then removed, net no change)

## Known Stubs

None — all component data flows are wired. The image slideshow reads from light DOM figure elements (populated at build time by Nunjucks from the `images` data file). Filter wiring connects `pnwm-filter-change` events to both map and chart components.

## Threat Flags

None — T-03-05 (slideshow XSS) mitigated: image src/alt/photographer values come from build-time Nunjucks template output, extracted via DOM properties in `connectedCallback`, then rendered through Lit's `html` tagged template which auto-escapes all interpolated values.

## Self-Check: PASSED
