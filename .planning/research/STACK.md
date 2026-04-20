# Stack Research: PNW Moths Static Site

**Project:** pnwmoths static rebuild
**Researched:** 2026-04-18 (updated for v1.3 Visual Browse milestone)
**Mode:** Ecosystem — standard 2025 stack for data-heavy Eleventy static site

---

## v1.3 Milestone Stack Additions

This section focuses on what is **new** for v1.3. The full existing stack (Eleventy 3.1.x, Vite 7.x,
DuckDB node-api 1.5.x, hyparquet 1.25.x, Lit 3.3.x, Leaflet 1.9.x, Pagefind 1.5.x, Pico CSS 2.1.x)
is validated and unchanged. Only additions and integration notes for the four new features are
documented here.

### Feature 1 — Accordion Lit component (`pnwm-taxonomy-browser`)

**No new packages.** Lit 3.3.2 (already installed) provides everything needed.

| Already Available | How It Serves v1.3 |
|-------------------|--------------------|
| `lit` 3.3.2 | `LitElement`, `html`, `css`, reactive properties, event system |
| `lit/directives/class-map.js` | Toggle `.expanded` CSS class on accordion nodes |
| `lit/directives/repeat.js` | Efficient keyed rendering of large family/genus/species lists |
| `lit/directives/when.js` | Conditionally render child images only when node is expanded |

**Accordion pattern:** Implement as a single `pnwm-taxonomy-browser` custom element. Static taxonomy
data (families → subfamilies → genera → species, with image paths) is embedded by Eleventy at build
time as JSON in a `<script type="application/json">` child element — same pattern as the existing
species page Parquet data. The component reads the JSON from its light DOM in `connectedCallback`,
constructs an internal tree, and renders it reactively. No parent-child shadow-DOM split is needed;
a flat array of node objects with `level` and `parentId` fields is simpler to manage and avoids
cross-shadow event coordination.

**Show/hide image toggle:** A single boolean `_imagesVisible` reactive property drives CSS
`display: none` on the image grid. No new dependency.

**Why not `<details>`/`<summary>` HTML elements:** The native elements do not support controlled
state (only one branch open at a time), emit no bubbling `toggle` event that crosses shadow DOM
boundaries, and give no hook for the "hide parent images when child is expanded" behavior. Lit's
reactive model is the right fit here.

**Confidence:** HIGH — verified Lit 3.3.2 installed; `class-map`, `repeat`, `when` directives
confirmed present in installed package.

---

### Feature 2 — Build-time DuckDB export: species × state Parquet

**No new packages.** `@duckdb/node-api` 1.5.1-r.2 (already installed) handles the export.

Add a new export step to `scripts/build-data.js` after the per-species Parquet loop:

```js
// After per-species loop, before conn.closeSync()
mkdirSync('data/parquet/browse', { recursive: true });
await conn.run(`
  COPY (
    SELECT
      lower(s.genus || '-' || s.species) AS species_slug,
      r.state,
      count(*) AS record_count
    FROM records r
    JOIN species s ON r.species_slug = lower(s.genus || '-' || s.species)
    WHERE r.state IS NOT NULL AND r.state != ''
    GROUP BY species_slug, r.state
  )
  TO 'data/parquet/browse/species-by-state.parquet'
  (FORMAT parquet, COMPRESSION snappy)
`);
```

The output file path `data/parquet/browse/species-by-state.parquet` follows the existing
`data/parquet/{slug}/records.parquet` naming convention. The `copy-parquet.js` script uses
`cp(src, dest, { recursive: true })` where `src = data/parquet` and `dest = _site/species`, so the
new file lands at `_site/species/browse/species-by-state.parquet`. The URL exposed to the browser
will be `/species/browse/species-by-state.parquet` (or with `BASE_URL` prefix, matching the existing
`parquet-cache.js` pattern).

**Schema:** `species_slug VARCHAR, state VARCHAR, record_count BIGINT`. Three narrow columns;
with ~11 species × ~6 states the file is tiny but the pattern scales to 700+ species.

**Snappy compression:** Already validated as required for hyparquet compatibility (GitHub Pages
serves gzip-encoded range responses, which breaks ZSTD; Snappy avoids this). Do not change
compression algorithm.

**Confidence:** HIGH — DuckDB `COPY ... TO ... (FORMAT parquet, COMPRESSION snappy)` pattern
already used in production in `build-data.js`. `copy-parquet.js` recursive copy confirmed.

---

### Feature 3 — Client-side hyparquet filtering of species-by-state Parquet

**No new packages.** `hyparquet` 1.25.6 (already installed) provides `parquetReadObjects`.

Extend `parquet-cache.js` with a new loader function:

```js
// parquet-cache.js addition
let browseStateCache = null;

export async function loadBrowseStateData() {
  if (browseStateCache) return browseStateCache;
  const url = `${import.meta.env.BASE_URL}species/browse/species-by-state.parquet`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  const file = {
    byteLength: arrayBuffer.byteLength,
    slice: (start, end) => arrayBuffer.slice(start, end),
  };
  browseStateCache = await parquetReadObjects({ file });
  return browseStateCache;
}
```

This follows the exact same fetch-whole-file pattern as the existing `loadParquet(slug)` function
(same CDN range-request issue applies). The cache is module-level (not per-key) since there is only
one browse state file.

**Filtering logic in `pnwm-taxonomy-browser`:** On state filter change, build a `Set` of species
slugs that have records in the selected state by filtering the in-memory `browseStateCache` array.
Pass this set into the tree render to hide taxa with no matching species. All filtering is pure JS
over the loaded array — no re-fetch, no streaming, no row-group filtering needed at this data size.

**hyparquet `filter` option:** The library supports a `filter` option in `parquetRead` for
pushing predicates down to row-group level. At the expected data size (~66 rows for 11 species × 6
states; ~4,200 rows at full 700-species scale) this is not worth the complexity. Load the full file
once; filter in JS.

**Confidence:** HIGH — `parquetReadObjects` API confirmed from source; fetch-whole-file pattern
confirmed working in production.

---

### Feature 4 — `navigational` flag in `images.csv` + `subfamily` column in `species.csv`

**No new packages.** Changes are to data files and validation in `build-data.js`.

#### `images.csv` — add `navigational` column

New column: `navigational` (optional boolean, stored as empty string `""` or `"true"`).

Pre-flight validation change in `build-data.js`:

```js
// Update validateCsv call for images.csv
validateCsv('data/images.csv', [
  'species_slug', 'filename', 'photographer', 'weight',
  'license', 'view', 'specimen', 'navigational'
]);

// Add value validation after the filename loop
for (const row of imageRows) {
  if (row.navigational !== '' && row.navigational !== 'true' && row.navigational !== 'false') {
    throw new Error(
      `Invalid navigational value "${row.navigational}" in images.csv row for ${row.filename} — must be "" or "true".`
    );
  }
}
```

DuckDB schema update in `build-data.js` and `src/_data/images.js`:

```js
columns = {
  // ... existing columns ...
  'navigational': 'BOOLEAN'
}
```

DuckDB's `read_csv` will coerce `""` → `NULL` and `"true"` → `TRUE` with `BOOLEAN` type, which is
the desired semantic (absent = not flagged; `"true"` = flagged as navigation candidate).

**Browse fallback logic:** In the Eleventy `_data/images.js` data file, compute per-species
navigation candidates: `WHERE navigational = TRUE ORDER BY weight LIMIT 4`. Fall back to `ORDER BY
weight LIMIT 4` when no navigational images exist. This computation happens at build time in the
DuckDB query, not in the client.

#### `species.csv` — add `subfamily` column

New column: `subfamily` (optional string, may be empty for genera without one).

Pre-flight validation change in `build-data.js`:

```js
validateCsv('data/species.csv', [
  'id', 'genus', 'species', 'common_name', 'noc_id',
  'authority', 'family', 'subfamily', 'similar_species'
]);
```

DuckDB schema update — add `'subfamily': 'VARCHAR'` to all `read_csv` calls that import species
(in `build-data.js` and `src/_data/families.js`).

**`families.js` query update:** The existing query must be updated to include `subfamily` in the
`SELECT DISTINCT` and `GROUP BY` so the accordion component gets the full taxonomy hierarchy:

```sql
SELECT DISTINCT family, subfamily, genus,
  lower(replace(genus, ' ', '-')) AS genus_slug
FROM species
ORDER BY family, COALESCE(subfamily, ''), genus
```

`COALESCE(subfamily, '')` in `ORDER BY` puts genera with no subfamily at the top of their family
group, which is the desired behavior per PROJECT.md ("genera without one fall directly under
family").

**Validation:** No additional enumeration check needed for subfamily values — they are free-form
taxonomy strings. The `validateCsv` column-presence check is sufficient.

**Confidence:** HIGH — DuckDB BOOLEAN coercion behavior confirmed from existing project patterns;
COALESCE sort confirmed as standard SQL.

---

## Integration Notes

### `copy-parquet.js` — no change needed

The existing `cp(src, dest, { recursive: true })` from `data/parquet/` → `_site/species/` will
automatically copy `data/parquet/browse/species-by-state.parquet` to
`_site/species/browse/species-by-state.parquet` without modification.

### `src/_data/families.js` — update required

Must add `subfamily` to the DuckDB schema and SELECT. Also add a new query to return per-taxon
navigation images (or move that logic to a new `_data/browse.js` file if the query complexity
warrants it). The accordion component needs:

```
{ family, subfamily, genus, genus_slug, navImages: [{ src, alt }] }
```

Recommended: add a second query in `families.js` that joins species to images and returns the top-4
navigational images per genus. Pass `{ genera, genusArray, navImages }` from the data file.
Alternatively, consolidate into a new `src/_data/browse.js` that owns all v1.3 browse data —
cleaner separation of concerns than overloading `families.js`.

### Build order — no change needed

`build:data` (DuckDB export) runs before `build:eleventy` (Eleventy reads `_data/*.js` files which
also query DuckDB). The new Parquet file is produced by `build:data` and copied by
`build:copy-parquet` after the Eleventy step. Order remains correct.

### `build-data.test.js` — new tests required

Add tests for:
- `validateCsv` accepting the new `navigational` column in `images.csv`
- `validateCsv` accepting the new `subfamily` column in `species.csv`
- Invalid `navigational` value triggers the new validation error
- The species-by-state Parquet export (integration test: run `main()`, check file exists and has
  expected row count)

---

## What NOT to Add

| Temptation | Why Not |
|------------|---------|
| A tree-structure library (e.g. `@blueprintjs/core`, `rc-tree`) | Lit already renders any DOM structure; a React/Angular component library brings incompatible rendering models and large bundles |
| `parquet-wasm` or Apache Arrow JS | `hyparquet` already handles Parquet reads; a second Parquet library adds bundle weight and complexity with no benefit |
| `dexie` or IndexedDB caching | The species-by-state file is tiny even at full scale; module-level cache in `parquet-cache.js` is sufficient |
| DuckDB-WASM for client-side filtering | ~5MB WASM bundle for a 4,200-row filter is extreme overkill; plain JS array filter is the right tool |
| `@web/test-runner` or Vitest | The project uses Node's built-in `node --test` runner; adding a second test framework creates tooling confusion |
| `lit/decorators` (TypeScript decorators) | The codebase uses the `static properties = {}` class field syntax (not TypeScript decorators); stay consistent |

---

## Version Compatibility

| Package | Installed | Status | Notes |
|---------|-----------|--------|-------|
| `lit` | 3.3.2 | Current | No changes needed |
| `hyparquet` | 1.25.6 | Current | No changes needed |
| `@duckdb/node-api` | 1.5.1-r.2 | 1.5.2-r.1 available | Upgrade optional; not blocking |
| `vite` | 7.3.2 (actual) | 8.0.9 available | `package.json` specifies `^8.0.8` but 7.3.2 is installed; resolve before this milestone |

Note: `npm outdated` shows `vite` current as 7.3.2 vs wanted 8.0.9. The `^8.0.8` spec in
`package.json` suggests a Vite 8 upgrade was intended. Run `npm install` to resolve before
starting v1.3 work to avoid surprises during Vite bundling.

---

## Sources

- Lit 3.3.2 installed package — directives confirmed via `ls node_modules/lit/directives/`
- hyparquet 1.25.6 `src/read.js`, `src/filter.js` — API confirmed via direct source read
- `@duckdb/node-api` 1.5.1-r.2 — COPY/parquet/snappy pattern confirmed from existing `build-data.js`
- `scripts/build-data.js`, `scripts/copy-parquet.js` — build pipeline integration points confirmed
- `src/components/parquet-cache.js` — fetch-whole-file pattern and module-level cache confirmed
- `data/images.csv`, `data/species.csv`, `data/records.csv` — column schemas confirmed
- `src/_data/families.js` — DuckDB query pattern and return shape confirmed
- `npm outdated` output — version currency verified 2026-04-18

---
*Stack research for: pnwmoths v1.3 Visual Browse milestone*
*Researched: 2026-04-18*
