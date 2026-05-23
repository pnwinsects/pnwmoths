# Task: Generate DZI Tile Pyramids for High-Res Species Photos

## What This Changes

- `data/species-photos-manifest.csv` — updated in place; `status` column advances from
  `discovered` (or `downloaded`) to `tiled` for each successfully processed row
- `{tileOutputDir}/{slug}/{specimen_id}-{view}.dzi` — DZI descriptor per pair
- `{tileOutputDir}/{slug}/{specimen_id}-{view}_files/` — tile pyramid per pair
- `{tiffCacheDir}/{content_hash}-{filename_raw}` — locally cached source TIFFs
- **No** Eleventy build changes. **No** bunny.net writes. **No** CDN cache changes.
  Those belong to Phase 30 (upload) and Phase 31 (data wiring).

## Prerequisites

You will need all of the following on the datacenter server before running the script:

- **SSH access** to the datacenter server where tiles will be stored
- **libvips CLI** installed — confirm with `vips --version` (8.x or later is required).
  Install on Debian/Ubuntu: `sudo apt install libvips-tools`. Note that the `libvips`
  shared-library package is not enough; you need `libvips-tools` specifically for the
  `vips` CLI binary.
- **Node.js** matching `.nvmrc` at the repo root — confirm with `node --version`
- **`data/species-photos-manifest.csv`** checked out and present at `data/` relative to
  the repo root. This is the manifest produced by Phase 26 (ingest) and curated through
  Phase 27 (synonyms). Pull the latest before running.
- **Outbound HTTPS** to both `content.dropboxapi.com` and `api.dropboxapi.com` from the
  datacenter server (the download stage calls both endpoints)
- **Dropbox app access token** with `files.metadata.read` and `sharing.read` scopes.
  Generate one at <https://www.dropbox.com/developers/apps>: create a Scoped Access app,
  enable both scopes on the Permissions tab, then generate a token on the Settings tab.
  Tokens start with `sl.`. Never commit the token, paste it into chat, or store it in a
  file on disk.
- **Disk headroom**: approximately 9 GB for the full tile corpus (~850 KB per pair ×
  ~10,000 pairs, per PILOT-LESSONS.md extrapolation). Each source TIFF is deleted
  immediately after its tiles are written, so peak TIFF disk usage is one file at a time
  (~20–250 MB). No large TIFF staging area is needed.

## Configuration

The committed file `scripts/tile-config.json` carries all seven tile parameters:

| Key | Value | Notes |
|---|---|---|
| `tileSize` | `256` | OSD default; confirmed correct in Phase 28 pilot |
| `overlap` | `1` | 1-pixel border overlap prevents seams at zoom edges |
| `suffix` | `.webp[Q=80]` | WebP at quality 80; ~30% smaller than JPEG at equivalent quality |
| `layout` | `dz` | Deep Zoom Image layout — the only OSD-compatible vips layout |
| `tileOutputDir` | `/var/lib/pnwmoths/tiles` | Default server path; overrideable |
| `tiffCacheDir` | `/var/lib/pnwmoths/tiffs` | Default server path; overrideable |
| `dropboxShareUrl` | (the v2.2 shared-folder URL) | The shared folder containing all source TIFFs |

Two environment variables override the path keys without modifying the committed config.
Use these when the server mounts storage at a non-default location:

- `TILE_OUTPUT_DIR` — overrides `tileOutputDir`
- `TIFF_CACHE_DIR` — overrides `tiffCacheDir`

`DROPBOX_TOKEN` is required for any non-dry-run invocation. Pass it on the invocation
line (see below); this keeps the token in the process environment only and out of shell
history when the invocation is prefixed with a space. Never commit, log, or hardcode it.

## Run the Dry-Run Preview

Before running the full pipeline, verify that the script can read the manifest and
compute tile prefixes correctly:

```bash
DRY_RUN=1 npm run photos:tile
```

Expected output: a list of the first five eligible rows with their computed tile prefix
paths and TIFF cache paths. No Dropbox calls are made. No manifest is written. The
eligible-row count is logged on the first line.

```
[tile-photos] manifest: 5182 rows total; 4950 eligible for tiling
[tile-photos] DRY_RUN=1 — printing first 5 eligible rows, not invoking fetch or vips, not writing manifest
  -> tile prefix : /var/lib/pnwmoths/tiles/abagrotis-apposita/A-D
     source TIFF : /var/lib/pnwmoths/tiffs/abc123...-Abagrotis apposita-A-D.tif
     dropbox_path: /Abagrotis apposita-A-D.tif
     status      : discovered
  ...
```

Operator checklist before proceeding:

- Tile prefix paths are lowercase species slugs (the genus segment is lowercased by the
  script regardless of the TIFF filename capitalisation — Phase 28 lesson)
- Output is rooted at the correct `tileOutputDir` (or the `TILE_OUTPUT_DIR` override)
- Eligible row count is roughly the count of `clean-match` + `slug-match` +
  `resolved-via-synonym` rows in the manifest, minus any rows already at `status: tiled`

## Run the Full Pipeline

Run the tiling pipeline in a tmux session to survive SSH disconnects. Log all output to
a dated file for Phase 30's storage-footprint sanity check:

```bash
tmux new -s tile
DROPBOX_TOKEN=sl.xxxxx npm run photos:tile 2>&1 | tee tile-run-$(date +%F-%H%M).log
```

Detach with `Ctrl-b d`. Reattach with `tmux attach -t tile`.

### Log Format

Each row transition produces one log line:

```
2026-05-22T12:34:56.789Z abc123def456 download         ok  204800 bytes
2026-05-22T12:34:57.901Z abc123def456 tile             ok  abagrotis-apposita/A-D
```

Fields: ISO timestamp, 12-character `content_hash` prefix (padded), action (16-char
field), outcome, optional context. The four outcome values are:

| Outcome | Meaning |
|---|---|
| `ok` | Step completed successfully |
| `cache-hit` | TIFF already present in `tiffCacheDir`; download skipped |
| `already-on-disk-advance` | `.dzi` found on disk; manifest advanced to `tiled` without re-running vips |
| `failed` | Step failed after retry exhaustion; row marked `status: failed` |

Transient Dropbox errors produce an interleaved retry line:

```
[tile-photos] transient error on download abc123def456 (attempt 2/5) — retrying in 4s: ...
```

The final lines are a summary:

```
[tile-photos] summary:
  tiled (new):                  4800
  downloaded (without re-tile): 0
  skipped (already tiled):      150
  failed (per-row errors):      0
  total eligible rows:          4950
[tile-photos] wrote data/species-photos-manifest.csv
```

### Expected Runtime

Approximately 10,000 pairs × (Dropbox download time + vips dzsave time). PILOT-LESSONS.md
observed vips dzsave at 1–3 seconds per pair on pilot TIFFs; the dominant cost is Dropbox
download bandwidth. Total wall-clock time will depend on network throughput to the datacenter.

## Resume After Interruption

All of the following are recoverable by simply re-running the same command:

- kill -9 / Ctrl-C / SIGINT
- Network drop mid-download
- Power loss

On the next `npm run photos:tile`, three idempotency checks gate work for each row:

1. **Manifest-level guard:** rows whose `status` is already `tiled` are filtered out by
   `isTileable()` before any work begins. They produce no log output.
2. **Filesystem-level guard:** rows whose `.dzi` file already exists on disk get their
   manifest `status` advanced to `tiled` immediately, without re-running vips. This
   catches the window between a successful vips invocation and the next manifest write
   (the "kill between vips and manifest-write" scenario).
3. **TIFF cache guard:** rows whose TIFF is already present in `tiffCacheDir` skip the
   Dropbox download step entirely and proceed directly to the tile stage. (TIFFs are
   deleted immediately after tiling, so a cached file at this point means the previous
   run was interrupted between download and tile.)

The manifest is checkpoint-written to disk every 25 rows. In a kill -9 scenario, at most
24 rows of in-memory status transitions are lost and must be re-processed on the next run.
Re-processing an already-tiled row produces an `already-on-disk-advance` log line and no
duplicate vips invocation.

Do not edit `data/species-photos-manifest.csv` while the script is running. The script
holds the full manifest in memory and writes it periodically; manual edits made mid-run
will be overwritten on the next checkpoint write.

## When Things Go Wrong

**`vips: command not found`**
The `libvips-tools` package is not installed on this machine. Install it:
`sudo apt install libvips-tools` (Debian/Ubuntu). The `libvips` shared-library package
alone is not sufficient — you need the separate `libvips-tools` package for the `vips`
CLI binary. Confirm success with `vips --version`.

**vips writes `.png` or `.jpg` tiles instead of `.webp`**
The `suffix` key in `scripts/tile-config.json` was edited away from `.webp[Q=80]`. Restore
it to exactly `.webp[Q=80]` (square brackets, no spaces). If the affected rows are still at
`status: tiled` in the manifest, you must delete the `.dzi` and `_files/` directory for each
affected pair before rerunning — otherwise the filesystem idempotency guard will skip vips
and the corrected config will never be applied.

**Dropbox download fails with HTTP 401**
`DROPBOX_TOKEN` is expired or was generated without the required scopes. Regenerate a token
at <https://www.dropbox.com/developers/apps>. On the Permissions tab, confirm both
`files.metadata.read` and `sharing.read` are checked before generating a new token on the
Settings tab.

**Dropbox download fails with HTTP 429**
The script's `withRetry` helper backs off at 2s / 4s / 8s / 16s / 32s (five attempts, 62s
total). If all five attempts fail, the row is marked `status: failed` with the error message
stored in `last_error`, and the run continues with the next row. Re-run the script later;
idempotency means successfully tiled rows are not repeated.

**vips dzsave fails on a specific TIFF**
The vips error is captured into the row's `last_error` field and the row is marked
`status: failed`. The TIFF is not deleted on a failed tile (only successful tiles trigger
deletion). To retry, simply re-run — the cached TIFF will be picked up and vips attempted
again. If the file is corrupt, delete it from `{tiffCacheDir}/{content_hash}-{filename_raw}`
and re-run; the script will re-download it from Dropbox.

**Disk full in `tileOutputDir` or `tiffCacheDir`**
Free space and re-run. Idempotency preserves all previously tiled rows; only the rows that
failed mid-tile (left without a completed `.dzi`) will be retried. Rows already at
`status: tiled` with a `.dzi` on disk are skipped.

**Mixed-case directory appears in tile output**
This should never happen — the script calls `.toLowerCase()` on `species_slug` unconditionally
before joining the output path. If a directory such as `Abagrotis-apposita/` appears alongside
the expected `abagrotis-apposita/`, the lowercasing logic in `scripts/tile-photos.js` was
bypassed. File a bug against the Phase 29 Plan 02 script.

## Verification

After the run completes, spot-check at least three random `tiled` rows from the manifest:

**1. Descriptor file and tile pyramid exist.**

```bash
ls {tileOutputDir}/{slug}/{specimen_id}-{view}.dzi
ls {tileOutputDir}/{slug}/{specimen_id}-{view}_files/
```

**2. Descriptor `Format` attribute is `webp`.**

```bash
head -3 {tileOutputDir}/{slug}/{specimen_id}-{view}.dzi
```

Expected:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Image Format="webp" Overlap="1" TileSize="256" xmlns="http://schemas.microsoft.com/deepzoom/2008">
  <Size Width="..." Height="..."/>
```

If `Format="jpg"` or `Format="png"` appears, the tile parameters were not applied
correctly — see the troubleshooting entry above.

**3. Manifest updated in place.**

```bash
git diff data/species-photos-manifest.csv | head -30
```

Rows that were processed should show `status` transitions from `discovered` (or
`downloaded`) to `tiled` in the diff.

**4. Save the run log.**

Keep the `tile-run-YYYY-MM-DD-HHMM.log` file alongside the commit. Phase 30 will use
per-pair disk sizes from the log for a storage-footprint sanity check before bulk upload.

## Next Phase Handoff

Phase 30 (`UPLOAD-01`) reads `data/species-photos-manifest.csv`, selects rows with
`status: tiled`, and uploads the tile directories to bunny.net Storage at the path
`species-tiles/{slug}/{specimen_id}-{view}/`.

Do not delete tiles from `tileOutputDir` until Phase 30 has completed successfully and
the uploaded tiles have been verified against the live CDN. Source TIFFs are deleted
automatically after each successful tile — no manual TIFF cleanup is needed.
