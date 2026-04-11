---
phase: 01-data-pipeline-foundation
plan: "02"
subsystem: eleventy-build
tags: [eleventy, duckdb, parquet, pagination, static-site, build-pipeline]

# Dependency graph
requires:
  - 01-01 (data/parquet/{slug}/records.parquet files, species.csv schema)
provides:
  - eleventy.config.js: ESM Eleventy config with passthrough copy data/parquet -> _site/species
  - src/_data/species.js: async Eleventy data file querying DuckDB for species list with slugs
  - src/species/species.njk: pagination template generating one HTML page per species
  - Full build pipeline: npm run build (build:data then build:eleventy) produces deployable output
affects:
  - 01-03 (client-side Parquet reading depends on _site/species/{slug}/records.parquet paths)
  - Phase 2 (species factsheet template builds on this pagination scaffold)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Eleventy 3.x ESM config: export default function in eleventy.config.js"
    - "addPassthroughCopy object form: { 'data/parquet': 'species' } maps slug dirs correctly"
    - "Eleventy async data file: export default async function in src/_data/species.js"
    - "DuckDB in data files: :memory: mode avoids file locking between data files"
    - "DuckDB API (confirmed): getRowObjectsJS() for row objects, closeSync() for cleanup"
    - "Eleventy pagination: data: species, size: 1, alias: sp in frontmatter"
    - "Lowercase slug in permalink: lower(genus || '-' || species) via DuckDB query"

key-files:
  created:
    - eleventy.config.js
    - src/_data/species.js
    - src/species/species.njk
  modified:
    - package.json
    - .gitignore

key-decisions:
  - "Use addPassthroughCopy object form { 'data/parquet': 'species' } — simpler and correct for slug directory mapping"
  - "DuckDB :memory: mode in _data/species.js — no file locking, reads species.csv fresh each build"
  - "getRowObjectsJS() confirmed as correct API (established in Plan 01, applied here)"

# Metrics
duration: 2min
completed: 2026-04-11
---

# Phase 1 Plan 02: Eleventy Build Pipeline Summary

**Eleventy pagination wired to DuckDB species data, generating 5 HTML stub pages at correct URL slugs with per-species Parquet files deployed alongside via passthrough copy**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-04-11T22:28:58Z
- **Completed:** 2026-04-11T22:30:31Z
- **Tasks:** 2
- **Files created:** 3
- **Files modified:** 2

## Accomplishments

- `eleventy.config.js`: ESM config with `addPassthroughCopy({ "data/parquet": "species" })` and `dir.input = "src"`, `dir.output = "_site"`
- `src/_data/species.js`: async function that opens DuckDB `:memory:`, reads `data/species.csv` with explicit column types, returns species array with lowercase-hyphenated slugs via `getRowObjectsJS()`
- `src/species/species.njk`: Nunjucks pagination template using `data: species`, `size: 1`, `alias: sp`, permalink at `species/{{ sp.slug }}/index.html`
- `npm run build` pipeline: `build:data` (DuckDB CSV->Parquet) then `build:eleventy` (pagination + passthrough copy)
- 5 HTML pages generated at correct lowercase-hyphenated slugs
- 5 Parquet files copied alongside HTML via Eleventy passthrough copy
- All existing tests still pass (5/5)

## Task Commits

1. **Task 1: Eleventy config, species data file, and pagination template** — `d2e9cad` (feat)
2. **Task 2: Wire full build pipeline and verify end-to-end** — `6aee9c6` (feat)

## Files Created/Modified

- `eleventy.config.js` — ESM Eleventy config with passthrough copy and input/output dirs
- `src/_data/species.js` — Async DuckDB data file returning species array with slugs
- `src/species/species.njk` — Pagination template, one page per species
- `package.json` — Added `build:eleventy` and `build` scripts
- `.gitignore` — Added `_site/` and `node_modules/`

## Decisions Made

- **`addPassthroughCopy` object form**: `{ "data/parquet": "species" }` maps `data/parquet/acronicta-americana/records.parquet` to `_site/species/acronicta-americana/records.parquet`. The simpler form (recommended in plan) works correctly.
- **DuckDB `:memory:` mode in data files**: Avoids file locking when multiple data files might access DuckDB concurrently (RESEARCH.md Pitfall 3). Reads `species.csv` directly on each build.
- **`getRowObjectsJS()` and `closeSync()`**: Applied the corrected API from Plan 01. Plan 02 template used `result.rows` and `conn.close()` (both wrong) — corrected based on Plan 01 deviation documentation before any bug manifested.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Applied corrected DuckDB API proactively**
- **Found during:** Task 1 (pre-empted before Task 2 debugging would have been needed)
- **Issue:** The plan template for `src/_data/species.js` used `result.rows` and omitted `conn.close()` call. Plan 01 SUMMARY established that `getRowObjectsJS()` and `closeSync()` are the correct API methods.
- **Fix:** Used `result.getRowObjectsJS()` instead of `result.rows`, and `conn.closeSync()` instead of any async `conn.close()` in the data file. Applied Plan 01's confirmed API pattern directly.
- **Files modified:** src/_data/species.js
- **Impact:** Zero — build worked first time with no debugging required.

---

**Total deviations:** 1 proactive API correction (Rule 2 — applied known-correct pattern from Plan 01)
**Impact on plan:** Positive — avoided a debugging round that would have occurred otherwise.

## Known Stubs

- `src/species/species.njk` renders basic species data (genus, species, common_name, noc_id, authority) with no styling, navigation, occurrence map, or image gallery. This is intentional per plan objective: "Phase 2 will add full factsheet content, navigation, and styling." The page exists at the correct URL slug with correct data — the stub serves as the scaffold for Phase 2.

## Threat Surface Scan

No new threat surface beyond what is documented in the plan's threat model:
- T-01-05: Nunjucks auto-escaping handles HTML injection via species names (verified: Eleventy 3.x uses Nunjucks which auto-escapes by default)
- T-01-06: Parquet passthrough copy contains intentionally public occurrence data — accepted
- T-01-07: Slug via `lower(genus || '-' || species)` — alphanumeric-only validated in Plan 01's `validateSlugComponent()`; Eleventy output paths normalized within `_site/`

## User Setup Required

None — `npm install && npm run build` is sufficient.

## Next Phase Readiness

- Full build pipeline operational: `npm run build` produces deployable static output
- Species HTML pages at correct URL slugs (`/species/{lowercase-hyphenated}/`)
- Per-species Parquet files deployed alongside HTML at `_site/species/{slug}/records.parquet`
- Template scaffold in place for Phase 2 factsheet content
- Ready for Plan 01-03 (if any) or Phase 2 species factsheet development

---
*Phase: 01-data-pipeline-foundation*
*Completed: 2026-04-11*
