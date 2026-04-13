# Adding a Complete New Species (with Photos and Records)

This guide walks through the full workflow for adding a new species to the site,
including photos and occurrence records. Each step references a detailed task guide.

## Overview

| Step | Guide | What it does |
|------|-------|--------------|
| 1 | ADDING_SPECIES.md | Add species row to CSV, get its `id` |
| 2 | ADDING_PHOTO.md | Add photos using the `id` from step 1 |
| 3 | ADDING_RECORDS.md | Add occurrence records using the `id` from step 1 |

**Important:** Species must be added first (step 1) because photos and records
reference the species by its `id` field (`species_id` in images.csv and records.csv).

## Workflow

### Step 1: Add the species

Follow [ADDING_SPECIES.md](ADDING_SPECIES.md).

After completing that guide, note the `id` you assigned — you will use it
as `species_id` in the next two steps.

### Step 2: Add photos (optional)

Follow [ADDING_PHOTO.md](ADDING_PHOTO.md).

Use the `id` from step 1 as `species_id` in `data/images.csv`.

### Step 3: Add occurrence records (optional)

Follow [ADDING_RECORDS.md](ADDING_RECORDS.md).

Use the `id` from step 1 as `species_id` in `data/records.csv`.

### Step 4: Build and verify

Run a single build to verify everything together:

```bash
npm run build
```

Expected:
- New species page exists at `_site/species/{slug}/index.html`
- Photos appear on the species page (if added)
- `_site/species/{slug}/data.parquet` exists (if records added)
- Species appears on the browse page at `_site/browse/index.html`

### Step 5: Commit and push

Stage all changed files in a single commit:

```bash
git add data/species.csv
# If you added photos:
git add data/images.csv images/{slug}/
# If you added records:
git add data/records.csv
# If you created a description file:
# git add src/content/species/{slug}.md
git commit -m "Add species: Genus species (with photos and records)"
git push
```

## Docker Alternative

```bash
docker compose run --rm dev npm run build
```
