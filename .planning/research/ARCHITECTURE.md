# Architecture Research: PNW Moths Static Site

**Domain:** Data-heavy natural history static site (700 species, 10k+ occurrence records)
**Researched:** 2026-04-11
**Overall confidence:** HIGH for Eleventy patterns, MEDIUM for SQLite-at-build-time, HIGH for validation tooling

---

## Data Layer Design

### Recommended: SQLite as authoritative store, JSON/CSV as human-editable exchange format

**The core data tension:**
- SQLite is best for build-time queries (joins, filtering, indexing) — synchronous reads via `better-sqlite3` fit Eleventy's data pipeline naturally
- CSV/Markdown is best for human and LLM editing — flat, diffable, no tooling required
- JSON is best for embedded page payloads — what the client-side map and phenology chart consume

**Recommended layout:**

```
data/
  species.csv            # One row per species — genus, species, common name, NOC ID, authority
  records.csv            # All occurrence records — species_id, lat, long, date, collector, etc.
  images.csv             # All image references — species_id, filename, photographer, weight
  glossary.csv           # Glossary entries
  db/
    pnwmoths.sqlite      # Derived from CSVs; regenerated on change; .gitignore optional
```

**Why SQLite at build, not raw CSV parsing:**
- 10k+ records across 700 species means per-page filtering of a large array is O(n) per page, 700 times. That is 700 × 10k comparisons — slow.
- SQLite with `SELECT * FROM records WHERE species_id = ?` is O(log n) with an index, runs in microseconds, and the `better-sqlite3` library is synchronous (no async overhead per page).
- CSV remains the authoritative human-editable source. A build step (`scripts/csv-to-sqlite.js`) imports CSVs into SQLite before Eleventy runs.

**Why not one CSV per species for records:**
- 700 files in a directory is workable but creates friction for bulk edits, imports, and LLM context windows
- Cross-species analysis (e.g., "all records from county X") requires reading all 700 files
- A single `records.csv` with a `species_id` column is easier to import, export, and validate

**Why not a single JSON blob:**
- Non-technical contributors editing JSON is error-prone (trailing commas, nesting errors)
- Large JSON files (10k records) are slow to parse and diff badly in git

**Confidence:** MEDIUM — the SQLite-at-build pattern is not an Eleventy convention but is well-supported by `better-sqlite3`'s synchronous API. No official Eleventy docs cover it directly. The pattern is inferred from JavaScript data file docs + `better-sqlite3` synchronous API characteristics.

---

## Eleventy Content Structure

### Recommended: Data-generated species pages, not one Markdown per species

**The choice:**
- One `.md` per species (700 files) — familiar, but 700 files with mostly-identical structure is noise
- Pagination from data (one template, one data source) — generates all 700 pages, cleaner

**Recommended structure:**

```
src/
  species/
    species.njk            # Single template → generates /species/[slug]/index.html per species
    species.11tydata.js    # Directory data file: enriches each page with records + images
  browse/
    index.njk              # Family/genus browse list
  plates/
    index.njk              # Photographic plates
  glossary/
    index.njk
  _data/
    species.js             # Returns all species rows from SQLite
    records.js             # Returns all records indexed by species_id
    glossary.js            # Returns glossary entries
  _includes/
    layouts/
      base.njk
      species.njk
    components/
      occurrence-map.njk   # Renders map container + embeds JSON payload
      phenology-chart.njk  # Chart container
```

**Pagination pattern for species pages:**

```yaml
# species/species.njk frontmatter
---
pagination:
  data: species
  size: 1
  alias: sp
permalink: "species/{{ sp.slug }}/index.html"
---
```

This is the canonical Eleventy "pages from data" pattern (see: https://www.11ty.dev/docs/pages-from-data/). Each species becomes one page. The `alias: sp` makes the single-item alias work cleanly in templates and permalinks.

**When to use one Markdown per species instead:**
Use `.md` files if species have substantial unique narrative content (prose descriptions, notes) that contributors will edit directly. Hybrid approach: one `.md` per species for prose content only; occurrence records and images stay in CSV/SQLite. The Markdown file's frontmatter provides the `species_id` to join on.

**Recommendation for this project:** Start with pure data-generation (no per-species Markdown). Add per-species Markdown files only when contributors need to write prose. This keeps the initial build simple and avoids 700 nearly-empty stub files.

---

## Build-time Data Join Pattern

### Specific pattern: JS data file pre-indexes records; directory data file attaches them per page

**Step 1: `_data/species.js`** — returns all species as an array (fed to pagination)

```js
// src/_data/species.js
import Database from 'better-sqlite3';
const db = new Database('./data/db/pnwmoths.sqlite', { readonly: true });

export default function () {
  return db.prepare(`
    SELECT id, genus, species, common_name, noc_id, slug
    FROM species
    ORDER BY genus, species
  `).all();
}
```

**Step 2: `_data/recordsBySpecies.js`** — returns a Map/object indexed by species_id, loaded once at build start

```js
// src/_data/recordsBySpecies.js
import Database from 'better-sqlite3';
const db = new Database('./data/db/pnwmoths.sqlite', { readonly: true });

export default function () {
  const rows = db.prepare(`
    SELECT species_id, lat, lng, date, collector, locality, state, county, record_type
    FROM records
  `).all();

  // Group into an object keyed by species_id for O(1) lookup
  return rows.reduce((acc, r) => {
    (acc[r.species_id] ??= []).push(r);
    return acc;
  }, {});
}
```

**Step 3: `species/species.11tydata.js`** — attaches records to each species page via `eleventyComputed`

```js
// src/species/species.11tydata.js
export default {
  eleventyComputed: {
    occurrences: (data) => data.recordsBySpecies[data.sp?.id] ?? [],
    occurrencesJson: (data) => JSON.stringify(data.recordsBySpecies[data.sp?.id] ?? []),
    images: (data) => data.imagesBySpecies[data.sp?.id] ?? [],
  }
};
```

**In the template**, `occurrencesJson` is embedded directly into a `<script>` tag for client-side consumption by the map and phenology chart:

```njk
<script type="application/json" id="occurrence-data">{{ occurrencesJson | safe }}</script>
```

**Why this pattern is correct:**
- `_data/recordsBySpecies.js` runs once at build start and loads all 10k records into memory as a pre-indexed object. Cost: ~1-5ms for the query + in-memory object construction.
- `eleventyComputed` for each of the 700 pages does a simple `object[id]` lookup — O(1), no repeated DB queries.
- The JSON payload is serialized once per page, embedded directly in HTML. No separate API calls at runtime.
- `better-sqlite3` is synchronous, so there is no async/await complexity in data files.

**Alternative considered: per-page SQLite query in `eleventyComputed`**
This would call `db.prepare(...).all()` 700 times. Each query is fast (~0.1ms), but 700 calls × query overhead adds up and loses the benefit of pre-loading. Not recommended.

**Confidence:** HIGH for the data-cascade pattern (official Eleventy docs). MEDIUM for SQLite-specific integration (inferred from `better-sqlite3` synchronous API + JS data file docs — not an officially documented Eleventy pattern).

---

## LLM-friendly Conventions

### File layout conventions that maximize LLM edit accuracy

**Core principle:** LLMs edit most reliably when each logical entity is a single file with a clear, consistent schema. Avoid files that require the LLM to understand surrounding context to edit safely.

**Species data — CSV with explicit headers:**

```csv
id,genus,species,common_name,noc_id,slug,similar_species_ids
101,Acronicta,americana,American Dagger,93-0001,acronicta-americana,"102,103"
```

Single file. Headers on row 1. Every field named. An LLM instruction like "add a new species" maps directly to "append a row to `data/species.csv`" with no ambiguity.

**Occurrence records — CSV with species_id FK, not nested:**

```csv
id,species_id,lat,lng,date,collector,locality,state,county,elevation,record_type
1,101,47.6,-122.3,1994-07-15,P. Abrahamsen,Mt. Rainier,WA,Pierce,1200,specimen
```

One file. The `species_id` foreign key is explicit. LLM instruction: "add an occurrence record for species 101" → "append a row to `data/records.csv`".

**Species prose (when needed) — one Markdown per species:**

```markdown
---
species_id: 101
---
The American Dagger is found in riparian zones...
```

Frontmatter links the file to the data without the LLM needing to know directory structure. File naming convention: `content/species/acronicta-americana.md`.

**LLM instruction files:**

```
content/
  _instructions/
    ADDING_SPECIES.md      # Step-by-step for adding a new species
    ADDING_RECORDS.md      # Step-by-step for adding occurrence records
    DATA_SCHEMA.md         # Column definitions for all CSVs
    BUILD.md               # How to run the build, what scripts do what
```

These are first-class content files, not README afterthoughts. Each instruction file describes exactly one task. They live in `content/_instructions/` so they are version-controlled alongside the data they describe.

**`llms.txt` at the project root** (per the llmstxt.org convention, introduced 2024):

```
# PNW Moths

Static natural history site for Pacific Northwest moth species.

## Data files
- data/species.csv — species list
- data/records.csv — occurrence records
- data/images.csv — image references

## Edit instructions
- content/_instructions/ADDING_SPECIES.md
- content/_instructions/ADDING_RECORDS.md
```

This is the 2024 convention for LLM-accessible site manifests. It provides a fast-path summary without requiring the LLM to infer structure from directory listings.

**What to avoid:**
- Deeply nested JSON or YAML for tabular data — LLMs make subtle syntax errors in nested structures
- Auto-generated files in the same directory as human-edited files — LLMs may edit generated files by mistake
- Species content split across multiple files with implicit linkage (e.g., by file path matching) — prefer explicit `species_id` FK

---

## Build Performance

### Known bottlenecks and mitigations for 700-page data-heavy Eleventy sites

**Performance data points from community research:**
- A 770-post blog (2550 total pages) builds in ~2.17s incremental with Eleventy v2/v3
- A 1500-page site had ~30s builds after v2 upgrade (later resolved)
- Image processing (eleventy-img) is the most common 7-minute build culprit; a December 2025 case study reduced from 7min to 1.6s by fixing image processing and caching

**For 700 species pages with 10k records, the bottlenecks are:**

1. **Data loading** — mitigated by loading all records once into a pre-indexed object (see Data Join Pattern above). Expect <50ms for 10k SQLite rows.

2. **Template rendering** — 700 Nunjucks renders. Eleventy v3 renders these concurrently. Expect 2-5s for 700 pages with moderate template complexity.

3. **Vite post-processing** — `@11ty/eleventy-plugin-vite` runs Vite over Eleventy's output after the SSG step. For 700 HTML files, Vite's HTML plugin processes each file. This adds 5-15s in production mode. Keep Vite's scope to client-side JS/CSS bundling only; do not use Vite to transform HTML structure.

4. **Missing images** — The project explicitly excludes image assets. Templates must not call `eleventy-img` shortcodes on missing files. Use a conditional check or a stub image path pattern to avoid image-plugin errors that would halt the build.

5. **Incremental builds in development** — Eleventy's `--incremental` flag rebuilds only changed files. With a data-generated site (all 700 pages come from one template + data), changing `records.csv` triggers a full rebuild. This is unavoidable when data is in global data files. Mitigation: keep `--incremental` for template/layout changes during development; accept full rebuilds when data changes.

**Build script ordering:**

```json
"scripts": {
  "build:data": "node scripts/csv-to-sqlite.js",
  "build:site": "eleventy",
  "build:search": "pagefind --site _site",
  "build": "npm run build:data && npm run build:site && npm run build:search"
}
```

Pagefind runs after Eleventy because it crawls the built HTML. It typically takes 5-15s for 700 pages.

**Confidence:** MEDIUM — performance figures are from community reports, not benchmarks on this specific architecture. The bottleneck analysis is based on known Eleventy behavior, not measured on this project.

---

## Validation Pipeline

### Standard toolchain for static site validation

**Link checking: lychee (Rust, fast)**

lychee checks internal and external links in HTML, Markdown, and plain text. GitHub Action available. A 576-link site takes ~1 minute in CI.

```bash
lychee --no-progress --format compact _site/**/*.html
```

For this project, external link checking should be opt-in (many external links will be stable museum/collection URLs that don't need CI validation). Internal link checking should always run.

**HTML structure: htmltest**

htmltest validates internal links, image `src` attributes, and anchor targets within the built `_site/` directory. Written in Go, fast, zero-configuration for basic use. Better for internal consistency than lychee (which focuses on URL reachability).

```bash
htmltest _site/
```

Configure via `.htmltest.yml` to skip external URLs and focus on internal cross-references, missing `<img src>` targets, and broken anchor links.

**Page weight: custom Node script (no standard tool)**

There is no widely adopted standard tool for page weight CI checks in static sites. The pattern is a small script that walks `_site/` and asserts:

```js
// scripts/check-page-weight.js
// Assert each HTML file is under threshold (e.g., 200KB)
// Assert each JS bundle is under threshold (e.g., 100KB gzip)
```

Add as a `postbuild` npm script. Thresholds should be documented in `ARCHITECTURE.md` or `.htmltest.yml` so contributors understand why builds fail.

**Search index validation: Pagefind build exit code**

Pagefind returns non-zero exit code if indexing fails. Add `pagefind --site _site` to the build script; CI catches failures automatically.

**Image reference validation: custom script or htmltest**

Since image assets are excluded from the repo, the build must not error on missing images — but it should warn. A build-time script can read `data/images.csv`, check whether any referenced image paths are expected, and emit warnings.

**Full validation pipeline:**

```
build:data → build:site → build:search → lint:links → lint:html → lint:weight
```

Run all steps in CI (GitHub Actions). Run `lint:links` (internal only) and `lint:html` locally pre-commit via a git hook.

**Confidence:** HIGH for lychee and htmltest (well-established tools, GitHub Actions integration exists). MEDIUM for page weight tooling (no standard; pattern is custom script).

---

## Component Map

### What talks to what, in build order

```
[CSV files]                    ← human/LLM edits
    |
    | scripts/csv-to-sqlite.js (build:data)
    v
[SQLite database]
    |
    | better-sqlite3 (synchronous reads at build start)
    v
[Eleventy _data/ files]        ← species.js, recordsBySpecies.js, imagesBySpecies.js
    |
    | Eleventy data cascade
    v
[species.11tydata.js]          ← eleventyComputed attaches records/images per page
    |
    | Nunjucks template rendering (700 × species.njk)
    v
[_site/ HTML files]            ← each page contains embedded JSON for client-side map/chart
    |
    | @11ty/eleventy-plugin-vite (post-processes HTML, injects Vite asset hashes)
    v
[_site/ with hashed JS/CSS]
    |
    | pagefind --site _site (build:search)
    v
[_site/pagefind/ search index]
    |
    | lychee + htmltest (lint:links + lint:html)
    v
[CI pass/fail]
```

**Client-side components (Vite-bundled):**

```
src/js/
  occurrence-map.js    ← reads #occurrence-data JSON, renders Leaflet map
  phenology-chart.js   ← reads #occurrence-data JSON, renders date histogram
  slideshow.js         ← image slideshow for species photos
  search.js            ← Pagefind UI integration
```

These are entry points for Vite. Vite tree-shakes and bundles; the output is a handful of hashed JS files injected via `<script type="module">` in the base layout.

**Component boundary rules:**
- No server-side code runs at request time — everything is resolved at build time or in the browser
- SQLite is only open during `npm run build:data` and Eleventy data file execution — never at runtime
- Client-side JS reads embedded JSON from the page; it never fetches from an API
- Pagefind's search index is static files; the search UI is a web component loaded client-side

**Suggested build order for phased development:**

1. **Data layer first** — CSV schema + SQLite import script + `_data/` files. Validates the join works before building any UI.
2. **Species page shell** — pagination template generates 700 pages with just genus/species/name. Validates build performance baseline.
3. **Occurrence JSON embedding** — add `occurrencesJson` computed data to pages. Validates the critical data join.
4. **Client-side map** — Vite entry point reads embedded JSON and renders Leaflet map. Validates the Eleventy+Vite pipeline.
5. **Browse and search** — family/genus browse pages + Pagefind search index.
6. **Validation pipeline** — lychee + htmltest + page weight checks.

---

## Gaps and Open Questions

- **Eleventy v2 vs v3:** v3 (ESM-native, Node 18+) is the current release as of late 2024. `better-sqlite3` requires native compilation; verify it builds cleanly in the target Node version. **Flag for Phase 1 validation.**

- **`eleventyComputed` with pagination data:** There is a known GitHub issue (#2365) where `eleventyComputed` may not see pagination alias data on the first evaluation pass (it receives stub data). The directory data file pattern (`.11tydata.js`) sidesteps this by accessing `data.sp` which is the pagination alias — verify this works with the actual Eleventy version. **Flag for Phase 1 validation.**

- **Vite MPA mode with 700 pages:** `@11ty/eleventy-plugin-vite` runs Vite in multi-page app mode. Performance with 700 HTML entry points in production mode is unverified. May need to configure Vite to only process a manifest of JS/CSS entry points rather than all HTML files. **Flag for Phase 2 (Vite integration).**

- **SQLite in CI/GitHub Actions:** `better-sqlite3` builds a native addon. Verify it compiles on the GitHub Actions runner without a prebuilt binary cache. **Flag for CI/validation phase.**

---

## Sources

- Eleventy Pages from Data: https://www.11ty.dev/docs/pages-from-data/
- Eleventy Computed Data: https://www.11ty.dev/docs/data-computed/
- Eleventy JavaScript Data Files: https://www.11ty.dev/docs/data-js/
- Relational data in Eleventy (Dan Burzo): https://danburzo.ro/eleventy-relational-data/
- better-sqlite3 (synchronous SQLite for Node): https://github.com/WiseLibs/better-sqlite3
- @11ty/eleventy-plugin-vite: https://github.com/11ty/eleventy-plugin-vite
- Pagefind static search: https://pagefind.app/
- lychee link checker: https://github.com/lycheeverse/lychee
- htmltest: referenced in https://eklausmeier.goip.de/blog/2024/10-30-testing-static-html-files-with-htmltest
- llms.txt spec: https://llmstxt.org/
- Eleventy build performance analysis: https://www.11ty.dev/docs/debug-performance/
- Build time case study (7min → 1.6s): https://www.adamdjbrett.com/blog/2025-12-16-eleventy-build-times/
