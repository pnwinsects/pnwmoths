# Phase 35: Build Pipeline Scripts Migration — Research

**Researched:** 2026-06-09
**Domain:** JS→TS migration of `scripts/` producer pipeline; DuckDB Parquet schema introspection; hyparquet offline validation; Node 24 type-stripping
**Confidence:** HIGH — all claims verified by reading actual source files and running live probes against the installed toolchain and production data

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Script disposition**
- D-01: Delete the 8 spent one-off scripts (migrate-species+test, migrate-images, migrate-species-accounts, cdn-copy-reclassified, cdn-fix-bad-slugs, upload-plates, add-image-metadata, test-redirect); convert only the 9 active pipeline scripts.
- D-02: Planner must update docs/README that reference deleted scripts (found: `_instructions/ADDING_PLATE.md` and `_instructions/UPLOADING_TILES.md` both reference `upload-plates.js` — must be updated when script is deleted).

**verify:parquet (SCHEMA-07)**
- D-03: New `scripts/verify-parquet.ts` + `npm run verify:parquet`; reads every species' Parquet with hyparquet; validates all rows against `OccurrenceRecordSchema`; independent of `npm run build`.
- D-04: Scan-all-then-summarize failure mode. Collect every failure across all species, then print summary and exit non-zero.
- D-05: Single quiet summary line on clean run: `OK: N species, M rows validated`.

**Build-time Parquet sanity check (SCHEMA-04)**
- D-06: After Parquet generation, `build-data.ts` reads back one species' Parquet and validates column schema (O(columns), NOT per-row). Schema mismatch fails the build.
- D-07: Sample the first species in deterministic ordering (alphabetical slug, always exists). Confirmed: `abagrotis-apposita` is first alphabetically in both `species.csv` and `data/parquet/`.
- D-08: Use the already-open DuckDB connection (zero new dependency).

**view / match_bucket unions (D-09)**
- D-09: Lift `view = 'D' | 'V'` and `match_bucket` to string-literal unions everywhere they flow. Source of truth for `match_bucket`: `scripts/lib/parse-photo-filename.ts` + `scripts/ingest-photos.js`. No `enum` (TS-03 prohibition).

**Inherited from Phases 33/34**
- D-10: External untyped boundaries (Dropbox API, csv-parse) → minimal hand-written interface + small runtime guard. Not Zod.
- D-11: Zod reserved for 7 entities and 2 CDN boundaries only. Build side consumes `z.infer<>` types (free). Exception: `verify:parquet` is the sanctioned per-row check.
- D-12: CSV correctness enforced by DuckDB `read_csv` typed columns + existing integrity SQL. No hot-path Zod.
- D-13: Build-locked JSON (taxon tree, species-photos.json) covered by static TS types at authoring (SCHEMA-05). `species-states.json` validated at load time in Phase 37, not here.
- D-14: `npm test` script updated to include `.test.ts` files; node --test on Node 24 with native type-stripping (no extra flags needed — confirmed).

### Claude's Discretion
- Exact filename of `verify-parquet.ts` and where it reads built Parquet from (`data/parquet/` not `_site/species/` — see Environment section).
- Precise summary-line format and failure-report layout for `verify:parquet` (within D-04/D-05 constraints).
- Local interface shapes for remaining external responses in each converted script.
- How the SCHEMA-04 column comparison is expressed (DESCRIBE query vs schema.shape — DESCRIBE is verified and simpler, see Architecture Patterns).

### Deferred Ideas (OUT OF SCOPE)
- Content-hash / fingerprint per-species Parquet URLs.
- New test coverage for previously-untested scripts (copy-parquet, copy-images, emit-species-states).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MIG-02 | All build/data pipeline scripts in `scripts/` fully converted to TypeScript | § Standard Stack; § Architecture Patterns: Conversion Checklist |
| SCHEMA-04 | Build-time one-sample Parquet column-schema sanity check in `build-data.ts` | § Architecture Patterns: SCHEMA-04 DuckDB DESCRIBE check |
| SCHEMA-05 | Build-locked JSON covered by static TS types at authoring | § Architecture Patterns: SCHEMA-05 Static Types for JSON |
| SCHEMA-06 | CSV input correctness enforced by DuckDB typed `read_csv`; TS types describe post-read shape | § Architecture Patterns: SCHEMA-06 DuckDB CSV gate |
| SCHEMA-07 | `npm run verify:parquet` standalone script; validates every species Parquet row against OccurrenceRecordSchema | § Architecture Patterns: SCHEMA-07 verify:parquet |
</phase_requirements>

---

## Summary

Phase 35 converts 9 active pipeline scripts from JS to TS (rename + type annotations — no module system change, all already ESM), deletes 8 spent one-offs, adds a build-time Parquet column-schema sanity check inside `build-data.ts`, and creates a new standalone `verify-parquet.ts` for offline per-row validation. The test files for converted scripts must be updated with `.ts` extensions and import paths changed from `.js` to `.ts`.

All target scripts already import `scripts/lib/*.ts` successfully (Phase 34 proved this path). The critical technical unknowns have been resolved by live probes: DuckDB `DESCRIBE` is the right tool for SCHEMA-04; `OccurrenceRecordSchema.shape` gives expected column names directly; `data/parquet/` is the correct source path for `verify:parquet` (not `_site/species/`, which requires a full build first and does not contain Parquet files — only `index.html` was found there in the current build state); the full 1,453-species verify:parquet run takes approximately 0.5 seconds locally; and the `readFileSync(path).buffer` Node.js pattern produces a SHARED pool `ArrayBuffer` that breaks hyparquet on small files — the correct pattern is `raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)`.

The current `build:data` baseline is 3.8 seconds — the 60s budget is safe even after adding the SCHEMA-04 readback. The full test suite (224/224 tests) runs and passes against the current converted `scripts/lib/*.ts` files. Node 24.15.0 is installed; native type-stripping works without any extra flags for `.ts` script execution and `node --test`.

**Primary recommendation:** Convert scripts in two parallel waves (non-interdependent simple scripts first; manifest-consuming scripts second); add SCHEMA-04 as a single function in `build-data.ts` after the Parquet export loop; ship `verify-parquet.ts` as a new script. The byte-identity baseline must be captured before any conversion begins.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| CSV input validation | Node build script (`build-data.ts`) | DuckDB read_csv typed columns | build-data already owns the DuckDB session; typed `read_csv` fails on bad coercion |
| Parquet write-path sanity | Node build script (`build-data.ts`) | — | Same script that writes the Parquet reads one back; O(columns) cost is negligible |
| Full Parquet per-row validation | Standalone script (`verify-parquet.ts`) | — | Offline-only; not in build path; intentionally separate per SCHEMA-07 |
| Photo manifest processing | Node pipeline scripts (`ingest-photos.ts`, `tile-photos.ts`, etc.) | `scripts/lib/manifest.ts` (already TS) | Manifest libs already converted; scripts import them |
| JSON output typing (SCHEMA-05) | TypeScript type system (compile-time) | — | Build-locked: if `tsc --noEmit` passes and script runs, shape is known |
| match_bucket / view union types | `scripts/lib/parse-photo-filename.ts` (source of truth) | Propagated to ingest/tile/generate scripts | Parser is the only definer; consumers must import the types |

---

## Standard Stack

### Core (already installed — no new packages needed for Phase 35)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@duckdb/node-api` | `^1.5.1-r.2` | CSV import, integrity SQL, Parquet export, SCHEMA-04 readback | Already in `build-data.js`; no new dependency |
| `hyparquet` | `^1.25.6` | Parquet reading in `verify-parquet.ts`; mirrors `parquet-cache.js` | Already installed; production-proven reader |
| `zod` | `^4.4.3` | `OccurrenceRecordSchema` for per-row validation in `verify-parquet.ts` | Already in dependencies; schemas already defined |
| `typescript` | `^6.0.3` | `tsc --noEmit` type-checking via `tsconfig.node.json` | Already installed (Phase 33) |
| Node.js built-in `node:fs`, `node:path`, etc. | v24.15.0 | File I/O in `verify-parquet.ts` and all converted scripts | No new deps |

[VERIFIED: codebase] — all packages confirmed installed in `package.json` and `node_modules/`.

**No new packages are required for Phase 35.** All dependencies are already present.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `DESCRIBE` in DuckDB for SCHEMA-04 | `parquet_schema()` table function | `parquet_schema()` returns Parquet physical types (BYTE_ARRAY, INT32) — harder to compare to schema keys. `DESCRIBE` returns logical types (VARCHAR, INTEGER) and column names only — exactly what's needed for a column-name set comparison. Use `DESCRIBE`. |
| `readFileSync(path).buffer.slice(...)` for hyparquet | `fetch().arrayBuffer()` | Production `parquet-cache.js` uses `fetch` (browser context). Node `readFileSync` requires the `.slice(byteOffset, byteOffset + byteLength)` pattern to isolate from the shared pool ArrayBuffer. Do NOT use `raw.buffer` directly. |
| `data/parquet/` as verify:parquet source | `_site/species/` | `_site/species/{slug}/` contains only `index.html` (after `npm run build:eleventy`). Parquet lives at `data/parquet/{slug}/records.parquet` (written by `build-data.ts`) and is copied to `_site/species/{slug}/records.parquet` by `copy-parquet.ts` only after a full build. `verify:parquet` should read from `data/parquet/` — works after `npm run build:data` alone, without requiring the full build. |

---

## Package Legitimacy Audit

No new packages are installed in Phase 35. All packages in use were audited in Phase 33 (slopcheck `[OK]` for all). No new audit required.

---

## Architecture Patterns

### System Architecture Diagram

```
data/species.csv ──► build-data.ts ──► data/parquet/{slug}/records.parquet
data/records.csv ──►  (DuckDB)     │    └── SCHEMA-04: DESCRIBE one sample ──► compare to OccurrenceRecordSchema.shape
data/images.csv ──►                │         (fails build if columns differ)
data/glossary.csv ─►               │
                                    └── copy-parquet.ts ──► _site/species/{slug}/records.parquet
                                         (post-eleventy)

data/parquet/{slug}/records.parquet ──► verify-parquet.ts (standalone)
                                         (reads all 1,453 dirs)
                                         (hyparquet parquetReadObjects)
                                         (per-row OccurrenceRecordSchema.safeParse)
                                         (scan-all → collect failures → exit 1 with summary)

data/species-photos-manifest.csv ──► ingest-photos.ts  (reads Dropbox, classifies)
                                 ──► tile-photos.ts    (downloads TIFFs, runs vips)
                                 ──► upload-tiles.ts   (uploads to bunny.net)
                                 ──► generate-species-photos.ts ──► data/species-photos.json

emit-species-states.ts ──► _site/species-states.json
copy-images.ts ──► _site/images/, _site/styles/, _site/css/, _site/osd-images/
check-page-weight.ts ──► exit 0/warn (no output file)
```

### Recommended Project Structure (after Phase 35)

```
scripts/
├── build-data.ts              # converted (was .js); owns SCHEMA-04 check
├── build-data.test.ts         # converted (was .test.js)
├── copy-parquet.ts            # converted (was .js)
├── copy-images.ts             # converted (was .js)
├── emit-species-states.ts     # converted (was .js)
├── check-page-weight.ts       # converted (was .js)
├── check-page-weight.test.ts  # converted (was .test.js)
├── ingest-photos.ts           # converted (was .js)
├── ingest-photos.test.ts      # converted (was .test.js)
├── tile-photos.ts             # converted (was .js)
├── tile-photos.test.ts        # converted (was .test.js)
├── upload-tiles.ts            # converted (was .js)
├── upload-tiles.test.ts       # converted (was .test.js)
├── generate-species-photos.ts # converted (was .js)
├── generate-species-photos.test.ts # converted (was .test.js)
├── verify-parquet.ts          # NEW (SCHEMA-07)
├── tile-config.json           # unchanged
└── lib/                       # already .ts (Phase 34)
    ├── manifest.ts
    ├── parse-photo-filename.ts
    ├── dropbox-download.ts
    └── dropbox-list.ts
```

**Deleted scripts** (spent one-offs — D-01):
- `scripts/migrate-species.js` + `scripts/migrate-species.test.js`
- `scripts/migrate-images.js`
- `scripts/migrate-species-accounts.js`
- `scripts/cdn-copy-reclassified.js`
- `scripts/cdn-fix-bad-slugs.js`
- `scripts/upload-plates.js`
- `scripts/add-image-metadata.js`
- `scripts/test-redirect.js`

### Pattern 1: SCHEMA-04 — DuckDB DESCRIBE for Column Schema Check

**What:** After the Parquet export loop in `build-data.ts`, sample the first species (alphabetical) and run `DESCRIBE SELECT * FROM read_parquet(...)` to get column names. Compare to `Object.keys(OccurrenceRecordSchema.shape)`.

**Verified from live probe:** [VERIFIED: codebase]

- `DESCRIBE` returns `{ column_name: string, column_type: string, ... }[]`
- `parquet_schema()` returns physical types (BYTE_ARRAY, INT32) — use `DESCRIBE` instead
- `OccurrenceRecordSchema.shape` gives exactly the 14 expected column names
- First species in alphabetical order: `abagrotis-apposita` (confirmed from both `species.csv` ORDER BY and `data/parquet/` dir listing)
- Live match: 14 actual columns == 14 expected columns, PASS

**Implementation pattern (add as a function after the Parquet export loop):**

```typescript
// Source: verified via live probe 2026-06-09
import { OccurrenceRecordSchema } from '../src/types/schemas.ts';

async function verifySampleParquetSchema(conn: DuckDBConnection, firstSlug: string): Promise<void> {
  const parquetPath = `data/parquet/${firstSlug}/records.parquet`;
  const result = await conn.runAndReadAll(
    `DESCRIBE SELECT * FROM read_parquet('${parquetPath}')`
  );
  const actualCols: string[] = result.getRowObjectsJS().map((r: { column_name: string }) => r.column_name);
  const expectedCols: string[] = Object.keys(OccurrenceRecordSchema.shape);
  const missing = expectedCols.filter(c => !actualCols.includes(c));
  const extra = actualCols.filter(c => !expectedCols.includes(c));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `Parquet column schema mismatch on ${firstSlug}.\n` +
      `  Missing: ${missing.join(', ') || 'none'}\n` +
      `  Extra:   ${extra.join(', ') || 'none'}`
    );
  }
  console.log(`Parquet schema OK: ${actualCols.length} columns match OccurrenceRecordSchema`);
}
```

**Where to call:** After the `count++` loop that writes all species Parquet files, before `conn.closeSync()`. Get `firstSlug` from the already-fetched `speciesRows`:

```typescript
// Sort speciesRows to get deterministic first slug (mirrors alphabetical dir listing)
const firstSp = [...speciesRows].sort((a, b) =>
  (a.genus + a.species).toLowerCase().localeCompare((b.genus + b.species).toLowerCase())
)[0];
const firstSlug = `${firstSp.genus}-${firstSp.species}`.toLowerCase().replace(/\s+/g, '-');
await verifySampleParquetSchema(conn, firstSlug);
```

**Typing `conn`:** `build-data.ts` uses `@duckdb/node-api`. The connection is typed `DuckDBConnection` (import from `@duckdb/node-api`). The `getRowObjectsJS()` return is `unknown[]` — narrow with an inline interface or type assertion to `Array<{ column_name: string }>`.

### Pattern 2: SCHEMA-07 — verify-parquet.ts (New Script)

**What:** Standalone `scripts/verify-parquet.ts` that reads every species Parquet from `data/parquet/`, validates all rows against `OccurrenceRecordSchema`, and exits non-zero with a summary on any failure.

**Performance verified:** [VERIFIED: codebase probe]
- 1,453 species, 92,648 rows, 0 failures — 0.5 seconds total
- No memory concern: files are small (median ~3–8 KB); sequential read, not all loaded at once

**Critical bug to avoid — Node.js shared ArrayBuffer pool:** [VERIFIED: live probe]

`readFileSync(path)` returns a `Buffer` that shares its underlying `ArrayBuffer` with Node's internal pool. `raw.buffer.byteLength` can be 8192 even when the file is 2932 bytes, and `raw.byteOffset !== 0`. This causes hyparquet to see garbage and throw `parquet file invalid (footer != PAR1)` for any file that happens to land in a pooled buffer.

**Correct file-reading pattern:**

```typescript
// Source: verified via live probe 2026-06-09
import { readFileSync } from 'node:fs';

const raw = readFileSync(filePath);
// CORRECT: isolate from shared pool buffer
const ab: ArrayBuffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
// WRONG: raw.buffer alone — byteLength may be 8192 when file is 2932 bytes
```

**Complete script outline:**

```typescript
// scripts/verify-parquet.ts
import { parquetReadObjects } from 'hyparquet';
import { readFileSync, readdirSync } from 'node:fs';
import { OccurrenceRecordSchema } from '../src/types/schemas.ts';

type FailureSummary = { slug: string; row: number; issues: string };

const PARQUET_DIR = 'data/parquet';

const species = readdirSync(PARQUET_DIR).sort();
let totalRows = 0;
const failures: FailureSummary[] = [];

for (const slug of species) {
  const filePath = `${PARQUET_DIR}/${slug}/records.parquet`;
  const raw = readFileSync(filePath);
  const ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  const file = { byteLength: ab.byteLength, slice: (s: number, e: number) => ab.slice(s, e) };
  const records = await parquetReadObjects({ file }) as unknown[];
  totalRows += records.length;
  records.forEach((rec, i) => {
    const result = OccurrenceRecordSchema.safeParse(rec);
    if (!result.success) {
      failures.push({
        slug,
        row: i,
        issues: result.error.issues.map(iss => `${iss.path.join('.')}: ${iss.message}`).join('; '),
      });
    }
  });
}

if (failures.length > 0) {
  // D-04: scan-all, print every failure, then summarize
  for (const f of failures) {
    console.error(`FAIL ${f.slug} row ${f.row}: ${f.issues}`);
  }
  console.error(`FAIL: ${failures.length} validation error(s) across ${species.length} species, ${totalRows} rows`);
  process.exit(1);
}

// D-05: single quiet summary line on clean run
console.log(`OK: ${species.length} species, ${totalRows} rows validated`);
```

**Source path:** `data/parquet/` — written by `build-data.ts`, readable after `npm run build:data` alone (no full build needed). `_site/species/` contains only `index.html` and is NOT the right source (copy-parquet runs after eleventy, may not be present).

**npm script to add:**

```json
"verify:parquet": "node scripts/verify-parquet.ts"
```

### Pattern 3: External Boundary Typing (Phase 34 Template — Replicate Verbatim)

**What:** Untyped external responses (Dropbox API JSON in `ingest-photos.ts` and `tile-photos.ts`; csv-parse output) get a minimal consumed-field interface + small runtime guard. This was established in Phase 34 and must be replicated consistently.

**Already in use:** `scripts/lib/dropbox-list.ts` and `scripts/lib/dropbox-download.ts` typed via the Phase 34 pattern. `ingest-photos.ts` uses `dbxCall` (which returns `unknown`) and narrows via the consumed-field guard.

**Do not re-decide.** Copy the Phase 34 pattern. See `scripts/lib/manifest.ts` and `scripts/lib/dropbox-list.ts` for working examples.

### Pattern 4: view / match_bucket String-Literal Unions (D-09)

**Source of truth — verified from `scripts/lib/parse-photo-filename.ts` and `scripts/ingest-photos.js`:** [VERIFIED: codebase]

```typescript
// view — from parse-photo-filename.ts ParseSpecimenAndViewResult
type View = 'D' | 'V' | '';  // '' = parse failed

// match_bucket — complete set derived from ingest-photos.js classify()
type MatchBucket =
  | 'resolved-via-synonym'  // Phase 27 synonym pre-pass
  | 'provisional'           // FIX #3: n sp, sp, nr <epithet>
  | 'unparseable'           // null binomial, null bucketHint
  | 'clean-match'           // binomial in byBinomial
  | 'slug-match'            // slug in bySlug (safety net, 0% in audit)
  | 'genus-only'            // genus token in genera set
  | 'likely-synonym';       // neither genus nor species in data
```

These unions must be exported from `parse-photo-filename.ts` (already defines `ParseSpecimenAndViewResult.view: 'D' | 'V' | ''`) and imported everywhere `view` or `match_bucket` appears. Add `MatchBucket` type export to `parse-photo-filename.ts` or to `scripts/lib/manifest.ts` (both are already TS). No `enum`.

**Scripts that consume `view`:** `ingest-photos.ts`, `tile-photos.ts` (`TILEABLE_BUCKETS` uses match_bucket), `generate-species-photos.ts` (`view` in specimens, `match_bucket` in `isMaterializable`), `upload-tiles.ts` (`tileUploadPath` uses `view`).

**`TILEABLE_BUCKETS` in `tile-photos.ts`** (currently a `Set(['clean-match', 'slug-match', 'resolved-via-synonym'])`) should be typed `Set<MatchBucket>`.

### Pattern 5: Test File Conversion and npm test Update

**Current test script (from `package.json`):**

```
node --test eleventy.config.test.js scripts/build-data.test.js scripts/check-page-weight.test.js scripts/ingest-photos.test.js scripts/migrate-species.test.js scripts/tile-photos.test.js scripts/upload-tiles.test.js scripts/generate-species-photos.test.js 'scripts/lib/*.test.{js,ts}' src/components/*.test.js 'src/_lib/*.test.{js,ts}'
```

**After Phase 35:**
- `scripts/migrate-species.test.js` is DELETED (with its script)
- All other `scripts/*.test.js` become `scripts/*.test.ts`
- `verify-parquet.ts` has no test file (it is itself a validation script)
- Add `scripts/verify-parquet.ts` to `package.json` `verify:parquet` script

**Updated test invocation:**

```
node --test eleventy.config.test.js scripts/build-data.test.ts scripts/check-page-weight.test.ts scripts/ingest-photos.test.ts scripts/tile-photos.test.ts scripts/upload-tiles.test.ts scripts/generate-species-photos.test.ts 'scripts/lib/*.test.{js,ts}' src/components/*.test.js 'src/_lib/*.test.{js,ts}'
```

**Import path updates in test files:** Each test file imports from its script with a `.js` extension today (Node ESM convention from Phase 33: explicit `.ts` extensions). After conversion, test files import from `.ts`:

```typescript
// Before (in build-data.test.js):
import { validateCsv } from '../scripts/build-data.js';

// After (in build-data.test.ts):
import { validateCsv } from '../scripts/build-data.ts';
```

Same pattern for `generate-species-photos.test.ts` → `'./generate-species-photos.ts'`, `tile-photos.test.ts` → `'./tile-photos.ts'`, `ingest-photos.test.ts` → `'./ingest-photos.ts'`, `upload-tiles.test.ts` → `'./upload-tiles.ts'`, `check-page-weight.test.ts` (no script import — uses `spawnSync`).

**Note on `build-data.test.js`:** also has `import { validateCsv } from '../scripts/build-data.js'` (line 10) from migrate-species.test.js (line 1 of that file) — both will be updated.

### Pattern 6: SCHEMA-05 — Static TS Types for Build-Locked JSON

No runtime validation added. The TS type system covers this at authoring time:

- **Taxon tree** (baked into HTML `<script>` inline): `src/_data/taxon.js` (Phase 36 conversion) produces a `TaxonFamily[]`; consuming templates receive typed data via Eleventy data cascade. Phase 35 does not touch `src/_data/` (Phase 36 scope). **No action required in Phase 35 for taxon tree.**
- **`species-photos.json`**: `generate-species-photos.ts` writes a `Record<string, { high_res_available: boolean; specimens: Array<{ specimen_id: string; view: string; tiles_path: string }> }>`. The `SpeciesPhotoSchema` in `src/types/schemas.ts` matches this shape. Adding `import type { SpeciesPhoto } from '../src/types/schemas.ts'` to `generate-species-photos.ts` and typing the `result` object satisfies SCHEMA-05 for this file at authoring time.

### SCHEMA-06 — DuckDB typed read_csv (already implemented)

The existing `build-data.js` already uses fully-typed `read_csv` with explicit `columns` for every CSV file. This satisfies SCHEMA-06. Phase 35 merely renames and adds types — the DuckDB schema enforcement is unchanged.

**Confirmed read_csv patterns:** [VERIFIED: codebase]
- `records.csv`: read WITHOUT `nullstr=''` (blank cells become NULL, especially county 100% null)
- `species.csv`: read WITH `nullstr=''` (empty strings become NULL, e.g. common_name, subfamily)
- `images.csv`: read with all-VARCHAR schema (no coercion at read time)
- `glossary.csv`: read via `csv-parse` (not DuckDB) in pre-flight `validateCsv()`

### Anti-Patterns to Avoid

- **`readFileSync(path).buffer` without `.slice()`:** Shares the Node.js pool ArrayBuffer. `byteLength` may be 8192 when file is 2932 bytes; `byteOffset` is non-zero. Causes `parquet file invalid (footer != PAR1)` for small Parquet files. ALWAYS use `.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)`.
- **Reading Parquet from `_site/species/`:** Only `index.html` is there after a standard build. Parquet is at `data/parquet/{slug}/records.parquet`. Use `data/parquet/` in `verify-parquet.ts`.
- **Using `parquet_schema()` instead of `DESCRIBE` for SCHEMA-04:** `parquet_schema()` returns physical types (BYTE_ARRAY, INT32) which don't match the schema shape keys (VARCHAR, INTEGER). Use `DESCRIBE SELECT * FROM read_parquet(...)` which returns logical DuckDB types and column names.
- **Inventing match_bucket values:** The complete set is exactly the 7 values listed in Pattern 4, derived from the live code in `ingest-photos.js`. Do not add or remove values.
- **Using `enum` for view or match_bucket:** TS-03 prohibition. String-literal unions only.
- **Unguarded `as unknown as T`:** Not permitted (MIG-06). All external returns narrowed via runtime guard (D-10 template from Phase 34).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Parquet column-schema check | Custom Parquet parser | DuckDB `DESCRIBE SELECT * FROM read_parquet(...)` | Already have DuckDB connection open; returns exactly column names and types in one query |
| Full per-row Parquet validation | Custom row validator | `OccurrenceRecordSchema.safeParse()` from `src/types/schemas.ts` | Schema already exists, profiled against production data (Phase 33 SCHEMA-03); zero new work |
| ArrayBuffer from Node file read | Custom buffer conversion | `raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)` | Standard pattern to isolate from Node's shared pool; one line |
| TS type for post-DuckDB rows | Manual interface | `z.infer<typeof OccurrenceRecordSchema>` = `OccurrenceRecord` from `src/types/index.ts` | Already defined; free derive |

---

## Common Pitfalls

### Pitfall 1: Node.js Buffer Pool SharedArrayBuffer in hyparquet

**What goes wrong:** `readFileSync(path).buffer` returns the shared pool `ArrayBuffer` (e.g. 8192 bytes) with non-zero `byteOffset`. hyparquet reads `byteLength` from the object and gets the wrong size — `parquet file invalid (footer != PAR1)` for small files (most species with few records).

**Why it happens:** Node.js `readFileSync` returns a `Buffer` that is a view into a shared internal pool for small files. `Buffer.buffer` is the entire pool, not just the file bytes.

**How to avoid:** Always use:
```typescript
const raw = readFileSync(filePath);
const ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
```

**Warning signs:** Works on one species (the first, largest one), fails on others. Error message exactly: `parquet file invalid (footer != PAR1)`.

### Pitfall 2: Import specifiers must use .ts extension

**What goes wrong:** `import { foo } from './bar.js'` fails to resolve after the file is renamed to `bar.ts`. Node 24 with `moduleResolution: NodeNext` requires explicit `.ts` specifiers (`.js` doesn't work even though the source is `.ts`). `tsc --noEmit` also requires `.ts` under `allowImportingTsExtensions`.

**How to avoid:** When converting a file, update ALL import specifiers that reference it. Test files import their script; lib files import each other. Check: `grep -r "from.*\.js'" scripts/` before and after each conversion.

**Warning signs:** `ERR_MODULE_NOT_FOUND` at runtime; tsc error "an import path cannot end with a '.js' extension when 'allowImportingTsExtensions' is enabled".

### Pitfall 3: noUncheckedIndexedAccess requires destructuring or guards

**What goes wrong:** `arr[0].field` returns `T | undefined` under `noUncheckedIndexedAccess`. Test code like `rows[0].state` needs `const [firstRow] = rows; assert.strictEqual(firstRow?.state, 'TX')` or `assert.ok(rows[0] !== undefined)` first.

**Why it happens:** `tsconfig.node.json` sets `noUncheckedIndexedAccess: true`. Phase 34 already addressed this in `scripts/lib/*.ts` — replicate the same pattern (destructuring, or null checks before indexing).

**How to avoid:** When converting test files, grep for `rows[0]`, `speciesRows[0]`, etc. and add guards or use destructuring: `const [first] = rows`.

### Pitfall 4: copy-images.js has top-level await without an export

**What goes wrong:** `copy-images.js` has no `main()` function — it uses top-level `await` at module scope. This is valid ESM but means the file cannot be imported for testing (all top-level awaits run immediately on import). The conversion is rename + type annotations only — no restructuring needed since it has no test.

**How to avoid:** Convert as-is. Do not add `main()` wrapping (it would change behavior). Confirm no test tries to import it.

### Pitfall 5: `emit-species-states.ts` and `check-page-weight.ts` have no test coverage

**What goes wrong:** These are untested scripts. The tests for `emit-species-states` are embedded in `build-data.test.js` (DuckDB queries tested inline). `check-page-weight.test.js` uses `spawnSync` to invoke the script as a subprocess. After conversion the subprocess call must reference the `.ts` file: `spawnSync('node', ['scripts/check-page-weight.ts', ...])`.

**How to avoid:** When converting `check-page-weight.test.js` → `.ts`, update subprocess invocations to `scripts/check-page-weight.ts` and verify `node scripts/check-page-weight.ts` works under Node 24 type-stripping.

### Pitfall 6: `migrate-species.test.js` imports from `build-data.js`

**What goes wrong:** `scripts/migrate-species.test.js` (being DELETED in D-01) imports `validateCsv` from `../scripts/build-data.js`. This is the one cross-import between a deleted test and an active script. Deleting the test file removes this reference automatically. But `build-data.test.js` also imports `validateCsv from '../scripts/build-data.js'` — that import must be updated to `.ts` when converting.

**How to avoid:** Delete `migrate-species.test.js` and `migrate-species.js` together. Update `build-data.test.ts` import to `.ts` specifier.

### Pitfall 7: `build-data.ts` DuckDB `conn.run()` string interpolation SQL injection

**What goes wrong:** The existing SQL `COPY (SELECT * FROM records WHERE species_slug = '${slug}')` uses string interpolation. The `validateSlugComponent` function guards against path traversal for genus/species names. This is intentional — the CSV data is the source, not user input. When converting, preserve this pattern exactly; do not "fix" the SQL interpolation (it would change behavior).

**How to avoid:** Flag in code review if anyone adds a `stmt.bind()` for this query — the structure of DuckDB's `COPY TO parquet` doesn't support parameterized file paths. The slug validation is the correct mitigation.

---

## Runtime State Inventory

Phase 35 is a source-code rename + delete phase. No data migrations are required.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — Phase 35 does not rename any CSV keys, Parquet column names, or JSON field names | None |
| Live service config | None — no external service configs reference the script filenames being deleted | None |
| OS-registered state | None — no cron jobs, launchd plists, or Task Scheduler entries reference these scripts | None |
| Secrets/env vars | `DROPBOX_TOKEN`, `BUNNY_API_KEY` — env var NAMES unchanged; only the scripts reading them are renamed to `.ts` | None (env var names unchanged) |
| Build artifacts | `data/parquet/` — already built from current JS; rebuilt by converted `build-data.ts` with identical output | Regenerate after first conversion to confirm byte identity |

**Note on `_site/species/` Parquet:** `_site/species/{slug}/records.parquet` is produced by `copy-parquet.js` (runs after eleventy). This directory already exists and will be regenerated by the converted `copy-parquet.ts`. The `_site/` byte-identity gate (SC-5) covers this.

---

## Doc Update Map (D-02 — Planner Action Required)

| File | References Deleted Script | Required Update |
|------|--------------------------|-----------------|
| `_instructions/ADDING_PLATE.md` | `node scripts/upload-plates.js` (lines 43, 50) and `.upload-plates-progress` (lines 47–49) | Remove Step 4 ("Upload the new tiles to CDN") entirely or replace with a note that photographic plate uploads require manual curl PUT (the script is deleted; plates were a one-time migration) |
| `_instructions/UPLOADING_TILES.md` | References `scripts/upload-plates.js` (line 42, context only) | Update or remove the reference; clarify this is about DZI tiles (phase 30 pattern), not plates |
| `README.md` | No references found to deleted scripts | No action needed |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All scripts (type-stripping) | ✓ | v24.15.0 | — |
| `@duckdb/node-api` | `build-data.ts`, `emit-species-states.ts` | ✓ | ^1.5.1-r.2 | — |
| `hyparquet` | `verify-parquet.ts` | ✓ | ^1.25.6 | — |
| `zod` | `verify-parquet.ts` (OccurrenceRecordSchema) | ✓ | ^4.4.3 | — |
| `typescript` | `tsc --noEmit` gate | ✓ | ^6.0.3 | — |
| `csv-parse` | `build-data.ts` (pre-flight validateCsv) | ✓ | ^6.2.1 | — |
| `csv-stringify` | `scripts/lib/manifest.ts` | ✓ | ^6.7.0 | — |

**Missing dependencies:** none — all required packages are installed.

**60-second build:data budget:** [VERIFIED: live timing]
- Current `build:data` baseline: **3.8 seconds** (3.58s user, 3.79s elapsed)
- SCHEMA-04 sample readback: `DESCRIBE` on one Parquet file ≈ milliseconds (O(columns) footer read)
- Budget headroom: ~56 seconds before warning; the SCHEMA-04 addition is negligible

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner (`node --test`) |
| Config file | none — files listed explicitly in `package.json` test script |
| Quick run command | `node --test scripts/build-data.test.ts scripts/check-page-weight.test.ts` |
| Full suite command | `npm test` (updated script — see Pattern 5) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MIG-02 | All `.js` converted to `.ts`; tsc --noEmit zero errors | structural | `npm run typecheck && find scripts/ -name '*.js' -not -path '*/node_modules/*'` | ❌ Wave 0: rename files |
| SCHEMA-04 | Build fails if Parquet column schema mismatches | integration | `npm run build:data` (existing integration test in build-data.test.ts) | ❌ Wave 0: add function to build-data.ts |
| SCHEMA-05 | `generate-species-photos.ts` output typed at authoring | type check | `npm run typecheck` | ❌ Wave 0: add type annotation to generate-species-photos.ts |
| SCHEMA-06 | DuckDB rejects bad CSV coercion | integration | integration tests in build-data.test.ts (existing) | ✅ Existing tests cover DuckDB validation |
| SCHEMA-07 | `npm run verify:parquet` exists and runs | smoke | `node scripts/verify-parquet.ts` | ❌ Wave 0: create verify-parquet.ts |

### Sampling Rate

- **Per task commit:** `npm run typecheck` (quick, ~5s)
- **Per wave merge:** `npm run typecheck && npm test`
- **Phase gate:** `npm run typecheck && npm test && npm run build:data && npm run verify:parquet` + byte-identity diff against `_site_baseline/`

### Wave 0 Gaps

- [ ] `scripts/verify-parquet.ts` — new script for SCHEMA-07
- [ ] `package.json` — add `"verify:parquet": "node scripts/verify-parquet.ts"`; update `test` script (remove `migrate-species.test.js`, change `.test.js` → `.test.ts` for converted scripts); update `build:data`, `photos:ingest`, etc. to reference `.ts` (or leave as-is — Node 24 resolves `.ts` extension natively when using `node scripts/build-data.ts`)

*(If no gaps: "None — existing test infrastructure covers all phase requirements")*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Build-side only; no auth |
| V3 Session Management | no | No sessions |
| V4 Access Control | no | No access control changes |
| V5 Input Validation | yes | DuckDB typed `read_csv` is the input gate; `validateCsv` pre-flight for UTF-8 + column presence; `validateSlugComponent` for path traversal (already implemented) |
| V6 Cryptography | no | No crypto |

### Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via genus/species CSV values | Tampering | `validateSlugComponent()` already rejects `[^a-zA-Z0-9 -]` — preserve in TS conversion |
| Secret leakage in error messages | Information Disclosure | `redact()` helper in `ingest-photos.ts` / `tile-photos.ts` — preserve; type-annotate as `(msg: string): string` |
| DuckDB SQL injection via slug interpolation | Tampering | `validateSlugComponent` guards the only SQL-interpolated value; pattern is intentional (DuckDB COPY TO doesn't support parameterized paths) |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `readFileSync(path).buffer` directly | `.buffer.slice(byteOffset, byteOffset + byteLength)` | Node.js design (all versions) | Prevents hyparquet PAR1 footer error on small files |
| `parquet_schema()` for column check | `DESCRIBE SELECT * FROM read_parquet(...)` | — | `DESCRIBE` returns logical types; `parquet_schema()` returns physical types (BYTE_ARRAY) — `DESCRIBE` is better for column-name comparison |

**Deprecated/outdated:**
- `scripts/migrate-species.test.js` line 1: `import { validateCsv } from '../scripts/build-data.js'` — becomes dead after migration-species.js is deleted; this file is itself deleted.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `data/parquet/{slug}/records.parquet` is the correct source path for `verify-parquet.ts` (not `_site/species/`) | Architecture Patterns, Pattern 2 | LOW — verified by inspecting `_site/species/abagrotis-apposita/` which shows only `index.html` |
| A2 | The `npm run build:data` package.json script reference can stay as `node scripts/build-data.js` during conversion (Node 24 resolves `.ts` from the script) — OR the planner updates it to `.ts` | Standard Stack | LOW — either works; `.ts` extension is preferred for clarity |
| A3 | `_instructions/ADDING_PLATE.md` Step 4 can be removed entirely (not just the script reference) since photographic plate tiles were already uploaded once and `upload-plates.js` was a one-time tool | Doc Update Map | MEDIUM — if the operator needs to add new plates, they need an alternative method; planner should verify with human whether the script was truly one-time |

**If this table is empty:** it isn't — see above.

---

## Open Questions

1. **`_instructions/ADDING_PLATE.md` update scope**
   - What we know: `upload-plates.js` is being deleted; the doc references it for the "Upload new tiles to CDN" step.
   - What's unclear: Is adding photographic plates still a supported operator workflow, or was this truly a one-time migration step? If it's still needed, what replaces `upload-plates.js`?
   - Recommendation: Planner adds a `checkpoint:human-verify` before deleting this doc step. If plates are done, remove Step 4. If still needed, replace with a manual `curl PUT` recipe (the pattern is already documented in `_instructions/UPLOADING_TILES.md`).

2. **Package.json script invocations after `.ts` rename**
   - What we know: `build:data` currently calls `node scripts/build-data.js`; Node 24 resolves `.ts` files when invoked as `node scripts/build-data.ts`. Under native type-stripping, both work if the `.js` file is renamed to `.ts`.
   - What's unclear: Whether the planner prefers updating `package.json` script invocations from `.js` → `.ts` (clearer) vs leaving them and relying on Node 24 to find the renamed file (Node 24 does not auto-resolve `.ts` for a `.js` specifier — it requires the extension to match).
   - Recommendation: **Update `package.json` scripts to reference `.ts` files** (e.g. `node scripts/build-data.ts`). Node 24 with native type-stripping runs `.ts` files directly. The current scripts reference `.js` which will break after rename.

---

## Sources

### Primary (HIGH confidence)

- `scripts/build-data.js` — read in full; DuckDB typed read_csv patterns, validation queries, Parquet export loop, self-invocation guard [VERIFIED: codebase]
- `scripts/copy-parquet.js` — read in full; source (`data/parquet`) and dest (`_site/species`) paths [VERIFIED: codebase]
- `scripts/ingest-photos.js` — read in full; complete match_bucket value set; status values ('discovered', 'failed'); view usage [VERIFIED: codebase]
- `scripts/generate-species-photos.js` — read in full; view/specimen_id usage; JSON output shape [VERIFIED: codebase]
- `scripts/lib/parse-photo-filename.ts` — read in full; view: 'D' | 'V' | ''; TAIL_RE pattern [VERIFIED: codebase]
- `scripts/lib/manifest.ts` (lines 57-66) — ManifestStatus union; ManifestRow type [VERIFIED: codebase]
- `src/components/parquet-cache.js` — read in full; hyparquet `parquetReadObjects` pattern; `res.arrayBuffer()` (not `readFileSync`) [VERIFIED: codebase]
- `package.json` — read in full; all script entries, test glob, dependency versions [VERIFIED: codebase]
- `tsconfig.node.json` — read in full; include globs, allowImportingTsExtensions, types:["node"] [VERIFIED: codebase]
- `_instructions/ADDING_PLATE.md`, `_instructions/UPLOADING_TILES.md` — references to `upload-plates.js` [VERIFIED: codebase]
- Live probe: DuckDB `DESCRIBE` vs `parquet_schema()` on `data/parquet/abagrotis-apposita/records.parquet` — confirmed DESCRIBE returns logical column names matching OccurrenceRecordSchema.shape [VERIFIED: live probe]
- Live probe: `readFileSync(path).buffer` shared pool bug — reproduced on `abagrotis-brunneipennis` (2932 bytes in 8192-byte pool); confirmed fix via `.slice(byteOffset, ...)` [VERIFIED: live probe]
- Live probe: Full verify:parquet scan — 1,453 species, 92,648 rows, 0 failures, 0.5 seconds [VERIFIED: live probe]
- Live probe: `time npm run build:data` — 3.8 seconds baseline [VERIFIED: live probe]
- Live probe: `npm test` — 224/224 tests pass [VERIFIED: live probe]
- Live probe: Node 24 type-stripping — `node --input-type=module` with `.ts` content works; no extra flags needed [VERIFIED: live probe]

### Secondary (MEDIUM confidence)

- `33-RESEARCH.md` — tsconfig layout, Node 24 type-stripping notes, OccurrenceRecordSchema column list, hyparquet API [VERIFIED: prior research phase]
- `34-CONTEXT.md` — boundary guard + ManifestRow template patterns [VERIFIED: prior phase decisions]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages confirmed installed; no new packages needed
- Architecture: HIGH — live probes verified all critical paths (SCHEMA-04 DESCRIBE, hyparquet pool bug, verify:parquet timing)
- Pitfalls: HIGH — Pool bug discovered and confirmed by live probe; import specifier requirement confirmed from Phase 33/34 working code
- SCHEMA-04: HIGH — live DESCRIBE + OccurrenceRecordSchema.shape comparison verified to produce 14/14 match

**Research date:** 2026-06-09
**Valid until:** 2026-07-09 (30 days; toolchain is stable; data profile is permanent until CSV schema changes)
