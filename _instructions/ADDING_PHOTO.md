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
- Build output: the photo appears on the species page — **unless the species has high-resolution
  tiles**, in which case the account shows the deep-zoom viewer *instead of* the catalogued
  photographs and your new row will not be visible there. It **may** still appear on `/browse/`,
  on Identify, or in another species' "similar species" row, but none of those is guaranteed:
  each shows one photograph per species, chosen by lowest `weight`, so a new row that is not the
  lightest may appear nowhere at all. `data/hidden-images-report.csv` is what answers it for your
  row — see [Verify](#verify). The rules are in
  [docs/reference/photo-display-rules.md](../docs/reference/photo-display-rules.md).

## Schema: data/images.csv

| Field | Type | Required | Example |
|-------|------|----------|---------|
| species_slug | string | yes | `acronicta-americana` |
| filename | string | yes | `Acronicta americana-A-D.jpg` |
| photographer | string | yes | `Merrill A. Peterson` |
| weight | integer | yes | `2` (display order within the species; lower sorts first — and the lowest-weight photo is the one Browse and Identify show as the species' thumbnail) |
| license | string | yes | `CC BY-NC-SA 4.0` (see below) |
| view | string | no | `dorsal`, `ventral`, `lateral`, or `head` |
| specimen | string | no | Specimen letter (`A`, `B`, `C`, `D`) when several are shown |
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

> **Never rename a photograph, ever — not even when the name is now the wrong species.**
> A filename records what the moth was called when it was photographed. It is also the key that
> joins our copy to its derivatives, its high-resolution TIFF, and the original on the legacy
> host. Renaming breaks all three: ten of the 83 photographs recovered in #232 could not be found
> on the legacy host because an earlier merge had re-lettered their filenames.
>
> If the filename names a different species from the one the photograph belongs to — a rename, a
> merge, or a redetermination — that is normal and expected. Put the photograph under the correct
> `species_slug` in `data/images.csv` and record the ruling in
> [`data/photo-determinations.csv`](../data/photo-determinations.csv), quoting the curator and
> linking the issue. See [ADR 0038](../docs/adr/0038-photo-identity-is-data-not-filename.md).
>
> If the destination species already uses that specimen letter, the **incoming** photograph takes
> the next free letter and the one already there keeps its own (C-026). Change the `specimen`
> column, never the filename.

**3. Generate and upload the derivatives.** Follow
[GENERATING_DERIVATIVES.md](GENERATING_DERIVATIVES.md). This is what actually gets displayed.

**4. Add the row to `data/images.csv`:**

```csv
acronicta-americana,Acronicta americana-A-D.jpg,Jane Doe,2,CC BY-NC-SA 4.0,dorsal,A,,,,,,,,,,
```

Count the commas — there are 17 columns, and trailing blanks still need their separators. Easiest is
to copy an existing row for the same species and edit it.

**5. Verify the build:**

```bash
npm run build:site
```

Expected: the build completes. Partway through — it is the 6th of 22 steps, not the last — you
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
git switch -c add-photo-$(date +%Y%m%d-%H%M)
git add data/images.csv data/image-derivatives.csv
# ...and data/photo-determinations.csv too, if you recorded a ruling in step 4:
git add data/photo-determinations.csv
git commit -m "Add photo for Acronicta americana"
git push -u origin HEAD
gh pr create --fill
```

The `main` branch is protected: it takes changes only through a pull request whose
build check passes. `gh pr create` opens one; merge it from the PR page (or with
`gh pr merge`) once the check is green, and the site deploys automatically. The
date suffix just keeps each branch name unique, so the same command works every time.
`gh` is the GitHub CLI — see [CONTRIBUTING.md](../CONTRIBUTING.md) for installing and
signing into it.

## Verify

**Which case are you in?** Open the species page. If it shows the ordinary photo carousel,
the species has no high-resolution tiles. If it opens a **zoomable viewer**, it does — and
the viewer renders *instead of* the catalogued photographs, so your new row will not be on
that page at all.

**No tiles — verify on the species page:**

- `_site/species/{slug}/index.html` contains an `<img>` for the new photo.
- Open the species page in a browser and confirm the image loads.

**Tiled — verify on a surface that reads `data/images.csv`.** The account not showing your
photograph is expected here, not a failed build. `/browse/`, Identify and other species'
"similar species" rows never consult tile status, so the photograph normally reaches at
least one of them:

```bash
npm run report:hidden-images
grep "Acronicta americana-A-D.jpg" data/hidden-images-report.csv
```

That report needs no build of its own. The row it prints answers two different questions in
two columns, and both matter:

- **`displayed_as`** — *where* the photograph appears (`browse`, `identify`, `similar`).
  Any value means it is on the site somewhere; blank means it is on no page at all.
- **`cause`** — *why* the account does not show it. This is the column that decides what to
  do about it, and not every cause is the same kind of problem:

| `cause` | What it means | What to do |
|---|---|---|
| `superseded-by-tiles` | A tile of the **same specimen and view** already shows this moth, at higher resolution. | Nothing. This is the normal outcome for a tiled species. |
| `hidden-by-tiles` | No tile covers this specimen and view, so the account shows neither. | Worth a curator's eye — should this specimen be tiled too? |
| `unmatchable-by-tiles` | The row has no `specimen` or no `view`, so it cannot be compared to the tiles at all. | Yours to fix: fill in those two columns of the row you just added. |
| `cdn-missing` | The last CDN inventory did not find the object. | Yours to fix: the upload or its derivatives did not land. Re-check step 1 and [GENERATING_DERIVATIVES.md](GENERATING_DERIVATIVES.md). |

So read `cause` first. A blank `displayed_as` next to `cdn-missing` or `unmatchable-by-tiles`
is your own step to finish, not a question for anyone; a blank one next to `hidden-by-tiles`
is the case that genuinely needs the curator. (`family-withheld` and `species-unpublished`
appear in that column too, but only for species with no public page at all — if you are
adding a photograph to one of those, nothing you do will make it visible until the gate
lifts.) The rules behind all of this are in
[docs/reference/photo-display-rules.md](../docs/reference/photo-display-rules.md).

## Reading a failure

**`[check-derivatives] SOURCE GATE FAILED … missing @320h, @full`** — the row is in the CSV but the
derivatives are not on the CDN. You skipped step 3, or it did not finish. See
[GENERATING_DERIVATIVES.md](GENERATING_DERIVATIVES.md).

**`Invalid image filename "…" in images.csv`** — the filename contains a character outside
`a-z A-Z 0-9 space . _ -`. Fix the name **before** the photograph enters the catalogue: rename the
local file, upload under the corrected name, and use that name in the row. Once a photograph is in
`data/images.csv` its filename is permanent — derivatives, the high-resolution TIFF and the copy on
the legacy host all join on it, and renaming orphans all three
([ADR 0038](../docs/adr/0038-photo-identity-is-data-not-filename.md)). If the bad name is already
catalogued, upload a corrected copy alongside it and record the old path in
[`data/cdn-retired-images.csv`](../data/cdn-retired-images.csv) rather than renaming in place.

**`data/images.csv is missing required column: "…"`** — the header lost one of the seven columns
the build requires (`species_slug`, `filename`, `photographer`, `weight`, `license`, `view`,
`specimen`). Restore it; a blank *value* is fine, a missing *column* is not.

Note the remaining ten columns (`locality` through `subspecies`) are **not** checked by that
validation, so deleting one fails silently rather than loudly. Keep the header intact.

**The photo does not appear but the build passed** — check `species_slug` matches the species page's
URL segment exactly. A typo there produces a row that belongs to no species, and nothing complains.

## Docker Alternative

```bash
docker compose run --rm dev npm run build:site
```
