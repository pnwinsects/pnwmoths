# Phase 32: OpenSeadragon Viewer in Lightbox (generalize pilot) - Research

**Researched:** 2026-05-23
**Domain:** Lit web components, OpenSeadragon DZI, Nunjucks templates
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01 (figures for high-res species):** For high-res species, the template renders one `<figure>` per specimen inside `<pnwm-image-slideshow>`. Image src: `{cdnBaseUrl}/{tiles_path}/{specimen_id}-{view}_files/0/0_0.webp`. The `<pnwm-image-slideshow>` component picks these up via its existing `querySelectorAll(':scope > figure')` in `connectedCallback` — no new component rendering logic needed.
- **D-02 (figcaption format):** `Specimen {specimen_id} · {Dorsal|Ventral}` (e.g., "Specimen A · Dorsal"). Visible to no-JS users; picked up by the component's caption rendering.
- **D-03 (figure order matches specimens order):** Figures rendered in same order as `highResEntry.specimens` so `_images[_currentIndex]` aligns with `_highResSpecimens[_currentIndex]`.
- **D-04 (thumbnail images):** DZI level-0 tile URLs from `_images[i].src` are used for carousel thumbnails. No text label on thumbnail buttons.
- **D-05 (thumbnail error fallback):** `onerror` sets a gray placeholder background when the level-0 tile fails to load.
- **D-06 (main slide):** The main slide shows the level-0 tile at full carousel width — same URL as the thumbnail. Clicking it opens the OSD lightbox for that specimen.
- **D-07 (in-lightbox prev/next buttons):** When `useOsd && _highResSpecimens.length > 1`, render prev/next arrow buttons inside the lightbox. Clicking prev/next increments `_currentIndex` (wrapping), then calls `viewer.open(this._buildDziUrl(this._highResSpecimens[_currentIndex]))`. Zoom/pan resets on open (OSD default).
- **D-08 (viewer.open swap):** No destroy/recreate on specimen switch — `viewer.open(newTileSource)` is sufficient. Viewer is still destroyed in `_closeLightbox()` as before.
- **D-09 (specimen caption in lightbox):** The existing caption line ("Specimen {id} · Dorsal/Ventral") updates reactively with `_currentIndex`. Already implemented from Phase 28 — no change needed.
- **D-10 (no pilot filter to remove):** Phase 28 added no species-specific filter. Success criterion 5 is already satisfied.
- **Close button investigation (folded from Phase 23):** Inspect click handler, z-index, focus trap, and Lit shadow DOM event propagation. No visual change to button spec.

### Claude's Discretion

- Exact CSS positioning for in-lightbox prev/next buttons (vertically centered left/right of OSD viewer)
- How to wire the `onerror` placeholder background (inline style vs. class toggle)
- Test coverage scope for `_buildDziUrl` (already tested), new prev/next navigation logic, and template rendering

### Deferred Ideas (OUT OF SCOPE)

- Per-specimen keyboard navigation in OSD (arrow keys to cycle specimens)
- Smooth OSD transition / cross-fade between specimens
- "Migrate Pagefind to Component UI" — unrelated, not in scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VIEWER-01 | When `high_res_available` is true, the Phase 23 lightbox hosts an OSD instance loading the photo's DZI tiles instead of the static `<img>` render | Template `{% elif %}` branch (D-01) feeds `<figure>` elements; component's existing `_openLightbox()` with `highResAvailable` flag initializes OSD |
| VIEWER-02 | When `high_res_available` is false, the lightbox falls back to the existing static `<img>` behavior with no regression | Existing Phase 23 template branch (no-high-res path) is unchanged; component renders static img when `useOsd` is false |
| VIEWER-03 | The Phase 23 thumbnail carousel is unchanged — same hover, click, keyboard, and touch behavior; OSD only swaps into the lightbox layer | Carousel code is untouched; only the lightbox `render()` branch changes and new prev/next buttons are added inside the lightbox |
| VIEWER-04 | OSD viewer surfaces specimen metadata (`specimen_id`, `view`) inline so curator/visitor can tell which physical specimen is being viewed | Existing `.caption-line` in lightbox template (`currentSpecimen.specimen_id`, `currentSpecimen.view`) already handles this; prev/next updates `_currentIndex` which drives the reactive caption |
</phase_requirements>

---

## Summary

Phase 32 is a focused generalization pass on the Phase 28 pilot. The Phase 28 OSD lightbox already works for the one hand-edited species (`abagrotis-apposita`). Phase 32's scope is: (1) add `<figure>` elements to `species.njk` for all high-res species via a new `{% elif %}` branch, and (2) add in-lightbox prev/next specimen navigation buttons to `pnwm-image-slideshow.js`. The close button investigation is also folded in.

No new packages are required — `openseadragon@6.0.2` and `lit@3.3.2` are already installed and confirmed working. The OSD `viewer.open(url)` API is the swap mechanism for multi-specimen navigation. The template's existing `{% if (not highRes) %}` / `{% elif (not highRes) %}` structure needs a new `{% elif highRes %}` branch to fill the currently-empty slot for high-res species.

The critical implementation risk is the `_images[]` / `_highResSpecimens[]` index alignment: the template must render figures in the exact same order as `highResEntry.specimens` so that `_images[_currentIndex]` and `_highResSpecimens[_currentIndex]` point to the same specimen. The existing `connectedCallback` gathers figures in DOM order — template render order must match specimen array order.

**Primary recommendation:** Implement in two discrete changes — template `{% elif %}` branch first (verifiable with `npm run build:eleventy`), then component prev/next logic.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| High-res `<figure>` generation | Frontend Server (SSR / Eleventy template) | — | Build-time Nunjucks rendering from `speciesPhotos` data; no runtime logic involved |
| Carousel thumbnail rendering | Browser / Client (Lit component) | — | Component reads `_images[]` from light DOM and renders thumbnail strip in shadow DOM |
| OSD viewer initialization | Browser / Client (Lit component) | CDN (bunny.net) | Component dynamically imports OSD; tiles served from bunny.net Pull Zone |
| Specimen navigation (prev/next) | Browser / Client (Lit component) | — | `viewer.open()` called with new DZI URL; `_currentIndex` is Lit reactive state |
| No-JS fallback | Frontend Server (SSR) | — | Static `<figure>/<img>` elements in light DOM visible before JS component runs |
| Focus trap | Browser / Client (Lit component) | — | Sibling-walk `inert` pattern already in `_openLightbox()` |

---

## Standard Stack

### Core (already installed — no new installs required)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| openseadragon | 6.0.2 | DZI pan/zoom viewer inside lightbox | Already in use from Phase 28; `viewer.open()` for specimen swap [VERIFIED: npm registry] |
| lit | 3.3.2 | Web component framework for `pnwm-image-slideshow` | Already in use; reactive `_currentIndex` state drives UI updates [VERIFIED: npm registry] |

No new packages are installed in this phase.

### Package Legitimacy Audit

No new packages to install. Existing `openseadragon@6.0.2` and `lit@3.3.2` are already in `node_modules` and confirmed working from Phase 28 pilot.

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
species.njk (build time)
  → reads speciesPhotos[sp.slug] from data/species-photos.json
  → if high_res_available:
      renders high-res-specimens attr + N <figure> elements (level-0 DZI tiles as <img>)
  → if not high_res_available + spImages:
      renders existing low-res <figure> elements (unchanged)
  → else:
      renders no-photo <figure> (unchanged)

pnwm-image-slideshow (runtime, Lit)
  connectedCallback()
    → querySelectorAll(':scope > figure') → _images[] (src, alt, photographer)
    → JSON.parse(high-res-specimens attr) → _highResSpecimens[]
  render()
    → _images.length === 0 → <slot> fallback
    → _images.length === 1 → single-image layout (no thumbnails)
    → _images.length > 1  → main slide + thumbnail strip + scroll controls
    → _lightboxOpen:
        useOsd=true  → #osd-viewer div + caption-line + (if >1 specimen) prev/next buttons + close button
        useOsd=false → static <img> + close button
  _openLightbox()
    → set _lightboxOpen = true
    → sibling-walk inert (focus trap)
    → await updateComplete → focus close button
    → dynamic import('openseadragon')
    → OpenSeadragon({ element: #osd-viewer, tileSources: _buildDziUrl(currentSpecimen) })
  prev/next click (NEW in Phase 32)
    → _currentIndex = (_currentIndex +/- 1 + len) % len
    → viewer.open(_buildDziUrl(_highResSpecimens[_currentIndex]))
  _closeLightbox()
    → viewer.destroy() + null
    → _lightboxOpen = false
    → remove inert from sibling elements

bunny.net CDN
  → serves .dzi descriptor + tile pyramid (_files/N/X_Y.webp)
  → CORS enabled (Pull Zone "Enable CORS Headers" + dzi/webp extensions)
```

### Recommended Project Structure (no change)

```
src/
├── species/
│   └── species.njk          # template — add {% elif %} branch for high-res figures
└── components/
    └── pnwm-image-slideshow.js  # Lit component — add prev/next, fix close button
```

### Pattern 1: Template `{% elif %}` Branch for High-Res Figures

**What:** Replace the currently-empty high-res slot with `<figure>` per specimen.
**When to use:** This is the only template pattern for Phase 32.

```nunjucks
{# Source: species.njk — replaces the empty high-res slot #}
{% if (not (highResEntry and highResEntry.high_res_available)) and spImages and spImages.length > 0 %}
  {# ... existing low-res figures ... #}
{% elif highResEntry and highResEntry.high_res_available %}
  {% for specimen in highResEntry.specimens %}
    <figure>
      <img src="{{ cdnBaseUrl }}/{{ specimen.tiles_path }}/{{ specimen.specimen_id }}-{{ specimen.view }}_files/0/0_0.webp"
           alt="{{ sp.genus }} {{ sp.species }}">
      <figcaption>Specimen {{ specimen.specimen_id }} · {{ "Dorsal" if specimen.view == "D" else "Ventral" }}</figcaption>
    </figure>
  {% endfor %}
{% else %}
  {# ... existing no-photo figure ... #}
{% endif %}
```

**Critical:** Figure order must match `highResEntry.specimens` array order — the `{% for %}` loop preserves this automatically.

### Pattern 2: In-Lightbox Prev/Next via `viewer.open()`

**What:** Swap DZI tile sources without destroying the viewer instance.
**When to use:** When `useOsd && _highResSpecimens.length > 1` and user clicks prev/next.

```javascript
// Source: pnwm-image-slideshow.js — add to lightbox render branch
_prevSpecimen() {
  this._currentIndex = (this._currentIndex - 1 + this._highResSpecimens.length) % this._highResSpecimens.length;
  this._osdViewer?.open(this._buildDziUrl(this._highResSpecimens[this._currentIndex]));
}

_nextSpecimen() {
  this._currentIndex = (this._currentIndex + 1) % this._highResSpecimens.length;
  this._osdViewer?.open(this._buildDziUrl(this._highResSpecimens[this._currentIndex]));
}
```

Lightbox render branch addition (inside the `useOsd` block):

```javascript
// Source: pnwm-image-slideshow.js — inside lightbox html template literal
${useOsd && this._highResSpecimens.length > 1 ? html`
  <button class="lightbox-prev" aria-label="Previous specimen"
    @click=${() => this._prevSpecimen()}>&#x276E;</button>
  <button class="lightbox-next" aria-label="Next specimen"
    @click=${() => this._nextSpecimen()}>&#x276F;</button>
` : ''}
```

### Pattern 3: `viewer.open()` API (confirmed in Phase 28)

**What:** Pass a DZI URL string directly — OSD auto-detects format from `.dzi` extension.
**Confirmed behavior:** Zoom/pan resets to `defaultZoomLevel: 0` on `open()` call — same behavior as initialization.

```javascript
// Source: PILOT-LESSONS.md — confirmed correct
viewer.open('https://pnwmoths.b-cdn.net/species-tiles/abagrotis-apposita/A-D/A-D.dzi');
```

### Pattern 4: Close Button Investigation

**What exists:** `.lightbox-close` button with `position: absolute; top: 16px; right: 16px; width: 44px; height: 44px` and `@click=${() => this._closeLightbox()}`.
**Investigation checklist:**
1. Verify the button is in the correct stacking context — the lightbox `div` is `position: fixed; z-index: 9000`; the close button is `position: absolute` within it. OSD injects its own canvas element inside `#osd-viewer`; confirm OSD canvas does not overlay the close button area.
2. Confirm OSD does not set `pointer-events: none` on ancestor elements — OSD's internal event handlers use the `#osd-viewer` element boundary.
3. If close button is behind OSD canvas: add `position: relative; z-index: 1` to `.lightbox-close` within the lightbox stacking context, or restructure the lightbox HTML so the close button is a sibling of (not inside) `#osd-viewer`.
4. Check that `focusTrap` / `inert` sibling walk does not affect the close button — the button is in the shadow DOM, which is not inerting itself.

### Anti-Patterns to Avoid

- **Destroy/recreate viewer on specimen switch:** `viewer.destroy()` tears down WebGL context and DOM elements; `viewer.open(url)` is the correct API for source swap. Only destroy in `_closeLightbox()`.
- **Adding `_highResSpecimens` sync to ResizeObserver callback:** Any unconditional reactive state set inside ResizeObserver causes infinite Lit re-render loop. The existing guard `if (overflows !== this._stripOverflows)` must not be broken.
- **Rendering high-res and low-res figures simultaneously:** The `{% elif %}` branch in the template must be mutually exclusive with the low-res branch — the `{% if (not highRes) %}` condition already enforces this; the new `{% elif highRes %}` branch simply fills the previously-empty slot.
- **Re-enabling `showNavigator`:** The Phase 28 pilot confirmed that `showNavigator: true` renders a black rectangle due to WebGL CORS texture compositing issues. Keep `showNavigator: false`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| DZI tile source swapping | Custom tile loader or destroy/recreate loop | `viewer.open(dziUrl)` | OSD `open()` handles tile cache, zoom reset, and canvas reuse; destroy/recreate leaks WebGL contexts |
| Focus trap | Custom event capture / modal overlay hack | Sibling-walk `inert` (already implemented) | Native `inert` propagates to all descendants including shadow DOM children; custom capture misses OSD's internal event listeners |
| OSD instance management | Multiple viewer instances (one per specimen) | Single viewer + `viewer.open()` | One OSD instance per lightbox open; multiple instances cause WebGL context limit errors |

**Key insight:** OSD's `viewer.open()` is designed exactly for this use case — swapping tile sources on an existing viewer. The viewer retains its canvas and WebGL state while loading a new pyramid.

---

## Runtime State Inventory

Step 2.5 SKIPPED — this is not a rename/refactor/migration phase.

---

## Environment Availability Audit

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| openseadragon (npm) | OSD viewer | Yes | 6.0.2 | — |
| lit (npm) | Lit component | Yes | 3.3.2 | — |
| Node.js | Build + tests | Yes | 24.15.0 | — |
| bunny.net CDN (CORS) | DZI tile serving | Yes (configured Phase 28) | — | — |

**Missing dependencies with no fallback:** none.

---

## Common Pitfalls

### Pitfall 1: `_images[]` / `_highResSpecimens[]` Index Misalignment

**What goes wrong:** Clicking "Next specimen" in the lightbox shows the wrong caption or loads the wrong DZI URL because `_images[i]` (from light DOM figures) and `_highResSpecimens[i]` (from JSON attribute) are out of sync.
**Why it happens:** Template renders figures in a different order than `highResEntry.specimens` array; or the `connectedCallback` gathers figures in a different order than JSON parse.
**How to avoid:** D-03 mandates the `{% for specimen in highResEntry.specimens %}` loop order matches the JSON attribute order. No sort or reorder at any layer.
**Warning signs:** Caption shows "Specimen A · Dorsal" while OSD loads the Ventral DZI, or vice versa.

### Pitfall 2: OSD Canvas Overlaying the Close Button

**What goes wrong:** Close button is visually present but unclickable — clicks are captured by OSD's internal event listener on the canvas.
**Why it happens:** OSD sets its canvas to cover the full `#osd-viewer` element; if the close button is positioned within the same stacking context and OSD's canvas has a higher effective z-index, pointer events don't reach the button.
**How to avoid:** Confirm `.lightbox-close` has a `z-index` value that places it above OSD's canvas. The lightbox `div` is already `z-index: 9000`; a `z-index: 1` on `.lightbox-close` relative to the lightbox's stacking context should be sufficient. Alternatively, ensure the close button is outside the `#osd-viewer` element in the HTML structure (it already is in the current template — `#osd-viewer` is a sibling, not a parent of `.lightbox-close`).
**Warning signs:** Click events fire only when clicking the very edge of the close button, or not at all.

### Pitfall 3: `viewer.open()` Called Before Viewer Is Initialized

**What goes wrong:** `_prevSpecimen()` or `_nextSpecimen()` is called while the lightbox is opening (before `_openLightbox()` awaits `updateComplete`), resulting in `this._osdViewer` being null.
**Why it happens:** The OSD viewer is initialized asynchronously in `_openLightbox()`. If the user rapidly clicks prev/next before initialization completes, `_osdViewer` is still null.
**How to avoid:** Use optional chaining `this._osdViewer?.open(...)` — already the pattern for `_closeLightbox()`. The null-safe call simply no-ops during initialization. Alternatively, disable the prev/next buttons until `_osdViewer` is non-null.
**Warning signs:** TypeError in console: "Cannot read properties of null (reading 'open')".

### Pitfall 4: Level-0 Tile URL Not Found

**What goes wrong:** Carousel thumbnails show as gray boxes because the level-0 tile path is wrong.
**Why it happens:** Level-0 tile is at `_files/0/0_0.webp` relative to the tile pyramid root. The path convention is `${tiles_path}/${specimen_id}-${view}_files/0/0_0.webp`, NOT `${specimen_id}-${view}.dzi_files/0/0_0.webp`.
**How to avoid:** The CONTEXT.md D-01 and code context confirm the correct pattern: `${cdnBaseUrl}/${specimen.tiles_path}/${specimen.specimen_id}-${specimen.view}_files/0/0_0.webp`. The `tiles_path` from `species-photos.json` already includes `species-tiles/{slug}/{specimen_id}-{view}` — append `/{specimen_id}-{view}_files/0/0_0.webp` to complete the URL.
**Warning signs:** 404 in Network tab for `*_files/0/0_0.webp`; `onerror` gray placeholder appears on all thumbnails.

### Pitfall 5: `viewer.open()` Zoom Behavior on Specimen Switch

**What goes wrong:** After switching specimens, the viewer stays zoomed into an arbitrary region of the new image rather than resetting to the fit-all view.
**Why it happens:** `viewer.open()` does reset zoom/pan to `defaultZoomLevel` by default. If the viewer was initialized with `defaultZoomLevel: 0` (fit-all), switching specimens will correctly fit the new image. This is correct behavior — documented in PILOT-LESSONS.md.
**How to avoid:** No action needed. Confirm `defaultZoomLevel: 0` is in the OSD init config (it already is from Phase 28).
**Warning signs:** Would only occur if someone changed `defaultZoomLevel` — currently not a risk.

---

## Code Examples

### Level-0 DZI Tile URL Construction

```javascript
// Source: CONTEXT.md D-01 and code_context — confirmed correct
// tiles_path from species-photos.json is already "species-tiles/{slug}/{specimen_id}-{view}"
const level0Url = `${this.cdnBaseUrl}/${specimen.tiles_path}/${specimen.specimen_id}-${specimen.view}_files/0/0_0.webp`;
// Example: https://pnwmoths.b-cdn.net/species-tiles/abagrotis-apposita/A-D/A-D_files/0/0_0.webp
```

### `_buildDziUrl()` (existing, confirmed correct in tests)

```javascript
// Source: pnwm-image-slideshow.test.js (verified working)
_buildDziUrl(specimen) {
  return `${this.cdnBaseUrl}/${specimen.tiles_path}/${specimen.specimen_id}-${specimen.view}.dzi`;
}
// Example: https://pnwmoths.b-cdn.net/species-tiles/abagrotis-apposita/A-D/A-D.dzi
```

### OSD Init Config (Phase 28 confirmed)

```javascript
// Source: PILOT-LESSONS.md — all config values empirically validated
this._osdViewer = OpenSeadragon({
  element: viewerEl,
  prefixUrl: this.prefixUrl,      // '/osd-images/' — OSD control icon path
  tileSources: this._buildDziUrl(current),
  visibilityRatio: 1.0,
  minZoomLevel: 0.5,
  defaultZoomLevel: 0,            // fit-all on open; also resets on viewer.open()
  showNavigator: false,           // black rectangle due to WebGL CORS — do not re-enable
  showRotationControl: false,
});
```

### Lit Reactive State for Prev/Next

```javascript
// Source: existing pnwm-image-slideshow.js pattern — _currentIndex is already reactive state
// Setting _currentIndex triggers render(); the caption-line and specimen vars update automatically
_prevSpecimen() {
  this._currentIndex = (this._currentIndex - 1 + this._highResSpecimens.length) % this._highResSpecimens.length;
  this._osdViewer?.open(this._buildDziUrl(this._highResSpecimens[this._currentIndex]));
}

_nextSpecimen() {
  this._currentIndex = (this._currentIndex + 1) % this._highResSpecimens.length;
  this._osdViewer?.open(this._buildDziUrl(this._highResSpecimens[this._currentIndex]));
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| One hard-coded pilot species for OSD | `speciesPhotos[sp.slug]` covers all species generically | Phase 32 (this phase) | OSD coverage automatically expands as `photos:materialize` adds more entries to `data/species-photos.json` |
| Empty slot for high-res species in template | `{% elif %}` branch renders `<figure>` per specimen | Phase 32 (this phase) | Carousel and no-JS fallback work for all high-res species |
| Single-specimen OSD lightbox | Multi-specimen lightbox with in-lightbox prev/next | Phase 32 (this phase) | Species with multiple specimens (D + V) navigable without closing/reopening |

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` + `node:assert/strict` |
| Config file | none — tests listed explicitly in `package.json` `test` script |
| Quick run command | `node --test src/components/pnwm-image-slideshow.test.js` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VIEWER-01 | `_buildDziUrl` constructs correct DZI URL for high-res specimen | unit | `node --test src/components/pnwm-image-slideshow.test.js` | Yes (2 tests already in file) |
| VIEWER-01 | `_prevSpecimen` / `_nextSpecimen` update `_currentIndex` with wrapping | unit | `node --test src/components/pnwm-image-slideshow.test.js` | No — Wave 0 gap |
| VIEWER-02 | Low-res species path: `useOsd` is false when `highResAvailable` is false | unit | `node --test src/components/pnwm-image-slideshow.test.js` | No — Wave 0 gap |
| VIEWER-03 | Carousel `_images` population from light DOM figures — `connectedCallback` behavior | unit | `node --test src/components/pnwm-image-slideshow.test.js` | No — Wave 0 gap |
| VIEWER-04 | Caption line formats "Specimen {id} · Dorsal/Ventral" from `view: 'D'/'V'` | unit | `node --test src/components/pnwm-image-slideshow.test.js` | No — Wave 0 gap |

**Note:** Nunjucks template output (the `{% elif %}` branch) cannot be tested with `node:test` alone — template output is verified by building the site (`npm run build:eleventy`) and inspecting generated HTML. This is a manual-only verification step for the template change.

### Sampling Rate

- **Per task commit:** `node --test src/components/pnwm-image-slideshow.test.js`
- **Per wave merge:** `npm test`
- **Phase gate:** `npm test` green + `npm run build:eleventy` succeeds before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/components/pnwm-image-slideshow.test.js` — add tests for:
  - `_prevSpecimen` / `_nextSpecimen` index wrapping logic (unit, no DOM needed)
  - `useOsd` false path (low-res: `highResAvailable = false`)
  - Caption view-to-label mapping (`'D'` → `'Dorsal'`, `'V'` → `'Ventral'`)

*(Existing `_buildDziUrl` and `_formatCaption` tests already pass — no changes needed there)*

---

## Security Domain

No new authentication, session management, access control, or cryptography concerns introduced in this phase. The phase modifies static HTML templates and a client-side web component.

Input validation: `highResEntry.specimens` data comes from `data/species-photos.json` which is a build-time artifact generated from the operator-controlled manifest — not from user input. No ASVS V5 (input validation) gate applies at runtime.

---

## Sources

### Primary (HIGH confidence)

- `src/components/pnwm-image-slideshow.js` — full component source read; existing OSD init, `_buildDziUrl`, `_openLightbox`, `_closeLightbox`, `connectedCallback` patterns confirmed [VERIFIED: direct codebase read]
- `src/species/species.njk` — template branch structure confirmed; existing `{% if (not highRes) %}` / `{% elif (not highRes) %}` structure; Phase 32 needs a new `{% elif highRes %}` branch [VERIFIED: direct codebase read]
- `.planning/phases/28-end-to-end-vertical-slice-pilot-one-species/PILOT-LESSONS.md` — empirical OSD config values, CORS status, `showNavigator: false` decision, `viewer.open()` confirmed [VERIFIED: direct codebase read]
- `.planning/phases/32-openseadragon-viewer-in-lightbox-generalize-pilot/32-CONTEXT.md` — all locked decisions D-01 through D-10 [VERIFIED: direct codebase read]
- `src/components/pnwm-image-slideshow.test.js` — existing test coverage scope confirmed; Wave 0 gaps identified [VERIFIED: direct codebase read]
- `data/species-photos.json` — data shape confirmed: `{high_res_available: bool, specimens: [{specimen_id, view, tiles_path}]}` [VERIFIED: direct codebase read]
- `npm view openseadragon version` — 6.0.2, published 2026-03-13 [VERIFIED: npm registry]

### Secondary (MEDIUM confidence)

- OpenSeadragon `viewer.open()` API behavior (zoom reset on `open()`, string URL form for DZI) — confirmed by PILOT-LESSONS.md empirical test; consistent with OpenSeadragon 6.x documentation patterns [ASSUMED from training + PILOT-LESSONS.md empirical confirmation]

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `viewer.open(url)` resets zoom/pan to `defaultZoomLevel` on call | Code Examples | Viewer stays zoomed into previous specimen region on switch — cosmetically jarring but not broken |
| A2 | OSD canvas does not intercept pointer events on `.lightbox-close` in the current layout (button is sibling of, not inside, `#osd-viewer`) | Common Pitfalls #2 | Close button non-functional — requires z-index fix |

---

## Open Questions (RESOLVED)

1. **Close button failure mode (Phase 23 todo) — investigation deferred to execution; z-index fix applied speculatively based on HTML stacking analysis; live test required during Plan 32-02 Task 2**
   - **Static analysis findings (2026-05-23):** Direct read of `src/components/pnwm-image-slideshow.js` confirms the HTML stacking layout:
     - `.lightbox` (lines 64-72) is `position: fixed; inset: 0; z-index: 9000` — establishes a new stacking context.
     - `.lightbox-close` (lines 78-89) is `position: absolute` with NO `z-index` declared.
     - `.osd-viewer` / `#osd-viewer` (lines 58-63, render line 281) has NO explicit `position` or `z-index`.
     - In the lightbox `html` template (lines 276-295), `<div id="osd-viewer">` is rendered BEFORE `<button class="lightbox-close">`. The close button is a flex sibling of `#osd-viewer`, NOT a descendant of it — so it is already structurally outside OSD's element boundary.
   - **Confirmed hypothesis (high-confidence inference, low-confidence runtime confirmation):** OpenSeadragon's `OpenSeadragon({ element: viewerEl, ... })` call (lines 200-211) attaches a `<canvas>` (and overlay `<div>` siblings) INSIDE `viewerEl` (`#osd-viewer`). OSD's injected elements are `position: absolute` within `#osd-viewer` with implicit auto z-index. Because positioned siblings without explicit `z-index` paint in DOM order, `.lightbox-close` (later in DOM) SHOULD paint visually above OSD's canvas — but OSD also attaches a `mousetracker` event listener to its canvas that aggressively captures pointer events across the full canvas extent. When the close button has no `z-index` and OSD's canvas establishes its own positioning context, the canvas's event listener may swallow `click` events that geometrically intersect the canvas region (top-right corner where the close button sits, since OSD's canvas spans the full 90vw × 70vh `.osd-viewer` element).
   - **Why we cannot fully confirm from static analysis alone:** Determining whether the failure is (a) a paint-order issue (visually occluded) or (b) a pointer-events capture issue (visually correct but unclickable) requires runtime DevTools inspection of OSD's injected DOM and an actual click test in the browser. The Phase 28 pilot page at `_site/species/abagrotis-apposita/index.html` exists as a build artifact but Phase 28 is `Planned` status (per ROADMAP.md), so there is no deployed live page to inspect today; the build artifact itself does not exercise OSD until JS runs in a browser.
   - **Resolution:** Apply the `z-index: 1` fix speculatively in Plan 32-02 Task 2 Part C. This fix promotes `.lightbox-close` into its own stacking layer within the lightbox's `z-index: 9000` context — addressing both possible failure modes simultaneously:
     - If the issue is paint-order: `z-index: 1` forces `.lightbox-close` above any auto-z-indexed positioned descendants of `#osd-viewer`.
     - If the issue is pointer-capture: a button with explicit `z-index` and no `pointer-events: none` reliably receives clicks regardless of OSD's canvas listener scope, because the browser's hit-test prefers the higher z-index element.
   - **Live test required during Plan 32-02 Task 2:** The Plan 03 human-verify checkpoint MUST include (a) opening the lightbox on a multi-specimen high-res species, (b) clicking the close button while OSD is fully initialized and showing tiles, (c) confirming the lightbox closes. If the fix fails empirically, escalate by restructuring the lightbox HTML so `.lightbox-close` is moved to a wrapper sibling of `#osd-viewer` rather than relying on z-index alone (fallback documented in Pattern 4 above).

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — both packages already installed and confirmed working in Phase 28
- Architecture: HIGH — all patterns confirmed from direct codebase read; no new architectural decisions needed
- Pitfalls: HIGH for known pitfalls (Phase 28 PILOT-LESSONS.md empirical); MEDIUM for close button failure mode (root cause inferred from static analysis, runtime confirmation deferred to Plan 32-02 Task 2 human-verify — fix applied speculatively and addresses both candidate failure modes)

**Research date:** 2026-05-23
**Valid until:** 2026-06-23 (stable stack — no breaking changes expected)
