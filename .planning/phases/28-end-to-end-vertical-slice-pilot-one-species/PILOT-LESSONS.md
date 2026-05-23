# Phase 28 — Pilot Lessons (end-to-end vertical-slice — one species)

Recorded 2026-05-22. All values are empirical from the pilot run.
Phase 29, 30, and 32 should read this before planning.

---

## Pilot Species

- **Slug:** `abagrotis-apposita`
- **Specimens:** 1 (specimen A)
- **Pairs tiled and uploaded:** 2 (A-D dorsal, A-V ventral)
- **Source format:** TIFF

---

## Tile Parameters That Survived Contact

**Confirmed `vips dzsave` invocation:**

```sh
vips dzsave "/path/to/source.tif" "/tmp/tiles/${SLUG}/${PAIR}" \
  --tile-size 256 \
  --overlap 1 \
  --suffix .webp[Q=80] \
  --layout dz
```

**Format decision:** WebP was chosen over JPEG (original plan spec'd `.jpg[Q=85]`). Confirmed ~30% size reduction on real TIFF input. OSD handles `Format="webp"` in the `.dzi` descriptor correctly — tile URLs resolve to `.webp` files and load successfully.

**Tile counts and sizes for the pilot species:**

| Pair | Tiles | Disk size |
|------|-------|-----------|
| A-D  | 108   | 884 KB    |
| A-V  | 108   | 836 KB    |
| Total | 216  | ~1.7 MB   |

**Pyramid depth:** 14 zoom levels (confirmed by `ls A-D_files | wc -l`).

**Extrapolation to full dataset (~5,000 specimens × 2 views = ~10,000 pairs):**
- Tiles: 108 × 10,000 = ~1.08M tiles
- Disk/storage: ~850 KB × 10,000 = ~8.5 GB
- These are small TIFF inputs; larger specimens may produce deeper pyramids and more tiles

**vips surprises vs. [ASSUMED] defaults:** None. All four flags produced the expected DZI layout on first run. `--suffix .webp[Q=80]` correctly updated the `.dzi` descriptor `Format` attribute to `webp`.

---

## URL Convention — What Worked, What Needed Adjusting

**Survived end-to-end unchanged:**
`https://pnwmoths.b-cdn.net/species-tiles/{slug}/{specimen_id}-{view}/{specimen_id}-{view}.dzi`

**One storage-path issue discovered during Plan 03:** local tile directories were created with mixed-case genus (`Abagrotis-apposita`) but the remote storage path uses the lowercase slug (`abagrotis-apposita`). No 404s resulted because the upload script used the correct lowercase path regardless of the local directory name. Phase 29's committed upload script should enforce lowercase slug normalization explicitly.

**No leading-slash errors, no zone-prefix errors** during upload.

---

## CORS Status on bunny.net Pull Zone

**`curl -I` result (Plan 03):** `access-control-allow-origin` absent initially.

**Fix applied:** bunny.net Pull Zone → "Enable CORS Headers" toggle enabled; `dzi` added to the extension list (the list already included `webp`, `jpg`, etc.). After enabling:

```
access-control-allow-origin: *
access-control-allow-headers: Server, x-goog-meta-frames, Content-Length, Content-Type, Range, X-Requested-With, If-Modified-Since, If-None-Match
access-control-expose-headers: Server, x-goog-meta-frames, Content-Length, Content-Type, Range, X-Requested-With, If-Modified-Since, If-None-Match
```

**Browser XHR result (Plan 05):** All `.dzi` and tile requests returned 200; no CORS errors in console. However, two non-fatal WebGL warnings appeared:
- `Error creating texture in WebGL. undefined` — OSD falls back to Canvas for affected tiles; non-blocking
- `WebGL warning: tex(Sub)Image[23]D: Cross-origin elements require CORS.` — WebGL texture path has stricter CORS caching requirements than `<img>`; OSD continues via Canvas fallback; functionality unaffected

**Phase 30/32 action:** The Pull Zone CORS setting is already applied and covers both `dzi` and `webp` extensions. No further CORS work needed for bulk pipeline. The WebGL warning may be worth investigating in Phase 32 if WebGL tile rendering performance matters for large specimens.

---

## OSD Configuration Surprises

Config used in pilot:
```javascript
{
  prefixUrl: this.prefixUrl,   // '/osd-images/' with GitHub Pages prefix
  tileSources: dziUrl,          // DZI URL string — OSD auto-detects format
  visibilityRatio: 1.0,
  minZoomLevel: 0.5,
  defaultZoomLevel: 0,
  showNavigator: true,
  showRotationControl: false,
}
```

**`showNavigator: true`:** The navigator mini-map rendered as a **black rectangle** — the WebGL CORS issue prevents it from compositing a thumbnail from the tile textures. Fixed to `showNavigator: false` in the same commit as PILOT-LESSONS.md. Phase 32 should not re-enable it without first resolving the WebGL cross-origin texture warning.

**`defaultZoomLevel: 0`:** OSD fits the entire image in the viewport on open — correct for specimen viewing where the initial context (whole specimen) matters.

**`tileSources` as DZI URL string:** OSD auto-detects the DZI format from the URL and `.dzi` extension correctly. No need to pass a config object — the string form is cleaner and correct.

**Rotation control:** `showRotationControl: false` is correct; moth specimen photos are fixed orientation.

**Open/close cycle:** Destroy-on-close (`this._osdViewer?.destroy(); this._osdViewer = null`) works correctly — repeated open/close produced no errors or resource leaks.

---

## Typography Consolidation

`.caption-line` `font-size: 0.875rem` (changed from `0.8rem` in Plan 04) held up visually. No specificity conflicts observed. UI-SPEC fallback clause not triggered.

---

## Eleventy Template Variable Mapping

**`speciesPhotos` camelCase did NOT work.** Eleventy 3.1.5 uses the filename stem verbatim as the template variable name — `species-photos.js` was exposed as `species-photos` (hyphenated), which is not a valid Nunjucks identifier and silently resolved to `undefined`.

**Fix:** renamed `src/_data/species-photos.js` → `src/_data/speciesPhotos.js`. The template reference `speciesPhotos[sp.slug]` then works correctly.

**Phase 31 action:** When Phase 31 replaces `data/species-photos.json` with a manifest-derived version, the data file is `speciesPhotos.js` (camelCase). Do not revert to a hyphenated filename.

---

## Recommendations for Phase 29

- Pin `--suffix .webp[Q=80]` in the committed tile-generation config (not JPEG)
- Pin `--tile-size 256 --overlap 1 --layout dz` — confirmed correct
- Plan for ~108 tiles per pair, 14 pyramid levels, ~850 KB per pair at this specimen size; larger TIFFs will vary
- Enforce lowercase slug normalization in the upload path; do not rely on local directory naming
- The bunny.net CORS setting is already applied — no CORS work needed in Phase 29

## Recommendations for Phase 30

- Storage footprint estimate: ~8.5 GB for full 5,000-specimen × 2-view dataset at pilot rates
- Tile count estimate: ~1.08M tiles total
- Pull Zone CORS already configured — bulk upload will work without additional CDN config
- Build verification baseline is now 1,380 species pages (not 1,364 — species database has grown since Phase 17)

## Recommendations for Phase 32

- Set `showNavigator: false` as the default; make it an explicit opt-in if re-added
- Investigate WebGL CORS warning (`tex(Sub)Image[23]D: Cross-origin elements require CORS`) — may require `crossOrigin` attribute on tile image requests or a different OSD tile source config; currently falls back to Canvas silently
- The `_buildDziUrl` helper in `pnwm-image-slideshow.js` is the single point of truth for tile URL construction — Phase 32 generalizes it to all high-res species
- `data/speciesPhotos.js` (note: camelCase filename) is the data loader — Phase 31 replaces the JSON content; Phase 32 consumes the same loader
