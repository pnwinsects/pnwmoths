---
quick_id: 260627-oe1
slug: home-target-range-map
title: Add a small static range map to the home page
date: 2026-06-27
status: complete
---

# Summary

Added a small, static SVG map to the home page showing the site's target range
(the Pacific Northwest), floated to the right of the intro prose. No JavaScript,
no map tiles, no attribution footer.

## Key finding (answers the original question)

The "bounds the reference site draws" were already in our codebase — no
reverse-engineering needed. `pnwm-occurrence-map.ts` shades everything *outside*
the PNW using a polygon ring annotated `source: pnwinsects-app`:

```
[[60, -140], [60, -120], [53.8, -120], [45, -109], [39, -109], [39, -125]]
```

That ring is the target range. It now lives in a shared module
(`PNW_REGION_RING`) used by both the occurrence map and the new SVG generator.

## Course correction

A first pass used a non-interactive Leaflet map. The user picked a static SVG
instead, and the Leaflet attribution footer overlapped the southern edge of the
region. The Leaflet component was removed in favor of a generated static SVG.

## What changed

| Task | Notes |
|------|-------|
| 1. Extract shared region ring | `src/components/pnw-region.ts` (`PNW_REGION_RING`); `pnwm-occurrence-map.ts` imports it instead of an inline literal |
| 2. SVG generator + asset | `scripts/generate-range-map.ts` renders Natural Earth 1:50m state/province outlines, clips to the region bbox, projects (equirectangular + cos-lat), highlights `PNW_REGION_RING` → `src/images/pnw-range.svg` (~44 KB / ~14 KB gzipped). `npm run generate:range-map`. |
| 3. Home page + styles | `<figure class="home-range-map">` with an `<img>` in `src/index.njk` (floated right, full-width <768px); `.home-range-map` rules in `theme.css` |

## Decisions

- **Static SVG** over Leaflet: no JS/tiles/attribution overlay; a real basemap
  (state/province outlines) keeps the range legible.
- **Manual generation**, not wired into `npm run build`: the generator fetches
  Natural Earth data over the network, so keeping it out of the build leaves the
  site build offline and deterministic. The committed SVG is the artifact.
- **Single source of truth**: the generator imports `PNW_REGION_RING`; re-running
  keeps the home map in sync if the range changes.
- **`src/images/` (force-added)**: gitignored former Git-LFS path, but site chrome
  (the banner) is committed there the same way; species photos go to the CDN.

## Verification

- `npm run typecheck` — clean (browser + node).
- `npm run build:eleventy` — succeeds; `_site/index.html` renders the figure;
  Vite fingerprints the SVG into `/assets/pnw-range-*.svg`.
- SVG rasterized (`rsvg-convert`) and eyeballed — recognizable PNW with state
  borders and the range highlighted.

## Follow-ups

- Branch `quick/260627-oe1-home-target-range-map` is ready; not pushed/merged
  (user hasn't asked).
- To regenerate after a range change: `npm run generate:range-map`.
