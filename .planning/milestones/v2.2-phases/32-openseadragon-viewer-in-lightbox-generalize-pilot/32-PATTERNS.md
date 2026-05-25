# Phase 32: OpenSeadragon Viewer in Lightbox (generalize pilot) - Pattern Map

**Mapped:** 2026-05-23
**Files analyzed:** 3 (2 modified, 1 test-augmented)
**Analogs found:** 3 / 3

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/components/pnwm-image-slideshow.js` | component (Lit) | event-driven + request-response | itself (Phase 28 OSD already in-place) | exact — augmenting existing file |
| `src/species/species.njk` | template (SSR) | transform (build-time data → HTML) | itself (Phase 31 guard already in-place) | exact — augmenting existing file |
| `src/components/pnwm-image-slideshow.test.js` | test | unit | itself (5 existing tests) | exact — augmenting existing file |

All three files already exist. Phase 32 adds code within each; no new files are created.

---

## Pattern Assignments

### `src/components/pnwm-image-slideshow.js` (Lit component, event-driven)

**Analog:** itself — the file already contains all structural patterns. Phase 32 adds two methods and extends the lightbox render branch.

**Imports pattern** (lines 1-1):
```javascript
import { LitElement, html, css } from 'lit';
```
No new imports needed. `openseadragon` is already dynamically imported inside `_openLightbox()`.

**Reactive state pattern** (lines 4-15):
```javascript
static properties = {
  slug: { type: String },
  _currentIndex: { state: true },          // shared index for carousel + OSD nav
  _lightboxOpen: { state: true },
  _images: { attribute: false, state: true },
  _stripOverflows: { state: true },
  highResAvailable: { type: Boolean, attribute: 'high-res-available' },
  highResSpecimens: { attribute: 'high-res-specimens' },
  cdnBaseUrl: { type: String, attribute: 'cdn-base-url' },
  prefixUrl: { type: String, attribute: 'prefix-url' },
  _highResSpecimens: { state: true },
};
```
New methods `_prevSpecimen` / `_nextSpecimen` set `this._currentIndex` directly — Lit's reactive state triggers `render()` automatically.

**OSD init pattern** (lines 197-213) — DO NOT change:
```javascript
if (this.highResAvailable && this._highResSpecimens?.length) {
  const viewerEl = this.shadowRoot.querySelector('#osd-viewer');
  if (viewerEl && !this._osdViewer) {
    const { default: OpenSeadragon } = await import('openseadragon');
    const current = this._highResSpecimens[this._currentIndex] ?? this._highResSpecimens[0];
    this._osdViewer = OpenSeadragon({
      element: viewerEl,
      prefixUrl: this.prefixUrl,
      tileSources: this._buildDziUrl(current),
      visibilityRatio: 1.0,
      minZoomLevel: 0.5,
      defaultZoomLevel: 0,
      showNavigator: false,       // black rect due to WebGL CORS — never re-enable
      showRotationControl: false,
    });
  }
}
```

**`_buildDziUrl` pattern** (lines 249-251) — already correct, used by new methods:
```javascript
_buildDziUrl(specimen) {
  return `${this.cdnBaseUrl}/${specimen.tiles_path}/${specimen.specimen_id}-${specimen.view}.dzi`;
}
```

**New methods to add — `_prevSpecimen` / `_nextSpecimen`:**

Place after `_buildDziUrl` (after line 251). Follow the same `this._osdViewer?.method()` optional-chaining style used in `_closeLightbox()` (line 217):
```javascript
_prevSpecimen() {
  this._currentIndex = (this._currentIndex - 1 + this._highResSpecimens.length) % this._highResSpecimens.length;
  this._osdViewer?.open(this._buildDziUrl(this._highResSpecimens[this._currentIndex]));
}

_nextSpecimen() {
  this._currentIndex = (this._currentIndex + 1) % this._highResSpecimens.length;
  this._osdViewer?.open(this._buildDziUrl(this._highResSpecimens[this._currentIndex]));
}
```

**Lightbox render branch — existing OSD block to extend** (lines 276-295):

Current `useOsd` branch (lines 279-287):
```javascript
${useOsd
  ? html`
      <div id="osd-viewer" class="osd-viewer"></div>
      <p class="caption-line">
        Specimen ${currentSpecimen.specimen_id} &middot;
        ${currentSpecimen.view === 'D' ? 'Dorsal' : 'Ventral'}
      </p>
    `
  : html`<img src=${current.src} alt=${current.alt}>`}
```

Add prev/next buttons immediately after the `</p>` caption line, inside the `useOsd` template literal, conditionally on `this._highResSpecimens.length > 1`. Follow the same `@click=${() => this.method()}` pattern used throughout the file (e.g., lines 305, 343):
```javascript
${useOsd && this._highResSpecimens.length > 1 ? html`
  <button class="lightbox-prev" aria-label="Previous specimen"
    @click=${() => this._prevSpecimen()}>&#x276E;</button>
  <button class="lightbox-next" aria-label="Next specimen"
    @click=${() => this._nextSpecimen()}>&#x276F;</button>
` : ''}
```

**Close button — existing pattern to investigate** (lines 78-89, 288-292):

CSS (lines 78-89): `.lightbox-close` is `position: absolute; top: 16px; right: 16px; width: 44px; height: 44px`. It is a sibling of `#osd-viewer` inside the lightbox `div`, not a child of it. Investigation checklist (from RESEARCH.md Pattern 4): confirm OSD canvas does not carry a z-index that exceeds the close button's stacking order within the lightbox's own fixed stacking context. If OSD canvas intercepts pointer events, add `position: relative; z-index: 1` to `.lightbox-close` in the CSS block.

**ResizeObserver guard — MUST NOT break** (lines 157-163):
```javascript
this._resizeObserver = new ResizeObserver(() => {
  const overflows = strip.scrollWidth > strip.clientWidth;
  if (overflows !== this._stripOverflows) {   // guard required — removing causes infinite re-render
    this._stripOverflows = overflows;
  }
});
```
Do not add any unconditional reactive state updates inside this callback.

---

### `src/species/species.njk` (SSR template, build-time transform)

**Analog:** itself — the file already has the guard structure. Phase 32 fills the empty slot left by Phase 31.

**Existing guard to extend** (lines 47-70):

Current structure:
```nunjucks
{% if (not (highResEntry and highResEntry.high_res_available)) and spImages and spImages.length > 0 %}
  {% for img in spImages %}
    <figure>...</figure>   {# low-res figures #}
  {% endfor %}
{% elif not (highResEntry and highResEntry.high_res_available) %}
  <figure>
    <div aria-label="No images available for this species">No photos on file for this species.</div>
  </figure>
{% endif %}
```

The high-res case currently has no `{% elif %}` branch — control falls through to nothing when `highResEntry.high_res_available` is true. Phase 32 inserts the missing branch between the low-res block and the no-photo block:

```nunjucks
{% if (not (highResEntry and highResEntry.high_res_available)) and spImages and spImages.length > 0 %}
  {% for img in spImages %}
    <figure>
      <img src="{{ cdnBaseUrl }}/{{ sp.slug }}/{{ img.filename | urlencode }}"
           alt="{{ sp.genus }} {{ sp.species }}"
           ...existing data-* attributes...>
      <figcaption>{{ img.photographer }}</figcaption>
    </figure>
  {% endfor %}
{% elif highResEntry and highResEntry.high_res_available %}
  {% for specimen in highResEntry.specimens %}
    <figure>
      <img src="{{ cdnBaseUrl }}/{{ specimen.tiles_path }}/{{ specimen.specimen_id }}-{{ specimen.view }}_files/0/0_0.webp"
           alt="{{ sp.genus }} {{ sp.species }}">
      <figcaption>Specimen {{ specimen.specimen_id }} · {{ "Dorsal" if specimen.view == "D" else "Ventral" }}</figcaption>
    </figure>
  {% endfor %}
{% else %}
  <figure>
    <div aria-label="No images available for this species">No photos on file for this species.</div>
  </figure>
{% endif %}
```

Critical ordering constraint (D-03): `{% for specimen in highResEntry.specimens %}` must iterate in the same order as the JSON array — do not sort or reorder. The component's `connectedCallback` at line 109 gathers figures in DOM order via `querySelectorAll(':scope > figure')`, so template render order determines `_images[i]` / `_highResSpecimens[i]` alignment.

**Component attribute pattern** (lines 38-46) — already correct, no change:
```nunjucks
<pnwm-image-slideshow
  slug="{{ sp.slug }}"
  {% if highResEntry and highResEntry.high_res_available %}
  high-res-available
  high-res-specimens="{{ highResEntry.specimens | tojson | escape }}"
  cdn-base-url="{{ cdnBaseUrl }}"
  prefix-url="{{ '/osd-images/' | url }}"
  {% endif %}
  data-pagefind-ignore>
```
The `high-res-specimens` attribute provides `_highResSpecimens[]`; the `{% for %}` loop inside the component element provides `_images[]`. Both use `highResEntry.specimens` order.

---

### `src/components/pnwm-image-slideshow.test.js` (unit tests)

**Analog:** itself — the file already has the test structure. Phase 32 adds Wave 0 gap tests.

**Existing test pattern** (lines 1-60) — copy this structure for new tests:
```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PnwmImageSlideshow } from './pnwm-image-slideshow.js';

describe('_buildDziUrl', () => {
  it('constructs DZI URL from cdnBaseUrl + tiles_path + specimen_id + view', () => {
    const ctx = { cdnBaseUrl: 'https://pnwmoths.b-cdn.net' };
    const specimen = { specimen_id: 'A', view: 'D', tiles_path: 'species-tiles/abagrotis-apposita/A-D' };
    const result = PnwmImageSlideshow.prototype._buildDziUrl.call(ctx, specimen);
    assert.equal(result, 'https://pnwmoths.b-cdn.net/species-tiles/abagrotis-apposita/A-D/A-D.dzi');
  });
});
```

Pattern: call methods directly on `PnwmImageSlideshow.prototype` using `.call(ctx, args)` where `ctx` is a plain object providing only the properties the method reads. No DOM required for pure-logic methods.

New tests to add (Wave 0 gaps from RESEARCH.md):

1. `_prevSpecimen` / `_nextSpecimen` index wrapping (VIEWER-01). The method sets `this._currentIndex` and calls `this._osdViewer?.open(...)`. Provide a stub `_osdViewer` with an `open()` spy or provide `_osdViewer: null` and verify only the index change.

2. `useOsd` false path (VIEWER-02): verify that when `highResAvailable` is false, the low-res render path is taken. Since `render()` requires a real Lit host, test the derived value logic directly: `const useOsd = ctx.highResAvailable && ctx._highResSpecimens?.length > 0; assert.equal(useOsd, false)`.

3. Caption view-to-label mapping (VIEWER-04): construct a scenario like `currentSpecimen.view === 'D'` → `'Dorsal'`, `'V'` → `'Ventral'`. This is inline in the render template; test via the figcaption text in the template output (manual build check) or by replicating the ternary in a unit helper.

---

## Shared Patterns

### Lit reactive state — `_currentIndex` as shared index
**Source:** `src/components/pnwm-image-slideshow.js` lines 6, 95, 167-170
**Apply to:** Both `_prevSpecimen` and `_nextSpecimen`

Setting `this._currentIndex` directly triggers Lit re-render because it is declared `{ state: true }` (line 6). The `updated()` hook at lines 166-171 automatically scrolls the active thumbnail into view on index change. Prev/next in the lightbox therefore automatically syncs the carousel state behind it.

### Optional-chaining call guard — `this._osdViewer?.method()`
**Source:** `src/components/pnwm-image-slideshow.js` line 217
```javascript
this._osdViewer?.destroy();
```
**Apply to:** All calls to `this._osdViewer` in `_prevSpecimen`, `_nextSpecimen`, and `_closeLightbox`. The viewer is null before `_openLightbox()` completes and after `_closeLightbox()` runs. Use `?.` throughout — never assume the viewer is initialized.

### Event handler binding in Lit templates — `@click=${() => this.method()}`
**Source:** `src/components/pnwm-image-slideshow.js` lines 291, 305, 341, 343
```javascript
@click=${() => this._closeLightbox()}
@click=${() => this._openLightbox()}
@click=${() => { this._currentIndex = i; }}
```
**Apply to:** Prev/next button `@click` handlers in the lightbox render branch. Use arrow functions wrapping the method call — this matches every other event handler in the file.

### Nunjucks `{% for %}` loop — preserve data order
**Source:** `src/species/species.njk` lines 48-63 (low-res figures loop)
```nunjucks
{% for img in spImages %}
  <figure>...</figure>
{% endfor %}
```
**Apply to:** New high-res `{% for specimen in highResEntry.specimens %}` loop. Same pattern — iterate the data array directly without sort or reorder. DOM order equals data array order.

### `node:test` unit test structure — prototype-call pattern
**Source:** `src/components/pnwm-image-slideshow.test.js` lines 46-59
```javascript
describe('_buildDziUrl', () => {
  it('...', () => {
    const ctx = { cdnBaseUrl: 'https://pnwmoths.b-cdn.net' };
    const specimen = { ... };
    const result = PnwmImageSlideshow.prototype._buildDziUrl.call(ctx, specimen);
    assert.equal(result, '...');
  });
});
```
**Apply to:** New tests for `_prevSpecimen` / `_nextSpecimen`. Provide a minimal `ctx` object with `_currentIndex`, `_highResSpecimens`, and `_osdViewer: null`. Call the method via `.call(ctx, ...)`, then assert `ctx._currentIndex` changed correctly.

---

## No Analog Found

None. Both files being modified already contain the structural patterns needed. `pnwm-plate-viewer.js` (lines 38-54) confirms the OSD dynamic import + `element` + `prefixUrl` + `tileSources` init pattern but is not needed as a reference since the same pattern is already in `pnwm-image-slideshow.js` lines 200-212.

---

## Metadata

**Analog search scope:** `src/components/`, `src/species/`
**Files read:** 4 (`pnwm-image-slideshow.js`, `species.njk`, `pnwm-image-slideshow.test.js`, `pnwm-plate-viewer.js`)
**Pattern extraction date:** 2026-05-23
