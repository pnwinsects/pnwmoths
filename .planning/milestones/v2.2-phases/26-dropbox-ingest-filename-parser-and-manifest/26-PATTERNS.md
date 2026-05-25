# Phase 26: Dropbox Ingest, Filename Parser, and Manifest — Pattern Map

**Mapped:** 2026-05-21
**Files analyzed:** 8 (5 new code + 1 new data + 1 new doc + 1 modified config) + N tests
**Analogs found:** 8 / 8 (every new artifact has a strong local analog)

## File Classification

| New / Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `scripts/ingest-photos.js` | CLI entrypoint (per-stage script) | request-response (Dropbox API → CSV write) | `scripts/upload-plates.js` + `scripts/migrate-images.js` | exact (script-of-stage shape) + exact (env-driven HTTP + CSV write) |
| `scripts/lib/parse-photo-filename.js` | library / pure helper | transform (filename string → structured fields) | `scripts/migrate-images.js:64-98` (`parseMotFilename` + `parseViewSpecimen`) + spike `parse-classify.mjs:110-127` (`extractBinomial`) | exact pattern, needs three documented fixes |
| `scripts/lib/dropbox-list.js` | library / API client | request-response with pagination | spike `list-dropbox.mjs:31-79` (port directly) | exact (port) |
| `scripts/lib/manifest.js` | library / CSV I/O | batch read+write | `scripts/migrate-images.js:21-22,335-336` (csv-parse/sync + csv-stringify/sync) + `scripts/migrate-species.js:474-475,537-538` | exact |
| `data/species-photos-manifest.csv` | data file (committed) | n/a (committed seed) | `data/images.csv` (Phase 13 manifest precedent) | exact (sibling artifact in same flat-file ethos) |
| `_instructions/INGESTING_HIGH_RES_PHOTOS.md` | operator/contributor doc | n/a (Markdown) | `_instructions/UPLOADING_IMAGES.md` (Phase 13) | exact (same audience, same shape) |
| `scripts/lib/parse-photo-filename.test.js` (or `scripts/ingest-photos.test.js`) | unit test | n/a | `src/_lib/glossary-transform.test.js` (pure-function unit test) + `scripts/migrate-species.test.js` (integration test) | exact for parser unit tests; integration shape available if needed |
| `package.json` | config | n/a | `package.json` lines 18-20 (`migrate:*` aliases) | exact |

## Pattern Assignments

### `scripts/ingest-photos.js` (CLI entrypoint, request-response → CSV write)

**Primary analog:** `scripts/upload-plates.js`
**Secondary analog:** `scripts/migrate-images.js` (env-var constants, csv-stringify final step)

This script is the operator-facing entrypoint. It owns: argument-free invocation, env-driven config (`DROPBOX_TOKEN`, `DRY_RUN=1`), Dropbox API calls (delegated to `scripts/lib/dropbox-list.js`), parsing (delegated to `scripts/lib/parse-photo-filename.js`), classification cascade, manifest read/write (delegated to `scripts/lib/manifest.js`), per-stage logging, retry-with-backoff, and clean re-entry. The manifest itself replaces the `.upload-plates-progress` file as recovery state (D-15).

**Header / file docstring pattern** — copy from `upload-plates.js:1-21`:

```js
/**
 * scripts/ingest-photos.js
 *
 * Phase 26 (v2.2 high-res photos): list the Dropbox shared-link folder
 * via /2/files/list_folder, parse each filename into binomial + specimen + view,
 * classify against data/species.csv, and write data/species-photos-manifest.csv.
 *
 * Metadata-only — no file bytes are downloaded.
 *
 * Usage:
 *   DROPBOX_TOKEN=sl.… node scripts/ingest-photos.js
 *   DRY_RUN=1 DROPBOX_TOKEN=sl.… node scripts/ingest-photos.js   # prints first 5 entries, no manifest write
 *
 * Resume after interruption: re-run the same command. The manifest itself is the
 * recovery state — rows with status=discovered are re-classified idempotently.
 *
 * DROPBOX_TOKEN: Dropbox app access token with files.metadata.read scope.
 * Generate at https://www.dropbox.com/developers/apps. Never commit, log, or hardcode.
 */
```

**Module-level env constants** — copy from `upload-plates.js:28-35`:

```js
import { resolve } from 'node:path';

const MANIFEST_PATH = resolve('data/species-photos-manifest.csv');
const SPECIES_CSV   = resolve('data/species.csv');

const DROPBOX_TOKEN     = process.env.DROPBOX_TOKEN ?? '';
const DROPBOX_SHARE_URL = process.env.DROPBOX_SHARE_URL
  ?? 'https://www.dropbox.com/scl/fo/uf3sg1efxau1fug4f6ibe/AARZETfHfpzlvILrd6KLWlc?rlkey=7m1pm3z0rnasb9i01a5ht0ppf&st=emehj9n2&dl=0';
const DRY_RUN = process.env.DRY_RUN === '1';
```

Project convention: every `scripts/` file uses `const FOO = process.env.FOO ?? 'default';` at module top. Mirror exactly (D-10, CONTEXT.md "Established Patterns").

**Missing-secret guard** — copy from `upload-plates.js:57-60`:

```js
if (!DRY_RUN && !DROPBOX_TOKEN) {
  console.error('[ingest-photos] DROPBOX_TOKEN is required. Generate one at https://www.dropbox.com/developers/apps with files.metadata.read scope.');
  process.exit(1);
}
```

**DRY_RUN=1 short-circuit** — copy from `upload-plates.js:67-75` (prints first 5 then exits):

```js
if (DRY_RUN) {
  console.log('[ingest-photos] DRY_RUN=1 — listing first page and printing first 5 entries, not writing manifest');
  const firstPage = await listFirstPage(DROPBOX_SHARE_URL, DROPBOX_TOKEN);
  for (const e of firstPage.entries.slice(0, 5)) {
    console.log(`  -> ${e.path_display}  (${e.size} bytes, hash=${e.content_hash})`);
  }
  console.log('  ...');
  return;
}
```

**Retry with exponential backoff + API-key redaction** — adapt from `upload-plates.js:87, 104-119` (the 5-attempt loop) and `:112` (redaction). D-15 specifies caps at 32s; do not crash, mark `status: failed` + populate `last_error`:

```js
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function withRetry(fn, label) {
  const delays = [2000, 4000, 8000, 16000, 32000]; // 5 attempts, capped
  for (let attempt = 0; attempt < delays.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const safeMsg = err.message.replace(new RegExp(DROPBOX_TOKEN, 'g'), '[REDACTED]');
      if (attempt === delays.length - 1) {
        // Last attempt — surface a redacted error to the caller; manifest row writer marks status=failed.
        throw new Error(`${label} failed after ${delays.length} attempts: ${safeMsg}`);
      }
      console.log(`[ingest-photos] transient error on ${label} (attempt ${attempt + 1}/${delays.length}) — retrying in ${delays[attempt] / 1000}s`);
      await sleep(delays[attempt]);
    }
  }
}
```

**Hard rule from CONTEXT.md "Specific Ideas":** `DROPBOX_TOKEN` MUST be redacted in every error path the same way `upload-plates.js:112` redacts `BUNNY_API_KEY`. This is non-negotiable.

**Per-stage log line** — D-15 prescribes one line per stage transition with timestamp, content_hash, action, outcome. Format suggestion (parallel to `upload-plates.js:122`'s progress lines):

```js
function logStage(content_hash, action, outcome, extra = '') {
  console.log(`${new Date().toISOString()} ${content_hash?.slice(0, 12) ?? '------------'} ${action.padEnd(16)} ${outcome}${extra ? '  ' + extra : ''}`);
}
// e.g. logStage(entry.content_hash, 'classify', 'clean-match', binomial);
```

**Main loop control flow** — adapt the per-image structure of `upload-plates.js:91-123` (load progress → iterate → retry → append → progress count). Substitute: manifest rows (from `scripts/lib/manifest.js`) for the progress-file `done` set; the manifest's `status` column carries the same role.

**Exit handler pattern** — copy from `upload-plates.js:128-133`:

```js
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}
```

**Read-first material for the executor:**
- `scripts/upload-plates.js` lines 1-133 (entire file — it's the most direct CLI shape match)
- `scripts/migrate-images.js` lines 21-44 (env-var constants + csv-parse/csv-stringify imports)
- `.planning/spikes/001-dropbox-photo-audit/list-dropbox.mjs` lines 31-79 (the working Dropbox loop to port)

---

### `scripts/lib/parse-photo-filename.js` (library / pure transform)

**Primary analog:** spike `parse-classify.mjs:110-127` (`extractBinomial`) — the function to port and extend.
**Secondary analog:** `scripts/migrate-images.js:64-98` (`parseMotFilename` + `parseViewSpecimen`) — the same shape already exists in the repo for Phase 13's narrower case.

This library is pure: filename string in, `{ binomial_raw, specimen_id, view, bucket_hint }` out. No I/O. Exported functions get unit-tested directly (D-14).

**The three D-14 fixes** the spike called out (REPORT.md §"Parser fixes worth folding into the milestone"):

1. **Drop the ≥3-char species epithet minimum.** Use ≥2. Concretely, in spike line 122 (`b.length >= 3`), change to `b.length >= 2`. Justified by `Trichoplusia ni`, `Rachiplusia ou`.
2. **Allow hyphenated species epithets.** Change the second-token test from `/^[a-z]+$/` to `/^[a-z]+(-[a-z]+)?$/`. Justified by `Autographa v-alba`, `Xestia c-nigrum`.
3. **Route provisional IDs to their own bucket.** Detect tokens `sp`, `n sp`, `nr <epithet>` and return `bucket_hint: 'provisional'` from the parser; do not coerce them into a clean binomial. Justified by `Monostoecha n sp`, `Plataea sp`, `Eupithecia nr harrisonata`.

**Port pattern** — port the spike's full function, then layer the three fixes. Excerpt of what to copy verbatim then modify (spike `parse-classify.mjs:110-127`):

```js
// Port from .planning/spikes/001-dropbox-photo-audit/parse-classify.mjs:110-127
// Then apply D-14 fixes #1, #2, #3 (see comments).
export function extractBinomial(name) {
  const stem = name.replace(/\.[^.]+$/, '');
  const cleaned = stem
    .replace(/[_\-\.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const tokens = cleaned.split(' ');
  for (let i = 0; i < tokens.length - 1; i++) {
    const a = tokens[i];
    const b = tokens[i + 1];
    // FIX #1: b.length >= 2 (was >= 3) — admits 'ni', 'ou'.
    // FIX #2: allow hyphenated epithets — /^[a-z]+(-[a-z]+)?$/ (was /^[a-z]+$/).
    if (/^[A-Z][a-z]+$/.test(a) && /^[a-z]+(-[a-z]+)?$/.test(b) && b.length >= 2) {
      // FIX #3: route 'sp', 'n sp', 'nr X' to provisional, not clean.
      if (b === 'sp' || b === 'nr' || (a.toLowerCase() === 'n' && b === 'sp')) {
        return { binomial: null, bucketHint: 'provisional' };
      }
      return { binomial: `${a.toLowerCase()} ${b.toLowerCase()}`, bucketHint: null };
    }
  }
  return { binomial: null, bucketHint: null };
}
```

Note: the FIX #3 detection of `sp`/`n sp`/`nr` should be implemented by inspecting the *full token stream*, not just the adjacent pair, since `n sp` is two tokens both lowercase. A pre-pass scan that flags provisional and returns early is cleaner — the unit tests will pin the exact shape.

**Specimen + view extraction** — adapt `scripts/migrate-images.js:84-98` (`parseViewSpecimen`) but loosen the specimen regex to accept institutional IDs (`OSAC_…`, `WWUC*`) in addition to single capital letters. Phase 13's regex is `/-([A-Z])-([A-Z])\.[^.]+$/` (single letter only); for Phase 26 it must be `/-([A-Z0-9_]+)-([DV])\.[^.]+$/i` or similar — D-14 explicitly references `Hyalophora euryalus-WWUC000000083-D.tif` as an audit case.

**Unit-test coverage** — D-14 names the cases that must pass:

| Filename | Expected parse outcome |
|---|---|
| `Abagrotis apposita-A-D.tif` | clean: `abagrotis apposita`, specimen `A`, view `D` |
| `Autographa v-alba-A-D.tif` | clean (with FIX #2): `autographa v-alba` |
| `Xestia c-nigrum-A-D.tif` | clean (with FIX #2): `xestia c-nigrum` |
| `Monostoecha n sp-A-D.tif` | provisional bucket (FIX #3); binomial = null |
| `Plataea sp-A-D.tif` | provisional bucket (FIX #3); binomial = null |
| `Eupithecia nr harrisonata-OSAC_0001081322-D.tif` | provisional bucket (FIX #3); specimen `OSAC_0001081322` |
| `Trichoplusia ni-A-D.tif` | clean (with FIX #1): `trichoplusia ni` |
| `Rachiplusia ou-A-D.tif` | clean (with FIX #1): `rachiplusia ou` |
| `Paraseptis-adnixa-B-D.tif` | clean (Genus-species hyphen-joined): `paraseptis adnixa`, specimen `B` |
| `Hyalophora euryalus-WWUC000000083-D.tif` | clean; specimen `WWUC000000083` (institutional ID) |
| `Lasionycta Carolynae-A-D.tif` | unparseable (REPORT.md §"Unparseable cases" — do not auto-coerce the capitalized species token; surface to curator) |

**Read-first material for the executor:**
- `.planning/spikes/001-dropbox-photo-audit/parse-classify.mjs` lines 110-127 (`extractBinomial` to port)
- `scripts/migrate-images.js` lines 64-98 (`parseMotFilename` + `parseViewSpecimen` — the in-repo precedent; loosen for Phase 26)
- `.planning/spikes/001-dropbox-photo-audit/REPORT.md` §"Unparseable cases (20 files)" lines 102-124 (the edge-case enumeration)

---

### `scripts/lib/dropbox-list.js` (library / API client with pagination)

**Primary analog:** spike `list-dropbox.mjs:31-79` — port directly.

This library wraps the Dropbox `/2/files/list_folder` + `/2/files/list_folder/continue` loop. Pure fetch; no SDK; no recursion (the shared-link API doesn't support it — see spike findings reference "Don't try recursive: true with shared_link").

**Port verbatim with one parameterization change** — make `SHARE_URL` and the bearer token function parameters instead of module constants (the spike hardcoded them; this library is consumed by `scripts/ingest-photos.js` and a future `scripts/download-and-tile.js`).

**Excerpt from spike `list-dropbox.mjs:31-45` — the `fetch` wrapper to port:**

```js
async function dbxCall(endpoint, body, token) {
  const res = await fetch(`https://api.dropboxapi.com${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${endpoint} → ${res.status}: ${text}`);
  }
  return res.json();
}
```

**Excerpt from spike `list-dropbox.mjs:47-79` — the pagination loop to port:**

```js
export async function* listSharedFolder({ shareUrl, token }) {
  let firstPage = true;
  let cursor = null;
  let pages = 0;

  while (true) {
    pages++;
    const data = firstPage
      ? await dbxCall('/2/files/list_folder', {
          path: '',
          shared_link: { url: shareUrl },
          recursive: false,           // REQUIRED — shared_link mode is non-recursive only
          limit: 2000,
          include_media_info: false,
          include_deleted: false,
          include_has_explicit_shared_members: false,
          include_mounted_folders: false,
          include_non_downloadable_files: true,
        }, token)
      : await dbxCall('/2/files/list_folder/continue', { cursor }, token);

    for (const e of data.entries) yield e;
    process.stderr.write(`[dropbox-list] page ${pages}: +${data.entries.length} entries\n`);

    if (!data.has_more) break;
    cursor = data.cursor;
    firstPage = false;
  }
}
```

Yielding entries one-at-a-time (async generator) is a small improvement over the spike's "accumulate-then-return-array" — it lets `ingest-photos.js` write manifest rows incrementally for crash resilience without holding the full 5,000-entry list in memory. The spike used the array form because it also wrote `outputs/filenames.json`; the library doesn't need to.

**Retry wrapping happens at the call site** — `ingest-photos.js` wraps `dbxCall` invocations (via this library's entrypoint) in the `withRetry` helper defined in the script (see D-15 backoff schedule). The library exports the raw call; the script adds retry policy. This keeps the library pure.

**Constraint reminder (spike findings reference, "What to avoid"):**
- Don't pass `recursive: true` with `shared_link` — API explicitly forbids it.
- Don't add the Dropbox SDK as a dep — direct `fetch` is the project pattern.
- The `*custom/` subfolder is skipped by non-recursive listing — D-11 makes this a feature, not a bug.

**Read-first material for the executor:**
- `.planning/spikes/001-dropbox-photo-audit/list-dropbox.mjs` lines 1-132 (entire file — port wholesale)
- `.claude/skills/spike-findings-pnwmoths/references/dropbox-ingest-and-filename-parsing.md` §"1. List a Dropbox shared-link folder" (the API surface contract)

---

### `scripts/lib/manifest.js` (library / CSV read+write)

**Primary analog:** `scripts/migrate-images.js:21-22, 117-135, 335-336` — csv-parse/sync + csv-stringify/sync usage, the exact mode this manifest needs.
**Secondary analog:** `scripts/migrate-species.js:367-374, 474-475, 537-538` — same pattern, slightly different option set.

The manifest is ~5,000 rows / ~1.5 MB at full size — D-02 explicitly chose CSV over streaming/SQLite because both the read and the write fit comfortably in memory. Use the `/sync` exports of both libraries.

**Imports** — copy from `scripts/migrate-images.js:21-22`:

```js
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
```

**Read pattern** — adapt from `scripts/migrate-images.js:143` and `scripts/migrate-species.js:370`:

```js
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

export async function readManifest(path) {
  if (!existsSync(path)) return [];   // first run — no manifest yet
  const raw = await readFile(path);
  return parse(raw, { columns: true, skip_empty_lines: true });
}
```

**Write pattern** — copy from `scripts/migrate-images.js:300, 335-336`:

```js
const COLUMNS = [
  'content_hash', 'dropbox_path', 'size_bytes', 'server_modified',
  'filename_raw', 'binomial_raw', 'specimen_id', 'view',
  'binomial_resolved', 'species_slug', 'match_bucket', 'status', 'last_error',
];

export async function writeManifest(path, rows) {
  const csv = stringify(rows, { header: true, columns: COLUMNS });
  await writeFile(path, csv);
}
```

The `columns: COLUMNS` argument enforces D-05 schema and column *order* even when row objects omit fields. Matches Phase 13 (`migrate-images.js:300`) and Phase 17 (`migrate-species.js:32-39`) conventions exactly.

**Investigation re-sort helper** — D-12 requires a re-sort that puts `genus-only`, `likely-synonym`, `provisional`, `unparseable` at the top, ordered by binomial frequency. This is a pure function over the row array; expose it from the manifest library so both `ingest-photos.js` (initial write) and a future `npm run photos:investigate` re-sort step (D-13 names the alias) can share it:

```js
const INVESTIGATION_BUCKETS = ['genus-only', 'likely-synonym', 'provisional', 'unparseable'];

export function sortForInvestigation(rows) {
  // Group needs-investigation rows by binomial_raw, sort each group by count desc,
  // then append clean-match rows in stable order. CONTEXT.md "Specifics" notes the
  // sort must match the spike's frequency ordering so the curator sees
  // 'Grammia → Apantesis', 'Smerinthus ophthalmica', 'Eupithecia' at the top.
  // [implementation details belong to the executor]
}
```

**Read-first material for the executor:**
- `scripts/migrate-images.js` lines 21-22, 117-135, 335-336 (csv-parse + csv-stringify in repo style)
- `scripts/migrate-species.js` lines 32-39, 474-475 (column-list-as-constant + columns-arg-to-stringify)
- CONTEXT.md D-05 (the locked schema) and "Integration Points" (Phase 27 must extend non-destructively; Phase 28 reads `status: discovered`)

---

### `data/species-photos-manifest.csv` (data file, committed)

**Primary analog:** `data/images.csv` — the Phase 13 manifest. Same flat-file ethos, same directory, same committed-to-git status, same "non-technical curators open it in a spreadsheet" audience.

Phase 26 writes this file from scratch on first run; subsequent runs of `ingest-photos.js` re-classify and re-sort it. The file is committed (D-01) — PR history shows curation decisions over time. ~5,000 rows × 13 columns × ~30 bytes = ~1.5 MB; well under any practical concern.

**Schema (D-05, repeated here so the executor doesn't have to chase it):**

```
content_hash,dropbox_path,size_bytes,server_modified,filename_raw,binomial_raw,specimen_id,view,binomial_resolved,species_slug,match_bucket,status,last_error
```

- `content_hash` is the row identity (D-04 — Dropbox's deterministic hash).
- `match_bucket` values: `clean | slug | genus-only | likely-synonym | provisional | unparseable`. Phase 27 will introduce `resolved-via-synonym`.
- `status` values: `discovered | downloaded | tiled | uploaded | failed | skipped-curation`. Phase 26 writes only `discovered` (and `failed` on retry exhaustion, per D-15).
- `last_error` empty in normal Phase 26 rows; populated only on retry-exhausted Dropbox errors.

**Sibling artifact precedent** (`data/images.csv` head, for shape comparison):

```csv
species_slug,filename,photographer,weight,license,view,specimen,navigational,locality,state,latitude,longitude,elevation_ft,year,month,day,collector,subspecies
abagrotis-apposita,Abagrotis apposita-A-D.jpg,Merrill A. Peterson,1,CC BY-NC-SA 4.0,dorsal,A,,Quartz Mt.,WA,...
```

Filenames-with-spaces are already handled across the codebase (CONTEXT.md "Established Patterns"). No special encoding required for the `filename_raw` column.

**Read-first material for the executor:**
- CONTEXT.md D-05 (canonical column list)
- `data/images.csv` (sibling for shape and ethos)

---

### `_instructions/INGESTING_HIGH_RES_PHOTOS.md` (contributor / operator doc)

**Primary analog:** `_instructions/UPLOADING_IMAGES.md` (Phase 13). Same audience: non-developer curators or LLM agents operating the pipeline. Same shape: "What This Changes" → "Before You Start" → numbered "Steps" → "Verify" → optional warnings.

**Mirror the `UPLOADING_IMAGES.md` section structure** (file shown verbatim above in this analysis; key markers):

1. **`# Task: Ingest High-Res Species Photos`** — top-level title, action-oriented.
2. **`## What This Changes`** — bullet list of files and external surfaces touched. For Phase 26: `data/species-photos-manifest.csv` (new), Dropbox API (read-only). No bunny.net / no CDN cache (that's Phase 29).
3. **`## Before You Start`** — credentials and tool requirements. For Phase 26: Dropbox app token with `files.metadata.read` scope, Node 24 (matches `.nvmrc`), tmux for long-running operation (D-09).
4. **`## Steps`** numbered:
   1. Create Dropbox app + token (mirror the spike's onboarding text from `list-dropbox.mjs:5-9` and the skill reference §"1. List a Dropbox shared-link folder").
   2. Run `DROPBOX_TOKEN=sl... npm run photos:ingest` in tmux (D-09: multi-day continuous; D-10: env-vars-at-invocation).
   3. What to expect in the log output (per-stage lines, retry messages, final summary).
   4. How to interpret the manifest CSV columns (link to D-05 schema), including how to spot rows needing curation.
   5. The `*custom/` deferred-item callout (D-11): explain that Phase 26 deliberately skips it; this section flags it as a future task without committing to a workflow.
5. **`## Verify`** — open the manifest in a spreadsheet, eyeball bucket distribution against the spike audit's percentages (77.5% clean / 89.9% genus-or-better — see ROADMAP.md §"Phase 26" success criteria).

**Concrete things NOT to include (CONTEXT.md "Deferred Ideas"):**
- A `.env` or dotenv path — env-vars-at-invocation is the locked surface.
- A `--genus X` / `--max-images N` flag — rejected for v2.2.
- Any mention of GBIF/ITIS auto-resolution.

**Read-first material for the executor:**
- `_instructions/UPLOADING_IMAGES.md` (entire file — port the shape)
- `_instructions/ADDING_PHOTO.md` (sibling for the "schema table" pattern)
- CONTEXT.md "Integration Points" §"`_instructions/` directory" (which the executor will already have via CONTEXT.md)

---

### Parser unit tests — `scripts/lib/parse-photo-filename.test.js` (and any sibling test for the manifest library)

**Primary analog:** `src/_lib/glossary-transform.test.js` — pure-function unit tests using `node:test`'s `describe` + `it` form. This is the right shape for the parser, which has no I/O.
**Secondary analog:** `scripts/migrate-species.test.js` — integration test using `node:test`'s flat `test()` form with `execSync` to invoke the script. Useful if a smoke test of the full `ingest-photos.js` is added; not required by D-14.

**Test runner registration** — modify the `test` script in `package.json` to include the new test file(s). Existing line (`package.json:20`):

```json
"test": "node --test eleventy.config.test.js scripts/build-data.test.js scripts/check-page-weight.test.js scripts/migrate-species.test.js src/components/*.test.js src/_lib/*.test.js"
```

Add `scripts/lib/*.test.js` (or list the specific test file). The project does not yet have a `scripts/lib/` glob in the `test` command — adding `scripts/lib/*.test.js` is the minimum change.

**Test file imports + shape** — copy from `src/_lib/glossary-transform.test.js:1-9`:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractBinomial, parseSpecimenAndView } from './parse-photo-filename.js';

describe('extractBinomial', () => {
  it('parses Abagrotis apposita-A-D.tif as clean binomial', () => {
    const r = extractBinomial('Abagrotis apposita-A-D.tif');
    assert.equal(r.binomial, 'abagrotis apposita');
    assert.equal(r.bucketHint, null);
  });

  it('parses Autographa v-alba-A-D.tif with hyphenated epithet (FIX #2)', () => {
    assert.equal(extractBinomial('Autographa v-alba-A-D.tif').binomial, 'autographa v-alba');
  });

  it('parses Trichoplusia ni-A-D.tif with 2-char epithet (FIX #1)', () => {
    assert.equal(extractBinomial('Trichoplusia ni-A-D.tif').binomial, 'trichoplusia ni');
  });

  it('routes Monostoecha n sp-A-D.tif to provisional bucket (FIX #3)', () => {
    const r = extractBinomial('Monostoecha n sp-A-D.tif');
    assert.equal(r.binomial, null);
    assert.equal(r.bucketHint, 'provisional');
  });

  // ... one test per D-14-named edge case (see the table in the parser section above)
});
```

**Why `describe`/`it` over flat `test()`** — `glossary-transform.test.js` already groups assertions by function under test using `describe`. The parser will have at least three exported helpers (`extractBinomial`, `parseSpecimenAndView`, maybe `normalizeBinomial`), so a `describe` block per helper keeps the runner output legible.

**Read-first material for the executor:**
- `src/_lib/glossary-transform.test.js` lines 1-60 (pure-function unit test shape)
- `scripts/migrate-species.test.js` lines 1-44 (integration test shape, if a smoke test is added)

---

### `package.json` — add npm aliases

**Primary analog:** existing `migrate:images`, `migrate:species` lines (`package.json:18-19`):

```json
"migrate:images": "node scripts/migrate-images.js",
"migrate:species": "node scripts/migrate-species.js",
```

**Add (D-13 names `photos:ingest` and notes `photos:investigate` as Claude's discretion):**

```json
"photos:ingest": "node scripts/ingest-photos.js",
"photos:investigate": "node scripts/ingest-photos.js"
```

If `photos:investigate` is the same script with an env-var flag (e.g. `RESORT_ONLY=1`) rather than a separate script, that's fine and stays inside D-13's "subcommands rejected; one script per stage" rule. Alternatively the investigate step is just a no-op re-run since the manifest is the recovery state — see D-12 ("re-sorted manifest itself is the queue").

**Also update the `test` script** to include `scripts/lib/*.test.js` (see test section above).

**Read-first material for the executor:**
- `package.json` lines 7-21 (the entire `scripts` block — copy the surrounding style verbatim)

---

## Shared Patterns

### 1. Module-level env-var constants

**Source:** `scripts/upload-plates.js:28-35`, `scripts/migrate-images.js:34-44`
**Apply to:** `scripts/ingest-photos.js`

```js
const FOO = process.env.FOO ?? 'default';
```

Project convention (PROJECT.md Key Decisions; CONTEXT.md "Established Patterns"). No dotenv, no XDG config, no argparse. D-10 locks env-vars-at-invocation as the secret-passing surface for v2.2.

### 2. API key redaction in errors

**Source:** `scripts/upload-plates.js:112`
**Apply to:** `scripts/ingest-photos.js`, `scripts/lib/dropbox-list.js` (whichever catches errors)

```js
const safeMsg = err.message.replace(new RegExp(BUNNY_API_KEY, 'g'), '[REDACTED]');
```

For Phase 26: substitute `DROPBOX_TOKEN` for `BUNNY_API_KEY`. CONTEXT.md "Specifics" elevates this to a hard rule.

### 3. `DRY_RUN=1` prints first N then exits

**Source:** `scripts/upload-plates.js:67-75`
**Apply to:** `scripts/ingest-photos.js`

For Phase 26: print first 5 Dropbox list entries (path, size, hash), then exit without writing the manifest. CONTEXT.md "Established Patterns".

### 4. csv-parse/sync + csv-stringify/sync with `columns` array

**Source:** `scripts/migrate-images.js:21-22, 143, 300, 335-336`; `scripts/migrate-species.js:18-19, 32-39, 370, 474-475, 537-538`
**Apply to:** `scripts/lib/manifest.js`

The `columns` array doubles as schema enforcement and column-order pin. Phase 26's `COLUMNS` array IS the D-05 manifest schema definition.

### 5. Self-invocation guard at file end

**Source:** `scripts/upload-plates.js:128-133`, `scripts/migrate-images.js:340-345`, `scripts/migrate-species.js:542-547`
**Apply to:** `scripts/ingest-photos.js`

```js
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}
```

Every `scripts/` file ends this way. Mirror exactly.

### 6. `lower(genus + '-' + species)` slug normalization

**Source:** CONTEXT.md "Specifics" + `scripts/migrate-species.js:482-489` (the `speciesDbSlugMap` construction)
**Apply to:** the classification cascade inside `scripts/ingest-photos.js` (or a helper in `scripts/lib/parse-photo-filename.js`)

Match lookups normalize the same way the source DB does — `lower(genus || '-' || species)`. The spike's `parse-classify.mjs:94-95` already does this (`bySlug.set(slug, r)` where `slug = ${genus}-${species}.toLowerCase()`); port that normalization rule with the parser.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| (none) | — | — | Every Phase 26 artifact has a strong local analog. The closest gap is the *async-generator* shape for `dropbox-list.js` — no in-repo helper currently yields paginated API results — but `for await ... of` is standard Node and the spike's iteration loop is a direct port. |

The codebase is unusually well-suited for this phase. The Phase 13 migrate-images workflow + the Phase 18 upload-plates resumability harness + the spike's working scripts cover every needed pattern. The executor's job is composition, not invention.

---

## Metadata

**Analog search scope:** `scripts/`, `_instructions/`, `data/`, `package.json`, `.planning/spikes/001-dropbox-photo-audit/`, `src/_lib/` (test pattern)
**Files scanned:** ~14 (5 scripts, 1 test file representative, 2 sibling manifests, 1 instructions sibling, 1 package.json, 3 spike sources, 1 spike report, 1 skill reference)
**Pattern extraction date:** 2026-05-21
