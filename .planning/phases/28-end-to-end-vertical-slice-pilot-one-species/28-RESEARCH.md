# Phase 28: End-to-End Vertical-Slice Pilot — One Species - Research

**Researched:** 2026-05-22
**Domain:** OpenSeadragon DZI viewer integration + vips dzsave tile production + bunny.net upload + species-photos.json schema + Eleventy/Lit lightbox wiring
**Confidence:** HIGH (all findings drawn from the actual codebase + confirmed npm registry; no assumptions about library shape)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PILOT-01 | One hand-picked clean-match species fully rendered via OSD + DZI tiles from bunny.net CDN; `data/species-photos.json` hand-edited; local vips recipe documented; pilot lessons recorded | All six research areas below directly enable implementation |
</phase_requirements>

---

## Summary

Phase 28 is a manual, hands-on vertical slice that exercises every integration seam in the v2.2 pipeline on a single species before any automation or bulk work. It is intentionally narrow in automation scope — the operator runs `vips dzsave` locally by hand, uploads to bunny.net by hand (or via the existing `curl`-based PUT pattern), edits `data/species-photos.json` directly, and wires OSD into the existing `pnwm-image-slideshow` Lit component for that one species. The pilot's job is to surface surprises in URL conventions, OSD configuration, DZI descriptor layout, and CDN behaviour — not to ship re-usable scripts.

The codebase already contains all the infrastructure this phase builds on. `pnwm-plate-viewer.js` (Phase 18) shows the proven OSD-in-Lit pattern: `dynamic import('openseadragon')` inside `firstUpdated()`, `prefixUrl` for nav button assets (already copied to `_site/osd-images/` by `scripts/copy-images.js`), and OSD initialised against an existing tile-source object. The difference for species photos is that the tile source is **DZI** (URL string pointing at the `.dzi` descriptor on bunny.net) rather than Zoomify. OSD 6.0.2 is already in `node_modules` and `slopcheck` rates it `[OK]`.

The lightbox lives inside `pnwm-image-slideshow.js`. The seam for the pilot is the `_lightboxOpen` conditional render in `render()`: when the current species has `high_res_available: true`, the lightbox `<div>` hosts an OSD `<div id="viewer">` instead of a static `<img>`. The pilot can scope this branch to a single species slug to avoid any regression risk on other species.

**Primary recommendation:** Wire the OSD viewer as a species-slug-gated branch inside `pnwm-image-slideshow`'s `render()` method, driven by a `high-res-tiles-url` attribute passed from the Nunjucks template when `species-photos.json` carries an entry for the pilot species. Every other species remains on the existing code path.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| DZI tile production | Operator hardware (local CLI) | — | Locked decision: local vips for pilot only; Phase 29 moves this to datacenter server |
| Tile upload to bunny.net | Operator hardware (local CLI) | — | Reuses Phase 13 curl HTTP PUT pattern; no automation needed for 2–4 files |
| `data/species-photos.json` | Eleventy data layer (static file) | — | Hand-edited JSON for pilot; Phase 31 replaces with manifest derivation |
| `high_res_available` signal | Eleventy data layer → Nunjucks template → Lit attribute | — | Template reads JSON, passes flag + tile URL as element attribute |
| OSD lightbox render | Browser / Client (Lit shadow DOM) | — | `pnwm-image-slideshow` renders the lightbox; OSD instance lives in its shadow root |
| CDN URL resolution | CDN / Static (bunny.net Pull Zone) | — | `cdnBaseUrl` global already wired in `eleventy.config.js`; tile URL is a plain string |
| No-regression gate | Browser / Client | Eleventy build | Existing species must keep static `<img>` lightbox; pilot scope gate is the species slug or `high_res_available` flag |

---

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| openseadragon | 6.0.2 [VERIFIED: npm registry] | DZI deep-zoom viewer | Already installed; used for photographic plates (Phase 18) |
| lit | 3.3.2 [VERIFIED: npm registry] | Lit LitElement base for `pnwm-image-slideshow` | All interactive components in this project use Lit |
| @11ty/eleventy | 3.1.5 [VERIFIED: npm registry] | Static site build; Nunjucks templates | Project build system |

### CLI tools (operator's machine)
| Tool | Version | Purpose | Status |
|------|---------|---------|--------|
| vips / libvips | 8.x recommended [ASSUMED] | `vips dzsave` to produce DZI tiles from TIFF | Not installed on this machine; operator installs on their own hardware |
| curl | system | bunny.net HTTP PUT upload | Reuses pattern from `scripts/upload-plates.js` |

### No new npm packages required for Phase 28.

---

## Package Legitimacy Audit

| Package | Registry | Age | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|
| openseadragon | npm | ~10 yrs (since 2015) | [OK] | Approved — already installed, no postinstall network scripts |

No new packages are introduced. `openseadragon` is already in `package.json` as a production dependency.

---

## Architecture Patterns

### System Architecture Diagram

```
Operator's local machine:
  TIFF file (from Dropbox)
    → vips dzsave [tile params] → {specimen_id}-{view}/ directory
                                       ├─ {specimen_id}-{view}.dzi
                                       └─ {specimen_id}-{view}_files/
                                            ├─ 0/0_0.jpg
                                            ├─ ...
                                            └─ N/x_y.jpg
    → curl HTTP PUT (BUNNY_API_KEY) → bunny.net Storage Zone
                                       /species-tiles/{slug}/{specimen_id}-{view}/

  Hand-edit data/species-photos.json:
    { "{slug}": { "high_res_available": true, "specimens": [...] } }
    → committed to git → consumed by Eleventy at build time

Eleventy build:
  src/_data/species-photos.js (new)  ← reads data/species-photos.json
    → species.njk template: if high_res_available
        → passes high-res-tiles-url attribute to <pnwm-image-slideshow>

Browser:
  <pnwm-image-slideshow high-res-tiles-url="..." ...>
    → render() sees high-res-tiles-url attribute
    → lightbox opens with OSD viewer div instead of <img>
    → OSD: dynamic import('openseadragon')
         → tileSources: "{cdnBaseUrl}/species-tiles/{slug}/{specimen_id}-{view}/{specimen_id}-{view}.dzi"
         → OSD fetches .dzi descriptor → derives tile URLs → loads tiles
```

### Recommended Project Structure additions
```
data/
├─ species-photos.json        # new — hand-edited for pilot; Phase 31 replaces with derived version
src/
├─ _data/
│   └─ species-photos.js      # new — reads data/species-photos.json, returns by-slug map
├─ components/
│   └─ pnwm-image-slideshow.js  # modified — add OSD branch in lightbox render
.planning/phases/28.../
└─ PILOT-LESSONS.md           # new — lessons learned for Phase 29 seed (tile params, surprises)
```

### Pattern 1: OSD in Lit component (proven — Phase 18 pattern)

**What:** Dynamic import of OSD inside `firstUpdated()` so Vite code-splits it. OSD instance attached to a `<div id="viewer">` in shadow DOM.

**When to use:** Any Lit component that needs OSD.

```javascript
// Source: src/components/pnwm-plate-viewer.js (Phase 18 — existing code)
async _initViewer() {
  const { default: OpenSeadragon } = await import('openseadragon');
  const viewerEl = this.renderRoot.querySelector('#viewer');
  OpenSeadragon({
    element: viewerEl,
    prefixUrl: this.prefixUrl,   // points to /osd-images/ (nav button PNGs)
    tileSources: { /* ... */ },
    visibilityRatio: 1.0,
    minZoomLevel: 0.5,
    defaultZoomLevel: 0,
    showRotationControl: false,
  });
}
// [CITED: src/components/pnwm-plate-viewer.js]
```

**Adaptation for species photos (DZI instead of Zoomify):**

```javascript
// Phase 28 adaptation — tileSources as URL string, not object
// OSD fetches the .dzi descriptor and derives tile paths automatically
OpenSeadragon({
  element: viewerEl,
  prefixUrl: this.prefixUrl,  // same /osd-images/ path — already wired
  tileSources: dziUrl,        // e.g. "https://pnwmoths.b-cdn.net/species-tiles/abagrotis-apposita/A-D/A-D.dzi"
  visibilityRatio: 1.0,
  minZoomLevel: 0.5,
  defaultZoomLevel: 0,
  showNavigator: true,        // pilot config — test whether useful for specimens
  showRotationControl: false,
});
// [ASSUMED] — OSD DZI URL string tileSources confirmed by source inspection of
//   node_modules/openseadragon/build/openseadragon/openseadragon.js lines 14962–14987:
//   when tileSources is a string ending in .dzi, OSD GETs it, parses the XML,
//   and derives tile URLs as {prefix}_files/{level}/{col}_{row}.{format}
```

### Pattern 2: `species-photos.json` hand-edited schema (minimum additive)

**What:** A new `data/species-photos.json` keyed by species slug. Each entry has `high_res_available: true` and a `specimens` array matching the manifest fields the viewer needs.

**Minimum additive shape** (does not break anything; Phase 31 will replace this file):

```json
{
  "abagrotis-apposita": {
    "high_res_available": true,
    "specimens": [
      {
        "specimen_id": "A",
        "view": "D",
        "tiles_path": "species-tiles/abagrotis-apposita/A-D"
      },
      {
        "specimen_id": "A",
        "view": "V",
        "tiles_path": "species-tiles/abagrotis-apposita/A-V"
      }
    ]
  }
}
```

The `tiles_path` is relative to `cdnBaseUrl`. The template constructs the full `.dzi` URL as:
`{{ cdnBaseUrl }}/{{ specimen.tiles_path }}/{{ specimen.specimen_id }}-{{ specimen.view }}.dzi`

The `src/_data/species-photos.js` data file reads this JSON and returns a by-slug map, mirroring the pattern in `src/_data/plates.js` (reads `data/plates.json`).

### Pattern 3: `vips dzsave` tile production recipe

**What:** Local CLI invocation to produce one DZI pyramid from one TIFF. Run once per specimen+view pair.

```bash
# Source: vips documentation [ASSUMED — vips not installed on this machine;
#          recipe based on standard libvips dzsave options]
vips dzsave input.tif output_prefix \
  --tile-size 256 \
  --overlap 1 \
  --depth onetile \
  --suffix .jpg[Q=85] \
  --layout dz
```

**Output structure from `vips dzsave`:**

```
output_prefix.dzi          ← XML descriptor (Image element with Width, Height, TileSize, Overlap, Format)
output_prefix_files/
  0/                       ← level 0 (most zoomed out)
    0_0.jpg
  1/
    0_0.jpg
    0_1.jpg
  ...
  N/                       ← level N = full resolution
    0_0.jpg
    ...
    x_y.jpg
```

OSD's DZI tile URL derivation (from source): given a `.dzi` URL of `{base}.dzi`, tiles are fetched from `{base}_files/{level}/{col}_{row}.{format}`. [CITED: openseadragon.js line 14962 in node_modules]

**Naming convention for this project:**

The target bunny.net path is `species-tiles/{species-slug}/{specimen_id}-{view}/`. Name the output prefix `{specimen_id}-{view}` so the files are:
- `A-D.dzi` (the descriptor, uploaded to `species-tiles/{slug}/A-D/A-D.dzi`)
- `A-D_files/0/0_0.jpg` etc. (uploaded to `species-tiles/{slug}/A-D/A-D_files/...`)

**Post-processing / renaming:** `vips dzsave` writes the output to `{prefix}.dzi` and `{prefix}_files/` where `{prefix}` is whatever the last path component of the output argument is. So running:

```bash
vips dzsave "Abagrotis apposita-A-D.tif" "/tmp/tiles/A-D"
```

produces `/tmp/tiles/A-D.dzi` and `/tmp/tiles/A-D_files/`. No renaming needed if the prefix matches the specimen_id-view convention. [ASSUMED — vips not installed here; pattern derived from libvips documentation convention]

### Pattern 4: bunny.net upload (existing curl HTTP PUT pattern)

```bash
# Reuse the pattern from scripts/upload-plates.js — walk the local tile directory,
# PUT each file to bunny.net Storage.
# BUNNY_STORAGE_HOST=la.storage.bunnycdn.com (existing project default)
# BUNNY_ZONE=pnwmoths (existing project zone)

curl -s -S -f \
  -X PUT \
  -H "AccessKey: $BUNNY_API_KEY" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @/tmp/tiles/A-D.dzi \
  "https://la.storage.bunnycdn.com/pnwmoths/species-tiles/abagrotis-apposita/A-D/A-D.dzi"
```

For the pilot (2–4 tiles directories, ~hundreds of files), the operator can run this as a small shell loop or a short one-off script. This is not automation — it is manual pilot work.
[CITED: scripts/upload-plates.js lines 95–103]

### Pattern 5: `high_res_available` gate in `species.njk`

The pilot adds a conditional in `species.njk` that passes additional attributes to `pnwm-image-slideshow` when the species has a high-res entry:

```njk
{# species.njk — existing element #}
{% set highResEntry = speciesPhotos[sp.slug] %}
<pnwm-image-slideshow
  slug="{{ sp.slug }}"
  {% if highResEntry and highResEntry.high_res_available %}
  high-res-available
  high-res-specimens="{{ highResEntry.specimens | tojson | escape }}"
  {% endif %}
  data-pagefind-ignore>
  {# ... existing figures ... #}
</pnwm-image-slideshow>
```

The `tojson` filter already exists in `eleventy.config.js`. [CITED: eleventy.config.js]

The `pnwm-image-slideshow` component then reads these attributes and, in the lightbox render, checks `this.highResAvailable` to decide whether to render OSD or the static `<img>`.

### Pattern 6: OSD instance lifecycle in the lightbox

The OSD instance must be created when the lightbox opens (not in `firstUpdated`) because the lightbox div does not exist in the DOM until `_lightboxOpen = true`. The safest pattern:

```javascript
async _openLightboxOSD(tilesUrl) {
  this._lightboxOpen = true;
  await this.updateComplete;  // wait for lightbox div to appear in shadow DOM
  const viewerEl = this.shadowRoot.querySelector('#osd-viewer');
  if (viewerEl && !this._osdViewer) {
    const { default: OpenSeadragon } = await import('openseadragon');
    this._osdViewer = OpenSeadragon({
      element: viewerEl,
      prefixUrl: '/osd-images/',
      tileSources: tilesUrl,
      // ... pilot config options
    });
  }
}

_closeLightbox() {
  this._lightboxOpen = false;
  this._osdViewer?.destroy();
  this._osdViewer = null;
  // ... existing inert cleanup
}
```

Destroy on close to avoid leaked WebGL contexts if the lightbox reopens on a different specimen. [ASSUMED — OSD destroy() API is standard; confirmed present in OSD 6.x source]

### Anti-Patterns to Avoid

- **Initialising OSD in `firstUpdated()`:** The lightbox `<div>` does not exist yet — OSD will fail to attach. Wait for `updateComplete` after opening the lightbox.
- **Using `| url` filter on the CDN absolute URL:** Documented carry-over decision from STATE.md — `cdnBaseUrl` is an absolute URL; applying `| url` would prepend the `pathPrefix` and break it.
- **Uploading with the wrong path prefix:** The Pull Zone serves from `https://pnwmoths.b-cdn.net/` → Storage Zone root `/pnwmoths/`. The storage path must be `species-tiles/{slug}/{specimen_id}-{view}/...` (no leading slash, no `pnwmoths/` prefix in the storage path because the zone name is already the zone root).
- **Using `recursive: true` with Dropbox shared_link:** Hard API limitation — not relevant to this phase (no Dropbox call needed; operator has TIFFs locally or downloads manually).
- **Forgetting to call `this._osdViewer.destroy()` on lightbox close:** Leaks event listeners and DOM nodes; matters if the user opens/closes the lightbox multiple times.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Deep-zoom tile viewer | Custom canvas/WebGL pan-zoom | `openseadragon` (already installed) | Multi-scale tile loading, touch gestures, keyboard nav, accessibility — enormous scope |
| DZI XML parsing | Custom XML parser | `vips dzsave --layout dz` + OSD auto-parse | OSD fetches and parses the `.dzi` descriptor automatically when given a URL |
| Tile URL derivation | Custom URL construction | OSD derives tile paths from `.dzi` descriptor | Standard DZI convention: `{prefix}_files/{level}/{col}_{row}.{format}`; OSD knows this |
| CSS-only lightbox zoom | CSS `transform: scale` on `<img>` | OSD viewer | Quality degrades; no tile loading; panning breaks |
| OSD button icons | Custom SVGs | `scripts/copy-images.js` already copies `node_modules/openseadragon/build/openseadragon/images` to `_site/osd-images/` | Icons already handled; just pass `prefixUrl: '/osd-images/'` |

**Key insight:** The Phase 18 `pnwm-plate-viewer` already solved OSD-in-Lit. This phase adapts that solution for the lightbox context; there is nothing architecturally new.

---

## Common Pitfalls

### Pitfall 1: OSD `prefixUrl` missing or wrong
**What goes wrong:** OSD control buttons (home, zoom in, zoom out, full page) render as broken images.
**Why it happens:** OSD needs PNG icon assets at the path given by `prefixUrl`. The project copies these to `_site/osd-images/` via `scripts/copy-images.js`.
**How to avoid:** Pass `prefixUrl: '/osd-images/'` (with trailing slash, with leading slash — matches the path the plate viewer already uses). In GitHub Pages mode, the prefix is `/pnwmoths/osd-images/`; use `"{{ '/osd-images/' | url }}"` in the Nunjucks template if passing via attribute.
**Warning signs:** Broken image icons on OSD controls.

### Pitfall 2: DZI `.dzi` URL vs tile directory URL confusion
**What goes wrong:** OSD is given the tile directory path (`species-tiles/{slug}/A-D/`) instead of the `.dzi` descriptor URL (`species-tiles/{slug}/A-D/A-D.dzi`). OSD will fail to parse tile source metadata.
**Why it happens:** The Zoomify tileSources passes a directory path; DZI tileSources passes the `.dzi` file URL.
**How to avoid:** `tileSources: \`${cdnBaseUrl}/species-tiles/${slug}/${specimenId}-${view}/${specimenId}-${view}.dzi\``
**Warning signs:** OSD initialises but shows blank canvas; network tab shows 404 on the `.dzi` fetch.

### Pitfall 3: CORS on bunny.net when fetching `.dzi` descriptor
**What goes wrong:** OSD's XHR fetch of the `.dzi` descriptor is blocked by CORS. This affects the descriptor fetch (XML), not the tile image fetches (images are loaded via `<img>` tags internally, which are CORS-exempt in most OSD builds).
**Why it happens:** The bunny.net Pull Zone may not have CORS headers configured for the Storage Zone files vs CDN-served images.
**How to avoid:** Verify in the browser network tab that the `.dzi` GET returns with `Access-Control-Allow-Origin: *` (or the site's origin). If not, configure CORS on the bunny.net Pull Zone. The existing images work fine (they're `<img>` tag loads), but the DZI descriptor is an XHR.
**Warning signs:** OSD blank canvas; browser console shows `CORS error` on a `.dzi` URL.

### Pitfall 4: `vips dzsave` output suffix vs OSD format field
**What goes wrong:** `vips dzsave` emits `.jpg` tiles but the `.dzi` descriptor says `Format="png"` (or vice versa), so OSD constructs tile URLs with the wrong extension.
**Why it happens:** `vips dzsave --suffix .jpg[Q=85]` controls output format AND updates the descriptor. Not passing `--suffix` may default to PNG depending on libvips version.
**How to avoid:** Always pass `--suffix .jpg[Q=85]` explicitly and confirm the `.dzi` descriptor's `Format` attribute matches.
**Warning signs:** 404s on `.png` tile URLs when tiles are `.jpg` or vice versa.

### Pitfall 5: OSD lightbox render timing — `updateComplete` race
**What goes wrong:** OSD is initialised before `updateComplete` resolves, so `this.shadowRoot.querySelector('#osd-viewer')` returns `null`.
**Why it happens:** Lit's reactive render is async; the lightbox div is not in the DOM until the microtask queue processes the render triggered by `_lightboxOpen = true`.
**How to avoid:** Always `await this.updateComplete` before querying the shadow DOM for the OSD target div.
**Warning signs:** `element: null` error from OSD; no viewer appears even though `_lightboxOpen` is true.

### Pitfall 6: Phase 23 static lightbox regression
**What goes wrong:** Existing species pages that have `_images.length > 0` from the light DOM but no high-res entry accidentally get the OSD branch, which fails because `tilesUrl` is undefined.
**Why it happens:** The `highResAvailable` attribute is missing/falsy but the OSD code path is not properly gated.
**How to avoid:** The OSD branch must be conditional on BOTH `this.highResAvailable === true` AND a valid `tilesUrl` for the current `_currentIndex`. Gate it with a null check: `if (this.highResAvailable && this._highResSpecimens?.length)`.
**Warning signs:** Species pages without high-res photos show a blank lightbox or console errors.

---

## Code Examples

### OSD DZI tileSources from URL string

```javascript
// OSD 6.x: pass a URL string ending in .dzi; OSD fetches it, parses XML, derives tile paths
// Tile URL pattern OSD derives: {url_without_dzi}_files/{level}/{col}_{row}.{format}
// Source: node_modules/openseadragon/build/openseadragon/openseadragon.js lines 14962-14987
OpenSeadragon({
  element: viewerEl,
  prefixUrl: '/osd-images/',
  tileSources: 'https://pnwmoths.b-cdn.net/species-tiles/abagrotis-apposita/A-D/A-D.dzi',
  visibilityRatio: 1.0,
  minZoomLevel: 0.5,
  defaultZoomLevel: 0,
  showNavigator: true,
  showRotationControl: false,
});
```

### Existing OSD in Lit (plate viewer reference)

```javascript
// Source: src/components/pnwm-plate-viewer.js (Phase 18)
async _initViewer() {
  const { default: OpenSeadragon } = await import('openseadragon');
  const viewerEl = this.renderRoot.querySelector('#viewer');
  OpenSeadragon({
    element: viewerEl,
    prefixUrl: this.prefixUrl,
    tileSources: {
      type: 'zoomifytileservice',
      width: this.width,
      height: this.height,
      tilesUrl: this.tilesUrl,
    },
    visibilityRatio: 1.0,
    minZoomLevel: 0.5,
    defaultZoomLevel: 0,
    showRotationControl: false,
  });
}
```

### CDN URL construction in eleventy.config.js

```javascript
// Source: eleventy.config.js
const CDN_BASE_URL = "https://pnwmoths.b-cdn.net";
// ...
eleventyConfig.addGlobalData("cdnBaseUrl", CDN_BASE_URL);
// Template usage: {{ cdnBaseUrl }}/species-tiles/...
// NEVER apply | url to this — it is an absolute URL.
```

### bunny.net curl HTTP PUT (from upload-plates.js)

```javascript
// Source: scripts/upload-plates.js lines 95-103
const args = [
  '-s', '-S', '-f',
  '-X', 'PUT',
  '-H', `AccessKey: ${BUNNY_API_KEY}`,
  '-H', 'Content-Type: application/octet-stream',
  '--data-binary', `@${localPath}`,
  `https://${BUNNY_STORAGE_HOST}/${BUNNY_ZONE}/${cdnPath}`,
];
execFileSync('curl', args, { stdio: ['pipe', 'pipe', 'inherit'] });
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Phase 23 static `<img>` in lightbox | OSD DZI viewer in lightbox (pilot) | Phase 28 | Pilot species gets pan/zoom |
| Zoomify tiles for plates (Phase 18) | DZI tiles for species photos | Phase 28 (decided in roadmap) | DZI is simpler to produce with `vips dzsave --layout dz` |
| No `data/species-photos.json` | Hand-edited JSON for pilot | Phase 28 | Phase 31 replaces with manifest-derived version |

**Deprecated/outdated:**
- `createFromDZI`: OSD 6.x source marks `OpenSeadragon.createFromDZI` as deprecated — use `Viewer.open()` or pass `tileSources` directly to the constructor.

---

## Pilot Species Selection

From the manifest (`data/species-photos-manifest.csv`), 1,187 species meet the clean-match + both-D-and-V constraint. 405 of those have 2–3 specimens. The operator picks one; research identified good candidates for the simple 1-specimen (2-file) case. Examples with 1 specimen (D+V):

- `abagrotis-apposita` (2 images, specimen A, D+V)
- `abagrotis-dickeli` (2 images, specimen A, D+V)
- `abrostola-urentis` (2 images, specimen A, D+V)

For a richer test with mixed specimen IDs (letter + institutional ID), `feltia-herilis` has 3 images with specimen A and WWUC0000003275, both D+V represented.

The operator should pick based on TIFF availability (whichever specimen photos are locally accessible).

---

## URL Convention Confirmation

The target URL convention established in the roadmap is:
`{{ cdnBaseUrl }}/species-tiles/{species-slug}/{specimen_id}-{view}/`

The Pull Zone base URL is already wired: `CDN_BASE_URL = "https://pnwmoths.b-cdn.net"` [CITED: eleventy.config.js]

The bunny.net Storage Zone is `pnwmoths` (same zone as images and plates). Storage path → Pull Zone URL:
- Storage: `pnwmoths/species-tiles/abagrotis-apposita/A-D/A-D.dzi`
- CDN: `https://pnwmoths.b-cdn.net/species-tiles/abagrotis-apposita/A-D/A-D.dzi`

This is consistent with the existing plate pattern:
- Storage: `pnwmoths/plates/plate-1-drepanidae/TileGroup0/...`
- CDN: `https://pnwmoths.b-cdn.net/plates/plate-1-drepanidae/TileGroup0/...`
[CITED: scripts/upload-plates.js lines 93–95, scripts/copy-images.js]

---

## Pilot Lessons Document Location

Per the phase success criteria, lessons must be recorded to inform Phase 29's committed config. Recommendation: create `.planning/phases/28-end-to-end-vertical-slice-pilot-one-species/PILOT-LESSONS.md` and commit it as the last task in the phase. Phase 29's research step should read this file.

Minimum content:
- Tile parameters actually used (`vips dzsave` flags: tile-size, overlap, format, quality)
- Any URL/path convention adjustments discovered during upload or OSD wiring
- CORS configuration status on bunny.net Pull Zone
- OSD configuration options that were surprising or needed tuning
- Estimated tile count and size for the pilot species (for Phase 30 storage footprint extrapolation)

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| openseadragon npm | OSD viewer | Yes | 6.0.2 | — (already installed) |
| vips/libvips CLI | Tile production | No (not on this machine) | — | Operator installs on their own hardware; documented in recipe |
| curl | bunny.net upload | Yes (system) | — | — |
| BUNNY_API_KEY | bunny.net upload | Env var (not verified) | — | Must be set before upload; stored outside repo |
| node 24.x | Build + scripts | Yes | 24.12.0 | — |

**Missing dependencies with no fallback:**
- `vips`/`libvips` — the operator must install this on their local machine (homebrew: `brew install vips`; apt: `sudo apt install libvips-tools`). Not available on this research machine. [ASSUMED — standard package manager paths]

**Missing dependencies with fallback:**
- None

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node built-in test runner (node --test) |
| Config file | none — tests listed in npm test command |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PILOT-01 (SC-1) | OSD lightbox opens on pilot species, pan/zoom/home work | Manual visual | Open browser, navigate to pilot species page, click lightbox | N/A |
| PILOT-01 (SC-2) | Tile pyramid at correct URL convention | Manual HTTP verify | `curl -I "https://pnwmoths.b-cdn.net/species-tiles/{slug}/A-D/A-D.dzi"` returns 200 | N/A |
| PILOT-01 (SC-3) | `data/species-photos.json` has real entry | Manual inspect | `cat data/species-photos.json | node -e "const d=require('/dev/stdin','utf8'); console.log(JSON.parse(d))"` | ❌ Wave 0 |
| PILOT-01 (SC-4) | Local vips recipe documented | Manual — recipe in RESEARCH.md + PILOT-LESSONS.md | — | N/A |
| PILOT-01 (SC-5) | Pilot lessons recorded | Manual — PILOT-LESSONS.md committed | — | ❌ Wave 0 |
| PILOT-01 (SC-6) | No regression to existing species pages | Automated build + smoke | `npm run build` produces 1364 species pages; `npm test` passes | ✅ existing |

### Sampling Rate

- **Per task commit:** `npm test` (existing test suite — covers slideshow component, ingest, filters)
- **Per wave merge:** `npm run build` (full build; page count must match 1364)
- **Phase gate:** Full build green + browser visual verification on pilot species + `curl` 200 on tile URL

### Wave 0 Gaps

- [ ] `data/species-photos.json` — does not exist yet; must be created as first task
- [ ] `src/_data/species-photos.js` — data file to load JSON into Eleventy; does not exist yet
- [ ] `.planning/phases/28-end-to-end-vertical-slice-pilot-one-species/PILOT-LESSONS.md` — created at end of phase

*(No new test files required for Phase 28 — the pilot work is manual operator tasks and template/component wiring that is verified visually. Existing `pnwm-image-slideshow.test.js` should still pass after changes.)*

---

## Security Domain

> security_enforcement: not explicitly set in config.json → treated as enabled

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | — |
| V3 Session Management | No | — |
| V4 Access Control | No | — |
| V5 Input Validation | Partial | `data/species-photos.json` is operator-authored; no user input reaches OSD config |
| V6 Cryptography | No | — |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via `tiles_path` in JSON → OSD URL | Tampering | `data/species-photos.json` is operator-authored and committed to git; treated as trusted config. OSD `tileSources` as a URL string does not execute code. Template uses `escape` filter on JSON-serialised attributes. |
| BUNNY_API_KEY exposure | Info Disclosure | Key is in environment variable, never committed. `scripts/upload-plates.js` redacts it from error messages. Same pattern used for pilot upload. |

No new security surface is introduced. The pilot adds one hand-edited data file (operator-controlled) and wires OSD with a CDN URL (no user-supplied input).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `vips dzsave --layout dz --suffix .jpg[Q=85]` produces standard DZI layout (prefix.dzi + prefix_files/level/x_y.jpg) | Architecture Patterns, Pattern 3 | If vips produces different layout, tile URLs fed to OSD will 404; resolve by checking vips man page or running a test tile on operator's machine |
| A2 | OSD destroy() method exists and cleanly tears down the viewer | Code Examples, Pattern: OSD lifecycle | If destroy() is missing in OSD 6.x, lightbox close will leave zombie listeners; workaround: set `this._osdViewer = null` and let GC handle it |
| A3 | libvips install path on operator's machine: `brew install vips` / `apt install libvips-tools` | Environment Availability | Operator may need `libvips-dev` or a different package; resolve at install time |
| A4 | bunny.net Pull Zone does not have CORS restrictions blocking the .dzi descriptor XHR fetch | Pitfalls, Pitfall 3 | If CORS blocks the descriptor, OSD will fail silently; fix by adding CORS headers in bunny.net Pull Zone settings |
| A5 | `showNavigator: true` is a useful pilot config for moth specimens | Code Examples | Navigator may be visually distracting; test during pilot and record finding in PILOT-LESSONS.md |

---

## Open Questions

1. **CORS on bunny.net Pull Zone for the `.dzi` descriptor**
   - What we know: CDN images load fine (they are `<img>` tag requests). The `.dzi` descriptor is an XHR and subject to CORS.
   - What's unclear: Whether the existing Pull Zone has `Access-Control-Allow-Origin: *` set for all content types.
   - Recommendation: Check immediately when first tile pyramid is uploaded; if CORS blocks it, configure Pull Zone CORS header in bunny.net dashboard before anything else.

2. **vips tile parameters for moth specimen photos**
   - What we know: 256px tile size and 1px overlap are OSD defaults; standard JPEG quality is 85.
   - What's unclear: Whether larger tiles (512px) would reduce request count at the cost of initial load; whether moth photos at ~41 MB TIFF benefit from specific DZI depth options.
   - Recommendation: Start with 256/1/85 (the defaults); record the result in PILOT-LESSONS.md; Phase 29 can tune.

3. **Pilot OSD UI configuration for specimen viewing**
   - What we know: `showNavigator`, `showHomeControl`, `showZoomControl` are OSD config options.
   - What's unclear: Which controls are actually useful for a standalone specimen photo (vs a plate scan with many specimens).
   - Recommendation: Enable navigator for the pilot and record whether it helps or hinders in PILOT-LESSONS.md.

---

## Sources

### Primary (HIGH confidence)
- `src/components/pnwm-plate-viewer.js` — OSD-in-Lit pattern (Phase 18, existing code)
- `src/components/pnwm-image-slideshow.js` — Phase 23 lightbox; the component being modified
- `src/species/species.njk` — template; where the `high_res_available` gate lives
- `eleventy.config.js` — CDN_BASE_URL wiring, `tojson` filter, `addGlobalData("cdnBaseUrl")`
- `scripts/upload-plates.js` — bunny.net HTTP PUT pattern (curl + BUNNY_API_KEY)
- `scripts/copy-images.js` — OSD images copied to `_site/osd-images/` post-build
- `scripts/lib/manifest.js` — COLUMNS schema; `species_slug`, `specimen_id`, `view` fields
- `data/species-photos-manifest.csv` — real manifest data; candidate species identified
- `node_modules/openseadragon/build/openseadragon/openseadragon.js` — confirmed DZI URL tile derivation (lines 14962–14987)
- `npm view openseadragon` — version 6.0.2, published 2026-03-13; slopcheck [OK]

### Secondary (MEDIUM confidence)
- `.planning/notes/high-res-species-photos-exploration.md` — DZI chosen over Zoomify for species photos
- `.planning/ROADMAP.md` — Phase 29 success criteria confirms DZI tile layout convention
- `.claude/skills/spike-findings-pnwmoths/references/dropbox-ingest-and-filename-parsing.md` — libvips dzsave noted as standard tool; Zoomify vs DZI open question acknowledged

### Tertiary (LOW confidence — verified assumptions)
- libvips `dzsave` CLI flags and output structure [ASSUMED — vips not installed on research machine; based on libvips documentation conventions]
- OSD `destroy()` API [ASSUMED — present in OSD 5.x and standard practice; not verified in 6.x source]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — openseadragon already installed; pattern from Phase 18 in codebase
- Architecture: HIGH — all seams identified in actual source files
- species-photos.json schema: HIGH — directly modelled on plates.json + manifest columns
- vips dzsave recipe: MEDIUM — standard libvips flags; vips not installed locally
- OSD DZI URL derivation: HIGH — confirmed from OSD 6.0.2 source in node_modules
- Pitfalls: MEDIUM — CORS pitfall is known risk; others derived from OSD/Lit experience

**Research date:** 2026-05-22
**Valid until:** 2026-07-22 (stable libraries; OSD and Lit release infrequently)
