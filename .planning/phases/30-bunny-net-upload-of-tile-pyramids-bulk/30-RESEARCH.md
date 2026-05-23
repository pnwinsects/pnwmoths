# Phase 30: bunny.net Upload of Tile Pyramids (bulk) - Research

**Researched:** 2026-05-23
**Domain:** bunny.net Storage HTTP PUT, Node.js manifest pipeline, DZI tile upload
**Confidence:** HIGH — every design decision is locked in CONTEXT.md with explicit decisions; all implementation patterns are extracted directly from the repo's existing scripts.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01 (serial uploads):** `upload-tiles.js` uploads files one at a time using `execFileSync('curl', ...)` — same pattern as `scripts/upload-plates.js`. No concurrent PUT pool.

**D-02 (whole-directory granularity on recovery):** If the script crashes mid-directory, the manifest row stays `status: tiled`. On restart, the script re-uploads the entire directory. bunny.net PUT is idempotent.

**D-03 (immediate, unconditional deletion):** After advancing a manifest row to `status: uploaded`, the script immediately deletes the local `_files/` directory and `.dzi` file. No flag to skip deletion.

**D-04 (always-on pre-flight, size only):** At startup, before any upload, the script walks tile output directories for all `status: tiled` rows, prints total bytes in GB. No cost projection. Operator reviews and Ctrl-C if needed.

**L-01:** Script name is `scripts/upload-tiles.js`.

**L-02:** `BUNNY_API_KEY` is the only required env var at invocation; `TILE_OUTPUT_DIR` overrides tile output dir (default from `scripts/tile-config.json`).

**L-03:** `DRY_RUN=1` prints first 5 tile directory upload plans (CDN URL + file count) without uploading or modifying the manifest.

**L-04:** `BUNNY_API_KEY` is redacted in all error messages (`msg.replace(new RegExp(BUNNY_API_KEY, 'g'), '[REDACTED]')`).

**L-05:** `withRetry` (5 attempts, 2s/4s/8s/16s/32s delays) wraps each individual file PUT. Non-retriable 4xx errors (`err.retriable = false`) bail immediately.

**L-06:** `logStage(content_hash, action, outcome, extra)` for every per-row transition. Progress summary printed every 25 rows.

**L-07:** Manifest written every 25 rows.

**L-08:** URL convention is `species-tiles/{species_slug}/{specimen_id}-{view}/` with `species_slug` lowercased unconditionally.

**Cross-phase locked (Phase 26):** D-06 streaming-delete model, D-10 env-vars-at-invocation, D-13 one-script-per-stage, D-15 logStage + withRetry shape.

### Claude's Discretion

- **npm alias:** `photos:upload` (following `photos:ingest` / `photos:tile` naming convention).
- **BUNNY_STORAGE_HOST / BUNNY_ZONE env vars:** Default to `la.storage.bunnycdn.com` and `pnwmoths` respectively (same defaults as `upload-plates.js`).
- **Eligible rows filter:** Rows with `status: tiled` only. Rows with `status: uploaded` are skipped (manifest-level idempotency). Rows with other statuses are ignored.
- **Manifest commit:** Script writes the CSV but does not git-commit. Operator runs `git add data/species-photos-manifest.csv && git commit` after the run.

### Deferred Ideas (OUT OF SCOPE)

- DELETE_TILES=1 flag — rejected (D-03)
- Concurrent file PUTs — rejected (D-01)
- Per-file progress sidecar — rejected (D-02)
- Cost projection in footprint check — rejected (D-04)
- Separate `check-storage-footprint.js` script — rejected in favour of always-on pre-flight
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UPLOAD-01 | System uploads each image's tile directory to bunny.net Storage using the Phase 13 HTTP PUT pattern; URL convention `species-tiles/{species-slug}/{specimen_id}-{view}/` | `scripts/upload-plates.js` provides the exact `execFileSync('curl', args)` template; curl args array confirmed correct for bunny.net Storage API. Storage path convention confirmed in 28-03-SUMMARY.md. |
| UPLOAD-02 | Manifest tracks upload status (`status: tiled → uploaded`); reruns skip already-uploaded images | `scripts/lib/manifest.js` `advanceStatus` + `readManifest`/`writeManifest` are the standard pattern. Filter on `status === 'tiled'` at startup gives manifest-level idempotency. |
| UPLOAD-03 | bunny.net storage footprint is sanity-checked against pricing before bulk upload commits | Pre-flight walk of all `status: tiled` tile directories using `statSync`/`readdirSync` recursively; sum bytes; print GB before first upload. Operator Ctrl-C to abort. |
</phase_requirements>

---

## Summary

Phase 30 is a well-defined implementation of a manifest-driven bulk upload script. The codebase already contains a direct template (`scripts/upload-plates.js`) and all three shared helpers (`withRetry`, `redact`, `logStage`) in the already-verified `scripts/tile-photos.js`. The manifest library is stable and battle-tested across Phases 26–29.

The primary implementation challenge is accurately mapping the on-disk tile directory layout to the CDN storage path. The disk layout is `{tileOutputDir}/{slug}/{specimen_id}-{view}.dzi` + `{tileOutputDir}/{slug}/{specimen_id}-{view}_files/`, and the CDN path is `species-tiles/{slug}/{specimen_id}-{view}/{specimen_id}-{view}.dzi` and `species-tiles/{slug}/{specimen_id}-{view}/{specimen_id}-{view}_files/...`. The `tilePrefix()` function exported from `tile-photos.js` is the canonical computation; Phase 30 needs an equivalent `uploadPrefix()` or can call `tilePrefix()` directly if imported.

A subtlety discovered during investigation: vips also writes `vips-properties.xml` files inside `_files/` subdirectories (confirmed in local tile output at `var/tiles/`). The `walk()` function from `upload-plates.js` will pick these up automatically and they should be uploaded alongside the webp tiles — they are valid DZI payload files.

The deletion step (D-03) must delete `{prefix}.dzi` AND `{prefix}_files/` recursively after each successful row. Node.js `fs.rm(path, { recursive: true })` (Node 14.14+) or `fs.rmSync` is the right tool.

**Primary recommendation:** Implement `scripts/upload-tiles.js` as a direct adaptation of `scripts/upload-plates.js`, replacing progress-file tracking with manifest status tracking, adding pre-flight footprint walk, and using `tilePrefix()` (from `tile-photos.js` exports) to resolve disk paths. Copy `withRetry`, `redact`, and `logStage` verbatim from `tile-photos.js`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Manifest state management | Operator scripts | — | Flat CSV; `scripts/lib/manifest.js` owns read/write; no server tier exists |
| HTTP PUT to bunny.net Storage | Operator scripts (Node) | — | `execFileSync('curl', ...)` pattern; sync, serial; runs on datacenter server |
| Storage footprint pre-flight | Operator scripts (Node) | — | Local filesystem walk before any network calls |
| CDN path construction | Operator scripts | — | Deterministic from `species_slug`, `specimen_id`, `view`; locked to `tilePrefix()` logic |
| Tile file enumeration | Operator scripts (Node) | — | Recursive `walk()` of `{prefix}_files/` + the `.dzi` file |
| Local tile deletion | Operator scripts (Node) | — | `fs.rm({ recursive: true })` after successful row upload |
| Pull Zone CDN serving | bunny.net (external) | — | Already configured with CORS; no Phase 30 CDN config changes needed |

---

## Standard Stack

### Core (no new packages needed)

All libraries required for Phase 30 are already installed in the project.

| Library | Version | Purpose | Source |
|---------|---------|---------|--------|
| Node.js built-ins | 24.15.0 (`.nvmrc`) | `fs`, `path`, `child_process` — all I/O and exec | [VERIFIED: .nvmrc] |
| `csv-parse` | ^6.2.1 (installed) | `readManifest` in `lib/manifest.js` | [VERIFIED: package.json] |
| `csv-stringify` | ^6.7.0 (installed) | `writeManifest` in `lib/manifest.js` | [VERIFIED: package.json] |
| `curl` CLI | system (verified via upload-plates.js) | HTTP PUT to bunny.net Storage | [VERIFIED: scripts/upload-plates.js pattern confirmed in Phase 28 pilot] |

**No new npm installs required for Phase 30.**

### Reused Project Modules

| Module | Path | What Phase 30 Uses |
|--------|------|--------------------|
| `manifest.js` | `scripts/lib/manifest.js` | `readManifest`, `writeManifest`, `advanceStatus` — verbatim reuse |
| `tile-photos.js` | `scripts/tile-photos.js` | `tilePrefix()` export — disk path computation; `withRetry`, `redact`, `logStage` — copy verbatim |
| `tile-config.json` | `scripts/tile-config.json` | `tileOutputDir` default path |

---

## Package Legitimacy Audit

No new packages are being installed. All libraries are already in `package.json`. This section is not applicable.

---

## Architecture Patterns

### System Architecture Diagram

```
Manifest CSV (status=tiled rows)
    │
    ▼
[Pre-flight Walk]
    │ walks {tileOutputDir}/{slug}/{specimen_id}-{view}.dzi
    │ and {tileOutputDir}/{slug}/{specimen_id}-{view}_files/
    │ for ALL status=tiled rows → prints total GB
    ▼
DRY_RUN? → [Print first 5 CDN URL plans] → exit
    │
    ▼
[Per-row loop: filter status=tiled]
    │
    ├─ walk() on {prefix}.dzi + {prefix}_files/**
    │       │
    │       ▼
    │  [For each file: execFileSync('curl', PUT args)]
    │       │ withRetry wraps each PUT
    │       │ 4xx non-retriable → throw immediately
    │       │ 5xx/network → 5 attempts with backoff
    │       ▼
    │  logStage(content_hash, 'upload', 'ok', ...)
    │       │
    │       ▼
    │  advanceStatus(row, 'uploaded')
    │       │
    │       ▼
    │  fs.rmSync({prefix}_files/, { recursive: true })
    │  fs.unlinkSync({prefix}.dzi)
    │       │
    │       ▼
    │  rowsProcessed++ % 25 === 0 → writeManifest()
    │
    ▼
[Final writeManifest()]
[Summary: uploaded N, skipped K, failed F]
```

### Recommended Project Structure

No new directories. One new file:

```
scripts/
├── upload-tiles.js     # NEW — Phase 30 main script
└── upload-plates.js    # Reference template (Phase 18)
```

---

### Pattern 1: execFileSync curl PUT (canonical)

From `scripts/upload-plates.js` (the direct template):

```javascript
// Source: scripts/upload-plates.js:96-107
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

The `-f` flag makes curl exit non-zero on HTTP 4xx/5xx, which triggers the retry logic. `stdio: ['pipe', 'pipe', 'inherit']` suppresses curl's stdout noise while preserving stderr for error visibility.

**Phase 30 variation:** wrap in `withRetry()`. For 4xx errors, set `err.retriable = false` so `withRetry` bails immediately (same pattern as `downloadSharedFile` in Phase 29 fix).

### Pattern 2: withRetry (from tile-photos.js)

```javascript
// Source: scripts/tile-photos.js:85-107 — copy verbatim
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
      console.log(`[upload-tiles] transient error on ${label} (attempt ${attempt + 1}/${delays.length}) — retrying in ${delays[attempt] / 1000}s: ${safeMsg}`);
      await sleep(delays[attempt]);
    }
  }
}
```

### Pattern 3: logStage (from tile-photos.js)

```javascript
// Source: scripts/tile-photos.js:115-121 — copy verbatim
function logStage(content_hash, action, outcome, extra = '') {
  const hashPrefix = (content_hash ?? '').slice(0, 12).padEnd(12);
  const actionField = String(action).padEnd(16);
  console.log(
    `${new Date().toISOString()} ${hashPrefix} ${actionField} ${outcome}${extra ? '  ' + extra : ''}`
  );
}
```

### Pattern 4: redact (adapted for BUNNY_API_KEY)

```javascript
// Adapted from scripts/tile-photos.js:70-74
// IMPORTANT: guard against empty key — new RegExp('', 'g') corrupts all messages
function redact(msg) {
  return BUNNY_API_KEY
    ? msg.replace(new RegExp(BUNNY_API_KEY, 'g'), '[REDACTED]')
    : msg;
}
```

### Pattern 5: Tile Prefix / CDN Path Construction

The `tilePrefix(tileOutputDir, row)` export from `tile-photos.js` computes the disk path:

```javascript
// Source: scripts/tile-photos.js:141-143
export function tilePrefix(tileOutputDir, row) {
  return join(tileOutputDir, row.species_slug.toLowerCase(), `${row.specimen_id}-${row.view}`);
}
```

The CDN storage path for a given file is:

```
species-tiles/{slug}/{specimen_id}-{view}/{filename_relative_to_slug_dir}
```

Concretely, for `{tileOutputDir}/abagrotis-apposita/A-D.dzi`:
- Local path: `{tileOutputDir}/abagrotis-apposita/A-D.dzi`
- CDN path: `species-tiles/abagrotis-apposita/A-D/A-D.dzi`

For `{tileOutputDir}/abagrotis-apposita/A-D_files/12/0_0.webp`:
- CDN path: `species-tiles/abagrotis-apposita/A-D/A-D_files/12/0_0.webp`

The `relative()` function (from `node:path`) computing `relative(join(tileOutputDir, slug), localFile)` gives the path segment after the slug directory, which maps directly to the CDN subpath under `species-tiles/{slug}/`.

**Phase 28 pilot confirmed** (28-03-SUMMARY.md): storage path is `species-tiles/{slug}/{specimen_id}-{view}/{pair}.dzi + {pair}_files/{level}/{col}_{row}.webp` — no leading slash, no zone prefix. [VERIFIED: 28-03-SUMMARY.md]

### Pattern 6: walk() helper

From `scripts/upload-plates.js`:

```javascript
// Source: scripts/upload-plates.js:37-49
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

Phase 30 calls `walk(prefix + '_files/')` and then prepends the `.dzi` file to get all files for one pair. Note: vips also writes `vips-properties.xml` inside `_files/` directories — the `walk()` picks these up automatically and they are uploaded too (confirmed in local `var/tiles/`).

### Pattern 7: Pre-flight Footprint Walk

Walk every `status: tiled` row's tile directory using `statSync` to sum bytes:

```javascript
// Pseudocode — implement with statSync recursive walk
let totalBytes = 0;
for (const row of tiledRows) {
  const prefix = tilePrefix(tileOutputDir, row);
  const dziPath = prefix + '.dzi';
  const filesDir = prefix + '_files';
  // Sum .dzi size
  if (existsSync(dziPath)) totalBytes += statSync(dziPath).size;
  // Sum _files/ recursively
  if (existsSync(filesDir)) {
    for (const f of walkSync(filesDir)) totalBytes += statSync(f).size;
  }
}
```

Print format (from CONTEXT.md `<specifics>`):
```
[upload-tiles] Pre-flight footprint check:
  {N} rows with status=tiled
  Tile output dir: {tileOutputDir}
  Total on-disk size: {X.X} GB (measured)
  Estimated full-run size (extrapolated): ~{Y.Y} TB ({N} rows × avg {Z.Z} GB/dir)
Proceeding with upload...
```

The extrapolation line is useful when only a partial Phase 29 run has completed (streaming model: Phase 30 can run in parallel with Phase 29). Average bytes/dir = totalBytes / rowsWithTilesOnDisk.

### Pattern 8: Per-row Upload + Delete Sequence

```javascript
// Per row:
const prefix = tilePrefix(tileOutputDir, row);
const dziFile = prefix + '.dzi';
const filesDir = prefix + '_files';

// 1. Walk all files for this pair
const allFiles = [dziFile, ...(await walk(filesDir))];

// 2. Upload each file
for (const localPath of allFiles) {
  const rel = relative(join(tileOutputDir, row.species_slug.toLowerCase()), localPath);
  const cdnPath = `species-tiles/${row.species_slug.toLowerCase()}/${rel}`;
  const url = `https://${BUNNY_STORAGE_HOST}/${BUNNY_ZONE}/${cdnPath}`;
  await withRetry(async () => { ... curl PUT ... }, `upload ${rel}`);
}

// 3. Advance manifest
advanceStatus(row, 'uploaded');
logStage(row.content_hash, 'upload', 'ok', `${row.species_slug}/${row.specimen_id}-${row.view} (${allFiles.length} files)`);

// 4. Delete local tiles (D-03)
await rm(filesDir, { recursive: true, force: true });
await unlink(dziFile);
```

### Anti-Patterns to Avoid

- **Shell string to curl:** Never `execFileSync('curl', urlString)` — always pass an args array. (Required for correctness; no spaces-in-path issues.)
- **Redacting an empty key:** Guard with `if (BUNNY_API_KEY)` before the `.replace()`. An empty `RegExp('')` corrupts every error message.
- **Deleting before uploading:** Deletion is the last step per row, after `advanceStatus`. Wrong order would leave the manifest in `tiled` with no tiles to upload on retry.
- **Using `path.relative()` from the wrong base:** The relative path for CDN must be computed from `join(tileOutputDir, slug)` (i.e., the species slug directory), not from `tileOutputDir` itself, to produce `A-D/A-D.dzi` rather than `abagrotis-apposita/A-D/A-D.dzi`.
- **Importing withRetry/redact/logStage from tile-photos.js:** The project pattern is self-contained per-script files. Copy these three helpers verbatim; do not import across scripts.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSV read/write | Custom parser | `scripts/lib/manifest.js` `readManifest`/`writeManifest` | Already battle-tested; handles quoting, column order, advanceStatus mutation pattern |
| HTTP PUT to bunny.net | Custom HTTP client | `execFileSync('curl', args)` | Proven in Phase 13, 18, and 28 pilot; handles auth, binary body, and error codes reliably |
| Retry logic | Custom retry loop | Copy `withRetry` from `tile-photos.js` | Five-attempt backoff with non-retriable bail already handles bunny.net 4xx/5xx patterns |
| API key redaction | `JSON.stringify` filtering | `redact(msg)` helper | Regex-based ensures redaction in all error message paths including stack traces |
| Recursive directory delete | Manual unlink loop | `fs.rm(dir, { recursive: true, force: true })` | Node.js 14.14+ built-in; handles non-empty trees atomically |

**Key insight:** Phase 30 is fundamentally a manifest-aware port of `upload-plates.js`. Nothing should be built from scratch that `upload-plates.js` already validates.

---

## Runtime State Inventory

Phase 30 is not a rename/refactor/migration phase. However, it does interact with live CDN state.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | `data/species-photos-manifest.csv` — 2685 rows currently at `status: tiled` (verified via `grep -c ',tiled,'`); ~3808 at full Phase 29 completion | Phase 30 advances `tiled` → `uploaded` rows |
| Live service config | bunny.net Pull Zone CORS — already enabled with `access-control-allow-origin: *` and `dzi` in extension list (Phase 28 confirmed) | None — no CDN config changes needed |
| OS-registered state | None | None |
| Secrets/env vars | `BUNNY_API_KEY` — Storage Zone password; never committed; passed at invocation | Operator provides at invocation; same credential as Phase 18 |
| Build artifacts | Local tiles at `var/tiles/` (development) and `/var/lib/pnwmoths/tiles/` (datacenter) — deleted after successful upload (D-03) | No cleanup needed; deletion is part of the script |

---

## Common Pitfalls

### Pitfall 1: CDN Path Relative Base

**What goes wrong:** `path.relative(tileOutputDir, localFile)` gives `abagrotis-apposita/A-D/A-D.dzi`, but the correct CDN path under `species-tiles/{slug}/` should be `A-D/A-D.dzi`. Using the wrong base produces a double-slug CDN path like `species-tiles/abagrotis-apposita/abagrotis-apposita/A-D/A-D.dzi`.

**Why it happens:** The CDN path prefix is `species-tiles/{slug}/`, so the relative path must be computed from `{tileOutputDir}/{slug}/` (the species slug directory), not from `tileOutputDir`.

**How to avoid:** Use `relative(join(tileOutputDir, row.species_slug.toLowerCase()), localPath)` as the relative portion.

**Warning signs:** A `.dzi` URL in DRY_RUN output contains the slug twice.

### Pitfall 2: Forgetting vips-properties.xml in Walk

**What goes wrong:** Filtering the `walk()` output to only `*.webp` and `*.dzi` silently omits `vips-properties.xml` files inside `_files/` subdirectories. The CDN path becomes inconsistent with what vips produced.

**Why it happens:** These files are not mentioned in the DZI spec but are present in the actual output (confirmed in `var/tiles/condica-albolabes/A-D_files/vips-properties.xml`).

**How to avoid:** Upload all files returned by `walk()` without extension filtering.

**Warning signs:** `find var/tiles/ -type f ! -name "*.webp" ! -name "*.dzi"` returns results.

### Pitfall 3: Delete Before Advance

**What goes wrong:** Deleting tiles before calling `advanceStatus(row, 'uploaded')` leaves the manifest at `tiled` with no local tiles. On the next run, the script tries to upload the pair again but finds no files on disk — crashing or silently skipping.

**Why it happens:** Natural code ordering mistake.

**How to avoid:** Strict ordering: (1) upload all files, (2) `advanceStatus`, (3) `logStage`, (4) `writeManifest` checkpoint, (5) `rm/unlink`.

**Warning signs:** Rows stuck at `status: tiled` with missing local directories.

### Pitfall 4: BUNNY_API_KEY Empty String in RegExp

**What goes wrong:** `new RegExp('', 'g')` matches every position in the string, replacing every character boundary with `[REDACTED]`, producing output like `[REDACTED][REDACTED][REDACTED]...`.

**Why it happens:** `BUNNY_API_KEY` is initialized to `''` when the env var is absent (DRY_RUN path).

**How to avoid:** Guard: `return BUNNY_API_KEY ? msg.replace(new RegExp(BUNNY_API_KEY, 'g'), '[REDACTED]') : msg;`

**Warning signs:** Error messages are garbled with repeated `[REDACTED]` strings.

### Pitfall 5: Per-File PUT vs. Per-Row Recovery Granularity

**What goes wrong:** `withRetry` wraps each individual file PUT (L-05) — correct. But the manifest row recovery granularity is whole-directory (D-02). If the script crashes after uploading 300 of 500 files in a directory, on restart it re-uploads all 500 files for that row. This is intentional and safe (bunny.net PUT is idempotent) — but the code must not try to track per-file progress in the manifest.

**Why it happens:** Confusion between the per-file retry semantics (withRetry) and the per-row recovery semantics (manifest status).

**How to avoid:** `withRetry` lives inside the per-file loop; `advanceStatus` + manifest write live outside the per-file loop (once all files for a row succeed).

---

## Code Examples

### Module-level env constants (established project pattern)

```javascript
// Source: scripts/upload-plates.js:30-33 and scripts/tile-photos.js:41-44
const BUNNY_STORAGE_HOST = process.env.BUNNY_STORAGE_HOST ?? 'la.storage.bunnycdn.com';
const BUNNY_ZONE = process.env.BUNNY_ZONE ?? 'pnwmoths';
const BUNNY_API_KEY = process.env.BUNNY_API_KEY ?? '';
const TILE_OUTPUT_DIR_OVERRIDE = process.env.TILE_OUTPUT_DIR ?? '';
const DRY_RUN = process.env.DRY_RUN === '1';
```

### Self-invocation guard (verbatim from all scripts/)

```javascript
// Source: scripts/tile-photos.js:382-384
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(redact(err.message)); process.exit(1); });
}
```

### Non-retriable 4xx curl error (Phase 29 pattern)

```javascript
// Adapted from Phase 29 fix — downloadSharedFile sets err.retriable = false for 4xx non-429
execFileSync('curl', args, { stdio: ['pipe', 'pipe', 'pipe'] });
// curl -f exits non-zero on 4xx/5xx; parse exit code or stderr if you need to distinguish
// For bunny.net: 401 = wrong API key (non-retriable); 5xx = server error (retriable)
// Simplest approach: catch SpawnError; if curl stderr contains "401" set err.retriable = false
```

### Tile path → CDN path mapping

```javascript
// Source: derived from 28-03-SUMMARY.md path convention + tilePrefix() from tile-photos.js
import { tilePrefix } from './tile-photos.js';
// ...
const prefix = tilePrefix(tileOutputDir, row);
const slugDir = join(tileOutputDir, row.species_slug.toLowerCase());
// For each file found by walk():
const rel = relative(slugDir, localFile);
// rel = "A-D/A-D.dzi" or "A-D/A-D_files/12/0_0.webp"
const cdnPath = `species-tiles/${row.species_slug.toLowerCase()}/${rel}`;
const url = `https://${BUNNY_STORAGE_HOST}/${BUNNY_ZONE}/${cdnPath}`;
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `.upload-plates-progress` file for resume | Manifest CSV status column | Phase 26 onward | Manifest is single source of truth; no separate progress sidecar |
| JPEG tiles | WebP tiles (Q=80) | Phase 28 pilot | ~30% smaller; OSD handles correctly; `vips-properties.xml` now also present in `_files/` |
| FTP/rclone upload (Phase 13) | HTTP PUT via curl | Phase 13 onwards | curl PUT is simpler, stateless, and idempotent |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The `tilePrefix()` function import from `tile-photos.js` is safe (no side-effects on import) | Architecture Patterns | If importing tile-photos.js triggers side effects, use a local copy of the function instead |
| A2 | bunny.net Storage PUT returns a 4xx immediately for a wrong API key (not a 5xx) | Common Pitfalls | If 401 is retried, the 27h run would fail much later; test with a bad key before starting bulk run |
| A3 | `vips-properties.xml` files in `_files/` subdirectories are safe to upload (don't cause CDN errors) | Architecture Patterns | If bunny.net rejects XML Content-Type, walk output needs extension filtering |

---

## Open Questions

1. **Import of `tilePrefix` from `tile-photos.js`**
   - What we know: `tilePrefix`, `tiffCachePath`, `isAlreadyTiled`, and `isTileable` are exported from `tile-photos.js`
   - What's unclear: The project pattern states "do not import helpers across scripts — the pattern is self-contained per-script files" (from CONTEXT.md `<code_context>`)
   - Recommendation: Copy the `tilePrefix` logic (one line) directly into `upload-tiles.js` as a local `tilePrefix` function rather than importing, consistent with how `withRetry`/`redact`/`logStage` are copied

2. **Non-retriable error detection from curl exit**
   - What we know: `execFileSync` throws on non-zero curl exit; `err.retriable = false` pattern is established in Phase 29 for Dropbox HTTP 4xx
   - What's unclear: curl with `-f` exits non-zero for ALL 4xx/5xx; the stderr message format for bunny.net 401 vs. 5xx is not documented in this repo
   - Recommendation: Parse `err.stderr?.toString()` or `err.message` for `"401"` to detect bad API key; set `err.retriable = false` when found; all other failures are retriable

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | `upload-tiles.js` runtime | Yes (local) | v24.15.0 | — |
| `curl` CLI | HTTP PUT uploads | Yes (macOS/Linux standard) | system | — |
| `data/species-photos-manifest.csv` | Manifest read | Yes | 4935 rows, 2685 `tiled` | — |
| `scripts/tile-config.json` | Default `tileOutputDir` | Yes | `var/tiles` (local), overrideable via `TILE_OUTPUT_DIR` | — |
| Local tiles at `var/tiles/` | Pre-flight walk + upload | Yes (local, 2.6 GB, 2741 pairs) | — | Full run requires datacenter server |
| `BUNNY_API_KEY` env var | Any non-DRY_RUN operation | Not in environment (operator provides) | — | `DRY_RUN=1` works without key |

**Missing dependencies with no fallback:**
- None — DRY_RUN path is fully functional without BUNNY_API_KEY.

**Missing dependencies with fallback:**
- Full tile set (3808 pairs) is on datacenter server (`maderas.amandrai.net`), not local machine. Local `var/tiles/` has 2741 pairs and suffices for testing; production run requires `TILE_OUTPUT_DIR=/var/lib/pnwmoths/tiles` on the server.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner (`node:test`) |
| Config file | None — test files listed explicitly in `package.json` `scripts.test` |
| Quick run command | `node --test scripts/upload-tiles.test.js` |
| Full suite command | `npm test` (runs all 182 existing tests + new upload-tiles tests) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UPLOAD-01 | `buildCdnPath(tileOutputDir, row, localFile)` constructs correct CDN path | unit | `node --test scripts/upload-tiles.test.js` | No — Wave 0 |
| UPLOAD-01 | DRY_RUN=1 prints CDN URLs without uploading or writing manifest | unit | `node --test scripts/upload-tiles.test.js` | No — Wave 0 |
| UPLOAD-02 | Rows with `status: uploaded` are skipped (manifest idempotency) | unit | `node --test scripts/upload-tiles.test.js` | No — Wave 0 |
| UPLOAD-02 | Rows with non-`tiled` status are excluded from eligible set | unit | `node --test scripts/upload-tiles.test.js` | No — Wave 0 |
| UPLOAD-03 | Pre-flight walk sums bytes and prints GB before first upload | unit | `node --test scripts/upload-tiles.test.js` | No — Wave 0 |

**Manual-only tests:**
- Actual bunny.net upload (requires BUNNY_API_KEY + live CDN) — verified by operator after script run via `curl -I` spot-check

### Sampling Rate
- **Per task commit:** `node --test scripts/upload-tiles.test.js`
- **Per wave merge:** `npm test` (full suite, must remain at 182+N passing)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- `scripts/upload-tiles.test.js` — covers UPLOAD-01, UPLOAD-02, UPLOAD-03 (new file; mirrors `scripts/tile-photos.test.js` structure)

---

## Security Domain

BUNNY_API_KEY handling is the only security concern.

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No user auth |
| V3 Session Management | No | No sessions |
| V4 Access Control | No | No access control layer |
| V5 Input Validation | Minimal | `species_slug`, `specimen_id`, `view` are manifest-derived; used in CDN path construction but never in shell strings |
| V6 Cryptography | No | No crypto |
| Secrets | Yes | `BUNNY_API_KEY` never committed; redacted in all error messages via `redact()` guard; empty-key guard required |

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| API key in error log | Information Disclosure | `redact()` wrapper on all error messages before print/throw |
| Shell injection via filenames | Tampering | `execFileSync('curl', argsArray)` — args array form, never shell string; confirmed correct |
| API key in shell history | Information Disclosure | Pass as env var at invocation (`BUNNY_API_KEY=xxx node ...`); same pattern as Phase 13 |

---

## Sources

### Primary (HIGH confidence)

- `scripts/upload-plates.js` — canonical template for HTTP PUT pattern, curl args shape, API key redaction, walk(), DRY_RUN behavior
- `scripts/tile-photos.js` — `withRetry`, `redact`, `logStage`, `tilePrefix()` definitions; `isTileable()` filter pattern
- `scripts/lib/manifest.js` — `readManifest`, `writeManifest`, `advanceStatus`, `COLUMNS`
- `.planning/phases/28-end-to-end-vertical-slice-pilot-one-species/28-03-SUMMARY.md` — CDN storage path convention confirmed empirically; CORS already configured
- `.planning/phases/28-end-to-end-vertical-slice-pilot-one-species/PILOT-LESSONS.md` — tile counts (108 files/pair at pilot size), storage footprint estimates, CORS status
- `.planning/phases/29-dzi-tile-generation-pipeline-bulk/29-03-SUMMARY.md` — Phase 30 handoff notes; 3808 eligible rows; DRY_RUN output confirming lowercase slug + path format
- `var/tiles/` (local) — verified tile directory structure including `vips-properties.xml` presence

### Secondary (MEDIUM confidence)

- CONTEXT.md `<specifics>` — pre-flight output format, CDN spot-check curl command
- CONTEXT.md `<decisions>` — all locked decisions D-01 through L-08

### Tertiary (LOW confidence)

- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all existing
- Architecture: HIGH — derived directly from existing scripts and Phase 28 pilot empirical data
- Pitfalls: HIGH — most discovered during Phases 28-29 and documented in SUMMARY/LESSONS files

**Research date:** 2026-05-23
**Valid until:** 2026-06-23 (stable domain; bunny.net Storage API is stable; Node.js fs/child_process APIs do not change)
