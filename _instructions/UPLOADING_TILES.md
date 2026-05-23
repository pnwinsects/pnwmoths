# Task: Upload DZI Tile Pyramids to bunny.net Storage

## What This Changes

- `data/species-photos-manifest.csv` — updated in place; `status` column advances from
  `tiled` to `uploaded` for each successfully uploaded row, or to `failed` (with the
  error stored in `last_error`) after retry exhaustion
- **bunny.net Storage Zone `pnwmoths`** — new objects under the prefix
  `species-tiles/{species-slug-lowercase}/{specimen_id}-{view}/`, containing the `.dzi`
  descriptor and the full `_files/` tile pyramid (one HTTP PUT per file)
- **Local tile directories** — `{tileOutputDir}/{slug}/{specimen_id}-{view}_files/` and
  `{tileOutputDir}/{slug}/{specimen_id}-{view}.dzi` are deleted immediately after each
  row's successful upload (D-03: disk reclamation)
- **No** Eleventy build changes. **No** edits to `data/images.csv`. **No** changes to
  `scripts/tile-config.json` or any other config file. Those belong to Phase 31
  (data/species-photos.json build integration) and Phase 32 (OpenSeadragon viewer
  wiring).

## Prerequisites

You will need all of the following on this laptop before running the script:

- **Local checkout of the pnwmoths repo on this laptop.** The pipeline runs locally
  on this laptop, not on any remote server. All paths default to locations within the
  repo checkout (`var/tiles`, `data/species-photos-manifest.csv`).
- **Node.js** matching `.nvmrc` at the repo root — confirm with `node --version`
  (v24.x is the expected version; the nvm SessionStart hook handles switching
  automatically).
- **`curl`** available on PATH — confirm with `curl --version` (8.x is the verified
  version).
- **`data/species-photos-manifest.csv`** present and pulled to latest; some rows must
  already be at `status: tiled` (i.e., Phase 29 has run for at least some rows).
  Pull the latest before running.
- **`var/tiles/`** directory (or whatever `TILE_OUTPUT_DIR` points to) populated with
  tile pyramids for the `status: tiled` rows. If you ran Phase 29 to completion you
  have this. Confirm: `ls var/tiles/ | head -5` should list species directories.
- **Outbound HTTPS** to `https://la.storage.bunnycdn.com` (the Storage Zone endpoint)
  from this laptop.
- **`BUNNY_API_KEY`** — the Storage Zone password from the bunny.net dashboard. Go to
  bunny.net → Storage → `pnwmoths` Storage Zone → FTP & API Access → copy the
  Password field. This is the same credential used by Phase 18's
  `scripts/upload-plates.js`. Never commit the key, paste it into chat, write it to
  disk, or hardcode it into any file.
- **Disk headroom:** at least 50 GB free recommended. Each row's tile directory is
  deleted immediately after successful upload (D-03), so steady-state disk usage
  trends downward as the run proceeds.

## Configuration

The script reads one config file and several environment variables:

| Variable | Default | Notes |
|---|---|---|
| `BUNNY_API_KEY` | _(required)_ | Storage Zone password; the script exits with `[upload-tiles] BUNNY_API_KEY is required. Set it to your bunny.net Storage Zone password.` if missing |
| `BUNNY_STORAGE_HOST` | `la.storage.bunnycdn.com` | Storage Zone host; rarely overridden (only if bunny.net adds a new region or you are testing against a different zone) |
| `BUNNY_ZONE` | `pnwmoths` | Storage Zone name; forms the path prefix on every PUT URL |
| `TILE_OUTPUT_DIR` | `var/tiles` (from `scripts/tile-config.json`) | Local directory the script reads tiles from; override only if your tiles live somewhere other than the default |
| `DRY_RUN` | _(unset)_ | When set to `1`, prints first 5 upload plans (with Pull Zone CDN URLs) and exits without uploading, modifying the manifest, or deleting any files |

All paths default to local locations within the repo (`var/tiles`,
`data/species-photos-manifest.csv`). The script runs on this local laptop only — not
on any remote server. If you have configured `TILE_OUTPUT_DIR` for a different
location, double-check the path before kicking off the bulk run.

## Run the Dry-Run Preview

Before running the full pipeline, verify that the script can read the manifest and
compute upload paths correctly:

```bash
DRY_RUN=1 npm run photos:upload
```

`DRY_RUN=1` does not require `BUNNY_API_KEY` — the key guard runs after the dry-run
early exit. No uploads are made, no manifest is written, no tiles are deleted.

Expected output:

```
[upload-tiles] manifest: 4935 rows total; 3808 eligible (status=tiled)
[upload-tiles] DRY_RUN=1 — printing first 5 upload plans, not uploading
  slug: abagrotis-apposita  pair: A-D
    CDN URL: https://pnwmoths.b-cdn.net/species-tiles/abagrotis-apposita/A-D/
    Files to upload: 88 (87 tiles + 1 .dzi)
  slug: abagrotis-apposita  pair: A-V
    CDN URL: https://pnwmoths.b-cdn.net/species-tiles/abagrotis-apposita/A-V/
    Files to upload: 88 (87 tiles + 1 .dzi)
  ... (3803 more)
```

Note: the exact file count and "more" count will vary depending on how many Phase 29
rows have completed by the time you run this.

Operator checklist before proceeding:

- CDN URLs use the Pull Zone host `pnwmoths.b-cdn.net` (the read-only verification
  endpoint), not the Storage Zone host `la.storage.bunnycdn.com`
- Every slug in the output is lowercase (even if the source TIFF had a mixed-case
  genus — the script calls `.toLowerCase()` unconditionally per L-08)
- The eligible row count matches the number of rows at `status: tiled` in your manifest
  (`grep -c ',tiled,' data/species-photos-manifest.csv` is a close approximation)
- The dry run exits cleanly with no manifest changes and no tile deletions

## Run the Full Pipeline

Run the upload pipeline in a tmux session to survive laptop sleep and accidental
terminal closure. Log all output to a dated file for post-run auditing:

```bash
tmux new -s upload
BUNNY_API_KEY=xxxxx npm run photos:upload 2>&1 | tee upload-run-$(date +%F-%H%M).log
```

Detach with `Ctrl-b d`. Reattach with `tmux attach -t upload`.

### Pre-Flight Footprint Check

Before the first upload, the script walks `var/tiles/` for all `status: tiled` rows,
measures total bytes on disk, and prints a footprint summary. This is the UPLOAD-03
sanity check:

```
[upload-tiles] Pre-flight: measuring tile corpus size (this may take 30-90s)...
[upload-tiles] Pre-flight footprint check:
  3808 rows with status=tiled
  Tile output dir: var/tiles
  Total on-disk size: 3.2 GB (measured)
  Estimated full-run size (extrapolated): ~1.1 TB (3808 rows × avg 0 MB/dir)
Proceeding with upload...
```

The "Estimated full-run size" line only appears when fewer rows have tiles on disk
than exist at `status: tiled` (i.e., Phase 29 is still in progress). When Phase 29
has completed and all tiles are present, only the "Total on-disk size" line appears.

Cross-reference the projected size against bunny.net's current Storage pricing (look
up the price on bunny.net's pricing page manually — hardcoded rates drift). If the
projected GB is unexpectedly high, press `Ctrl-C` now and investigate before the bulk
commit. Otherwise, let the run proceed past the `Proceeding with upload...` line.

### Log Format

Each row transition produces one log line:

```
2026-05-23T18:00:00.000Z e6f226797116 upload           ok  abagrotis-apposita/A-D  88 files
2026-05-23T18:00:05.000Z f7a337898227 upload           failed  PUT failed after 5 attempts: ...
```

Fields: ISO timestamp, 12-character `content_hash` prefix (padded), action (16-char
field), outcome, optional context.

| Outcome | Meaning |
|---|---|
| `ok` | All files uploaded; row advanced to `status: uploaded`; tile dir deleted |
| `failed` | Upload failed after retry exhaustion; row marked `status: failed` with error in `last_error` |

Transient errors produce an interleaved retry line:

```
[upload-tiles] transient error on upload A-D/0/0_0.webp (attempt 2/5) — retrying in 4s: ...
```

Every 25 rows, a progress checkpoint line is printed:

```
[upload-tiles] 25/3808
[upload-tiles] 50/3808
```

### Expected Runtime

Approximately 27 hours serial at ~50 ms/PUT × ~350,000 file PUTs for the full
~3,808-row corpus (~92 tile files per directory × 3,808 rows, plus one `.dzi`
descriptor per row). The run is unattended in tmux (D-01 — serial uploads, simplicity
over speed). Plan accordingly: start the run in the evening and check back the next
morning.

## Resume After Interruption

### What is recoverable

All of the following are recoverable by simply re-running `npm run photos:upload`:

- `kill -9` / `Ctrl-C` / `SIGINT`
- Network drop mid-upload
- Transient bunny.net 5xx errors (the script retries each file up to five times)
- Laptop sleep

### What re-running does

On the next `npm run photos:upload`:

1. `isUploadable` filters out rows at `status: uploaded` before the loop — they
   produce no log output and no upload work is attempted.
2. Rows that crashed mid-directory stayed at `status: tiled` (whole-directory
   granularity, D-02). The script re-uploads the entire directory from the beginning.
   bunny.net PUT is idempotent — already-uploaded files are overwritten safely.
3. The manifest is checkpoint-written every 25 rows (L-07). A `kill -9` loses at
   most 24 rows of in-memory status transitions, which will be reprocessed on the
   next run.

### What is NOT recoverable without re-tiling

A row whose tile directory was deleted (after `advanceStatus` succeeded) but whose
status was lost in the 24-row checkpoint window. On restart, the row is `status: tiled`
in the manifest (the in-memory advance was not flushed to disk), but the tile directory
is gone. The script detects the missing directory, catches the `ENOENT` error, and
marks the row `status: failed`. The `last_error` column in the manifest will contain
the ENOENT message.

Operator remediation: re-tile the affected rows with `npm run photos:tile` (Phase 29),
then re-run `npm run photos:upload`. This is the documented tradeoff between D-02
(whole-directory recovery granularity) and D-03 (immediate post-upload deletion).

### Do NOT edit the manifest while the script is running

The script holds the full manifest in memory and writes it periodically. Manual edits
made to `data/species-photos-manifest.csv` mid-run will be overwritten on the next
checkpoint write. If you need to edit the manifest (e.g., to correct a `last_error`
entry), wait until the run completes or stop the script first.

## When Things Go Wrong

**`[upload-tiles] BUNNY_API_KEY is required. Set it to your bunny.net Storage Zone password.`**
The `BUNNY_API_KEY` env var was not set on the invocation line. Confirm the credential
at bunny.net → Storage → `pnwmoths` Storage Zone → FTP & API Access → Password field.
Pass it on the invocation line: `BUNNY_API_KEY=xxxxx npm run photos:upload`.

**Every PUT fails immediately with HTTP 4xx**
Two common causes: (a) `BUNNY_API_KEY` is wrong — verify against the bunny.net
dashboard as above. (b) The PUT is going to the wrong host — confirm that
`BUNNY_STORAGE_HOST` defaults to `la.storage.bunnycdn.com` (the Storage Zone, which
accepts writes) and not `pnwmoths.b-cdn.net` (the Pull Zone, which is read-only).
The script's `withRetry` will waste up to 62 seconds (2 + 4 + 8 + 16 + 32 s) before
the first row fails on a bad API key. Press `Ctrl-C` after the first failure, fix the
env var, and restart.

**Mixed-case slug appears in CDN URL or storage path**
This should never happen — the script calls `.toLowerCase()` on `species_slug`
unconditionally (L-08) before every path join. If an uppercase slug appears in DRY_RUN
output, file a bug against `scripts/upload-tiles.js` (Phase 30 Plan 01).

**`ENOENT` errors on tile directory — rows moving to `status: failed`**
A row reached `status: tiled` in memory, the tile directory was deleted, but the
manifest checkpoint flush didn't happen before a `kill -9` (the 24-row window). On
restart, the manifest still shows `status: tiled` but the directory is gone. Re-tile
the affected rows with `npm run photos:tile` (Phase 29), then re-run the upload.

**Pre-flight walk takes more than 90 seconds**
Expected on a full corpus of ~450,000 files; `statSync` per file on macOS APFS is
slow. The script prints `[upload-tiles] Pre-flight: measuring tile corpus size (this
may take 30-90s)...` before starting the walk — wait for `Proceeding with upload...`
before concluding the script is hung. If the walk has not printed the footprint check
after 5 minutes, something is wrong (filesystem corruption, slow external drive) —
press `Ctrl-C` and investigate.

**Disk fills up mid-run**
Should not happen given D-03 (per-row deletion shrinks disk usage monotonically as
the run proceeds). If it does occur, free space manually and re-run.
`npm run photos:upload` will skip all rows already at `status: uploaded` and resume
from where it left off.

## Verification

After the run completes, run the following checks before committing the manifest.

**1. Pull Zone resolves the .dzi descriptor (ROADMAP SC-4).**

Pick three random `status: uploaded` rows from the manifest and run:

```bash
curl -I https://pnwmoths.b-cdn.net/species-tiles/{slug}/{specimen_id}-{view}.dzi
```

Expected response: `HTTP/2 200`, `content-type: application/xml` or `text/xml`. A
`404` means either the upload did not reach the Storage Zone (check the bunny.net
dashboard) or the Pull Zone cache has not refreshed yet (wait 1–2 minutes and retry).

**2. A representative tile file resolves through the Pull Zone.**

```bash
curl -I https://pnwmoths.b-cdn.net/species-tiles/{slug}/{specimen_id}-{view}_files/0/0_0.webp
```

Expected: `HTTP/2 200`, `content-type: image/webp`. Adjust the `0/0_0.webp` segment
to match your actual tile layout — open the `.dzi` descriptor in a browser to confirm
the correct tile coordinates.

**3. Manifest diff shows tiled → uploaded transitions.**

```bash
git diff data/species-photos-manifest.csv | head -30
```

Successful rows show `status` advancing from `tiled` to `uploaded`. Failed rows show
`status: failed` with a populated `last_error` column.

**4. Local tile directories are gone.**

```bash
find var/tiles -type f | wc -l
du -sh var/tiles
```

The file count should be 0 (or near 0 — only rows that failed to upload retain their
tile directory). `du -sh var/tiles` should read well under 1 GB.

**5. Final summary line matches the row counts.**

Tail the log file and confirm:

```
[upload-tiles] summary:
  uploaded (new):              3750
  skipped (already uploaded):  0
  failed (per-row errors):     58
  total eligible rows:         3808
[upload-tiles] wrote /path/to/data/species-photos-manifest.csv
```

Note: `skipped (already uploaded)` is typically `0` after a clean first run because
`isUploadable` filters those rows out before counting eligible rows. On a re-run after
interruption the counter may still be `0` because the filter runs before the loop.

**6. Commit the manifest.**

After all verification steps pass:

```bash
git add data/species-photos-manifest.csv
git commit -m 'chore(30): record uploaded rows from bulk run'
```

The manifest is the durable source of truth for Phase 31. Commit it before moving on.

## Next Phase Handoff

Phase 31 (`data/species-photos.json` build integration) reads `status: uploaded` rows
from `data/species-photos-manifest.csv` and materializes them into the Eleventy data
tree. The CDN tile path convention is:

```
https://pnwmoths.b-cdn.net/species-tiles/{slug-lowercase}/{specimen_id}-{view}/
```

This is the URL format Phase 31 will use to construct OpenSeadragon viewer entries.
Do not edit or delete any objects in the bunny.net Storage Zone after this run until
Phase 31 has been verified — tile URLs are now public and downstream code will start
depending on them.

Keep the `upload-run-YYYY-MM-DD-HHMM.log` file alongside the manifest commit so
future debugging has the full timestamped run log available.
