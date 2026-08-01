# Task: Add a Photo for a Species

Photos are **not stored in this repository.** They live on the Bunny CDN, and the repo holds only a
row of metadata describing each one. Adding a photo is therefore three steps in three places, and
skipping any of them means the photo does not appear:

1. Upload the image file to the CDN — [UPLOADING_IMAGES.md](UPLOADING_IMAGES.md)
2. Generate its display variants — [GENERATING_DERIVATIVES.md](GENERATING_DERIVATIVES.md)
3. Add a row to `data/images.csv` — this guide

The build fails if you do 3 without 1 and 2, naming the file it cannot find. That is deliberate.

## What This Changes

- **bunny.net Storage Zone `pnwmoths`** — the image file, and its `derived/` variants
- **`data/images.csv`** — one new row
- **`data/image-derivatives.csv`** — rows recording the uploaded variants (written for you)
- Build output: the photo appears on the species page

## Schema: data/images.csv

| Field | Type | Required | Example |
|-------|------|----------|---------|
| species_slug | string | yes | `acronicta-americana` |
| filename | string | yes | `Acronicta americana-A-D.jpg` |
| photographer | string | yes | `Merrill A. Peterson` |
| weight | integer | yes | `2` (display order within the species; lower sorts first) |
| license | string | yes | `CC BY-NC-SA 4.0` (see below) |
| view | string | no | `dorsal`, `ventral`, `lateral`, or `head` |
| specimen | string | no | Specimen letter (`A`, `B`, `C`, `D`) when several are shown |
| navigational | string | no | Leave blank unless this is the curated navigation image |
| locality | string | no | `Quartz Mt.` |
| state | string | no | `WA` |
| latitude | decimal | no | `47.074` |
| longitude | decimal | no | `-121.061` |
| elevation_ft | integer | no | `5324` |
| year | integer | no | `2005` |
| month | integer | no | `7` |
| day | integer | no | `14` |
| collector | string | no | `Crabo/Coughlin` |
| subspecies | string | no | |

**The species is referenced by `species_slug`, not by a numeric id.** The slug is
`(genus + '-' + species).toLowerCase()` with spaces hyphenated — `acronicta-americana`. It is not
stored in `data/species.csv`; derive it from the genus and species columns.

**`filename` must contain only letters, digits, spaces, dots, hyphens and underscores.** The build
rejects anything else. Spaces are fine and common — `Acronicta americana-A-D.jpg` is the normal
shape, and the filename must match what you uploaded exactly.

### License conventions

| Situation | `license` value | Example |
|-----------|-----------------|---------|
| Creative Commons | The CC licence identifier | `CC BY-NC-SA 4.0` |
| Copyrighted, used with permission | `(c) Photographer Name` | `(c) Merrill Peterson` |
| Public domain | `public domain` | `public domain` |

## Steps

**1. Confirm the species exists.** Find its row in `data/species.csv` and work out the slug. If the
species is not there yet, do [ADDING_SPECIES.md](ADDING_SPECIES.md) first — the build checks
referential integrity and will reject a photo for a species it does not know.

**2. Upload the image to the CDN.** Follow [UPLOADING_IMAGES.md](UPLOADING_IMAGES.md). Keep the
original filename; do not rename it.

**3. Generate and upload the derivatives.** Follow
[GENERATING_DERIVATIVES.md](GENERATING_DERIVATIVES.md). This is what actually gets displayed.

**4. Add the row to `data/images.csv`:**

```csv
acronicta-americana,Acronicta americana-A-D.jpg,Jane Doe,2,CC BY-NC-SA 4.0,dorsal,A,,,,,,,,,,,
```

Count the commas — there are 18 columns, and trailing blanks still need their separators. Easiest is
to copy an existing row for the same species and edit it.

**5. Verify the build:**

```bash
npm run build:site
```

Expected: the build completes. Partway through — it is the 6th of 17 steps, not the last — you
should see:

```
[check-derivatives] PASS: … emitted derivative URL(s) …
```

That line is the one that proves your photo's derivatives are on the CDN. The run continues past it
and ends with `verify-parquet`.

`build:site` is the full content build. It is used here rather than `npm run build` because
`build` additionally runs the broken-link check, which needs [lychee](https://lychee.cli.rs/)
installed locally — see [CONTRIBUTING.md](../CONTRIBUTING.md). The Docker path below includes it, so
prefer that if you want the link check too.

**6. Commit:**

```bash
git add data/images.csv data/image-derivatives.csv
git commit -m "Add photo for Acronicta americana"
git push
```

## Verify

- `_site/species/{slug}/index.html` contains an `<img>` for the new photo.
- Open the species page in a browser and confirm the image loads.

## Reading a failure

**`[check-derivatives] SOURCE GATE FAILED … missing @320h, @full`** — the row is in the CSV but the
derivatives are not on the CDN. You skipped step 3, or it did not finish. See
[GENERATING_DERIVATIVES.md](GENERATING_DERIVATIVES.md).

**`Invalid image filename "…" in images.csv`** — the filename contains a character outside
`a-z A-Z 0-9 space . _ -`. Rename the file on the CDN and in the CSV to match.

**`data/images.csv is missing required column: "…"`** — the header lost one of the eight columns
the build requires (`species_slug`, `filename`, `photographer`, `weight`, `license`, `view`,
`specimen`, `navigational`). Restore it; a blank *value* is fine, a missing *column* is not.

Note the remaining ten columns (`locality` through `subspecies`) are **not** checked by that
validation, so deleting one fails silently rather than loudly. Keep the header intact.

**The photo does not appear but the build passed** — check `species_slug` matches the species page's
URL segment exactly. A typo there produces a row that belongs to no species, and nothing complains.

## Docker Alternative

```bash
docker compose run --rm dev npm run build:site
```
