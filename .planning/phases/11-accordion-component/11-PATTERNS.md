# Phase 11: Accordion Component - Pattern Map

**Mapped:** 2026-04-20
**Files analyzed:** 3 (2 new, 1 modified)
**Analogs found:** 3 / 3

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/components/pnwm-taxon-browser.js` | component | request-response + event-driven | `src/components/pnwm-filter-bar.js` (select/filter) + `src/components/pnwm-occurrence-map.js` (light DOM + async load) | exact (composite) |
| `src/components/pnwm-taxon-browser.test.js` | test | — | `src/components/filters.test.js` | exact |
| `src/components/main.js` | config/registration | — | `src/components/main.js` itself (existing import list) | exact |

---

## Pattern Assignments

### `src/components/pnwm-taxon-browser.js` (component, request-response + event-driven)

**Primary analog:** `src/components/pnwm-filter-bar.js` (select, `static get properties`, `connectedCallback` async load, `_onXChange` handlers)
**Secondary analog:** `src/components/pnwm-occurrence-map.js` (`createRenderRoot()` light DOM, loading state, error handling)

**Imports pattern** (pnwm-occurrence-map.js lines 1-2; pnwm-filter-bar.js line 1):
```javascript
import { LitElement, html } from 'lit';
// Note: no 'css' import — pnwm-taxon-browser uses inline styles only (light DOM, no shadow styles block)
```

**Light DOM override** (pnwm-occurrence-map.js lines 28-31):
```javascript
/** Use light DOM so Pico CSS element selectors apply inside the component */
createRenderRoot() {
  return this;
}
```

**Static properties declaration** (pnwm-filter-bar.js lines 7-17):
```javascript
static get properties() {
  return {
    slug: { type: String },
    _state: { type: String, state: true },
    _recordType: { type: String, state: true },
    _yearMin: { type: Number, state: true },
    _yearMax: { type: Number, state: true },
    _states: { attribute: false, state: true },
    _recordTypes: { attribute: false, state: true },
  };
}
```
For the taxon browser, use `attribute: false` for all Set and array state, `type: Boolean` for `_showImages`, `type: String` for `_selectedState`. No public attributes on the element — all state is internal.

**Constructor defaults** (pnwm-filter-bar.js lines 55-64):
```javascript
constructor() {
  super();
  this.slug = '';
  this._state = 'all';
  this._recordType = 'all';
  this._yearMin = 1900;
  this._yearMax = CURRENT_YEAR;
  this._states = [];
  this._recordTypes = [];
}
```
Pattern: initialize all reactive properties in `constructor()` with empty/default values to avoid `undefined` before first render.

**connectedCallback async load with error swallowing** (pnwm-filter-bar.js lines 66-83):
```javascript
async connectedCallback() {
  super.connectedCallback();
  if (this.slug) {
    try {
      const records = await loadParquet(this.slug);
      const statesSet = new Set();
      const typesSet = new Set();
      for (const r of records) {
        if (r.state) statesSet.add(r.state);
        if (r.record_type) typesSet.add(r.record_type);
      }
      this._states = [...statesSet].sort();
      this._recordTypes = [...typesSet].sort();
    } catch (err) {
      // Leave empty on error — controls still render with "All" options
    }
  }
}
```
Pattern: `super.connectedCallback()` first, guard with `if` before async work, catch all errors silently or with comment explaining graceful degradation. For the taxon browser: sync JSON parse first (no await), then async fetch.

**Select dropdown with `.value` binding and `@change` handler** (pnwm-filter-bar.js lines 133-141):
```javascript
<select
  id="filter-state-${this.slug}"
  .value=${this._state}
  @change=${this._onStateChange}
>
  <option value="all">All states</option>
  ${this._states.map(s => html`<option value=${s} ?selected=${this._state === s}>${s}</option>`)}
</select>
```
Pattern: `.value` property binding (not `value` attribute) to keep select in sync with reactive state. `?selected` for option matching. `@change` pointing to a named handler method.

**Event handler method** (pnwm-filter-bar.js lines 98-101):
```javascript
_onStateChange(e) {
  this._state = e.target.value;
  this._dispatchFilterChange();
}
```
Pattern: `_onXChange(e)` naming, read from `e.target.value`, assign to reactive property to trigger re-render.

**Loading state in render** (pnwm-occurrence-map.js lines 49-56):
```javascript
render() {
  if (this._loading) {
    return html`<div style="min-height:320px;display:flex;align-items:center;justify-content:center"><p style="color:var(--pico-muted-color)">Loading occurrence data...</p></div>`;
  }
  if (this._error) {
    return html`<div style="min-height:320px;display:flex;align-items:center;justify-content:center"><p style="color:var(--pico-del-color)">Could not load occurrence data. Try reloading the page.</p></div>`;
  }
  return html`...`;
}
```
Pattern: check loading/error state at top of `render()` and return early. Uses `var(--pico-muted-color)` and `var(--pico-del-color)` tokens for loading/error text — copy these token names exactly.

**customElements.define call** (pnwm-filter-bar.js line 190; pnwm-occurrence-map.js line 145):
```javascript
customElements.define('pnwm-taxon-browser', PnwmTaxonBrowser);
```
Pattern: one `customElements.define` at the end of the file, after the class declaration.

**Expand/collapse Set mutation — use new Set, not mutation** (pattern from RESEARCH.md Pitfall 6, consistent with all Lit 3.x reactive property usage in this codebase):
```javascript
// Wrong — Lit sees same object reference, no re-render:
this._expandedFamilies.add(name);

// Correct — new Set triggers Lit change detection:
this._expandedFamilies = new Set([...this._expandedFamilies, name]);
// Remove:
this._expandedFamilies = new Set([...this._expandedFamilies].filter(n => n !== name));
```

**Null-subfamily guard** (browse/index.njk lines 18-20):
```nunjucks
{% if subfam.name %}
  <h3>{{ subfam.name }}</h3>
{% endif %}
```
In the Lit component, use: `subfam.name ? html`<h3>${subfam.name}</h3>` : html```.

**Species link pattern** (browse/index.njk line 25):
```nunjucks
<a href="{{ ('/species/' + sp.slug + '/') | url }}">
```
In the Lit component: `html`<a href="/species/${sp.slug}/">`

---

### `src/components/pnwm-taxon-browser.test.js` (test, pure function unit tests)

**Analog:** `src/components/filters.test.js` (exact match — same framework, same pattern)

**Full test file structure** (filters.test.js lines 1-4):
```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { filterRecords } from './parquet-cache.js';
```
Pattern: import `describe` and `it` from `node:test`; import `assert` from `node:assert/strict` (strict mode matters for `deepEqual`); import named exports from the module under test using a relative path.

**describe/it block structure** (filters.test.js lines 5-25):
```javascript
describe('filterRecords edge cases', () => {
  const records = [ /* shared fixture */ ];

  it('applies combined filters (state + recordType + year range simultaneously)', () => {
    const result = filterRecords(records, { ... });
    assert.equal(result.length, 1);
    assert.equal(result[0].year, 2010);
  });

  it('handles records with null year when yearMin is set', () => {
    // ... inline comment explaining JS coercion behavior
  });
});
```
Pattern: one top-level `describe` per logical group, `it` strings describe behavior not implementation, inline comments explain surprising JS behavior, shared fixture data defined at `describe` scope.

**assert methods in use** (filters.test.js, phenology.test.js):
- `assert.equal(actual, expected)` — for primitives
- `assert.deepEqual(actual, expected)` — for arrays/objects
- `assert.ok(condition)` — for boolean predicates

For `pnwm-taxon-browser.test.js`, test the three exported pure functions: `buildStateMap`, `taxonHasState`, `collectSlugs`. Import pattern:
```javascript
import { buildStateMap, taxonHasState, collectSlugs } from './pnwm-taxon-browser.js';
```

---

### `src/components/main.js` (config, registration)

**Analog:** `src/components/main.js` itself (current state, lines 1-4):
```javascript
import './pnwm-occurrence-map.js';
import './pnwm-phenology-chart.js';
import './pnwm-filter-bar.js';
import './pnwm-image-slideshow.js';
```
Pattern: side-effect-only imports (no named imports), one per line, relative path with `./` prefix, alphabetical order is not enforced — append at end. Add:
```javascript
import './pnwm-taxon-browser.js';
```

---

## Shared Patterns

### Pico CSS color tokens
**Source:** `src/components/pnwm-occurrence-map.js` lines 51, 54
**Apply to:** Any loading/error states in `pnwm-taxon-browser.js`
```javascript
style="color:var(--pico-muted-color)"   // loading states, disabled controls
style="color:var(--pico-del-color)"     // error states
```

### Inline styles for structural layout
**Source:** `src/components/pnwm-occurrence-map.js` lines 51, 54, 56
**Apply to:** All structural layout in `pnwm-taxon-browser.js`

Pattern: this project uses inline styles for component-specific structural CSS rather than a `<style>` block inside light DOM components. This avoids class name collisions with Pico and `theme.css`. Use specific class names like `.pnwm-tb-*` if reuse is needed, but prefer inline styles for one-off layout rules.

### Error swallowing in connectedCallback
**Source:** `src/components/pnwm-filter-bar.js` lines 78-81
**Apply to:** `connectedCallback` in `pnwm-taxon-browser.js` for the `fetch('/species-states.json')` call
```javascript
} catch (err) {
  // Leave empty on error — controls still render with "All" options
}
```
Pattern: swallow async data fetch errors with a comment; don't surface them to the user when graceful degradation is acceptable (filter simply stays disabled).

### customElements.define at end of file
**Source:** `src/components/pnwm-filter-bar.js` line 190; `src/components/pnwm-occurrence-map.js` line 145
**Apply to:** `pnwm-taxon-browser.js`
```javascript
customElements.define('pnwm-taxon-browser', PnwmTaxonBrowser);
```
Always the last line of the component file. No export of the class.

---

## No Analog Found

All files have analogs. No new libraries, frameworks, or patterns without precedent are introduced.

---

## Metadata

**Analog search scope:** `src/components/`, `src/browse/`, test files in `src/components/` and `scripts/`
**Files read:** 8 (pnwm-filter-bar.js, pnwm-occurrence-map.js, main.js, filters.test.js, phenology.test.js, browse/index.njk, 11-CONTEXT.md, 11-RESEARCH.md)
**Pattern extraction date:** 2026-04-20
