# Phase 39: Key Matrix Data Pipeline - Pattern Map

**Mapped:** 2026-06-24
**Files analyzed:** 9 new/modified files
**Analogs found:** 9 / 9

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `data/key-characters.csv` | data | batch | `data/species-synonyms.csv` | role-match |
| `scripts/build-key.ts` | service/utility | batch, file-I/O | `scripts/emit-species-states.ts` + `scripts/build-data.ts` | exact (composite) |
| `scripts/build-key.test.ts` | test | batch | `scripts/build-data.test.ts` | exact |
| `scripts/copy-key-matrix.ts` | utility | file-I/O | `scripts/copy-parquet.ts` | exact |
| `scripts/check-key-weight.ts` | utility | file-I/O | `scripts/check-page-weight.ts` | role-match |
| `src/types/schemas.ts` (modify) | model | — | `src/types/schemas.ts` (self) | exact |
| `data/species-synonyms.csv` (modify) | data | — | `data/species-synonyms.csv` (self) | exact |
| `package.json` (modify) | config | — | `package.json` (self) | exact |
| `.github/workflows/deploy.yml` + `pr-check.yml` (modify) | config | — | both workflow files (self) | exact |

---

## Pattern Assignments

### `scripts/build-key.ts` (service/utility, batch + file-I/O)

**Primary analog:** `scripts/emit-species-states.ts`
**Secondary analog:** `scripts/build-data.ts`

**Imports pattern** (`emit-species-states.ts` lines 1–7):
```typescript
// scripts/emit-species-states.ts
import { DuckDBInstance } from '@duckdb/node-api';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
```

For `build-key.ts`, extend with:
```typescript
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'csv-parse/sync';
import { DuckDBInstance } from '@duckdb/node-api';
import { validateCsv } from './build-data.ts';
import { CharacterSchema, KeySpeciesSchema, KeyMatrixSchema } from '../src/types/schemas.ts';
```

**`validateCsv` pre-flight pattern** (`build-data.ts` lines 19–53):
```typescript
export function validateCsv(filePath: string, requiredColumns: string[]): Record<string, string>[] {
  let raw: Buffer;
  try {
    raw = readFileSync(filePath);
  } catch (e) {
    throw new Error(`Cannot read ${filePath}: ${(e as Error).message}`);
  }
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(raw);
  } catch {
    throw new Error(`${filePath} contains non-UTF-8 bytes. ...`);
  }
  const rows: Record<string, string>[] = parse(raw, { columns: true, skip_empty_lines: true });
  if (rows.length === 0) throw new Error(`${filePath} is empty or has no data rows.`);
  // ... column presence check ...
  return rows;
}
```
Call as `validateCsv('data/key-characters.csv', [])` — pass empty `requiredColumns` because columns are positional (row 0 = species, not field names). This gives UTF-8 + file-exists check without failing on positional-column CSV.

**CSV parse pattern with `columns: false`** (RESEARCH.md Pattern 1):
```typescript
const raw = readFileSync(resolve('data/key-characters.csv'));
// CRITICAL: columns: false — row 0 is species data, not field names
const allRows: string[][] = parse(raw, { columns: false, skip_empty_lines: true });
const [headerRow, ...dataRows] = allRows;
const speciesBinomials = (headerRow ?? []).slice(1);  // 1,228 entries
```
Anti-pattern to avoid: `columns: true` would destroy the header row by treating species binomials as field names.

**Slug resolution pattern** (`scripts/ingest-photos.ts` lines 243–269):
```typescript
// Load synonyms with bom: true (handles Excel UTF-8 BOM on Windows)
const records = parse(raw, { columns: true, skip_empty_lines: true, bom: true });
const synonyms = new Map<string, SynonymEntry>();
for (const r of records) {
  const from = (r.from_binomial || '').trim().toLowerCase();
  const to = (r.to_species_slug || '').trim().toLowerCase();
  // ...
  synonyms.set(from, { ... });
}
```
For `build-key.ts`, the resolution lookup uses `from_binomial` as normalized string (not lowercased — the CSV uses canonical binomial form like `"Grammia doris"`):
```typescript
const synonymRows: Array<{from_binomial: string; to_species_slug: string}> = parse(
  readFileSync(resolve('data/species-synonyms.csv')), { columns: true, skip_empty_lines: true, bom: true }
);
const synonymMap = new Map(synonymRows.map(r => [r.from_binomial, r.to_species_slug]));
```
Normalize BEFORE lookup: `raw.trim().replace(/\s+/g, ' ')` — the `Grammia  blakei` double-space becomes `Grammia blakei`, which matches the single-space synonym entry.

**DuckDB nav-image query pattern** (`src/_data/taxon.ts` lines 111–154):
```typescript
// Load images.csv into DuckDB (all columns VARCHAR, nullstr='')
await conn.run(`
  CREATE TABLE images AS
  SELECT * FROM read_csv('data/images.csv',
    header = true, nullstr = '',
    delim = ',', quote = '"', escape = '"', auto_detect = false,
    columns = { 'species_slug': 'VARCHAR', 'filename': 'VARCHAR',
      'weight': 'VARCHAR', 'navigational': 'VARCHAR', ... }
  )
`);

// Prefer JS-side Map over SQL interpolation (avoids SQL injection from slug values)
const imagesResult = await conn.runAndReadAll(`
  SELECT species_slug, filename, photographer, TRY_CAST(weight AS INTEGER) AS weight, navigational
  FROM images
  ORDER BY species_slug, TRY_CAST(weight AS INTEGER)
`);
// Then build Map<slug, filename> in TypeScript — no slug interpolation into SQL
```
RESEARCH.md Open Question 2 recommends option (b): load all images into a `Map<slug, filename>` after a single `SELECT * FROM images`, then resolve per slug in TypeScript. This avoids any SQL interpolation of potentially-malformed slugs.

**Main function + process entry pattern** (`emit-species-states.ts` lines 8–56):
```typescript
export async function main(): Promise<void> {
  // ... pipeline logic ...
  writeFileSync(outPath, JSON.stringify(rows));
  console.log(`Wrote ... to ...`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error((err as Error).message);
    process.exit(1);
  });
}
```
`build-key.ts` must export `main()` so tests can import it, and use the same `import.meta.url` guard for direct invocation.

**Zod validation pattern** (see `build-data.ts` line 8 + usage at line ~89):
```typescript
// build-data.ts imports the schema from schemas.ts (defined with zod/mini)
import { OccurrenceRecordSchema } from '../src/types/schemas.ts';
// ...
const expectedCols: string[] = Object.keys(OccurrenceRecordSchema.shape);
```
For `build-key.ts`, call `KeyMatrixSchema.parse(artifact)` — `zod/mini` schemas expose `.parse()` compatible with build-time use. No need to import full `zod`.

**Post-Zod structural invariants** (RESEARCH.md Pattern 7):
```typescript
// After KeyMatrixSchema.parse(artifact) — NOT Zod refinements, mirrors assertParquetColumns
const nBytes = Math.ceil(artifact.species.length / 8);
const expectedB64Len = Math.ceil(nBytes / 3) * 4;
if (artifact.matrix.length !== 237) throw new Error('matrix length !== 237');
for (const b64 of artifact.matrix) {
  if (b64.length !== expectedB64Len) throw new Error(`bitset length mismatch: ${b64.length} vs ${expectedB64Len}`);
}
```

---

### `scripts/build-key.test.ts` (test, batch)

**Analog:** `scripts/build-data.test.ts`

**Test imports pattern** (`build-data.test.ts` lines 1–13):
```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCsv } from './build-data.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
```
For `build-key.test.ts`, import exported pure functions from `build-key.ts` (e.g., `normalizeBinomial`, `binomialToSlug`, `resolveSlug`, `parseCharacterLabel`, `buildBitset`).

**Unit test pattern** (`build-data.test.ts` lines 17–23):
```typescript
test('validateCsv: species.csv with correct columns does not throw', () => {
  validateCsv(resolve(ROOT, 'data/species.csv'), ['id', ...]);
  // reaching here = pass
});
```

**Error-assertion pattern** (`build-data.test.ts` lines 39–51):
```typescript
assert.throws(
  () => validateCsv(resolve(ROOT, 'data/species.csv'), ['MISSING_COL']),
  (err: unknown) => {
    assert.ok(err instanceof Error);
    assert.match(err.message, /missing required column.*MISSING_COL/i);
    return true;
  }
);
```

**Integration test pattern** (`build-data.test.ts` lines 158–171):
```typescript
test('integration: build-data.ts with good CSV produces Parquet files', () => {
  execSync('node scripts/build-data.ts', { cwd: ROOT, stdio: 'pipe' });
  assert.ok(existsSync(resolve(ROOT, 'data/parquet/.../records.parquet')));
});
```
For `build-key.test.ts`, run `execSync('node scripts/build-key.ts', { cwd: ROOT, stdio: 'pipe' })` and assert `existsSync(resolve(ROOT, 'data/key-matrix.json'))` and `existsSync(resolve(ROOT, 'data/key-coverage-report.json'))`.

**Async DuckDB test pattern** (`build-data.test.ts` lines 79–107):
```typescript
test('...', async () => {
  const { DuckDBInstance } = await import('@duckdb/node-api');
  const db = await DuckDBInstance.create(':memory:');
  const conn = await db.connect();
  await conn.run(`CREATE TABLE ...`);
  const result = await conn.runAndReadAll(`SELECT ...`);
  const rows = result.getRowObjectsJS() as Array<{ field: type }>;
  conn.closeSync();
  assert.strictEqual(rows.length, expected);
});
```

---

### `scripts/copy-key-matrix.ts` (utility, file-I/O)

**Analog:** `scripts/copy-parquet.ts` (lines 1–15)

**Full pattern** — this is a near-exact clone:
```typescript
/**
 * Copy key-matrix.json from data/ to _site/ after Eleventy build.
 * eleventy-plugin-vite wipes _site/ during build; post-build copy restores it.
 */
import { copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

await mkdir(resolve('_site'), { recursive: true });
await copyFile(resolve('data/key-matrix.json'), resolve('_site/key-matrix.json'));
console.log('Copied key matrix: data/key-matrix.json -> _site/key-matrix.json');
```
The original `copy-parquet.ts` uses `cp` (recursive directory copy). For a single file use `copyFile` + `mkdir`. No `export async function main()` needed — the script has no test seam; it's tested by the build chain integration.

---

### `scripts/check-key-weight.ts` (utility, file-I/O)

**Analog:** `scripts/check-page-weight.ts` (lines 1–39)

**Structure pattern** from `check-page-weight.ts`:
```typescript
// check-page-weight.ts
import { readdirSync, statSync, existsSync } from 'node:fs';

const SITE_DIR = process.env['SITE_DIR'] ?? '_site';

if (!existsSync(SITE_DIR)) {
  console.error(`[page-weight] ERROR: SITE_DIR "${SITE_DIR}" does not exist. Run the build first.`);
  process.exit(1);
}
// ... walk and check ...
if (warnCount > 0) {
  process.exit(1);  // implied — check-page-weight actually only warns, not exits
}
```

**New pattern for `check-key-weight.ts`** uses `zlib.gzipSync` (RESEARCH.md Pattern 8):
```typescript
import { readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'zlib';

const BUDGET_BYTES = 50 * 1024;
const ARTIFACT = '_site/key-matrix.json';

if (!existsSync(ARTIFACT)) {
  console.error(`[key-weight] ERROR: ${ARTIFACT} not found. Run build first.`);
  process.exit(1);
}
const raw = readFileSync(ARTIFACT);
const gz = gzipSync(raw);
if (gz.length > BUDGET_BYTES) {
  console.error(`[key-weight] FAIL: ${ARTIFACT} is ${(gz.length/1024).toFixed(1)} KB gzip (budget: 50 KB)`);
  process.exit(1);
}
console.log(`[key-weight] OK: ${ARTIFACT} is ${(gz.length/1024).toFixed(1)} KB gzip (<= 50 KB budget)`);
```
Unlike `check-page-weight.ts`, this script exits non-zero on failure (not just warns). This is the correct pattern for a hard budget gate.

---

### `src/types/schemas.ts` (modify — add key matrix schemas)

**Analog:** `src/types/schemas.ts` itself (lines 1–154)

**`zod/mini` import convention** (line 6):
```typescript
import * as z from 'zod/mini';
```
All new schemas must use `zod/mini` — the file header enforces this. Full `zod` is NOT imported in this file.

**`z.nullable(z.string())` convention** (lines 17–27, 36–43):
```typescript
// Pattern: z.nullable(z.string()) — NOT z.optional()
// Rationale: hyparquet writes null not undefined; be consistent
common_name: z.nullable(z.string()),
```

**`z.object` + `z.array` + `z.infer` pattern** (lines 12–28):
```typescript
export const OccurrenceRecordSchema = z.object({
  species_slug: z.string(),
  // ...
  county: z.nullable(z.string()),
});
export type OccurrenceRecord = z.infer<typeof OccurrenceRecordSchema>;
```

**New schemas to append** after existing schemas (after line 154):
```typescript
// --- Key Matrix (Phase 39) ---
export const CharacterSchema = z.object({
  id:             z.number(),
  category:       z.string(),
  subcategory:    z.nullable(z.string()),   // null for 3-part (2-colon) labels
  question:       z.string(),
  state:          z.string(),
  image_filename: z.nullable(z.string()),   // null until Phase 43 curator pass
});
export type Character = z.infer<typeof CharacterSchema>;

export const KeySpeciesSchema = z.object({
  slug:        z.string(),
  genus:       z.string(),
  epithet:     z.string(),
  common_name: z.nullable(z.string()),
  nav_image:   z.nullable(z.string()),
});
export type KeySpecies = z.infer<typeof KeySpeciesSchema>;

// matrix: 237 base64 strings, each encoding a Uint8Array bitset over matched species (LSB-first)
export const KeyMatrixSchema = z.object({
  characters: z.array(CharacterSchema),
  species:    z.array(KeySpeciesSchema),
  matrix:     z.array(z.string()),    // length === characters.length; each string is base64
});
export type KeyMatrix = z.infer<typeof KeyMatrixSchema>;
```

---

### `data/species-synonyms.csv` (modify — add Grammia→Apantesis entries)

**Analog:** `data/species-synonyms.csv` itself (currently header-only)

**CSV format** — header confirmed by `ingest-photos.ts` line 79:
```
from_binomial,to_species_slug
```
The 17 new entries use the normalized (single-space, trimmed) form for `from_binomial`. `Grammia  blakei` (double-space in key.csv) normalizes to `Grammia blakei` before lookup, so the entry is `Grammia blakei,apantesis-blakei`.

---

### `package.json` (modify — build script wiring)

**Analog:** `package.json` lines 8–25 (current build chain)

**Current `build` script** (line 15):
```
npm run build:data && npm run build:eleventy && npm run build:copy-parquet && npm run build:copy-images && npm run build:species-states && npm run build:pagefind && npm run build:validate-links && npm run build:check-weight
```

**Required new script entries:**
```json
"build:key":              "node scripts/build-key.ts",
"build:copy-key-matrix":  "node scripts/copy-key-matrix.ts",
"build:check-key-weight": "node scripts/check-key-weight.ts"
```

**Required `build` chain update** (insert `build:key` after `build:data`, `build:copy-key-matrix` and `build:check-key-weight` after `build:copy-parquet`):
```
npm run build:data && npm run build:key && npm run build:eleventy && npm run build:copy-parquet && npm run build:copy-key-matrix && npm run build:check-key-weight && npm run build:copy-images && npm run build:species-states && npm run build:pagefind && npm run build:validate-links && npm run build:check-weight
```

**Required `test` script update** (line 25 — add new test files explicitly):
```
node --test ... scripts/build-key.test.ts scripts/check-key-weight.test.ts ...
```

---

### `.github/workflows/deploy.yml` + `pr-check.yml` (modify)

**Analog:** Both files currently share the same hardcoded build chain on their respective line 41.

**Current chain in both files:**
```
npm run build:data && npm run build:eleventy && npm run build:copy-parquet && npm run build:copy-images && npm run build:species-states && npm run build:pagefind && npm run build:check-weight
```

**Required update** — apply the same insertions as `package.json` `build` script (above). Both files must be updated identically to keep CI in sync with the local build.

---

## Shared Patterns

### CSV Pre-flight Validation
**Source:** `scripts/build-data.ts` lines 19–53 (exported `validateCsv` function)
**Apply to:** `scripts/build-key.ts`
```typescript
// Import and call with empty requiredColumns for positional CSVs
import { validateCsv } from './build-data.ts';
validateCsv('data/key-characters.csv', []);
// Then re-parse with columns: false for actual data extraction
```

### DuckDB Connection Lifecycle
**Source:** `scripts/emit-species-states.ts` lines 9–43
**Apply to:** `scripts/build-key.ts`
```typescript
const db = await DuckDBInstance.create(':memory:');
const conn = await db.connect();
// ... queries ...
conn.closeSync();  // synchronous close; called in finally block if errors possible
```

### Main Function + Entry Guard
**Source:** `scripts/emit-species-states.ts` lines 8, 51–56
**Apply to:** `scripts/build-key.ts`
```typescript
export async function main(): Promise<void> { ... }

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error((err as Error).message);
    process.exit(1);
  });
}
```

### zod/mini Schema Convention
**Source:** `src/types/schemas.ts` lines 1–6
**Apply to:** New schemas appended to `src/types/schemas.ts`
- Import only from `'zod/mini'` (never from `'zod'` directly)
- Use `z.nullable(z.string())` not `z.optional(z.string())`
- Export both the schema const and the `z.infer<typeof Schema>` type
- No enum, no namespace, no parameter-properties (TS-03 / Node 24 type-stripping rule)

### Error Output + Non-Zero Exit
**Source:** `scripts/check-page-weight.ts` lines 28–30
**Apply to:** `scripts/check-key-weight.ts`, `scripts/build-key.ts` (entry guard)
```typescript
console.error(`[key-weight] ERROR: ...`);
process.exit(1);
```

---

## No Analog Found

All files have close analogs in the codebase. No entries in this section.

---

## Metadata

**Analog search scope:** `scripts/`, `src/types/`, `src/_data/`, `.github/workflows/`
**Files scanned:** 9 analog files read directly
**Pattern extraction date:** 2026-06-24
