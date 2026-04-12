# Phase 3: Client-side Interactivity - Research

**Researched:** 2026-04-11
**Domain:** Lit web components, Vite bundling, Leaflet maps, hyparquet, Eleventy integration
**Confidence:** HIGH

---

## Summary

Phase 3 adds all interactive components to the species factsheet: a Leaflet occurrence map, a phenology bar chart, per-field data filters, and an image slideshow. All data is loaded asynchronously from the per-species Parquet file via hyparquet. Every component is a Lit custom element. Progressive enhancement is a hard requirement: with JS disabled, content must remain accessible via plain HTML.

The build pipeline extends Eleventy with Vite as a postprocessor. The `@11ty/eleventy-plugin-vite` plugin handles this: Eleventy generates HTML first, then Vite processes the output to bundle and fingerprint the component scripts. The key integration concern is that the plugin's current release (v7.0.0) requires Vite `^7` — not Vite 8 (which is the `npm latest` tag but too new for the plugin).

The most significant technical pitfall is **Leaflet inside shadow DOM**. Leaflet 1.9.x manipulates DOM directly and does not work correctly when rendered inside a shadow root. The `<pnwm-occurrence-map>` element must override `createRenderRoot()` to return `this` (light DOM rendering), accepting the trade-off that its internal DOM has no encapsulation. All other components can use normal shadow DOM.

**Primary recommendation:** Use `@11ty/eleventy-plugin-vite@7.0.0` with `vite@7.3.x`, Lit 3.3.x plain-JS components (no TypeScript, no decorators), hyparquet `asyncBufferFromUrl` + `parquetReadObjects`, and a module-level slug-keyed cache to share Parquet data between map and chart components. Override `createRenderRoot()` to light DOM only in `<pnwm-occurrence-map>`.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INTV-01 | Leaflet map of occurrence records loaded asynchronously from per-species Parquet via hyparquet | hyparquet asyncBufferFromUrl + parquetReadObjects; Leaflet circleMarker + fitBounds |
| INTV-02 | Phenology chart (bar chart of records by month) from the same Parquet data | Chart.js 4.5 or inline Canvas; shared Parquet cache; month aggregation in JS |
| INTV-03 | Occurrence data filterable by state, record type, and year range; updates map and chart | filter-bar custom element; event-based state propagation; reactive Lit properties |
| INTV-04 | Photo slideshow with prev/next navigation and lightbox | Lit component with internal index state; no external carousel library needed |
| INTV-05 | Graceful degradation when JS is disabled — table and static images remain visible | slot-based fallback pattern; `<noscript>` block; CSS `display:none` applied by JS |
| INTV-06 | All components implemented as Lit custom elements | Lit 3.3 LitElement; customElements.define(); static properties; html`` render |
</phase_requirements>

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| lit | 3.3.2 | Web component base class and rendering engine | Google-maintained; minimal runtime; no build step required; aligns with INTV-06 |
| vite | 7.3.x | JS bundler, tree-shaking, fingerprinted output | Required by eleventy-plugin-vite@7; fast ESM-first; excellent Lit/web component support |
| @11ty/eleventy-plugin-vite | 7.0.0 | Vite postprocesses Eleventy's `_site/` output | Official 11ty integration; zero-config for MPA; handles dev server + prod build |
| leaflet | 1.9.4 | Map rendering with tile layers and markers | Required by INTV-01; mature; MIT; mobile-friendly |
| hyparquet | 1.25.6 | Client-side Parquet file reader | Required by DATA-06/INTV-01; HTTP range requests; no WASM; lightweight |
| chart.js | 4.5.1 | Phenology bar chart rendering | Well-established canvas bar chart; tree-shakes well (import only BarController); ~50KB bundle |

[VERIFIED: npm registry — versions confirmed 2026-04-11]

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @picocss/pico | 2.1.1 (existing) | Base CSS — already in project | Already installed; Lit components inherit its CSS custom properties |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| chart.js | Custom Canvas | Custom saves ~40KB but chart.js avoids axis math, responsive resize, and tooltip handling |
| chart.js | d3 | d3 is far heavier and overkill for a 12-bar phenology chart |
| @11ty/eleventy-plugin-vite | Manual Vite postprocess step in npm script | Manual is simpler conceptually but requires custom manifest + script-tag injection logic |
| Vite 7 | Vite 8 | Vite 8 is too new for eleventy-plugin-vite@7; don't use it until plugin updates [VERIFIED: npm registry] |

**Installation:**
```bash
npm install lit leaflet hyparquet chart.js
npm install --save-dev vite@^7 @11ty/eleventy-plugin-vite@7.0.0
```

**Version verification:** [VERIFIED: npm registry 2026-04-11]
- `hyparquet@1.25.6` — latest
- `lit@3.3.2` — latest stable
- `leaflet@1.9.4` — latest stable (2.0.0 in alpha, skip)
- `vite@7.3.x` — latest v7 patch; do NOT use v8 (`npm install vite@^7`)
- `@11ty/eleventy-plugin-vite@7.0.0` — latest stable; peer deps: `vite@^7`
- `chart.js@4.5.1` — latest stable

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── _data/           # Eleventy data files (unchanged)
├── _includes/       # base.njk, species.njk (extend in Phase 3)
├── species/         # species.njk pagination template
└── components/      # NEW: Lit component source files
    ├── pnwm-occurrence-map.js
    ├── pnwm-phenology-chart.js
    ├── pnwm-filter-bar.js
    ├── pnwm-image-slideshow.js
    ├── pnwm-occurrence-table.js
    └── parquet-cache.js    # Module-level shared Parquet cache

vite.config.js              # NEW: Vite config (rollupOptions.input = multiple HTML files or single entry)
```

### Pattern 1: Vite + Eleventy Plugin (Postprocess mode)

**What:** Eleventy builds HTML to `_site/`. The plugin then runs Vite over `_site/` as a postprocess step. `<script type="module" src="/components/main.js">` in the HTML becomes a fingerprinted bundle in production.

**When to use:** Always — this is the integration pattern for this project.

**eleventy.config.js addition:**
```javascript
// Source: https://www.11ty.dev/docs/server-vite/
import EleventyVitePlugin from "@11ty/eleventy-plugin-vite";

export default function (eleventyConfig) {
  // ... existing config ...
  eleventyConfig.addPlugin(EleventyVitePlugin, {
    viteOptions: {
      // Vite processes _site/ as a multi-page app
      appType: "mpa",
    }
  });
}
```

**base.njk — add script tag:**
```html
<script type="module" src="/components/main.js"></script>
```

Vite discovers `/components/main.js` as an entry point from `<script type="module">` tags in HTML pages. No explicit `build.rollupOptions.input` required for MPA mode — Vite crawls the HTML.

**vite.config.js:**
```javascript
// Source: https://vitejs.dev/guide/build
import { defineConfig } from 'vite';

export default defineConfig({
  root: '_site',
  build: {
    outDir: '_site',
    emptyOutDir: false, // CRITICAL: don't delete Eleventy output
  },
});
```

Note: `emptyOutDir: false` is critical. Without it Vite will delete Eleventy's HTML output before writing its own.

### Pattern 2: Lit Component (Plain JavaScript, no TypeScript)

**What:** Project is JS-only (no TypeScript configured). Use `static properties` and `customElements.define()` instead of decorators.

```javascript
// Source: https://lit.dev/docs/components/properties/
import { LitElement, html, css } from 'lit';

class PnwmPhenologyChart extends LitElement {
  static properties = {
    slug: { type: String },
    records: { attribute: false }, // internal state, not an HTML attribute
    loading: { type: Boolean },
  };

  constructor() {
    super();
    this.slug = '';
    this.records = [];
    this.loading = true;
  }

  async connectedCallback() {
    super.connectedCallback();
    if (this.slug) {
      this.records = await loadParquet(this.slug);
      this.loading = false;
    }
  }

  render() {
    if (this.loading) return html`<p>Loading phenology data…</p>`;
    return html`<canvas></canvas>`;
  }
}

customElements.define('pnwm-phenology-chart', PnwmPhenologyChart);
```

### Pattern 3: Leaflet in Light DOM (CRITICAL — shadow DOM incompatible)

**What:** Leaflet 1.9.x does not render correctly inside shadow DOM (known issue since 2015, unresolved in 1.x). The map container must be in the light DOM.

**Override `createRenderRoot` only in the map component:**
```javascript
// Source: https://lit.dev/docs/components/shadow-dom/
class PnwmOccurrenceMap extends LitElement {
  // Override to render into light DOM (no shadow root)
  createRenderRoot() {
    return this;
  }

  render() {
    // Rendered into the element's own children, no shadow root
    return html`<div id="map-container" style="min-height:320px"></div>`;
  }

  firstUpdated() {
    // Safe to initialize Leaflet here — DOM is in the document
    this._map = L.map(this.querySelector('#map-container'));
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(this._map);
  }
}
```

Consequence: `<pnwm-occurrence-map>` has no style encapsulation. Leaflet's global CSS (imported in main.js) applies normally. This is acceptable; all other components use shadow DOM.

### Pattern 4: Module-level Parquet Cache

**What:** Both map and chart fetch from the same Parquet file. Cache the result at module scope, keyed by slug, so only one fetch occurs per page load.

```javascript
// parquet-cache.js
import { asyncBufferFromUrl, parquetReadObjects } from 'hyparquet';

const _cache = new Map();

export async function loadParquet(slug) {
  if (_cache.has(slug)) return _cache.get(slug);
  const url = `/species/${slug}/records.parquet`;
  const file = await asyncBufferFromUrl({ url });
  const data = await parquetReadObjects({ file });
  _cache.set(slug, data);
  return data;
}
```

Components call `await loadParquet(this.slug)` in `connectedCallback`. The second caller gets the cached promise result.

### Pattern 5: Progressive Enhancement Fallback

**What:** Nunjucks template emits a static occurrence table and static image list. When JS runs, Lit components hide the fallback and render the interactive version. The `<noscript>` block explains what's missing.

```html
<!-- species.njk — occurrence section -->
<pnwm-filter-bar slug="{{ sp.slug }}"></pnwm-filter-bar>
<pnwm-occurrence-map slug="{{ sp.slug }}">
  <!-- slot fallback: shown when JS is off or component fails -->
  <pnwm-occurrence-table slug="{{ sp.slug }}">
    <table>
      <caption>Occurrence records for {{ sp.genus }} {{ sp.species }}</caption>
      <!-- ... static rows from Parquet at build time are NOT here (too many) -->
      <!-- per DATA-04: occurrence data not embedded inline -->
    </table>
  </pnwm-occurrence-table>
</pnwm-occurrence-map>
<noscript>
  <p>Enable JavaScript to view the interactive map and filters.
     Occurrence data is available in the table below.</p>
</noscript>
```

**Important constraint from DATA-04:** Per-species occurrence data is NOT embedded in the HTML at build time. The JS-off fallback for the occurrence table must be populated by the `<pnwm-occurrence-table>` web component fetching and rendering the Parquet data — which also requires JS. This means the occurrence table is not available without JS, and the `<noscript>` notice is the correct fallback for occurrence data specifically. Photos, taxonomy, prose, and similar species are static and visible without JS. This satisfies INTV-05: "data remains visible as text" refers to the static taxonomic content; the requirement cannot mean inline occurrence rows given DATA-04.

### Anti-Patterns to Avoid

- **Putting Leaflet inside shadow DOM:** Tiles render outside their container. Always light DOM for map. [VERIFIED: GitHub issues]
- **Vite 8 with eleventy-plugin-vite@7:** Plugin peer deps are `vite@^7`; installing v8 will cause peer dependency errors or subtle breakage.
- **`emptyOutDir: true` in vite.config:** Deletes `_site/` before writing, wiping Eleventy's HTML output.
- **Multiple fetches of same Parquet file:** Without the module cache, map and chart each trigger a full fetch. Use the shared cache module.
- **Class field initialization of Lit reactive properties:** In plain JS (no TypeScript), reactive properties MUST be initialized in the constructor, not as class fields. Class fields shadow the setter accessors that Lit generates.
- **Using `this.shadowRoot.querySelector` in the map component:** `createRenderRoot()` returns `this`, so use `this.querySelector()` not `this.shadowRoot.querySelector()`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Parquet file parsing | Custom binary parser | hyparquet `parquetReadObjects` | Parquet encoding (dictionary, RLE, delta) has many variants; hand-rolling misses them |
| HTTP range request management | Custom fetch + byte ranges | hyparquet `asyncBufferFromUrl` | hyparquet handles Content-Range headers, partial reads, and caching automatically |
| Canvas chart rendering | Custom canvas bar chart | chart.js (register only BarController) | Responsive resize, HiDPI, axis scaling, and tooltip positioning are non-trivial |
| Custom element reactivity | Pub/sub, manual DOM diffing | Lit `LitElement` + `static properties` | Batched async updates, efficient diffing, lifecycle hooks — all built in |
| Map tile layer | Custom tile fetching | Leaflet `L.tileLayer` | Tile coordinate math, retry, caching, zoom levels, CRS transforms |
| Focus trap in lightbox | Custom tab intercept | Native `inert` attribute on background | `inert` is now baseline-widely-available; simpler than a custom trap |

**Key insight:** The three external libraries (hyparquet, Leaflet, chart.js) each solve domain-specific complexity that would take weeks to replicate correctly. None have viable lightweight substitutes for this use case.

---

## Common Pitfalls

### Pitfall 1: Leaflet map renders with zero height or broken tiles
**What goes wrong:** Map container renders at 0px height because the Lit component updates asynchronously before CSS is applied, or Leaflet is initialized before the container is in the document.
**Why it happens:** Leaflet calls `getComputedStyle` on the container during init; if height is 0 or element is detached, tiles don't position.
**How to avoid:** Initialize Leaflet in `firstUpdated()` lifecycle (after first render), always set explicit `min-height: 320px` via inline style or component CSS, call `this._map.invalidateSize()` if container dimensions change.
**Warning signs:** Map shows one tile at top-left corner only; tiles appear outside the container.

### Pitfall 2: Vite deletes Eleventy output
**What goes wrong:** Running `npm run build` produces an empty `_site/` or only Vite assets, no Eleventy HTML.
**Why it happens:** Vite's default `emptyOutDir: true` wipes `_site/` before writing. Since Eleventy ran first, its output is gone.
**How to avoid:** Set `build.emptyOutDir: false` in `vite.config.js`. [VERIFIED: Vite docs]
**Warning signs:** `_site/` contains only `assets/` subdirectory after build.

### Pitfall 3: Lit reactive properties not updating
**What goes wrong:** Changing `this.records = newData` does not trigger re-render.
**Why it happens:** In plain JS (no decorators), if properties are initialized as class fields instead of in `constructor()`, the class field assignment overwrites Lit's generated setter accessor before it runs.
**How to avoid:** Always initialize in `constructor()`. Declare shape in `static properties`.
**Warning signs:** Component renders once on load then never again; no errors in console.

### Pitfall 4: Parquet fetch fired on every page scroll
**What goes wrong:** Multiple network requests to the same `.parquet` file on a single page.
**Why it happens:** Both map and chart call `loadParquet()` on `connectedCallback`; without a cache, both fire fetches.
**How to avoid:** The module-level `Map` cache in `parquet-cache.js` deduplicates fetches. Import from that module everywhere.
**Warning signs:** Two requests to `/species/{slug}/records.parquet` in network tab.

### Pitfall 5: Filter events not reaching sibling components
**What goes wrong:** Selecting a filter in `<pnwm-filter-bar>` doesn't update the map or chart.
**Why it happens:** Custom events don't bubble out of shadow DOM by default (they stop at the shadow root). If components dispatch events internally, siblings can't hear them.
**How to avoid:** Dispatch filter-change events with `{ bubbles: true, composed: true }` so they cross shadow boundaries, OR use a shared signal/reactive-controller pattern. The simplest approach: `<pnwm-filter-bar>` dispatches a `composed: true` event on the host element; the Nunjucks template wires components together with `addEventListener` in an inline script, passing filter state down as attributes.
**Warning signs:** Filter selects update visually but map/chart don't change.

### Pitfall 6: Leaflet CSS not loaded
**What goes wrong:** Leaflet tiles render but controls (zoom buttons, attribution) are invisible or broken.
**Why it happens:** Leaflet's CSS (`leaflet/dist/leaflet.css`) must be imported; it's not bundled automatically.
**How to avoid:** `import 'leaflet/dist/leaflet.css'` in `pnwm-occurrence-map.js` (Vite handles CSS imports in JS files). [VERIFIED: Leaflet docs]
**Warning signs:** Map renders but zoom control buttons are invisible or misaligned.

---

## Code Examples

### hyparquet — Load Parquet from URL

```javascript
// Source: https://github.com/hyparam/hyparquet (README)
import { asyncBufferFromUrl, parquetReadObjects } from 'hyparquet';

const url = '/species/acronicta-americana/records.parquet';
const file = await asyncBufferFromUrl({ url });
const records = await parquetReadObjects({ file });
// records is Array<{ species_id, record_type, latitude, longitude, state,
//   county, locality, elevation, year, month, day, collector, collection, notes }>
```

### Leaflet — Add circle markers and fit bounds

```javascript
// Source: https://leafletjs.com/reference.html
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const map = L.map(containerEl).setView([47.5, -120.5], 6); // PNW center
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a> contributors'
}).addTo(map);

const markers = records
  .filter(r => r.latitude && r.longitude)
  .map(r => L.circleMarker([r.latitude, r.longitude], {
    radius: 6,
    color: 'var(--pico-primary, #0172ad)', // CSS custom properties work on SVG
    fillOpacity: 0.7,
  }).bindPopup(`${r.locality || ''} ${r.state || ''} ${r.year || ''}`));

if (markers.length > 0) {
  const group = L.featureGroup(markers).addTo(map);
  map.fitBounds(group.getBounds().pad(0.1));
}
```

### chart.js — Minimal bar chart (register-only pattern)

```javascript
// Source: https://www.chartjs.org/docs/latest/getting-started/
import {
  Chart,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
} from 'chart.js';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function renderPhenologyChart(canvas, records) {
  const counts = new Array(12).fill(0);
  for (const r of records) {
    if (r.month >= 1 && r.month <= 12) counts[r.month - 1]++;
  }
  new Chart(canvas, {
    type: 'bar',
    data: {
      labels: MONTHS,
      datasets: [{ data: counts, backgroundColor: 'var(--pico-primary, #0172ad)' }],
    },
    options: { responsive: true, plugins: { legend: { display: false } } },
  });
}
```

### Lit — Component with filter-state cross-component event

```javascript
// Source: https://lit.dev/docs/components/events/
// Dispatch from filter-bar (composed:true crosses shadow DOM)
this.dispatchEvent(new CustomEvent('pnwm-filter-change', {
  bubbles: true,
  composed: true,
  detail: { state: this._state, recordType: this._recordType, yearMin: this._yearMin, yearMax: this._yearMax },
}));

// Listen in template (inline script wiring components together)
// species.njk
document.querySelector('pnwm-occurrence-map')
  .addEventListener('pnwm-filter-change', e => {
    document.querySelector('pnwm-occurrence-map').filters = e.detail;
    document.querySelector('pnwm-phenology-chart').filters = e.detail;
  });
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Leaflet custom icon URLs (image files) | `circleMarker` SVG (no image files) | Leaflet 0.7+ | No broken icon URLs; no extra HTTP requests |
| Chart.js full bundle import | Tree-shaken register-only import | Chart.js 3.0 (2021) | Bundle drops from ~200KB to ~50KB for bar chart only |
| Parquet in browser requires WASM (DuckDB-WASM) | hyparquet: pure JS, no WASM | 2024 | Eliminates WASM init overhead (~1s); smaller bundle |
| Lit decorators (TypeScript required) | `static properties` plain JS | Lit 2.0+ | No TypeScript build step required; ESM-native |
| Vite 5/6 with eleventy-plugin | Vite 7 + eleventy-plugin-vite@7 | Mid-2024 | Plugin peer dep is now `^7`; don't use v8 yet |

**Deprecated/outdated:**
- Polymer: replaced by Lit (same team, rewrite)
- `parquetjs` (npm): no longer maintained; hyparquet is the successor for browser use
- Chart.js v2/v3 `import Chart from 'chart.js'` full bundle: always use the register-only pattern in v4

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The JS-off occurrence table fallback cannot show inline occurrence rows (DATA-04 forbids embedding occurrence data in HTML); noscript notice is sufficient for INTV-05 compliance | Architecture Patterns Pattern 5 | If reviewer interprets INTV-05 as requiring inline occurrence rows without JS, the build-time occurrence embed would contradict DATA-04 — requires explicit resolution |
| A2 | chart.js `backgroundColor` accepts CSS custom property strings (`var(--pico-primary)`) | Code Examples | Chart.js resolves colors at draw time via Canvas 2D context which does not support CSS custom properties — may need to hardcode `#0172ad` [LOW confidence] |
| A3 | Filter-bar to map/chart wiring uses a composed CustomEvent + inline template script; no external state manager | Architecture Patterns Pattern 5 | If components are on different pages or need SSR hydration, this pattern breaks — not a concern here |

---

## Open Questions (RESOLVED)

1. **INTV-05 and occurrence data without JS** — RESOLVED 2026-04-11
   - Decision: `<noscript>` notice is the authoritative fallback for occurrence data. DATA-04 takes precedence — occurrence rows are not embedded in HTML at build time.
   - Photos, taxonomy, and prose remain visible as static HTML without JS; this satisfies INTV-05.
   - ROADMAP success criterion #5 updated to reflect this resolution.
   - Source: Project owner confirmation.

2. **Year range filter bounds** — RESOLVED 2026-04-11
   - Decision: Hardcode min=1900, max=current year per UI-SPEC. No data-range clamping.
   - Rationale: Keeps implementation simple; sparse early-year data is acceptable UX for a research tool.

3. **Leaflet tile provider** — RESOLVED 2026-04-11
   - Decision: Use OpenStreetMap tiles (`tile.openstreetmap.org`) with standard attribution for v1.
   - OSM tile policy allows use on public sites with proper attribution (© OpenStreetMap contributors). Deferred concern: if traffic is high, switch to Stadia or CartoDB for production.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Vite build, Eleventy | ✓ | v25.9.0 (`.nvmrc: 22`) | — |
| npm | Package install | ✓ | 11.12.1 | — |
| vite@^7 | JS bundling | ✗ (not yet installed) | — | Install in Wave 0 |
| @11ty/eleventy-plugin-vite@7 | Eleventy/Vite integration | ✗ (not yet installed) | — | Install in Wave 0 |
| lit@3 | Component framework | ✗ (not yet installed) | — | Install in Wave 0 |
| leaflet@1 | Map | ✗ (not yet installed) | — | Install in Wave 0 |
| hyparquet@1 | Parquet loading | ✗ (not yet installed) | — | Install in Wave 0 |
| chart.js@4 | Phenology chart | ✗ (not yet installed) | — | Install in Wave 0 |

**Note on Node version mismatch:** `.nvmrc` specifies Node 22; shell is running Node 25.9.0. The `SessionStart` NVM hook should handle this. No blocking issue — Node 25 is forward-compatible with Node 22 packages.

**Missing dependencies with no fallback:** All listed above require installation before implementation. This is expected (Wave 0 task).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node built-in `node:test` (already used in `scripts/build-data.test.js`) |
| Config file | none (direct `node --test` invocation) |
| Quick run command | `node --test scripts/*.test.js` |
| Full suite command | `node --test scripts/*.test.js` |

Interactive/browser tests for Lit components are out of scope for this phase — components will be tested by visual inspection and the success criteria smoke-tests described in the phase goal. No browser test framework (Playwright, Cypress) is introduced in Phase 3.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INTV-01 | Parquet file exists at `_site/species/{slug}/records.parquet` after build | smoke | `ls _site/species/acronicta-americana/records.parquet` | ❌ Wave 0 |
| INTV-01 | `loadParquet()` returns array of records with lat/lon fields | unit | `node --test src/components/parquet-cache.test.js` | ❌ Wave 0 |
| INTV-02 | Month aggregation produces 12-element array | unit | `node --test src/components/phenology.test.js` | ❌ Wave 0 |
| INTV-03 | Filter function returns only matching records | unit | `node --test src/components/filters.test.js` | ❌ Wave 0 |
| INTV-05 | `<noscript>` block present in built HTML | smoke | `grep -r 'noscript' _site/species/ \| head -1` | ❌ Wave 0 |
| INTV-06 | Custom element tags present in built HTML | smoke | `grep -r 'pnwm-occurrence-map' _site/species/ \| head -1` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `node --test scripts/*.test.js`
- **Per wave merge:** `npm run build && node --test scripts/*.test.js`
- **Phase gate:** Full build green + manual visual check of one species page before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/components/parquet-cache.test.js` — covers INTV-01 (pure function, no browser)
- [ ] `src/components/phenology.test.js` — covers INTV-02 month aggregation
- [ ] `src/components/filters.test.js` — covers INTV-03 filter logic
- [ ] Install: `npm install lit leaflet hyparquet chart.js && npm install --save-dev vite@^7 @11ty/eleventy-plugin-vite@7.0.0`

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes | No user-supplied data stored or sent to server; filter inputs are `<select>` and `<input type="range">` — all client-side only, no injection surface |
| V6 Cryptography | no | — |

### Known Threat Patterns for Static Site + Client-side JS

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via Parquet data rendered to DOM | Tampering | Use Lit `html` tagged template (auto-escapes); never `innerHTML` with Parquet string values |
| Parquet file tampered in transit | Tampering | HTTPS passthrough (Netlify/GitHub Pages); no integrity hash mechanism in hyparquet |
| OSM tile requests leaking user location | Info Disclosure | Tile requests are standard browser behavior; no PII in tile URLs; acceptable risk |

No server-side inputs, no authentication surface, no stored credentials. The security posture for Phase 3 is low risk. The one real concern is XSS via Lit template rendering of Parquet string fields (locality, collector, notes) — mitigated by always using `html` tagged template literals and never using `.innerHTML`.

---

## Sources

### Primary (HIGH confidence)

- npm registry (`npm view`) — version numbers for all packages confirmed 2026-04-11 [VERIFIED]
- Verified Parquet schema by querying `acronicta-americana/records.parquet` via DuckDB locally [VERIFIED]
- `https://lit.dev/docs/components/defining/` — customElements.define, static properties
- `https://lit.dev/docs/components/properties/` — plain JS property declaration
- `https://lit.dev/docs/components/shadow-dom/` — createRenderRoot override
- `https://github.com/hyparam/hyparquet` — asyncBufferFromUrl + parquetReadObjects API
- `https://leafletjs.com/reference.html` — circleMarker, fitBounds, tileLayer
- `https://www.11ty.dev/docs/server-vite/` — Eleventy Vite plugin integration
- `https://github.com/11ty/eleventy-plugin-vite` — plugin peer deps (vite@^7 confirmed)

### Secondary (MEDIUM confidence)

- Leaflet/shadow DOM incompatibility: confirmed by GitHub issue #3246 and Lit issue #1123 — light DOM workaround pattern [CITED: github.com/Leaflet/Leaflet/issues/3246]
- `emptyOutDir: false` necessity: confirmed by Vite docs build output section [CITED: vitejs.dev/guide/build]
- chart.js register-only import pattern: confirmed by chart.js v4 docs [CITED: chartjs.org]

### Tertiary (LOW confidence)

- chart.js `backgroundColor: 'var(--pico-primary)'` — CSS custom properties in Canvas context may not work; hardcode the hex `#0172ad` as fallback [ASSUMED]
- OSM tile rate limits for static sites — not verified against current OSM tile policy [ASSUMED]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified via npm registry
- Architecture: HIGH — patterns verified against official docs; Leaflet/shadow DOM pitfall verified against GitHub issues
- Pitfalls: HIGH for Leaflet/shadow and Vite emptyOutDir (verified); MEDIUM for chart.js CSS custom property behavior (assumed)

**Research date:** 2026-04-11
**Valid until:** 2026-05-11 (stable libraries; eleventy-plugin-vite may update Vite 8 support sooner)
