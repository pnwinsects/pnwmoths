# Data

Source files for the pnwmoths static build pipeline. CSV and JSON files are the authoritative source; Parquet files are derived at build time.

## Entity Relationship Diagram

```mermaid
erDiagram
    species {
        int     id            PK
        string  genus
        string  species
        string  common_name
        string  noc_id
        string  authority
        string  family
        string  subfamily
        string  similar_species   "pipe-delimited slugs"
    }

    records {
        string  species_slug   FK
        string  record_type    "specimen | literature | observation"
        float   latitude
        float   longitude
        string  state
        string  county
        string  locality
        int     elevation_ft
        int     year
        int     month
        int     day
        string  collector
        string  collection
        string  notes
    }

    images {
        string  species_slug   FK
        string  filename
        string  photographer
        int     weight         "display order"
        string  license
        string  view           "dorsal | ventral | lateral | ..."
        string  specimen       "letter identifier (A–H)"
        string  locality
        string  state
        float   latitude
        float   longitude
        int     elevation_ft
        int     year
        int     month
        int     day
        string  collector
        string  subspecies
    }

    glossary {
        string  term           PK
        string  definition
        string  image_filename "illustrative diagram (optional)"
        string  photographer
    }

    plates {
        string  number         PK
        string  family
        string  slug
        int     width
        int     height
    }

    parquet_records {
        string  species_slug   FK
        string  records_parquet "per-species materialized view"
    }

    species ||--o{ records          : "has occurrence records"
    species ||--o{ images           : "has photos"
    species ||--o{ parquet_records  : "materialized as"
    species }o--o{ species          : "similar_species (self-ref)"
```

## Files

| File | Rows (approx) | Description |
|------|--------------|-------------|
| `species.csv` | ~900 | One row per species. Primary key is `id`; slug is derived as `genus.lower()-species.lower()`. |
| `records.csv` | ~30 000 | Geo-referenced occurrence records (specimens, literature, observations). |
| `records-bad.csv` | varies | Records that failed validation — same schema as `records.csv`. |
| `images.csv` | ~5 000 | Photo metadata. Images are hosted on the CDN; `filename` is the CDN asset key. |
| `glossary.csv` | ~150 | Wing-anatomy and taxonomy terms injected into species fact sheets at build time. |
| `plates.json` | ~50 | Reference plate metadata (legacy moth-guide plates). Width/height used for CDN image sizing. |
| `parquet/<slug>/records.parquet` | varies | Per-species records, materialized by `scripts/build-data.js` for fast DuckDB queries at build time. |

## Slug convention

Species slugs are derived as `genus.toLowerCase() + '-' + species.toLowerCase()` (e.g., `apantesis-arizoniensis`). Slugs are used as foreign keys in `records.csv`, `images.csv`, and `parquet/` directory names. They are not stored in `species.csv` — derive them at read time.
