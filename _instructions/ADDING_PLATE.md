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

Upload the plate files using `curl` with the bunny.net Storage Zone HTTP PUT API (same pattern as `_instructions/UPLOADING_TILES.md`):

```sh
# Set your Storage Zone password from bunny.net → Storage → pnwmoths → FTP & API Access
BUNNY_STORAGE_PASSWORD="your-key"
PLATE_SLUG="plate-NN-familyname"

# Upload each file in the tile directory (ImageProperties.xml, thumbnail.jpg, TileGroup0/*, etc.)
find "plates/${PLATE_SLUG}" -type f | while read -r file; do
  dest_path="${file#plates/}"   # strip local 'plates/' prefix
  curl -s -X PUT \
    -H "AccessKey: ${BUNNY_STORAGE_PASSWORD}" \
    -T "${file}" \
    "https://la.storage.bunnycdn.com/pnwmoths/${dest_path}"
  echo "Uploaded: ${dest_path}"
done
```

Verify each upload with the CDN Pull Zone before moving on.

**5. Verify CDN delivery.**

```sh
curl -sI "https://moths.pnwinsects.org/plates/plate-NN-familyname/thumbnail.jpg" | grep HTTP
# Expected: HTTP/2 200
```

**6. Link the species to the plate.** Do this before committing — see [Linking species to
the new plate](#linking-species-to-the-new-plate) below. A plate with no rows in
`data/species-plates.csv` builds fine and is reachable, but no species page links to it.

**7. Commit and push.**

```sh
git add data/plates.json data/species-plates.csv
git commit -m "feat: add plate NN (Family Name)"
git push
```

CI will build the new plate page automatically from the updated `data/plates.json`.

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

