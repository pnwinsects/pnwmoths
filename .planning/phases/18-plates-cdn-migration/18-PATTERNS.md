# Phase 18: Plates CDN Migration - Pattern Map

**Mapped:** 2026-04-22
**Files analyzed:** 6
**Analogs found:** 6 / 6

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `scripts/upload-plates.js` | utility (upload script) | file-I/O → HTTP PUT | `scripts/migrate-images.js` | exact |
| `data/plates.json` | config (committed manifest) | — | `plates/manifest.json` (schema source) | exact |
| `src/plates/plate.njk` | template | request-response | `src/species/species.njk` (CDN URL pattern) | role-match |
| `src/plates/index.njk` | template | request-response | `src/species/species.njk` (CDN URL pattern) | role-match |
| `src/_data/plates.js` | data module | file-I/O (JSON read) | `src/_data/images.js` (data/\*.csv read) | role-match |
| `scripts/copy-plates.js` | utility (minor edit) | file-I/O | `scripts/copy-plates.js` (self) | exact |

## Pattern Assignments

### `scripts/upload-plates.js` (utility, file-I/O → HTTP PUT)

**Analog:** `scripts/migrate-images.js`

**Imports pattern** (`scripts/migrate-images.js` lines 17-22):
```js
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { execFileSync } from 'node:child_process';
```

**Constants pattern** (`scripts/migrate-images.js` lines 41-44):
```js
const BUNNY_STORAGE_HOST = process.env.BUNNY_STORAGE_HOST ?? 'la.storage.bunnycdn.com';
const BUNNY_ZONE = process.env.BUNNY_ZONE ?? 'pnwmoths';
const BUNNY_API_KEY = process.env.BUNNY_API_KEY ?? '';
const DRY_RUN = process.env.DRY_RUN === '1';
```

**API key guard pattern** (`scripts/migrate-images.js` lines 243-246):
```js
if (!BUNNY_API_KEY) {
  console.error('[migrate-images] BUNNY_API_KEY is required for uploads. Set it to your Storage Zone password.');
  process.exit(1);
}
```

**Core HTTP PUT pattern** (`scripts/migrate-images.js` lines 257-265):
```js
execFileSync('curl', [
  '-s', '-S', '-f',
  '-X', 'PUT',
  '-H', `AccessKey: ${BUNNY_API_KEY}`,
  '-H', 'Content-Type: application/octet-stream',
  '--data-binary', `@${join(MOTHS_SOURCE, img.filename)}`,
  url,
], { stdio: ['pipe', 'pipe', 'inherit'] });
```

**Progress logging pattern** (`scripts/migrate-images.js` lines 266-267):
```js
uploaded++;
if (uploaded % 100 === 0) console.log(`[migrate-images] ${uploaded}/${total} uploaded`);
```

**Main entry-point guard pattern** (`scripts/migrate-images.js` lines 340-344):
```js
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}
```

**CDN path for plates** (adapt from `scripts/migrate-images.js` line 256 — replace slug/filename with plates path):
```js
// For plates, the CDN path structure is:
const url = `https://${BUNNY_STORAGE_HOST}/${BUNNY_ZONE}/plates/${slug}/${relativePath}`;
// where relativePath is e.g. "TileGroup0/0-0-0.jpg" or "ImageProperties.xml" or "thumbnail.jpg"
```

**Source directory scan** — adapt `readdir` with `{ withFileTypes: true, recursive: true }` (Node 18+) or `walk`-style recursion over `plates/{slug}/TileGroup0/` subdirectories. The `plates/` local directory has this structure:
```
plates/{slug}/TileGroup0/{level}-{x}-{y}.jpg
plates/{slug}/ImageProperties.xml
plates/{slug}/thumbnail.jpg
```

**Graceful exit if source missing pattern** (`scripts/migrate-images.js` lines 105-108):
```js
if (!existsSync(MOTHS_SOURCE)) {
  console.warn('[migrate-images] Moths source not found — skipping');
  process.exit(0);
}
```

---

### `data/plates.json` (committed manifest)

**Source:** `plates/manifest.json` — copy this file verbatim to `data/plates.json`.

**Schema** (from `scripts/copy-plates.js` lines 137-138 and `src/_data/plates.js` lines 155-163):
```json
[
  { "number": "1", "family": "Drepanidae", "slug": "plate-1-drepanidae", "width": 2400, "height": 3000 },
  ...
]
```
98 records. Fields: `number` (string), `family` (string), `slug` (string), `width` (integer), `height` (integer).

---

### `src/plates/plate.njk` (template, request-response)

**Analog:** `src/species/species.njk` — CDN URL construction pattern (line 48):
```nunjucks
<img src="{{ cdnBaseUrl }}/{{ sp.slug }}/{{ img.filename | urlencode }}"
```

**Current broken pattern** (`src/plates/plate.njk` line 14):
```nunjucks
tiles-url="{{ ('/plates/' + plate.slug + '/') | url }}"
```

**CDN replacement pattern** — never use `| url` on absolute URLs:
```nunjucks
tiles-url="{{ cdnBaseUrl }}/plates/{{ plate.slug }}/"
```
Note: trailing slash after `{{ plate.slug }}/` is REQUIRED by OpenSeadragon's `getTileUrl` which concatenates `tilesUrl + 'TileGroup0/0-0-0.jpg'` directly (verified in OSD source line ~16850).

**noscript link** (`src/plates/plate.njk` line 22) — also needs CDN URL:
```nunjucks
{# BEFORE: #}
<a href="{{ ('/plates/' + plate.slug + '/') | url }}ImageProperties.xml">

{# AFTER: #}
<a href="{{ cdnBaseUrl }}/plates/{{ plate.slug }}/ImageProperties.xml">
```

**Back link** (`src/plates/plate.njk` line 25) — site-relative, keep `| url` (this is correct, not a CDN URL):
```nunjucks
<a href="{{ '/plates/' | url }}">&larr; All plates</a>
```

---

### `src/plates/index.njk` (template, request-response)

**Analog:** `src/species/species.njk` — CDN URL pattern; `src/glossary/index.njk` — list template structure.

**Current broken patterns** (`src/plates/index.njk` lines 13-15):
```nunjucks
<a href="{{ ('/plates/' + plate.slug + '/') | url }}">
  <img
    src="{{ ('/plates/' + plate.slug + '/thumbnail.jpg') | url }}"
```

**CDN replacement patterns**:
```nunjucks
<a href="{{ ('/plates/' + plate.slug + '/') | url }}">
  <img
    src="{{ cdnBaseUrl }}/plates/{{ plate.slug }}/thumbnail.jpg"
```

Note: the `<a href>` link uses `| url` and points to the plate page within the site — this is correct and must NOT change to a CDN URL. Only the `<img src>` thumbnail changes to a CDN URL.

---

### `src/_data/plates.js` (data module, file-I/O)

**Analog:** `src/_data/images.js` — reads a committed data file from `data/` at build time.

**Current path** (`src/_data/plates.js` line 149):
```js
const MANIFEST_PATH = new URL('../../plates/manifest.json', import.meta.url).pathname;
```

**Replacement pattern** — one-line change, same `new URL` idiom, updated path:
```js
const MANIFEST_PATH = new URL('../../data/plates.json', import.meta.url).pathname;
```

**`existsSync` guard pattern** (`src/_data/plates.js` lines 152-166) — unchanged; the guard now reliably finds the file since `data/plates.json` is committed:
```js
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
```

---

### `scripts/copy-plates.js` (minor edit, file-I/O)

**Self-analog** — only one line changes.

**Current manifest write** (`scripts/copy-plates.js` line 141):
```js
await writeFile(join(REPO_PLATES, 'manifest.json'), JSON.stringify(manifest, null, 2));
```

**Replacement** — write to `data/plates.json` (committed, outside gitignored `plates/`):
```js
await writeFile(resolve('data/plates.json'), JSON.stringify(manifest, null, 2));
```

Also update the console log on line 145:
```js
// BEFORE:
console.log(`Wrote manifest: ${REPO_PLATES}/manifest.json`);
// AFTER:
console.log(`Wrote manifest: data/plates.json`);
```

`resolve` is already imported at line 14 (`import { join, resolve } from 'node:path';`).

---

## Shared Patterns

### CDN URL Construction (no `| url` filter)
**Source:** `src/species/species.njk` line 48; `eleventy.config.js` lines 14 and 35
**Apply to:** `src/plates/plate.njk`, `src/plates/index.njk`

`cdnBaseUrl` is injected as a global Eleventy data value in `eleventy.config.js`:
```js
const CDN_BASE_URL = "https://pnwmoths.b-cdn.net";
eleventyConfig.addGlobalData("cdnBaseUrl", CDN_BASE_URL);
```

CDN URLs must be constructed by direct string interpolation — NEVER through the `| url` filter, which prepends `pathPrefix` (`/pnwmoths/`) and corrupts absolute `https://` URLs:
```nunjucks
{# CORRECT — direct interpolation: #}
src="{{ cdnBaseUrl }}/plates/{{ plate.slug }}/thumbnail.jpg"

{# WRONG — | url corrupts absolute URLs: #}
src="{{ ('https://pnwmoths.b-cdn.net/plates/' + plate.slug + '/thumbnail.jpg') | url }}"
```

### Bunny.net HTTP PUT Upload
**Source:** `scripts/migrate-images.js` lines 257-265
**Apply to:** `scripts/upload-plates.js`

Sequential (non-parallel) HTTP PUT per file using system `curl`. Do not parallelize — bunny.net FTP has issues with concurrent operations (D-17 from Phase 13); HTTP PUT is proven safe when sequential.

### Committed Data Files in `data/`
**Source:** `data/images.csv` (read by `src/_data/images.js`); `data/plates.json` (new)
**Apply to:** `src/_data/plates.js`, `scripts/copy-plates.js`

Project convention: data files consumed by Eleventy data modules live in `data/` (committed to git), not in source directories that may be gitignored. Path resolution uses `new URL('../../data/filename', import.meta.url).pathname` for ESM modules.

## No Analog Found

All files have close analogs in the codebase. No files require falling back to RESEARCH.md patterns alone.

## Metadata

**Analog search scope:** `scripts/`, `src/_data/`, `src/plates/`, `src/species/`, `src/glossary/`, `eleventy.config.js`
**Files scanned:** 8
**Pattern extraction date:** 2026-04-22
