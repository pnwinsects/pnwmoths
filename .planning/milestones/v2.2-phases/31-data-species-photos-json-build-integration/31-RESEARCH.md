# Phase 31: `data/species-photos.json` Build Integration — Research

**Researched:** 2026-05-23
**Domain:** Node.js manifest processing, Eleventy static data files, Nunjucks template guards
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01 (script + commit pattern):** `scripts/generate-species-photos.js` is a standalone script; operator runs `npm run photos:materialize` after the upload pipeline and commits `data/species-photos.json`. Follows the `data/plates.json` committed-snapshot pattern. `src/_data/speciesPhotos.js` reads the committed JSON at Eleventy build time — no manifest CSV parsing at build time.
- **D-02 (npm alias):** `photos:materialize` — following the `photos:ingest` / `photos:tile` / `photos:upload` naming convention.
- **D-03 (high-res replaces, not coexists):** High-res photos fully replace low-res entries on a per-species basis. For a species with `high_res_available: true`, the low-res `<figure>` elements from `images.csv` are suppressed in the template — they do not appear in the static HTML output at all.
- **D-04 (template guard location):** The guard wraps the `{% if spImages and spImages.length > 0 %}` block in `src/species/species.njk` — change to `{% if (not (highResEntry and highResEntry.high_res_available)) and spImages and spImages.length > 0 %}`. The `<pnwm-image-slideshow>` component still receives `high-res-available` and `high-res-specimens` attributes; the slot content is simply empty for high-res species until Phase 32 adds component-side thumbnail rendering.
- **Script logging:** Follow `upload-tiles.js` / `tile-photos.js` pattern — `logStage`-style per-species output, summary at end (count uploaded, species with high-res, total specimens).
- **Multi-specimen ordering in JSON array:** Alphabetical by `specimen_id`, then D before V within the same specimen.
- **`DRY_RUN=1` behavior:** Print the derived JSON (or a summary) without writing `data/species-photos.json`. Consistent with other `photos:` scripts.
- **Self-contained helpers:** No shared-module imports; copy `redact` and `logStage` from `tile-photos.js` verbatim (project convention D-13 from Phase 26).

### Claude's Discretion

- Script logging format, summary counts, DRY_RUN output format (print derived JSON or summary)
- Multi-specimen ordering within a species entry
- DRY_RUN=1 behavior details

### Deferred Ideas (OUT OF SCOPE)

- No-JS fallback for high-res species (Phase 32 concern)
- Phase 32 thumbnail source from `high-res-specimens` attribute
- Fix close button on the lightbox
- Migrate Pagefind to Component UI
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DATA-01 | Build pipeline derives `data/species-photos.json` from the manifest with per-species entries containing CDN tile path, `specimen_id`, `view`, and metadata for OSD viewer | Locked shape from pilot entry; `readManifest` returns all columns; filter `status === 'uploaded'`; group by `species_slug` |
| DATA-02 | Each species record in the Eleventy data tree carries a `high_res_available` boolean so templates branch viewer choice without re-querying the manifest | `speciesPhotos.js` already exposes this; shape is `{high_res_available: bool, specimens: [...]}` — locked |
| DATA-03 | When a species has high-res photos, legacy low-res entries from `images.csv` are deprecated in the build (templates render only high-res — no double rendering) | Template guard in `species.njk` line 47; exact Nunjucks syntax confirmed by reading the template |
</phase_requirements>

---

## Summary

Phase 31 is a well-scoped data integration phase with two distinct deliverables: a standalone Node.js script (`scripts/generate-species-photos.js`) that materializes `data/species-photos.json` from the manifest's `uploaded` rows, and a one-line Nunjucks guard in `src/species/species.njk` that suppresses low-res `<figure>` elements for species where `high_res_available` is true.

All design decisions are locked by CONTEXT.md. The script follows a clear pattern established by `upload-tiles.js` and `tile-photos.js` — self-contained helpers, module-level env constants, `DRY_RUN=1` guard before side-effects, `logStage` format, summary at end. The output JSON shape is locked by the Phase 28 pilot entry in `data/species-photos.json`. The Eleventy data loader (`src/_data/speciesPhotos.js`) already reads the committed JSON correctly and must not change.

The manifest currently has zero `status: uploaded` rows on the local development machine (Phase 30's upload ran on a datacenter server). This means the `photos:materialize` script must handle the empty-uploaded-set gracefully and the test suite must supply synthetic `uploaded`-status rows via a row factory — identical to how `tile-photos.test.js` and `upload-tiles.test.js` were constructed.

**Primary recommendation:** Implement `scripts/generate-species-photos.js` by closely mirroring `upload-tiles.js` structure (env constants, DRY_RUN, logStage, summary), then update `species.njk` line 47 with the D-04 Nunjucks guard.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Manifest reading and filtering | Build-time script | — | Operator-run; reads CSV manifest; no Eleventy involvement |
| JSON materialization | Build-time script | — | `generate-species-photos.js` writes `data/species-photos.json`; committed to repo |
| Eleventy data exposure | Eleventy data file (`src/_data/speciesPhotos.js`) | — | Already implemented; reads committed JSON; returns object keyed by slug |
| Template branching (high-res vs low-res) | Frontend Server (Nunjucks template) | — | `species.njk` guard wraps `<figure>` loop at build time; static HTML output |
| `high_res_available` flag propagation | Build-time script → committed JSON → Eleventy data tree | — | Flag is in the JSON output shape; Eleventy exposes it; template reads it |

---

## Standard Stack

### Core

No new dependencies are needed. All required libraries are already installed.

| Library | Version (installed) | Purpose | Why Standard |
|---------|---------------------|---------|--------------|
| `csv-parse` | ^6.2.1 | Read `data/species-photos-manifest.csv` | Already used in `scripts/lib/manifest.js`; `readManifest()` wraps it |
| `node:fs/promises` | built-in | Write `data/species-photos.json` | Project convention throughout all scripts |
| `node:fs` | built-in | `existsSync` guard | Project convention |

### No New Packages

This phase installs no new packages. `scripts/generate-species-photos.js` imports only:
- `./lib/manifest.js` (for `readManifest`) — **but wait**: D-04 "self-contained helpers" means the script does NOT import `logStage`/`redact` from lib; it copies them verbatim. It DOES import `readManifest` from `./lib/manifest.js` (read-only manifest access is not a helper — it is a library function). [VERIFIED: CONTEXT.md §"Self-contained helpers": "copy `redact` and `logStage` from `tile-photos.js` verbatim (project convention D-13 from Phase 26)"]
- `node:fs/promises`, `node:fs` (built-ins)

---

## Package Legitimacy Audit

No new packages are installed in this phase. This section is not applicable.

---

## Architecture Patterns

### System Architecture Diagram

```
data/species-photos-manifest.csv
         |
         | readManifest()
         v
scripts/generate-species-photos.js
  - filter status === 'uploaded'
  - group by species_slug
  - sort specimens: specimen_id alpha, then D before V
  - build {high_res_available: true, specimens: [...]} per species
         |
         | writeFile (or DRY_RUN: console.log)
         v
data/species-photos.json          <-- committed to repo
         |
         | Eleventy build reads via src/_data/speciesPhotos.js
         v
speciesPhotos global data variable (keyed by species slug)
         |
         | species.njk iterates species pagination
         v
src/species/species.njk
  - highResEntry = speciesPhotos[sp.slug]
  - pnwm-image-slideshow attributes: high-res-available, high-res-specimens (unchanged)
  - DATA-03 guard: {% if (not (highResEntry and highResEntry.high_res_available)) ... %}
    suppresses low-res <figure> loop for high-res species
         |
         v
_site/species/{slug}/index.html  (1,364 pages; high-res species: empty <figure> slot)
```

### Recommended Project Structure

No new directories. Two files change, one new file:

```
scripts/
├── generate-species-photos.js   # NEW: materialize JSON from manifest
├── lib/
│   └── manifest.js              # unchanged (read-only use)
data/
└── species-photos.json          # UPDATED: manifest-derived, committed
src/species/
└── species.njk                  # UPDATED: DATA-03 guard on line 47
package.json                     # UPDATED: photos:materialize script alias
```

### Pattern 1: Committed-Snapshot Script

**What:** A standalone `node scripts/generate-*.js` script reads a CSV manifest, filters and transforms rows, and writes a committed JSON file. Eleventy reads the committed JSON at build time — no manifest access during the build.
**When to use:** When the source data changes rarely (operator-triggered), is large/complex for build-time parsing, and the build must be reproducible from the committed artifact alone.
**Example:**

```javascript
// Source: data/plates.json + src/_data/plates.js pattern (Phase 18)
// Operator runs: node scripts/generate-species-photos.js
// Then commits: data/species-photos.json
// Eleventy reads: JSON.parse(await readFile(MANIFEST_PATH)) in src/_data/speciesPhotos.js
```

### Pattern 2: Self-Contained Script Helpers

**What:** Each `scripts/*.js` file copies `logStage`, `redact`, and `sleep` verbatim rather than importing from a shared module.
**When to use:** Always, for `photos:` pipeline scripts. Project convention D-13 from Phase 26. [VERIFIED: scripts/upload-tiles.js lines 60–115; scripts/tile-photos.js lines 57–80+]

```javascript
// Source: scripts/upload-tiles.js lines 109–115
function logStage(content_hash, action, outcome, extra = '') {
  const hashPrefix = (content_hash ?? '').slice(0, 12).padEnd(12);
  const actionField = String(action).padEnd(16);
  console.log(
    `${new Date().toISOString()} ${hashPrefix} ${actionField} ${outcome}${extra ? '  ' + extra : ''}`
  );
}
```

### Pattern 3: DRY_RUN Guard Before Side-Effect Guards

**What:** `const DRY_RUN = process.env.DRY_RUN === '1';` at module top; `if (DRY_RUN) { /* print + return */ }` before any file-write or API-key check.
**When to use:** All `photos:` scripts. Enables inspection without needing secrets. [VERIFIED: scripts/upload-tiles.js lines 49, 272–288; Phase 30 D-01]

### Pattern 4: Module-Level Env Constants

**What:** All env vars and path constants declared at module top (not inline in `main()`).
**When to use:** Every new `scripts/*.js` file in this project. [VERIFIED: scripts/upload-tiles.js lines 44–53, scripts/tile-photos.js lines 39–44]

### Pattern 5: Self-Invocation Guard

**What:** `if (import.meta.url === \`file://${process.argv[1]}\`) { main().catch(...) }` at bottom of file. Prevents `main()` from running when test file imports the script's exports.
**When to use:** All `scripts/*.js` files with exported helpers. [VERIFIED: scripts/upload-tiles.js lines 402–404, scripts/tile-photos.js]

### Pattern 6: Nunjucks Guard Syntax

**What:** Nunjucks uses `not` (not `!`) for boolean negation. Compound conditions use `and`/`or`.
**When to use:** Any Nunjucks template conditional. [VERIFIED: src/species/species.njk lines 40–45 use `and`; CONTEXT.md D-04 uses `not`]

The locked guard from D-04:
```nunjucks
{% if (not (highResEntry and highResEntry.high_res_available)) and spImages and spImages.length > 0 %}
```
This replaces line 47: `{% if spImages and spImages.length > 0 %}` in `src/species/species.njk`.

### Anti-Patterns to Avoid

- **Importing `logStage`/`redact` from a shared module:** Project convention requires verbatim copy. D-13.
- **Parsing CSV manifest at Eleventy build time:** D-01 locks the pattern as script + commit. `src/_data/speciesPhotos.js` must not change.
- **Trailing slash on `tiles_path`:** The pilot entry uses `species-tiles/abagrotis-apposita/A-D` (no trailing slash). [VERIFIED: data/species-photos.json]. CONTEXT.md §Specifics confirms: "strip trailing slash."
- **Mixed-case `species_slug` in `tiles_path`:** Must be `slug.toLowerCase()`. Phase 28 pilot lesson; enforced in Phase 29/30. [VERIFIED: scripts/upload-tiles.js `tileUploadPath` function]
- **Changing `src/_data/speciesPhotos.js`:** It already works correctly. Phase 31 must not alter it. [VERIFIED: src/_data/speciesPhotos.js — reads committed JSON, soft-fails on missing file]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSV parsing | Custom CSV reader | `readManifest()` from `scripts/lib/manifest.js` | Already handles quoted fields, empty lines, column-keyed objects |
| JSON sorting | Custom comparator | Standard JS `.sort()` with `localeCompare` on `specimen_id`, then `view` | Simple two-key sort; no library needed |
| File write with encoding | Manual Buffer handling | `node:fs/promises` `writeFile(path, JSON.stringify(data, null, 2))` | Standard pattern used throughout project |

**Key insight:** All infrastructure for Phase 31 already exists in the codebase. The script is a pipeline adapter (filter + group + sort + serialize), not novel infrastructure.

---

## Common Pitfalls

### Pitfall 1: Empty `uploaded` Set on Local Dev Machine

**What goes wrong:** `readManifest` returns 4,935 rows but none have `status: uploaded` on the local machine (uploads ran on a datacenter server). Script filters to zero rows and writes `{}` or crashes.
**Why it happens:** Phase 30 ran on a remote server; local manifest reflects pre-upload state.
**How to avoid:** Script should handle empty-uploaded-set gracefully — write `{}` (or the existing pilot entry only if logic re-reads it). Tests must supply synthetic `uploaded`-status rows. The pilot entry for `abagrotis-apposita` IS in the manifest with `status: uploaded` only on the server; locally the manifest shows `status: discovered` for all rows.
**Warning signs:** Zero species in DRY_RUN output on local machine; this is expected and correct.

### Pitfall 2: `tiles_path` Trailing Slash Mismatch

**What goes wrong:** Script generates `tiles_path: "species-tiles/abagrotis-apposita/A-D/"` (with trailing slash) but the pilot entry has no trailing slash. OSD viewer constructed in Phase 28 was tested against no-trailing-slash convention.
**Why it happens:** `tilePullZoneUrl()` in `upload-tiles.js` returns a URL WITH a trailing slash (for CDN URL browsing), but `tiles_path` in the JSON uses a PATH without trailing slash.
**How to avoid:** Construct `tiles_path` as `species-tiles/${slug.toLowerCase()}/${specimen_id}-${view}` — no trailing slash. [VERIFIED: data/species-photos.json pilot entry shows no trailing slash]

### Pitfall 3: Nunjucks `not` Operator Precedence

**What goes wrong:** Guard condition is mis-parenthesized and suppresses images for ALL species (or none).
**Why it happens:** Nunjucks operator precedence — `not A and B` may parse as `(not A) and B` rather than `not (A and B)`.
**How to avoid:** Use explicit parentheses as specified in D-04: `(not (highResEntry and highResEntry.high_res_available))`. The CONTEXT.md guard is the exact string to use.

### Pitfall 4: `high_res_available` Set to `true` for Partial Uploads

**What goes wrong:** A species has 3 specimens in the manifest but only 1 is `status: uploaded`. Script sets `high_res_available: true` and suppresses all low-res, but only 1 specimen is available in the JSON.
**Why it happens:** Filtering only `uploaded` rows means partial-upload species get partial high-res entries.
**How to avoid:** This is actually correct behavior by design — `high_res_available` is true whenever ANY uploaded specimen exists for the species. Phase 32 OSD viewer handles multi-specimen navigation. The suppression of low-res is total (per D-03), not partial.

### Pitfall 5: JSON Output Shape Drift

**What goes wrong:** Script emits `{specimens: [...], highResAvailable: true}` (camelCase key) instead of `{high_res_available: true, specimens: [...]}` (snake_case, field order matches pilot).
**Why it happens:** JavaScript naming convention vs. project data convention.
**How to avoid:** Shape locked by the Phase 28 pilot entry in `data/species-photos.json`. Use snake_case `high_res_available`. [VERIFIED: data/species-photos.json]

---

## Code Examples

### Pilot JSON Shape (locked reference)

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
[VERIFIED: data/species-photos.json — read directly from file]

### `readManifest` Usage

```javascript
// Source: scripts/lib/manifest.js (read-only use in Phase 31)
import { readManifest } from './lib/manifest.js';
const rows = await readManifest(MANIFEST_PATH);
const uploadedRows = rows.filter(r => r.status === 'uploaded');
```
[VERIFIED: scripts/lib/manifest.js lines 73–77]

### DATA-03 Template Guard

Current line 47 in `src/species/species.njk`:
```nunjucks
{% if spImages and spImages.length > 0 %}
```

Replace with (D-04 exact wording):
```nunjucks
{% if (not (highResEntry and highResEntry.high_res_available)) and spImages and spImages.length > 0 %}
```
[VERIFIED: src/species/species.njk line 47; D-04 in CONTEXT.md]

### logStage Pattern (copy verbatim)

```javascript
// Source: scripts/upload-tiles.js lines 109–115
function logStage(content_hash, action, outcome, extra = '') {
  const hashPrefix = (content_hash ?? '').slice(0, 12).padEnd(12);
  const actionField = String(action).padEnd(16);
  console.log(
    `${new Date().toISOString()} ${hashPrefix} ${actionField} ${outcome}${extra ? '  ' + extra : ''}`
  );
}
```
[VERIFIED: scripts/upload-tiles.js]

### Specimen Sort Order

```javascript
// Alphabetical by specimen_id, then D before V within same specimen (Claude's Discretion)
specimens.sort((a, b) => {
  const idCmp = a.specimen_id.localeCompare(b.specimen_id);
  if (idCmp !== 0) return idCmp;
  // D before V: 'D' < 'V' alphabetically — standard sort handles this
  return a.view.localeCompare(b.view);
});
```

### npm script alias (package.json)

```json
"photos:materialize": "node scripts/generate-species-photos.js"
```
[VERIFIED: package.json existing `photos:` aliases; D-02 in CONTEXT.md]

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hand-edited `data/species-photos.json` | Manifest-derived, script-generated, committed | Phase 31 | Pilot entry for `abagrotis-apposita` replaced by manifest-derived entry with same content |
| Low-res `<figure>` elements always rendered | Suppressed for `high_res_available: true` species | Phase 31 | Static HTML for high-res species has empty slot; Phase 32 fills it via web component |

**Deprecated/outdated:**
- The hand-edited Phase 28 pilot entry in `data/species-photos.json`: replaced by manifest-derived entry after `photos:materialize` runs. No user-visible change.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `tiles_path` in JSON should have no trailing slash (matches pilot entry convention) | Code Examples, Pitfall 2 | Phase 32 OSD viewer would receive wrong path; tiles would fail to load |
| A2 | The `generate-species-photos.js` script DOES import `readManifest` from `./lib/manifest.js` despite the "self-contained helpers" rule (rule applies to `logStage`/`redact`, not library functions) | Standard Stack | If wrong, script would need its own CSV parser — violates D-01's "reads manifest" requirement |

**Note on A1:** The pilot entry in `data/species-photos.json` was manually written and the CONTEXT.md §Specifics explicitly confirms "strip trailing slash." Both sources agree. Confidence is HIGH despite the `[ASSUMED]` tag on the interpretation.

**Note on A2:** CONTEXT.md §"Self-contained helpers" says "copy `redact` and `logStage` from `tile-photos.js` verbatim" — it names only these two helpers. `readManifest` is a library function (in `scripts/lib/`), not a helper. All prior Phase 29/30 scripts import `readManifest` from lib. Confidence is HIGH.

---

## Open Questions

1. **How does `generate-species-photos.js` handle the pilot `abagrotis-apposita` entry replacement (SC-5)?**
   - What we know: The script writes the full JSON from scratch based on `status: uploaded` rows. If the manifest (on the server) has `abagrotis-apposita` rows at `status: uploaded`, the script will naturally produce the same entry.
   - What's unclear: On the local dev machine, no rows are `status: uploaded`. The script will write `{}` locally, which removes the pilot entry. The developer should understand this is expected — the committed `data/species-photos.json` is the production artifact, not the local dev copy.
   - Recommendation: Document in script header comment that local manifest has no `uploaded` rows; `DRY_RUN=1` on local machine will show empty set.

2. **What summary counts should the end-of-run log display?**
   - What we know: CONTEXT.md §"Claude's Discretion" says: "count uploaded, species with high-res, total specimens."
   - What's unclear: Format — should it mirror `upload-tiles.js` summary block exactly?
   - Recommendation: Follow `upload-tiles.js` summary format (blank line, `[script-name] summary:`, indented counters).

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | `generate-species-photos.js` | ✓ | v24.15.0 | — |
| `csv-parse` (npm) | `scripts/lib/manifest.js` | ✓ | ^6.2.1 (installed) | — |
| `data/species-photos-manifest.csv` | Script input | ✓ | 4,935 rows, all `status: discovered` locally | Empty `uploaded` set; graceful handling required |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** The manifest has zero `uploaded` rows locally. The script must handle this gracefully (write `{}` or skip write with a log message). Tests supply synthetic rows.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` (no external test runner) |
| Config file | none — tests listed explicitly in `npm test` |
| Quick run command | `node --test scripts/generate-species-photos.test.js` |
| Full suite command | `node --test eleventy.config.test.js scripts/build-data.test.js scripts/check-page-weight.test.js scripts/ingest-photos.test.js scripts/migrate-species.test.js scripts/tile-photos.test.js scripts/upload-tiles.test.js scripts/generate-species-photos.test.js scripts/lib/*.test.js src/components/*.test.js src/_lib/*.test.js` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DATA-01 | `generate-species-photos.js` filters `status: uploaded` rows and groups by `species_slug` | unit | `node --test scripts/generate-species-photos.test.js` | ❌ Wave 0 |
| DATA-01 | `tiles_path` constructed as `species-tiles/{slug-lowercase}/{specimen_id}-{view}` (no trailing slash) | unit | `node --test scripts/generate-species-photos.test.js` | ❌ Wave 0 |
| DATA-01 | `high_res_available: true` set for species with ≥1 `uploaded` row | unit | `node --test scripts/generate-species-photos.test.js` | ❌ Wave 0 |
| DATA-01 | Specimens sorted: `specimen_id` alphabetical, then D before V | unit | `node --test scripts/generate-species-photos.test.js` | ❌ Wave 0 |
| DATA-01 | `species_slug` lowercased in `tiles_path` | unit | `node --test scripts/generate-species-photos.test.js` | ❌ Wave 0 |
| DATA-01 | `DRY_RUN=1` does not write the JSON file | unit | `node --test scripts/generate-species-photos.test.js` | ❌ Wave 0 |
| DATA-02 | `src/_data/speciesPhotos.js` exposes `high_res_available` per species slug | manual-only | Inspect speciesPhotos.js (no change needed; existing loader works) | ✅ existing |
| DATA-03 | Template guard suppresses `<figure>` loop for `high_res_available: true` species | manual (build) | `npm run build:eleventy` and check abagrotis-apposita HTML output | — |

### Sampling Rate

- **Per task commit:** `node --test scripts/generate-species-photos.test.js`
- **Per wave merge:** Full suite as listed in `npm test` + `generate-species-photos.test.js` added
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `scripts/generate-species-photos.test.js` — covers DATA-01 unit tests (row factory, exported pure functions: `buildSpeciesPhotos`, `isMaterializable`, `toTilesPath`)
- [ ] Add `scripts/generate-species-photos.test.js` to the `npm test` command in `package.json`

*(Template guard in `species.njk` is a one-line Nunjucks change; verified by build output inspection, not unit test)*

---

## Security Domain

This phase has no authentication, session management, or sensitive data handling. The script reads a local CSV and writes a local JSON file. No external API calls. No user-supplied input.

Applicable ASVS: none for this phase.

---

## Sources

### Primary (HIGH confidence)

- `data/species-photos.json` — locked output shape (pilot entry); read directly
- `src/species/species.njk` — template to modify; lines 36–71 read directly; DATA-03 guard target confirmed at line 47
- `src/_data/speciesPhotos.js` — Eleventy data loader; confirmed unchanged requirement
- `scripts/upload-tiles.js` — script shape to mirror; logStage/redact/withRetry patterns; DRY_RUN convention; self-invocation guard
- `scripts/lib/manifest.js` — `readManifest` API; COLUMNS schema; `advanceStatus` (not needed in Phase 31)
- `package.json` — existing `photos:` aliases; confirmed npm test command
- `.planning/phases/31-data-species-photos-json-build-integration/31-CONTEXT.md` — all locked decisions

### Secondary (MEDIUM confidence)

- `scripts/tile-photos.js` (lines 1–80) — confirms logStage/redact are copied verbatim; self-invocation guard pattern
- `data/species-photos-manifest.csv` — confirmed 4,935 rows; zero `status: uploaded` locally (expected)
- `scripts/upload-tiles.test.js` — confirmed row factory pattern for tests

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all dependencies already installed and verified
- Architecture: HIGH — locked decisions in CONTEXT.md; pilot entry shape verified in file
- Pitfalls: HIGH — derived from reading actual code in upload-tiles.js, species.njk, and manifest.js

**Research date:** 2026-05-23
**Valid until:** 2026-06-23 (stable — no external dependencies; locked decisions)
