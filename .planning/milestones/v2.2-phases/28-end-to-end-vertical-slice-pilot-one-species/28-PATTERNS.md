# Phase 28: End-to-End Vertical-Slice Pilot — One Species — Pattern Map

**Mapped:** 2026-05-22
**Files analyzed:** 7 (3 new, 4 modified, plus 1 documentation deliverable)
**Analogs found:** 6 / 7 (one greenfield: the PILOT-LESSONS.md doc; closest analog is RESEARCH.md itself)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `data/species-photos.json` (new) | committed-manifest data file | build-time read, hand-edited | `data/plates.json` | exact (both are committed JSON manifests consumed by an Eleventy `_data` loader for an OSD-backed viewer) |
| `src/_data/species-photos.js` (new) | Eleventy 11ty-data loader | build-time read, returns by-slug map | `src/_data/plates.js` (`MANIFEST_PATH` branch, lines 149-167) + `src/_data/images.js` (by-slug map shape) | exact + role-match (plates.js is the closest OSD-manifest pattern; images.js shows the by-slug map shape we want) |
| `src/components/pnwm-image-slideshow.js` (modified) | Lit web component (lightbox host) | event-driven UI render | itself (Phase 23 baseline) + `src/components/pnwm-plate-viewer.js` (OSD-in-Lit pattern) | exact (this is the file being modified) + exact (plate-viewer is the OSD lifecycle reference) |
| `src/species/species.njk` (modified) | Nunjucks pagination template | build-time render | itself (Phase 23 baseline) + `src/plates/plate.njk` (OSD attribute passing) | exact + exact (plate.njk is the canonical "pass OSD config via attributes" pattern) |
| `eleventy.config.test.js` (modified) | test for build config | unit test | itself | exact (existing test file; smoke-test addition only if planner needs one) |
| `src/components/pnwm-image-slideshow.test.js` (modified) | Lit component unit test | unit test (`node --test`) | itself (Phase 23 baseline) | exact |
| `.planning/phases/28.../PILOT-LESSONS.md` (new) | planning doc, operator-authored | n/a (markdown) | none — greenfield doc; follow shape of `.claude/skills/spike-findings-pnwmoths/references/dropbox-ingest-and-filename-parsing.md` (post-spike findings doc) | partial (no existing per-phase lessons doc in `.planning/phases/`; the references/dropbox-ingest doc is the spiritual analog) |

**Out of scope for new files** (operator commands, no source files): `vips dzsave` invocation and `curl PUT` upload happen on operator hardware following recipes in RESEARCH.md and (later) PILOT-LESSONS.md. No automation scripts are added in this phase — Phase 29/30 own those.

---

## Pattern Assignments

### `data/species-photos.json` (committed JSON data manifest)

**Analog:** `data/plates.json`

**Pattern:** A committed JSON array/object that names the resources OSD will load from CDN. Phase 18 chose JSON-array-of-plates; Phase 28 chooses JSON-object-keyed-by-slug because lookups are by `sp.slug` in the species template (the plates template iterates the array, but species pages need O(1) lookup).

**Shape pattern from `data/plates.json` lines 1-20:**

```json
[
  {
    "number": "0",
    "family": "Commonly Reported Moths 2",
    "slug": "plate-0-commonly-reported-moths-2",
    "width": 2400,
    "height": 3000
  },
  ...
]
```

**Phase 28 adaptation (per RESEARCH.md §Pattern 2 — keyed by slug, not an array):**

```json
{
  "abagrotis-apposita": {
    "high_res_available": true,
    "specimens": [
      { "specimen_id": "A", "view": "D", "tiles_path": "species-tiles/abagrotis-apposita/A-D" },
      { "specimen_id": "A", "view": "V", "tiles_path": "species-tiles/abagrotis-apposita/A-V" }
    ]
  }
}
```

**Conventions to mirror:**
- Plain JSON, committed to git (not generated); same as `data/plates.json`. Phase 31 will replace with a manifest-derived file.
- `tiles_path` is relative to `cdnBaseUrl` (no leading slash, no host) — consistent with how `images.csv.filename` is relative-to-CDN.
- 2-space indentation matches `data/plates.json`.

---

### `src/_data/species-photos.js` (new — Eleventy data file)

**Analog (manifest-load branch):** `src/_data/plates.js` lines 149-167
**Analog (by-slug shape):** `src/_data/images.js` lines 35-67

**Imports pattern** (from `src/_data/plates.js` lines 13-15):

```javascript
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
```

For Phase 28 we only need `readFile` (no directory walking — pure JSON read):

```javascript
import { readFile } from 'node:fs/promises';
```

**Core pattern — manifest-only branch from `src/_data/plates.js` lines 149-167:**

```javascript
const MANIFEST_PATH = new URL('../../data/plates.json', import.meta.url).pathname;

export default async function () {
  if (!existsSync(PLATES_Z_SOURCE)) {
    if (existsSync(MANIFEST_PATH)) {
      const raw = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
      return raw.map(({ number, family, slug, width, height }) => ({
        number,
        family,
        title: `Plate ${number}: ${family.replace(/\s*\([^)]*\)\s*$/, '').trim()}`,
        description: DESCRIPTIONS[number] ?? null,
        slug,
        width,
        height,
      }));
    }
    console.warn(`[plates] Source not found: ${PLATES_Z_SOURCE} — skipping plate data`);
    return [];
  }
  // ... legacy-source branch ...
}
```

**Phase 28 adaptation** (much simpler — no legacy source, no per-record transform; the JSON is the data):

```javascript
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const MANIFEST_PATH = new URL('../../data/species-photos.json', import.meta.url).pathname;

export default async function () {
  if (!existsSync(MANIFEST_PATH)) {
    console.warn(`[species-photos] Manifest not found: ${MANIFEST_PATH} — no high-res species`);
    return {};
  }
  return JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
}
```

**By-slug shape pattern** is already enforced by the JSON file's structure (object keyed by slug); the consumer (`species.njk`) uses `{% set highResEntry = speciesPhotos[sp.slug] %}` — same idiom as `{% set spImages = images[sp.slug] %}` in the existing template.

**Conventions to mirror:**
- File lives in `src/_data/` (Eleventy convention; declared in `eleventy.config.js` `dir.data: "_data"`).
- `export default async function ()` — Eleventy data file convention; matches `plates.js`, `images.js`, `glossary.js`, `species.js`.
- Project is `"type": "module"` (see `package.json` line 6) — ESM imports, top-level await OK in 11ty data files.
- Soft-fail when manifest absent: `console.warn` + return empty (matches plates.js missing-source behavior); does NOT crash the build, so unrelated phases can ship even if the pilot JSON is removed.
- File-URL-based `MANIFEST_PATH` resolver (`new URL('../../data/...', import.meta.url).pathname`) — exact idiom from `src/_data/plates.js` line 149.

---

### `src/components/pnwm-image-slideshow.js` (modified — add OSD branch)

**Analog (own baseline):** `src/components/pnwm-image-slideshow.js` (entire file)
**Analog (OSD-in-Lit pattern):** `src/components/pnwm-plate-viewer.js` lines 1-62

**Existing imports** (line 1 — unchanged):

```javascript
import { LitElement, html, css } from 'lit';
```

No new imports at the top; OSD is dynamically imported in `_initOsdViewer()` (see below).

**OSD lifecycle pattern — adapted from `src/components/pnwm-plate-viewer.js` lines 38-55:**

```javascript
// pnwm-plate-viewer.js — proven pattern
firstUpdated() {
  this._initViewer();
}

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

**Phase 28 adaptation** — the OSD div doesn't exist until the lightbox opens, so initialization moves from `firstUpdated` to a post-`updateComplete` hook fired by `_openLightbox()`. Tile source becomes a **DZI URL string** (not a Zoomify config object). Per RESEARCH.md Pitfall 5 and §Pattern 6:

```javascript
async _openLightbox() {
  this._lightboxOpen = true;
  // ... existing inert + focus logic from lines 158-176 stays ...

  if (this.highResAvailable && this._highResSpecimens?.length) {
    await this.updateComplete;  // wait for lightbox div to mount in shadow DOM
    const viewerEl = this.shadowRoot.querySelector('#osd-viewer');
    if (viewerEl && !this._osdViewer) {
      const { default: OpenSeadragon } = await import('openseadragon');
      const current = this._highResSpecimens[this._currentIndex] ?? this._highResSpecimens[0];
      const dziUrl = `${this.cdnBaseUrl}/${current.tiles_path}/${current.specimen_id}-${current.view}.dzi`;
      this._osdViewer = OpenSeadragon({
        element: viewerEl,
        prefixUrl: this.prefixUrl,           // '/osd-images/' (with pathPrefix applied by template)
        tileSources: dziUrl,
        visibilityRatio: 1.0,
        minZoomLevel: 0.5,
        defaultZoomLevel: 0,
        showNavigator: true,                 // pilot config — record in PILOT-LESSONS.md
        showRotationControl: false,
      });
    }
  }
}

_closeLightbox() {
  this._lightboxOpen = false;
  this._inertedElements.forEach(el => el.removeAttribute('inert'));
  this._inertedElements = [];
  this._osdViewer?.destroy();
  this._osdViewer = null;
}
```

**New `static properties` additions** — extend the existing block at lines 4-10:

```javascript
static properties = {
  slug: { type: String },
  _currentIndex: { state: true },
  _lightboxOpen: { state: true },
  _images: { attribute: false, state: true },
  _stripOverflows: { state: true },
  // additions for Phase 28:
  highResAvailable: { type: Boolean, attribute: 'high-res-available' },
  highResSpecimens: { attribute: 'high-res-specimens' },  // JSON string from template
  cdnBaseUrl: { type: String, attribute: 'cdn-base-url' },
  prefixUrl: { type: String, attribute: 'prefix-url' },
};
```

The `highResSpecimens` attribute is a JSON string (template uses `| tojson | escape`); parse in `connectedCallback`:

```javascript
// in connectedCallback(), after the existing figures-extraction block:
if (this.getAttribute('high-res-specimens')) {
  try {
    this._highResSpecimens = JSON.parse(this.getAttribute('high-res-specimens'));
  } catch (e) {
    console.error('[pnwmoths] Failed to parse high-res-specimens attribute', e);
    this._highResSpecimens = [];
  }
}
```

**Render branch — adapted from existing `render()` lines 227-238** (the `lightbox` template literal):

```javascript
// Existing Phase 23 lightbox (lines 227-238):
const lightbox = this._lightboxOpen
  ? html`
      <div class="lightbox" @click=${(e) => { if (e.target === e.currentTarget) this._closeLightbox(); }}>
        <img src=${current.src} alt=${current.alt}>
        <button
          class="lightbox-close"
          aria-label="Close lightbox"
          @click=${() => this._closeLightbox()}
        >&#x2715;</button>
      </div>
    `
  : '';
```

**Phase 28 adaptation** — gate on **both** `highResAvailable` AND `_highResSpecimens?.length` (per UI-SPEC §Regression constraint and RESEARCH.md Pitfall 6):

```javascript
const useOsd = this.highResAvailable && this._highResSpecimens?.length > 0;
const currentSpecimen = useOsd
  ? (this._highResSpecimens[this._currentIndex] ?? this._highResSpecimens[0])
  : null;

const lightbox = this._lightboxOpen
  ? html`
      <div class="lightbox" @click=${(e) => { if (e.target === e.currentTarget) this._closeLightbox(); }}>
        ${useOsd
          ? html`
              <div id="osd-viewer" class="osd-viewer"></div>
              <p class="caption-line">
                Specimen ${currentSpecimen.specimen_id} ·
                ${currentSpecimen.view === 'D' ? 'Dorsal' : 'Ventral'}
              </p>
            `
          : html`<img src=${current.src} alt=${current.alt}>`}
        <button
          class="lightbox-close"
          aria-label="Close lightbox"
          @click=${() => this._closeLightbox()}
        >&#x2715;</button>
      </div>
    `
  : '';
```

**CSS additions** — append to the existing `static styles = css\`...\`` block (lines 12-79):

```css
.osd-viewer {
  width: 90vw;
  height: 70vh;
  min-height: 400px;
  background: #111;  /* matches pnwm-plate-viewer #viewer background, UI-SPEC §Color */
}
```

Update the existing `.caption-line` rule (line 52) from `font-size: 0.8rem` to `font-size: 0.875rem` per UI-SPEC §Typography (one-pixel consolidation; the spec explicitly approves reverting to `0.8rem` only if specificity conflicts arise, with a note to PILOT-LESSONS.md).

**Conventions to mirror:**
- Dynamic `import('openseadragon')` — already proven in plate-viewer (line 39); Vite code-splits it; the slideshow component stays small for species without high-res.
- `_underscorePrefix` for private methods and state (`_openLightbox`, `_closeLightbox`, `_osdViewer`) — matches the rest of the file (`_handleKeydown`, `_inertedElements`, `_resizeObserver`).
- `this.shadowRoot.querySelector` (Lit shadow DOM access) — matches `plate-viewer.js` line 40 (`this.renderRoot.querySelector`) and existing slideshow usages (lines 134, 147, 173, 210, 215).
- `await this.updateComplete` before shadow-DOM query post-state-change — established Lit idiom; already used in slideshow line 172.
- Destroy + null on close (`this._osdViewer?.destroy(); this._osdViewer = null;`) — RESEARCH.md §Pattern 6; not present in plate-viewer (because plate viewer mounts once and lives forever), so this is the pilot's contribution back into the project's OSD-lifecycle vocabulary.

---

### `src/species/species.njk` (modified — pass high-res attributes to slideshow)

**Analog (own baseline):** `src/species/species.njk` lines 36-62 (the existing `<pnwm-image-slideshow>` block)
**Analog (OSD-attribute-passing):** `src/plates/plate.njk` lines 13-19

**Existing OSD attribute pattern from `src/plates/plate.njk`:**

```njk
<pnwm-plate-viewer
  tiles-url="{{ cdnBaseUrl }}/plates/{{ plate.slug }}/"
  prefix-url="{{ '/osd-images/' | url }}"
  width="{{ plate.width }}"
  height="{{ plate.height }}"
  data-pagefind-ignore>
</pnwm-plate-viewer>
```

Key conventions captured here (carried into the slideshow attributes):
- `{{ cdnBaseUrl }}` interpolated **without** `| url` filter — RESEARCH.md "Anti-Patterns" and STATE.md note: `cdnBaseUrl` is an absolute URL; applying `| url` would prepend the GitHub Pages pathPrefix and break it.
- `prefix-url="{{ '/osd-images/' | url }}"` — `| url` IS applied here because this is a relative app path that needs the GitHub Pages prefix.
- `data-pagefind-ignore` on any element that wraps a JS-only widget.

**Phase 28 adaptation — extend `src/species/species.njk` lines 36-62 per RESEARCH.md §Pattern 5:**

```njk
{% set spImages = images[sp.slug] %}
{% set highResEntry = speciesPhotos[sp.slug] %}
<pnwm-image-slideshow
  slug="{{ sp.slug }}"
  {% if highResEntry and highResEntry.high_res_available %}
  high-res-available
  high-res-specimens="{{ highResEntry.specimens | tojson | escape }}"
  cdn-base-url="{{ cdnBaseUrl }}"
  prefix-url="{{ '/osd-images/' | url }}"
  {% endif %}
  data-pagefind-ignore>
  {# ... existing {% if spImages and spImages.length > 0 %} figure block stays unchanged ... #}
</pnwm-image-slideshow>
```

**Conventions to mirror:**
- The `tojson` filter is registered in `eleventy.config.js` line 37 (`addFilter("tojson", v => JSON.stringify(v))`) — use it; do not roll a new filter.
- The `| escape` after `| tojson` matches the existing safe-JSON-as-attribute pattern; Nunjucks autoescapes by default but explicit `| escape` is the convention used in similar dataset-attribute interpolations elsewhere in this template.
- Conditional attribute block (`{% if highResEntry and highResEntry.high_res_available %} ... {% endif %}`) keeps the no-regression contract: species without an entry get a bare `<pnwm-image-slideshow slug="..." data-pagefind-ignore>` exactly as today.
- The 11ty-data key used in the template is **`speciesPhotos`** (camelCase variable name) but the **file** is `species-photos.js` (kebab) — that's the Eleventy convention; filename → automatic camelCase variable (`species-photos.js` → `speciesPhotos`). Verify by checking other instances: `plates.js` → `plates` (no camelization needed), `images.js` → `images`, `glossary.js` → `glossary`. **Eleventy uses the filename verbatim as the variable name when it's already a valid identifier; for hyphenated names, it camelCases.** [VERIFY during execution; if Eleventy preserves the hyphen, the template must use `speciesPhotos[sp.slug]` vs `species-photos[sp.slug]` — the latter is invalid in Nunjucks bracket syntax; the planner should confirm by reading Eleventy 3.x docs or by renaming the file to `speciesphotos.js` if camelCase fails.]

---

### `src/components/pnwm-image-slideshow.test.js` (modified — add no-regression smoke)

**Analog (own baseline):** `src/components/pnwm-image-slideshow.test.js` (entire file, 45 lines)

**Existing pattern** (lines 1-9):

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PnwmImageSlideshow } from './pnwm-image-slideshow.js';

describe('_formatCaption', () => {
  it('returns location line with locality, state, and elevation', () => {
    const img = { locality: 'Snoqualmie Pass', state: 'WA', elevation: '3000' };
    const result = PnwmImageSlideshow.prototype._formatCaption.call({}, img);
    assert.deepEqual(result, ['Snoqualmie Pass, WA, 3000 ft.']);
  });
  // ...
});
```

**Conventions to mirror:**
- `node --test` (no test runner config; package.json line 22 wires it via `node --test ... src/components/*.test.js`).
- `describe` / `it` from `node:test`; `assert from 'node:assert/strict'`.
- Tests target **methods on the prototype**, called via `.call({}, …)` with a hand-rolled `this` context — pure-function testing, no JSDOM, no Lit render. This is the project's chosen testability boundary.
- **Phase 28 minimum addition** (matches the file's existing scope): the planner should add zero or one test only if pure-function logic is added (e.g., a tile-URL builder helper extracted as a method). The OSD lifecycle itself is verified manually per VALIDATION.md §Manual-Only — not via unit test.

If the planner extracts a small pure helper, e.g.:

```javascript
_buildDziUrl(specimen) {
  return `${this.cdnBaseUrl}/${specimen.tiles_path}/${specimen.specimen_id}-${specimen.view}.dzi`;
}
```

then the unit test follows the existing pattern:

```javascript
describe('_buildDziUrl', () => {
  it('constructs DZI URL from cdnBaseUrl + tiles_path + specimen_id + view', () => {
    const ctx = { cdnBaseUrl: 'https://pnwmoths.b-cdn.net' };
    const specimen = { specimen_id: 'A', view: 'D', tiles_path: 'species-tiles/abagrotis-apposita/A-D' };
    const result = PnwmImageSlideshow.prototype._buildDziUrl.call(ctx, specimen);
    assert.equal(result, 'https://pnwmoths.b-cdn.net/species-tiles/abagrotis-apposita/A-D/A-D.dzi');
  });
});
```

---

### `eleventy.config.test.js` (modified — optional; only if a new global filter is added)

**Analog (own baseline):** `eleventy.config.test.js` (existing; not read in this pass because no new filter is required for Phase 28 — `tojson` and `urlencode` already exist).

**Conventions to mirror:** same `node:test` + `assert/strict` shape as `pnwm-image-slideshow.test.js`.

**Phase 28 expectation:** **likely no change** to this file. The pilot uses only pre-existing Eleventy filters (`| tojson`, `| escape`, `| url`). Flagged here only so the planner can confirm "no change needed" rather than discover the test file mid-execution.

---

### `.planning/phases/28.../PILOT-LESSONS.md` (new — operator-authored deliverable)

**Analog:** **greenfield — no analog in `.planning/phases/`.**

The closest spiritual analog is the post-spike findings doc at `.claude/skills/spike-findings-pnwmoths/references/dropbox-ingest-and-filename-parsing.md`, which captures the same kind of cross-phase "what we learned that should shape the next phase" knowledge.

**Minimum content** (per RESEARCH.md §"Pilot Lessons Document Location" and ROADMAP.md SC-5):

- Tile parameters actually used (`vips dzsave` flags: `--tile-size`, `--overlap`, `--suffix .jpg[Q=85]`, `--layout dz`)
- Any URL/path convention adjustments discovered during upload or OSD wiring
- CORS configuration status on bunny.net Pull Zone for the `.dzi` descriptor XHR (RESEARCH.md Pitfall 3)
- OSD configuration options that were surprising or needed tuning (`showNavigator`, etc.)
- Estimated tile count and size for the pilot species (for Phase 30 storage footprint extrapolation)
- Whether the `0.875rem` caption consolidation survived (UI-SPEC §Typography fallback)

**Style conventions** (from the reference doc):
- Markdown with H2 sections (`## Requirements`, `## How to build it`, `## What to avoid`, `## Constraints`, `## Audit numbers`).
- Append-only — Phase 29 should be able to read it without merge conflicts on future updates.
- Prefer concrete numbers and exact CLI invocations over prose.

**Why greenfield-flagged:** the planner should plan more carefully here because there is no prior per-phase lessons document to copy structure from. The closest patterns are the spike findings doc (above) and the milestone-archive ROADMAPs (`.planning/milestones/v*.md`).

---

## Shared Patterns

### CDN URL construction (applies to species.njk and slideshow component)

**Source:** `eleventy.config.js` lines 14-16, line 57

```javascript
// eleventy.config.js
const CDN_BASE_URL = "https://pnwmoths.b-cdn.net";
// ...
eleventyConfig.addGlobalData("cdnBaseUrl", CDN_BASE_URL);
```

**Apply to:** every template/component that constructs a CDN URL.

**Rule:** `cdnBaseUrl` is **absolute** — NEVER apply `| url` (would prepend `pathPrefix` and break the URL). This rule already shows in `src/plates/plate.njk` line 14 (`tiles-url="{{ cdnBaseUrl }}/plates/..."` — no `| url`) and `src/species/species.njk` line 41 (`src="{{ cdnBaseUrl }}/{{ sp.slug }}/{{ img.filename | urlencode }}"` — no `| url`).

**Phase 28 application:** the DZI URL is built inside the Lit component (in JS) from a `cdn-base-url` attribute the template passes. Template line: `cdn-base-url="{{ cdnBaseUrl }}"` (no `| url`).

---

### `prefix-url` for OSD nav icons (applies to OSD-using components and their templates)

**Source:** `src/plates/plate.njk` line 15 + `scripts/copy-images.js` lines 39-43

```njk
<pnwm-plate-viewer
  prefix-url="{{ '/osd-images/' | url }}"
  ...>
```

```javascript
// scripts/copy-images.js — copies OSD assets to _site/osd-images/
const osdImagesSrc = resolve('node_modules/openseadragon/build/openseadragon/images');
const osdImagesDest = resolve('_site/osd-images');
await cp(osdImagesSrc, osdImagesDest, { recursive: true });
```

**Apply to:** any OSD-using component (Phase 28 adds the slideshow to this list).

**Rule:** `/osd-images/` is a **relative app path** — `| url` IS applied to add the GitHub Pages `/pnwmoths/` prefix when needed. Components receive it as a `prefix-url` attribute.

---

### Lit component naming + module conventions

**Source:** `src/components/pnwm-*.js` files (uniform across the codebase)

- Web-component tag prefix: `pnwm-` (project namespace).
- File name: `pnwm-{feature}.js` (kebab); class name: `Pnwm{Feature}` (PascalCase).
- `customElements.define('pnwm-{feature}', Pnwm{Feature});` at file bottom — every component file ends with this single line.
- Private methods / state begin with `_` (e.g., `_initViewer`, `_currentIndex`, `_osdViewer`).
- `static properties` block uses Lit conventions: `{ type: String }`, `{ attribute: 'kebab-case' }`, `{ state: true }` for reactive non-attribute state.
- Project is `"type": "module"` (`package.json` line 6); always use ESM `import { ... } from 'lit'`.

**Apply to:** all modifications inside `pnwm-image-slideshow.js`.

---

### Test conventions

**Source:** `package.json` line 22, `src/components/pnwm-image-slideshow.test.js`, `scripts/lib/*.test.js`

```
"test": "node --test eleventy.config.test.js scripts/build-data.test.js scripts/check-page-weight.test.js scripts/ingest-photos.test.js scripts/migrate-species.test.js scripts/lib/*.test.js src/components/*.test.js src/_lib/*.test.js"
```

- Built-in `node --test`; no Jest/Vitest config; no watch mode.
- `describe`/`it` from `node:test`; `assert from 'node:assert/strict'`.
- Test files live **next to** the file under test, named `{file}.test.js`. Already picked up by the existing `src/components/*.test.js` glob — **no `package.json` change needed** for any new component test.
- Pure-function testing via `Class.prototype.method.call({}, args)` — no JSDOM, no Lit render harness.

**Apply to:** any test additions in `pnwm-image-slideshow.test.js`. **Most Phase 28 verification is manual per VALIDATION.md** — keep unit-test additions narrow.

---

### bunny.net HTTP PUT upload (applies to operator-side pilot upload; NOT to any committed script in Phase 28)

**Source:** `scripts/upload-plates.js` lines 30-32, lines 96-103

```javascript
const BUNNY_STORAGE_HOST = process.env.BUNNY_STORAGE_HOST ?? 'la.storage.bunnycdn.com';
const BUNNY_ZONE = process.env.BUNNY_ZONE ?? 'pnwmoths';
const BUNNY_API_KEY = process.env.BUNNY_API_KEY ?? '';

// ...
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

**Apply to:** the operator's manual upload step for the pilot tile pyramid. This is **not** a new script in Phase 28 — RESEARCH.md and ROADMAP.md sub-decisions explicitly defer automation. The operator may run a short shell loop following this exact `curl` shape. Document the command (with the actual `species-tiles/{slug}/...` paths) in PILOT-LESSONS.md.

**Conventions to mirror in the recipe:**
- `BUNNY_API_KEY` from environment; never hardcoded; never logged. The `redact()` pattern in `scripts/ingest-photos.js` lines 71-75 shows the project-wide redaction idiom if any wrapper script *is* written.
- Storage path: `species-tiles/{slug}/{specimen_id}-{view}/...` — no leading slash, no `pnwmoths/` prefix in the storage path (the zone name `pnwmoths` is the zone root).

---

### Operator runbook style (applies to PILOT-LESSONS.md if it accumulates recipe info)

**Source:** `_instructions/ADDING_PLATE.md` (closest analog for "OSD + bunny.net + CDN-verify" workflows) and `_instructions/INGESTING_HIGH_RES_PHOTOS.md` (closest analog for "real run, real env vars, real verification")

Both files share:
- `# Task: ...` H1
- `## What This Changes` (or equivalent) up top — lists touched files
- `## Steps` numbered list with **exact** copy-pasteable shell commands
- `## Verify` block with `curl -sI` or build-output checks and expected outcomes
- `## When Things Go Wrong` failure-mode table

PILOT-LESSONS.md may borrow the `## Verify` and shell-command style, but is itself a **findings doc, not a runbook** — the runbook for vips/upload steps belongs in Phase 29's runbook, seeded by these pilot lessons.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `.planning/phases/28.../PILOT-LESSONS.md` | post-phase findings doc | n/a | No prior `.planning/phases/*/PILOT-LESSONS.md` exists. The closest model is the post-spike findings doc at `.claude/skills/spike-findings-pnwmoths/references/dropbox-ingest-and-filename-parsing.md`. Planner should treat structure as discretionary, keep it concise, and ensure Phase 29's research step can read it. |

No other greenfield files.

---

## Metadata

**Analog search scope:**
- `src/components/` (Lit components, including `pnwm-plate-viewer.js`, `pnwm-image-slideshow.js`, test files)
- `src/_data/` (Eleventy data loaders — `plates.js`, `images.js`, `glossary.js`, `species.js`)
- `src/species/`, `src/plates/`, `src/_includes/` (Nunjucks templates and layouts)
- `data/` (committed JSON/CSV manifests, including `plates.json`, `species-photos-manifest.csv`)
- `scripts/` (Node tooling, especially `upload-plates.js`, `copy-images.js`, `ingest-photos.js`)
- `_instructions/` (operator runbook style references)
- `.claude/skills/spike-findings-pnwmoths/` (project-specific validated patterns)
- `eleventy.config.js` + `eleventy.config.test.js` (filters, globals, transforms)
- `package.json` (build/test wiring, module type, npm scripts)

**Files scanned in this pass:** 16 (RESEARCH.md, UI-SPEC.md, VALIDATION.md, ROADMAP.md, README.md, package.json, SKILL.md, plate-viewer.js, image-slideshow.js, plates.js, images.js, species.njk, plate.njk, upload-plates.js, eleventy.config.js, copy-images.js) plus targeted reads of dropbox-ingest reference, ingest-photos.js head, species-photos-manifest.csv head, ADDING_PHOTO/ADDING_PLATE/INGESTING_HIGH_RES_PHOTOS, plates.json head, image-slideshow.test.js, glossary.js, species.js.

**Pattern extraction date:** 2026-05-22
