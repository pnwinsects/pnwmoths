# Phase 13: CDN Provisioning - Pattern Map

**Mapped:** 2026-04-21
**Files analyzed:** 4 (2 new, 2 modified)
**Analogs found:** 4 / 4

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `eleventy.config.js` | config | request-response | `eleventy.config.js` itself (inspect for constant pattern) | self |
| `data/images.csv` | data/schema | batch | `data/species.csv` (CSV schema peer) | role-match |
| `scripts/migrate-images.js` | utility | batch / file-I/O | `scripts/copy-plates.js` (legacy-source scan + slug derivation + file ops) | exact |
| `_instructions/UPLOADING_IMAGES.md` | doc | — | `_instructions/ADDING_PHOTO.md` | exact |

---

## Pattern Assignments

### `eleventy.config.js` — add CDN_BASE_URL constant

**Analog:** `eleventy.config.js` itself (lines 1–10) — the `pathPrefix` constant is the canonical precedent for a top-of-file public URL constant driven by project policy, not a secret.

**Existing constant pattern** (lines 9–10):
```js
// On GitHub Pages the site lives under /pnwmoths/. actions/configure-pages sets
// GITHUB_PAGES=true so the build knows to apply the prefix. Locally the dev
// server serves at root, so we use "/" which makes | url a no-op.
const pathPrefix = process.env.GITHUB_PAGES ? "/pnwmoths/" : "/";
```

**New constant to add** — copy the pattern, but simpler (no env conditional per D-01):
```js
// bunny.net Pull Zone — public CDN base URL. Not a secret; hard-coded here.
// Change only when the Pull Zone hostname changes (see bunny.net dashboard).
const CDN_BASE_URL = "https://pnwmoths.b-cdn.net";
```

Place it immediately after `pathPrefix` (line 10), before `export default function`. The constant will be consumed by Phase 14 template code; Phase 13 just establishes it.

---

### `data/images.csv` — rebuild with original Django filenames

**Analog:** `data/images.csv` (current schema, lines 1–8); `data/species.csv` (peer CSV).

**Current schema** (line 1 — header):
```
species_slug,filename,photographer,weight,license,view,specimen,navigational
```

**Schema stays identical.** What changes:
- `filename` values change from sequential numbers (`01.jpg`) to original Django filenames (`Acronicta americana-A-D.jpg`) — spaces preserved in the filename string.
- `navigational` is blank for all migrated rows (per D-06 / established pattern in `## Existing Code Insights`).
- `view` and `specimen` values are derivable from filename suffix (e.g. `-A-D` → specimen=A, view=dorsal).

**Validation note** — `build-data.js` lines 76–79 currently reject filenames containing spaces:
```js
if (!/^[a-zA-Z0-9._-]+$/.test(row.filename)) {
  throw new Error(`Invalid image filename "${row.filename}" in images.csv ...`);
}
```
This regex must be relaxed to allow spaces (or the migration script must URL-encode/replace spaces). The planner must create a task to update `build-data.js` validation alongside the CSV rebuild. (Phase 13 scope — the migration script produces the new CSV, and the validator must accept it.)

**Representative new row:**
```
acronicta-americana,Acronicta americana-A-D.jpg,Jane Doe,1,CC BY 4.0,dorsal,A,
```

---

### `scripts/migrate-images.js` — one-time migration script

**Primary analog:** `scripts/copy-plates.js` — closest match: reads from a legacy Django local source directory, parses filenames to derive slugs, skips subdirectories/unparseable names, performs file I/O operations, writes a manifest/output file. Also uses `process.env` overrides for source paths.

**Secondary analog:** `scripts/build-data.js` — CSV parsing, `csv-parse/sync`, validation loops, `process.exit(1)` on error, `if (import.meta.url === ...)` guard.

**Imports pattern** (from `copy-plates.js` lines 10–16 + `build-data.js` lines 3–6):
```js
// scripts/migrate-images.js
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, extname, basename } from 'node:path';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
```

**Legacy source path pattern** (from `copy-plates.js` lines 17–22):
```js
const DEFAULT_MOTHS_SOURCE = '/Users/rainhead/dev/pnwinsects-app/pnwmoths_https/usr/local/www/pnwmoths/django/pnwmoths/static/media/moths';
const DEFAULT_GLOSSARY_SOURCE = '/Users/rainhead/dev/pnwinsects-app/pnwmoths_https/usr/local/www/pnwmoths/django/pnwmoths/static/media/glossary-images';
const MOTHS_SOURCE = process.env.MOTHS_SOURCE ?? DEFAULT_MOTHS_SOURCE;
const GLOSSARY_SOURCE = process.env.GLOSSARY_SOURCE ?? DEFAULT_GLOSSARY_SOURCE;
```

**Directory scan + skip-subdirectory pattern** (from `copy-plates.js` lines 62–79):
```js
const entries = await readdir(MOTHS_SOURCE, { withFileTypes: true });
const files = entries.filter(e => e.isFile());  // skip thumbnail/, medium/, cache/ subdirs
```

**Filename parse + slug derivation pattern** (adapted from `copy-plates.js` `parseDirName`/`toSlug` functions, lines 42–58; and `build-data.js` slug pattern line 209):
```js
// Django species photo filename: "{Genus} {species}-{Specimen}-{View}.jpg"
// e.g. "Acronicta americana-A-D.jpg"
function parseMotFilename(fname) {
  // Skip non-standard filenames (purely numeric IDs like 0817021.JPG)
  const match = fname.match(/^([A-Z][a-z]+) ([a-z]+)-/);
  if (!match) return null;   // caller logs and skips
  return { genus: match[1], species: match[2] };
}

function toSlug(genus, species) {
  // Mirrors build-data.js line 209
  return `${genus}-${species}`.toLowerCase().replace(/\s+/g, '-');
}
```

**CSV read pattern** (from `build-data.js` lines 17–49 — `validateCsv`):
```js
// Read species.csv to build slug→id lookup
import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
const speciesRaw = readFileSync('data/species.csv');
const speciesRows = parse(speciesRaw, { columns: true, skip_empty_lines: true });
const slugToId = Object.fromEntries(
  speciesRows.map(r => [
    `${r.genus}-${r.species}`.toLowerCase(),
    r.id
  ])
);
```

**CSV write pattern** (use `csv-stringify/sync`, consistent with `csv-parse/sync` already in project):
```js
import { stringify } from 'csv-stringify/sync';
const csvOut = stringify(outputRows, { header: true, columns: COLUMNS });
await writeFile('data/images.csv', csvOut);
```

**Error handling pattern** (from `build-data.js` lines 228–231 and `copy-plates.js` `console.warn` pattern):
```js
// Non-fatal skip with warning (copy-plates.js pattern)
console.warn(`[migrate-images] Skipping unparseable filename: ${fname}`);

// Fatal exit (build-data.js pattern)
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}
```

**rclone upload invocation** — no existing analog in codebase. Use `node:child_process` `execFileSync` or `spawnSync` (the project uses `execFileSync` in `copy-plates.js` line 35 for `cp -rl`):
```js
import { execFileSync } from 'node:child_process';
// Upload one slug directory to CDN storage zone via rclone FTP remote
execFileSync('rclone', [
  'copy', '--ignore-times',
  join(MOTHS_SOURCE, fname),
  `bunny:pnwmoths/${slug}/${fname}`
], { stdio: 'inherit' });
```

---

### `_instructions/UPLOADING_IMAGES.md` — contributor upload workflow

**Analog:** `_instructions/ADDING_PHOTO.md` — exact structural match.

**Doc structure pattern** (from `ADDING_PHOTO.md`):
```markdown
# Task: [Verb] [object]          ← imperative heading

## What This Changes             ← scope section (files/systems affected)
- bullet list

## Schema: [relevant data file]  ← schema section (if CSV is involved)
| Field | Type | Required | Example |

## Steps                         ← numbered procedure
1. ...
2. ...

## Verify                        ← success/failure checks
- Expected: ...
- Failure: ...

## [Optional alternative]        ← Docker / alternate method
```

**Tone/style observations from `ADDING_PHOTO.md` and `ADDING_SPECIES.md`:**
- Second-person imperative ("Find the species_id", "Copy the image file").
- Code blocks use triple-backtick with `bash` or `csv` lang tag.
- Schema tables use `| Field | Type | Required | Example |` columns.
- Failure modes called out explicitly under "Verify".
- Short sentences; no prose padding.

**`UPLOADING_IMAGES.md` must cover** (per D-13):
1. How to request FTP credentials + API key from project owner.
2. `rclone` FTP remote setup for bunny.net Storage Zone.
3. `rclone copy --ignore-times` for new + replacement uploads.
4. `rclone copy` vs `rclone sync` warning (per PITFALLS.md — sync deletes files on destination).
5. Cache invalidation via `curl` bunny.net Purge API (requires API key).

---

## Shared Patterns

### File-I/O error handling (skips vs. fatal exits)
**Source:** `scripts/copy-plates.js` lines 25–38 (graceful skip on missing source), lines 66–79 (`console.warn` for unparseable names)
**Apply to:** `scripts/migrate-images.js`
```js
// Graceful exit when source does not exist
if (!existsSync(MOTHS_SOURCE)) {
  console.warn('[migrate-images] Moths source not found — skipping');
  process.exit(0);
}
// Non-fatal per-file skip
console.warn(`[migrate-images] Skipping unparseable filename: ${fname}`);
```

### ESM guard pattern (run directly or imported by tests)
**Source:** `scripts/build-data.js` lines 228–231; `scripts/emit-species-states.js` lines 51–55
**Apply to:** `scripts/migrate-images.js`
```js
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}
```

### CSV validation before processing
**Source:** `scripts/build-data.js` `validateCsv` function (lines 17–50)
**Apply to:** `scripts/migrate-images.js` when reading `data/species.csv` and the Django DB export CSV
```js
// Reuse or inline validateCsv pattern: readFileSync → TextDecoder UTF-8 check → csv-parse → column check
```

### filename validation regex (MUST be relaxed for Phase 13)
**Source:** `scripts/build-data.js` lines 76–79
**Current regex (rejects spaces):**
```js
if (!/^[a-zA-Z0-9._-]+$/.test(row.filename)) { ... }
```
**Must be updated to allow spaces in original Django filenames:**
```js
if (!/^[a-zA-Z0-9 ._-]+$/.test(row.filename)) { ... }
```
**Apply to:** `scripts/build-data.js` — this is a required modification in Phase 13 scope.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| rclone FTP remote config (`~/.config/rclone/rclone.conf`) | config | file-I/O | No rclone integration exists in codebase; rclone is external tooling documented in UPLOADING_IMAGES.md |
| bunny.net Purge API call | utility | request-response | No HTTP API call scripts exist in codebase; documented as a `curl` one-liner in UPLOADING_IMAGES.md |

---

## Metadata

**Analog search scope:** `/Users/rainhead/dev/pnwmoths/scripts/`, `/Users/rainhead/dev/pnwmoths/_instructions/`, `/Users/rainhead/dev/pnwmoths/data/`, `/Users/rainhead/dev/pnwmoths/eleventy.config.js`
**Files scanned:** 8 (eleventy.config.js, copy-images.js, copy-plates.js, build-data.js, emit-species-states.js, images.csv, species.csv, ADDING_PHOTO.md, ADDING_SPECIES.md)
**Pattern extraction date:** 2026-04-21
