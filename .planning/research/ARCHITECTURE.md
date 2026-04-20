# Architecture Research: v1.3 Visual Browse Integration

**Domain:** Eleventy + Vite + Lit static site — dynamic browse page milestone
**Researched:** 2026-04-18
**Confidence:** HIGH — all integration points verified against existing source files

---

## System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                         BUILD TIME (Node.js)                         │
│                                                                      │
│  data/species.csv ──┐                                                │
│  data/records.csv ──┤── scripts/build-data.js ──► data/parquet/     │
│  data/images.csv ───┘   (DuckDB: per-species + new browse.parquet)  │
│                                                                      │
│  data/species.csv ──► src/_data/families.js (modified)              │
│  data/images.csv ──►   → taxonomy tree + nav images → browse/index  │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
         │                             │
         ▼                             ▼
┌────────────────────┐    ┌────────────────────────────────────────────┐
│   Eleventy SSG     │    │   scripts/copy-parquet.js (post-Vite)      │
│   browse/index.njk │    │   data/parquet/browse.parquet              │
│   (shell page)     │    │    → _site/browse/browse.parquet           │
└────────────────────┘    └────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     RUNTIME (Browser)                                │
│                                                                      │
│  _site/browse/index.html                                             │
│    └── <pnwm-taxon-browser> Lit component                           │
│          ├── taxonomy tree from inline JSON (Eleventy-injected)      │
│          ├── nav images from inline JSON (Eleventy-injected)         │
│          ├── fetch _site/browse/browse.parquet (species × state)     │
│          └── state filter → hide/show taxa with no records           │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Data Responsibility Split

### What Eleventy injects at build time (inline JSON in HTML)

The taxonomy tree is structural data: families, subfamilies, genera, species names and slugs, and navigation images. This is small (700 species × a few fields), never changes without a rebuild anyway, and is needed to render the accordion skeleton before any parquet loads. Inject it as a JSON attribute or `<script type="application/json">` block on the `<pnwm-taxon-browser>` element.

**Payload shape (injected by `families.js` / `browse/index.njk`):**

```json
[
  {
    "family": "Noctuidae",
    "subfamilies": [
      {
        "subfamily": "Acronictinae",
        "genera": [
          {
            "genus": "Acronicta",
            "genus_slug": "acronicta",
            "nav_images": ["acronicta-americana/01.jpg"],
            "species": [
              {
                "slug": "acronicta-americana",
                "genus": "Acronicta",
                "species": "americana",
                "common_name": "American Dagger Moth",
                "nav_images": ["acronicta-americana/01.jpg"]
              }
            ]
          }
        ]
      }
    ]
  }
]
```

Genera with no subfamily collapse into a synthetic `{"subfamily": null}` entry so the component can use a uniform tree structure.

**Why inline, not a separate JSON fetch:**
The existing `pnwm-occurrence-map` and `pnwm-filter-bar` load Parquet asynchronously — the user sees a loading state before occurrence data appears. For the taxonomy tree, the accordion must render immediately on page load (no loading flash). Inline JSON in the HTML achieves this without an extra fetch. The payload is ~50–100 KB uncompressed for 700 species (well within budget).

### What the Lit component loads from Parquet at runtime

State-distribution data: which states have records for each species slug. This is the data that drives the state filter — hiding families/genera/subfamilies that have zero occurrences in the selected states.

**Parquet schema (`browse.parquet`):**

| Column | Type | Notes |
|--------|------|-------|
| `species_slug` | VARCHAR | FK to species; matches existing slug convention |
| `state` | VARCHAR | One row per unique (species_slug, state) pair |
| `record_count` | INTEGER | Aggregate count for the pair |

This is a pre-aggregated table, not a row-per-occurrence export. At 700 species × 6 states, the worst-case row count is 4,200. This is tiny — a few KB as Parquet with Snappy compression. The component loads it once on `connectedCallback`, builds a `Map<slug, Set<state>>` in memory, and uses it to drive visibility.

**Why not embed state data inline too:**
State data at row-per-occurrence level would be very large with real data (10k+ rows). Pre-aggregating to species × state keeps the Parquet small. This also follows the existing pattern: `pnwm-occurrence-map` loads per-species Parquet asynchronously. The browse Parquet follows the same async-load pattern but loads a single shared file once for the whole page.

**Why Parquet instead of JSON for the browse file:**
The existing `parquet-cache.js` pattern is established and Parquet with Snappy compression is already validated for this site. More importantly, it maintains consistency with the overall architecture decision to use Parquet for occurrence-derived data. A JSON alternative would work but breaks the pattern with no significant benefit.

---

## Component Boundaries

### Static HTML vs Lit component

`browse/index.njk` renders:
- The page shell (header, nav, `<h1>`) — static HTML via `base.njk`
- The `<pnwm-taxon-browser>` element with a `data-taxonomy` attribute containing the inline JSON
- A `<noscript>` fallback that renders a plain family/genus listing (same as current `index.njk`)

The Lit component (`pnwm-taxon-browser`) owns:
- Accordion expand/collapse state
- Nav image display + show/hide toggle
- State filter UI and visibility logic
- Loading state while `browse.parquet` fetches

**Boundary rule:** The component never reads from the DOM for taxonomy data. It reads only from its `data-taxonomy` attribute (parsed once in `connectedCallback`). This keeps the component testable in isolation.

**Light DOM vs Shadow DOM:** Use Shadow DOM (Lit default) for `pnwm-taxon-browser`. Unlike `pnwm-occurrence-map` which uses light DOM for Leaflet's direct DOM manipulation, the browser component is purely Lit-rendered HTML. Shadow DOM scopes styles cleanly. The accordion markup is generated entirely by Lit's `html` tag, so there is no external CSS interaction issue.

---

## Files: New vs Modified

### New files

| File | Purpose |
|------|---------|
| `src/_data/taxon.js` | Replaces `families.js`: queries `species.csv` (with `subfamily` column) and `images.csv` (with `navigational` flag), builds taxonomy tree with nav images, returns structured data for `browse/index.njk` |
| `src/components/pnwm-taxon-browser.js` | Lit accordion component; reads taxonomy from attribute, loads `browse.parquet`, manages state filter and expand/collapse |
| `data/parquet/browse/records.parquet` | Species × state aggregate Parquet (directory mirrors per-species convention); exported by `build-data.js` |

Note on Parquet path: per-species Parquet files live at `data/parquet/{slug}/records.parquet`. The browse Parquet should live at `data/parquet/browse/records.parquet` so `copy-parquet.js`'s `cp('data/parquet', '_site/species', { recursive: true })` copy picks it up at `_site/species/browse/records.parquet`. The component fetches from `${import.meta.env.BASE_URL}species/browse/records.parquet`. This requires no changes to `copy-parquet.js`.

### Modified files

| File | Change |
|------|--------|
| `data/species.csv` | Add `subfamily` column (nullable VARCHAR) |
| `data/images.csv` | Add `navigational` column (BOOLEAN or 0/1 INTEGER) |
| `src/_data/families.js` | Remove or repurpose — `taxon.js` supersedes it; `genus.njk` pagination also reads from it |
| `src/browse/index.njk` | Replace static genus listing with shell page that mounts `<pnwm-taxon-browser>` |
| `src/browse/genus.njk` | Retire: remove file or redirect strategy (see below) |
| `scripts/build-data.js` | Add: validate `subfamily` in `species.csv`, validate `navigational` in `images.csv`, export `browse.parquet` aggregate |
| `src/components/main.js` | Add import for `pnwm-taxon-browser.js` |

**Note on `families.js` vs `taxon.js`:** `genus.njk` currently reads `families.genusArray` from `families.js`. If `genus.njk` is being retired (all genus pages gone), `families.js` can be deleted and replaced entirely by `taxon.js`. If genus pages are kept temporarily for redirect purposes, `families.js` must remain until those pages are no longer built. The cleaner approach is to retire genus pages in the same milestone and delete `families.js`.

---

## Build Order and Dependencies

```
1. data/species.csv + data/images.csv (human edits, add new columns)
       │
       ▼
2. scripts/build-data.js (validation + Parquet export)
       │
       ├─► data/parquet/{slug}/records.parquet  (unchanged per-species files)
       └─► data/parquet/browse/records.parquet  (NEW: species × state aggregate)
       │
       ▼
3. Eleventy build
       │
       ├─► src/_data/taxon.js runs → taxonomy tree + nav images in memory
       ├─► src/browse/index.njk renders shell with inline JSON
       └─► genus.njk REMOVED → no /browse/{genus}/ pages generated
       │
       ▼
4. @11ty/eleventy-plugin-vite bundles JS
       │
       ▼
5. scripts/copy-parquet.js
       │
       ├─► _site/species/{slug}/records.parquet  (unchanged)
       └─► _site/species/browse/records.parquet  (NEW)
       │
       ▼
6. scripts/copy-images.js (unchanged)
```

**Critical dependency:** `build-data.js` must run before Eleventy (unchanged — this is already the `npm run build:data && eleventy` order). The new browse Parquet is produced in step 2 and copied in step 5 — no new ordering constraints.

---

## Parquet Export: DuckDB Query

Add to `build-data.js` after the per-species loop:

```js
await conn.run(`
  COPY (
    SELECT
      r.species_slug,
      r.state,
      COUNT(*) AS record_count
    FROM records r
    WHERE r.state IS NOT NULL AND r.state != ''
    GROUP BY r.species_slug, r.state
  )
  TO 'data/parquet/browse/records.parquet'
  (FORMAT parquet, COMPRESSION snappy)
`);
```

Add `mkdirSync('data/parquet/browse', { recursive: true })` before the COPY statement.

Also add validation of new CSV columns in `validateCsv` calls:
- `species.csv`: add `subfamily` to the columns map (`'subfamily': 'VARCHAR'`) — nullable, so no required-value check
- `images.csv`: add `navigational` (`'navigational': 'INTEGER'`) — 0 or 1

---

## `taxon.js` Eleventy Data File

This replaces `families.js`. It queries species and images at build time to produce the full taxonomy tree including nav images.

**Nav image selection logic (in DuckDB SQL):**
1. Images with `navigational = 1`, ordered by `weight`, up to 4 per taxon level
2. Fallback: images with `navigational = 0` (or null), ordered by `weight` ascending, up to 4

The query can use window functions:

```sql
-- Per-species nav images: navigational=1 first, then fallback to lowest weight
SELECT
  species_slug,
  filename,
  ROW_NUMBER() OVER (
    PARTITION BY species_slug
    ORDER BY navigational DESC NULLS LAST, weight ASC
  ) AS rn
FROM images
```

Then filter `rn <= 4` in the outer query. The Eleventy data file assembles genus and subfamily rollup images from species images by taking the first 4 images from the set of species-level images within each genus/subfamily (ordered by weight).

**Return shape:** The data file returns the full taxonomy array described above (the inline JSON payload). It is used directly in `browse/index.njk` via `JSON.stringify` in the template.

---

## URL Strategy for Retired Genus Pages

**Current URLs:** `/browse/{genus-slug}/` — e.g., `/browse/acronicta/`

**Decision: 404, not redirect.** The PROJECT.md explicitly notes "Django URL redirects — Requires Netlify/Cloudflare; deferred to v2 (SEO-01)". The same constraint applies here: GitHub Pages cannot serve 301 redirects from static files. A meta-refresh HTML file at each genus URL would work but requires generating ~100 stub pages, which is build complexity for marginal SEO benefit (these are internal PNW moth URLs, not widely indexed).

**Implementation:** Remove `genus.njk` from `src/browse/`. The URLs simply return 404 on GitHub Pages. No stub redirect pages needed.

**If redirects become required later:** The v2 SEO-01 item already tracks this. At v2, moving to Netlify or Cloudflare Pages enables `_redirects` file support. At that point, add redirect rules: `/browse/:genus/* → /browse/ 301`.

---

## `parquet-cache.js` Reuse

The existing `loadParquet(slug)` in `parquet-cache.js` fetches from `${BASE_URL}species/${slug}/records.parquet`. The browse Parquet lives at `species/browse/records.parquet`, which is the slug `"browse"`. 

**Recommended:** Do NOT reuse `loadParquet` for the browse file. Its cache key is designed for species slugs; using `"browse"` as a slug is a naming hack. Instead, add a new exported function to `parquet-cache.js`:

```js
export async function loadBrowseParquet() {
  const url = `${import.meta.env.BASE_URL}species/browse/records.parquet`;
  // ... same fetch + hyparquet pattern as loadParquet
}
```

This keeps the cache module coherent and the intent readable.

---

## Component API: `pnwm-taxon-browser`

```js
class PnwmTaxonBrowser extends LitElement {
  static get properties() {
    return {
      // Injected by Eleventy template as JSON attribute
      taxonomyJson: { type: String, attribute: 'data-taxonomy' },
      // Internal state
      _taxonomy: { state: true },       // parsed from taxonomyJson
      _speciesStates: { state: true },  // Map<slug, Set<state>> from browse.parquet
      _selectedState: { state: true },  // 'all' | 'WA' | 'OR' | ...
      _imagesVisible: { state: true },  // boolean, default true
      _expanded: { state: true },       // Set<string> of expanded taxon keys
      _loading: { state: true },
    };
  }
}
```

The component uses Shadow DOM. It registers as `pnwm-taxon-browser`.

**Template mounts it:**

```njk
<pnwm-taxon-browser
  data-taxonomy="{{ taxon | dump | escape }}"
  data-pagefind-ignore
></pnwm-taxon-browser>
```

Where `taxon` is the array returned by `src/_data/taxon.js`, serialized by Nunjucks `dump` filter (equivalent to `JSON.stringify`) and HTML-escaped.

---

## Anti-Patterns to Avoid

### Embedding occurrence row-level data inline

**What people do:** Put the full records array in a `<script>` tag to avoid async loading.
**Why it's wrong:** With real data (10k+ records), this balloons the HTML page to megabytes. The browse page is the first page many users see.
**Do this instead:** The pre-aggregated species × state Parquet is the right payload. ~4,200 rows, Snappy-compressed, loads in well under 1 second.

### Querying taxonomy structure client-side from Parquet

**What people do:** Export the full species table to Parquet and reconstruct the tree client-side.
**Why it's wrong:** The taxonomy tree requires a JOIN of species × images with complex window-function logic for nav image selection. This logic belongs in DuckDB at build time, not in browser JS. The browser can't run DuckDB. Reconstructing the tree from flat Parquet in JS is duplicating build logic.
**Do this instead:** Compute the tree in `taxon.js` at build time. Inject as inline JSON. The Lit component consumes the pre-built structure.

### Reusing `pnwm-filter-bar` for the browse state filter

**What people do:** Drop the existing `pnwm-filter-bar` component into the browse page to get a "free" state filter.
**Why it's wrong:** `pnwm-filter-bar` is designed for a single species (it reads per-species Parquet by slug). Its state options come from that species' actual records. On the browse page, the state filter needs to affect all taxa simultaneously from a shared dataset.
**Do this instead:** Build the state selector directly into `pnwm-taxon-browser`. It reads the browse Parquet once, derives available states from the data, and manages filtering internally.

---

## Integration Points Summary

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `taxon.js` → `browse/index.njk` | Eleventy data cascade; JSON serialized to `data-taxonomy` attribute | Standard Eleventy JS data file → template pattern |
| `build-data.js` → `browse.parquet` | DuckDB COPY TO with Snappy compression | Mirrors existing per-species export pattern |
| `copy-parquet.js` → `_site/` | `cp('data/parquet', '_site/species', recursive)` picks up `browse/` subdirectory automatically | No script change needed |
| `pnwm-taxon-browser` → `browse.parquet` | `loadBrowseParquet()` in `parquet-cache.js` | New function, same fetch + hyparquet pattern |
| `pnwm-taxon-browser` → taxonomy tree | Reads `data-taxonomy` attribute, parses JSON in `connectedCallback` | Inline data, no fetch |
| `browse/index.njk` noscript fallback | Static HTML family/genus listing inside `<noscript>` | Preserves graceful degradation requirement |

---

## Sources

- Existing source files read directly: `src/_data/families.js`, `src/_data/images.js`, `src/components/pnwm-filter-bar.js`, `src/components/parquet-cache.js`, `src/components/pnwm-occurrence-map.js`, `src/browse/index.njk`, `src/browse/genus.njk`, `scripts/build-data.js`, `scripts/copy-parquet.js`, `scripts/copy-images.js`
- PROJECT.md for constraints and decisions: SEO-01 redirect deferral, Snappy compression requirement, DuckDB `@duckdb/node-api` API patterns
- Established project patterns: post-Vite copy script, parquet-cache slug convention, `data-pagefind-ignore` for interactive components

---
*Architecture research for: PNW Moths v1.3 Visual Browse*
*Researched: 2026-04-18*
