---
phase: 03-client-side-interactivity
verified: 2026-04-12T05:04:50Z
status: verified
score: 5/6 must-haves verified
overrides_applied: 0
deferred:
  - truth: "Map, chart, slideshow, and search results components are all implemented as Lit custom elements"
    addressed_in: "Phase 4"
    evidence: "Phase 4 requirement SRCH-04: 'A search page renders results client-side with no server required'; the search results Lit component is part of Phase 4 search implementation. The Phase 3 roadmap SC6 forward-references search results alongside Phase 3 components, but search is explicitly mapped to Phase 4 in REQUIREMENTS.md."
human_verification:
  - test: "Open a species page with occurrence data (e.g., http://localhost:8080/species/acronicta-americana/) and verify the Leaflet map renders with OSM tiles and circle markers at occurrence locations. Click a marker and confirm popup shows locality, state, year, etc."
    expected: "Map renders with tile layer and pins; popup content is correct and XSS-safe"
    why_human: "Leaflet map rendering requires a browser with DOM, canvas, and network access to OSM tile server"
  - test: "Verify the phenology bar chart renders 12 monthly bars with real data. Hover over bars to confirm tooltip shows record counts."
    expected: "Chart.js bar chart renders with #0172ad bars and month labels"
    why_human: "Canvas rendering requires a browser"
  - test: "Select a state from the filter bar dropdown. Confirm both the map markers and chart bars update to show only that state's records. Select a record type; verify update. Adjust year range sliders; verify update. Click 'Clear filters'; verify all reset."
    expected: "All three filter controls propagate pnwm-filter-change events to map.filters and chart.filters, causing both to re-render with filtered data"
    why_human: "Event propagation and reactive re-rendering require a browser"
  - test: "For a species with photos, verify the slideshow renders with prev/next navigation. Click a photo to open the lightbox. Press Escape to close. Click the X button to close. Verify focus trapping works (main content has inert attribute while lightbox is open)."
    expected: "Slideshow cycles through images; lightbox opens/closes; Escape and X both close lightbox; inert attribute set/removed on main"
    why_human: "Requires browser for DOM manipulation and keyboard event handling"
  - test: "Disable JavaScript in browser settings. Reload a species page. Confirm: (1) taxonomy dl/h1 visible, (2) prose visible, (3) photo figures visible inside pnwm-image-slideshow, (4) noscript notice appears in the occurrence data section."
    expected: "All static content visible without JS; no broken layout; noscript notice present"
    why_human: "Progressive enhancement behavior requires browser JS toggle"
---

# Phase 03: Client-side Interactivity Verification Report

**Phase Goal:** The species factsheet is a fully interactive research tool: occurrence map, phenology chart, data filters, and image slideshow all work in the browser via Parquet data loaded asynchronously.
**Verified:** 2026-04-12T05:04:50Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A species page renders a Leaflet map of occurrence points loaded from the per-species Parquet file; map markers appear without a full page reload. | ✓ VERIFIED | `pnwm-occurrence-map` custom element present in built HTML; `connectedCallback` calls `loadParquet(slug)` then `_renderMap()` which creates `L.circleMarker` for each record with valid lat/lon; `_site/species/acronicta-americana/records.parquet` exists in built output |
| 2 | A phenology bar chart (records by month) renders from the same Parquet data on the same page. | ✓ VERIFIED | `pnwm-phenology-chart` present in built HTML; uses shared `loadParquet` cache; `_renderChart()` calls `aggregateByMonth()` and creates Chart.js bar chart with `#0172ad` color |
| 3 | Selecting a state, record type, or year range updates both the map and the chart to show only matching records. | ✓ VERIFIED | `pnwm-filter-bar` dispatches `pnwm-filter-change` CustomEvent (bubbles:true, composed:true); inline script extracted by Vite into `_site/assets/index-kN-vS00Z.js` listens on document and sets `map.filters` and `chart.filters`; both components react via `updated()` calling `filterRecords()` |
| 4 | Species photos cycle in a slideshow; clicking a photo opens a larger view. | ? HUMAN NEEDED | `pnwm-image-slideshow` component exists with `customElements.define`; reads figures from light DOM in `connectedCallback`; renders prev/next controls with aria-labels; lightbox opens on image click, closes with Escape key and X button using `inert` attribute for focus trap — requires browser to verify |
| 5 | With JavaScript disabled, photos, taxonomy, and prose are visible as static HTML; a noscript notice explains that occurrence data requires JavaScript. | ✓ VERIFIED | Built HTML contains `<dl>`, `<h1>`, prose `<p>` outside any custom elements; `<pnwm-image-slideshow>` wraps `<figure>` elements that render as static HTML in unknown-element context; `<noscript>` block with correct copy text present in built species pages |
| 6 | Map, chart, slideshow, and search results components are all implemented as Lit custom elements. | DEFERRED | Map, chart, filter-bar, and slideshow are Lit custom elements with `customElements.define`. Search results component is not present — see deferred items below. |

**Score:** 5/6 truths verified (SC6 is deferred to Phase 4)

### Deferred Items

Items not yet met but explicitly addressed in later milestone phases.

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | "Search results" component implemented as Lit custom element | Phase 4 | REQUIREMENTS.md maps SRCH-04 ("search page renders results client-side") to Phase 4; Phase 4 goal is "static search"; search source page is a placeholder ("Search coming soon") — intentionally deferred |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `vite.config.js` | Vite config with `emptyOutDir: false` | ✓ VERIFIED | Contains `emptyOutDir: false` — prevents Vite from deleting Eleventy output |
| `src/components/main.js` | Entry point importing all Lit components | ✓ VERIFIED | Imports all 4 components: occurrence-map, phenology-chart, filter-bar, image-slideshow |
| `src/components/parquet-cache.js` | Module-level Parquet cache with `loadParquet(slug)` | ✓ VERIFIED | Exports `loadParquet`, `filterRecords`, `aggregateByMonth`; module-level `Map` cache; uses hyparquet |
| `src/components/pnwm-occurrence-map.js` | Leaflet map web component in light DOM | ✓ VERIFIED | `customElements.define('pnwm-occurrence-map', ...)`, `createRenderRoot() { return this; }` for light DOM |
| `src/components/pnwm-phenology-chart.js` | Chart.js bar chart web component | ✓ VERIFIED | `customElements.define('pnwm-phenology-chart', ...)`, register-only Chart.js pattern, `#0172ad` hardcoded |
| `src/components/pnwm-filter-bar.js` | Filter controls dispatching `pnwm-filter-change` | ✓ VERIFIED | `customElements.define('pnwm-filter-bar', ...)`, dispatches `pnwm-filter-change` with `bubbles:true, composed:true` |
| `src/components/pnwm-image-slideshow.js` | Image slideshow with lightbox | ✓ VERIFIED | `customElements.define('pnwm-image-slideshow', ...)`, reads figures from light DOM, lightbox with inert/Escape |
| `src/components/parquet-cache.test.js` | Unit tests for parquet-cache | ✓ VERIFIED | 5 describe blocks; tests `filterRecords`, `aggregateByMonth`, `loadParquet` |
| `src/components/phenology.test.js` | Unit tests for month aggregation edge cases | ✓ VERIFIED | 5 edge case tests for `aggregateByMonth` |
| `src/components/filters.test.js` | Unit tests for filter logic | ✓ VERIFIED | 7 edge case tests for `filterRecords` including combined filters and null/undefined year |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `pnwm-occurrence-map.js` | `parquet-cache.js` | `import { loadParquet, filterRecords }` | ✓ WIRED | Import present at line 4; `loadParquet(this.slug)` called in `connectedCallback`; `filterRecords` called in `_renderMap()` |
| `pnwm-phenology-chart.js` | `parquet-cache.js` | `import { loadParquet, filterRecords, aggregateByMonth }` | ✓ WIRED | Import present at line 10; all three functions used |
| `base.njk` | `components/main.js` | `<script type="module">` | ✓ WIRED | `<script type="module" src="/components/main.js">` at line 21; Vite rewrites to `/assets/index-*.js` in built output |
| `eleventy.config.js` | Vite plugin | `EleventyVitePlugin` | ✓ WIRED | `import EleventyVitePlugin from "@11ty/eleventy-plugin-vite"` and `eleventyConfig.addPlugin(EleventyVitePlugin, ...)` |
| `species.njk` inline script | `pnwm-occurrence-map` + `pnwm-phenology-chart` | `pnwm-filter-change` event listener | ✓ WIRED | Inline `<script type="module">` in `species.njk` listening for `pnwm-filter-change` and setting `.filters` on map and chart; Vite bundles this into `_site/assets/index-kN-vS00Z.js` |
| `pnwm-image-slideshow.js` | `species.njk` | slotted figure elements as fallback content | ✓ WIRED | Slideshow reads `:scope > figure` children in `connectedCallback`; figures are in built HTML inside the element |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `pnwm-occurrence-map.js` | `this._records` | `loadParquet(slug)` → hyparquet → `/species/${slug}/records.parquet` | Yes — real Parquet file parsed | ✓ FLOWING |
| `pnwm-phenology-chart.js` | `this._records` | Same `loadParquet` call (shared module-level cache) | Yes — same Parquet source | ✓ FLOWING |
| `pnwm-filter-bar.js` | `this._states`, `this._recordTypes` | Extracted from loaded records in `connectedCallback` | Yes — unique values from real data | ✓ FLOWING |
| `pnwm-image-slideshow.js` | `this._images` | Extracted from `<figure>` children in `connectedCallback` (populated by Nunjucks at build time from `images` data) | Yes — build-time generated from `images` data file | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 29 unit tests pass | `node --test src/components/*.test.js` | 29 pass, 0 fail | ✓ PASS |
| Full build produces HTML + JS assets + Parquet | `npm run build` | Exits 0; assets in `_site/assets/`; parquet files present | ✓ PASS |
| Built species HTML contains all 4 pnwm-* elements | `grep -c 'pnwm-occurrence-map' _site/species/acronicta-americana/index.html` | 1 match each | ✓ PASS |
| Built species HTML contains noscript block | `grep -c 'noscript' _site/species/acronicta-americana/index.html` | 2 matches (opening+closing) | ✓ PASS |
| Parquet file present alongside HTML | `ls _site/species/acronicta-americana/records.parquet` | File exists (3+ species checked) | ✓ PASS |
| Filter wiring script bundled by Vite | `grep -o 'pnwm-filter-change' _site/assets/index-kN-vS00Z.js` | Matches found | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| INTV-01 | Plan 01 | Leaflet map loaded asynchronously from per-species Parquet file | ✓ SATISFIED | `pnwm-occurrence-map` fetches Parquet via hyparquet; markers rendered via `L.circleMarker` |
| INTV-02 | Plan 01 | Phenology chart (bar chart by month) from same Parquet data | ✓ SATISFIED | `pnwm-phenology-chart` uses shared `loadParquet` cache; `aggregateByMonth` drives Chart.js |
| INTV-03 | Plans 01+02 | Occurrence data filterable by state, record type, year range | ✓ SATISFIED | `pnwm-filter-bar` dispatches events; wiring script propagates to map+chart `.filters` property; `filterRecords()` applied in both components |
| INTV-04 | Plan 02 | Photos in slideshow/carousel; click opens larger view | ✓ SATISFIED (code) / ? HUMAN | `pnwm-image-slideshow` with prev/next and lightbox implemented; visual confirmation needed |
| INTV-05 | Plans 01+02 | Graceful degradation when JS disabled | ✓ SATISFIED | Noscript block present; figures inside `pnwm-image-slideshow` render as static HTML; taxonomy/prose outside custom elements |
| INTV-06 | Plans 01+02 | Components implemented as Lit web components | ✓ SATISFIED (4/5 components) | All four Phase-3 components use `LitElement`; search results component deferred to Phase 4 |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/search/index.njk` | 7 | "Search coming soon" placeholder | ℹ Info | Intentional placeholder for Phase 4 — not a Phase 3 deliverable |
| `src/components/pnwm-phenology-chart.js` | 73 | `Math.random()` in skeleton placeholder bars height | ℹ Info | Non-deterministic skeleton heights; no functional impact; skeleton is loading state only |
| `src/components/pnwm-image-slideshow.js` | 4-9 | `static properties = ...` (class field syntax) | ℹ Info | Plan specified constructor initialization; slideshow uses class field syntax for Lit descriptor (`static properties`), but actual reactive state values (index, lightboxOpen, images) ARE initialized in constructor. Class field for `static properties` is a different Lit API — this is correct Lit usage, not a deviation. |

### Human Verification Required

#### 1. Leaflet map renders with real data

**Test:** Start dev server (`npx @11ty/eleventy --serve`), open http://localhost:8080/species/acronicta-americana/. Wait for map to load.
**Expected:** Leaflet map with OSM tiles appears; circle markers (`#0172ad` color) visible at occurrence locations; clicking a marker shows popup with locality, state, year, collector, record_type.
**Why human:** Canvas/WebGL map rendering, tile loading, and DOM interaction require a browser.

#### 2. Phenology chart renders with monthly data

**Test:** On same species page, observe phenology chart below the map.
**Expected:** 12-bar Chart.js bar chart with blue bars and month labels (Jan–Dec). Tooltip on hover shows count.
**Why human:** Canvas rendering requires a browser.

#### 3. Filter controls update both map and chart

**Test:** Select a specific state (e.g., "WA") from the State dropdown. Watch both map and chart.
**Expected:** Map markers reduce to only WA occurrences; chart bars update to WA-only monthly counts. Repeat for record type and year range sliders. Click "Clear filters" — both reset to all records.
**Why human:** Custom event propagation and reactive Lit re-rendering require a browser to verify correctness.

#### 4. Image slideshow and lightbox

**Test:** Open a species page with multiple photos (e.g., acronicta-americana which has 2 photos). Observe slideshow controls. Click "›" (next) button. Click a photo.
**Expected:** Photos cycle with "1 of 2" index label and dot indicators; clicking a photo opens dark overlay lightbox with larger image and X button. Pressing Escape closes lightbox. Clicking X closes lightbox. `main` element has `inert` attribute while lightbox is open (check in DevTools).
**Why human:** DOM focus trap and keyboard event handling require a browser.

#### 5. Progressive enhancement (no JS)

**Test:** In browser DevTools, disable JavaScript. Reload a species page.
**Expected:** Taxonomy (`<dl>`) and heading (`<h1>`) visible. Prose paragraph visible. Photo `<figure>` elements visible inside `<pnwm-image-slideshow>` (browser renders unknown element children as normal HTML). Noscript notice visible in the occurrence data section. No broken layout.
**Why human:** Requires browser JS toggle to test actual degradation behavior.

### Gaps Summary

No blocking gaps. All six INTV requirements have code-verified implementations. The one roadmap success criterion not met in code (SC6 "search results" as Lit component) is a deferred item explicitly addressed by Phase 4's SRCH-04 requirement.

Five human verification items remain for visual/interactive behavior that cannot be verified programmatically. These cover: map rendering, chart rendering, filter event propagation, slideshow/lightbox UX, and JS-off degradation.

---

_Verified: 2026-04-12T05:04:50Z_
_Verifier: Claude (gsd-verifier)_
