# Phase 32: OpenSeadragon Viewer in Lightbox (generalize pilot) - Context

**Gathered:** 2026-05-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 32 generalizes the Phase 28 pilot's OSD lightbox wiring so that every species with `high_res_available: true` shows a functioning carousel and OSD deep-zoom viewer.

The deliverable has two parts:

1. **Template change (`src/species/species.njk`)** — Replace the empty slot (Phase 31 left it empty for high-res species) with `<figure>` elements per high-res specimen. Each figure contains the specimen's level-0 DZI tile as a static `<img>` and a "Specimen A · Dorsal" figcaption. The component reads these from the light DOM, which naturally provides carousel thumbnails, the main slide, and no-JS fallback without any new component rendering logic.

2. **Component change (`src/components/pnwm-image-slideshow.js`)** — Add in-lightbox prev/next specimen navigation (shown only when `_highResSpecimens.length > 1`). Use `viewer.open(newTileSource)` to swap DZI tile sources without destroying the viewer. Fix the close button (folded from Phase 23 todo).

**Out of scope for Phase 32:** Any change to `scripts/`, `data/species-photos.json` shape, `scripts/lib/manifest.js`, or the Phase 29/30 upload pipeline. Phase 28's pilot OSD config (prefixUrl, visibilityRatio, minZoomLevel, defaultZoomLevel) is already in place and is not revisited.

</domain>

<decisions>
## Implementation Decisions

### Template — high-res `<figure>` elements (no-JS fallback + carousel source)

- **D-01 (figures for high-res species):** For high-res species (`highResEntry.high_res_available: true`), the template renders one `<figure>` per specimen inside `<pnwm-image-slideshow>`. Image src: `{cdnBaseUrl}/{tiles_path}/{specimen_id}-{view}_files/0/0_0.webp` (the level-0 DZI tile, already on CDN). The `<pnwm-image-slideshow>` component picks these up from the light DOM into `_images` via its existing `querySelectorAll(':scope > figure')` in `connectedCallback` — no new component rendering logic needed.
- **D-02 (figcaption format):** `Specimen {specimen_id} · {Dorsal|Ventral}` (e.g., "Specimen A · Dorsal"). Visible to no-JS users; also picked up by the component's caption rendering.
- **D-03 (figure order matches specimens order):** Figures are rendered in the same order as `highResEntry.specimens` so `_images[_currentIndex]` aligns with `_highResSpecimens[_currentIndex]` — the carousel and OSD navigation share `_currentIndex` consistently.

### Carousel behavior

- **D-04 (thumbnail images):** DZI level-0 tile URLs (from `_images[i].src`) are used for carousel thumbnails. No text label on thumbnail buttons.
- **D-05 (thumbnail error fallback):** `onerror` sets a gray placeholder background when the level-0 tile fails to load.
- **D-06 (main slide):** The main slide shows the level-0 tile at full carousel width (`_images[_currentIndex].src`) — same URL as the corresponding thumbnail. Clicking it opens the OSD lightbox for that specimen.

### OSD lightbox — specimen navigation

- **D-07 (in-lightbox prev/next buttons):** When `useOsd && _highResSpecimens.length > 1`, render prev/next arrow buttons inside the lightbox. Clicking prev/next increments `_currentIndex` (wrapping), then calls `viewer.open(this._buildDziUrl(this._highResSpecimens[_currentIndex]))` to swap tile sources in place. Zoom/pan resets on open (OSD default).
- **D-08 (viewer.open swap):** No destroy/recreate on specimen switch — `viewer.open(newTileSource)` is sufficient. The viewer is still destroyed in `_closeLightbox()` as before.
- **D-09 (specimen caption in lightbox):** The existing caption line ("Specimen {id} · Dorsal/Ventral") updates reactively with `_currentIndex`. Already implemented from Phase 28 — no change needed.

### Pilot filter

- **D-10 (no pilot filter to remove):** The Phase 28 pilot added no species-specific filter in the template or component. Success criterion 5 ("remove pilot filter") is already satisfied. No code change needed here.

### Folded Todos

- **"Fix close button on the lightbox"** (filed 2026-04-23, resolved-against Phase 23): No specific failure mode was recorded. Investigate during Phase 32 — inspect click handler, z-index, focus trap, and Lit shadow DOM event propagation. The component already has a close button with `@click=${() => this._closeLightbox()}` and Escape key handling.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 32 charter
- `.planning/ROADMAP.md` §"Phase 32: OpenSeadragon Viewer in Lightbox (generalize pilot)" — goal + 5 success criteria (SC-1..SC-5); VIEWER-01..04 traceability
- `.planning/REQUIREMENTS.md` — VIEWER-01 (OSD in lightbox for high-res species), VIEWER-02 (static-img fallback for low-res), VIEWER-03 (carousel unchanged), VIEWER-04 (specimen_id + view inline)

### Files to modify
- `src/components/pnwm-image-slideshow.js` — the Lit component; already has OSD logic from Phase 28 pilot; Phase 32 adds in-lightbox prev/next and close button fix
- `src/species/species.njk` — template; already has Phase 31 DATA-03 guard; Phase 32 adds `<figure>` elements for high-res species in place of the empty slot

### Files to read (context, do not modify)
- `src/_data/speciesPhotos.js` — Eleventy data loader for `data/species-photos.json`; shape must stay backward-compatible
- `data/species-photos.json` — current high-res data; shape `{species_slug: {high_res_available: bool, specimens: [{specimen_id, view, tiles_path}]}}`
- `src/components/pnwm-plate-viewer.js` — Phase 18 OSD integration reference; `viewer.open()` + `prefixUrl` patterns

### Prior phase decisions
- `.planning/phases/31-data-species-photos-json-build-integration/31-CONTEXT.md` — DATA-03 guard in `species.njk` (D-03, D-04); Phase 32 deferred items listed in `<deferred>` ("Phase 32 thumbnail source", "No-JS fallback for high-res species")
- `.planning/phases/28-end-to-end-vertical-slice-pilot-one-species/28-CONTEXT.md` — OSD config decisions: `prefixUrl='/osd-images/'`, `visibilityRatio=1.0`, `defaultZoomLevel=0`, `minZoomLevel=0.5`; `_buildDziUrl()` convention; pilot confirmed OSD + DZI + WebP tiles work correctly

### Project context
- `.planning/PROJECT.md` — CDN_BASE_URL; tech stack; Key Decisions table (Lit light DOM, sibling-walk inert for focus trap, z-index 9000 for lightbox)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`pnwm-image-slideshow.js` — existing OSD logic (Phase 28):** `_openLightbox()` already initializes OSD when `highResAvailable && _highResSpecimens?.length`. `_closeLightbox()` calls `viewer.destroy()`. `_buildDziUrl(specimen)` already constructs the DZI URL. Phase 32 adds `viewer.open()` on prev/next (not destroy/recreate).
- **`pnwm-image-slideshow.js` — existing thumbnail rendering:** The component already reads `<figure>` elements from light DOM into `_images` and renders them as a thumbnail strip and main slide. Phase 32 leverages this unchanged — the template feeds the correct level-0 tile URLs.
- **`pnwm-plate-viewer.js`:** Shows the established pattern for dynamic OSD import + `element` + `prefixUrl` + `tileSources`. Phase 32 already follows this pattern.

### Established Patterns

- **Level-0 DZI tile URL:** `${cdnBaseUrl}/${tiles_path}/${specimen_id}-${view}_files/0/0_0.webp`. Level 0 is the coarsest (single-tile) resolution. The tile format is WebP (from Phase 29 config).
- **Sibling-walk `inert` for focus trap:** `_openLightbox()` walks from host to `<body>`, inerting siblings at each level. Do not break this — lightbox must trap focus above Leaflet controls (z-index 9000).
- **ResizeObserver guard:** Only update `_stripOverflows` when value changes. Required to avoid infinite Lit re-render loop. Do not add unconditional updates inside ResizeObserver callbacks.
- **DZI URL via `_buildDziUrl()`:** `${this.cdnBaseUrl}/${specimen.tiles_path}/${specimen.specimen_id}-${specimen.view}.dzi` — pattern is already in place; level-0 tile URL follows same base path.

### Integration Points

- **`species.njk` template — existing guard:** Phase 31 D-04 guard: `{% if (not (highResEntry and highResEntry.high_res_available)) and spImages and spImages.length > 0 %}` suppresses low-res figures for high-res species. Phase 32 adds an `{% elif highResEntry and highResEntry.high_res_available %}` branch for the high-res `<figure>` elements — the "no photos" `{% else %}` branch remains for species with neither.
- **`_currentIndex` shared between carousel and OSD navigation:** When in-lightbox prev/next updates `_currentIndex`, the main slide and selected thumbnail behind the lightbox also update (visible when lightbox closes). This is correct behavior.
- **OSD `viewer.open()` signature:** Takes a tile source URL string or Zoomify/DZI config. For DZI: pass the `.dzi` URL string directly (same as `tileSources` in the init call). Zoom/pan resets to `defaultZoomLevel: 0` on open.

</code_context>

<specifics>
## Specific Ideas

- **Level-0 tile thumbnail URL pattern** (confirmed): `${cdnBaseUrl}/${specimen.tiles_path}/${specimen.specimen_id}-${specimen.view}_files/0/0_0.webp`. The WebP format is set by Phase 29's `tile-config.json`. Level 0 is always a single tile for any DZI pyramid.
- **In-lightbox prev/next:** Only rendered when `useOsd && _highResSpecimens.length > 1`. Single-specimen species get no navigation buttons.
- **Close button investigation:** The button already exists (`class="lightbox-close"`, `@click=${() => this._closeLightbox()}`). The Phase 23 todo says it "is not working correctly" with no specifics. Investigate: is it a z-index layering issue within the shadow DOM, a focus trap interaction, or a click handler not reaching the shadow root?
- **No pilot filter:** The template uses `speciesPhotos[sp.slug]` generically across all 1,364 species pages. As `data/species-photos.json` grows (via `photos:materialize`), more species gain `high_res_available: true` automatically. No code change needed for this success criterion.

</specifics>

<deferred>
## Deferred Ideas

- **Per-specimen keyboard navigation in OSD:** Arrow keys inside the lightbox to cycle specimens (in addition to prev/next buttons). Considered but not discussed — add to a future UI refinement phase if needed.
- **Smooth OSD transition between specimens:** Cross-fade or animated tile swap when `viewer.open()` is called. OSD handles this internally; if the default is jarring, a future phase can configure `animationTime`.

### Reviewed Todos (not folded)
- "Migrate Pagefind to Component UI" — UI concern unrelated to the lightbox; not in scope for Phase 32. Left in pending for a future UI phase.

</deferred>

---

*Phase: 32-openseadragon-viewer-in-lightbox-generalize-pilot*
*Context gathered: 2026-05-23*
