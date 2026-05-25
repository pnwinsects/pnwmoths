# Phase 30: bunny.net Upload of Tile Pyramids (bulk) - Research

**Researched:** 2026-05-23
**Domain:** Node.js CLI script, bunny.net Storage HTTP PUT, manifest-driven pipeline
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01 (serial uploads):** `upload-tiles.js` uploads files one at a time using `execFileSync('curl', ...)` — same pattern as `scripts/upload-plates.js`. No concurrent PUT pool.
- **D-02 (whole-directory granularity on recovery):** If the script crashes mid-directory, the manifest row stays `status: tiled`. On restart, the script re-uploads the entire directory. bunny.net PUT is idempotent — already-uploaded files are overwritten safely.
- **D-03 (immediate, unconditional deletion):** After advancing a manifest row to `status: uploaded`, the script immediately deletes `{tileOutputDir}/{slug}/{specimen_id}-{view}_files/` and `{tileOutputDir}/{slug}/{specimen_id}-{view}.dzi`.
- **D-04 (always-on pre-flight, size only):** At startup, before any upload, `upload-tiles.js` walks the tile output directory for all `status: tiled` rows and prints total bytes (in GB). No cost projection.
- **L-01:** Script name is `scripts/upload-tiles.js`.
- **L-02:** `BUNNY_API_KEY` is the only required env var; `TILE_OUTPUT_DIR` overrides the tile output dir (default from `scripts/tile-config.json`).
- **L-03:** `DRY_RUN=1` prints first 5 tile directory upload plans (CDN URL + file count) without uploading or modifying the manifest.
- **L-04:** `BUNNY_API_KEY` is redacted in all error messages.
- **L-05:** `withRetry` (5 attempts, 2s/4s/8s/16s/32s delays) wraps each individual file PUT. Non-retriable 4xx errors bail immediately.
- **L-06:** `logStage(content_hash, action, outcome, extra)` for every per-row transition; progress summary printed every 25 rows.
- **L-07:** Manifest written every 25 rows to bound data loss on crash.
- **L-08:** URL convention is `species-tiles/{species_slug}/{specimen_id}-{view}/` with `species_slug` lowercased unconditionally.

### Claude's Discretion

- **npm alias:** `photos:upload` (following `photos:ingest` / `photos:tile` naming convention).
- **BUNNY_STORAGE_HOST / BUNNY_ZONE env vars:** Default to `la.storage.bunnycdn.com` and `pnwmoths` respectively.
- **Eligible rows filter:** Rows with `status: tiled` only. Rows with `status: uploaded` are skipped. Other statuses are ignored.
- **Manifest commit:** Script writes the CSV but does not git-commit. Operator runs `git add data/species-photos-manifest.csv && git commit` after the run.

### Deferred Ideas (OUT OF SCOPE)

- DELETE_TILES=1 flag
- Concurrent file PUTs
- Per-file progress sidecar
- Cost projection in footprint check
- Separate `check-storage-footprint.js` script
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UPLOAD-01 | System uploads each image's tile directory to bunny.net Storage using the Phase 13 HTTP PUT pattern; URL convention `{cdnBaseUrl}/species-tiles/{species-slug}/{specimen_id}-{view}/` | `scripts/upload-plates.js` provides the verbatim curl PUT pattern. `tilePrefix()` in `tile-photos.js` confirms the on-disk layout (`{tileOutputDir}/{slug}/{specimen_id}-{view}.dzi` + `{specimen_id}-{view}_files/`). CDN_BASE_URL = `https://pnwmoths.b-cdn.net`. |
| UPLOAD-02 | Manifest tracks upload status (`status: tiled → uploaded`); reruns skip already-uploaded images | `scripts/lib/manifest.js` `advanceStatus` + `readManifest`/`writeManifest` provide the mechanics. Filter on `status === 'tiled'`; skip `status === 'uploaded'`. |
| UPLOAD-03 | bunny.net storage footprint sanity-checked before bulk upload (expected ~1 TB; ~5× DZI overhead on 204 GB source) | Pre-flight walk of `tileOutputDir` for all `status: tiled` rows; sum bytes; print GB. Currently 3,510 tiled rows = 447,723 files = 3.2 GB on local disk (partial corpus; full ~3,808 rows after Phase 29 completes). |
</phase_requirements>

---

## Summary

Phase 30 is a manifest-driven upload script (`scripts/upload-tiles.js`) that is structurally a direct descendant of two existing scripts: `scripts/upload-plates.js` (the HTTP PUT + curl pattern) and `scripts/tile-photos.js` (the manifest loop, `withRetry`, `logStage`, `redact`, and periodic flush). There are no new npm packages to install and no new architectural patterns to discover — the phase is an integration of already-proven pieces.

The current state of the local machine: `var/tiles/` has 3,547 DZI pairs across 1,153 species directories, totaling 3.2 GB and 447,723 files. The manifest shows 3,510 rows with `status: tiled` (1,450 rows remain at `status: discovered` pending Phase 29 completion). The full run will upload roughly 3,808 rows to bunny.net Storage Zone `pnwmoths` at path `species-tiles/{slug}/{specimen_id}-{view}/`. At ~92 files per tile directory × 3,808 rows = ~350,000 file PUTs plus 3,808 `.dzi` descriptor PUTs.

All execution happens on this laptop. Default tile output dir is `var/tiles` (relative to repo root, per `scripts/tile-config.json`). The `TILE_OUTPUT_DIR` env var overrides this for non-default locations.

The key implementation decisions are all locked (D-01 through D-04, L-01 through L-08). The planner's job is to lay out three deliverables: the upload script, the storage footprint pre-flight logic (built into the main script), and the operator runbook `_instructions/UPLOADING_TILES.md`.

**Primary recommendation:** Implement `scripts/upload-tiles.js` by compositing the walk/PUT/retry loop from `upload-plates.js` with the manifest filter/flush/logStage/redact pattern from `tile-photos.js`. Mirror the `BUNNY_STORAGE_HOST`/`BUNNY_ZONE`/`BUNNY_API_KEY` env shape. Add pre-flight footprint walk before the upload loop. Add tile deletion after advancing status. Wire `photos:upload` npm alias. Write the runbook.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Tile upload (HTTP PUT) | Pipeline script (Node.js CLI) | bunny.net Storage API | The script is the active agent; bunny.net is the passive receiver |
| Manifest state management | Pipeline script | CSV on disk | `lib/manifest.js` handles all I/O; script calls `advanceStatus` |
| Storage footprint measurement | Pipeline script (startup) | — | Walk is local filesystem; no external call needed |
| Tile directory deletion | Pipeline script (post-upload) | OS filesystem | Immediately after row advances to `uploaded` (D-03) |
| CDN path derivation | Pipeline script | — | `tilePrefix()` convention already established in Phase 29; reuse the same `.toLowerCase()` logic |
| URL verification (runbook spot-check) | Operator (manual) | CDN Pull Zone | Script does not auto-check; runbook documents `curl -I` step per ROADMAP SC-4 |

---

## Standard Stack

### Core (all already in package.json or Node.js built-ins)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:fs/promises` (built-in) | Node 24 | `readdir`, `unlink`, `rm`, `stat` | Used in upload-plates.js and tile-photos.js [VERIFIED: codebase] |
| `node:fs` (built-in) | Node 24 | `existsSync` | Used throughout the pipeline [VERIFIED: codebase] |
| `node:path` (built-in) | Node 24 | `join`, `resolve`, `relative`, `dirname` | Used throughout the pipeline [VERIFIED: codebase] |
| `node:child_process` (built-in) | Node 24 | `execFileSync('curl', args)` | Phase 13 + Phase 18 locked pattern for bunny.net PUT [VERIFIED: codebase] |
| `csv-parse` (existing dep) | ^6.2.1 | Manifest CSV parsing (via `lib/manifest.js`) | Already in package.json; Phase 26 locked [VERIFIED: package.json] |
| `csv-stringify` (existing dep) | ^6.x | Manifest CSV writing (via `lib/manifest.js`) | Already in package.json; Phase 26 locked [VERIFIED: package.json] |

**No new packages are required.** [VERIFIED: codebase grep] The script imports only Node.js built-ins and `scripts/lib/manifest.js`.

### Supporting Tools (environment, not npm)

| Tool | Version | Purpose | Availability |
|------|---------|---------|-------------|
| `curl` | 8.7.1 | HTTP PUT to bunny.net Storage | Available [VERIFIED: `curl --version`] |
| `node` | v24.15.0 | Script runtime | Available, matches `.nvmrc` [VERIFIED: `node --version`] |

---

## Package Legitimacy Audit

Phase 30 installs **no new npm packages**. All dependencies are either Node.js built-ins or already present in `package.json` from prior phases. This section is not applicable.

---

## Architecture Patterns

### System Architecture Diagram

```
  Manifest CSV (data/species-photos-manifest.csv)
          │
          ▼
    Filter rows where status === 'tiled'
          │
          ▼ (tiledRows)
    Pre-flight walk:
      For each row → walk {tileOutputDir}/{slug}/{id}-{view}_files/
                       + stat {tileOutputDir}/{slug}/{id}-{view}.dzi
                       → sum bytes → print GB to stdout
          │
          ▼ (continues unconditionally; operator may Ctrl-C after pre-flight)
    For each row in tiledRows:
          │
          ├──► walk {slug}/{id}-{view}_files/**  → file list
          ├──► PUT {slug}/{id}-{view}.dzi         ─┐
          ├──► PUT each file in _files/**          ┘ via execFileSync('curl', argsArray)
          │         wrapped in withRetry (5 attempts, 2s/4s/8s/16s/32s)
          │         non-retriable 4xx → bail immediately (L-05)
          │
          ├──► advanceStatus(row, 'uploaded')
          ├──► logStage(content_hash, 'upload', 'ok', ...)
          ├──► rm -rf {tileOutputDir}/{slug}/{id}-{view}_files/
          ├──► unlink {tileOutputDir}/{slug}/{id}-{view}.dzi
          │
          └──► Every 25 rows: writeManifest(MANIFEST_PATH, rows)
               Finally: writeManifest always (try/finally)

  Storage Zone target (bunny.net):
    PUT https://la.storage.bunnycdn.com/pnwmoths/species-tiles/{slug}/{id}-{view}.dzi
    PUT https://la.storage.bunnycdn.com/pnwmoths/species-tiles/{slug}/{id}-{view}_files/{level}/{col}-{row}.webp

  CDN Pull Zone (verification — read-only):
    GET https://pnwmoths.b-cdn.net/species-tiles/{slug}/{id}-{view}.dzi
```

### Recommended Project Structure

```
scripts/
├── upload-tiles.js          # Phase 30 deliverable (new)
├── upload-plates.js         # Prior art template (Phase 18)
├── tile-photos.js           # withRetry / logStage / redact source (Phase 29)
├── tile-config.json         # tileOutputDir default (var/tiles)
└── lib/
    └── manifest.js          # readManifest / writeManifest / advanceStatus
_instructions/
├── UPLOADING_TILES.md       # Phase 30 operator runbook (new)
└── UPLOADING_IMAGES.md      # Phase 13 runbook (section structure to mirror)
```

### Pattern 1: curl PUT via execFileSync (Phase 13/18 locked pattern)

**What:** Individual file upload to bunny.net Storage using curl as a subprocess. Arguments passed as an array — never a shell string.

**When to use:** Every file PUT in the upload loop.

```javascript
// Source: scripts/upload-plates.js (Phase 18)
const args = [
  '-s', '-S', '-f',
  '-X', 'PUT',
  '-H', `AccessKey: ${BUNNY_API_KEY}`,
  '-H', 'Content-Type: application/octet-stream',
  '--data-binary', `@${localPath}`,
  url,
];
execFileSync('curl', args, { stdio: ['pipe', 'pipe', 'inherit'] });
```

**URL construction for upload-tiles.js:**
```javascript
// Storage Zone PUT URL (not Pull Zone)
const slug = row.species_slug.toLowerCase();  // L-08: unconditional lowercase
const pairSegment = `${row.specimen_id}-${row.view}`;
// For .dzi file:
const dziStorageUrl = `https://${BUNNY_STORAGE_HOST}/${BUNNY_ZONE}/species-tiles/${slug}/${pairSegment}.dzi`;
// For tile files (rel is relative path within _files/ dir):
const tileStorageUrl = `https://${BUNNY_STORAGE_HOST}/${BUNNY_ZONE}/species-tiles/${slug}/${pairSegment}_files/${rel}`;
```

**Critical flags:**
- `-f` causes curl to exit non-zero on HTTP errors, triggering withRetry
- `-s -S` suppresses progress but shows errors on stderr
- Array args: handles any special characters in file paths correctly

### Pattern 2: withRetry (Phase 26/29 locked pattern — use this version, not upload-plates.js)

**What:** Five-attempt exponential backoff. Non-retriable 4xx errors short-circuit immediately (Phase 29 fix). Use the `tile-photos.js` version, not the linear-backoff version in `upload-plates.js`.

**When to use:** Wrap every `execFileSync('curl', ...)` call.

```javascript
// Source: scripts/tile-photos.js (Phase 29) — copy verbatim
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(fn, label) {
  const delays = [2000, 4000, 8000, 16000, 32000];
  for (let attempt = 0; attempt < delays.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const safeMsg = redact(err.message ?? String(err));
      if (err.retriable === false) {
        throw new Error(`${label} failed (non-retriable): ${safeMsg}`);
      }
      if (attempt === delays.length - 1) {
        throw new Error(`${label} failed after ${delays.length} attempts: ${safeMsg}`);
      }
      console.log(
        `[upload-tiles] transient error on ${label} (attempt ${attempt + 1}/${delays.length}) — retrying in ${delays[attempt] / 1000}s: ${safeMsg}`
      );
      await sleep(delays[attempt]);
    }
  }
}
```

**Important:** `execFileSync` is synchronous. To use with `withRetry`, wrap it: `await withRetry(() => execFileSync('curl', args, opts), label)`. `withRetry` expects an async-compatible function that throws on failure.

### Pattern 3: redact (Phase 13/26/29 mandatory pattern)

**What:** Replace BUNNY_API_KEY in error messages before logging or throwing.

```javascript
// Source: scripts/tile-photos.js (adapted from ingest-photos.js) — copy verbatim
function redact(msg) {
  return BUNNY_API_KEY
    ? msg.replace(new RegExp(BUNNY_API_KEY, 'g'), '[REDACTED]')
    : msg;
}
```

**Mandatory edge case guard:** When BUNNY_API_KEY is empty string, `new RegExp('', 'g')` matches every position and corrupts the message. The ternary guard `BUNNY_API_KEY ? ... : msg` is required.

### Pattern 4: logStage (Phase 26/29 locked pattern)

**What:** Structured per-row log line with ISO timestamp, 12-char content_hash prefix (padded), 16-char action field, outcome, optional extra context.

```javascript
// Source: scripts/tile-photos.js — copy verbatim
function logStage(content_hash, action, outcome, extra = '') {
  const hashPrefix = (content_hash ?? '').slice(0, 12).padEnd(12);
  const actionField = String(action).padEnd(16);
  console.log(
    `${new Date().toISOString()} ${hashPrefix} ${actionField} ${outcome}${extra ? '  ' + extra : ''}`
  );
}
```

**For upload-tiles.js:** action = `'upload'`; outcomes: `'ok'` / `'failed'`.

### Pattern 5: Pre-flight footprint walk

**What:** Walk `tileOutputDir` for all `status: tiled` rows before the first upload. Sum file sizes. Print total GB and an extrapolated full-run estimate when not all tiles are on disk yet.

**When to use:** At startup, before any upload attempt. Always runs (D-04).

```javascript
// Measure total on-disk bytes for all tiled rows
let totalBytes = 0;
let measuredRows = 0;
for (const row of tiledRows) {
  const prefix = join(tileOutputDir, row.species_slug.toLowerCase(), `${row.specimen_id}-${row.view}`);
  // .dzi descriptor
  if (existsSync(`${prefix}.dzi`)) {
    totalBytes += statSync(`${prefix}.dzi`).size;
  }
  // _files/ directory tree
  const filesDir = `${prefix}_files`;
  if (existsSync(filesDir)) {
    for (const f of walkSync(filesDir)) {  // synchronous recursive walk
      totalBytes += statSync(f).size;
    }
    measuredRows++;
  }
}
const avgBytesPerRow = measuredRows > 0 ? totalBytes / measuredRows : 0;
console.log(`[upload-tiles] Pre-flight footprint check:`);
console.log(`  ${tiledRows.length} rows with status=tiled`);
console.log(`  Tile output dir: ${tileOutputDir}`);
console.log(`  Total on-disk size: ${(totalBytes / 1e9).toFixed(1)} GB (measured)`);
if (measuredRows < tiledRows.length) {
  const estimated = avgBytesPerRow * tiledRows.length;
  console.log(`  Estimated full-run size (extrapolated): ~${(estimated / 1e9).toFixed(1)} GB (${tiledRows.length} rows × avg ${(avgBytesPerRow / 1e6).toFixed(0)} MB/dir)`);
}
console.log(`Proceeding with upload...`);
```

**Performance note:** Walking ~447k files with `statSync` per file will take 30–90 seconds on macOS APFS. This is acceptable for an always-on pre-flight (once per run). No optimization needed for Phase 30.

### Pattern 6: Tile deletion after successful upload (D-03)

**What:** After `advanceStatus(row, 'uploaded')`, delete the tile directory and `.dzi` descriptor. Use `fs/promises.rm` with `{ recursive: true, force: true }` for the directory; `fs/promises.unlink` for the `.dzi` file.

```javascript
// D-03: unconditional, immediate deletion after status advance
const prefix = join(tileOutputDir, row.species_slug.toLowerCase(), `${row.specimen_id}-${row.view}`);
await rm(`${prefix}_files`, { recursive: true, force: true });
await unlink(`${prefix}.dzi`);
```

**Order within a row:** upload all files → `advanceStatus(row, 'uploaded')` → delete tiles. The deletion comes after the status advance. The periodic manifest write (every 25 rows) then persists the `uploaded` status so a restart will skip this row.

**`force: true` rationale:** If the `_files/` directory was already partially deleted in a prior crash, `{ force: true }` prevents ENOENT from crashing the cleanup step.

### Pattern 7: walk() helper

**What:** Recursive directory walk returning all file paths as an array. Already in `upload-plates.js` (async). Phase 30 reuses the async version for the upload loop; a synchronous version is needed for the pre-flight statSync walk.

```javascript
// Source: scripts/upload-plates.js — copy verbatim for async upload loop
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else {
      files.push(full);
    }
  }
  return files;
}
```

For the pre-flight synchronous walk, use `readdirSync` with the same recursive pattern, or use the async `walk()` with a top-level `await` since `main()` is already async.

### Anti-Patterns to Avoid

- **Shell string in execFileSync:** `execFileSync('curl ' + url)` — never. Always pass argv array. The array form handles any path characters correctly and prevents shell injection.
- **Logging BUNNY_API_KEY in error messages:** Always apply `redact()` before any `console.error`, `throw new Error(...)`, or `logStage(..., 'failed', msg)`. Never build a log string with BUNNY_API_KEY concatenated in.
- **Deleting tiles before upload is confirmed:** Tile deletion happens inside the per-row success path only — never inside the `withRetry` loop, and never before `advanceStatus`.
- **Using Pull Zone URL for PUT:** `https://pnwmoths.b-cdn.net/...` is a read-only CDN. PUTs must go to `https://la.storage.bunnycdn.com/pnwmoths/...` (Storage Zone).
- **Mixed-case slugs in storage path:** `row.species_slug.toLowerCase()` is mandatory on every path join. Failing this breaks Phase 31's CDN URL construction which always lowercases.
- **DRY_RUN=1 that writes manifest or deletes tiles:** DRY_RUN must exit after printing upload plans — no curl calls, no manifest writes, no deletions.
- **Importing helpers from tile-photos.js:** The project pattern is self-contained per-script files. Copy `withRetry`, `redact`, and `logStage` verbatim into `upload-tiles.js`. Do not `import` them from `tile-photos.js`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSV manifest I/O | Custom CSV parser | `scripts/lib/manifest.js` `readManifest`/`writeManifest` | Phase 26 locked; handles column ordering and CSV quoting edge cases |
| Status advancement | Direct `row.status = 'uploaded'` | `advanceStatus(row, 'uploaded')` | Clears `last_error` correctly; type-checked; Phase 26 locked |
| HTTP PUT retry | Custom retry loop | `withRetry` copied from `tile-photos.js` | Non-retriable 4xx support already implemented in Phase 29 fix |
| Secret redaction | Ad-hoc `.replace` | `redact()` copied from `tile-photos.js` | Empty-string guard required; Phase 13 mandatory pattern |
| Recursive file walk | `readdirSync` loops | `walk()` from `upload-plates.js` | Handles deep DZI subdirectory trees correctly; async for upload, sync for pre-flight |

**Key insight:** This phase assembles existing, tested components. Every non-trivial operation has a prior-art implementation in the codebase. The planner should never propose building something from scratch that exists in `upload-plates.js` or `tile-photos.js`.

---

## Common Pitfalls

### Pitfall 1: Tile deletion before manifest flush commits the `uploaded` status
**What goes wrong:** Script uploads a directory, calls `advanceStatus(row, 'uploaded')`, immediately deletes the tile directory, then crashes before the next periodic manifest write (every 25 rows). On restart, the row is still `status: tiled` (in-memory advance was not flushed) but the tile directory is gone. The script tries to upload a missing directory.
**Why it happens:** The flush interval (25 rows) creates a window where in-memory state diverges from disk state.
**How to avoid:** The upload-then-delete ordering is correct per D-03. Accept the small window for rows between flushes. On restart, the script will detect missing tile directories and fail that row gracefully (ENOENT caught by withRetry, marked `status: failed`). The operator can re-tile those rows with Phase 29 before re-running Phase 30. This is the correct tradeoff per D-02/D-03.
**Warning signs:** After a crash, `status: failed` rows with ENOENT errors in `last_error` column of the manifest.

### Pitfall 2: Mixed-case slug in CDN storage path
**What goes wrong:** Tiles uploaded to `species-tiles/Abagrotis-apposita/A-D/` (mixed case) instead of `species-tiles/abagrotis-apposita/A-D/`. Phase 31 and the OSD viewer will construct lowercase URLs — the tiles 404.
**Why it happens:** Forgetting `.toLowerCase()` on `row.species_slug` when constructing the storage path.
**How to avoid:** L-08 requires unconditional lowercase. Use `row.species_slug.toLowerCase()` in every path join, matching `tilePrefix()` in `tile-photos.js`.
**Warning signs:** DRY_RUN output shows uppercase letters in species slug segment of the CDN URL.

### Pitfall 3: Uploading to Pull Zone URL instead of Storage Zone URL
**What goes wrong:** PUT request goes to `https://pnwmoths.b-cdn.net/...` (Pull Zone) instead of `https://la.storage.bunnycdn.com/pnwmoths/...` (Storage Zone). bunny.net returns a 4xx or 405 error.
**Why it happens:** Copy-paste error from a CDN verification URL.
**How to avoid:** `BUNNY_STORAGE_HOST` defaults to `la.storage.bunnycdn.com`; `BUNNY_ZONE` defaults to `pnwmoths`. Build the storage URL as `https://${BUNNY_STORAGE_HOST}/${BUNNY_ZONE}/species-tiles/...`. The Pull Zone URL (`https://pnwmoths.b-cdn.net/...`) is only for the runbook's post-upload verification step.
**Warning signs:** Every PUT fails immediately with 4xx; no files visible in bunny.net Storage dashboard.

### Pitfall 4: DRY_RUN printing Storage URLs instead of Pull Zone URLs
**What goes wrong:** DRY_RUN output shows Storage Zone URLs, making it hard for the operator to manually verify tile resolution by copy-pasting URLs into a browser.
**Why it happens:** Using `BUNNY_STORAGE_HOST` in DRY_RUN output.
**How to avoid:** Per `code_context` note in CONTEXT.md — DRY_RUN prints Pull Zone URLs (`https://pnwmoths.b-cdn.net/species-tiles/...`). The actual upload loop uses Storage Zone URLs. These are different code paths.

### Pitfall 5: pre-flight walk timing on large corpus
**What goes wrong:** Pre-flight walk of 447k files with `statSync` per file takes 90+ seconds, and the operator thinks the script is hung.
**Why it happens:** macOS APFS metadata reads for large directory trees are slow.
**How to avoid:** Log a message before starting the pre-flight walk: `[upload-tiles] Pre-flight: measuring tile corpus size (this may take 30–90s)...`. The operator knows to wait.
**Warning signs:** No output for over 1 minute after script start.

### Pitfall 6: BUNNY_API_KEY guard missing from DRY_RUN path
**What goes wrong:** Script exits with an error about missing BUNNY_API_KEY even when running `DRY_RUN=1` to preview what would be uploaded.
**Why it happens:** The API key guard runs before the DRY_RUN check.
**How to avoid:** Put the DRY_RUN early-exit path before the `if (!DRY_RUN && !BUNNY_API_KEY)` guard — same pattern as `upload-plates.js` and `tile-photos.js`.

---

## Code Examples

### DRY_RUN output format (L-03 and CONTEXT.md specifics)
```
[upload-tiles] DRY_RUN=1 — printing first 5 upload plans, not uploading
  slug: abagrotis-apposita  pair: A-D
    CDN URL: https://pnwmoths.b-cdn.net/species-tiles/abagrotis-apposita/A-D/
    Files to upload: 87 (86 tiles + 1 .dzi)
  slug: abagrotis-apposita  pair: A-V
    CDN URL: https://pnwmoths.b-cdn.net/species-tiles/abagrotis-apposita/A-V/
    Files to upload: 87 (86 tiles + 1 .dzi)
  ... (3806 more)
```

### Pre-flight output format (D-04 and CONTEXT.md specifics)
```
[upload-tiles] Pre-flight: measuring tile corpus size (this may take 30-90s)...
[upload-tiles] Pre-flight footprint check:
  3808 rows with status=tiled
  Tile output dir: /Users/rainhead/dev/pnwmoths/var/tiles
  Total on-disk size: 3.2 GB (measured)
  Estimated full-run size (extrapolated): ~1.1 TB (3808 rows x avg 0.28 GB/dir)
Proceeding with upload...
```

### logStage output for upload phase
```
2026-05-23T18:00:00.000Z e6f226797116 upload           ok  abagrotis-apposita/A-D  87 files
2026-05-23T18:00:05.000Z f7a337898227 upload           failed  abagrotis-apposita/A-V  PUT failed after 5 attempts: ...
```

### Progress summary (every 25 rows, and at end)
```
[upload-tiles] 25/3808
[upload-tiles] 50/3808
...
[upload-tiles] summary:
  uploaded (new):              3750
  skipped (already uploaded):    58
  failed (per-row errors):        0
  total eligible rows:          3808
[upload-tiles] wrote data/species-photos-manifest.csv
```

### CDN spot-check command (from runbook, ROADMAP SC-4)
```bash
# After first 5 rows upload, verify tile resolution via Pull Zone
curl -I https://pnwmoths.b-cdn.net/species-tiles/abagrotis-apposita/A-D.dzi
# Expected: HTTP/2 200, Content-Type: application/xml or text/xml
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `upload-plates.js` progress file (`.upload-plates-progress`) | Manifest CSV as pipeline state | Phase 26 (v2.2) | Manifest is the single source of truth for all pipeline stages |
| Upload-plates linear retry (`attempts * 2000ms`) | `withRetry` exponential (2s/4s/8s/16s/32s) + non-retriable 4xx bail | Phase 29 fix | Permanent 4xx errors no longer waste 5 × retry budget; immediate bail on bad API key |
| Mixed-case CDN paths | Unconditional `.toLowerCase()` on species_slug | Phase 28 pilot lesson | Phase 28 discovered mixed-case slug in TIFF filenames; fixed in `tilePrefix()` (Phase 29); Phase 30 replicates this pattern |

**Deprecated patterns for Phase 30:**
- `.upload-plates-progress` sidecar file: Phase 30 uses manifest `status: uploaded`, not a sidecar
- Linear retry backoff from `upload-plates.js`: Use the Phase 29 `withRetry` exponential pattern (non-retriable 4xx support is required by L-05)

---

## Runtime State Inventory

> Not a rename/refactor/migration phase. Included because Phase 30 reads local filesystem state (`var/tiles/`) and writes to an external service.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `data/species-photos-manifest.csv`: 3,510 rows `status: tiled`, 1,450 rows `status: discovered` [VERIFIED: grep + awk] | Script reads and updates this file in place; no pre-run edit needed |
| Live service config | bunny.net Storage Zone `pnwmoths` at `la.storage.bunnycdn.com` — `species-tiles/` prefix is new (Phase 28 pilot may have written one species; no conflict) [ASSUMED] | No config change needed; operator retrieves Storage Zone password (BUNNY_API_KEY) from bunny.net dashboard |
| OS-registered state | None | — |
| Secrets/env vars | `BUNNY_API_KEY` — Storage Zone password from bunny.net dashboard. Not in `.env`, not in git. Passed at invocation. | Operator obtains before run; same credential used in Phase 18 `upload-plates.js` |
| Build artifacts | `var/tiles/` — 3,547 DZI pairs, 447,723 files, 3.2 GB. Gitignored (`var/` in `.gitignore` [VERIFIED]). Script deletes each pair after successful upload (D-03). | Script handles deletion; no manual cleanup before run |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `curl` | HTTP PUT to bunny.net | ✓ | 8.7.1 | — |
| `node` | Script runtime | ✓ | v24.15.0 (matches `.nvmrc: 24`) | — |
| `var/tiles/` tile corpus | Upload source | ✓ | 3.2 GB / 447k files | Run Phase 29 first |
| `data/species-photos-manifest.csv` | Row enumeration | ✓ | 4,935 rows | — |
| `BUNNY_API_KEY` env var | bunny.net auth | Must be provided at invocation | — | Obtain from bunny.net dashboard → Storage Zone → Password |
| bunny.net Storage Zone `pnwmoths` | Upload target | [ASSUMED] exists from Phase 13 | — | — |

**Missing dependencies with no fallback:** None — all verified as available or known to be operator-provided at invocation.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner (`node:test` + `node:assert/strict`) |
| Config file | None — test files enumerated in `package.json` `"test"` script |
| Quick run command | `node --test scripts/upload-tiles.test.js` |
| Full suite command | `npm test` |

Current test baseline: 182/182 passing [VERIFIED: `npm test` output].

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UPLOAD-01 | `tileUploadPath(tileOutputDir, row)` returns correct Storage Zone path with lowercase slug | unit | `node --test scripts/upload-tiles.test.js` | ❌ Wave 0 |
| UPLOAD-01 | `tilePullZoneUrl(row)` returns correct Pull Zone URL for DRY_RUN output | unit | `node --test scripts/upload-tiles.test.js` | ❌ Wave 0 |
| UPLOAD-01 | Mixed-case `species_slug` is lowercased unconditionally in path output | unit | `node --test scripts/upload-tiles.test.js` | ❌ Wave 0 |
| UPLOAD-01 | Accession specimen IDs (`WWUC0000003275`) are preserved in pair segment | unit | `node --test scripts/upload-tiles.test.js` | ❌ Wave 0 |
| UPLOAD-02 | `isUploadable(row)` returns `true` for `status: tiled` | unit | `node --test scripts/upload-tiles.test.js` | ❌ Wave 0 |
| UPLOAD-02 | `isUploadable(row)` returns `false` for `status: uploaded` (idempotency) | unit | `node --test scripts/upload-tiles.test.js` | ❌ Wave 0 |
| UPLOAD-02 | `isUploadable(row)` returns `false` for `status: discovered` / `failed` / other | unit | `node --test scripts/upload-tiles.test.js` | ❌ Wave 0 |
| DRY_RUN (L-03) | DRY_RUN=1 prints plans using Pull Zone URLs, not Storage URLs | manual | `DRY_RUN=1 npm run photos:upload` | — |
| L-04 | API key redacted in all error messages | manual + code review | inspect `redact()` usage | — |
| Runbook | `_instructions/UPLOADING_TILES.md` covers all required sections | manual | open and read | — |

**What is NOT automatically testable:**
- Actual bunny.net upload (requires live BUNNY_API_KEY and network)
- Tile deletion after upload (requires live run or complex filesystem mock)
- Pre-flight footprint accuracy (requires `var/tiles/` corpus)
- CDN Pull Zone tile resolution (requires uploaded tiles)

### Exported functions for testability

Following the `tilePrefix` / `isAlreadyTiled` / `isTileable` export pattern from `tile-photos.js`, `upload-tiles.js` must export at module level (not inside `main()`):

- `tileUploadPath(tileOutputDir, row)` → the on-disk prefix path, same as `tilePrefix()` in tile-photos.js
- `tilePullZoneUrl(row)` → the Pull Zone URL for DRY_RUN output (uses `CDN_BASE_URL = 'https://pnwmoths.b-cdn.net'`)
- `isUploadable(row)` → `boolean`: `row.status === 'tiled'`

These three exports + the row factory pattern from `tile-photos.test.js` provide complete testability of the path construction and eligibility logic without network calls.

### Sampling Rate

- **Per task commit:** `node --test scripts/upload-tiles.test.js`
- **Per wave merge:** `npm test` (full 182+ suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `scripts/upload-tiles.test.js` — covers UPLOAD-01, UPLOAD-02, slug lowercasing, `isUploadable` filter; model on `scripts/tile-photos.test.js`
- [ ] `scripts/upload-tiles.js` must export `tileUploadPath`, `tilePullZoneUrl`, `isUploadable` at module level

*(No new test infrastructure needed — existing `node:test` + `node:assert/strict` pattern is established)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | — |
| V3 Session Management | No | — |
| V4 Access Control | No | — |
| V5 Input Validation | Yes (indirect) | `species_slug.toLowerCase()` applied to CDN paths; `execFileSync` array args prevent shell injection |
| V6 Cryptography | No | — |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| API key leakage in logs | Information Disclosure | `redact()` applied to all error messages before any log/throw; BUNNY_API_KEY never concatenated directly into log strings |
| Shell injection via file path in curl args | Tampering | `execFileSync('curl', argsArray)` — array form prevents shell expansion; project-established mandatory pattern |
| Path traversal via species_slug in CDN path | Tampering | `.toLowerCase()` applied; `species_slug` is machine-generated in Phase 26 ingest (no user-supplied input) |

---

## Open Questions

1. **bunny.net `species-tiles/` prefix — implicit creation or pre-creation needed?**
   - What we know: Phase 18 uploaded to `plates/` path without pre-creating it. bunny.net Storage is object-storage-style.
   - What's unclear: Whether PUTting to a new prefix on the first upload is sufficient, or whether a placeholder object or directory must be created first.
   - Recommendation: S3-compatible object stores create paths implicitly on first PUT. [ASSUMED] The runbook should note that the operator verifies the first upload appears correctly in the bunny.net dashboard before proceeding with the full bulk run.

2. **Non-retriable 4xx detection from curl exit status**
   - What we know: `tile-photos.js withRetry` checks `err.retriable === false`. For Dropbox, `downloadSharedFile` sets this flag on non-429 4xx responses. For bunny.net via `execFileSync('curl', ...)`, the exit code is non-zero on any HTTP error (curl's `-f` flag) but the exact HTTP status is not available in the Error object.
   - What's unclear: Whether the implementation should parse curl stderr for HTTP status codes to enable non-retriable 4xx bail, or accept that a bad API key will exhaust all 5 retry attempts (62 seconds total) before failing the first row.
   - Recommendation: For Phase 30, accept that 4xx errors exhaust retries. A bad API key will be caught immediately after the first row fails with 5 × retry delays — the operator will see the failure within 62 seconds and can stop the run. More sophisticated detection can be added later. [ASSUMED]

3. **Concurrent Phase 29 tiling and Phase 30 uploading**
   - What we know: 1,450 rows remain at `status: discovered` (pending Phase 29). Phase 29 must run first to produce tiles. Disk: `var/tiles/` is gitignored on this laptop with sufficient free space (3.2 GB used currently).
   - What's unclear: Whether the operator will run Phase 29 to completion before starting Phase 30, or in a streaming interleaved manner.
   - Recommendation: The runbook should recommend completing Phase 29 first, then running Phase 30. The streaming model is theoretically supported (Phase 29 writes tiles while Phase 30 uploads and deletes them) but adds operational complexity. Sequential is simpler and safer for a first bulk run. [ASSUMED]

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | bunny.net Storage Zone `pnwmoths` exists and the Phase 18 BUNNY_API_KEY credential works for the `species-tiles/` prefix | Environment Availability | Upload loop fails on first PUT; operator must re-provision credentials |
| A2 | bunny.net PUT to a new path prefix creates it implicitly (no pre-creation step needed) | Open Questions | First PUT returns 404 or 403; operator must create prefix in bunny.net dashboard or contact support |
| A3 | 4xx curl failures will exhaust all 5 retries (62s total) when they occur; immediate 4xx bail not required for Phase 30 | Open Questions | Bad API key wastes 62s before failing first row; acceptable for a one-time bulk run |
| A4 | Phase 28 pilot may have left one species under `species-tiles/` in the Storage Zone; this does not cause conflicts | Runtime State Inventory | Minor: one species has duplicate tiles after Phase 30; no functional impact |
| A5 | Running Phase 29 to completion before Phase 30 is the recommended operator workflow | Open Questions | Operator starts Phase 30 while Phase 29 is in progress; script processes only `status: tiled` rows so partial corpus is fine — but concurrent disk writes and deletes add risk |

**If this table is empty:** All claims were verified. It is not empty — A1 through A5 require user confirmation before the bulk run.

---

## Sources

### Primary (HIGH confidence)
- `scripts/upload-plates.js` — curl PUT pattern, walk helper, DRY_RUN guard, BUNNY env vars [VERIFIED: codebase read]
- `scripts/tile-photos.js` — withRetry, redact, logStage, manifest loop, periodic flush, isTileable pattern [VERIFIED: codebase read]
- `scripts/lib/manifest.js` — readManifest, writeManifest, advanceStatus, COLUMNS [VERIFIED: codebase read]
- `scripts/tile-config.json` — tileOutputDir default (`var/tiles`) [VERIFIED: codebase read]
- `eleventy.config.js` — CDN_BASE_URL = `https://pnwmoths.b-cdn.net` [VERIFIED: grep]
- `data/species-photos-manifest.csv` — 4,935 rows; 3,510 `status: tiled`; 1,450 `status: discovered` [VERIFIED: grep + awk]
- `var/tiles/` filesystem — 3,547 DZI pairs, 447,723 files, 3.2 GB, 1,153 species dirs [VERIFIED: find + du]
- `scripts/tile-photos.test.js` — test pattern: describe/it blocks, row factory, exported function tests [VERIFIED: codebase read]
- `.planning/phases/29-dzi-tile-generation-pipeline-bulk/29-03-SUMMARY.md` — Phase 29 handoff, dry-run output, slug lowercasing confirmation [VERIFIED: file read]
- `_instructions/TILING_HIGH_RES_PHOTOS.md` — runbook structure and tone to mirror [VERIFIED: file read]
- `_instructions/UPLOADING_IMAGES.md` — Phase 13 runbook structure [VERIFIED: file read]
- `.planning/phases/30-bunny-net-upload-of-tile-pyramids-bulk/30-CONTEXT.md` — all locked decisions D-01 through L-08, Claude's Discretion, Deferred Ideas [VERIFIED: file read]
- `package.json` — existing `photos:ingest`/`photos:tile` npm alias pattern; existing test command structure [VERIFIED: grep]
- `.gitignore` — `var/` confirmed gitignored [VERIFIED: grep]

### Secondary (MEDIUM confidence)
- bunny.net Storage Zone HTTP PUT behavior (idempotent, path-creates-implicitly) — [ASSUMED] consistent with Phase 13/18 behavior and S3-compatible object store conventions; not re-verified against current bunny.net docs

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all dependencies verified in codebase
- Architecture: HIGH — two prior-art scripts provide exact implementation patterns; confirmed by Phase 29 dry-run output
- Pitfalls: HIGH — derived from actual Phase 28/29 lessons documented in 29-03-SUMMARY.md and CONTEXT.md
- Validation: HIGH — follows established node:test pattern from tile-photos.test.js
- bunny.net API behavior: MEDIUM — consistent with prior phases but not re-verified against current bunny.net documentation

**Research date:** 2026-05-23
**Valid until:** 2026-07-23 (stable domain; bunny.net API patterns from Phase 13/18 are well-established)
