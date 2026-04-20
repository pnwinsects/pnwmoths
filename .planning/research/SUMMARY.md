# Project Research Summary

**Project:** PNW Moths v1.3 Visual Browse
**Domain:** Biodiversity / natural history static site
**Researched:** 2026-04-20
**Confidence:** HIGH

## Executive Summary

The v1.3 milestone adds a single-page accordion browse (Family → Subfamily → Genus → Species) with navigation images and a client-side state filter, replacing the existing static family/genus browse pages. The existing stack (Eleventy 3.1, Vite 7, Lit 3.3, DuckDB node-api, hyparquet, Pico CSS) handles everything — **no new npm packages are required**. The principal work is: extend two CSV schemas, add one DuckDB export query, create one Eleventy data file (`taxon.js`, replacing `families.js`), write one new Lit component (`pnwm-taxon-browser`), and retire `genus.njk`.

The main integration risk is the Pico CSS / shadow DOM boundary: the accordion must use light DOM (`createRenderRoot() { return this; }`) so Pico's element-selector rules apply inside it, following the `pnwm-occurrence-map` precedent already in this codebase. The second major risk is schema synchronization — adding `subfamily` to `species.csv` requires simultaneous updates to three files and a DuckDB `nullstr` option to avoid silent grouping failures.

One resolved disagreement: FEATURES.md recommends JSON for the species-×-state distribution file; STACK.md and ARCHITECTURE.md both specify Parquet. **Recommendation: use JSON** — at full scale (700 species × ~6 PNW states) there are at most ~4,200 distinct (species, state) pairs (~20–30 KB). JSON is simpler to generate, simpler to fetch, and needs no hyparquet machinery. Parquet overhead is not justified at this data size.

## Key Findings

### Recommended Stack

No new dependencies. All four new feature areas are covered by already-installed packages. One version issue to resolve before work starts: `package.json` specifies `^8.0.8` for Vite but `7.3.2` is installed — run `npm install` first.

**Core technologies for new features:**
- **Lit 3.3.2** (`class-map`, `repeat`, `when` directives): accordion tree component — already installed
- **DuckDB node-api 1.5.1-r.2**: new COPY query for species-×-state Parquet — existing pattern
- **hyparquet 1.25.6**: client-side browse Parquet loading — `loadBrowseParquet()` addition to `parquet-cache.js`

### Expected Features

**Must have (table stakes):**
- `subfamily` column in `species.csv` (nullable) — genera without one fall directly under family
- `navigational` flag in `images.csv` — curated nav-image selection per iNaturalist curator model
- Fallback to lowest-weight species photos when no navigational images exist — no dead thumbnails at launch
- Hierarchical accordion with up to 4 nav images per taxon, show/hide toggle (on by default)
- Species-×-state Parquet built from records.csv; client-side state filter hides taxa with no records in selected states
- Graceful JS-off: all taxa visible as static HTML
- Per-genus static pages (`/browse/{genus}/`) retired

**Should have (polish):**
- Images collapse when drilling into a child taxon
- sessionStorage persistence for show/hide toggle

**Defer (v1.4+):**
- County-level filtering
- Shareable accordion URLs (deep links to expanded state)
- Expand-all / collapse-all (anti-feature at 700 species — triggers mass image load)
- Location-based auto-filter (friction vs. simple state dropdown)

### Architecture Approach

The Lit component reads the taxonomy tree from an inline `data-taxonomy` attribute injected by Eleventy (no runtime fetch needed for the tree), and loads the browse Parquet asynchronously via a new `loadBrowseParquet()` function in `parquet-cache.js`. The build pipeline adds one DuckDB COPY query to `build-data.js`; `copy-parquet.js`'s existing recursive copy propagates it to `_site/` without modification (to be verified in CI).

**Major components:**
1. `src/_data/taxon.js` — replaces `families.js`; queries subfamily + nav images; builds tree for Eleventy
2. `build-data.js` COPY query — emits `data/parquet/browse/records.parquet` (DISTINCT species_slug × state)
3. `pnwm-taxon-browser.js` — Lit accordion, light DOM, nav images, show/hide toggle, state filter
4. `parquet-cache.js` + `loadBrowseParquet()` — browse Parquet fetch/cache
5. `browse/index.njk` (rewritten) + `genus.njk` (deleted) — shell page + retirement

### Critical Pitfalls

1. **Schema sync across 3 files** — `subfamily` column update must hit `species.csv` header, `build-data.js` columns map, and `families.js`/`taxon.js` columns map in the same commit, plus `nullstr = ''` on both `read_csv` calls. Missed update = silent failure.
2. **DuckDB `nullstr` for blank subfamily** — Without it, blank CSV cells arrive as `""` not `null`; genera group under a taxon named `""` silently.
3. **`copy-parquet.js` coverage** — New `data/parquet/browse/` subdirectory should be picked up by existing recursive copy; must be explicitly verified in CI on first build.
4. **Light DOM required** — Pico CSS element selectors don't penetrate shadow DOM; accordion must use `createRenderRoot() { return this; }`. Retrofitting is painful — decide at creation.
5. **Species-×-state query must use `SELECT DISTINCT`** — One row per `(species_slug, state)` pair, not one per record. At 100k+ occurrences, wrong query = MB-sized file.

## Implications for Roadmap

### Phase 8: Schema Extension
**Rationale:** Both new CSV columns are data dependencies for every other phase. Lowest risk, must go first.
**Delivers:** `species.csv` + `images.csv` headers updated; `validateCsv` calls + DuckDB `columns` maps updated in `build-data.js` and `families.js`; `nullstr = ''` added; tests for new columns and blank-subfamily handling.
**Avoids:** Pitfalls 1, 2.

### Phase 9: Build Pipeline Extension
**Rationale:** Species-×-state JSON and taxonomy-tree data must exist before component or shell page can be written against real data.
**Delivers:** New `src/_data/taxon.js` (replaces `families.js`); `build-data.js` query writing `_site/species-states.json` (DISTINCT species_slug × state); no Parquet machinery needed.
**Avoids:** Pitfall 5 (DISTINCT query).

### Phase 10: Shell Page
**Rationale:** Decouples Eleventy template work from Lit component work; delivers graceful JS-off behavior before any JS is written.
**Delivers:** `browse/index.njk` rewritten with `<pnwm-taxon-browser data-taxonomy="...">` and `<noscript>` static listing; `genus.njk` deleted after template audit for dangling links; link checker passes.
**Avoids:** Pitfall 6 (template audit before deletion).

### Phase 11: Lit Accordion Component
**Rationale:** All data inputs exist by this phase; light DOM decision made at creation, not retrofitted.
**Delivers:** `pnwm-taxon-browser.js` — accordion expand/collapse, nav images, show/hide toggle, state filter (fetches `species-states.json` directly).
**Avoids:** Pitfall 4 (light DOM from the start).

### Phase 12: Validation
**Rationale:** Integration issues (`species-states.json` missing from `_site/`, Pagefind indexing taxonomy JSON) only surface in full production build.
**Delivers:** Full `npm run build` verified; `_site/species-states.json` confirmed present; `data-pagefind-ignore` on taxonomy JSON; `build-data.test.js` extended; Vite version resolved.

### Phase Ordering Rationale

- Schema first because both CSV columns are prerequisites — nothing else can be built without them
- Build pipeline second so real data exists for component development
- Shell page before component to establish Eleventy/Lit boundary and get JS-off behavior early
- Validation last because some issues (species-states.json copy, Pagefind exclusion) only manifest in production build

### Research Flags

Phases with standard patterns (skip `gsd-research-phase`):
- **Phase 8 (Schema):** Direct CSV + DuckDB pattern; no novel territory
- **Phase 9 (Build Pipeline):** Follows existing `build-data.js` COPY pattern exactly
- **Phase 12 (Validation):** Follows existing test patterns

Phases that may benefit from targeted planning research:
- **Phase 10 (Shell Page):** Verify `data-pagefind-ignore` placement and Nunjucks `dump | escape` behavior for large JSON attributes
- **Phase 11 (Component):** Review existing `pnwm-filter-bar` event patterns and `composed` flag decision before writing accordion

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All packages verified against installed versions; patterns confirmed from production code |
| Features | HIGH | Accordion/images grounded in original site; state filter is new but simple |
| Architecture | HIGH | All integration points verified against source files |
| Pitfalls | HIGH | Grounded in existing codebase patterns and known upstream issues |

**Overall confidence:** HIGH

### Gaps to Address

- **species-states.json output path:** Confirm `_site/` copy mechanism (Eleventy passthrough or build script) before Phase 9
- **Nav-image rollup SQL:** `taxon.js` aggregation query (genus/subfamily from species-level images) needs validation against real data in Phase 9
- **Vite 7 vs 8 version mismatch:** Resolve with `npm install` before Phase 8

## Sources

### Primary (HIGH confidence)
- Existing codebase: `pnwm-occurrence-map.js`, `parquet-cache.js`, `build-data.js`, `families.js` — patterns confirmed by direct source reading
- pnwmoths.biol.wwu.edu — reference for navigation image UX (4 thumbnails per genus)
- Lit 3.3 docs — `createRenderRoot()` light DOM pattern confirmed
- DuckDB node-api docs — `nullstr`, COPY/Snappy patterns confirmed

### Secondary (MEDIUM confidence)
- iNaturalist curator guidelines — validates manual `navigational` flag over algorithmic selection
- WAI-ARIA APG accordion pattern — keyboard accessibility guidance

---
*Research completed: 2026-04-20*
*Ready for roadmap: yes*
