---
phase: 03-client-side-interactivity
plan: "01"
subsystem: client-side-components
tags: [vite, lit, leaflet, chart.js, hyparquet, web-components, progressive-enhancement]
dependency_graph:
  requires: []
  provides:
    - vite-build-pipeline
    - parquet-cache-module
    - pnwm-occurrence-map-component
    - pnwm-phenology-chart-component
    - pnwm-filter-bar-component
  affects:
    - species-pages
    - base-template
tech_stack:
  added:
    - vite@^7 (JS bundler, Vite plugin for Eleventy)
    - "@11ty/eleventy-plugin-vite@7.0.0"
    - lit (Lit LitElement web components)
    - leaflet (map rendering, light DOM required)
    - chart.js (bar chart, register-only pattern)
    - hyparquet (client-side Parquet file parsing)
  patterns:
    - Lit web components with light DOM override (createRenderRoot returns this) for Leaflet compatibility
    - Module-level Map cache for Parquet data (shared across components on same page)
    - Chart.js register-only pattern for tree-shaking
    - Progressive enhancement: pnwm-* elements degrade gracefully; noscript fallback for occurrence data
    - T-03-01 XSS mitigation: Leaflet popup content built via DOM textContent, never innerHTML
key_files:
  created:
    - vite.config.js
    - src/components/main.js
    - src/components/parquet-cache.js
    - src/components/pnwm-occurrence-map.js
    - src/components/pnwm-phenology-chart.js
    - src/components/pnwm-filter-bar.js
  modified:
    - package.json (added lit, leaflet, hyparquet, chart.js, vite, eleventy-plugin-vite)
    - eleventy.config.js (EleventyVitePlugin, src/components passthrough copy)
    - src/_includes/base.njk (script[type=module] for /components/main.js)
    - src/species/species.njk (pnwm-* elements, noscript, pnwm-image-slideshow wrapper)
decisions:
  - "Light DOM for pnwm-occurrence-map: createRenderRoot() returns this — Leaflet requires real DOM access"
  - "Chart.js register-only pattern to keep bundle size down; BarController/BarElement/CategoryScale/LinearScale/Tooltip"
  - "Hardcoded #0172ad in canvas: CSS custom properties do not work in Canvas 2D context (RESEARCH.md A2)"
  - "Leaflet popup XSS mitigation via DOM textContent instead of innerHTML (T-03-01)"
  - "Vite plugin rewrites /components/main.js to hashed /assets/main-*.js at build time — expected behavior"
metrics:
  duration: "~15 minutes"
  completed: "2026-04-11"
  tasks_completed: 3
  tasks_total: 3
  files_created: 6
  files_modified: 4
---

# Phase 03 Plan 01: Vite + Lit Component Pipeline Summary

Installed Vite/Lit/Leaflet/Chart.js/hyparquet, wired EleventyVitePlugin, and created four Lit web components (parquet-cache module, occurrence map, phenology chart, filter bar) with progressive enhancement on species pages.

## Tasks Completed

| # | Task | Commit | Key Files |
|---|------|--------|-----------|
| 1 | Install dependencies and wire Vite plugin | 6e77927 | package.json, vite.config.js, eleventy.config.js, base.njk |
| 2 | Create core components | 4fe7e6f | src/components/*.js (5 files) |
| 3 | Update species template with components | f9632fa | src/species/species.njk |

## Verification

- `npm run build` exits 0, produces `_site/` with Eleventy HTML + Vite-bundled assets
- Species pages contain `pnwm-occurrence-map`, `pnwm-filter-bar`, `pnwm-phenology-chart` elements
- Species pages contain `noscript` block with correct copy text
- Species pages contain `pnwm-image-slideshow` wrapping photo figures
- Static content (taxonomy, prose, photos) remains visible in raw HTML
- Vite rewrites `/components/main.js` script to hashed `/assets/main-*.js` bundle

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Security] XSS-safe popup content for Leaflet map**
- **Found during:** Task 2
- **Issue:** Threat model T-03-01 requires all Parquet string values rendered via auto-escaping. Leaflet's `bindPopup()` accepts HTML strings by default, which would allow XSS if Parquet data contains malicious content.
- **Fix:** Built popup content via `document.createElement`/`textContent` DOM API rather than HTML string concatenation. The popup element is passed directly to `bindPopup()`.
- **Files modified:** src/components/pnwm-occurrence-map.js
- **Commit:** 4fe7e6f

## Known Stubs

None — all component data flows are wired to Parquet. Filter event wiring to map/chart is intentionally deferred to Plan 02 (INTV-03 decision from plan checker). The `pnwm-image-slideshow` element emits in HTML as a pass-through container (Plan 02 will register the component).

## Threat Flags

None — all surfaces are covered by the plan's threat model (T-03-01 through T-03-04).

## Self-Check: PASSED
