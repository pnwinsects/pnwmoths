# Phase 36: Eleventy Data Files & Config Migration - Pattern Map

**Mapped:** 2026-06-09
**Files analyzed:** 9 (8 created/converted + 1 deleted)
**Analogs found:** 9 / 9

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/_data/species.ts` | data-loader (DuckDB boundary) | batch/transform | `scripts/build-data.ts` lines 238–239; `scripts/lib/manifest.ts` lines 84–88 | exact (DuckDB getRowObjectsJS + guard) |
| `src/_data/glossary.ts` | data-loader (DuckDB boundary) | batch/transform | `scripts/build-data.ts` lines 238–239; `scripts/lib/manifest.ts` lines 84–88 | exact (DuckDB getRowObjectsJS + guard) |
| `src/_data/taxon.ts` | data-loader (DuckDB boundary, complex tree) | batch/transform | `scripts/build-data.ts` lines 238–239; `src/types/schemas.ts` Taxon* types | exact (two queries + schema-derived types) |
| `src/_data/images.ts` | data-loader (CSV file-I/O) | file-I/O/transform | `scripts/lib/manifest.ts` (typed accumulator) | role-match (no DuckDB; typed local interface) |
| `src/_data/plates.ts` | data-loader (JSON/filesystem) | file-I/O | `src/_data/speciesPhotos.js` (JSON readFile + existsSync) | role-match |
| `src/_data/speciesPhotos.ts` | data-loader (JSON file-I/O) | file-I/O | `src/_data/speciesPhotos.js` (same file, trivial conversion) | exact |
| `eleventy.config.ts` | config | request-response | `eleventy.config.js` (same file, annotate + addDataExtension) | exact |
| `eleventy.config.test.ts` | test (source-string) | — | `eleventy.config.test.js` (same file, rename + extend) | exact |
| ~~`src/_data/taxon.d.ts`~~ | ~~stopgap declaration~~ | — | — | deleted (D-04) |

---

## Pattern Assignments

### `src/_data/species.ts` (data-loader, DuckDB boundary, batch/transform)

**Analogs:**
- `scripts/build-data.ts` lines 238–239 (inline DuckDB cast pattern)
- `scripts/lib/manifest.ts` lines 84–88 (full guard pattern — preferred for complex reshapes)
- `src/_data/species.js` (source to convert)

**Imports pattern** — copy from `species.js` line 1, add type imports:
```typescript
import { DuckDBInstance } from '@duckdb/node-api';
```
No type import needed from `src/types` unless using `Species` as a base (D-03 discretion).

**Core pattern** (`species.js` lines 1–51 → typed):

The full guard pattern (preferred per D-03):
```typescript
// Local interface covering consumed/emitted fields after reshape
interface SpeciesDbRow {
  id: number;            // DuckDB INTEGER — mutated to string after getRowObjectsJS
  genus: string;
  species: string;
  common_name: string | null;
  noc_id: string | null;
  authority: string | null;
  family: string | null;
  subfamily: string | null;
  similar_slugs: string[];  // derived by DuckDB string_split
  slug: string;             // derived by DuckDB lower(genus || '-' || species)
}

function isSpeciesDbRow(obj: unknown): obj is SpeciesDbRow {
  if (typeof obj !== 'object' || obj === null) return false;
  const r = obj as Record<string, unknown>;
  return (
    typeof r['id'] === 'number' &&
    typeof r['genus'] === 'string' &&
    typeof r['species'] === 'string' &&
    Array.isArray(r['similar_slugs']) &&
    typeof r['slug'] === 'string'
  );
}

// Emitted return type: id has been mutated to string
export interface SpeciesRow extends Omit<SpeciesDbRow, 'id'> {
  id: string;
}

export default async function (): Promise<SpeciesRow[]> {
  // ... DuckDB setup same as .js ...
  const rows = result.getRowObjectsJS();
  const typed = rows.filter(isSpeciesDbRow);
  for (const row of typed) {
    (row as unknown as SpeciesRow).id = String(row.id);
  }
  return typed as unknown as SpeciesRow[];
}
```

**Alternative (acceptable per RESEARCH §Pattern 1):** Inline cast from narrow SELECT projection:
```typescript
// Source: scripts/build-data.ts line 239
const rows = result.getRowObjectsJS() as Array<SpeciesDbRow>;
```
Single `as T` from a narrow projection is acceptable. Double `as unknown as T` is NOT.

**Error handling pattern:** DuckDB errors propagate as promise rejections; no try/catch needed at the data-file level (Eleventy build will fail loudly). Mirror `species.js` — no error wrapping.

**noUncheckedIndexedAccess:** Use `for...of` loops, never `rows[i]`. See `scripts/lib/manifest.ts` line 181:
```typescript
// Source: scripts/lib/manifest.ts line 181
if (!row) continue;
```

---

### `src/_data/glossary.ts` (data-loader, DuckDB boundary, batch/transform)

**Analogs:**
- `scripts/lib/manifest.ts` lines 84–88 (guard pattern)
- `src/_lib/glossary-transform.ts` lines 12–16 (GlossaryRow type — can extend)
- `src/_data/glossary.js` (source to convert)

**Imports pattern:**
```typescript
import { DuckDBInstance } from '@duckdb/node-api';
// Optional — if extending GlossaryWord from src/types:
import type { GlossaryWord } from '../types/index.ts';
```

**Core pattern** (D-03; local interface extending available type):
```typescript
// GlossaryWord from src/types/schemas.ts has: term, definition, image_filename, photographer
// Extended with letter and slug derived by the query
interface GlossaryEntry extends GlossaryWord {
  letter: string;
  slug: string;
}

function isGlossaryEntry(obj: unknown): obj is GlossaryEntry {
  if (typeof obj !== 'object' || obj === null) return false;
  const r = obj as Record<string, unknown>;
  return (
    typeof r['term'] === 'string' &&
    typeof r['definition'] === 'string' &&
    typeof r['letter'] === 'string' &&
    typeof r['slug'] === 'string'
  );
}

export default async function (): Promise<Record<string, GlossaryEntry[]>> {
  // ... DuckDB setup same as glossary.js ...
  const rows = result.getRowObjectsJS();
  const typed = rows.filter(isGlossaryEntry);
  const grouped: Record<string, GlossaryEntry[]> = {};
  for (const row of typed) {
    if (!grouped[row.letter]) grouped[row.letter] = [];
    grouped[row.letter].push(row);
  }
  return grouped;
}
```

**Note:** `glossary.js` line 34 closes `db.closeSync()` as well as `conn.closeSync()`. `species.js` only closes `conn`. Retain whichever pattern is in the source file; do not normalize.

---

### `src/_data/taxon.ts` (data-loader, DuckDB boundary, complex tree)

**Analogs:**
- `scripts/build-data.ts` lines 238–239 (DuckDB cast pattern for narrow projections)
- `src/types/schemas.ts` lines 111–152 (TaxonFamily, TaxonSubfamily, TaxonGenus, TaxonSpecies, NavImage — use directly)
- `src/_data/taxon.js` (source to convert; two queries + tree build)
- `src/_data/taxon.d.ts` (DELETE this file when taxon.ts is created — D-04)

**Imports pattern:**
```typescript
import { DuckDBInstance } from '@duckdb/node-api';
import type { TaxonFamily, TaxonGenus, TaxonSubfamily, TaxonSpecies, NavImage } from '../types/index.ts';
```

**Core pattern** (D-03 using schema-derived types — the clean fit per RESEARCH §Per-Data-File taxon):

Two inline casts from narrow projections (acceptable per RESEARCH §Pattern 1):
```typescript
// Species query projects: family, subfamily, genus, species, common_name, slug, genus_slug
interface TaxonSpeciesDbRow {
  family: string;
  subfamily: string | null;
  genus: string;
  species: string;
  common_name: string | null;
  slug: string;
  genus_slug: string;
}

// Images query projects: species_slug, filename, photographer, weight (TRY_CAST INTEGER), navigational
interface NavImageDbRow {
  species_slug: string;
  filename: string;
  photographer: string | null;
  weight: number | null;
  navigational: string;
}

// Cast from narrow SELECT projection (single as T — acceptable per D-03)
// Source pattern: scripts/build-data.ts line 239
const speciesRows = speciesResult.getRowObjectsJS() as TaxonSpeciesDbRow[];
const imageRows = imagesResult.getRowObjectsJS() as NavImageDbRow[];

export default async function (): Promise<TaxonFamily[]> {
  // ... build and return families ...
}
```

**Delete action:** `src/_data/taxon.d.ts` (lines 1–4) must be deleted in the same task as creating `taxon.ts`. The declaration `declare function taxon(): Promise<unknown[]>` becomes wrong and confusing once real types exist.

---

### `src/_data/images.ts` (data-loader, CSV file-I/O, transform)

**Analog:** `src/_data/images.js` (source to convert; hand-rolled CSV parser, no DuckDB)
**Also reference:** `src/types/schemas.ts` lines 55–79 (`SpeciesImage` type)

**Imports pattern:**
```typescript
import { readFileSync } from "fs";
import type { SpeciesImage } from '../types/index.ts';
```

**Core pattern** (simpler conversion — annotate accumulator and push type):
```typescript
// parseCSV returns Record<string, string>[] — annotate explicitly
function parseCSV(text: string): Record<string, string>[] { ... }

function toInt(v: string): number | null { ... }
function toFloat(v: string): number | null { ... }

export default function (): Record<string, SpeciesImage[]> {
  const rows: Record<string, string>[] = parseCSV(readFileSync("data/images.csv", "utf8"));
  const bySpecies: Record<string, SpeciesImage[]> = {};
  for (const row of rows) {
    const slug = row['species_slug'] ?? '';
    if (!bySpecies[slug]) bySpecies[slug] = [];
    bySpecies[slug].push({
      species_slug: slug,
      filename: row['filename'] ?? '',
      // ... all SpeciesImage fields, typed
    });
  }
  return bySpecies;
}
```

**Note:** No DuckDB boundary, no guard needed. `SpeciesImage` from `src/types/schemas.ts` (lines 59–79) covers all consumed fields. Under `noUncheckedIndexedAccess`, index `row['field']` returns `string | undefined` — use `?? ''` or `|| null` to satisfy the type (mirrors existing JS logic `row.photographer || null`).

---

### `src/_data/plates.ts` (data-loader, JSON/filesystem file-I/O)

**Analog:** `src/_data/plates.js` (source to convert; two code paths — JSON fallback + filesystem XML)

**Imports pattern:** identical to `.js` — no new imports needed.

**Core pattern** (local interface, no DuckDB):
```typescript
// Local interface covering all consumed/returned fields (both code paths)
interface PlateEntry {
  number: string;
  family: string;
  title: string;
  description: string | null;
  slug: string;
  width: number;
  height: number;
}

// JSON fallback path (plates.js lines 153–162):
const raw = JSON.parse(await readFile(MANIFEST_PATH, 'utf8')) as PlateEntry[];
return raw.map(({ number, family, slug, width, height }) => ({
  number, family, slug, width, height,
  title: `Plate ${number}: ${family.replace(/\s*\([^)]*\)\s*$/, '').trim()}`,
  description: DESCRIPTIONS[number] ?? null,
}));

// bySlug Map typed:
const bySlug = new Map<string, PlateEntry & { dirName: string }>();

// Return type:
export default async function (): Promise<PlateEntry[]> { ... }
```

**Note:** `DESCRIPTIONS` record needs a type annotation to allow `DESCRIPTIONS[number]` without `noUncheckedIndexedAccess` error:
```typescript
const DESCRIPTIONS: Record<string, string> = { "3": "Hemileucinae", ... };
```

---

### `src/_data/speciesPhotos.ts` (data-loader, JSON file-I/O)

**Analog:** `src/_data/speciesPhotos.js` (same file, trivial conversion)
**Also reference:** `src/types/schemas.ts` lines 91–97 (`SpeciesPhoto` type)

**Full converted pattern** (per RESEARCH §Per-Data-File speciesPhotos):
```typescript
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { SpeciesPhoto } from '../types/index.ts';

const MANIFEST_PATH = new URL('../../data/species-photos.json', import.meta.url).pathname;

export default async function (): Promise<Record<string, SpeciesPhoto>> {
  if (!existsSync(MANIFEST_PATH)) {
    console.warn(`[species-photos] Manifest not found: ${MANIFEST_PATH} — no high-res species`);
    return {};
  }
  return JSON.parse(await readFile(MANIFEST_PATH, 'utf8')) as Record<string, SpeciesPhoto>;
}
```

Single `as Record<string, SpeciesPhoto>` cast is safe: `species-photos.json` is generated by `scripts/generate-species-photos.ts` (Phase 35) whose output shape is locked by the same `SpeciesPhoto` type.

---

### `eleventy.config.ts` (config, request-response)

**Analog:** `eleventy.config.js` (same file; annotate + addDataExtension)

**Imports pattern** (`eleventy.config.js` lines 1–7, add type imports):
```typescript
import { EleventyRenderPlugin } from "@11ty/eleventy";
import type { UserConfig } from "@11ty/eleventy";
import EleventyVitePlugin from "@11ty/eleventy-plugin-vite";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { parse as parseCsv } from "csv-parse/sync";
import { applyGlossaryTerms, buildTermMap } from "./src/_lib/glossary-transform.ts";
```

**pathPrefix pattern** (must preserve exactly — project memory + D-01):
```typescript
// Source: eleventy.config.js line 12 — MUST NOT change the conditional form
const pathPrefix = process.env.GITHUB_PAGES ? "/pnwmoths/" : "/";
```

**addDataExtension registration** — new pattern, place first in export default function body (RESEARCH §Pattern 2):
```typescript
export default function (eleventyConfig: UserConfig) {
  eleventyConfig.addDataExtension("ts", {
    read: false,
    parser: async (filePath: string) => {
      const m = await import(filePath) as { default: unknown };
      const exported = m.default;
      return typeof exported === "function" ? exported() : exported;
    },
  });
  // ... rest of existing config body unchanged ...
}
```

**execFile repoint** (D-02 — four path strings, `eleventy.config.js` lines 91, 92, 103, 104):
```typescript
// BEFORE (broken — .js files no longer exist after Phase 35):
execFile("node", ["scripts/copy-images.js"], ...)
execFile("node", ["scripts/emit-species-states.js"], ...)

// AFTER:
execFile("node", ["scripts/copy-images.ts"], ...)
execFile("node", ["scripts/emit-species-states.ts"], ...)
```

**Return type annotation:**
```typescript
export default function (eleventyConfig: UserConfig): { pathPrefix: string; dir: { input: string; output: string; data: string } } {
  // ...
  return { pathPrefix, dir: { input: "src", output: "_site", data: "_data" } };
}
```

**package.json changes required** (not a source file but documented here for planner):
- `"build:eleventy": "eleventy --config=eleventy.config.ts"`
- `"dev": "npm run build:data && eleventy --serve --config=eleventy.config.ts"`
- `"test": ...` — replace `eleventy.config.test.js` with `eleventy.config.test.ts`

**tsconfig.node.json change required:** Add `"eleventy.config.test.ts"` to `include` array (RESEARCH §tsconfig.node.json Gap).

---

### `eleventy.config.test.ts` (test, source-string matching)

**Analog:** `eleventy.config.test.js` (same file, rename + update path + add D-01 assertion)

**Full pattern** (`eleventy.config.test.js` lines 1–55 → typed):
```typescript
// eleventy.config.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '.');
// CHANGED: read .ts, not .js (Pitfall 3 from RESEARCH)
const configSource = readFileSync(resolve(ROOT, 'eleventy.config.ts'), 'utf8');

// Existing tests — unchanged except the string 'eleventy.config.js' → 'eleventy.config.ts' in messages
test('eleventy.config.ts: CDN_BASE_URL constant is defined with exact value', () => { ... });
test('eleventy.config.ts: CDN_BASE_URL does not use process.env', () => { ... });
test('eleventy.config.ts: CDN_BASE_URL does not use dotenv', () => { ... });
test('eleventy.config.ts: CDN_BASE_URL appears after pathPrefix declaration', () => { ... });
test('eleventy.config.ts: CDN_BASE_URL appears before export default function', () => { ... });

// NEW — D-01 assertion (RESEARCH §Pattern 4):
test('eleventy.config.ts: GITHUB_PAGES pathPrefix conditional is present', () => {
  assert.ok(
    configSource.includes('process.env.GITHUB_PAGES ? "/pnwmoths/" : "/"'),
    'pathPrefix must use process.env.GITHUB_PAGES ? "/pnwmoths/" : "/" (exact literal required)'
  );
});
```

**No module import of `eleventy.config.ts`** — D-01 locks the source-string approach. The config has module-init side effects (`readFileSync("data/glossary.csv")`) that make a behavioral import test fragile.

---

## Shared Patterns

### DuckDB boundary guard (D-03 template)

**Source:** `scripts/lib/manifest.ts` lines 84–88
**Apply to:** `species.ts`, `glossary.ts`, `taxon.ts` (any file calling `getRowObjectsJS()`)

```typescript
// Source: scripts/lib/manifest.ts lines 84-88
function isManifestRow(obj: unknown): obj is ManifestRow {
  if (typeof obj !== 'object' || obj === null) return false;
  const rec = obj as Record<string, unknown>;
  return COLUMNS.every(col => typeof rec[col] === 'string');
}
```

Adapt: replace `COLUMNS.every(...)` with explicit checks on the fields the reshape logic reads. Use `for...of` not indexed access on results.

### Inline DuckDB cast (acceptable alternative for narrow projections)

**Source:** `scripts/build-data.ts` line 239
**Apply to:** `taxon.ts` (two queries with narrow, well-typed projections)

```typescript
// Source: scripts/build-data.ts line 239
const speciesRows = speciesResult.getRowObjectsJS() as Array<{ id: number; genus: string; species: string }>;
```

Single `as T` cast only — not `as unknown as T`. Acceptable when the `SELECT` projection lists all columns explicitly.

### noUncheckedIndexedAccess guard for loop iteration

**Source:** `scripts/lib/manifest.ts` line 181
**Apply to:** All `_data` files that iterate arrays

```typescript
// Source: scripts/lib/manifest.ts line 181
if (!row) continue;
```

Use `for...of` throughout. If `rows[0]` style access is unavoidable, add the null check.

### Async default export function signature

**Source:** `src/_data/species.js` line 3 (and all other `_data` files)
**Apply to:** All `_data` files

All data files use `export default async function (): Promise<ReturnType> { ... }`. The return type annotation is the main addition in the TypeScript conversion.

### `addDataExtension` registration

**Source:** RESEARCH §Finding 2 / §Pattern 2 (no existing codebase analog — new pattern)
**Apply to:** `eleventy.config.ts` only (once, at top of export default function body)

```typescript
eleventyConfig.addDataExtension("ts", {
  read: false,
  parser: async (filePath: string) => {
    const m = await import(filePath) as { default: unknown };
    const exported = m.default;
    return typeof exported === "function" ? exported() : exported;
  },
});
```

**Open question (RESEARCH §Open Questions):** Whether `filePath` is absolute or project-relative. If the build fails with ENOENT on first data file load, add `path.resolve(process.cwd(), filePath)` defensively.

### Source-string test style

**Source:** `eleventy.config.test.js` lines 1–55
**Apply to:** `eleventy.config.test.ts`

Read config file as string with `readFileSync`, assert substring presence. Never `import()` the config in a test (side effects).

---

## No Analog Found

All files have close analogs. No entries.

---

## Deletion

| File | Reason |
|---|---|
| `src/_data/taxon.d.ts` | Phase-35 stopgap declaration (`declare function taxon(): Promise<unknown[]>`). Delete in the same task as creating `taxon.ts`. TypeScript will resolve types from `taxon.ts` directly. |

---

## Metadata

**Analog search scope:** `scripts/`, `src/_data/`, `src/_lib/`, `src/types/`, project root
**Files scanned:** 10 source files read directly
**Pattern extraction date:** 2026-06-09
