# Phase 35: Build Pipeline Scripts Migration - Pattern Map

**Mapped:** 2026-06-09
**Files analyzed:** 19 (9 converted scripts + 5 converted test files + 1 new script + 4 package.json/tsconfig touchpoints)
**Analogs found:** 19 / 19 (all files have at least a role-match analog in the Phase 34 converted libs)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `scripts/build-data.ts` | utility/pipeline | batch + CRUD | `scripts/profile-data.ts` (DuckDB structure); `scripts/build-data.js` (self, source) | exact (self + profile-data structure) |
| `scripts/build-data.test.ts` | test | batch | `scripts/build-data.test.js` (self); `scripts/lib/manifest.test.ts` pattern | exact (self) |
| `scripts/copy-parquet.ts` | utility | file-I/O | `scripts/copy-parquet.js` (self); `scripts/lib/dropbox-download.ts` (Node fs/path imports) | exact (self) |
| `scripts/copy-images.ts` | utility | file-I/O | `scripts/copy-parquet.js` (self sibling); `scripts/copy-images.js` (self) | exact (self) |
| `scripts/emit-species-states.ts` | utility/pipeline | batch + CRUD | `scripts/emit-species-states.js` (self); `scripts/profile-data.ts` (DuckDB pattern) | exact (self) |
| `scripts/check-page-weight.ts` | utility | request-response | `scripts/check-page-weight.js` (self) | exact (self) |
| `scripts/check-page-weight.test.ts` | test | request-response | `scripts/check-page-weight.test.js` (self) | exact (self) |
| `scripts/ingest-photos.ts` | pipeline | event-driven + file-I/O | `scripts/ingest-photos.js` (self); `scripts/lib/dropbox-list.ts` (boundary guard) | exact (self + guard pattern) |
| `scripts/ingest-photos.test.ts` | test | event-driven | `scripts/ingest-photos.test.js` (self) | exact (self) |
| `scripts/tile-photos.ts` | pipeline | file-I/O + batch | `scripts/tile-photos.js` (self); `scripts/lib/dropbox-download.ts` (download pattern) | exact (self) |
| `scripts/tile-photos.test.ts` | test | batch | `scripts/tile-photos.test.js` (self) | exact (self) |
| `scripts/upload-tiles.ts` | pipeline | request-response | `scripts/upload-tiles.js` (self); `scripts/lib/dropbox-list.ts` (fetch + boundary guard) | exact (self) |
| `scripts/upload-tiles.test.ts` | test | request-response | `scripts/upload-tiles.test.js` (self) | exact (self) |
| `scripts/generate-species-photos.ts` | pipeline | transform | `scripts/generate-species-photos.js` (self); `scripts/lib/manifest.ts` (ManifestRow type) | exact (self) |
| `scripts/generate-species-photos.test.ts` | test | transform | `scripts/generate-species-photos.test.js` (self) | exact (self) |
| `scripts/verify-parquet.ts` | utility/validator | batch + file-I/O | `scripts/profile-data.ts` (scan-all + Zod structure); `src/components/parquet-cache.js` (parquetReadObjects pattern) | role-match (no exact analog; new pattern) |
| `package.json` | config | — | `package.json` (self) | exact (self) |
| `tsconfig.node.json` | config | — | `tsconfig.node.json` (self, no change expected) | exact (self) |

---

## Pattern Assignments

### `scripts/build-data.ts` (utility/pipeline, batch)

**Analog 1 (source to convert):** `scripts/build-data.js`
**Analog 2 (structure/DuckDB pattern):** `scripts/profile-data.ts`

**Imports pattern** — from `scripts/build-data.js` lines 1–6 + `scripts/profile-data.ts` lines 1–21:
```typescript
import { DuckDBInstance } from '@duckdb/node-api';
import type { DuckDBConnection } from '@duckdb/node-api';
import { readFileSync, mkdirSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { OccurrenceRecordSchema } from '../src/types/schemas.ts';
```

**main() pattern with self-invocation guard** — from `scripts/profile-data.ts` lines 23 + 200–205:
```typescript
export async function main(): Promise<void> {
  // ... pipeline body
  conn.closeSync();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
```

**DuckDB read_csv typed columns pattern** — from `scripts/build-data.js` lines 97–137 (replicate verbatim, just add TS types):
```typescript
// records.csv — WITHOUT nullstr='' (blank cells become NULL)
await conn.run(`
  CREATE TABLE records AS
  SELECT * FROM read_csv('data/records.csv',
    header = true,
    columns = {
      'species_slug': 'VARCHAR',
      'record_type': 'VARCHAR',
      'latitude': 'DOUBLE',
      ...
    }
  )
`);

// species.csv — WITH nullstr='' (empty strings become NULL)
await conn.run(`
  CREATE TABLE species AS
  SELECT * FROM read_csv('data/species.csv',
    header = true,
    nullstr = '',
    columns = { 'id': 'INTEGER', 'genus': 'VARCHAR', ... }
  )
`);
```

**validateCsv function type annotation** — from `scripts/build-data.js` lines 17–49:
```typescript
export function validateCsv(filePath: string, requiredColumns: string[]): Record<string, string>[] {
  // ... body unchanged; add return type annotation
  // rows[0] access: guard with const [firstRow] = rows or assert firstRow !== undefined
  const [firstRow] = rows;
  if (!firstRow) throw new Error(`${filePath} is empty or has no data rows.`);
  const headers = Object.keys(firstRow);
  // ...
}
```

**validateSlugComponent function type annotation** — from `scripts/build-data.js` lines 60–66:
```typescript
function validateSlugComponent(value: string, fieldName: string): void {
  if (!/^[a-zA-Z0-9 -]+$/.test(value)) {
    throw new Error(`Invalid ${fieldName} value "${value}" — only alphanumeric characters, spaces, and hyphens are allowed.`);
  }
}
```

**SCHEMA-04 column schema check** — add after Parquet export loop, before `conn.closeSync()` (complete pattern from RESEARCH Pattern 1):
```typescript
async function verifySampleParquetSchema(conn: DuckDBConnection, firstSlug: string): Promise<void> {
  const parquetPath = `data/parquet/${firstSlug}/records.parquet`;
  const result = await conn.runAndReadAll(
    `DESCRIBE SELECT * FROM read_parquet('${parquetPath}')`
  );
  const actualCols: string[] = (result.getRowObjectsJS() as Array<{ column_name: string }>)
    .map(r => r.column_name);
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

// Get firstSlug from speciesRows (already fetched earlier in main())
const sortedSpecies = [...speciesRows].sort((a, b) =>
  (a.genus + a.species).toLowerCase().localeCompare((b.genus + b.species).toLowerCase())
);
const [firstSp] = sortedSpecies;
if (!firstSp) throw new Error('No species rows found');
const firstSlug = `${firstSp.genus}-${firstSp.species}`.toLowerCase().replace(/\s+/g, '-');
await verifySampleParquetSchema(conn, firstSlug);
```

**noUncheckedIndexedAccess pattern** — from `scripts/lib/parse-photo-filename.ts` lines 82–83:
```typescript
// Guard before indexing, not after
const [firstRow] = rows;
if (!firstRow) continue; // or throw
```

---

### `scripts/build-data.test.ts` (test, batch)

**Analog:** `scripts/build-data.test.js` (self — rename + update specifiers)

**Import specifier update pattern** — from RESEARCH Pattern 5 and Pitfall 6:
```typescript
// Before (build-data.test.js line 10):
import { validateCsv } from '../scripts/build-data.js';

// After (build-data.test.ts):
import { validateCsv } from './build-data.ts';
```

**noUncheckedIndexedAccess guard for test assertions** — from RESEARCH Pitfall 3:
```typescript
// Before:
assert.strictEqual(rows[0].state, 'TX');

// After:
const [firstRow] = rows;
assert.ok(firstRow !== undefined);
assert.strictEqual(firstRow.state, 'TX');
```

---

### `scripts/copy-parquet.ts` (utility, file-I/O)

**Analog:** `scripts/copy-parquet.js` (self — minimal rename)

**Complete script pattern** — from `scripts/copy-parquet.js` lines 1–15 (entire file):
```typescript
import { cp } from 'node:fs/promises';
import { resolve } from 'node:path';

const src = resolve('data/parquet');
const dest = resolve('_site/species');

await cp(src, dest, { recursive: true });
console.log('Copied Parquet files: data/parquet/ -> _site/species/');
```
No changes needed beyond renaming (this is a top-level `await` script with no exports and no test — see RESEARCH Pitfall 4 for why no `main()` wrapping is needed).

---

### `scripts/copy-images.ts` (utility, file-I/O)

**Analog:** `scripts/copy-images.js` (self — minimal rename, same top-level await pattern as copy-parquet)

Same pattern as `copy-parquet.ts`: top-level await, no exports, no test. Convert as-is.

---

### `scripts/emit-species-states.ts` (utility/pipeline, batch)

**Analog 1 (source):** `scripts/emit-species-states.js`
**Analog 2 (DuckDB + main() pattern):** `scripts/profile-data.ts`

**Imports + main() pattern** — from `scripts/profile-data.ts` lines 13–22:
```typescript
import { DuckDBInstance } from '@duckdb/node-api';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

export async function main(): Promise<void> {
  const db = await DuckDBInstance.create(':memory:');
  const conn = await db.connect();
  // ... query and write
  conn.closeSync();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err); process.exit(1); });
}
```

**DuckDB result typing** — from `scripts/profile-data.ts` lines 133–134:
```typescript
const rows = (await conn.runAndReadAll('SELECT ...')).getRowObjectsJS() as Record<string, unknown>[];
```

---

### `scripts/check-page-weight.ts` (utility, request-response)

**Analog:** `scripts/check-page-weight.js` (self — rename + type annotations)

**Subprocess invocation in test** — from RESEARCH Pitfall 5:
```typescript
// check-page-weight.test.ts — update to .ts path
spawnSync('node', ['scripts/check-page-weight.ts', ...args])
```

---

### `scripts/check-page-weight.test.ts` (test, request-response)

**Analog:** `scripts/check-page-weight.test.js` (self — rename; update subprocess call to `.ts` path per Pitfall 5)

---

### `scripts/ingest-photos.ts` (pipeline, event-driven + file-I/O)

**Analog 1 (source):** `scripts/ingest-photos.js`
**Analog 2 (boundary guard pattern):** `scripts/lib/dropbox-list.ts`

**Imports pattern** — from `scripts/ingest-photos.js` lines 23–30:
```typescript
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { extractBinomial, parseSpecimenAndView, toSpeciesSlug } from './lib/parse-photo-filename.ts';
import { dbxCall } from './lib/dropbox-list.ts';
import { readManifest, writeManifest, sortForInvestigation } from './lib/manifest.ts';
// Add for D-09:
import type { ParseSpecimenAndViewResult } from './lib/parse-photo-filename.ts';
```

**External boundary minimal interface + guard pattern** — from `scripts/lib/dropbox-list.ts` lines 27–52:
```typescript
// D-10: minimal consumed-field interface for csv-parse output (local to file)
interface SpeciesCsvRow {
  genus: string;
  species: string;
  // ...only fields consumed
}

function isSpeciesCsvRow(obj: unknown): obj is SpeciesCsvRow {
  if (typeof obj !== 'object' || obj === null) return false;
  const r = obj as Record<string, unknown>;
  return typeof r['genus'] === 'string' && typeof r['species'] === 'string';
}
```

**view / match_bucket union types (D-09)** — from `scripts/lib/parse-photo-filename.ts` lines 52–55 and RESEARCH Pattern 4:
```typescript
// In parse-photo-filename.ts (already has view):
// ParseSpecimenAndViewResult.view: 'D' | 'V' | ''

// Add to parse-photo-filename.ts or manifest.ts:
export type MatchBucket =
  | 'resolved-via-synonym'
  | 'provisional'
  | 'unparseable'
  | 'clean-match'
  | 'slug-match'
  | 'genus-only'
  | 'likely-synonym';
```

**redact() helper type annotation** — from `scripts/generate-species-photos.js` lines 44–48:
```typescript
function redact(msg: string): string {
  return DROPBOX_TOKEN
    ? msg.replace(new RegExp(DROPBOX_TOKEN, 'g'), '[REDACTED]')
    : msg;
}
```

**Env var constants pattern** — from `scripts/ingest-photos.js` lines 41–44:
```typescript
const DROPBOX_TOKEN: string = process.env['DROPBOX_TOKEN'] ?? '';
const DROPBOX_SHARE_URL: string = process.env['DROPBOX_SHARE_URL'] ?? 'https://...';
const DRY_RUN: boolean = process.env['DRY_RUN'] === '1';
const RESORT_ONLY: boolean = process.env['RESORT_ONLY'] === '1';
```

---

### `scripts/ingest-photos.test.ts` (test, event-driven)

**Analog:** `scripts/ingest-photos.test.js` (self — rename + update import specifier to `.ts`)

Import specifier update (RESEARCH Pattern 5):
```typescript
// Before: import { ... } from './ingest-photos.js';
// After:  import { ... } from './ingest-photos.ts';
```

---

### `scripts/tile-photos.ts` (pipeline, file-I/O + batch)

**Analog 1 (source):** `scripts/tile-photos.js`
**Analog 2 (download pattern):** `scripts/lib/dropbox-download.ts`

**TILEABLE_BUCKETS typed with MatchBucket** — from RESEARCH Pattern 4:
```typescript
import type { MatchBucket } from './lib/parse-photo-filename.ts'; // or manifest.ts
const TILEABLE_BUCKETS: Set<MatchBucket> = new Set([
  'clean-match',
  'slug-match',
  'resolved-via-synonym',
]);
```

**ManifestRow consumption pattern** — from `scripts/lib/manifest.ts` lines 66 + 97–101:
```typescript
import { readManifest, writeManifest, advanceStatus } from './lib/manifest.ts';
import type { ManifestRow, ManifestStatus } from './lib/manifest.ts';

const rows: ManifestRow[] = await readManifest(MANIFEST_PATH);
```

---

### `scripts/tile-photos.test.ts` (test, batch)

**Analog:** `scripts/tile-photos.test.js` (self — rename + update import specifier to `.ts`)

---

### `scripts/upload-tiles.ts` (pipeline, request-response)

**Analog 1 (source):** `scripts/upload-tiles.js`
**Analog 2 (fetch + error pattern):** `scripts/lib/dropbox-download.ts` lines 79–86

**External boundary pattern for Bunny CDN response** — from `scripts/lib/dropbox-download.ts` lines 79–86:
```typescript
if (!res.ok) {
  const text = await res.text();
  const err = new Error(`PUT ${destPath} → ${res.status}: ${redact(text)}`);
  throw err;
}
```

**tileUploadPath using view** — from RESEARCH Pattern 4 (view type):
```typescript
function tileUploadPath(row: ManifestRow): string {
  const view: 'D' | 'V' | '' = row.view as 'D' | 'V' | '';
  // ...
}
```

---

### `scripts/upload-tiles.test.ts` (test, request-response)

**Analog:** `scripts/upload-tiles.test.js` (self — rename + update import specifier to `.ts`)

---

### `scripts/generate-species-photos.ts` (pipeline, transform)

**Analog 1 (source):** `scripts/generate-species-photos.js`
**Analog 2 (ManifestRow pattern):** `scripts/lib/manifest.ts`

**Imports pattern** — from `scripts/generate-species-photos.js` lines 19–20 + SCHEMA-05 type:
```typescript
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { readManifest } from './lib/manifest.ts';
import type { ManifestRow } from './lib/manifest.ts';
// SCHEMA-05: static type for JSON output at authoring time
import type { SpeciesPhoto } from '../src/types/index.ts';
```

**SCHEMA-05 output typing** — from RESEARCH Pattern 6:
```typescript
// Type the result object at authoring time — satisfies SCHEMA-05
const result: Record<string, SpeciesPhoto> = {};
// ... populate result ...
await writeFile(OUTPUT_PATH, JSON.stringify(result, null, 2));
```

**redact() type annotation** — from `scripts/generate-species-photos.js` lines 44–48:
```typescript
function redact(msg: string): string {
  return BUNNY_API_KEY
    ? msg.replace(new RegExp(BUNNY_API_KEY, 'g'), '[REDACTED]')
    : msg;
}
```

---

### `scripts/generate-species-photos.test.ts` (test, transform)

**Analog:** `scripts/generate-species-photos.test.js` (self — rename + update import specifier to `.ts`)

---

### `scripts/verify-parquet.ts` (utility/validator, batch + file-I/O) — NEW FILE

**Analog 1 (structure):** `scripts/profile-data.ts` — scan-all loop, Zod safeParse, process.exit pattern
**Analog 2 (hyparquet read):** `src/components/parquet-cache.js` lines 24–29 — `parquetReadObjects` + `file` object shape

**Complete script pattern** — from RESEARCH Pattern 2 (verified via live probe):

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
  // CRITICAL: isolate from Node's shared pool buffer (RESEARCH Pitfall 1)
  const ab: ArrayBuffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  const file = {
    byteLength: ab.byteLength,
    slice: (s: number, e: number) => ab.slice(s, e),
  };
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
  for (const f of failures) {
    console.error(`FAIL ${f.slug} row ${f.row}: ${f.issues}`);
  }
  console.error(`FAIL: ${failures.length} validation error(s) across ${species.length} species, ${totalRows} rows`);
  process.exit(1);
}
console.log(`OK: ${species.length} species, ${totalRows} rows validated`);
```

**hyparquet file object shape** — from `src/components/parquet-cache.js` lines 24–29:
```javascript
// production (browser, fetch):
const file = {
  byteLength: arrayBuffer.byteLength,
  slice: (start, end) => arrayBuffer.slice(start, end),
};
// Node adaptation: same shape, different ArrayBuffer source (readFileSync + pool fix)
```

**Source path:** `data/parquet/{slug}/records.parquet` — NOT `_site/species/` (only `index.html` after build).

---

### `package.json` (config)

**Changes required:**
1. Update `test` script: remove `scripts/migrate-species.test.js`; change `scripts/*.test.js` → `scripts/*.test.ts` for each converted file.
2. Add `"verify:parquet": "node scripts/verify-parquet.ts"`.
3. Update pipeline script invocations from `.js` → `.ts` (e.g. `node scripts/build-data.js` → `node scripts/build-data.ts`).
4. Remove `migrate:images` and `migrate:species` npm script entries.

**Updated test script** — from RESEARCH Pattern 5:
```
node --test eleventy.config.test.js scripts/build-data.test.ts scripts/check-page-weight.test.ts scripts/ingest-photos.test.ts scripts/tile-photos.test.ts scripts/upload-tiles.test.ts scripts/generate-species-photos.test.ts 'scripts/lib/*.test.{js,ts}' src/components/*.test.js 'src/_lib/*.test.{js,ts}'
```

---

## Shared Patterns

### Pattern A: Minimal Interface + Runtime Guard (D-10 template)
**Source:** `scripts/lib/dropbox-list.ts` lines 27–52
**Apply to:** `ingest-photos.ts`, `tile-photos.ts`, `upload-tiles.ts` for any external API response or csv-parse output not covered by `ManifestRow`.

```typescript
// D-10 template — consumed-field interface (only what the script uses)
interface SomeApiResponse {
  fieldA: string;
  fieldB: number;
}

function isSomeApiResponse(data: unknown): data is SomeApiResponse {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return typeof d['fieldA'] === 'string' && typeof d['fieldB'] === 'number';
}

// Usage: narrow the unknown return from dbxCall or csv-parse
const raw: unknown = await dbxCall(...);
if (!isSomeApiResponse(raw)) throw new Error('unexpected response shape');
```

### Pattern B: ManifestRow Import and Use
**Source:** `scripts/lib/manifest.ts` lines 60–101
**Apply to:** `ingest-photos.ts`, `tile-photos.ts`, `upload-tiles.ts`, `generate-species-photos.ts`

```typescript
import { readManifest, writeManifest, advanceStatus } from './lib/manifest.ts';
import type { ManifestRow, ManifestStatus } from './lib/manifest.ts';

const rows: ManifestRow[] = await readManifest(MANIFEST_PATH);
// Access row fields — all string, no | undefined under noUncheckedIndexedAccess:
const status: string = row.status;
const slug: string = row.species_slug;
```

### Pattern C: noUncheckedIndexedAccess Array Guard
**Source:** `scripts/lib/parse-photo-filename.ts` lines 82–83; `scripts/lib/manifest.ts` lines 178–181
**Apply to:** All converted scripts and test files that index arrays.

```typescript
// Pattern: destructure or explicit guard before use
const [firstRow] = rows;
if (!firstRow) continue;  // or throw

// In test files:
const [result] = results;
assert.ok(result !== undefined);
assert.strictEqual(result.field, expected);
```

### Pattern D: Self-Invocation Guard (main() scripts)
**Source:** `scripts/profile-data.ts` lines 200–205
**Apply to:** `build-data.ts`, `emit-species-states.ts`

```typescript
export async function main(): Promise<void> { /* ... */ }

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
```

### Pattern E: Import Specifier Must Use .ts Extension
**Source:** RESEARCH Pitfall 2; verified from Phase 34 working code in `scripts/lib/*.ts`
**Apply to:** ALL converted scripts — every internal import.

```typescript
// Always .ts, never .js (even though the source is .ts):
import { readManifest } from './lib/manifest.ts';
import { OccurrenceRecordSchema } from '../src/types/schemas.ts';
// NOT: import { readManifest } from './lib/manifest.js';
```

### Pattern F: view / match_bucket String-Literal Unions (D-09)
**Source:** `scripts/lib/parse-photo-filename.ts` lines 52–55 (view); RESEARCH Pattern 4 (match_bucket)
**Apply to:** `ingest-photos.ts`, `tile-photos.ts`, `generate-species-photos.ts`, `upload-tiles.ts`; export `MatchBucket` from `parse-photo-filename.ts` or `manifest.ts`.

```typescript
// Already in parse-photo-filename.ts (ParseSpecimenAndViewResult):
view: 'D' | 'V' | ''

// Add export to parse-photo-filename.ts or manifest.ts:
export type MatchBucket =
  | 'resolved-via-synonym'
  | 'provisional'
  | 'unparseable'
  | 'clean-match'
  | 'slug-match'
  | 'genus-only'
  | 'likely-synonym';

// In tile-photos.ts:
import type { MatchBucket } from './lib/parse-photo-filename.ts';
const TILEABLE_BUCKETS: Set<MatchBucket> = new Set(['clean-match', 'slug-match', 'resolved-via-synonym']);
```

### Pattern G: DuckDB getRowObjectsJS() Typing
**Source:** `scripts/profile-data.ts` lines 133–148
**Apply to:** `build-data.ts`, `emit-species-states.ts`

```typescript
// getRowObjectsJS() returns unknown[] — narrow immediately
const rows = (await conn.runAndReadAll('SELECT ...')).getRowObjectsJS() as Record<string, unknown>[];
// For DESCRIBE:
const cols = (await conn.runAndReadAll('DESCRIBE ...')).getRowObjectsJS() as Array<{ column_name: string }>;
```

---

## No Analog Found

No files are in this category. All files either convert from an existing JS source (strong self-analog) or follow the `scripts/profile-data.ts` / `scripts/lib/dropbox-list.ts` patterns (role-match).

---

## Analog Search Scope

**Directories searched:** `scripts/`, `scripts/lib/`, `src/components/`, `src/types/`
**Files scanned:** 12 source files read in full
**Pattern extraction date:** 2026-06-09

## Critical Constraints for Planner

1. **Node.js shared pool ArrayBuffer bug** (`verify-parquet.ts` only): MUST use `raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)` — NOT `raw.buffer` directly. Causes `parquet file invalid (footer != PAR1)` on small files.
2. **`copy-images.ts` and `copy-parquet.ts`**: top-level `await`, no `main()` wrapper, no test — convert as-is per Pitfall 4.
3. **SQL interpolation in `build-data.ts`**: Parquet export loop uses string-interpolated SQL. Do NOT refactor to parameterized queries — `COPY TO parquet` doesn't support them. Preserve `validateSlugComponent` guard exactly.
4. **`migrate-species.test.js` deletion**: Deleting it automatically removes the cross-import into `build-data.js` (Pitfall 6). The `build-data.test.ts` import must still be updated from `.js` → `.ts`.
5. **SCHEMA-04 sampling**: Use `abagrotis-apposita` (verified first alphabetically) or derive from sorted speciesRows in-memory. Both are confirmed equivalent.
