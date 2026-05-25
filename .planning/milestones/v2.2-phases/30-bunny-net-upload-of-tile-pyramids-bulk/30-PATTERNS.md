# Phase 30: bunny.net Upload of Tile Pyramids (bulk) - Pattern Map

**Mapped:** 2026-05-23
**Files analyzed:** 3 (2 new source files + 1 existing config modification)
**Analogs found:** 3 / 3

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `scripts/upload-tiles.js` | pipeline script (CLI) | batch, file-I/O, request-response | `scripts/tile-photos.js` + `scripts/upload-plates.js` | exact composite |
| `scripts/upload-tiles.test.js` | test | — | `scripts/tile-photos.test.js` | exact |
| `_instructions/UPLOADING_TILES.md` | operator runbook | — | `_instructions/TILING_HIGH_RES_PHOTOS.md` | exact |
| `package.json` (modification) | config | — | existing `photos:tile` / `photos:ingest` aliases | exact |

---

## Pattern Assignments

### `scripts/upload-tiles.js` (pipeline script, batch + request-response)

This file is a composite of two analogs. The manifest loop, logStage, withRetry, redact, DRY_RUN guard, periodic flush pattern, and self-invocation guard all come from `scripts/tile-photos.js`. The curl PUT, walk helper, BUNNY env vars, and env-var shape come from `scripts/upload-plates.js`.

**Primary analog:** `scripts/tile-photos.js`
**Secondary analog:** `scripts/upload-plates.js`

---

#### Imports pattern

Copy this import block shape (lines 27–32 of `scripts/tile-photos.js`), replacing Dropbox/vips imports with fs/promises and curl:

```javascript
// From scripts/tile-photos.js lines 27-32 (shape); adapt for Phase 30:
import { resolve, join } from 'node:path';
import { rm, unlink, readdir } from 'node:fs/promises';
import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { readManifest, writeManifest, advanceStatus } from './lib/manifest.js';
// No Dropbox import — Phase 30 uploads only; no downloads needed.
```

---

#### Module-level env constants

Copy pattern from `scripts/tile-photos.js` lines 39–44 and `scripts/upload-plates.js` lines 31–33:

```javascript
// From scripts/tile-photos.js lines 39-44 (manifest + config paths):
const MANIFEST_PATH = resolve('data/species-photos-manifest.csv');
const TILE_CONFIG_PATH = resolve('scripts/tile-config.json');
const DRY_RUN = process.env.DRY_RUN === '1';
const TILE_OUTPUT_DIR_OVERRIDE = process.env.TILE_OUTPUT_DIR ?? '';

// From scripts/upload-plates.js lines 31-33 (bunny.net env vars):
const BUNNY_STORAGE_HOST = process.env.BUNNY_STORAGE_HOST ?? 'la.storage.bunnycdn.com';
const BUNNY_ZONE = process.env.BUNNY_ZONE ?? 'pnwmoths';
const BUNNY_API_KEY = process.env.BUNNY_API_KEY ?? '';
```

---

#### redact helper

Copy verbatim from `scripts/tile-photos.js` lines 70–74. Change the variable name from `DROPBOX_TOKEN` to `BUNNY_API_KEY`:

```javascript
// From scripts/tile-photos.js lines 70-74 (adapt variable name):
function redact(msg) {
  return BUNNY_API_KEY
    ? msg.replace(new RegExp(BUNNY_API_KEY, 'g'), '[REDACTED]')
    : msg;
}
```

The empty-string guard (`BUNNY_API_KEY ?`) is mandatory — `new RegExp('', 'g')` corrupts the message.

---

#### withRetry helper

Copy verbatim from `scripts/tile-photos.js` lines 85–107. Change the `[tile-photos]` label in the console.log to `[upload-tiles]`. **Do NOT use the linear-backoff version in `upload-plates.js` lines 104–119** — it lacks the non-retriable 4xx bail (`err.retriable === false`).

```javascript
// From scripts/tile-photos.js lines 85-107 (copy verbatim, change label):
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

---

#### logStage helper

Copy verbatim from `scripts/tile-photos.js` lines 115–121:

```javascript
// From scripts/tile-photos.js lines 115-121 (copy verbatim):
function logStage(content_hash, action, outcome, extra = '') {
  const hashPrefix = (content_hash ?? '').slice(0, 12).padEnd(12);
  const actionField = String(action).padEnd(16);
  console.log(
    `${new Date().toISOString()} ${hashPrefix} ${actionField} ${outcome}${extra ? '  ' + extra : ''}`
  );
}
```

---

#### walk helper (async, for upload loop)

Copy verbatim from `scripts/upload-plates.js` lines 37–49:

```javascript
// From scripts/upload-plates.js lines 37-49 (copy verbatim):
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

For the pre-flight synchronous walk, use the same pattern with `readdirSync` — or call the async `walk()` inside the already-async `main()`. See RESEARCH.md Pattern 7 for the sync variant.

---

#### Exported helpers for testability

Follow the `tilePrefix` / `isAlreadyTiled` / `isTileable` export pattern from `scripts/tile-photos.js` lines 141–197. Phase 30's exports are:

```javascript
// Modeled on scripts/tile-photos.js lines 141-197 (export pattern):
export function tileUploadPath(tileOutputDir, row) {
  return join(tileOutputDir, row.species_slug.toLowerCase(), `${row.specimen_id}-${row.view}`);
}

export function tilePullZoneUrl(row) {
  const CDN_BASE_URL = 'https://pnwmoths.b-cdn.net';
  const slug = row.species_slug.toLowerCase();
  return `${CDN_BASE_URL}/species-tiles/${slug}/${row.specimen_id}-${row.view}/`;
}

export function isUploadable(row) {
  return row.status === 'tiled';
}
```

---

#### curl PUT pattern

Copy the arg array construction and `execFileSync` call verbatim from `scripts/upload-plates.js` lines 96–108:

```javascript
// From scripts/upload-plates.js lines 96-108:
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

Wrap the call in `withRetry`: `await withRetry(() => execFileSync('curl', args, opts), label)`.

The storage URL pattern for Phase 30 (from RESEARCH.md Pattern 1):
```javascript
const slug = row.species_slug.toLowerCase();  // L-08: unconditional lowercase
const pairSegment = `${row.specimen_id}-${row.view}`;
// .dzi descriptor:
const dziStorageUrl = `https://${BUNNY_STORAGE_HOST}/${BUNNY_ZONE}/species-tiles/${slug}/${pairSegment}.dzi`;
// tile files (rel = relative path within _files/ dir):
const tileStorageUrl = `https://${BUNNY_STORAGE_HOST}/${BUNNY_ZONE}/species-tiles/${slug}/${pairSegment}_files/${rel}`;
```

---

#### DRY_RUN guard

Copy the guard placement pattern from `scripts/tile-photos.js` lines 255–268. DRY_RUN check occurs **before** the `!BUNNY_API_KEY` guard (mirror of `upload-plates.js` lines 57–75 and `tile-photos.js` lines 255–276). Print Pull Zone URLs, not Storage Zone URLs:

```javascript
// From scripts/tile-photos.js lines 255-268 (adapt for upload-tiles):
if (DRY_RUN) {
  console.log('[upload-tiles] DRY_RUN=1 — printing first 5 upload plans, not uploading');
  for (const row of tiledRows.slice(0, 5)) {
    const cdnUrl = tilePullZoneUrl(row);
    const filesDir = join(tileOutputDir, row.species_slug.toLowerCase(), `${row.specimen_id}-${row.view}_files`);
    // Count files for display (optional; skip if dir not present)
    console.log(`  slug: ${row.species_slug.toLowerCase()}  pair: ${row.specimen_id}-${row.view}`);
    console.log(`    CDN URL: ${cdnUrl}`);
  }
  if (tiledRows.length > 5) console.log(`  ... (${tiledRows.length - 5} more)`);
  return;
}
```

---

#### Missing-secret guard

Copy from `scripts/tile-photos.js` lines 271–276. Place after the DRY_RUN return:

```javascript
// From scripts/tile-photos.js lines 271-276:
if (!BUNNY_API_KEY) {
  console.error(
    '[upload-tiles] BUNNY_API_KEY is required. Set it to your bunny.net Storage Zone password.'
  );
  process.exit(1);
}
```

---

#### Manifest loop with periodic flush and try/finally

Copy the overall `main()` loop structure from `scripts/tile-photos.js` lines 237–376. Key structural points (verbatim from that file):

```javascript
// From scripts/tile-photos.js lines 293-376 (loop structure — adapt stage names):
let rowsProcessed = 0;
let fatal = null;

try {
  for (const row of tiledRows) {
    try {
      // ... per-row upload work ...
      advanceStatus(row, 'uploaded');
      logStage(row.content_hash, 'upload', 'ok', `${row.species_slug}/${row.specimen_id}-${row.view}`);
      // ... delete tile dir (D-03) ...
    } catch (err) {
      const safeMsg = redact(err.message ?? String(err));
      advanceStatus(row, 'failed', { last_error: safeMsg });
      logStage(row.content_hash, 'upload', 'failed', safeMsg);
    }

    rowsProcessed++;
    if (rowsProcessed % 25 === 0) await writeManifest(MANIFEST_PATH, rows);
  }
} catch (fatalErr) {
  fatal = fatalErr;
  console.error(`[upload-tiles] fatal error: ${redact(fatalErr.message ?? String(fatalErr))}`);
} finally {
  // From scripts/tile-photos.js lines 361-363:
  await writeManifest(MANIFEST_PATH, rows);
}
```

---

#### Tile deletion after upload (D-03)

Inside the per-row success path, after `advanceStatus(row, 'uploaded')`:

```javascript
// Pattern from RESEARCH.md Pattern 6 (no direct analog in codebase — use fs/promises):
const prefix = join(tileOutputDir, row.species_slug.toLowerCase(), `${row.specimen_id}-${row.view}`);
await rm(`${prefix}_files`, { recursive: true, force: true });
await unlink(`${prefix}.dzi`);
```

`force: true` prevents ENOENT crashes when a partial deletion occurred in a prior run.

---

#### Self-invocation guard

Copy verbatim from `scripts/tile-photos.js` lines 382–384:

```javascript
// From scripts/tile-photos.js lines 382-384:
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(redact(err.message)); process.exit(1); });
}
```

---

#### Summary output format

Copy from `scripts/tile-photos.js` lines 366–375, adapting counter names:

```javascript
// From scripts/tile-photos.js lines 366-375:
console.log('');
console.log('[upload-tiles] summary:');
console.log(`  uploaded (new):              ${stats.uploaded}`);
console.log(`  skipped (already uploaded):  ${stats.skippedAlreadyUploaded}`);
console.log(`  failed (per-row errors):     ${stats.failed}`);
console.log(`  total eligible rows:         ${tiledRows.length}`);
console.log(`[upload-tiles] wrote ${MANIFEST_PATH}`);
```

---

#### Progress checkpoint line

Copy from `scripts/upload-plates.js` line 122 (adapt label and denominator):

```javascript
// From scripts/upload-plates.js line 122:
if (rowsProcessed % 25 === 0)
  console.log(`[upload-tiles] ${rowsProcessed}/${tiledRows.length}`);
```

---

### `scripts/upload-tiles.test.js` (test)

**Analog:** `scripts/tile-photos.test.js`

#### File header imports

Copy verbatim from `scripts/tile-photos.test.js` lines 1–6, replacing the imported names:

```javascript
// From scripts/tile-photos.test.js lines 1-6:
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tileUploadPath, tilePullZoneUrl, isUploadable } from './upload-tiles.js';
```

#### Row factory

Copy verbatim from `scripts/tile-photos.test.js` lines 13–30:

```javascript
// From scripts/tile-photos.test.js lines 13-30 (copy verbatim):
function row(overrides) {
  return {
    content_hash: 'h'.repeat(64),
    dropbox_path: '/folder/a.tif',
    size_bytes: '1',
    server_modified: '2026-01-01T00:00:00Z',
    filename_raw: 'a.tif',
    binomial_raw: 'abagrotis apposita',
    specimen_id: 'A',
    view: 'D',
    binomial_resolved: 'abagrotis apposita',
    species_slug: 'abagrotis-apposita',
    match_bucket: 'clean-match',
    status: 'tiled',       // Phase 30: default status is 'tiled', not 'discovered'
    last_error: '',
    ...overrides,
  };
}
```

#### Test suite structure

Model describe/it block structure on `scripts/tile-photos.test.js` lines 36–143. One `describe` block per exported function. Tests cover:
- `tileUploadPath`: lowercase slug, accession specimen IDs preserved
- `tilePullZoneUrl`: Pull Zone URL (not Storage Zone), lowercase slug
- `isUploadable`: true for `status: tiled`; false for `status: uploaded`, `discovered`, `failed`, other statuses

See RESEARCH.md "Validation Architecture → Phase Requirements → Test Map" for the full required test list (UPLOAD-01, UPLOAD-02, slug lowercasing, mixed-case slug, accession IDs).

---

### `_instructions/UPLOADING_TILES.md` (operator runbook)

**Analog:** `_instructions/TILING_HIGH_RES_PHOTOS.md`

Mirror the exact section structure of `_instructions/TILING_HIGH_RES_PHOTOS.md` (274 lines), substituting upload-specific content:

| Tiling runbook section | Upload runbook equivalent |
|---|---|
| "What This Changes" | What This Changes (manifest, bunny.net Storage, CDN) |
| "Prerequisites" | Prerequisites (BUNNY_API_KEY, curl, Node.js, var/tiles corpus) |
| "Configuration" | Configuration (BUNNY_STORAGE_HOST, BUNNY_ZONE, TILE_OUTPUT_DIR, CDN_BASE_URL) |
| "Run the Dry-Run Preview" | Run the Dry-Run Preview (DRY_RUN=1 output format from RESEARCH.md) |
| "Run the Full Pipeline" | Run the Full Pipeline (tmux command, log format, expected runtime ~27h) |
| "Resume After Interruption" | Resume After Interruption (whole-directory granularity D-02) |
| "When Things Go Wrong" | When Things Go Wrong (bad API key, 4xx exhausting retries, missing tile dirs) |
| "Verification" | Verification (curl -I CDN spot-check per ROADMAP SC-4, manifest diff) |
| "Next Phase Handoff" | Next Phase Handoff (Phase 31 reads status: uploaded rows) |

The tone and format of `_instructions/TILING_HIGH_RES_PHOTOS.md` are the reference. Note that `_instructions/UPLOADING_IMAGES.md` uses a different structure (rclone-based manual process) — do not use it as the section template.

---

### `package.json` (modification — add `photos:upload` alias)

**Analog:** `package.json` lines 20–22 (existing `photos:ingest` / `photos:tile` aliases):

```json
// Current pattern in package.json lines 20-22:
"photos:ingest": "node scripts/ingest-photos.js",
"photos:investigate": "RESORT_ONLY=1 node scripts/ingest-photos.js",
"photos:tile": "node scripts/tile-photos.js",
```

Add after `photos:tile`:
```json
"photos:upload": "node scripts/upload-tiles.js",
```

Also add `scripts/upload-tiles.test.js` to the `"test"` script (line 23) — append it to the existing space-separated file list, following the `scripts/tile-photos.test.js` entry.

---

## Shared Patterns

### API key redaction
**Source:** `scripts/tile-photos.js` lines 70–74 (also `scripts/upload-plates.js` line 113)
**Apply to:** All error messages, thrown errors, and logStage 'failed' entries in `upload-tiles.js`

```javascript
function redact(msg) {
  return BUNNY_API_KEY
    ? msg.replace(new RegExp(BUNNY_API_KEY, 'g'), '[REDACTED]')
    : msg;
}
```

The ternary guard for empty BUNNY_API_KEY is mandatory; `new RegExp('', 'g')` would replace every character position otherwise.

### Manifest state management
**Source:** `scripts/lib/manifest.js` lines 73–130
**Apply to:** `upload-tiles.js` — all reads, writes, and status transitions

- `readManifest(MANIFEST_PATH)` — always use; never hand-roll CSV parsing
- `writeManifest(MANIFEST_PATH, rows)` — every 25 rows and in `finally` block
- `advanceStatus(row, 'uploaded')` — clears `last_error`; never do `row.status = 'uploaded'` directly
- `advanceStatus(row, 'failed', { last_error: safeMsg })` — records error string in manifest

### Periodic manifest flush + try/finally write
**Source:** `scripts/tile-photos.js` lines 354–363
**Apply to:** `upload-tiles.js` main loop

```javascript
// From scripts/tile-photos.js lines 354-363:
rowsProcessed++;
if (rowsProcessed % 25 === 0) await writeManifest(MANIFEST_PATH, rows);
// ...
} finally {
  await writeManifest(MANIFEST_PATH, rows);
}
```

The `finally` write ensures manifest is flushed on both clean exit and fatal error.

### species_slug unconditional lowercase
**Source:** `scripts/tile-photos.js` line 142 (`tilePrefix` function)
**Apply to:** Every CDN path join in `upload-tiles.js`

```javascript
// From scripts/tile-photos.js line 142:
join(tileOutputDir, row.species_slug.toLowerCase(), `${row.specimen_id}-${row.view}`)
```

Apply `.toLowerCase()` on every usage — both on-disk path construction and CDN URL construction. Never conditionally lowercase.

### DRY_RUN guard ordering
**Source:** `scripts/tile-photos.js` lines 255–276
**Apply to:** `upload-tiles.js` main()

DRY_RUN check and return must come **before** the `!BUNNY_API_KEY` guard. This allows `DRY_RUN=1 npm run photos:upload` to work without providing BUNNY_API_KEY.

### Self-invocation guard
**Source:** `scripts/tile-photos.js` lines 382–384
**Apply to:** `upload-tiles.js` (bottom of file)

```javascript
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(redact(err.message)); process.exit(1); });
}
```

This pattern is required so test imports do not trigger `main()`.

---

## No Analog Found

No files in Phase 30 lack a codebase analog. The pre-flight footprint walk logic (RESEARCH.md Pattern 5) and tile deletion (RESEARCH.md Pattern 6) are new behaviors, but they use only standard Node.js built-ins (`statSync`, `readdirSync`, `rm`, `unlink`) with no structural novelty requiring a new pattern source.

---

## Metadata

**Analog search scope:** `scripts/`, `scripts/lib/`, `_instructions/`, `package.json`
**Files read:** `scripts/upload-plates.js`, `scripts/tile-photos.js`, `scripts/tile-photos.test.js`, `scripts/lib/manifest.js`, `scripts/tile-config.json`, `_instructions/TILING_HIGH_RES_PHOTOS.md`, `_instructions/UPLOADING_IMAGES.md`, `package.json` (grep)
**Pattern extraction date:** 2026-05-23
