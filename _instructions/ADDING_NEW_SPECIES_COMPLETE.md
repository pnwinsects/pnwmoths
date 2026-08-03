# Adding a Complete New Species (with Photos and Records)

This guide walks through the full workflow for adding a new species to the site,
including photos and occurrence records. Each step references a detailed task guide.

## Overview

| Step | Guide | What it does |
|------|-------|--------------|
| 1 | ADDING_SPECIES.md | Add the species row to `data/species.csv` |
| 2 | ADDING_PHOTO.md | Upload photos to the CDN and add their metadata rows |
| 3 | ADDING_RECORDS.md | Add occurrence records |

**Important:** the species must be added first (step 1), because photos and records reference it by
**`species_slug`** — `(genus + '-' + species).toLowerCase()`, spaces hyphenated. The `id` column in
`species.csv` is that file's own primary key and appears nowhere else. The build validates
referential integrity, so a photo or record for an unknown slug fails the build.

## Workflow

### Step 1: Add the species

Follow [ADDING_SPECIES.md](ADDING_SPECIES.md). That guide includes adding the slug to
`src/_data/speciesSlugs.json` — don't skip it, or links to this species from the old WWU
site will strand visitors on Browse.

After completing that guide, note the species **slug** — you will use it in the next two steps.

### Step 2: Add photos (optional)

Follow [ADDING_PHOTO.md](ADDING_PHOTO.md). Photos are not stored in this repo: the file goes to the
CDN, its display variants are generated, and only a metadata row lands in `data/images.csv`. All
three are required or the build fails.

### Step 3: Add occurrence records (optional)

Follow [ADDING_RECORDS.md](ADDING_RECORDS.md), using the slug in the `species_slug` column of
`data/records.csv`.

### Step 4: Build and verify

Run a single build to verify everything together:

```bash
npm run build:site
```

Expected:
- New species page exists at `_site/species/{slug}/index.html`
- Photos appear on the species page (if added)
- `_site/species/{slug}/records.parquet` exists (if records added)
- Species appears on the browse page at `_site/browse/index.html`
- `[check-derivatives] PASS: …` appears partway through (6th of 17 steps, not the last line)

`build:site` is the full content build. It is used here rather than `npm run build` because
`build` additionally runs the broken-link check, which needs [lychee](https://lychee.cli.rs/)
installed locally — see [CONTRIBUTING.md](../CONTRIBUTING.md). The Docker path below includes it, so
prefer that if you want the link check too.

### Step 5: Commit and push

Stage all changed files in a single commit:

```bash
git switch -c add-species
git add data/species.csv src/_data/speciesSlugs.json
# If you added photos (the image files themselves live on the CDN, not here):
git add data/images.csv data/image-derivatives.csv
# If you added records:
git add data/records.csv
# If you created a description file:
# git add src/content/species/{slug}.md
git commit -m "Add species: Genus species (with photos and records)"
git push -u origin HEAD
gh pr create --fill
```

The `main` branch is protected: it takes changes only through a pull request whose
build check passes. `gh pr create` opens one; merge it from the PR page (or with
`gh pr merge`) once the check is green, and the site deploys automatically.

## Docker Alternative

```bash
docker compose run --rm dev npm run build:site
```
