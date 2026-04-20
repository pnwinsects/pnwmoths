# Pitfalls Research

**Domain:** Eleventy/Lit/Parquet static site — adding accordion browse, navigation images, species-x-state Parquet filter
**Researched:** 2026-04-18
**Confidence:** HIGH (grounded in existing codebase + verified against official docs and known issues)

---

## Critical Pitfalls

### Pitfall 1: Parquet passthrough copy wiped by eleventy-plugin-vite on production build

**What goes wrong:**
The new species-x-state Parquet file (e.g. `data/parquet/species-state.parquet`) will be added to `eleventy.config.js` as a passthrough copy. During a production build, `eleventy-plugin-vite` renames `_site/` to `.11ty-vite`, runs Vite into a fresh `_site/`, then copies back processed assets — but only assets that Vite sees referenced from HTML. Binary files passthrough-copied from outside Vite's processing graph are silently dropped. This is an already-known issue (GitHub issue #42 on eleventy-plugin-vite), confirmed as affecting any passthrough-copied binary.

**Why it happens:**
The project already solved this for per-species Parquet files with `scripts/copy-parquet.js` and an explicit `build:copy-parquet` step. Adding a second cross-cutting Parquet file without extending that same post-build copy script repeats the exact mistake the workaround was designed to prevent.

**How to avoid:**
Extend `scripts/copy-parquet.js` (or create a companion script) to also copy the species-state Parquet file into `_site/` after Vite finishes. Update the `build` npm script to include this copy step. Do not rely on `eleventyConfig.addPassthroughCopy` alone for any Parquet file.

**Warning signs:**
Build succeeds locally (dev server doesn't run Vite's rename dance), but the browse page fails in CI or after a full production build with a 404 on the Parquet file. The `build:copy-parquet` test in CI is the canary.

**Phase to address:**
Phase that adds the species-state Parquet file to the build pipeline.

---

### Pitfall 2: Accordion in shadow DOM cannot be styled by Pico CSS global rules

**What goes wrong:**
The existing `pnwm-filter-bar` uses shadow DOM (default `LitElement` behavior) with `static get styles()`. If the accordion component (`pnwm-taxon-browser` or similar) uses shadow DOM, Pico CSS rules (`summary`, `details`, `h2`, `h3`, etc.) and the project's `theme.css` custom properties will not apply inside the component. CSS custom properties (`var(--pico-*)`) do pierce shadow DOM — but Pico's element selectors do not. The existing `pnwm-occurrence-map` uses `createRenderRoot() { return this; }` for Leaflet, establishing the pattern that light DOM is the escape hatch when global styles must apply.

**Why it happens:**
Shadow DOM is the default for `LitElement`. Developers expect `var(--pico-color)` to work (it does), but don't realize `h2 { font-size: ... }` from Pico's stylesheet won't apply to `h2` elements inside a shadow root.

**How to avoid:**
If the accordion needs Pico's heading/typography/details element styles, use `createRenderRoot() { return this; }` (light DOM mode), as established by `pnwm-occurrence-map`. Accept the trade-off: light DOM components leak their styles and lose slot/encapsulation features. Document this choice explicitly. If shadow DOM is preferred, forward all needed styles via `static styles` with explicit copies of required Pico rules (fragile — will drift as Pico updates) or use only CSS custom properties in the template.

**Warning signs:**
Accordion headings look unstyled compared to the rest of the page. `details`/`summary` expansion styling mismatches. Confirmed by inspecting the element in DevTools and seeing the shadow root boundary.

**Phase to address:**
Phase that creates the accordion Lit component.

---

### Pitfall 3: species.csv `subfamily` column breaks existing `validateCsv` and `families.js` hard-coded schema

**What goes wrong:**
`scripts/build-data.js` calls `validateCsv('data/species.csv', ['id', 'genus', 'species', 'common_name', 'noc_id', 'authority', 'family', 'similar_species'])` — this list does not include `subfamily`. Adding the column to the CSV silently passes validation (extra columns don't fail). However, `src/_data/families.js` hard-codes the DuckDB `read_csv` schema with explicit `columns = { ... }` — every column must be named. Adding `subfamily` to the CSV without adding it to the `columns` map in `families.js` (and `build-data.js`) causes DuckDB to either throw a schema mismatch error or silently ignore the new column.

The existing test in `build-data.test.js` (`validateCsv: species.csv with correct columns does not throw`) will still pass after adding `subfamily`, masking the fact that the new column is not wired up. No test verifies that `subfamily` is correctly read through and available in Eleventy templates.

**Why it happens:**
The pattern of explicitly enumerating column types in DuckDB's `read_csv` call is correct for type safety but requires synchronous updates across three locations: the CSV file, `build-data.js`'s schema definition, and `families.js`'s schema definition. Missing any one silently degrades behavior.

**How to avoid:**
When adding `subfamily` to `species.csv`, update all three in the same commit: (1) CSV header, (2) `build-data.js` `read_csv` columns map (add `'subfamily': 'VARCHAR'`), (3) `families.js` `read_csv` columns map. Update the `validateCsv` call to include `subfamily` in required columns only if it's truly required (it's nullable, so requiring it in `validateCsv` is wrong — instead, add it to the columns map but not to required columns). Add a test that verifies `subfamily` appears in the query output from `families.js` data.

**Warning signs:**
`DuckDB: Binder Error: Explicit column types specified, but column "subfamily" was not found` at build time. Or no error but `sp.subfamily` is always `undefined` in Nunjucks templates.

**Phase to address:**
Phase that adds the `subfamily` column to `species.csv`.

---

### Pitfall 4: Nunjucks `{% if sp.subfamily %}` silently treats empty string as falsy but SQL NULL arrives as `null` in JS

**What goes wrong:**
DuckDB returns SQL NULLs as JavaScript `null` in `.getRowObjectsJS()`. In Nunjucks, `{% if sp.subfamily %}` treats both `null` and `""` (empty string) as falsy, which is the correct intended behavior. However, the DuckDB schema must declare `'subfamily': 'VARCHAR'` — not `'subfamily': 'VARCHAR NOT NULL'`. If the column is accidentally cast as NOT NULL at import time, rows with blank `subfamily` cells in the CSV may error or coerce to empty string rather than NULL, causing the Nunjucks condition to evaluate differently than intended.

A second problem: the accordion taxonomy tree needs to group species with `subfamily IS NULL` directly under family. If the JS grouping logic uses `sp.subfamily !== null` (strict null check) but DuckDB actually returns `""` for blank CSV cells due to DuckDB's CSV auto-detection, the grouping silently puts all species under a subfamily named `""`.

**Why it happens:**
DuckDB's `read_csv` with explicit `columns` and `VARCHAR` type coerces blank CSV cells to `""` by default — not `NULL`. NULL in CSV (an empty field) becomes `""` unless you add `nullstr = ''` to the `read_csv` call.

**How to avoid:**
Add `nullstr = ''` to the `read_csv` call for `species.csv` in both `build-data.js` and `families.js` when reading the `subfamily` column. This ensures blank CSV cells for `subfamily` arrive as SQL NULL, which then arrives as JS `null`, which Nunjucks `{% if %}` handles correctly. Add a test with a species row where `subfamily` is blank and verify the grouping code puts it directly under family.

**Warning signs:**
`sp.subfamily` is `""` instead of `null`. All species with no subfamily appear under a taxon level named `""`. Check by logging `.getRowObjectsJS()` output for a species with a blank subfamily cell.

**Phase to address:**
Phase that adds the `subfamily` column and builds the taxonomy tree data structure.

---

### Pitfall 5: The species-state Parquet is a full-table JOIN that will grow large with real data

**What goes wrong:**
The v1.3 design emits a single species-×-state Parquet from `JOIN species ON records`. At ~130 stub records this is trivial. With 100k+ real occurrence records (the stated scale), the JOIN produces a table of `(species_slug, state, count)` or `(species_slug, state)` pairs. The schema choice matters: if the file is `SELECT DISTINCT species_slug, state FROM records` it's bounded by `species_count × state_count` (e.g., 700 × 6 = 4,200 rows, tiny). If it inadvertently emits one row per record (a debugging mistake), it's 100k rows and will be a multi-MB download that blocks the browse page.

A secondary issue: `parquet-cache.js` currently caches per-slug (per-species). The species-state Parquet is a single file loaded once. If it's loaded via the same `loadParquet(slug)` API, the cache key would need to be a sentinel value, not a slug. Using the wrong cache key causes the file to be fetched on every filter interaction.

**Why it happens:**
Easy to accidentally write `SELECT * FROM records JOIN species` instead of `SELECT DISTINCT species_slug, state FROM records`. Easy to forget that `loadParquet` in `parquet-cache.js` uses a slug-based URL template (`species/${slug}/records.parquet`) that won't work for a cross-cutting file.

**How to avoid:**
Schema: emit `SELECT DISTINCT species_slug, state FROM records WHERE state IS NOT NULL` — confirmed bounded size. Test the output row count before publishing. Cache: add a separate `loadSpeciesStateParquet()` function in `parquet-cache.js` with its own URL and cache key, rather than reusing the slug-based `loadParquet`. Add a test for the row count of the exported file with representative data.

**Warning signs:**
Browse page slow to load. Parquet file unexpectedly large in `data/parquet/`. `loadParquet` called with a non-slug key and cache misses on every filter change.

**Phase to address:**
Phase that adds the build-time species-state Parquet export and the client-side state filter.

---

### Pitfall 6: Retiring `/browse/{genus}/` pages breaks lychee's link validator and existing navigation

**What goes wrong:**
The current `browse/index.njk` generates `<a href="{{ ('/browse/' + genus.genus_slug + '/') | url }}">` links to per-genus pages. The current `browse/genus.njk` pagination generates those pages. When genus.njk is deleted and index.njk is rewritten as an accordion page, all the inter-page links in the existing `/browse/` HTML become dangling references — but the Eleventy build will not warn about this. Lychee's post-build link check (`build:validate-links`) will catch broken links only if it runs after a clean build and if the links appear in the final HTML.

A secondary problem: any external pages or cross-references (e.g., species pages) that link to `/browse/acronicta/` will produce 404s after the retirement. The project's stated decision to defer Django URL redirects (SEO-01) means there's no server-side redirect support — GitHub Pages serves static files only.

**Why it happens:**
Template deletion removes the output pages, but references to those pages are scattered in templates and could also appear in species pages if any were cross-linked. The build pipeline has no "dead output file reference" detector — lychee finds broken links in HTML but only if the links are still in the emitted HTML. If `browse/index.njk` is rewritten in the same commit as the genus page deletion, no HTML will contain the old `/browse/{genus}/` URLs and lychee won't flag it. But external bookmarks and crawled links will still 404.

**How to avoid:**
Before deleting `genus.njk`, audit all templates for links to `/browse/{genus}/` paths: search for `browse/` in `src/**/*.njk` and `src/**/*.md`. Confirm none of the ~700 species pages link to genus browse pages. For SEO, generate stub HTML redirect pages (one per retired genus URL) that redirect to `#genus-{slug}` on the new accordion browse page, or add a note to the build about accepted 404s. Document in PROJECT.md that `/browse/{genus}/` URLs are retired (not redirected) per SEO-01 deferral.

**Warning signs:**
Lychee reports 0 broken links (because old URLs no longer appear in any HTML), but Google Search Console eventually shows 404 spikes. Grep for `browse/` in templates before and after deletion.

**Phase to address:**
Phase that retires the genus.njk pagination and rewrites browse/index.njk.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Light DOM for accordion (like pnwm-occurrence-map) | Global Pico styles apply automatically | Styles from accordion leak into page; no slot encapsulation | Acceptable for this project — already established pattern |
| Single species-state Parquet (not partitioned by state) | Simpler build query | Whole file loaded for any state filter; 700×6 rows is fine at current scale | Acceptable until record count reaches 50k+ and file exceeds ~200KB |
| Inline taxonomy JSON in `<script>` tag vs fetch | No separate HTTP request; simpler | JSON is embedded in HTML, bloating page and potentially Pagefind index | Acceptable if `data-pagefind-ignore` is applied to the script tag |
| Extending `copy-parquet.js` rather than fixing root cause | Minimal new code | Two copy scripts to maintain; fragile post-Vite build sequence | Acceptable as the upstream plugin issue is not resolved in project's Vite version |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| DuckDB `read_csv` + nullable VARCHAR column | Blank CSV cells arrive as `""` not NULL | Add `nullstr = ''` parameter to `read_csv` call |
| hyparquet + whole-file ArrayBuffer | Using `asyncBufferFromUrl` (range requests) fails on GitHub Pages CDN (documented in parquet-cache.js) | Continue existing pattern: fetch whole file, wrap ArrayBuffer manually — already solved for per-species files |
| Lit + shadow DOM + Pico CSS | Expect global `summary`, `details`, `h3` styles to apply inside component | They don't. Use light DOM or copy required styles into `static get styles()` |
| Eleventy data cascade + large JSON in `<script>` | Embedded JSON is indexed by Pagefind | Wrap `<script>` in element with `data-pagefind-ignore` or load via client-side fetch |
| `composed: true` on accordion expand/collapse events | All ancestor listeners hear the event; internal state exposed | Use `composed: false` if event only needs to be heard by the browse page shell; `composed: true` only for cross-component state like filter-change |
| DuckDB `COPY ... TO ... (FORMAT parquet, COMPRESSION snappy)` | Forgetting `COMPRESSION snappy` — ZSTD is default but breaks hyparquet | Always specify `COMPRESSION snappy` — already documented in PROJECT.md Key Decisions |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Species-state Parquet emits one row per record instead of DISTINCT | Browse page loads slowly; Parquet file MB-sized | Use `SELECT DISTINCT species_slug, state` — verify row count in test | At 10k records (~10k rows vs expected ~700×6=4200) |
| Accordion expands all nodes simultaneously, each triggering image requests | Browser fires 40+ parallel image fetches on expand-all | Lazy-load images per taxon; only fetch images for expanded nodes | Any number of simultaneous expansions |
| Taxonomy tree built in Eleventy data file with O(n²) grouping | Build slow; `_data/families.js` takes >5s | DuckDB ORDER BY and GROUP BY are fast; do grouping in SQL not in JS | ~700 species is fine; 7000+ would matter |
| loadParquet called in `connectedCallback` with no deduplication for the species-state file | Multiple components each trigger separate fetches of the same file | Ensure the species-state file has its own module-level cache entry | Any page with >1 state-filter component |

---

## "Looks Done But Isn't" Checklist

- [ ] **subfamily column:** Added to CSV header and verified that `families.js` DuckDB schema includes it AND `nullstr = ''` is set — not just added to the CSV
- [ ] **navigational flag in images.csv:** Added to CSV header AND `validateCsv` required-columns list updated AND `build-data.js` DuckDB schema updated (images table is currently not imported into DuckDB, so a new import may be needed)
- [ ] **Parquet post-build copy:** Species-state Parquet file copied to `_site/` by post-Vite script, not just by passthrough copy
- [ ] **Accordion expand/collapse state:** Component state is reactive (causes re-render) — not just a class toggle on a raw DOM element outside Lit's render tree
- [ ] **State filter hides taxa:** Filter hides the entire taxon row (family/genus) when no species in that taxon have occurrences in the selected state — not just individual species rows
- [ ] **Retired genus pages:** `build:validate-links` still passes after genus.njk is deleted (no template still links to `/browse/{genus}/`)
- [ ] **Pagefind exclusion:** Taxonomy JSON injected into browse page shell has `data-pagefind-ignore` on its container
- [ ] **Snappy compression:** Species-state Parquet export uses `COMPRESSION snappy`

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Species-state Parquet missing from `_site/` in production | LOW | Add file to `copy-parquet.js` (or companion script), re-run `npm run build:copy-parquet` equivalent |
| Accordion visually broken due to shadow DOM / Pico mismatch | MEDIUM | Switch to light DOM (`createRenderRoot() { return this; }`), re-test styling and event bubbling |
| `subfamily` silently ignored (arrived as `""`) | LOW | Add `nullstr = ''` to `read_csv`, re-run data build, re-test grouping logic |
| Browse page Parquet bloated (row-per-record instead of DISTINCT) | LOW | Fix the DuckDB COPY query, re-run `build-data.js`, re-run post-build copy |
| Retired genus URLs cause 404s externally | HIGH (SEO damage irreversible short-term) | Generate HTML redirect stubs pointing to `#genus-{slug}` anchor on browse page; accepted risk per SEO-01 deferral |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Species-state Parquet wiped by Vite | Phase: build-data pipeline extension | Full `npm run build` succeeds; `_site/species-state.parquet` (or equivalent) exists after build |
| Accordion shadow DOM / Pico CSS mismatch | Phase: accordion Lit component | Visual comparison of accordion in full-build context vs dev server |
| `subfamily` schema not updated in all 3 locations | Phase: species.csv schema extension | `families.js` data includes `subfamily` field; blank values arrive as `null` not `""` |
| Blank subfamily becomes `""` not `null` | Phase: species.csv schema extension | Unit test for grouping with blank-subfamily species |
| Species-state Parquet schema emits too many rows | Phase: build-data pipeline extension | Test asserts row count ≤ `species_count × distinct_state_count` |
| Retiring genus pages breaks lychee or leaves stale HTML | Phase: browse page retirement | `build:validate-links` passes; grep for `/browse/` in templates shows no dangling references |

---

## Sources

- Existing `eleventy.config.js`, `scripts/copy-parquet.js` — known passthrough-copy workaround pattern
- `scripts/build-data.js` — DuckDB schema definitions and `validateCsv` column lists
- `src/_data/families.js` — DuckDB `read_csv` with explicit `columns` map
- `src/components/pnwm-occurrence-map.js` — light DOM precedent (`createRenderRoot() { return this; }`)
- `src/components/pnwm-filter-bar.js` — shadow DOM with `static get styles()` precedent
- eleventy-plugin-vite GitHub Issue #42 — confirmed passthrough binary file wipe in production
- [Lit Shadow DOM docs](https://lit.dev/docs/components/shadow-dom/) — createRenderRoot light DOM note
- [Lit Styles docs](https://lit.dev/docs/components/styles/) — CSS custom properties pierce shadow DOM; element selectors do not
- [composed: true considered harmful](https://dev.to/open-wc/composed-true-considered-harmful-5g59) — event encapsulation guidance
- [DuckDB NULL Values docs](https://duckdb.org/docs/current/sql/data_types/nulls) — NULL handling in DuckDB queries
- [hyparquet README](https://github.com/hyparam/hyparquet/blob/master/README.md) — asyncBufferFromUrl, range request behavior
- PROJECT.md Key Decisions — `COMPRESSION snappy` required; GitHub Pages CDN range-request workaround

---
*Pitfalls research for: v1.3 Visual Browse — Eleventy/Lit/Parquet static site*
*Researched: 2026-04-18*
