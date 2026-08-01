# Task: Add Occurrence Records

## What This Changes
- `data/records.csv` — new rows for occurrence records
- Build output: updated per-species Parquet file at `_site/species/{slug}/records.parquet`

## Schema: data/records.csv

| Field | Type | Required | Example |
|-------|------|----------|---------|
| species_slug | string | yes | `acronicta-americana` (must match a species in species.csv) |
| record_type | string | yes | `specimen`, `photograph`, `literature`, `field notes`, or `sight_field_notes` |
| latitude | decimal | yes | 47.6062 (PNW bounds: 42.0 to 60.0) |
| longitude | decimal | yes | -122.3321 (PNW bounds: -139.0 to -110.0) |
| state | string | yes | WA, OR, ID, MT, BC, or AB |
| county | string | no | King |
| locality | string | no | Seattle |
| elevation_ft | integer | no | 56 (feet above sea level) |
| year | integer | no | 2019 |
| month | integer | no | 6 (1-12) |
| day | integer | no | 15 (1-31) |
| collector | string | no | J. Smith |
| collection | string | no | UW Burke Museum |
| notes | string | no | (free text) |
| district_id | string | no | Leave blank — assigned by the pipeline, not entered by hand (see [ASSIGNING_DISTRICTS.md](ASSIGNING_DISTRICTS.md)) |

The species is referenced by **`species_slug`**, not by a numeric id. The slug is
`(genus + '-' + species).toLowerCase()` with spaces hyphenated — `acronicta-americana`. It is not
stored in `data/species.csv`; derive it from the genus and species columns. All 15 columns must be
present in the header even where the value is blank.

## Steps

1. Confirm the species exists in `data/species.csv` and work out its slug.

2. Open `data/records.csv`. Append one row per occurrence — 15 fields, trailing blanks included:
   ```csv
   acronicta-americana,specimen,47.6062,-122.3321,WA,King,Seattle,56,2019,6,15,J. Smith,UW Burke Museum,,
   ```

3. Verify the build:
   ```bash
   npm run build:site
   ```
   Expected: build completes. Data validation passes (known species, valid record_type, valid state,
   in-bounds coordinates).

   `build:site` rather than `npm run build` because `build` also runs the broken-link check, which
   needs [lychee](https://lychee.cli.rs/) installed locally (see [CONTRIBUTING.md](../CONTRIBUTING.md));
   the Docker path below includes it.


4. If build passes, commit and push:
   ```bash
   git add data/records.csv
   git commit -m "Add occurrence records for [species name]"
   git push
   ```

## Verify
- Expected: build completes without validation errors.
- Expected: `_site/species/{slug}/records.parquet` is updated.
- Expected: the new points appear on the species page map.

## Reading a failure

Validation failures print as `Validation failed — <description>:` followed by the offending rows.

- **`orphaned records (species_slug not in species table)`** — the slug matches no species. Usually a
  typo, or the species row has not been added yet.
- **`invalid record_type values`** — must be exactly one of `specimen`, `photograph`, `literature`,
  `field notes`, `sight_field_notes`.
- **`invalid state values`** — must be one of WA, OR, ID, BC, AB, MT.
- **`out-of-bounds coordinates (PNW bounds: lat 42.0-60.0, lon -139.0 to -110.0)`** — most often
  latitude and longitude swapped, or a missing minus sign on the longitude.
- **`NULL required fields`** — `species_slug`, `latitude` or `longitude` is blank.
- **`data/records.csv contains non-UTF-8 bytes`** — edited in Excel on Windows; re-save as CSV UTF-8.

## Purging Duplicate Records

Batch CSV appends can accidentally insert the same occurrence twice. To remove
rows that are identical in every column (keeping one copy):

```bash
node scripts/dedup-records.ts
```

It rewrites `data/records.csv` in place, touching only the duplicate lines, and
prints how many rows it removed. It is idempotent — safe to re-run — and never
merges rows that differ in a curator-entered field (e.g. a blank vs. filled
locality). Two rows that agree on every curator field but differ only in the
derived `district_id` *are* treated as the same record, since `district_id` is
assigned by the build, not entered by hand; the copy carrying a `district_id` is
kept. Review the git diff, then commit.

## Docker Alternative
```bash
docker compose run --rm dev npm run build:site
```
