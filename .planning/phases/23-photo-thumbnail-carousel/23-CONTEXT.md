# Phase 23: Photo Thumbnail Carousel - Context

**Gathered:** 2026-05-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the dot navigation in `pnwm-image-slideshow.js` with a horizontal thumbnail strip, and fix the lightbox close button bug. The main image remains click-to-lightbox. No new data loading, no new Parquet queries, no filter integration — purely a UI update to the existing Lit component.

</domain>

<decisions>
## Implementation Decisions

### Thumbnail Strip
- **D-01:** Thumbnail height: **93px**, natural aspect ratio (no square cropping). Matches the reference pnwinsects-app.
- **D-02:** Active thumbnail indicator: **2px solid primary color border** (`var(--pico-primary)`). No opacity dimming.
- **D-03:** Overflow behavior: **horizontal scroll**. The strip does not wrap to multiple rows.
- **D-04:** Dots (`<div class="dots">`) and dot elements (`<span class="dot">`) are **removed entirely**. The thumbnail strip is the only photo navigation.
- **D-05:** The index label ("1 of N") can be removed — thumbnails make it redundant (Claude's discretion).

### Prev/Next Buttons (Repurposed)
- **D-06:** The ‹/› buttons **scroll the thumbnail strip** left/right; they no longer navigate the main image. Direct thumbnail click is the only way to select a photo as the main image.
- **D-07:** The ‹/› buttons **hide when the strip does not overflow** the available width. They appear only when thumbnails exceed the strip container's width. Use ResizeObserver or scroll-width comparison to detect overflow (Claude's discretion on implementation mechanism).

### Lightbox Close Button Bug (PHOTO-03)
- **D-08:** The symptom is not known from discussion — the researcher should inspect `_closeLightbox()`, the lightbox template, and shadow DOM stacking context to identify and fix the bug. The existing `@click=${this._closeLightbox}` handler and `position: absolute` close button are the likely candidates.

### Claude's Discretion
- Whether to use ResizeObserver or a simpler `scrollWidth > clientWidth` check to detect overflow for button visibility.
- Whether to remove the index label ("1 of N") — yes, remove it; thumbnails make it unnecessary.
- Thumbnail strip scroll amount per button click (e.g., scroll by one thumbnail width, or by half the strip width).
- Smooth vs. instant scroll animation for the strip buttons (`scroll-behavior: smooth` is sufficient).

### Folded Todos
- **Fix close button on the lightbox** (2026-04-23) — folded into PHOTO-03 scope. Researcher must diagnose symptom and fix in `pnwm-image-slideshow.js`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Component to Modify
- `src/components/pnwm-image-slideshow.js` — The only JS file that needs changing. Current multi-image render (lines 207–236) has prev/next buttons + dots + index label. Replace with thumbnail strip + repurposed scroll buttons.

### Template (reference only — no changes expected)
- `src/species/species.njk` (lines 37–62) — Shows how `<pnwm-image-slideshow>` receives light DOM `<figure>` children with full image metadata. Thumbnail `src` can be derived directly from each image's `src` field parsed in `connectedCallback()`.

### Project Context
- `.planning/PROJECT.md` — Key Decisions table; especially: "Lit for client-side components — light DOM required for Leaflet; CSS custom properties unavailable in Canvas 2D" (note: Canvas 2D constraint does NOT apply here — thumbnail strip is HTML/CSS, not canvas, so Lit CSS vars work normally).
- `.planning/REQUIREMENTS.md` — PHOTO-01, PHOTO-02, PHOTO-03 requirements for this phase.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `pnwm-image-slideshow.js` `connectedCallback()` — Already parses all image metadata (src, alt, photographer, locality, state, etc.) from light DOM `<figure>` children into `this._images[]`. Thumbnail `src` comes directly from `img.src` in that array — no new parsing needed.
- `pnwm-image-slideshow.js` `_prev()` / `_next()` — These currently advance `_currentIndex`. With D-06, they're repurposed to scroll the strip DOM node; `_currentIndex` is set only by thumbnail click.
- `pnwm-image-slideshow.js` `_openLightbox()` / `_closeLightbox()` — Lightbox open/close already implemented; PHOTO-03 is a bug fix, not new functionality.

### Established Patterns
- **Lit shadow DOM** — Component uses `static styles = css\`...\`` (shadow DOM). CSS custom properties (`var(--pico-primary)`, `var(--pico-muted-color)`) work in shadow DOM HTML/CSS contexts. Use them for thumbnail border and strip styling.
- **Reactive state** — `_currentIndex` is `{ state: true }`. Thumbnail strip active state derives from `_currentIndex` in `render()` — no new state properties needed for the strip itself. A `_stripOverflows` reactive state property is needed for D-07 button visibility.
- **Shadow DOM querySelector** — `this.shadowRoot.querySelector(...)` is the correct API inside Lit for DOM access after render (used already in `_openLightbox()`).
- **Light DOM figures hidden on JS takeover** — `connectedCallback()` hides static figures once `_images` is populated. Thumbnail `<img>` elements are new shadow DOM elements, not the light DOM figures.

### Integration Points
- No template changes expected — thumbnail `src` values come from the already-parsed `this._images[]` array.
- No data pipeline changes — images are already loaded via CDN URLs in the template.
- CSS custom properties (`var(--pico-primary)`) are available in this context (shadow DOM, not canvas) — no hardcoding needed for the active border color.

</code_context>

<specifics>
## Specific Ideas

- Thumbnail height of **93px** is derived from the reference pnwinsects-app. This is a hard design requirement, not an approximation.
- The ‹/› buttons scroll the thumbnail strip (not the main image) — this is a repurposing of the existing button elements, not an addition.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 23-photo-thumbnail-carousel*
*Context gathered: 2026-05-20*
