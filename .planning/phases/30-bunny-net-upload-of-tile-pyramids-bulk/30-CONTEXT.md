# Phase 30: bunny.net Upload of Tile Pyramids (bulk) - Context

**Gathered:** 2026-05-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 30 uploads each DZI tile directory produced by Phase 29 to bunny.net Storage and advances the manifest from `status: tiled` to `status: uploaded`. The deliverable is:

1. `scripts/upload-tiles.js` — a new script that reads the manifest, filters rows with `status: tiled`, and uploads each tile directory (`.dzi` descriptor + `{specimen_id}-{view}_files/` tile pyramid) to bunny.net Storage via HTTP PUT at `species-tiles/{species-slug}/{specimen_id}-{view}/`. After successful upload, deletes the local tile directory and advances the manifest row to `status: uploaded`.
2. A pre-flight storage footprint check (runs at script startup, always) — walks the local tile output dir for all `status: tiled` rows, sums total bytes, prints GB before the first upload begins. Operator reviews this before committing to the bulk run.
3. `_instructions/UPLOADING_TILES.md` — operator runbook covering env setup, dry-run preview, full pipeline, resume after interruption, crash recovery, and tile URL verification via the Pull Zone.

**Out of scope for Phase 30:** Generating tiles (Phase 29). Materializing `data/species-photos.json` from the manifest (Phase 31). OpenSeadragon viewer integration (Phase 32). Any change to `data/images.csv` or existing Eleventy templates.

</domain>

<decisions>
## Implementation Decisions

### Upload mechanics
- **D-01 (serial uploads):** `upload-tiles.js` uploads files one at a time using `execFileSync('curl', ...)` — same pattern as `scripts/upload-plates.js`. No concurrent PUT pool. The run is unattended in tmux; wall-clock time (~27h for 1.9M files at ~50ms/PUT) is acceptable. Simplicity and debuggability are worth more than speed here.
- **D-02 (whole-directory granularity on recovery):** If the script crashes mid-directory (e.g., 300/500 files uploaded), the manifest row stays `status: tiled`. On restart, the script re-uploads the entire directory. bunny.net PUT is idempotent — already-uploaded files are overwritten safely. No per-file sidecar progress tracker.

### Tile directory deletion
- **D-03 (immediate, unconditional):** After advancing a manifest row to `status: uploaded`, the script immediately deletes `{tileOutputDir}/{slug}/{specimen_id}-{view}_files/` and `{tileOutputDir}/{slug}/{specimen_id}-{view}.dzi`. No `DELETE_TILES=1` flag — deletion is always part of a successful upload row. This is the D-06 (Phase 26) streaming intent. Disk is the constraint (48 GB free on maderas.amandrai.net vs. ~9 GB tile output per batch).

### Storage footprint pre-flight (UPLOAD-03)
- **D-04 (always-on pre-flight, size only):** At startup, before any upload, `upload-tiles.js` walks the tile output directory for all `status: tiled` rows and prints total bytes (in GB). No cost projection — bunny.net pricing varies by zone/region and changes over time; operator cross-references the pricing page manually. The pre-flight exits cleanly and the upload proceeds. If the operator wants to abort after seeing the footprint, they `Ctrl-C`.

### Script and env shape (locked by prior phases)
- **L-01:** Script name is `scripts/upload-tiles.js` (D-13, Phase 26).
- **L-02:** `BUNNY_API_KEY` is the only required env var at invocation; `TILE_OUTPUT_DIR` overrides the tile output dir (default from `scripts/tile-config.json`). Mirrors `tile-photos.js` env-var pattern.
- **L-03:** `DRY_RUN=1` prints first 5 tile directory upload plans (CDN URL + file count) without uploading or modifying the manifest. Mirrors `tile-photos.js` DRY_RUN behavior.
- **L-04:** `BUNNY_API_KEY` is redacted in all error messages (`msg.replace(new RegExp(BUNNY_API_KEY, 'g'), '[REDACTED]')`). Mandatory pattern from Phase 13.
- **L-05:** `withRetry` (5 attempts, 2s/4s/8s/16s/32s delays) wraps each individual file PUT. Non-retriable 4xx errors (`err.retriable = false`) bail immediately — same pattern added in Phase 29's fix(29) commit.
- **L-06:** `logStage(content_hash, action, outcome, extra)` for every per-row transition, following the Phase 26/29 format. Progress summary printed every 25 rows.
- **L-07:** Manifest written every 25 rows (same flush interval as `tile-photos.js`) to bound data loss on crash.
- **L-08:** URL convention is `species-tiles/{species_slug}/{specimen_id}-{view}/` with `species_slug` lowercased unconditionally (Phase 29 lesson: slugs in CDN paths MUST be lowercase).

### Claude's Discretion
- **npm alias:** `photos:upload` (following `photos:ingest` / `photos:tile` naming convention).
- **BUNNY_STORAGE_HOST / BUNNY_ZONE env vars:** Default to `la.storage.bunnycdn.com` and `pnwmoths` respectively (same defaults as `upload-plates.js`).
- **Eligible rows filter:** Rows with `status: tiled` only. Rows with `status: uploaded` are skipped (manifest-level idempotency). Rows with other statuses (discovered, failed, etc.) are ignored.
- **Manifest commit:** Script writes the CSV but does not git-commit. Operator runs `git add data/species-photos-manifest.csv && git commit` after the run, consistent with the Phase 26/27/29 pattern.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 30 charter
- `.planning/ROADMAP.md` §"Phase 30: bunny.net Upload of Tile Pyramids (bulk)" — goal + 4 success criteria; UPLOAD-01, UPLOAD-02, UPLOAD-03 traceability
- `.planning/REQUIREMENTS.md` — UPLOAD-01 (HTTP PUT to species-tiles/…), UPLOAD-02 (manifest idempotency), UPLOAD-03 (storage footprint sanity check)

### Phase 29 upstream (the contract Phase 30 consumes)
- `.planning/phases/29-dzi-tile-generation-pipeline-bulk/29-03-SUMMARY.md` — actual tile output paths, DRY_RUN output format, idempotency checks; Phase 30 handoff notes at bottom
- `scripts/tile-photos.js` — `tilePrefix()` and `isTileable()` exports define the disk layout Phase 30 reads; `withRetry`, `redact`, `logStage` are the patterns to replicate
- `scripts/tile-config.json` — `tileOutputDir` default path (`var/tiles`); `TILE_OUTPUT_DIR` env var overrides it

### Prior art to reuse (Phase 18)
- `scripts/upload-plates.js` — canonical HTTP PUT via `execFileSync('curl', ...)` pattern; `BUNNY_API_KEY`/`BUNNY_STORAGE_HOST`/`BUNNY_ZONE` env var shape; `DRY_RUN=1` convention; API key redaction; exponential retry; progress reporting every N files. Phase 30 is a manifest-driven version of this script.

### Manifest library and schema
- `scripts/lib/manifest.js` — `readManifest`, `writeManifest`, `advanceStatus`, `COLUMNS`; Phase 30 uses these unchanged
- `data/species-photos-manifest.csv` — runtime input; 4935 rows; ~3808 with `status: tiled` after a full Phase 29 run

### Cross-phase locked decisions
- `.planning/phases/26-dropbox-ingest-filename-parser-and-manifest/26-CONTEXT.md` — D-06 (streaming delete model), D-10 (env vars at invocation), D-13 (one script per stage), D-15 (logStage + withRetry shape)

### Project context
- `.planning/PROJECT.md` — CDN_BASE_URL public constant; Phase 13 HTTP PUT pattern entry in Key Decisions table; flat-file ethos
- `_instructions/UPLOADING_IMAGES.md` — Phase 13 runbook; section structure to mirror in UPLOADING_TILES.md
- `_instructions/TILING_HIGH_RES_PHOTOS.md` — Phase 29 runbook; tone and format to match

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`scripts/upload-plates.js`** — the canonical template. Phase 30 replaces the `.upload-plates-progress` file-based tracking with manifest-based tracking (read `status: tiled`, write `status: uploaded`), and adds the pre-flight footprint walk. The curl invocation shape, env var pattern, retry loop, and API key redaction carry over verbatim.
- **`scripts/tile-photos.js` — `withRetry`, `redact`, `logStage`** — copy these three helpers directly (same source, same semantics). Do not import them across scripts — the project pattern is self-contained per-script files.
- **`scripts/lib/manifest.js` — `readManifest`, `writeManifest`, `advanceStatus`** — reused unchanged. `advanceStatus` mutates the row in-place (Phase 29 pattern).
- **`scripts/tile-config.json` — `tileOutputDir`** — Phase 30 reads this to resolve the default tile output directory, same as `tile-photos.js` does.
- **`scripts/lib/dropbox-download.js`** — NOT used by Phase 30 (no Dropbox calls needed). Upload phase works only from local tile dirs.

### Established Patterns
- **Module-level env constants:** `const BUNNY_API_KEY = process.env.BUNNY_API_KEY ?? '';` at module top — same as every scripts/ file.
- **`execFileSync('curl', args)` for PUT:** Pass args as array (never a shell string) — handles filenames with spaces correctly. Phase 29 TIFF names have spaces; tile files won't, but the pattern is still correct.
- **Walk helper:** `upload-plates.js` has a recursive `walk(dir)` function that returns all files under a directory. Phase 30 needs the same to enumerate `{specimen_id}-{view}_files/**`.
- **DRY_RUN guard:** Check `DRY_RUN` before any curl call, manifest write, or tile deletion. Print representative output (first 5 rows) and exit.
- **Manifest flush interval:** Write manifest every 25 rows (matching `tile-photos.js` commit interval). Bounds crash data loss.

### Integration Points
- **Phase 31 reads `status: uploaded` rows** to derive `data/species-photos.json`. Phase 30 must ensure `species_slug`, `specimen_id`, `view`, and the CDN tile path can be derived from each `status: uploaded` row. The manifest schema already carries all these fields.
- **CDN Pull Zone** — tiles upload to the Storage Zone but are served via the Pull Zone (`CDN_BASE_URL/species-tiles/…`). The pre-flight footprint check and the DRY_RUN mode should print Pull Zone URLs (not Storage host URLs) so the operator can verify tile resolution manually.
- **`tile-config.json` default path vs. production path** — On `maderas.amandrai.net`, the operator will likely use `TILE_OUTPUT_DIR=/var/lib/pnwmoths/tiles` (matching the Phase 29 dry-run output). The default `var/tiles` relative path is correct for local development and tests.

</code_context>

<specifics>
## Specific Ideas

- **Pre-flight footprint output format** (example):
  ```
  [upload-tiles] Pre-flight footprint check:
    3808 rows with status=tiled
    Tile output dir: /var/lib/pnwmoths/tiles
    Total on-disk size: 8.3 GB (measured)
    Estimated full-run size (extrapolated): ~1.1 TB (3808 rows × avg 0.28 GB/dir)
  Proceeding with upload...
  ```
  The "estimated full-run size" line extrapolates from measured rows if not all tiles are on disk yet (Phase 29 runs in parallel with Phase 30 in the streaming model).

- **CDN path verification** (ROADMAP SC-4): The runbook should include a spot-check step after the first 5 rows upload: `curl -I https://cdn.pnwmoths.biol.wwu.edu/species-tiles/{slug}/{specimen_id}-{view}.dzi` (using `CDN_BASE_URL` from `eleventy.config.js`). The script itself does not do this check automatically.

- **Phase 29 dry-run log paths**: The Phase 29 dry-run showed tile prefixes like `/var/lib/pnwmoths/tiles/abagrotis-apposita/A-D`, confirming lowercase slug and `{specimen_id}-{view}` separator. Phase 30 must use identical lowercasing logic when constructing the CDN path.

</specifics>

<deferred>
## Deferred Ideas

- **DELETE_TILES=1 flag** — Considered as a safety valve for first test runs. Rejected (D-03) — unconditional deletion is simpler and D-06 is already locked. If the operator wants to inspect tiles before deletion, they should abort with Ctrl-C after the pre-flight summary and check manually.
- **Concurrent file PUTs** — Considered for performance (10-connection pool → ~3h vs. ~27h serial). Rejected (D-01) — serial is debuggable and sufficient for an unattended tmux run.
- **Per-file progress sidecar** — Considered for finer-grained crash recovery. Rejected (D-02) — whole-directory re-upload is safe and simpler given idempotent PUT.
- **Cost projection in footprint check** — Rejected (D-04) — hardcoded rates drift; size-only is more durable.
- **Separate `check-storage-footprint.js` script** — Rejected in favor of always-on pre-flight in the main script.
- **Reviewed Todos (not folded):** Two todos matched Phase 30 weakly ("Fix close button on the lightbox", "Migrate Pagefind to Component UI") — both are UI concerns, not upload pipeline. Left in pending for a future UI phase.

</deferred>

---

*Phase: 30-bunny-net-upload-of-tile-pyramids-bulk*
*Context gathered: 2026-05-23*
