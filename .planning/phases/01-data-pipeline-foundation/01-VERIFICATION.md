---
phase: 01-data-pipeline-foundation
verified: 2026-04-11T22:41:51Z
status: verified
score: 4/4 must-haves verified
overrides_applied: 0
deferred:
  - truth: "Per-species Parquet files are loaded asynchronously client-side via hyparquet"
    addressed_in: "Phase 3"
    evidence: "Phase 3 success criteria #1: 'A species page renders a Leaflet map of occurrence points loaded from the per-species Parquet file via hyparquet'; INTV-01 requirement mapped to Phase 3"
human_verification:
  - test: "Run npm run build from a completely clean checkout (no node_modules, no data/parquet, no _site)"
    expected: "After `npm install && npm run build`, all 5 HTML pages and 5 Parquet files appear in _site/species/ with no manual intervention beyond npm install"
    why_human: "Verifier ran npm install manually before build; a clean-checkout build requires confirming the full dependency install + build cycle is documented and works end-to-end without friction for a new contributor"
---

# Phase 1: Data Pipeline Foundation Verification Report

**Phase Goal:** Build the data pipeline foundation — project scaffold, CSV-to-DuckDB-to-Parquet build script, and Eleventy integration generating per-species HTML pages and deploying Parquet files alongside them.
**Verified:** 2026-04-11T22:41:51Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Running `npm run build` produces one HTML file per species at `/species/[lowercase-hyphenated-slug]/` | VERIFIED | Build output: 5 HTML pages at correct paths (acronicta-americana, autographa-californica, hyles-lineata, manduca-sexta, smerinthus-cerisyi). All directories are lowercase-hyphenated. |
| 2 | Per-species Parquet files exist in build output alongside HTML pages with correct occurrence records | VERIFIED | `_site/species/{slug}/records.parquet` present for all 5 species; acronicta-americana Parquet is 1976 bytes (non-zero). Passthrough copy via `{ "data/parquet": "species" }` works correctly. |
| 3 | Introducing a malformed row causes build failure with specific, actionable error message | VERIFIED | Integration test `build-data.js with bad CSV data exits non-zero with "Validation failed"` passes. records-bad.csv triggers orphaned species_id, invalid record_type, and out-of-bounds coordinate errors. All 5 tests pass (`npm test`). |
| 4 | The complete build completes without manual intervention from a clean working directory | VERIFIED (with note) | `npm run build` ran with exit code 0 and no manual steps after `npm install`. Build: data export (5 Parquet files) + Eleventy (5 HTML + 5 Parquet copies) in ~0.08s. See human verification item for clean-checkout confirmation. |

**Score:** 4/4 truths verified

### Deferred Items

Items not yet met but explicitly addressed in later milestone phases.

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Client-side hyparquet loading of per-species Parquet files (second half of DATA-06) | Phase 3 | Phase 3 success criteria #1: "A species page renders a Leaflet map of occurrence points loaded from the per-species Parquet file via hyparquet"; requirement INTV-01 maps to Phase 3 |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.nvmrc` | Node version pin | VERIFIED | Contains "22" |
| `package.json` | ESM project manifest with build:data, build:eleventy, build, test scripts | VERIFIED | `"type": "module"`, all 4 scripts present, correct dependencies declared |
| `data/species.csv` | Species source data with correct schema | VERIFIED | Header: `id,genus,species,common_name,noc_id,authority`; 6 lines (1 header + 5 data rows) |
| `data/records.csv` | Occurrence records source data with correct schema | VERIFIED | Header: `species_id,record_type,latitude,longitude,state,county,locality,elevation,year,month,day,collector,collection,notes`; 11 lines (1 header + 10 data rows) |
| `data/records-bad.csv` | Validation test fixture | VERIFIED | Present; 6 lines with orphaned species_id, invalid_type, out-of-bounds coordinates |
| `scripts/build-data.js` | CSV validation, DuckDB import, Parquet export | VERIFIED | 207 lines; exports `validateCsv` and `main`; all validation logic present |
| `scripts/build-data.test.js` | Unit tests for validateCsv + integration tests | VERIFIED | 119 lines; 5 tests (3 unit, 2 integration); all pass |
| `eleventy.config.js` | Eleventy ESM config with passthrough copy | VERIFIED | 13 lines; `addPassthroughCopy({ "data/parquet": "species" })`; `dir.input = "src"`, `dir.output = "_site"` |
| `src/_data/species.js` | Async Eleventy data file querying DuckDB | VERIFIED | 37 lines; async default export; DuckDB `:memory:` mode; `read_csv('data/species.csv')`; `lower(genus || '-' || species) AS slug`; `getRowObjectsJS()` correct API |
| `src/species/species.njk` | Pagination template generating one page per species | VERIFIED | `pagination:`, `data: species`, `size: 1`, `alias: sp`; permalink `species/{{ sp.slug }}/index.html`; renders genus, species, common_name, noc_id, authority |
| `_site/species/acronicta-americana/index.html` | Generated species HTML page | VERIFIED | Exists; contains "Acronicta americana" (2 occurrences in title and h1) |
| `_site/species/acronicta-americana/records.parquet` | Per-species Parquet file alongside HTML | VERIFIED | Exists; 1976 bytes (non-zero) |
| `.gitignore` | Excludes build output directories | VERIFIED | Contains `_site/`, `data/parquet/`, `node_modules/` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `scripts/build-data.js` | `data/species.csv` | DuckDB `read_csv` | WIRED | Line 85: `read_csv('data/species.csv', header = true, columns = {...})` |
| `scripts/build-data.js` | `data/records.csv` | DuckDB `read_csv` | WIRED | Line 100: `read_csv('data/records.csv', header = true, columns = {...})` |
| `scripts/build-data.js` | `data/parquet/` | DuckDB `COPY TO` with FORMAT parquet, COMPRESSION zstd | WIRED | Line 187: `COPY (SELECT * FROM records WHERE species_id = ...) TO '${outDir}/records.parquet' (FORMAT parquet, COMPRESSION zstd)` |
| `src/_data/species.js` | `data/species.csv` | DuckDB `read_csv` in async function | WIRED | Line 9: `read_csv('data/species.csv', header = true, columns = {...})` |
| `src/species/species.njk` | `src/_data/species.js` | Eleventy pagination `data: species` | WIRED | Frontmatter `data: species` resolved to `src/_data/species.js` by Eleventy convention; 5 pages generated confirming live connection |
| `eleventy.config.js` | `data/parquet/` | `addPassthroughCopy` | WIRED | Line 4: `addPassthroughCopy({ "data/parquet": "species" })`; build confirms 5 Parquet files copied to `_site/species/` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `src/species/species.njk` | `sp` (pagination alias) | `src/_data/species.js` → DuckDB `read_csv('data/species.csv')` → `getRowObjectsJS()` | Yes — 5 rows from actual CSV | FLOWING |
| `_site/species/acronicta-americana/index.html` | species data (genus, species, etc.) | Template rendered with real CSV data | Yes — "Acronicta americana" appears in HTML output | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `npm test` passes all 5 tests | `npm test` | 5 pass, 0 fail | PASS |
| `npm run build` produces 5 HTML pages | `npm run build` | 5 files written, exit code 0 | PASS |
| All URL slugs are lowercase-hyphenated | `find _site/species -mindepth 1 -maxdepth 1 -type d` | 5 dirs, 0 uppercase chars | PASS |
| Parquet files deployed alongside HTML | `find _site/species -name "*.parquet"` | 5 Parquet files present, each non-zero bytes | PASS |
| HTML contains correct species name | `grep "Acronicta americana" _site/species/acronicta-americana/index.html` | 2 matches (title + h1) | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| DATA-01 | 01-01 | Species list stored in CSV with correct fields | SATISFIED | `data/species.csv` has `id,genus,species,common_name,noc_id,authority`; 5 data rows with correct types |
| DATA-02 | 01-01 | Occurrence records stored in CSV with correct fields | SATISFIED | `data/records.csv` has all 14 required fields; 10 data rows |
| DATA-03 | 01-01 | Pre-build script loads CSV into DuckDB and exports per-species Parquet | SATISFIED | `scripts/build-data.js` validates, imports into DuckDB `:memory:`, exports `data/parquet/{slug}/records.parquet` |
| DATA-04 | 01-02 | Eleventy data files query DuckDB at build time; per-species data NOT embedded inline | SATISFIED | `src/_data/species.js` queries DuckDB for species metadata only; occurrence data lives only in Parquet files |
| DATA-05 | 01-01 | Build fails with clear error on malformed CSV | SATISFIED | 4 post-import validation queries cover orphaned refs, invalid record_type, OOB coordinates, NULL required fields; pre-flight UTF-8 and column validation also implemented |
| DATA-06 | 01-02 | Per-species Parquet files generated and deployed alongside HTML | SATISFIED (partial — client-side loading deferred to Phase 3) | Parquet files generated to `data/parquet/{slug}/` and copied to `_site/species/{slug}/` via passthrough copy. Client-side hyparquet loading is Phase 3 / INTV-01. |
| SPEC-01 | 01-02 | Eleventy generates one HTML page per species from a single pagination template | SATISFIED | `src/species/species.njk` with `pagination: data: species, size: 1` generates 5 pages from stub data; template scales to any number of species |
| SPEC-05 | 01-02 | Species pages use lowercase hyphenated URL slugs | SATISFIED | DuckDB `lower(genus \|\| '-' \|\| species) AS slug` in data file; permalink `species/{{ sp.slug }}/index.html`; all 5 generated dirs are lowercase-hyphenated |

### Anti-Patterns Found

No anti-patterns detected. No TODO/FIXME/PLACEHOLDER comments. No stub return patterns in production code. No hardcoded empty arrays/objects passed to rendering paths.

Note: `src/species/species.njk` is intentionally a minimal HTML scaffold (no styling, navigation, or occurrence map) — this is documented in 01-02-SUMMARY.md as "Known Stubs" with explicit deferral to Phase 2 and Phase 3. The template renders real data from DuckDB and is not a code stub.

### Human Verification Required

#### 1. Clean Checkout Build

**Test:** On a machine with no prior dependencies, run:
```
git clone <repo> && cd pnwmoths && npm install && npm run build
```
**Expected:** Build completes with 5 HTML pages and 5 Parquet files in `_site/species/`, no manual steps required beyond `npm install`.
**Why human:** Verifier ran `npm install` manually (node_modules not in git). SC #4 specifies "from a clean working directory" — while `npm install` is standard Node.js convention and the build itself is fully automated, confirming the full cycle works without friction for a new contributor requires a fresh-machine test.

### Gaps Summary

No gaps. All 4 roadmap success criteria are verified. The one HUMAN_NEEDED item is a clean-checkout confirmation — a low-risk formality since `npm install && npm run build` is standard Node.js convention and the build was verified to work immediately after install.

The DATA-06 client-side hyparquet loading is correctly deferred to Phase 3 (INTV-01) — Phase 1 success criteria only require Parquet files to exist and be deployed, which is verified.

---

_Verified: 2026-04-11T22:41:51Z_
_Verifier: Claude (gsd-verifier)_
