# 0013. High-res photos as OpenSeadragon deep-zoom tiles on the CDN

**Status:** Accepted

## Context

Curators hold high-resolution specimen TIFFs (in Dropbox) that are far too large to serve whole.
The original site offered deep-zoom via a legacy Zoomify viewer. A static site
([0001](0001-static-no-server.md)) has no image server to tile on demand, so tiling must happen
ahead of time and the tiles must live on the CDN ([0007](0007-bunny-cdn-images.md)). The tiling
run is large (~1 TB, thousands of images) and must survive interruption, retries, and reruns
without redoing work or corrupting state.

## Decision

Serve high-res species photos as **OpenSeadragon (OSD) deep-zoom (DZI) tiles in WebP** on the
Bunny CDN, produced by a **resumable, manifest-driven, idempotent local pipeline**: Dropbox ingest
→ libvips DZI tiling (`scripts/tile-photos.ts`, `tile-config.json`) → bulk Bunny upload
(`scripts/upload-tiles.ts`). A per-species **`high_res_available`** flag (from
`data/species-photos.json`) gates the OSD viewer in the factsheet lightbox; a one-species E2E
pilot preceded the bulk run (v2.2).

## Consequences

- Deep-zoom works with no image server; the browser fetches pre-tiled WebP DZI directly from the CDN.
- WebP tiles are ~30% smaller than JPEG; `viewer.open()` swaps DZI sources for prev/next specimen
  navigation without destroying the OSD instance.
- **Pipeline conventions that keep long runs safe** (regressions here corrupt a multi-hour run):
  - **`DRY_RUN` guard before the API-key guard**, so `DRY_RUN=1` pre-flight inspection needs no
    real key.
  - **`advanceStatus(row, 'uploaded')` before deleting tile files** — status is committed to the
    row before `rm`, so a failed delete still marks the row done and the next run skips it safely.
  - **Self-contained per-script helpers** (`redact`, `withRetry`, `logStage`, `walk`) copied into
    each script rather than shared-imported, so each script runs independently.
- The manifest (`data/species-photos-manifest.csv`) with per-row status + content-hash makes every
  stage resumable and idempotent; a vertical-slice pilot surfaced URL/CORS/format issues at zero
  bulk cost before committing to the full run.
