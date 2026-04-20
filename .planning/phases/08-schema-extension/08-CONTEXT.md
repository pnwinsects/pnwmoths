# Phase 8: Schema Extension - Context

**Gathered:** 2026-04-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 8 adds two new columns to the flat-file data model and updates the build pipeline to handle them:

1. `subfamily` column in `species.csv` — nullable VARCHAR; blank values are coerced to NULL (not empty string) by the build pipeline. Genera without a subfamily fall directly under their family in the browse hierarchy.
2. `navigational` column in `images.csv` — VARCHAR flag; `true` marks the image as a browse navigation candidate; blank values coerce to NULL and are treated as false by consuming code.

Phase 8 also updates `families.js` to include `subfamily` in its column map, SELECT, and return value. Tests are added for blank-subfamily null-coercion and missing-navigational-flag behavior.

Phase 8 does NOT build the accordion component, the species-×-state JSON, or `taxon.js`. It does NOT retire per-genus pages. All browse UI work is deferred to Phases 9–12.

</domain>

<decisions>
## Implementation Decisions

### `navigational` column format
- **D-01:** `navigational` values in `images.csv` are `true` or blank (no explicit `false`). Blank = not navigational. DuckDB reads the column as VARCHAR with `nullstr = ''` so blank cells arrive as NULL; consuming code treats NULL as false.
- **D-02:** `navigational` is added to the `validateCsv` required-columns check for `images.csv` so the column presence is enforced at build time.

### `subfamily` column handling
- **D-03:** `subfamily` is added to the `validateCsv` required-columns check for `species.csv`. The column must exist in the CSV header; individual cell values may be blank (→ NULL).
- **D-04:** DuckDB `read_csv` for `species` table uses `nullstr = ''` (consistent with STATE.md decision) so blank `subfamily` cells arrive as NULL, not empty string.
- **D-05:** `build-data.js` schema map for `species` table gains `'subfamily': 'VARCHAR'`.
- **D-06:** `images.js` schema map gains `'navigational': 'VARCHAR'`; the column is included in the SELECT and returned per-species.

### `families.js` update
- **D-07:** `families.js` adds `'subfamily': 'VARCHAR'` to its `read_csv` column map and includes `subfamily` in the SELECT and returned `genera` data.
- **D-08:** `families.js` ORDER BY changes from `family, genus` to `family, subfamily NULLS LAST, genus`. This ensures genera without a subfamily sort after subfamilied genera within the same family.

### Claude's Discretion
- Exact `nullstr = ''` placement in `images.js` and `build-data.js` read_csv calls.
- Whether to add `nullstr = ''` to all existing `read_csv` calls or only the calls that need null coercion for new columns.
- Test fixture approach — synthetic temp-file fixtures (consistent with existing non-UTF-8 test pattern) are the natural choice for the null-coercion tests.
- DuckDB BOOLEAN vs VARCHAR for `navigational` — VARCHAR with null-as-false is consistent with `specimen` column convention.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — TAXON-01, TAXON-02, TAXON-03 (full specs for Phase 8)
- `.planning/ROADMAP.md` — Phase 8 goal, success criteria, dependency on Phase 7

### Project Context
- `.planning/PROJECT.md` — flat-file data model, DuckDB decisions, Eleventy stack
- `.planning/STATE.md` — key v1.3 research decisions including `nullstr = ''` requirement and light DOM note

### Existing Build Code (must read before editing)
- `scripts/build-data.js` — current validateCsv and DuckDB pipeline; add `subfamily` + `navigational` to column maps and required-columns checks
- `scripts/build-data.test.js` — existing test patterns; new tests follow the same synthetic-fixture style
- `src/_data/families.js` — reads species.csv; add `subfamily` to column map, SELECT, and return
- `src/_data/images.js` — reads images.csv; add `navigational` to column map, SELECT, and return
- `data/species.csv` — add `subfamily` column (with blank values for existing rows)
- `data/images.csv` — add `navigational` column (with blank values for existing rows)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `validateCsv()` in `build-data.js`: exported function; new tests import it directly (same pattern as existing tests).
- Synthetic temp-file fixture pattern: `build-data.test.js` already creates `tmp` directories for edge-case tests — follow this for null-coercion fixtures.

### Established Patterns
- All DuckDB `read_csv` calls use explicit `columns = {...}` maps — add new columns to every call that reads the relevant CSV.
- `getRowObjectsJS()` + `closeSync()` — established DuckDB API pattern; follow in any new queries.
- `validateCsv` requires column presence, not value completeness — blank values are valid for optional fields.
- Parquet export uses `COMPRESSION snappy` — not relevant for Phase 8 but established for Phase 9 reference.

### Integration Points
- `build-data.js` DuckDB species table schema: add `'subfamily': 'VARCHAR'` to the `columns` map.
- `images.js` DuckDB images table schema: add `'navigational': 'VARCHAR'` to the `columns` map.
- `families.js` DuckDB species table schema: add `'subfamily': 'VARCHAR'`; update SELECT and ORDER BY.
- `build-data.test.js` `validateCsv` test: update the happy-path test to include `subfamily` in the required-columns assertion for `species.csv`, and `navigational` for `images.csv`.

</code_context>

<specifics>
## Specific Ideas

- STATE.md note: "DuckDB `nullstr = ''` required on both read_csv calls — blank subfamily must arrive as null, not empty string, to avoid silent grouping failures." Apply the same nullstr to `images.csv` read for `navigational`.
- The `specimen` column in `images.csv` is also nullable VARCHAR — `navigational` follows the same convention.
- No existing data rows need a `true` value for `navigational` yet — all existing image rows can have blank navigational. The column addition is purely structural.
- Phase 8 Vite blocker from STATE.md: resolve Vite version mismatch (`npm install`) before starting.

</specifics>

<deferred>
## Deferred Ideas

None surfaced during discussion.

</deferred>

---

*Phase: 08-schema-extension*
*Context gathered: 2026-04-20*
