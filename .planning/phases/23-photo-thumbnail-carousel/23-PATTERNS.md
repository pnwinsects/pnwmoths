# Phase 23: Photo Thumbnail Carousel - Pattern Map

**Mapped:** 2026-05-20
**Files analyzed:** 2 (1 modified, 1 new)
**Analogs found:** 2 / 2

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/components/pnwm-image-slideshow.js` | component | event-driven | `src/components/pnwm-image-slideshow.js` (self — existing patterns to preserve) | exact |
| `src/components/pnwm-image-slideshow.test.js` | test | — | `src/components/pnwm-taxon-browser.test.js` | role-match |

---

## Pattern Assignments

### `src/components/pnwm-image-slideshow.js` (Lit component, event-driven)

**Analog:** Self — the file being modified. Patterns to preserve are extracted below from the current file.

**Imports pattern** (lines 1):
```javascript
import { LitElement, html, css } from 'lit';
```

**Reactive properties pattern** (lines 4–9):
```javascript
static properties = {
  slug: { type: String },
  _currentIndex: { state: true },
  _lightboxOpen: { state: true },
  _images: { attribute: false, state: true },
};
```
Add `_stripOverflows: { state: true }` to this block. Prefix underscore signals internal reactive state, not a reflected attribute.

**CSS custom property pattern** (lines 29–31 — existing, shows var usage works in shadow DOM):
```javascript
background: var(--pico-muted-color);
// ...
background: var(--pico-primary);
```
New thumbnail active border uses `var(--pico-primary)` — same pattern, confirmed safe in shadow DOM context.

**Constructor initialization pattern** (lines 62–69):
```javascript
constructor() {
  super();
  this.slug = '';
  this._currentIndex = 0;
  this._lightboxOpen = false;
  this._images = [];
  this._handleKeydown = this._handleKeydown.bind(this);
}
```
Add `this._stripOverflows = false` and `this._resizeObserver = null` here. Note: `_handleKeydown` is explicitly bound here because it is passed to `document.addEventListener` (outside Lit's template system). New arrow-function handlers in templates do NOT need constructor binding.

**Shadow DOM query pattern** (lines 122–125):
```javascript
this.updateComplete.then(() => {
  const closeBtn = this.shadowRoot.querySelector('.lightbox-close');
  if (closeBtn) closeBtn.focus();
});
```
Use `this.shadowRoot.querySelector(...)` for all shadow DOM element access. Never `this.querySelector(...)` for shadow DOM nodes.

**Arrow-function event handler pattern (CORRECT)** (lines 177):
```javascript
@click=${(e) => { if (e.target === e.currentTarget) this._closeLightbox(); }}
```
The backdrop click uses an arrow function — `this` is captured lexically, handler works correctly. All new handlers in templates must follow this pattern.

**Unbound method handler (BROKEN — the bug being fixed)** (line 182):
```javascript
@click=${this._closeLightbox}
```
This is the PHOTO-03 bug. Fix: `@click=${() => this._closeLightbox()}`. The method is not bound in the constructor, so `this` is wrong when the browser invokes it.

**disconnectedCallback cleanup pattern** (lines 103–109):
```javascript
disconnectedCallback() {
  super.disconnectedCallback();
  document.removeEventListener('keydown', this._handleKeydown);
  const main = document.querySelector('main');
  if (main) main.removeAttribute('inert');
}
```
Add `this._resizeObserver?.disconnect()` here using the same optional-chain guard pattern.

**Multi-image render branch (current — to be replaced)** (lines 206–236):
```javascript
// Multiple images — prev/next controls and dots
const dots = this._images.map((_, i) => html`
  <span class="dot ${i === this._currentIndex ? 'active' : ''}"></span>
`);

return html`
  <div role="region" aria-label="Species photos" class="slideshow">
    <div class="slide">
      <img src=${current.src} alt=${current.alt} @click=${this._openLightbox} ...>
      ${this._formatCaption(current).map(line => html`<p class="caption-line">${line}</p>`)}
    </div>
    <div class="controls">
      <button aria-label="Previous photo" @click=${this._prev}>&#x2039;</button>
      <div class="dots">${dots}</div>
      <span class="index-label">${this._currentIndex + 1} of ${this._images.length}</span>
      <button aria-label="Next photo" @click=${this._next}>&#x203a;</button>
    </div>
  </div>
  ${lightbox}
`;
```
Replace: remove `dots` array, `.dots` div, `index-label` span, `_prev`/`_next` method bodies. Replace with thumbnail strip + scroll buttons.

**Image error handler pattern** (lines 197, 218):
```javascript
@error=${(e) => console.error(`[pnwmoths] Image failed to load: ${e.target.src}`)}
```
Preserve on main slide `<img>`. Not needed on thumbnail `<img>` elements (decorative, silent failure acceptable).

---

### `src/components/pnwm-image-slideshow.test.js` (test, pure logic)

**Analog:** `src/components/pnwm-taxon-browser.test.js` — same project, same test runner, same pattern of testing exported pure functions from a JS component file.

**Imports pattern** (lines 1–3 of analog):
```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildStateMap, taxonHasState, collectSlugs } from './pnwm-taxon-browser.js';
```
Apply to test file:
```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { _formatCaption } from './pnwm-image-slideshow.js';
```
Note: `_formatCaption` must be exported from the component file for testability, or the test must instantiate a dummy object. See "No Analog Found" note below.

**Test structure pattern** (`src/components/pnwm-taxon-browser.test.js` lines 1–35):
```javascript
describe('buildStateMap', () => {
  it('returns empty object for empty input', () => {
    assert.deepEqual(buildStateMap([]), {});
  });

  it('indexes a single species-state pair', () => {
    const result = buildStateMap([{ species_slug: 'alpha-beta', state: 'WA' }]);
    assert.ok(result['alpha-beta'] instanceof Set);
    assert.ok(result['alpha-beta'].has('WA'));
  });
  // ...
});
```
One `describe` block per function, multiple `it` blocks per describe.

**Assert style** (consistent across all test files):
- `assert.equal(actual, expected)` for primitives
- `assert.deepEqual(actual, expected)` for arrays/objects
- `assert.ok(condition, message)` for boolean checks with optional message
- `assert.ok(!condition, message)` for negation
- Always `import assert from 'node:assert/strict'` — not the non-strict version

**Test for pure function with multiple outputs** (`src/components/filters.test.js` lines 16–25):
```javascript
it('applies combined filters', () => {
  const result = filterRecords(records, { state: 'WA', recordType: 'specimen', yearMin: 2000, yearMax: 2020 });
  assert.equal(result.length, 1);
  assert.equal(result[0].year, 2010);
});
```
Pattern for `_formatCaption`: call with a fixture image object, assert on returned array elements.

---

## Shared Patterns

### Reactive State Updates (Guard Pattern)
**Source:** RESEARCH.md Pattern 1 (ResizeObserver); consistent with existing `_currentIndex` / `_lightboxOpen` usage throughout `pnwm-image-slideshow.js`
**Apply to:** `firstUpdated()` ResizeObserver callback
```javascript
// Only set if value changed — prevents unnecessary re-renders and re-firing of updated()
const overflows = strip.scrollWidth > strip.clientWidth;
if (overflows !== this._stripOverflows) {
  this._stripOverflows = overflows;
}
```

### Arrow Function Event Handlers in Lit Templates
**Source:** `src/components/pnwm-image-slideshow.js` line 177 (backdrop click handler)
**Apply to:** All new `@click` handlers in the modified render() — scroll buttons, thumbnail clicks, lightbox close button fix
```javascript
// Correct pattern (arrow function captures `this` lexically):
@click=${() => this._closeLightbox()}
@click=${() => { this._currentIndex = i; }}
@click=${() => this._scrollLeft()}
```

### Lit `updateComplete` for Post-Render DOM Access
**Source:** `src/components/pnwm-image-slideshow.js` lines 122–125 (`_openLightbox`)
**Apply to:** Any deferred DOM access after a state change (not needed for ResizeObserver which uses `firstUpdated`, but applicable if scrollIntoView needs delay)
```javascript
this.updateComplete.then(() => {
  const el = this.shadowRoot.querySelector('.some-element');
  if (el) el.someMethod();
});
```

### CSS Custom Properties for Theming
**Source:** `src/components/pnwm-image-slideshow.js` lines 29–31
**Apply to:** Thumbnail active border, thumbnail strip styling
```javascript
// Use var(--pico-primary) for active state colors (confirmed safe in shadow DOM)
border-color: var(--pico-primary);
color: var(--pico-muted-color);
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `_formatCaption` export for testing | utility export | — | `pnwm-image-slideshow.js` does not currently export `_formatCaption` — it is a class method. Tests can invoke it as `instance._formatCaption(img)` using a plain object stub (`{ _formatCaption: PnwmImageSlideshow.prototype._formatCaption }`), or the method can be extracted and exported as a standalone function. The analog test files only test exported module-level functions, not class methods. The planner must decide whether to export `_formatCaption` as a module-level function or test it via instance invocation. |
| `firstUpdated()` / `updated()` Lit lifecycle hooks | component lifecycle | — | No existing component in this codebase uses `firstUpdated()` or `updated()` — these are new lifecycle methods for this project. Pattern comes from RESEARCH.md (Lit official docs) rather than a codebase analog. |

---

## Metadata

**Analog search scope:** `src/components/`, `src/_lib/`
**Files scanned:** 7 (pnwm-image-slideshow.js, filters.test.js, phenology.test.js, pnwm-taxon-browser.test.js, parquet-cache.test.js, glossary-transform.test.js, pnwm-image-slideshow.js self-reference)
**Pattern extraction date:** 2026-05-20
