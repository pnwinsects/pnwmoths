---
phase: 17-migrate-full-species-data-from-legacy-database
plan: "02"
subsystem: data-migration
tags: [migration, csv, sql-dump, species-data, records]

# Dependency graph
requires:
  - phase: 17-migrate-full-species-data-from-legacy-database
    provides: "17-01 test scaffold (migrate-species.test.js in RED state)"
provides:
  - "scripts/migrate-species.js — streaming SQL dump parser writing species.csv + records.csv"
  - "data/species.csv — 1,353 species rows (full production dataset)"
  - "data/records.csv — 86,851 PNW occurrence records (filtered from 94,795 total)"
affects:
  - "17-03 (build:data validation, full site build)"
  - "npm test (migrate-species.test.js now GREEN)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "readline streaming for large SQL dumps (avoids Node.js 512 MB string limit)"
    - "Multi-INSERT concatenation: 17 INSERT statements concatenated by stripping repeated headers and trailing semicolons"
    - "DB genus+species slug for records.csv join (not image-derived slug) to match build-data.js JOIN logic"
    - "Species epithet sanitization: strip hyphens/periods/special chars for validateSlugComponent compliance"

key-files:
  created:
    - "scripts/migrate-species.js"
  modified:
    - "data/species.csv"
    - "data/records.csv"
    - "package.json"

key-decisions:
  - "Streaming readline instead of readFileSync: 634 MB dump exceeds Node.js 0x1fffffe8 string length limit; createReadStream + readline with encoding:latin1 is equivalent and avoids the crash"
  - "DB genus+species slug for records.csv: image-derived slugs differ from DB genus+species for ~326 reclassified species; build-data.js join uses lower(genus||'-'||species) so records must use the same derivation"
  - "Species epithet sanitization: strip hyphens (v-alba→v, c-nigrum→c), periods, and special chars to satisfy validateSlugComponent; truncating at first hyphen matches slugFromImageField behavior"
  - "Coordinate bounds filter: exclude records outside lat 42-55, lon -125 to -110 (build-data.js validation bounds); some valid BC/AB records fall outside — accepted as pre-existing validator constraint"
  - "94,795 total records (not 5,844 as research estimated): research incorrectly counted only the first of 17 INSERT statements; actual total is correct, all pass validation"

# Metrics
duration: 21min
completed: 2026-04-22T18:29:16Z
---

# Phase 17 Plan 02: Migrate Full Species Data — Implementation Summary

**Streaming SQL dump parser reading 17 concatenated INSERT statements for 94,795 records, filtering to 86,851 PNW occurrences and 1,353 species with genus+species slug normalization for build-data.js JOIN compatibility**

## Performance

- **Duration:** ~21 min (including debugging multi-INSERT structure, schema corrections, and validation fixes)
- **Started:** ~2026-04-22T18:08:00Z
- **Completed:** 2026-04-22T18:29:16Z
- **Tasks:** 1
- **Files modified:** 4 (scripts/migrate-species.js created; data/species.csv, data/records.csv, package.json updated)

## Accomplishments

- Created `scripts/migrate-species.js` as an async ESM module using readline streaming
- Extracts 10 lookup tables from the pnwmoths SQL dump section via regex
- Parses 1,768 species from `species_species` INSERT; includes 1,353 with images or PNW records
- Parses 94,795 records from 17 concatenated `species_speciesrecord` INSERT statements
- Filters records: `linked_photo=0`, PNW states (42/43/61/66/77/80), lat/lon present, coordinate bounds
- Outputs `data/species.csv` (1,353 rows) and `data/records.csv` (86,851 rows)
- `npm run build:data` passes — Parquet exported for all 1,353 species
- All 7 smoke tests in `migrate-species.test.js` pass (GREEN state achieved)
- Added `"migrate:species"` script to `package.json`

## Task Commits

1. **Task 1: Create scripts/migrate-species.js** - `dcc3e7f` (feat)

## Files Created/Modified

- `scripts/migrate-species.js` — 510-line streaming migration script
- `data/species.csv` — 1,353 species rows (was 11 stub rows)
- `data/records.csv` — 86,851 occurrence rows (was 667 stub rows)
- `package.json` — added `migrate:species` script

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] readFileSync fails on 634 MB dump**
- **Found during:** Task 1, first run
- **Issue:** `readFileSync(DUMP_PATH, 'latin1')` throws `ERR_STRING_TOO_LONG` — Node.js string limit is ~512 MB; the dump is 634 MB
- **Fix:** Replaced `readFileSync` with `createReadStream` + `readline` streaming; `encoding: 'latin1'` preserved on the stream
- **Files modified:** `scripts/migrate-species.js`
- **Commit:** dcc3e7f

**2. [Rule 1 - Bug] Wrong column order in parseSpeciesSpecies regex**
- **Found during:** Task 1, first run — only 31 species parsed
- **Issue:** Plan's regex assumed column order `(id, genus, species, common_name, noc_id, factsheet_id, authority_id)` but actual dump has `(id, genus, species, common_name, authority_id, noc_id, factsheet_id)`
- **Fix:** Corrected regex to match actual schema verified from CREATE TABLE statement
- **Files modified:** `scripts/migrate-species.js`
- **Commit:** dcc3e7f

**3. [Rule 1 - Bug] Wrong column order in parseSpeciesRecord regex**
- **Found during:** Task 1, first run — 0 records parsed
- **Issue:** Plan's schema had 17 columns in wrong order; actual schema has 23 columns with completely different ordering
- **Fix:** Built regex from actual CREATE TABLE: `(id, species_id, lat, lon, locality, county_id, state_id, elevation, year, month, day, collector_id, collection_id, males, females, notes, date_added, date_modified, record_type, csv_file, type_status, subspecies, linked_photo)`
- **Files modified:** `scripts/migrate-species.js`
- **Commit:** dcc3e7f

**4. [Rule 1 - Bug] Negative sentinel values in males/females fields**
- **Found during:** Task 1, debugging — regex matched 4,061 of 5,844 rows on first INSERT
- **Issue:** Some records have `-999999` or `-2` for males/females; regex used `(?:\d+|NULL)` which doesn't match negative integers
- **Fix:** Changed to `(?:-?\d+|NULL)` for males and females columns
- **Files modified:** `scripts/migrate-species.js`
- **Commit:** dcc3e7f

**5. [Rule 1 - Bug] Only last of 17 INSERT statements stored**
- **Found during:** Task 1, debugging — extractInsertLines overwrote map entry for each subsequent INSERT
- **Issue:** `species_speciesrecord` has 17 INSERT statements (~1 MB each); code stored only the last (620,680 bytes = 3,216 rows)
- **Fix:** Concatenate all INSERTs by stripping the repeated `INSERT INTO ... VALUES ` header and trailing `;` from each continuation
- **Files modified:** `scripts/migrate-species.js`
- **Commit:** dcc3e7f

**6. [Rule 1 - Bug] Research estimated wrong total record count (5,844 vs 94,795)**
- **Found during:** Task 1, after fixing multi-INSERT — migration produced 94,795 records
- **Root cause:** Research heuristic counted `(\d+,\d+,` only on the first INSERT line (5,844 matches); actual total across all 17 is 94,795 unique records
- **Fix:** No code change needed; 94,795 is the correct count. After PNW + lat/lon + bounds filtering, 86,851 records remain — well above the ≥ 3,000 threshold
- **Commit:** dcc3e7f

**7. [Rule 2 - Missing] Orphaned records in build:data validation**
- **Found during:** Task 1, `npm run build:data` — 74 orphaned species_slug values
- **Issue:** Records used image-derived slugs (e.g. `grammia-ornata`) but species.csv has DB-derived slugs (`apantesis-ornata`); build-data.js join uses `lower(genus||'-'||species)` which matches DB slugs only
- **Fix:** Changed records to use `genus+safeSpecies` slug instead of image-derived slug, matching the join key
- **Files modified:** `scripts/migrate-species.js`
- **Commit:** dcc3e7f

**8. [Rule 1 - Bug] Species epithet sanitization for validateSlugComponent**
- **Found during:** Task 1, `npm run build:data` — `Invalid species value "v-alba"` then `"nr. americalis"`
- **Issue:** 19 species have non-alphanumeric chars in epithet (hyphens, periods, slashes, `?`) that fail `[a-zA-Z0-9 ]` validation
- **Fix:** Strip hyphens by truncating at first hyphen (matches image filename slug behavior); strip all remaining non-alphanumeric-or-space chars
- **Files modified:** `scripts/migrate-species.js`
- **Commit:** dcc3e7f

**9. [Rule 2 - Missing] Coordinate bounds filter for build:data validation**
- **Found during:** Task 1, `npm run build:data` — many out-of-bounds coordinates
- **Issue:** Some BC/AB records have lat > 55.0 or lon < -125.0, failing the PNW bounds check in build-data.js
- **Fix:** Added coordinate bounds filter (lat 42-55, lon -125 to -110) to match build-data.js validator
- **Files modified:** `scripts/migrate-species.js`
- **Commit:** dcc3e7f

## Known Stubs

None — all data is wired from the actual legacy database dump. The species.csv and records.csv files contain full production data.

## Threat Flags

No new network endpoints, auth paths, or file access patterns introduced beyond what the plan's threat model covers. The script reads from a local SQL dump (trusted internal source) and writes to local CSV files consumed by the existing build pipeline.

## Self-Check

- [x] `scripts/migrate-species.js` exists
- [x] `node scripts/migrate-species.js` exits 0
- [x] `wc -l data/species.csv` shows 1354 lines (≥ 1301)
- [x] `wc -l data/records.csv` shows 86852 lines (≥ 3001)
- [x] `head -1 data/species.csv` = `id,genus,species,common_name,noc_id,authority,family,similar_species,subfamily`
- [x] `head -1 data/records.csv` = `species_slug,record_type,latitude,longitude,state,county,locality,elevation_ft,year,month,day,collector,collection,notes`
- [x] `grep "migrate:species" package.json` matches
- [x] `node --test scripts/migrate-species.test.js` exits 0 (all 7 tests pass)
- [x] `npm run build:data` exits 0 (Parquet for 1,353 species)
- [x] Task commit dcc3e7f exists

## Self-Check: PASSED

---
*Phase: 17-migrate-full-species-data-from-legacy-database*
*Completed: 2026-04-22*
