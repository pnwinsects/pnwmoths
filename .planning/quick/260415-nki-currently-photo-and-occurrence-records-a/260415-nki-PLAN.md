---
phase: quick
plan: 260415-nki
type: execute
status: complete
wave: 1
depends_on: []
files_modified:
  - data/images.csv
  - data/records.csv
  - data/records-bad.csv
  - src/_data/images.js
  - src/_data/species.js
  - scripts/build-data.js
  - scripts/build-data.test.js
  - src/species/species.njk
autonomous: true
requirements: []
must_haves:
  truths:
    - "images.csv and records.csv use species_slug (e.g. acronicta-americana) instead of numeric species_id"
    - "Species pages still display photos correctly"
    - "build-data.js validates and exports parquet files using slug-based joins"
    - "All existing tests pass with updated column names"
  artifacts:
    - path: "data/images.csv"
      provides: "Photo metadata keyed by species slug"
      contains: "species_slug"
    - path: "data/records.csv"
      provides: "Occurrence records keyed by species slug"
      contains: "species_slug"
    - path: "scripts/build-data.js"
      provides: "Build pipeline using slug joins"
  key_links:
    - from: "data/images.csv"
      to: "src/_data/images.js"
      via: "species_slug column read by DuckDB"
    - from: "src/_data/images.js"
      to: "src/species/species.njk"
      via: "images[sp.slug] lookup"
    - from: "data/records.csv"
      to: "scripts/build-data.js"
      via: "species_slug column joined to species table slug"
---

<objective>
Replace numeric `species_id` foreign keys in `images.csv` and `records.csv` with human-readable `species_slug` values (e.g. `acronicta-americana`). This makes the CSV files self-documenting and reduces the chance of data entry errors when adding new species, photos, or occurrence records.

Purpose: Improve maintainability of CSV data files by using slugs instead of opaque numeric IDs as cross-references.
Output: Updated CSV files, data loaders, build pipeline, and tests all using `species_slug`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@data/species.csv
@data/images.csv
@data/records.csv
@data/records-bad.csv
@src/_data/images.js
@src/_data/species.js
@scripts/build-data.js
@scripts/build-data.test.js
@src/species/species.njk

<interfaces>
From data/species.csv — the slug is derived as `lower(genus)-lower(species)`:
  id=1 -> acronicta-americana
  id=2 -> autographa-californica
  id=3 -> hyles-lineata
  id=4 -> manduca-sexta
  id=5 -> smerinthus-cerisyi
  id=6 -> phyllodesma-americana
  id=7 -> habrosyne-scripta
  id=8 -> antheraea-polyphemus
  id=9 -> sphinx-chersis
  id=10 -> notodonta-pacifica
  id=11 -> hemileuca-eglanterina

From src/_data/species.js line 37 — slug is computed as:
  lower(genus || '-' || species) AS slug

From src/species/species.njk line 41 — current image lookup:
  {% set spImages = images[sp.id] %}
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update CSV files — replace species_id with species_slug</name>
  <files>data/images.csv, data/records.csv, data/records-bad.csv</files>
  <action>
1. **data/images.csv**: Rename the `species_id` column header to `species_slug`. Replace each numeric ID with the corresponding slug from species.csv:
   - 1 -> acronicta-americana
   - 3 -> hyles-lineata
   - 6 -> phyllodesma-americana
   All other columns remain unchanged.

2. **data/records.csv** (668 lines): Rename the `species_id` column header to `species_slug`. Replace each numeric ID with its slug using the same mapping. The file has IDs 1-11 corresponding to the 11 species in species.csv. Use a script or systematic replacement — do NOT do this manually line by line. A reliable approach:
   - Read species.csv to build id->slug map
   - Read records.csv, replace column header and values
   - Write back

3. **data/records-bad.csv**: Rename `species_id` to `species_slug`. Replace numeric values:
   - 1 -> acronicta-americana
   - 999 -> keep as `nonexistent-species` (this is the intentionally bad row for testing orphaned records)
  </action>
  <verify>
    <automated>head -1 data/images.csv | grep -q species_slug && head -1 data/records.csv | grep -q species_slug && echo "OK"</automated>
  </verify>
  <done>All three CSV files use `species_slug` column with string slug values instead of numeric `species_id`.</done>
</task>

<task type="auto">
  <name>Task 2: Update data loaders, build pipeline, template, and tests</name>
  <files>src/_data/images.js, scripts/build-data.js, scripts/build-data.test.js, src/species/species.njk</files>
  <action>
**src/_data/images.js:**
- Change DuckDB column schema from `'species_id': 'INTEGER'` to `'species_slug': 'VARCHAR'`
- Change SELECT to use `species_slug` instead of `species_id`
- Change ORDER BY to use `species_slug`
- Change the grouping key from `String(row.species_id)` to `row.species_slug` (it's already a string, no conversion needed)

**src/species/species.njk line 41:**
- Change `{% set spImages = images[sp.id] %}` to `{% set spImages = images[sp.slug] %}`

**scripts/build-data.js:**
- Line 74: Change required columns for images.csv from `'species_id'` to `'species_slug'` in the validateCsv call
- Lines 88-91: Change required columns for records.csv from `'species_id'` to `'species_slug'`
- Lines 116-135: Change DuckDB records table schema — replace `'species_id': 'INTEGER'` with `'species_slug': 'VARCHAR'`
- Line 141-146 (orphaned records validation): Change the join from `r.species_id = s.id` to join on slug. Compute slug in the species table: `LEFT JOIN species s ON r.species_slug = lower(s.genus || '-' || s.species) WHERE s.genus IS NULL`. Update the SELECT to use `r.species_slug` instead of `r.species_id`.
- Lines 167-176 (coordinate/NULL checks): Replace `species_id` references with `species_slug` in SELECT columns and WHERE clauses
- Lines 198-216 (parquet export): Change the COPY WHERE clause from `species_id = ${sp.id}` to `species_slug = '${slug}'` (the slug variable is already computed on line 207)

**scripts/build-data.test.js:**
- Line 28: Change expected columns for images.csv from `'species_id'` to `'species_slug'`
- Line 137: Change test table creation to use `'acronicta-americana' AS species_slug` instead of `1 AS species_id`
- Line 141: Change SELECT to use `species_slug` instead of `species_id`
- Any other `species_id` references in test queries should become `species_slug`
  </action>
  <verify>
    <automated>cd /Users/rainhead/dev/pnwmoths && node scripts/build-data.js && node --test scripts/build-data.test.js && npx @11ty/eleventy --dryrun 2>&1 | tail -5</automated>
  </verify>
  <done>
- `node scripts/build-data.js` completes without validation errors and exports parquet files
- `node --test scripts/build-data.test.js` — all tests pass
- Eleventy dry run succeeds (template renders without error)
- Species pages would show photos correctly (images looked up by slug)
  </done>
</task>

</tasks>

<verification>
1. `node scripts/build-data.js` succeeds — validates CSVs, joins on slug, exports parquet
2. `node --test scripts/build-data.test.js` — all unit and integration tests pass
3. `npx @11ty/eleventy --dryrun` succeeds — templates compile without errors
4. `grep -c species_id data/images.csv data/records.csv data/records-bad.csv` returns 0 for all files
5. `grep -c species_slug data/images.csv data/records.csv data/records-bad.csv` returns >0 for all files
</verification>

<success_criteria>
- No remaining references to `species_id` in images.csv, records.csv, records-bad.csv, or any JS/Nunjucks files that consume them
- Build pipeline and all tests pass
- Photo display on species pages works via slug lookup
</success_criteria>

<output>
After completion, create `.planning/quick/260415-nki-currently-photo-and-occurrence-records-a/260415-nki-SUMMARY.md`
</output>
