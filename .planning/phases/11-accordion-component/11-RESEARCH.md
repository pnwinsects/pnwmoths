# Phase 11: Accordion Component - Research

**Researched:** 2026-04-20
**Domain:** Lit web components, light DOM, accordion UI, state filter, nav image fallback
**Confidence:** HIGH

## Summary

Phase 11 creates `src/components/pnwm-taxon-browser.js` — a single Lit 3.x custom element that
reads pre-built taxonomy JSON from a sibling `<script type="application/json" id="taxon-data">`
element, fetches `species-states.json` asynchronously, and renders a four-level expand/collapse
accordion (Family → Subfamily → Genus → Species) with thumbnail strips and a state filter.

Every architectural decision is already locked: light DOM via `createRenderRoot() { return this; }`,
`<select>` for the filter, instant show/hide (no CSS transitions), controls embedded in
`render()`, and muting (not hiding) filtered taxa. The implementation work is decomposable into
two separable concerns: (1) the tree rendering / expand-collapse logic, and (2) the state filter
overlay (muting). Navigation image fallback logic already lives in `taxon.js` and is baked into
the data — the component need only render `navImages[]` arrays.

The existing test suite runs under `node --test` (Node.js built-in test runner, no Jest / Vitest)
using `describe`/`it` from `node:test` and `assert` from `node:assert/strict`. Tests are pure JS
unit tests; they do not mount DOM. The component's pure-logic helpers (image-strip selection,
state filter tree traversal) are the natural unit-test targets.

**Primary recommendation:** One class `PnwmTaxonBrowser` with nested `_render*` helpers; extract
`computeMuted(families, stateMap, selectedState)` and `buildStateMap(speciesStates)` as top-level
pure functions so they can be unit-tested without a DOM.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Navigation images displayed as horizontal thumbnail strip — `inline-flex` row,
  `overflow-x: auto` for mobile horizontal scroll, no wrapping.
- **D-02:** Fixed height of **93px** per image cell. Width `auto` so images scale proportionally.
- **D-03:** `object-fit: cover` on `<img>` elements.
- **D-04:** No photographer credit at accordion thumbnail level.
- **D-05:** State filter UI is a `<select>` dropdown — consistent with `pnwm-filter-bar.js`.
- **D-06:** Taxa with no occurrence records in selected state are **muted (dimmed), not hidden**.
  Toggle a CSS class or `aria-disabled` to reduce opacity; do not remove rows from the DOM.
- **D-07:** Expand/collapse uses **instant show/hide** — `hidden` attribute or `display:none` via
  Lit reactive property. No CSS height/opacity transitions.
- **D-08:** Show/hide images toggle and state filter live **inside `<pnwm-taxon-browser>`** in the
  component's own `render()` method.
- **D-09:** `createRenderRoot() { return this; }` — light DOM is **mandatory** (Pico CSS does not
  penetrate shadow DOM). Non-negotiable.
- **D-10:** Reads taxonomy data from `document.getElementById('taxon-data')` JSON script element.
  No `data-` attributes on the custom element.
- **D-11:** State filter data loaded via `fetch('/species-states.json')` in `connectedCallback()`.

### Claude's Discretion

- Form factor for the show/hide images toggle — `<input type="checkbox">` with `<label>` or
  `<button aria-pressed>`.
- Visual treatment for muted rows — opacity reduction, a CSS class, `aria-disabled`, or similar.
- Single-class vs. sub-components architecture.
- How to handle `species-states.json` loading state (spinner, disable filter until loaded, silent
  defer).

### Deferred Ideas (OUT OF SCOPE)

None surfaced — discussion stayed within phase scope.

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BROWSE-02 | Accordion lists all families collapsed by default; each with up to 4 navigation images | Data already in `navImages[]` arrays; toggle state via reactive property |
| BROWSE-03 | Expanding a family reveals subfamilies (or genera for no-subfamily families) with up to 4 images; parent images hidden while expanded | `subfamilies[].name === null` branches to direct-genus list; per-taxon `expanded` boolean toggles display |
| BROWSE-04 | Expanding a subfamily reveals its genera with up to 4 images; subfamily images hidden while expanded | Same expand toggle pattern as BROWSE-03 |
| BROWSE-05 | Expanding a genus reveals its species as links to `/species/{slug}/` factsheet pages | `genus.species[]` array already present; link pattern from index.njk |
| BROWSE-06 | Navigation images fall back to `navigational`-flagged images then lowest-weight photos; no broken image placeholders | Fallback already computed in `taxon.js` `pickNavImages()`; component just renders `navImages[]` |
| SFILT-02 | Browse page state filter hides taxa with no occurrence records in selected state | `species-states.json` is an array of `{species_slug, state}` pairs; component builds a lookup set and mutes taxa |

</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Expand/collapse accordion state | Browser / Client (Lit reactive props) | — | Pure UI state; no server round-trip |
| Navigation image selection / fallback | Build-time (taxon.js) | — | Already computed; component only renders |
| Show/hide images toggle | Browser / Client (Lit reactive prop) | — | Global UI state |
| State filter data | CDN / Static (species-states.json) | Browser / Client | Data is static; component fetches on mount |
| State filter muting logic | Browser / Client | — | Pure client-side tree walk |
| Component registration | Browser / Client (main.js import) | — | One import line |
| Taxonomy data | Build-time (taxon.js → JSON embed) | — | Data embedded in page; no runtime fetch |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| lit | 3.3.2 [VERIFIED: package.json] | Web component base class, reactive properties, html template tag | Already in use for all 4 existing components |
| node:test | built-in (Node 22.20.0) [VERIFIED: node --version] | Test runner | Already the project test runner |

No new libraries are required for this phase. The component uses only Lit (already installed) and
native browser APIs (`fetch`, `JSON.parse`, `document.getElementById`).

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Single class with `_render*` helpers | Sub-elements `PnwmTaxonFamily` etc. | Sub-elements add overhead (extra customElements.define calls, coordination) for a component with shared state (imageToggle, selectedState). Single class simpler at this scale. |
| `hidden` attribute | CSS `display:none` via inline style | `hidden` is idiomatic HTML boolean attribute; Lit's `?hidden=${!isExpanded}` is clean. Either works. |
| `<input type="checkbox">` for toggle | `<button aria-pressed>` | Checkbox is natively accessible and Pico CSS styles it. Button requires manual `aria-pressed` management. Checkbox preferred. |

---

## Architecture Patterns

### System Architecture Diagram

```
Page Load
    |
    v
document.getElementById('taxon-data')
    |
    v (synchronous JSON parse in connectedCallback)
[families[]] ─────────────────────────────────────────────┐
    |                                                       |
    v (async fetch)                                         |
fetch('/species-states.json')                               |
    |                                                       |
    v                                                       |
buildStateMap()                                             |
  {species_slug → Set<state>}                               |
    |                                                       |
    v                                                       |
[stateMap] ─────────────────────────────────┐              |
                                             |              |
User interaction (select state)             |              |
    |                                        |              |
    v                                        |              |
computeMuted(families, stateMap, state)      |              |
  → Set<taxon_key> of muted taxa            |              |
    |                                        |              |
    +─────────────────────────────────────── + ─────────── +
    v
render()
    ├── <toolbar> (checkbox + select)
    └── families.map(_renderFamily)
            └── _renderFamily
                    ├── image strip (if !expanded && showImages)
                    ├── expand/collapse button
                    └── (if expanded) subfamilies.map(_renderSubfamily)
                            └── _renderSubfamily
                                    ├── image strip
                                    ├── expand/collapse
                                    └── (if expanded) genera.map(_renderGenus)
                                            └── _renderGenus
                                                    ├── image strip
                                                    ├── expand/collapse
                                                    └── (if expanded) species list
                                                            └── <a href="/species/{slug}/">
```

### Recommended Project Structure

```
src/components/
├── pnwm-taxon-browser.js    # new — the accordion component
├── main.js                  # add import for pnwm-taxon-browser.js
├── pnwm-filter-bar.js       # reference — select filter pattern
├── pnwm-occurrence-map.js   # reference — createRenderRoot() pattern
└── ...
```

### Pattern 1: Light DOM Component (copy from pnwm-occurrence-map.js)

**What:** Override `createRenderRoot()` to return `this` instead of a shadow root.
**When to use:** Any component where Pico CSS must style rendered elements.

```javascript
// Source: src/components/pnwm-occurrence-map.js [VERIFIED: codebase]
createRenderRoot() {
  return this;
}
```

### Pattern 2: Reactive Properties for UI State

**What:** Use Lit `static properties` with `state: true` for internal UI state.
**When to use:** Any state that should trigger re-render but not expose as HTML attribute.

```javascript
// Source: src/components/pnwm-filter-bar.js [VERIFIED: codebase]
static get properties() {
  return {
    _expandedFamilies: { attribute: false, state: true }, // Set<string>
    _expandedSubfamilies: { attribute: false, state: true },
    _expandedGenera: { attribute: false, state: true },
    _showImages: { type: Boolean, state: true },
    _selectedState: { type: String, state: true },
    _families: { attribute: false, state: true },
    _stateMap: { attribute: false, state: true },
    _statesAvailable: { attribute: false, state: true },
  };
}
```

### Pattern 3: connectedCallback for Async Data Loading

**What:** Load async data in `connectedCallback`, update reactive state when done.
**When to use:** Fetching data that should trigger initial render.

```javascript
// Source: pnwm-filter-bar.js + pnwm-occurrence-map.js [VERIFIED: codebase]
async connectedCallback() {
  super.connectedCallback();
  // Sync: read embedded JSON
  const scriptEl = document.getElementById('taxon-data');
  this._families = JSON.parse(scriptEl.textContent);
  // Async: fetch state filter data
  try {
    const res = await fetch('/species-states.json');
    const data = await res.json();
    this._stateMap = buildStateMap(data);
    this._statesAvailable = [...new Set(data.map(d => d.state))].sort();
  } catch (_e) {
    // Leave _stateMap null — filter select remains disabled or shows "unavailable"
  }
}
```

### Pattern 4: Select Dropdown Filter

**What:** `<select>` with Lit `.value` binding and `@change` handler.
**When to use:** Dropdown filter consistent with `pnwm-filter-bar.js`.

```javascript
// Source: src/components/pnwm-filter-bar.js [VERIFIED: codebase]
html`
  <select .value=${this._selectedState} @change=${this._onStateChange}>
    <option value="">All states</option>
    ${this._statesAvailable.map(s =>
      html`<option value=${s} ?selected=${this._selectedState === s}>${s}</option>`
    )}
  </select>
`
```

### Pattern 5: State Filter Muting — Pure Function

**What:** Walk the family tree, build a `Set` of taxon keys that have at least one species with
a record in `selectedState`. Anything NOT in the set is muted.
**When to use:** Called in `render()` when `_selectedState` is non-empty.

```javascript
// [ASSUMED] — implementation pattern; no prior art in codebase
function buildStateMap(speciesStateRows) {
  // speciesStateRows: [{species_slug, state}, ...]
  const map = {};
  for (const { species_slug, state } of speciesStateRows) {
    if (!map[species_slug]) map[species_slug] = new Set();
    map[species_slug].add(state);
  }
  return map;
}

function taxonHasState(speciesSlugs, stateMap, selectedState) {
  return speciesSlugs.some(slug => stateMap[slug]?.has(selectedState));
}
```

The component derives each genus's species slugs, then subfamily species slugs, then family
species slugs — propagating "has any species in state" upward.

### Pattern 6: Image Strip Rendering

**What:** `inline-flex` row of fixed-height `<img>` tags with `overflow-x: auto`.
**When to use:** Rendering `navImages[]` for any taxon level.

```javascript
// [ASSUMED] — based on D-01, D-02, D-03 decisions
_renderImageStrip(navImages) {
  if (!this._showImages || navImages.length === 0) return html``;
  return html`
    <div style="display:inline-flex;flex-direction:row;overflow-x:auto;gap:4px">
      ${navImages.map(img => html`
        <img
          src="/images/${img.filename}"
          alt=""
          style="height:93px;width:auto;object-fit:cover"
          loading="lazy"
        >
      `)}
    </div>
  `;
}
```

Note: `alt=""` because nav images are decorative at the browse level (D-04 no photographer
credit; species factsheet provides accessible image descriptions).

### Anti-Patterns to Avoid

- **Shadow DOM:** Using default `LitElement` without `createRenderRoot()` override — Pico CSS
  won't style selects, headings, or links inside shadow DOM. MUST override.
- **CSS transitions on expand/collapse:** D-07 explicitly forbids transitions. Large genera
  subtrees (50+ species) cause layout-recalc jank.
- **Hiding muted taxa:** D-06 requires muting (dimming), not `display:none`. "WA has no
  Lasiocampidae" is useful information.
- **Putting controls in index.njk:** D-08 requires controls inside the component's `render()`.
  The shell page stays minimal.
- **Reading taxonomy from a `data-` attribute:** D-10 locks the `<script id="taxon-data">`
  approach. Large JSON in attributes triggers HTML-escaping bugs and attribute size limits.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Navigation image fallback (nav-flagged → lowest-weight) | Custom client-side ranking | `navImages[]` from `taxon.js` — already computed at build time | `pickNavImages()` in `taxon.js` already handles navigational sort → weight sort → slice(4). Done. |
| State list extraction from JSON | Custom parser | `[...new Set(data.map(d => d.state))].sort()` | `species-states.json` is a flat array of `{species_slug, state}` pairs — trivial one-liner |
| Reactive UI without Lit | Manual DOM diffing | Lit `html` template tag + reactive properties | Already in all 4 existing components |

**Key insight:** The most complex logic (image fallback) is entirely build-time. The component is
a renderer, not a data processor.

---

## Common Pitfalls

### Pitfall 1: `navigational` field is a string, not a boolean

**What goes wrong:** `navImages[i].navigational` arrives as `null` (not `false` or `true`) from
the current test data, and `taxon.js` stores it as `VARCHAR` in DuckDB. The `pickNavImages`
function checks `a.navigational === 'true'`. If the component tries to re-sort or re-filter
navImages on the client, this string comparison will catch it off-guard.

**Why it happens:** DuckDB `read_csv` with `columns = { 'navigational': 'VARCHAR' }` means the
field is a string `'true'` / `'false'` / `null`, not a JS boolean.

**How to avoid:** The component should NOT re-sort or re-filter `navImages[]`. Trust the build
output. Just render `navImages[]` as-is. [VERIFIED: taxon.js source + live data output showing
`"navigational":null`]

**Warning signs:** If you see `navImages` with `navigational: null` rendering wrong, it means
client-side re-sorting was attempted.

### Pitfall 2: Subfamily `name === null` — two distinct rendering branches

**What goes wrong:** Some families have all genera in a single `subfamilies[0]` with `name ===
null`. If the render blindly emits a `<h3>` for every subfamily, you get an empty heading for
the no-subfamily case.

**Why it happens:** `taxon.js` wraps all genera in a synthetic `__none__` subfamily entry with
`name: null` even when there is no real subfamily. [VERIFIED: taxon.js lines 98–101 + live data]

**How to avoid:** `if (subfam.name)` guard before rendering the subfamily heading — already shown
in `browse/index.njk` noscript block. BROWSE-03 spec says "subfamilies (or genera for families
with no subfamily)".

**Warning signs:** Empty `<h3></h3>` elements in the DOM.

### Pitfall 3: `species-states.json` is an array, not a map

**What goes wrong:** Treating it like `{ species_slug: [states] }` — it is actually
`[{species_slug, state}, ...]` (flat DISTINCT rows). [VERIFIED: live `_site/species-states.json`]

**Why it happens:** Emitted by `emit-species-states.js` (Phase 9) as SELECT DISTINCT rows.

**How to avoid:** `buildStateMap()` must transform the array into a lookup:
```
{ 'habrosyne-scripta': Set{'ID','MT','OR','WA'}, ... }
```

**Warning signs:** Filter not working; all taxa showing as muted.

### Pitfall 4: Light DOM means styles bleed in both directions

**What goes wrong:** CSS rules written for the component affect the rest of the page (or page
styles affect component internals unexpectedly).

**Why it happens:** Light DOM has no style isolation. Pico classless styles *do* apply to
`<select>`, `<img>`, `<button>` etc. inside the component — that's the whole reason we use light
DOM. But it also means any class names you introduce must not collide with Pico or theme.css.

**How to avoid:** Use specific class names (e.g., `.pnwm-tb-strip`, `.pnwm-tb-row`) or inline
styles for component-specific layout. Don't add a `<style>` block inside the component; use
inline styles for the few structural rules (image strip flex, muted opacity).

**Warning signs:** Species link styles or heading fonts changed globally after component registers.

### Pitfall 5: Expanding state is a Set, not a boolean per-row

**What goes wrong:** Using a single boolean reactive property like `_expandedFamily = 'Drepanidae'`
means only one family can be open at a time.

**Why it happens:** Misreading requirements — the accordion does NOT state "only one open at a
time".

**How to avoid:** Use `_expandedFamilies = new Set()` and `.has(family.name)` checks. Lit
reactive properties trigger re-render when you assign a *new* Set (not when you mutate).

**Warning signs:** Only one family can be open; opening a second collapses the first.

### Pitfall 6: Assigning a mutated Set doesn't trigger Lit re-render

**What goes wrong:**
```javascript
this._expandedFamilies.add(name); // mutation — Lit sees same object reference → no update
```

**Why it happens:** Lit tracks property identity, not deep equality.

**How to avoid:**
```javascript
this._expandedFamilies = new Set([...this._expandedFamilies, name]);
```
or use `@lit/reactive-element`'s `requestUpdate()` after mutation. The new-Set pattern is
idiomatic. [VERIFIED: Lit 3.x reactive property docs — property change detected by identity]

**Warning signs:** Clicking expand does nothing; state changes silently dropped.

---

## Code Examples

### Full component skeleton

```javascript
// src/components/pnwm-taxon-browser.js
import { LitElement, html } from 'lit';

// Pure functions — unit-testable without DOM
export function buildStateMap(rows) {
  const map = {};
  for (const { species_slug, state } of rows) {
    if (!map[species_slug]) map[species_slug] = new Set();
    map[species_slug].add(state);
  }
  return map;
}

export function taxonHasState(slugs, stateMap, selectedState) {
  if (!selectedState) return true;
  return slugs.some(slug => stateMap[slug]?.has(selectedState));
}

export function collectSlugs(taxon) {
  // Recursively collect all species slugs from any level of the tree
  if (taxon.species) return taxon.species.map(s => s.slug);
  const slugs = [];
  for (const child of (taxon.subfamilies || taxon.genera || [])) {
    slugs.push(...collectSlugs(child));
  }
  return slugs;
}

class PnwmTaxonBrowser extends LitElement {
  static get properties() {
    return {
      _families:           { attribute: false, state: true },
      _stateMap:           { attribute: false, state: true },
      _statesAvailable:    { attribute: false, state: true },
      _selectedState:      { type: String,  state: true },
      _showImages:         { type: Boolean, state: true },
      _expandedFamilies:   { attribute: false, state: true },
      _expandedSubfamilies:{ attribute: false, state: true },
      _expandedGenera:     { attribute: false, state: true },
    };
  }

  createRenderRoot() { return this; }

  constructor() {
    super();
    this._families = [];
    this._stateMap = {};
    this._statesAvailable = [];
    this._selectedState = '';
    this._showImages = true;
    this._expandedFamilies = new Set();
    this._expandedSubfamilies = new Set();
    this._expandedGenera = new Set();
  }

  async connectedCallback() {
    super.connectedCallback();
    const scriptEl = document.getElementById('taxon-data');
    if (scriptEl) this._families = JSON.parse(scriptEl.textContent);
    try {
      const res = await fetch('/species-states.json');
      const rows = await res.json();
      this._stateMap = buildStateMap(rows);
      this._statesAvailable = [...new Set(rows.map(r => r.state))].sort();
    } catch (_e) { /* filter disabled on error */ }
  }

  render() { /* ... toolbar + families loop */ }
}

customElements.define('pnwm-taxon-browser', PnwmTaxonBrowser);
```

### Image strip

```javascript
// [ASSUMED] — based on D-01, D-02, D-03
_renderImageStrip(navImages) {
  if (!this._showImages || !navImages?.length) return html``;
  return html`
    <div style="display:inline-flex;gap:4px;overflow-x:auto">
      ${navImages.map(img => html`
        <img src="/images/${img.filename}" alt="" loading="lazy"
             style="height:93px;width:auto;object-fit:cover;flex-shrink:0">
      `)}
    </div>`;
}
```

### Muting a taxon row

```javascript
// [ASSUMED] — D-06: muted = opacity, not hidden
_mutedStyle(slugs) {
  if (!this._selectedState) return '';
  const has = taxonHasState(slugs, this._stateMap, this._selectedState);
  return has ? '' : 'opacity:0.35';
}
// Usage in render:
html`<div style=${this._mutedStyle(collectSlugs(family))}> ... </div>`
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Lit 2.x `@property` decorator | Lit 3.x `static properties` object (no decorators) | Lit 3.0 (2023) | Decorators still available but not used in this codebase; follow `static get properties()` pattern |
| Shadow DOM default | `createRenderRoot()` override | Established in Phase 3 | All components in this project use light DOM |

**Deprecated/outdated:**
- Lit 2.x decorator syntax (`@property()`, `@state()`) — not used in this project; avoid introducing them.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `_renderImageStrip`, `_mutedStyle`, expand/collapse toggle implementations use inline styles | Code Examples | Planner may want a CSS class approach instead — acceptable alternative, no functional risk |
| A2 | Show/hide images toggle uses `<input type="checkbox">` | Architecture Patterns | If `<button aria-pressed>` chosen, implementation changes slightly |
| A3 | Single-class architecture (no sub-elements) | Architecture Patterns | If complexity warrants sub-elements, registration and property passing changes |
| A4 | `species-states.json` loading error silently disables filter | Pattern 3 code | Could show an error message instead — low impact |
| A5 | Image `src` path is `/images/{filename}` | Code Examples / Pattern 6 | Broken images if path wrong — verify against existing species pages |

---

## Open Questions (RESOLVED)

1. **Image path convention**
   - What we know: `taxon.js` stores `filename` only (e.g., `'01.jpg'`); existing species
     factsheet pages presumably load from `/images/`.
   - What's unclear: Is the path `/images/{filename}` or `/images/{species_slug}/{filename}`?
   - Recommendation: Check one live species page's `<img>` tag before implementing. The noscript
     block in `browse/index.njk` gives no image URLs to compare against. Check
     `src/_includes/species.njk` or similar.
   - RESOLVED: Path is `/images/${img.species_slug}/${img.filename}` — verified from `src/species/species.njk` line 48.

2. **`species-states.json` loading state**
   - What we know: D-11 says fetch in `connectedCallback()`; CONTEXT.md leaves UX to discretion.
   - What's unclear: Should the select be disabled with a "Loading..." placeholder while fetching,
     or silently absent?
   - Recommendation: Disable the `<select>` until loaded (`?disabled=${!this._statesAvailable.length}`);
     this is safer than silently omitting the control.
   - RESOLVED: Implement `?disabled=${!this._statesAvailable.length}` — select disabled until fetch completes.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Test runner | ✓ | v22.20.0 [VERIFIED] | — |
| lit | Component base | ✓ | 3.3.2 [VERIFIED] | — |
| `_site/species-states.json` | State filter runtime | ✓ (built) [VERIFIED] | — | Filter disabled on fetch error |
| Pico CSS | Styling | ✓ | 2.1.1 [VERIFIED: package.json] | — |

No missing dependencies.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` (no external runner) [VERIFIED: package.json test script] |
| Config file | None — test files listed explicitly in `package.json` scripts.test |
| Quick run command | `node --test src/components/pnwm-taxon-browser.test.js` |
| Full suite command | `node --test scripts/build-data.test.js scripts/check-page-weight.test.js src/components/*.test.js` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BROWSE-02 | `buildStateMap` correctly indexes species→states | unit | `node --test src/components/pnwm-taxon-browser.test.js` | ❌ Wave 0 |
| BROWSE-03 | `collectSlugs(family)` returns all species slugs in tree | unit | same | ❌ Wave 0 |
| BROWSE-04 | `taxonHasState` returns true when any species has a state record | unit | same | ❌ Wave 0 |
| BROWSE-05 | `taxonHasState` returns false when no species in state | unit | same | ❌ Wave 0 |
| BROWSE-06 | `navImages[]` fallback already verified in Phase 9 tests | — | existing taxon.js tests | ✅ (Phase 9) |
| SFILT-02 | `buildStateMap` + `taxonHasState` combined: muting is correct | unit | same | ❌ Wave 0 |

**Note:** Lit component DOM rendering cannot be tested by the existing `node --test` runner
without a DOM environment (e.g., JSDOM or Playwright). The pattern throughout this project is to
extract pure logic functions and test those, not to test component rendering. Follow the same
pattern: export `buildStateMap`, `taxonHasState`, `collectSlugs` from the component file and
test them in isolation.

### Sampling Rate

- **Per task commit:** `node --test src/components/pnwm-taxon-browser.test.js`
- **Per wave merge:** `node --test scripts/build-data.test.js scripts/check-page-weight.test.js src/components/*.test.js`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/components/pnwm-taxon-browser.test.js` — covers BROWSE-02 through BROWSE-05, SFILT-02
  (pure function unit tests for `buildStateMap`, `taxonHasState`, `collectSlugs`)

*(No framework install needed — `node:test` is built-in to Node 22.)*

---

## Security Domain

No new attack surface introduced. The component:
- Reads data from a same-document `<script type="application/json">` element (no user input,
  no innerHTML)
- Fetches from a same-origin static JSON file
- Renders navImage `src` attributes (filenames from build pipeline, not user input)
- Species links constructed from slugs (build-time values)

No ASVS categories require specific mitigations. All data sources are build-time static assets
controlled by the project maintainer.

---

## Sources

### Primary (HIGH confidence)
- `src/components/pnwm-filter-bar.js` [VERIFIED: codebase] — `<select>` Lit filter pattern,
  `connectedCallback` async loading, `static get properties()` structure
- `src/components/pnwm-occurrence-map.js` [VERIFIED: codebase] — `createRenderRoot()` light DOM
  pattern
- `src/_data/taxon.js` [VERIFIED: codebase] — data shape, `pickNavImages()` fallback logic,
  `navigational` as VARCHAR string
- `_site/species-states.json` [VERIFIED: file read] — flat array of `{species_slug, state}`
- `package.json` [VERIFIED: codebase] — Lit 3.3.2, node:test runner, Node 22
- `src/browse/index.njk` [VERIFIED: codebase] — shell structure, noscript pattern, taxon-data
  script element

### Secondary (MEDIUM confidence)
- Lit 3.x reactive property change detection (new object needed, no mutation) — [ASSUMED: from
  training knowledge of Lit 3 docs; consistent with all existing component code patterns]

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified from package.json and codebase
- Architecture: HIGH — all patterns derived from existing codebase; no invented patterns
- Data shapes: HIGH — verified from live taxon.js output and species-states.json file
- Pitfalls: HIGH — most derived from actual code inspection (navigational VARCHAR, null subfam)
- Test strategy: HIGH — matches existing project pattern exactly

**Research date:** 2026-04-20
**Valid until:** 2026-05-20 (stable stack — Lit 3.x, Node 22, no fast-moving dependencies)
