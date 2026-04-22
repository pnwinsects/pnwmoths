# Phase 14: Template Migration - Pattern Map

**Mapped:** 2026-04-22
**Files analyzed:** 4 new/modified files
**Analogs found:** 4 / 4

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `eleventy.config.js` | config | transform | itself (existing `addFilter`/module constant patterns) | exact |
| `src/species/species.njk` | template | request-response | itself (existing `| url` pattern at line 71) | exact |
| `src/glossary/index.njk` | template | request-response | `src/species/species.njk` (same `<img>` pattern) | role-match |
| `src/components/pnwm-taxon-browser.js` | component | event-driven | itself (existing `this._prefix` image src pattern at lines 143, 199) | exact |

## Pattern Assignments

### `eleventy.config.js` (config, transform)

**Analog:** itself — patterns already present in the file

**Existing filter pattern** (lines 21-28):
```js
// Filter to check if a file exists relative to the project root
eleventyConfig.addFilter("fileExists", function (relativePath) {
  return existsSync(resolve(relativePath));
});

// JSON serialization filter for embedding data into script elements
eleventyConfig.addFilter("tojson", function (value) {
  return JSON.stringify(value);
});
```

**New `urlencode` filter — copy this exact shape** (insert after line 28):
```js
// URL-encode filter: handles all reserved URL characters in Django filenames
// (spaces, parentheses, +, #, etc.). Used in CDN URL construction.
eleventyConfig.addFilter("urlencode", v => encodeURIComponent(v));
```

**Existing module-level constant** (lines 12-14):
```js
// bunny.net Pull Zone — public CDN base URL. Not a secret; hard-coded here.
// To update: log in to bunny.net dashboard, find the Pull Zone hostname, paste here.
const CDN_BASE_URL = "https://pnwmoths.b-cdn.net";
```

**New `addGlobalData` call — insert inside `export default function (eleventyConfig) {`** after existing `addFilter` calls:
```js
// Expose CDN base URL to all Nunjucks templates as {{ cdnBaseUrl }}
eleventyConfig.addGlobalData("cdnBaseUrl", CDN_BASE_URL);
```

**Constraints:**
- `addGlobalData` takes a string key and the value directly — no function wrapper needed.
- `CDN_BASE_URL` constant is already at line 14; do not redeclare it.
- No trailing slash on `CDN_BASE_URL` (templates use `{{ cdnBaseUrl }}/path` pattern).

---

### `src/species/species.njk` (template, request-response)

**Analog:** itself — line 48 is the only target; line 71 shows the `| url` pattern for comparison

**Before** (line 48):
```html
<img src="/images/{{ sp.slug }}/{{ img.filename }}"
     alt="{{ sp.genus }} {{ sp.species }}"
     data-photographer="{{ img.photographer }}">
```

**After (locked contract from UI-SPEC):**
```html
<img src="{{ cdnBaseUrl }}/{{ sp.slug }}/{{ img.filename | urlencode }}"
     alt="{{ sp.genus }} {{ sp.species }}"
     data-photographer="{{ img.photographer }}">
```

**Contrast — existing `| url` usage at line 71 (DO NOT apply `| url` to CDN URLs):**
```html
<a href="{{ ('/species/' + slug + '/') | url }}">
```
The `| url` filter prepends `pathPrefix` — correct for local paths, destructive for absolute CDN URLs.

**Constraints:**
- Replace only the `src` attribute value. All other attributes (`alt`, `data-photographer`) unchanged.
- No `srcset` in Phase 14 (deferred — `pnwm-image-slideshow` drops `srcset` on slotted `<img>` in `connectedCallback`).
- No Bunny Optimizer query params on species photos in Phase 14.

---

### `src/glossary/index.njk` (template, request-response)

**Analog:** `src/species/species.njk` (same `<img>` in a Nunjucks loop with CDN URL substitution)

**Before** (lines 41-43):
```html
<img src="{{ ('/images/glossary/' + term.image_filename) | url }}"
     alt="{{ term.term }}"
     width="188" height="225">
```

**After (locked contract from UI-SPEC):**
```html
<img src="{{ cdnBaseUrl }}/glossary/{{ term.image_filename | urlencode }}?width=188&height=225&crop_gravity=north"
     srcset="{{ cdnBaseUrl }}/glossary/{{ term.image_filename | urlencode }}?width=376&height=450&crop_gravity=north 2x"
     alt="{{ term.term }}"
     width="188" height="225">
```

**Constraints:**
- Strip `| url` from the src expression entirely — it corrupts absolute CDN URLs by prepending `pathPrefix`.
- Retain `width="188" height="225"` HTML attributes (match the 1x Optimizer dimensions).
- Bunny Optimizer 1x params: `?width=188&height=225&crop_gravity=north`.
- Bunny Optimizer 2x params for `srcset`: `?width=376&height=450&crop_gravity=north 2x`.
- `srcset` uses `2x` descriptor only (no pixel-width breakpoints in Phase 14).
- No Image Classes in URL (disabled per Phase 13 D-18 — use direct query params).

---

### `src/components/pnwm-taxon-browser.js` (component, event-driven)

**Analog:** itself — existing `this._prefix` image src pattern is what gets replaced

**Existing module-level constants** (lines 3-9):
```js
const STATE_NAMES = {
  BC: 'British Columbia',
  ...
};
```

**New CDN constant — insert at module level before the class definition** (after line 9, before line 11 `/**`):
```js
const CDN_BASE_URL = 'https://pnwmoths.b-cdn.net';
```

**`_renderImageStrip` — image src before** (line 143):
```js
src="${this._prefix}images/${img.species_slug}/${img.filename}"
```

**After (locked contract from UI-SPEC):**
```js
src="${CDN_BASE_URL}/${img.species_slug}/${encodeURIComponent(img.filename)}?height=186"
```

**Full `_renderImageStrip` `imgEl` context** (lines 141-147):
```js
const imgEl = html`<img
  src="${this._prefix}images/${img.species_slug}/${img.filename}"
  alt=""
  loading="lazy"
  style="height:93px;width:auto;object-fit:cover;flex-shrink:0;display:block"
>`;
```
Replace only the `src` template expression. `alt=""`, `loading="lazy"`, and `style` attributes unchanged.

**`_renderSpecies` — image src before** (line 199):
```js
src="${this._prefix}images/${sp.navImage.species_slug}/${sp.navImage.filename}"
```

**After (locked contract from UI-SPEC):**
```js
src="${CDN_BASE_URL}/${sp.navImage.species_slug}/${encodeURIComponent(sp.navImage.filename)}?height=186"
```

**Full `_renderSpecies` `<img>` context** (lines 198-202):
```js
${sp.navImage ? html`<img
  src="${this._prefix}images/${sp.navImage.species_slug}/${sp.navImage.filename}"
  alt="${genusName} ${sp.name}"
  loading="lazy"
>` : ''}
```
Replace only the `src` template expression. `alt`, `loading` unchanged.

**`_prefix` retention rule:** `this._prefix` is used in two other places that MUST NOT change:
- Line 84: `fetch(\`${this._prefix}species-states.json\`)` — keep as-is (local fetch)
- Line 197: `href="${this._prefix}species/${sp.slug}/"` — keep as-is (species page link)

**Constraints:**
- Do NOT add a new `cdn-base-url` Lit property or attribute (D-05 dropped this approach).
- `this._prefix` stays for non-image URLs; CDN_BASE_URL replaces it only in image `src`.
- `encodeURIComponent` (native JS) applied to all filenames — not a helper import.
- `?height=186` Bunny Optimizer param on both nav thumbnail locations (Phase 13 D-11).

---

## Shared Patterns

### `| url` filter — do NOT apply to CDN URLs
**Source:** `src/species/species.njk` line 71, `src/glossary/index.njk` line 41
**Rule:** `| url` prepends `pathPrefix` to relative paths. CDN URLs are absolute (`https://...`) — applying `| url` would corrupt them. Strip `| url` from any CDN `src` expression.

### `urlencode` filter for filenames
**Source:** `eleventy.config.js` `addFilter("urlencode", ...)` (new)
**Apply to:** All `img.filename` and `term.image_filename` references in CDN URL template expressions — both `src` and `srcset`.
```
{{ img.filename | urlencode }}
{{ term.image_filename | urlencode }}
```

### `cdnBaseUrl` global in templates
**Source:** `eleventy.config.js` `addGlobalData("cdnBaseUrl", CDN_BASE_URL)` (new)
**Apply to:** Both Nunjucks templates (`species.njk`, `glossary/index.njk`).
**Usage:** `{{ cdnBaseUrl }}/path/to/image.jpg` — no `| url`, no `| safe` needed.

### `encodeURIComponent` in JS component
**Source:** `pnwm-taxon-browser.js` (new usage, native browser API)
**Apply to:** Both image src construction sites in `_renderImageStrip` (line 143) and `_renderSpecies` (line 199).
**Usage:** `${encodeURIComponent(img.filename)}` — no import needed (native).

---

## No Analog Found

All four files had clear analogs (themselves or close peers). No files lack a pattern reference.

---

## Metadata

**Analog search scope:** `src/`, `eleventy.config.js`
**Files scanned:** 4 source files read in full
**Pattern extraction date:** 2026-04-22
