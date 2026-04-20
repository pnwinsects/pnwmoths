---
phase: 08-schema-extension
reviewed: 2026-04-20T18:36:15Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - data/species.csv
  - data/images.csv
  - scripts/build-data.js
  - src/_data/families.js
  - src/_data/images.js
  - scripts/build-data.test.js
findings:
  critical: 2
  warning: 3
  info: 1
  total: 6
status: issues_found
---

# Phase 8: Code Review Report

**Reviewed:** 2026-04-20T18:36:15Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Reviewed the Phase 8 schema extension: new CSV columns (`subfamily`, `view`, `specimen`, `navigational`), the DuckDB build pipeline in `build-data.js`, Eleventy data loaders in `src/_data/`, and the test suite.

The UTF-8 validation, filename allowlisting, and slug-component allowlisting are well-implemented. The test coverage of null-coercion for new columns is good. However, two critical SQL injection risks exist in the Parquet export loop where slug values are interpolated directly into DuckDB SQL strings. Three warnings cover a missing `nullstr` on the `records` table, unvalidated cross-references from `similar_species` and `images.csv` into the species table, and a slug-construction mismatch between `families.js` and `build-data.js` that would silently diverge for multi-word genera.

## Critical Issues

### CR-01: SQL injection via slug interpolation in COPY statement

**File:** `scripts/build-data.js:214-217`

**Issue:** The composed `slug` and `outDir` strings are interpolated directly into a DuckDB SQL string without parameterization. Although `validateSlugComponent` is called on `genus` and `species` individually (lines 206-208) with a `[a-zA-Z0-9 ]+` allowlist, the composed slug (`genus-species` lowercased with spaces→hyphens) is never independently validated. A future change to slug construction logic — or a DuckDB API that accepts parameters — could break the injection barrier silently. The current allowlist on each component does prevent exploitation in practice today, but the SQL string is still constructed by raw interpolation.

More concretely: the `COPY ... TO '${outDir}/records.parquet'` path is also interpolated without parameterization (line 216), and DuckDB's `COPY` statement does not support bound parameters for the file path. The right fix is to validate the composed slug before interpolation.

**Fix:**
```js
// After building the slug (line 209), validate it before use in SQL
const slug = `${sp.genus}-${sp.species}`.toLowerCase().replace(/\s+/g, '-');

// Add: validate the composed slug
if (!/^[a-z0-9-]+$/.test(slug)) {
  throw new Error(`Composed slug "${slug}" contains unexpected characters — aborting Parquet export.`);
}

const outDir = `data/parquet/${slug}`;
mkdirSync(outDir, { recursive: true });

await conn.run(`
  COPY (SELECT * FROM records WHERE species_slug = '${slug}')
  TO '${outDir}/records.parquet'
  (FORMAT parquet, COMPRESSION snappy)
`);
```

This adds defense-in-depth at the composed-slug level, independent of the per-component checks.

### CR-02: `records` table loaded without `nullstr = ''` — optional fields arrive as empty string, not NULL

**File:** `scripts/build-data.js:116-137`

**Issue:** The `records` table is created without `nullstr = ''` (compare: `species` table at line 98 which correctly has `nullstr = ''`). Fields that are legitimately absent in CSV — `collector`, `collection`, `notes`, `locality`, `elevation_ft` — will arrive as empty string `""` instead of `NULL`. Downstream queries using `IS NULL` (e.g., filtering records without a collector) will silently return incorrect results. The validation query at line 175 checks `WHERE species_slug IS NULL OR latitude IS NULL OR longitude IS NULL` — those checks will also be skipped for empty-string values when `nullstr` is absent.

Additionally, `elevation_ft` is typed as `INTEGER` but empty CSV cells will fail to parse as integer without `nullstr = ''` to convert them first. This would cause a DuckDB type-cast error at import time for any record with a blank elevation field.

**Fix:**
```js
await conn.run(`
  CREATE TABLE records AS
  SELECT * FROM read_csv('data/records.csv',
    header = true,
    nullstr = '',          -- ADD THIS LINE
    columns = {
      'species_slug': 'VARCHAR',
      'record_type': 'VARCHAR',
      'latitude': 'DOUBLE',
      'longitude': 'DOUBLE',
      'state': 'VARCHAR',
      'county': 'VARCHAR',
      'locality': 'VARCHAR',
      'elevation_ft': 'INTEGER',
      'year': 'INTEGER',
      'month': 'INTEGER',
      'day': 'INTEGER',
      'collector': 'VARCHAR',
      'collection': 'VARCHAR',
      'notes': 'VARCHAR'
    }
  )
`);
```

## Warnings

### WR-01: `similar_species` slugs in `species.csv` are never validated against the species table

**File:** `scripts/build-data.js:140-181` (validation checks block)

**Issue:** The `similar_species` column in `species.csv` contains pipe-delimited slugs (e.g., `hyles-lineata|manduca-sexta`). No post-import validation query checks that these slugs resolve to actual species in the `species` table. A typo or stale reference (e.g., a species renamed) would pass build successfully and produce broken "similar species" links at render time without any build-time warning.

**Fix:** Add a validation check to the `validationChecks` array:
```js
{
  description: 'unresolved similar_species slug references',
  query: `
    WITH exploded AS (
      SELECT
        lower(genus || '-' || species) AS self_slug,
        unnest(string_split(similar_species, '|')) AS ref_slug
      FROM species
      WHERE similar_species IS NOT NULL AND similar_species != ''
    )
    SELECT DISTINCT e.self_slug, e.ref_slug
    FROM exploded e
    LEFT JOIN species s ON lower(s.genus || '-' || s.species) = e.ref_slug
    WHERE s.genus IS NULL
  `
}
```

### WR-02: `images.csv` `species_slug` values are not validated against the species table

**File:** `scripts/build-data.js:140-181` (validation checks block)

**Issue:** The `images.csv` file associates images with species via `species_slug`. The build pipeline validates image filenames (line 76-79) but never checks that the slugs in `images.csv` correspond to actual species. An image for `phyllodesma-americana` would build and be exported without error even if that species were removed from `species.csv`. The Parquet export loop (lines 203-219) only exports records from `records.csv`, not images, so orphaned images in `images.csv` would silently carry through.

**Fix:** Add to the `validationChecks` array (note: this requires loading `images.csv` into DuckDB first):
```js
// After creating the species table, also load images:
await conn.run(`
  CREATE TABLE images AS
  SELECT * FROM read_csv('data/images.csv',
    header = true,
    nullstr = '',
    columns = { 'species_slug': 'VARCHAR', ... }
  )
`);

// Then add to validationChecks:
{
  description: 'orphaned images (species_slug not in species table)',
  query: `
    SELECT DISTINCT i.species_slug
    FROM images i
    LEFT JOIN species s ON i.species_slug = lower(s.genus || '-' || s.species)
    WHERE s.genus IS NULL
  `
}
```

### WR-03: Slug construction in `families.js` does not apply space-to-hyphen replacement

**File:** `src/_data/families.js:37`

**Issue:** In `families.js`, species slugs are constructed as:
```js
lower(genus || '-' || species) AS slug
```
In `build-data.js` line 209, slugs are constructed as:
```js
`${sp.genus}-${sp.species}`.toLowerCase().replace(/\s+/g, '-')
```
For all current species (single-word genus and species) these are equivalent. However, the `validateSlugComponent` allowlist explicitly permits spaces (`[a-zA-Z0-9 ]+`), meaning a multi-word genus or species could be added to `species.csv` without triggering an error. In that case, `families.js` would produce a slug with a literal space (e.g., `"sphinx chersis"`) while `build-data.js` would produce `"sphinx-chersis"`. The rendered page URL and Parquet file path would diverge.

The `genus_slug` construction in `families.js` (line 29: `lower(replace(genus, ' ', '-'))`) correctly handles spaces — the same fix is needed for the species slug on line 37.

**Fix:** In `src/_data/families.js`, update the species slug computation:
```sql
-- line 37: change from:
lower(genus || '-' || species) AS slug
-- to:
lower(replace(genus || '-' || species, ' ', '-')) AS slug
```

Alternatively, tighten `validateSlugComponent` to disallow spaces, which would make the current slug construction safe by constraint:
```js
function validateSlugComponent(value, fieldName) {
  if (!/^[a-zA-Z0-9]+$/.test(value)) {  // remove space from allowlist
    throw new Error(...)
  }
}
```

## Info

### IN-01: Integration test depends on `data/records.csv` existing but that file is not in scope

**File:** `scripts/build-data.test.js:156`

**Issue:** The integration test at line 154 runs `node scripts/build-data.js` from the project root, which requires `data/records.csv` and `data/glossary.csv` to exist. These files are not included in the reviewed file list and are not visible as committed data files. If either file is absent (e.g., a fresh clone without them), the integration test at line 156 will fail with an opaque error from `validateCsv` rather than a test-framework assertion. The test has no guard or skip condition for missing prerequisite files.

This is an info-level observation because the integration test is likely intended to run in an environment where these files exist; it is not a bug in the logic being tested. Consider documenting the prerequisite in a comment, or adding an existence check that skips the test with a clear message when `data/records.csv` is absent.

---

_Reviewed: 2026-04-20T18:36:15Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
