---
phase: 28-end-to-end-vertical-slice-pilot-one-species
reviewed: 2026-05-24T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - data/species-photos.json
  - src/_data/speciesPhotos.js
  - src/components/pnwm-image-slideshow.js
  - src/components/pnwm-image-slideshow.test.js
  - src/species/species.njk
findings:
  critical: 1
  warning: 2
  info: 2
  total: 5
status: issues_found
---

# Phase 28: Code Review Report

**Reviewed:** 2026-05-24T00:00:00Z
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

This phase extends `pnwm-image-slideshow` with an OpenSeadragon (OSD) high-resolution lightbox branch, adds an Eleventy data loader for the species-photos manifest, and wires the template to pass specimen metadata as an HTML attribute. The JSON → attribute → component pipeline is structurally sound: the `tojson | escape` chain correctly HTML-entity-encodes the JSON, and the browser's `getAttribute()` round-trips it back cleanly before `JSON.parse`. The OSD lifecycle (init, destroy, reopen) is largely handled, and the test coverage for the helper methods is adequate.

One critical display bug was found: the OSD thumbnail figures lack the `data-*` attributes consumed by `_formatCaption`, causing a mangled `"Photo © Specimen A · Dorsal"` caption to appear below every slide in the non-lightbox view when high-res mode is active. Two warnings cover a double-initialization race in `_openLightbox` and missing error handling for malformed JSON in the data loader.

---

## Critical Issues

### CR-01: Corrupted caption rendered below slide in OSD mode

**File:** `src/species/species.njk:64-75` and `src/components/pnwm-image-slideshow.js:349,366`

**Issue:** When `highResEntry.high_res_available` is true, the template renders one `<figure>` per specimen containing a thumbnail `<img>` with **no `data-*` attributes** and a `<figcaption>` of `"Specimen A · Dorsal"`. The component's `connectedCallback` reads `figcaption.textContent.trim()` into `img.photographer` (line 138). `_formatCaption` then emits `"Photo © Specimen A · Dorsal"` (line 271), which is rendered verbatim as a caption line below the slide thumbnail (lines 349, 366). The user sees incorrect attribution text in all OSD-mode slides, including the single-image case.

Reproduction: any species with `high_res_available: true` and at least one specimen will show this corruption in the thumbnail-view caption area (the caption is visible before the lightbox is opened).

**Fix:** Either suppress caption rendering in OSD mode, or make `_formatCaption` skip the `photographer` field when it was sourced from a figcaption that follows the specimen-label convention. The clearest fix is to suppress `_formatCaption` output when `useOsd` is true:

```js
// In render(), replace caption lines in both the single-image and multi-image branches:
${useOsd ? '' : this._formatCaption(current).map(line => html`<p class="caption-line">${line}</p>`)}
```

Alternatively, the template could omit the `<figcaption>` in OSD mode (the caption is shown inside the lightbox at lines 319-322 instead), and the component could stop treating `figcaption.textContent` as a photographer credit:

```nunjucks
{# Remove <figcaption> from the OSD specimen thumbnails — caption is shown in lightbox instead #}
<figure>
  <img src="{{ thumbBase }}?width=530" ...>
</figure>
```

---

## Warnings

### WR-01: OSD double-initialization race on rapid double-click

**File:** `src/components/pnwm-image-slideshow.js:206-241`

**Issue:** `_openLightbox` is `async`. After `await this.updateComplete` (line 220), it checks `!this._osdViewer` and then issues `await import('openseadragon')` (line 227). This second `await` is a yield point. If the user double-clicks the image quickly, a second `_openLightbox` call can reach the `!this._osdViewer` guard while the first call is still awaiting the dynamic import. Both calls then call `OpenSeadragon({ element: viewerEl })` on the same DOM node, creating two overlapping viewer instances. The result is visual corruption and a memory leak (one viewer is orphaned with no reference to destroy it).

**Fix:** Set a boolean guard before the first `await`, or assign a sentinel to `_osdViewer` before the import resolves:

```js
async _openLightbox() {
  if (this._osdLoading) return;   // guard against double-open
  this._lightboxOpen = true;
  this._osdLoading = true;
  // ... inert walk ...
  await this.updateComplete;
  const closeBtn = this.shadowRoot.querySelector('.lightbox-close');
  if (closeBtn) closeBtn.focus();

  if (this.highResAvailable && this._highResSpecimens?.length) {
    const viewerEl = this.shadowRoot.querySelector('#osd-viewer');
    if (viewerEl && !this._osdViewer) {
      const { default: OpenSeadragon } = await import('openseadragon');
      // Re-check after the async yield
      if (viewerEl.isConnected && !this._osdViewer) {
        this._osdViewer = OpenSeadragon({ element: viewerEl, /* ... */ });
      }
    }
  }
  this._osdLoading = false;
}
```

Also reset `_osdLoading = false` in `_closeLightbox`.

### WR-02: Malformed JSON in species-photos.json crashes the Eleventy build silently

**File:** `src/_data/speciesPhotos.js:20`

**Issue:** `JSON.parse(await readFile(...))` is not wrapped in a try/catch. If `species-photos.json` contains a syntax error, the Eleventy data cascade throws an unhandled rejection that aborts the build. The comment on line 8 describes the soft-fail strategy (matching the `[plates]` warning idiom) but only the missing-file case is soft-failed; malformed content is not.

**Fix:**

```js
export default async function () {
  if (!existsSync(MANIFEST_PATH)) {
    console.warn(`[species-photos] Manifest not found: ${MANIFEST_PATH} — no high-res species`);
    return {};
  }
  try {
    return JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  } catch (e) {
    console.error(`[species-photos] Malformed JSON in ${MANIFEST_PATH}:`, e.message);
    return {};
  }
}
```

---

## Info

### IN-01: View label mapping silently coerces any non-'D' value to 'Ventral'

**File:** `src/components/pnwm-image-slideshow.js:321` and `src/species/species.njk:73`

**Issue:** Both the lightbox caption and the thumbnail figcaption map `view` with the ternary `view === 'D' ? 'Dorsal' : 'Ventral'`. An unexpected view value (e.g., `'L'` for lateral) is silently labeled `'Ventral'`. As the manifest grows to support additional views, this will produce incorrect labels without any warning.

**Fix:** Add an explicit lookup table or validation:

```js
const VIEW_LABELS = { D: 'Dorsal', V: 'Ventral' };
const viewLabel = VIEW_LABELS[currentSpecimen.view] ?? `Unknown view (${currentSpecimen.view})`;
```

### IN-02: No non-OSD prev/next buttons in lightbox for multi-image species

**File:** `src/components/pnwm-image-slideshow.js:325-328`

**Issue:** The prev/next navigation buttons inside the lightbox are only rendered when `useOsd && _highResSpecimens.length > 1` (line 325). For the non-OSD lightbox (species without high-res), multi-image navigation is only possible via keyboard arrow keys — there are no visible buttons. Users without keyboard access (e.g., mobile users or switch-access users) cannot navigate between images in the non-OSD lightbox.

**Fix:** Render prev/next buttons for the non-OSD lightbox as well when `_images.length > 1`:

```js
${!useOsd && this._images.length > 1 ? html`
  <button class="lightbox-prev" aria-label="Previous photo"
    @click=${() => { this._currentIndex = (this._currentIndex - 1 + this._images.length) % this._images.length; }}>&#x276E;</button>
  <button class="lightbox-next" aria-label="Next photo"
    @click=${() => { this._currentIndex = (this._currentIndex + 1) % this._images.length; }}>&#x276F;</button>
` : ''}
```

---

_Reviewed: 2026-05-24T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
