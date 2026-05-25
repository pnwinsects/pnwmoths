# Phase 31: `data/species-photos.json` Build Integration - Pattern Map

**Mapped:** 2026-05-23
**Files analyzed:** 4 (1 new, 3 modified)
**Analogs found:** 4 / 4

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `scripts/generate-species-photos.js` | utility/script | batch (filter → group → serialize) | `scripts/upload-tiles.js` | exact (same pipeline role, same project conventions) |
| `scripts/generate-species-photos.test.js` | test | — | `scripts/upload-tiles.test.js` | exact (same framework, row factory, export-under-test pattern) |
| `data/species-photos.json` | data artifact | — | `data/species-photos.json` (pilot entry, already exists) | exact (shape locked) |
| `src/species/species.njk` | template | request-response (Eleventy build) | `src/species/species.njk` lines 40–46 (existing guard) | self (one-line modification to existing conditional block) |
| `package.json` | config | — | `package.json` existing `photos:` aliases | exact |

---

## Pattern Assignments

### `scripts/generate-species-photos.js` (utility/script, batch)

**Analog:** `scripts/upload-tiles.js`

**File-header comment pattern** (upload-tiles.js lines 1–33):
```javascript
/**
 * scripts/generate-species-photos.js
 *
 * Phase 31 (v2.2 high-res photos): derive data/species-photos.json from the
 * manifest's uploaded rows.
 * Reads data/species-photos-manifest.csv, filters rows with status=uploaded,
 * groups by species_slug, sorts specimens (alphabetical specimen_id, D before V),
 * and writes data/species-photos.json.
 *
 * Usage:
 *   node scripts/generate-species-photos.js
 *   DRY_RUN=1 node scripts/generate-species-photos.js   # prints derived JSON; no write
 *
 * The output JSON is committed to the repo; Eleventy reads it at build time
 * via src/_data/speciesPhotos.js. Run after photos:upload; commit the result.
 */
```

**Module-level env constants pattern** (upload-tiles.js lines 44–53):
```javascript
// ---------------------------------------------------------------------------
// Module-level env constants (project convention).
// ---------------------------------------------------------------------------

const MANIFEST_PATH = resolve('data/species-photos-manifest.csv');
const OUTPUT_PATH = resolve('data/species-photos.json');
const DRY_RUN = process.env.DRY_RUN === '1';
```

**`redact` helper — copy verbatim** (upload-tiles.js lines 71–75):
```javascript
function redact(msg) {
  return BUNNY_API_KEY
    ? msg.replace(new RegExp(BUNNY_API_KEY, 'g'), '[REDACTED]')
    : msg;
}
```
Note: Phase 31 has no API key. `redact` is still copied verbatim per D-13 (project convention), but the guard body will reference no secret variable. Simplest approach: copy the function but pass `msg` through unchanged (empty-key guard already handles this case — `new RegExp('', 'g')` matches everything, so the existing guard `if (BUNNY_API_KEY)` returning `msg` unchanged is already the right behavior for a keyless script).

**`logStage` helper — copy verbatim** (upload-tiles.js lines 109–115):
```javascript
function logStage(content_hash, action, outcome, extra = '') {
  const hashPrefix = (content_hash ?? '').slice(0, 12).padEnd(12);
  const actionField = String(action).padEnd(16);
  console.log(
    `${new Date().toISOString()} ${hashPrefix} ${actionField} ${outcome}${extra ? '  ' + extra : ''}`
  );
}
```

**Exported pure-function pattern** (upload-tiles.js lines 140–181, mirrors `isUploadable`, `tileUploadPath`):
```javascript
// ---------------------------------------------------------------------------
// Exported helpers (exported at module level for unit tests).
// ---------------------------------------------------------------------------

/**
 * Returns true if the row is eligible for materialization.
 * Only rows with status=uploaded are included in the output JSON.
 */
export function isMaterializable(row) {
  return row.status === 'uploaded';
}

/**
 * Construct the tiles_path for a manifest row.
 * Convention: species-tiles/{slug-lowercase}/{specimen_id}-{view}  (no trailing slash).
 * species_slug lowercased unconditionally (Phase 28/29 lesson).
 */
export function toTilesPath(row) {
  return `species-tiles/${row.species_slug.toLowerCase()}/${row.specimen_id}-${row.view}`;
}

/**
 * Build the full species-photos output object from a set of manifest rows.
 * Only rows passing isMaterializable() are included.
 * Specimens within each species are sorted: specimen_id alphabetical, then D before V.
 *
 * @param {Array<Object>} rows  - All manifest rows (unfiltered)
 * @returns {Object}            - Output keyed by species_slug; value: {high_res_available, specimens}
 */
export function buildSpeciesPhotos(rows) {
  const uploadedRows = rows.filter(isMaterializable);
  const bySlug = {};
  for (const row of uploadedRows) {
    const slug = row.species_slug.toLowerCase();
    if (!bySlug[slug]) bySlug[slug] = [];
    bySlug[slug].push({
      specimen_id: row.specimen_id,
      view: row.view,
      tiles_path: toTilesPath(row),
    });
  }
  const result = {};
  for (const [slug, specimens] of Object.entries(bySlug).sort()) {
    specimens.sort((a, b) => {
      const idCmp = a.specimen_id.localeCompare(b.specimen_id);
      if (idCmp !== 0) return idCmp;
      return a.view.localeCompare(b.view); // D < V alphabetically
    });
    result[slug] = { high_res_available: true, specimens };
  }
  return result;
}
```

**DRY_RUN guard before side-effects** (upload-tiles.js lines 272–288):
```javascript
// --- DRY_RUN path: print derived JSON without writing. ---
if (DRY_RUN) {
  console.log('[generate-species-photos] DRY_RUN=1 — derived JSON (not written):');
  console.log(JSON.stringify(result, null, 2));
  console.log(`[generate-species-photos] ${uploadedRows.length} uploaded rows → ${Object.keys(result).length} species`);
  return;
}
```

**Summary block pattern** (upload-tiles.js lines 387–395):
```javascript
console.log('');
console.log('[generate-species-photos] summary:');
console.log(`  uploaded rows processed:  ${uploadedRows.length}`);
console.log(`  species with high-res:    ${Object.keys(result).length}`);
console.log(`  total specimens:          ${uploadedRows.length}`);
console.log(`[generate-species-photos] wrote ${OUTPUT_PATH}`);
```

**Self-invocation guard — copy verbatim** (upload-tiles.js lines 402–404):
```javascript
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(redact(err.message)); process.exit(1); });
}
```

**`main()` structure** (upload-tiles.js lines 255–396, simplified for Phase 31):
```javascript
async function main() {
  const rows = await readManifest(MANIFEST_PATH);
  const uploadedRows = rows.filter(isMaterializable);

  console.log(
    `[generate-species-photos] manifest: ${rows.length} rows total; ${uploadedRows.length} eligible (status=uploaded)`
  );

  const result = buildSpeciesPhotos(rows);

  if (DRY_RUN) {
    // ... DRY_RUN block above ...
    return;
  }

  await writeFile(OUTPUT_PATH, JSON.stringify(result, null, 2) + '\n');

  // summary block
}
```

**Imports pattern** (upload-tiles.js lines 35–39):
```javascript
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { readManifest } from './lib/manifest.js';
```
Note: `existsSync` is only needed if the script checks for `MANIFEST_PATH` before calling `readManifest` (which already handles missing file gracefully). May not be needed.

---

### `scripts/generate-species-photos.test.js` (test)

**Analog:** `scripts/upload-tiles.test.js`

**Imports and framework pattern** (upload-tiles.test.js lines 1–6):
```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSpeciesPhotos, isMaterializable, toTilesPath } from './generate-species-photos.js';
```

**Row factory pattern — copy and adapt** (upload-tiles.test.js lines 14–31):
```javascript
// ---------------------------------------------------------------------------
// Row factory — supplies all 13 COLUMNS values so tests don't accidentally
// pass because a property was absent rather than falsy.
// Default status is 'uploaded' (Phase 31 eligible status).
// ---------------------------------------------------------------------------

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
    status: 'uploaded',
    last_error: '',
    ...overrides,
  };
}
```

**Test suite structure** (upload-tiles.test.js lines 37–80):
```javascript
describe('isMaterializable', () => {
  it('returns true for status uploaded', () => {
    assert.equal(isMaterializable(row({ status: 'uploaded' })), true);
  });
  it('returns false for status tiled', () => {
    assert.equal(isMaterializable(row({ status: 'tiled' })), false);
  });
});

describe('toTilesPath', () => {
  it('constructs path without trailing slash', () => {
    const result = toTilesPath(row({ species_slug: 'abagrotis-apposita', specimen_id: 'A', view: 'D' }));
    assert.equal(result, 'species-tiles/abagrotis-apposita/A-D');
  });
  it('lowercases mixed-case species_slug', () => {
    const result = toTilesPath(row({ species_slug: 'Abagrotis-Apposita', specimen_id: 'A', view: 'D' }));
    assert.equal(result, 'species-tiles/abagrotis-apposita/A-D');
  });
});

describe('buildSpeciesPhotos', () => {
  it('filters non-uploaded rows', () => { ... });
  it('groups by species_slug', () => { ... });
  it('sorts specimens: specimen_id alpha, then D before V', () => { ... });
  it('sets high_res_available: true for every species in output', () => { ... });
  it('returns {} for empty uploaded set (graceful empty-set handling)', () => { ... });
  it('matches pilot JSON shape for abagrotis-apposita', () => { ... });
});
```

---

### `data/species-photos.json` (data artifact)

**No code change required from planner.** The file is overwritten by `scripts/generate-species-photos.js` when the operator runs `npm run photos:materialize`. The locked output shape is:

```json
{
  "abagrotis-apposita": {
    "high_res_available": true,
    "specimens": [
      { "specimen_id": "A", "view": "D", "tiles_path": "species-tiles/abagrotis-apposita/A-D" },
      { "specimen_id": "A", "view": "V", "tiles_path": "species-tiles/abagrotis-apposita/A-V" }
    ]
  }
}
```

Source: `data/species-photos.json` lines 1–9 (current pilot entry — the locked shape reference).

---

### `src/species/species.njk` (template, one-line modification)

**Analog:** Self — existing guard pattern at lines 40–46 of the same file.

**Existing conditional guard pattern to mirror** (species.njk lines 40–46):
```nunjucks
{% if highResEntry and highResEntry.high_res_available %}
high-res-available
high-res-specimens="{{ highResEntry.specimens | tojson | escape }}"
cdn-base-url="{{ cdnBaseUrl }}"
prefix-url="{{ '/osd-images/' | url }}"
{% endif %}
```

**Current line to replace** (species.njk line 47):
```nunjucks
{% if spImages and spImages.length > 0 %}
```

**Replacement line (D-04, exact string):**
```nunjucks
{% if (not (highResEntry and highResEntry.high_res_available)) and spImages and spImages.length > 0 %}
```

The closing `{% endif %}` at line 70 is unchanged. Only line 47 changes. The `not` keyword and explicit parentheses are required — see RESEARCH.md Pitfall 3 on operator precedence.

---

### `package.json` (config, two additions)

**Analog:** Existing `photos:` aliases in `package.json` lines 21–24.

**Existing `photos:` alias pattern** (package.json lines 21–24):
```json
"photos:ingest": "node scripts/ingest-photos.js",
"photos:investigate": "RESORT_ONLY=1 node scripts/ingest-photos.js",
"photos:tile": "node scripts/tile-photos.js",
"photos:upload": "node scripts/upload-tiles.js",
```

**New alias to add** (insert after `photos:upload`):
```json
"photos:materialize": "node scripts/generate-species-photos.js",
```

**Existing `npm test` command to extend** (package.json line 25):
```json
"test": "node --test eleventy.config.test.js scripts/build-data.test.js scripts/check-page-weight.test.js scripts/ingest-photos.test.js scripts/migrate-species.test.js scripts/tile-photos.test.js scripts/upload-tiles.test.js scripts/lib/*.test.js src/components/*.test.js src/_lib/*.test.js"
```

**Updated `npm test` (add `scripts/generate-species-photos.test.js` before `scripts/lib/*.test.js`):**
```json
"test": "node --test eleventy.config.test.js scripts/build-data.test.js scripts/check-page-weight.test.js scripts/ingest-photos.test.js scripts/migrate-species.test.js scripts/tile-photos.test.js scripts/upload-tiles.test.js scripts/generate-species-photos.test.js scripts/lib/*.test.js src/components/*.test.js src/_lib/*.test.js"
```

---

## Shared Patterns

### Self-Contained Script Convention (D-13)
**Source:** `scripts/upload-tiles.js` lines 57–115 (comment block + helpers)
**Apply to:** `scripts/generate-species-photos.js`

Project convention requires `logStage` and `redact` to be copied verbatim into each `photos:` pipeline script rather than imported from a shared module. `readManifest` from `./lib/manifest.js` IS imported (it is a library function, not a helper).

### `readManifest` Usage
**Source:** `scripts/lib/manifest.js` lines 73–77; used in `upload-tiles.js` line 263
```javascript
const rows = await readManifest(MANIFEST_PATH);
// readManifest returns [] if MANIFEST_PATH does not exist (first-run safe).
// Filter to eligible rows after reading all rows.
const uploadedRows = rows.filter(isMaterializable);
```

### ESM Module Format
**Source:** All scripts in `scripts/` use `import`/`export` (package.json `"type": "module"`)
**Apply to:** `scripts/generate-species-photos.js` and its test file.

### Graceful Empty-Set Handling
**Source:** `scripts/upload-tiles.js` lines 268–270; `src/_data/speciesPhotos.js` lines 16–18
**Apply to:** `scripts/generate-species-photos.js` `main()`

If no rows have `status: uploaded`, the script writes `{}` and logs an informative count. This is the expected local-dev behavior (Phase 30 uploads ran on a remote server). `buildSpeciesPhotos([])` must return `{}` without error.

---

## No Analog Found

All files in Phase 31 have direct analogs. No entries in this section.

---

## Metadata

**Analog search scope:** `scripts/`, `src/species/`, `src/_data/`, `data/`, `package.json`
**Files read:** `scripts/upload-tiles.js`, `scripts/upload-tiles.test.js`, `scripts/tile-photos.js` (lines 1–100), `scripts/lib/manifest.js`, `src/species/species.njk` (lines 1–80), `src/_data/speciesPhotos.js`, `data/species-photos.json`, `package.json`
**Pattern extraction date:** 2026-05-23
