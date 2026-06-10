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
- `BUNNY_API_KEY` — the Storage Zone password from bunny.net dashboard → Storage → pnwmoths → FTP & API Access

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

The original plate-upload script was a one-time migration tool and has been removed. Upload the plate files manually using `curl` with the bunny.net Storage Zone HTTP PUT API (same pattern as `_instructions/UPLOADING_TILES.md`):

```sh
# Set your Storage Zone password from bunny.net → Storage → pnwmoths → FTP & API Access
BUNNY_API_KEY="your-key"
PLATE_SLUG="plate-NN-familyname"

# Upload each file in the tile directory (ImageProperties.xml, thumbnail.jpg, TileGroup0/*, etc.)
find "plates/${PLATE_SLUG}" -type f | while read -r file; do
  dest_path="${file#plates/}"   # strip local 'plates/' prefix
  curl -s -X PUT \
    -H "AccessKey: ${BUNNY_API_KEY}" \
    -T "${file}" \
    "https://la.storage.bunnycdn.com/pnwmoths/${dest_path}"
  echo "Uploaded: ${dest_path}"
done
```

Verify each upload with the CDN Pull Zone before moving on.

**5. Verify CDN delivery.**

```sh
curl -sI "https://pnwmoths.b-cdn.net/plates/plate-NN-familyname/thumbnail.jpg" | grep HTTP
# Expected: HTTP/2 200
```

**6. Commit and push.**

```sh
git add data/plates.json
git commit -m "feat: add plate NN (Family Name)"
git push
```

CI will build the new plate page automatically from the updated `data/plates.json`.
