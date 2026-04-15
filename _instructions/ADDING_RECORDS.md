# Task: Add Occurrence Records

## What This Changes
- `data/records.csv` — new rows for occurrence records
- Build output: updated per-species Parquet files at `_site/species/{slug}/`

## Schema: data/records.csv

| Field | Type | Required | Example |
|-------|------|----------|---------|
| species_id | integer | yes | 1 (must match an id in species.csv) |
| record_type | string | yes | specimen, photograph, literature, field notes, or sight_field_notes |
| latitude | decimal | yes | 47.6062 (must be within PNW bounds: ~42-55 lat) |
| longitude | decimal | yes | -122.3321 (must be within PNW bounds: ~-125 to -110 lon) |
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

## Steps

1. Find the `species_id` for the target species in `data/species.csv`.

2. Open `data/records.csv`. Append one row per occurrence:
   ```csv
   1,specimen,47.6062,-122.3321,WA,King,Seattle,56,2019,6,15,J. Smith,UW Burke Museum,
   ```

3. Verify the build:
   ```bash
   npm run build
   ```
   Expected: build completes. Data validation passes (valid coordinates, valid state, valid species_id).

4. If build passes, commit and push:
   ```bash
   git add data/records.csv
   git commit -m "Add occurrence records for [species name]"
   git push
   ```

## Verify
- Expected: Build completes without validation errors.
- Expected: `_site/species/{slug}/data.parquet` is updated.
- Failure: "species_id not found" means the ID does not exist in species.csv.
- Failure: "coordinates outside PNW bounds" means latitude/longitude values are out of range.

## Docker Alternative
```bash
docker compose run --rm dev npm run build
```
