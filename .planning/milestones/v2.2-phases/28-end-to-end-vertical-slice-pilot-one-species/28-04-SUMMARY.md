---
phase: 28
plan: 04
status: complete
completed: "2026-05-22"
---

# Plan 28-04 Summary: Wire OSD into lightbox

## Files Modified

| File | Additions | Deletions | Net |
|------|-----------|-----------|-----|
| `src/components/pnwm-image-slideshow.js` | +71 | -5 | +66 |
| `src/components/pnwm-image-slideshow.test.js` | +16 | 0 | +16 |
| `src/species/species.njk` | +11 | -1 | +10 |

**Total**: +98 insertions, 6 deletions across 3 files (two commits)

## Task 1: `_buildDziUrl` helper + high-res properties + connectedCallback parse

- Added four attribute-backed `static properties` entries: `highResAvailable`, `highResSpecimens`, `cdnBaseUrl`, `prefixUrl`
- Added reactive state `_highResSpecimens` and non-reactive `this._osdViewer = null` in constructor
- Added `_buildDziUrl(specimen)` helper: `` `${this.cdnBaseUrl}/${specimen.tiles_path}/${specimen.specimen_id}-${specimen.view}.dzi` ``
- Added `connectedCallback` JSON parse of `high-res-specimens` attribute with try/catch and `[]` fallback
- TDD: two unit tests written first (red), then implementation added (green); all 217 tests passed

## Task 2: OSD lifecycle, render branch, CSS, species.njk attribute pass-through

- `_openLightbox` made `async`; adds guarded OSD init block: `await this.updateComplete` → querySelector `#osd-viewer` → dynamic `import('openseadragon')` → `OpenSeadragon({...})` with `showNavigator: true`
- `_closeLightbox` calls `this._osdViewer?.destroy(); this._osdViewer = null` before inert cleanup
- `render()` computes `useOsd` flag; OSD branch renders `<div id="osd-viewer" class="osd-viewer">` + specimen caption; static-image branch is byte-identical to Phase 23
- CSS: `.osd-viewer { width: 90vw; height: 70vh; min-height: 400px; background: #111; }` added; `.caption-line` font-size updated `0.8rem → 0.875rem`
- `species.njk`: `{% set highResEntry = speciesPhotos[sp.slug] %}` added; conditional attribute block on `<pnwm-image-slideshow>` includes `high-res-available`, `high-res-specimens`, `cdn-base-url` (no `| url`), `prefix-url` (with `| url`)

## Eleventy variable-name discovery: `speciesPhotos` — camelCase works as expected

The `src/_data/species-photos.js` filename converts to `speciesPhotos` in Nunjucks templates per Eleventy's standard camelCase rule. No fallback to verbatim `species-photos` was needed. This answers the PATTERNS.md "VERIFY during execution" open question.

## Build verification

- Build produced **1,380 species pages** (plan expected 1,364 — species count grew between plan authoring and execution; no regression, page count is deterministic)
- `grep -l 'high-res-available' _site/species/*/index.html | wc -l` → **0** (empty manifest, zero species pages emitted high-res attributes)
- `npm test` → 217/217 tests pass (160 at original execution, 217 in re-verification after Phase 32 additions)
- No build errors

## Regression gate: passed

With `data/species-photos.json = {}`, every species page renders byte-identically to Phase 23's static lightbox + carousel. The dual-condition gate (`highResAvailable === true AND _highResSpecimens?.length > 0`) was verified by the zero-attribute smoke check.

## Status

Complete. Plan 05 can now hand-edit `data/species-photos.json` with a real pilot entry to trigger the OSD path end-to-end.
