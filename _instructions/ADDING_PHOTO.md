# Task: Add a Photo for a Species

## What This Changes
- `images/{slug}/` — new image file (tracked by Git LFS)
- `data/images.csv` — new row referencing the image
- Build output: photo appears on the species page

## Schema: data/images.csv

| Field | Type | Required | Example |
|-------|------|----------|---------|
| species_id | integer | yes | 1 (must match an id in species.csv) |
| filename | string | yes | 02.jpg |
| photographer | string | yes | Jane Doe |
| weight | integer | yes | 2 (display order; lower = earlier) |
| license | string | yes | CC BY 4.0 (see License conventions below) |
| view | string | no | dorsal |
| specimen | string | no | A |

### License conventions

| Situation | license value | Example |
|-----------|--------------|---------|
| Creative Commons | The CC license identifier | `CC BY 4.0` |
| Copyrighted (used with permission) | `(c) Photographer Name` | `(c) Merrill Peterson` |
| Public domain | `public domain` | `public domain` |

The `view` and `specimen` fields are optional. When importing from the source site, these can be extracted from the original filename (e.g., `B-V-acronicta-americana-01.jpg` where B = specimen, V = ventral).

- `view`: View angle — `dorsal`, `ventral`, `lateral`, or `head`
- `specimen`: Specimen identifier letter (`A`, `B`, `C`, `D`) when multiple specimens are shown

## Steps

1. Find the `species_id` and slug for the target species in `data/species.csv`.

2. Copy the image file into `images/{slug}/`. Use a sequential filename (e.g., if `01.jpg` exists, use `02.jpg`). Images must be `.jpg`, `.jpeg`, or `.png`.

3. Open `data/images.csv`. Add a row:
   ```csv
   1,02.jpg,Jane Doe,2,CC BY 4.0,dorsal,A
   ```

4. **Git LFS steps (required for images):**
   - Ensure Git LFS is installed: `git lfs install`
   - LFS tracking is automatic via `.gitattributes` (patterns: `images/**/*.jpg`, `images/**/*.jpeg`, `images/**/*.png`)
   - Verify: `git lfs status` should show the new image as an LFS object
   - Stage the image: `git add images/{slug}/{filename}` — this stages the LFS pointer, not the raw binary

5. Verify the build:
   ```bash
   npm run build
   ```
   Expected: build completes. The species page shows the new photo.

6. Commit and push:
   ```bash
   git add data/images.csv images/{slug}/{filename}
   git commit -m "Add photo for [species name]"
   git push
   ```

## Verify
- Expected: `_site/species/{slug}/index.html` includes an `<img>` tag for the new photo.
- Expected: `git lfs status` shows the image file as tracked by LFS.
- Failure: If image appears as broken on deployed site, LFS was not pulled before build — run `git lfs pull` first.

## Docker Alternative
```bash
docker compose run --rm dev npm run build
```
