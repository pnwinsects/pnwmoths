# Architecture: CDN_BASE_URL Integration

**Milestone:** v1.4 Image CDN
**Researched:** 2026-04-21
**Confidence:** HIGH — all integration points verified against existing source files

---

## Decision Summary

`CDN_BASE_URL` is read in `eleventy.config.js` alongside `pathPrefix`, exposed as an
Eleventy global data value, and used directly in templates as a string prefix on image
filenames. `copy-images.js` loses its species photo copy block (images are no longer in
the repo). The Vite `base`/`pathPrefix` interaction is unchanged. GitHub Actions
replaces the LFS checkout with a plain checkout and passes `CDN_BASE_URL` from a
repository secret.

---

## 1. Environment Variable Flow

### Local development

Create `.env` at the project root (add to `.gitignore`, commit `.env.example`):

```
CDN_BASE_URL=https://your-zone.b-cdn.net
```

Node 20.6+ supports `--env-file` natively — no dotenv package needed. Add it to the
`build:eleventy` invocation in `package.json`:

```json
"build:eleventy": "node --env-file=.env node_modules/.bin/eleventy"
```

Alternatively, contributors can `export CDN_BASE_URL=...` in their shell — either
works because `eleventy.config.js` reads `process.env.CDN_BASE_URL` directly.
The `--env-file` approach is better for the `_instructions/` contributor workflow
because it is self-documenting.

### eleventy.config.js

Read the variable at module load time, parallel to the existing `pathPrefix` pattern:

```js
const pathPrefix = process.env.GITHUB_PAGES ? "/pnwmoths/" : "/";
const cdnBaseUrl = (process.env.CDN_BASE_URL ?? '').replace(/\/$/, '');

// Fail fast in CI so a missing secret is caught at build time, not at runtime.
if (!cdnBaseUrl && process.env.GITHUB_PAGES) {
  throw new Error('CDN_BASE_URL must be set when GITHUB_PAGES=true');
}
```

The trailing-slash trim is a safety guard: if `CDN_BASE_URL` is set to
`https://cdn.example.com/`, templates that write `{{ cdnBaseUrl }}/{{ filename }}`
would produce a double-slash. Trimming at the source is safer than trusting every
template author to omit the slash.

Expose as Eleventy global data so every template reads it without imports:

```js
eleventyConfig.addGlobalData('cdnBaseUrl', cdnBaseUrl);
```

`addGlobalData` is the correct Eleventy 3.x mechanism: values are available as
top-level variables in all Nunjucks templates and data files, exactly the same as
data returned from `src/_data/*.js` files. No plugin required.

### Failing gracefully in PR builds

The `throw` guard fires only when `GITHUB_PAGES=true`. PR builds run without that
variable, so the empty-string fallback applies. Image `src` attributes in PR builds
will be malformed (e.g., `src="/slug/file.jpg"`) but pages build successfully. This
is acceptable for CI link-checking with the CDN domain excluded from lychee.

---

## 2. Template Usage

### Convention

`CDN_BASE_URL` has no trailing slash (enforced in `eleventy.config.js`). Template paths
have no leading slash. Image URL construction is always:

```
{{ cdnBaseUrl }}/{{ slug }}/{{ filename }}
```

No `| url` filter. The `| url` filter prepends `pathPrefix` (e.g., `/pnwmoths/`) to
site-relative paths — it would corrupt an absolute `https://` URL. CDN URLs are
absolute and must never pass through `| url`.

### species.njk

Replace:

```nunjucks
<img src="/images/{{ sp.slug }}/{{ img.filename }}"
     alt="{{ sp.genus }} {{ sp.species }}"
     data-photographer="{{ img.photographer }}">
```

With:

```nunjucks
<img src="{{ cdnBaseUrl }}/{{ sp.slug }}/{{ img.filename }}"
     alt="{{ sp.genus }} {{ sp.species }}"
     data-photographer="{{ img.photographer }}">
```

### glossary/index.njk

Replace:

```nunjucks
<img src="{{ ('/images/glossary/' + term.image_filename) | url }}"
     alt="{{ term.term }}"
     width="188" height="225">
```

With:

```nunjucks
<img src="{{ cdnBaseUrl }}/glossary/{{ term.image_filename }}"
     alt="{{ term.term }}"
     width="188" height="225">
```

The `| url` call was there because the path was site-relative. Now it is CDN-absolute.

### base.njk — header banner

The banner image (`src/images/header.png`) is a static site asset, not a species photo.
It stays at `/images/header.png`, served from `_site/images/`, copied by
`copy-images.js`. Do NOT add `cdnBaseUrl` to `base.njk`.

### Nunjucks macro (optional, recommended for resize params)

If bunny.net Image Optimizer query parameters (e.g., `?width=800`) are needed,
define a macro in `src/_includes/macros.njk` rather than duplicating URL construction
in every template. Without resize params, direct interpolation as shown above is
sufficient and simpler.

---

## 3. pnwm-taxon-browser.js — Runtime Image URLs

The web component constructs image `src` attributes at runtime using `this._prefix`
(the `path-prefix` attribute from the template) and filenames from the embedded taxon
JSON. The component currently writes:

```js
src="${this._prefix}images/${img.species_slug}/${img.filename}"
```

After migration, the component must receive the CDN base URL separately from
`path-prefix` (which controls internal site navigation links, not image CDN URLs).

**Add a `cdn-base-url` attribute to the component.**

In `browse/index.njk`:

```nunjucks
<pnwm-taxon-browser
  path-prefix="{{ '/' | url }}"
  cdn-base-url="{{ cdnBaseUrl }}">
</pnwm-taxon-browser>
```

In `pnwm-taxon-browser.js`, add to `static get properties()`:

```js
'cdn-base-url': { type: String }
```

Replace all occurrences of `${this._prefix}images/${img.species_slug}/${img.filename}`
with `${this['cdn-base-url']}/${img.species_slug}/${img.filename}`.

There are two call sites in `_renderImageStrip` and one in `_renderSpecies` (the
`sp.navImage` path). Check the full component for any additional image src constructions.

---

## 4. Vite / pathPrefix Interaction — No Changes

No changes are needed in the Vite configuration block in `eleventy.config.js`.

The existing architectural rule (from PROJECT.md Key Decisions): "Let Vite add base
prefix; don't pre-process with `| url`." CDN URLs are absolute (`https://...`). Vite's
HTML transformer rewrites only relative and root-relative asset references — it ignores
`https://` hrefs. Therefore:

- Template: `src="{{ cdnBaseUrl }}/slug/file.jpg"` — Vite leaves it untouched. Correct.
- `base: pathPrefix` continues to apply only to bundled JS imports and internal asset
  references. No interaction with CDN URLs.

The `pathPrefix` variable and its conditional logic remain identical.

---

## 5. Changes to copy-images.js

### Remove

The species photo copy block is removed entirely — the `images/` repo-root directory
will no longer exist after LFS removal:

```js
// DELETE: species photos (managed via Git LFS, stored in repo root images/)
const speciesSrc = resolve('images');
const speciesDest = resolve('_site/images');
await cp(speciesSrc, speciesDest, { recursive: true });
console.log('Copied images: images/ -> _site/images/');
```

### Keep unchanged

All remaining copy operations stay:

1. `src/images/ -> _site/images/` — banner image (header.png)
2. `src/styles/ -> _site/styles/` — theme CSS
3. `@picocss/pico/css/pico.min.css -> _site/css/pico.min.css`
4. `node_modules/openseadragon/.../images -> _site/osd-images/`

The `eleventy.config.js` passthrough copy `{ "src/images": "images" }` is NOT removed —
it copies `src/images/` (which contains `header.png`), not the `images/` repo root
directory (which held LFS-tracked species photos). The passthrough copy is for the
banner, which stays.

---

## 6. GitHub Actions CI/CD

### deploy.yml

1. Replace LFS checkout with plain checkout:

   ```yaml
   # Before:
   - uses: nschloe/action-cached-lfs-checkout@...
   
   # After:
   - uses: actions/checkout@v4
   ```

2. Pass `CDN_BASE_URL` from repository secrets to the build step:

   ```yaml
   - run: npm run build
     env:
       CDN_BASE_URL: ${{ secrets.CDN_BASE_URL }}
   ```

   `GITHUB_PAGES=true` is already set by `actions/configure-pages` (the step that runs
   before the build). The fail-fast guard in `eleventy.config.js` will catch a missing
   or unset secret immediately.

### pr-check.yml

Replace the LFS checkout with `actions/checkout@v4`. Do not add `CDN_BASE_URL` to PR
builds — the empty-string fallback in `eleventy.config.js` handles the missing var
(no throw because `GITHUB_PAGES` is not set in PR builds). The lychee link checker
will report broken CDN image URLs; exclude the CDN hostname in `lychee.toml` to
prevent false failures.

---

## 7. File Inventory: New vs Modified

### Modified files

| File | Change |
|------|--------|
| `eleventy.config.js` | Read `CDN_BASE_URL`; trim trailing slash; fail-fast guard; `addGlobalData('cdnBaseUrl', ...)` |
| `scripts/copy-images.js` | Remove species photo copy block (keep banner, styles, Pico, OSD) |
| `src/species/species.njk` | `src="{{ cdnBaseUrl }}/{{ sp.slug }}/{{ img.filename }}"` |
| `src/glossary/index.njk` | `src="{{ cdnBaseUrl }}/glossary/{{ term.image_filename }}"` |
| `src/browse/index.njk` | Add `cdn-base-url="{{ cdnBaseUrl }}"` attribute to `<pnwm-taxon-browser>` |
| `src/components/pnwm-taxon-browser.js` | Accept `cdn-base-url` property; use for all image src construction |
| `.github/workflows/deploy.yml` | Remove LFS action; add `CDN_BASE_URL` env on build step |
| `.github/workflows/pr-check.yml` | Remove LFS action |
| `lychee.toml` | Exclude CDN hostname from link checking |

### New files

| File | Purpose |
|------|---------|
| `.env.example` | Documents `CDN_BASE_URL` (and any other required env vars) for contributors |

### .gitignore addition

Add `.env` to `.gitignore`.

### Files with no changes

| File | Reason |
|------|--------|
| `vite.config.js` (inline in eleventy.config.js) | CDN URLs bypass Vite's base rewriting |
| `src/_includes/base.njk` | Banner image stays site-relative |
| `scripts/copy-plates.js` | Unrelated to species photo CDN migration |
| `src/_data/images.js` | Returns filenames only; URL construction stays in templates |
| `src/_data/taxon.js` | Returns filenames only; URL construction in web component |
| `scripts/emit-species-states.js` | No image URLs |

---

## 8. Data Flow: env var to rendered `<img>`

```
CDN_BASE_URL (env var / .env)
  └─ eleventy.config.js (read at startup; trimmed; fail-fast guard)
       └─ addGlobalData('cdnBaseUrl', value)
            ├─ species.njk
            │    └─ static HTML: <img src="https://cdn.../slug/file.jpg">
            ├─ glossary/index.njk
            │    └─ static HTML: <img src="https://cdn.../glossary/file.jpg">
            └─ browse/index.njk
                 └─ <pnwm-taxon-browser cdn-base-url="https://cdn...">
                      └─ runtime JS: img.src = `${this['cdn-base-url']}/${slug}/${file}`
```

Species page and glossary `<img>` srcs are baked into static HTML at build time by
Nunjucks. Taxon browser `<img>` srcs are constructed at runtime by the Lit component
from the `cdn-base-url` attribute.

---

## 9. Pitfalls

**Double-slash.** Enforced by trimming trailing slash in `eleventy.config.js` and using
no leading slash in template paths. Establish this as the project convention and document
it in `.env.example` comments.

**`| url` filter on CDN URLs.** The filter prepends `pathPrefix` to any string — it
corrupts `https://` URLs. Never use `| url` on CDN image paths.

**lychee reporting broken CDN URLs in PR builds.** CDN URLs in PR builds will use an
empty base (`src="/slug/file.jpg"`). Lychee will try to check these as internal links
and may report 404s. Exclude the CDN domain in `lychee.toml`, or better, also add a
lychee exclude pattern for CDN-rooted paths that appear as root-relative during PR
builds.

**`pnwm-taxon-browser.js` has multiple image src construction sites.** The file
currently builds img srcs in `_renderImageStrip` (line ~143), in `_renderSpecies`
(line ~199), and potentially in species card rendering. Audit all `src=` expressions in
the component before shipping — missing one leaves stale `/images/...` paths.

**LFS history.** Removing LFS from the repo requires `git lfs migrate export` or
BFG to purge LFS pointers from history. This is a destructive history rewrite and
requires all collaborators to re-clone. Scope this as an explicit phase step, not a
casual `git rm`.
