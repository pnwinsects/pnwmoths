# Task: Upload Images to the CDN

## What This Changes
- bunny.net Storage Zone `pnwmoths` — new image files added under `{slug}/{original-filename}` (species) or `glossary/{original-filename}` (glossary)
- `data/images.csv` — new rows referencing the uploaded images
- CDN cache — may need explicit purge when replacing an existing file

## Before You Start

You will need:
- **Storage Zone password** for the `pnwmoths` Storage Zone — request from the project owner
- **bunny.net account API key** — request from the project owner (needed only for cache invalidation)
- `rclone` installed: `brew install rclone` (macOS) or see https://rclone.org/install/

## Steps

### 1. Configure rclone (first time only)

```bash
rclone config
```

At the prompts:
- Name: `bunny`
- Type: `ftp`
- Host: `la.storage.bunnycdn.com`
- User: `pnwmoths`
- Password: **type the plain password directly** — do NOT run `rclone obscure` and paste its output here, that double-encodes it and breaks auth
- Port: `21` (press Enter for default)
- All other settings: press Enter to accept defaults

Verify the connection:
```bash
rclone ls bunny:
# Expected: lists species slug directories. An error means wrong credentials.
```

Note: the FTP user `pnwmoths` maps to the root of the Storage Zone. Use `bunny:` (not `bunny:pnwmoths`) for all paths.

### 2. Prepare the image file

- Species photos: use the original filename from the source — do not rename
- Filenames may contain spaces (e.g. `Acronicta americana-A-D.jpg`) — this is correct
- Glossary images go under `glossary/`

### 3. Upload the image

**Species photo:**
```bash
rclone copy --ignore-times \
  "Acronicta americana-A-D.jpg" \
  "bunny:acronicta-americana/"
```

**Glossary image:**
```bash
rclone copy --ignore-times \
  "my-glossary-image.jpg" \
  "bunny:glossary/"
```

Always use `--ignore-times`. bunny.net FTP does not support modification times — without this flag, rclone may skip uploads silently.

Upload **one file at a time**, not whole directories. Uploading a directory causes concurrent partial-file renames that bunny.net FTP rejects with a `450` error.

### 4. Update data/images.csv

Add a row to `data/images.csv` for the new image:

| Field | Type | Required | Example |
|-------|------|----------|---------|
| species_slug | string | yes | `acronicta-americana` |
| filename | string | yes | `Acronicta americana-A-D.jpg` (spaces preserved) |
| photographer | string | yes | `Jane Doe` |
| weight | integer | yes | display order; lower = earlier; use next integer for this slug |
| license | string | yes | `CC BY-NC-SA 4.0` or `(c) Photographer Name` |
| view | string | no | `dorsal`, `ventral`, `lateral`, or `head` |
| specimen | string | no | `A`, `B`, `C`, `D` |
| navigational | boolean | no | leave blank unless this is a curated navigation image |

### 5. Invalidate CDN cache (replacing an existing file only)

When replacing an image that was already served by the CDN, the cached version may be stale for hours. Purge it:

```bash
# URL-encode spaces as %20 in the filename
curl -X POST \
  "https://api.bunny.net/purge?url=https://pnwmoths.b-cdn.net/acronicta-americana/Acronicta%20americana-A-D.jpg" \
  -H "AccessKey: YOUR_ACCOUNT_API_KEY"
```

For new uploads (filename not previously served), no purge is needed.

## Verify

```bash
# File appears in Storage Zone
rclone ls bunny:acronicta-americana/ | grep "Acronicta americana"

# Build still passes
npm run build:data
```

Then open `https://pnwmoths.b-cdn.net/{slug}/{url-encoded-filename}` in a browser — the image should load.

## WARNING: Never Use rclone sync

`rclone sync` makes the destination match the source exactly — **it deletes every file in the bucket that is not present in your local source directory**. A partial local directory plus `rclone sync` empties the production bucket.

Always use `rclone copy`. If you need to audit what a sync would do, use `rclone sync --dry-run` and review the output carefully before ever removing `--dry-run`.
