# Adding a New Photographic Plate

Photographic plates are zoomable reference images served via the [OpenSeadragon](https://openseadragon.github.io/) viewer. Tile data lives on bunny.net CDN; the plate manifest is committed at `data/plates.json`.

## What you need

- The new plate's Zoomify tile directory (from the source application), structured as:
  ```
  plate-NN-familyname/
    TileGroup0/
      0-0-0.jpg
      1-0-0.jpg
      ...
    ImageProperties.xml
    thumbnail.jpg
  ```
- `BUNNY_STORAGE_PASSWORD` — the Storage Zone password from bunny.net dashboard → Storage → pnwmoths → FTP & API Access

## Steps

**1. Choose a slug and number.**

Follow the existing pattern in `data/plates.json`: `plate-{number}-{family-name-lowercase-hyphenated}`. Check the file to find the next available number.

**2. Copy the tile directory into `plates/` locally.**

```sh
cp -r /path/to/source/plate-NN-familyname plates/
```

**3. Add the plate to `data/plates.json`.**

Append a record to the JSON array:
```json
{ "number": "NN", "family": "Family Name", "slug": "plate-NN-familyname", "width": 2400, "height": 3000 }
```

Width and height are the pixel dimensions from `ImageProperties.xml` (`WIDTH` and `HEIGHT` attributes).

**4. Upload the new tiles to CDN.**

Upload the plate files using `curl` with the bunny.net Storage Zone HTTP PUT API (same pattern as `_instructions/UPLOADING_TILES.md`).

**The destination path must keep the `plates/` prefix.** Every consumer reads
`plates/{slug}/` — the viewer's `tiles-url`, the share image, and the derivative work list —
so a plate uploaded to the zone root is invisible to all three
([#326](https://github.com/pnwinsects/pnwmoths/issues/326)).

```sh
# Set your Storage Zone password from bunny.net → Storage → pnwmoths → FTP & API Access
BUNNY_STORAGE_PASSWORD="your-key"
PLATE_SLUG="plate-NN-familyname"

# Upload each file in the tile directory (ImageProperties.xml, thumbnail.jpg, TileGroup0/*, etc.).
# The local path IS the storage path: plates/{slug}/… on disk → plates/{slug}/… in the zone.
find "plates/${PLATE_SLUG}" -type f | while read -r file; do
  curl -s -S -f -X PUT \
    -H "AccessKey: ${BUNNY_STORAGE_PASSWORD}" \
    -T "${file}" \
    "https://la.storage.bunnycdn.com/pnwmoths/${file}"
  echo "Uploaded: ${file}"
done
```

Run this from the repository root, so `find` produces paths that start with `plates/`.

`-f` makes `curl` exit non-zero on an HTTP error instead of printing the error body and
reporting success; without it a rejected upload scrolls past looking like `Uploaded:`.

**5. Verify CDN delivery.**

```sh
PLATE_SLUG="plate-NN-familyname"
for path in thumbnail.jpg ImageProperties.xml TileGroup0/0-0-0.jpg; do
  printf '%s: ' "$path"
  curl -sI "https://moths.pnwinsects.org/plates/${PLATE_SLUG}/${path}" | head -1
done
# Expected: HTTP/2 200 for all three
```

A 404 here almost always means the upload landed at the zone root instead of under `plates/`.
Re-read step 4; the objects at the wrong path are harmless but cannot be deleted casually
([ADR 0008](../docs/adr/0008-deploy-bunny-additive.md)) — say so in the PR and leave them.

**5a. Generate and upload the plate's derivative.**

The plate index does not use `thumbnail.jpg` directly — it requests a pre-generated
`@240x300` variant, and **the build fails until that variant is on the CDN**
([ADR 0022](../docs/adr/0022-pregenerated-image-derivatives.md)). This is not optional and it
is not something CI does for you: adding the plate to `data/plates.json` is what puts it in the
work list, so the build breaks for everyone until this step is done.

```sh
DRY_RUN=1 KIND=plates ONLY="${PLATE_SLUG}" node scripts/generate-derivatives.ts
KIND=plates ONLY="${PLATE_SLUG}" node scripts/generate-derivatives.ts
BUNNY_STORAGE_PASSWORD="your-key" node scripts/upload-derivatives.ts
```

`ONLY` is what keeps this to one file instead of re-deriving all ~23,000. Full details in
[GENERATING_DERIVATIVES.md](GENERATING_DERIVATIVES.md); the generator reads the source from the
public CDN, which is why step 4 comes first.

**6. Link the species to the plate.** Do this before committing — see [Linking species to
the new plate](#linking-species-to-the-new-plate) below. A plate with no rows in
`data/species-plates.csv` builds fine and is reachable, but no species page links to it.

**7. Commit and push.**

```sh
git switch -c add-plate-$(date +%Y%m%d-%H%M)
git add data/plates.json data/species-plates.csv data/image-derivatives.csv
git commit -m "feat: add plate NN (Family Name)"
git push -u origin HEAD
gh pr create --fill
```

`data/image-derivatives.csv` is the row step 5a produced. Leaving it out is the same as not
doing step 5a: the build fails on the branch and on everyone else's. The tile files themselves
are never committed — `plates/` is gitignored, and the CDN is where they live.

The `main` branch is protected: it takes changes only through a pull request whose
build check passes. `gh pr create` opens one; merge it from the PR page (or with
`gh pr merge`) once the check is green, and the site deploys automatically. The
date suffix just keeps each branch name unique, so the same command works every time.
`gh` is the GitHub CLI — see [CONTRIBUTING.md](../CONTRIBUTING.md) for installing and
signing into it.

CI builds the new plate page from the updated `data/plates.json`. It cannot upload anything,
so everything in steps 4 and 5a has to be on the CDN before the check can pass.

## Linking species to the new plate

Each species page shows a "View Photographic Plate" link when it has an entry
in `data/species-plates.csv`, consumed by
[`src/_data/speciesPlates.ts`](../src/_data/speciesPlates.ts).

## Schema: data/species-plates.csv

| Field | Type | Required | Example |
|-------|------|----------|---------|
| species_slug | string | yes | `abagrotis-apposita` — `(genus + '-' + species).toLowerCase()`, alphanumeric and hyphens only. Must match a species in `data/species.csv` |
| plate_slug | string | yes | `plate-NN-familyname` (the `slug` you chose in step 1) |

Add a row for every species that appears on the new plate:

```csv
some-species-slug,plate-NN-familyname
```

This mapping is curated (which species land on which plate is a layout
decision, not derivable from taxonomy), so there's no way to auto-generate it
from `data/species.csv` alone. If the reference database has been updated
with the new plate's membership, re-run
[`scripts/extract-species-plates.ts`](../scripts/extract-species-plates.ts)
(`npm run plates:materialize`) to regenerate the whole CSV instead of editing
it by hand.

