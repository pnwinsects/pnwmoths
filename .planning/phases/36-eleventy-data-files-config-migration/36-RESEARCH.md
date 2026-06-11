# Phase 36: Eleventy Data Files & Config Migration - Research

**Researched:** 2026-06-09
**Domain:** Eleventy v3 TypeScript config/data loading under Node 24 native type-stripping
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** Source-presence assertion for the GITHUB_PAGES conditional. Extend `eleventy.config.test.ts` to read `eleventy.config.ts` and assert `process.env.GITHUB_PAGES ? "/pnwmoths/" : "/"` is present as a substring. No module-load side effects. Runtime correctness (SC-3) verified by the byte-identical build gate, not by a heavyweight import test. Planner MAY add a lightweight behavioral assertion only if config import proves side-effect-light (it is not — see §Config Module Side Effects below).

**D-02:** Repoint the four `execFile` path strings `.js` → `.ts`. Keep the child-`node` spawn pattern. Do NOT refactor to in-process imports.

**D-03:** Uniform local-interface-plus-guard at the DuckDB boundary for all `_data` files. Zod NOT introduced (D-11 reservation). Planner MAY derive from `z.infer<>` entity types via `Omit`/extension where the fit is genuinely clean; local interfaces are the default.

**D-04:** Delete `src/_data/taxon.d.ts` once `taxon.ts` provides its own types.

### Claude's Discretion

- Exact local interface names/shapes for each `_data` file's reshaped output.
- Whether to add a behavioral pathPrefix assertion (gated on config-import side-effect weight — see §Config Module Side Effects).
- Test-glob mechanics for adding `eleventy.config.test.ts` (same D-14 pattern as Phases 34/35).
- Whether `plates.js`, `images.js`, `speciesPhotos.js` warrant a guard or simple typed annotation.

### Deferred Ideas (OUT OF SCOPE)

- New test coverage for previously-untested `_data` files.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MIG-03 | Eleventy data files (`src/_data/`) and `eleventy.config` converted to TypeScript, preserving the `process.env.GITHUB_PAGES`-conditional `pathPrefix` | §Central Risk Resolution, §Standard Stack, §Architecture Patterns |
</phase_requirements>

---

## Summary

Phase 36 converts the Eleventy middle layer — `src/_data/*.js` and `eleventy.config.js` — to TypeScript under Node 24 native type-stripping. The central technical risk has been resolved by direct inspection of the Eleventy v3.1.5 source: Eleventy does NOT auto-discover `eleventy.config.ts` and does NOT auto-discover `src/_data/*.ts` files. Both gaps have straightforward compliant workarounds that require no additional loader.

For the config: adding `--config=eleventy.config.ts` to the `build:eleventy` and `dev` npm scripts tells Eleventy to load the named file via `import()`, which Node 24 handles natively. For data files: registering `addDataExtension("ts", { read: false, parser })` in the (now-.ts) config adds `.ts` to the glob priorities and routes `.ts` data files through a `parser` callback that calls `import(path)` — again handled natively by Node 24.

The conversion itself is heavily templated from Phases 34/35. Every `_data` file that calls `getRowObjectsJS()` needs the D-03 minimal-interface-plus-guard pattern. Three files (`images.js`, `plates.js`, `speciesPhotos.js`) do not use DuckDB and are simpler conversions. The byte-identical gate uses the existing `_site_baseline/` (1,433 pages, still present from Phase 34) and the `diff -r _site/ _site_baseline/` command.

**Primary recommendation:** Add `--config=eleventy.config.ts` to `build:eleventy` and `dev` in package.json; add `addDataExtension("ts", ...)` in the config; apply the Phase 34/35 D-03 interface+guard idiom per data file; rename `.js` → `.ts`, add type annotations, update the test, fix the four execFile paths, delete `taxon.d.ts`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `pathPrefix` conditional | Frontend Server (Eleventy config) | — | GITHUB_PAGES env read at build time; determines `base:` for Vite and `pathPrefix` in Eleventy return object |
| Data files (`_data/*.ts`) | Frontend Server (Eleventy build) | — | Global data injected into Nunjucks templates at build time; no browser delivery |
| Glossary term map | Frontend Server (Eleventy config) | — | `buildTermMap` called at config module init from `data/glossary.csv`; shared across all `addTransform` invocations |
| `execFile` child processes | Frontend Server (Eleventy hooks) | — | Spawned in Vite `writeBundle` and `eleventy.after` hooks; run `node scripts/*.ts` at build/serve time |
| TypeScript type annotations | Compile-time only | — | Stripped by Node 24; zero runtime or browser-bundle impact |

---

## Central Risk Resolution

### FINDING 1 — Eleventy v3.1.5 does NOT auto-discover `eleventy.config.ts` [VERIFIED: source inspection]

Source: `node_modules/@11ty/eleventy/src/TemplateConfig.js` lines 74–79.

The constructor hard-codes the config search list:
```js
this.projectConfigPaths = [
  ".eleventy.js",
  "eleventy.config.js",
  "eleventy.config.mjs",
  "eleventy.config.cjs",
];
```

`.ts` is not in this list. If `eleventy.config.ts` exists alongside `eleventy.config.js`, Eleventy will load the `.js` file and ignore the `.ts`. If the `.js` is deleted and no `--config` flag is given, Eleventy exits with "No config file found."

**Compliant workaround:** Pass `--config=eleventy.config.ts` on the CLI. The `Eleventy` constructor passes this to `TemplateConfig(null, configPath)`, which skips the search list and uses the path directly. Eleventy then loads it via `import()` in `Require.js:dynamicImportAbsolutePath`. Under Node 24 native type-stripping, `import("file:///...eleventy.config.ts")` works without any loader.

**Required package.json changes:**
```json
"build:eleventy": "eleventy --config=eleventy.config.ts",
"dev": "npm run build:data && eleventy --serve --config=eleventy.config.ts",
```

This is NOT a loader. It is a built-in Eleventy CLI flag that accepts any path. Milestone thesis (Phase 38 SC-2: "no additional loader") is satisfied.

### FINDING 2 — Eleventy v3.1.5 does NOT auto-discover `src/_data/*.ts` files [VERIFIED: source inspection]

Source: `node_modules/@11ty/eleventy/src/Data/TemplateData.js` lines 228–229.

```js
getGlobalDataExtensionPriorities() {
  return this.getUserDataExtensions().concat(["json", "mjs", "cjs", "js"]);
}
```

The glob used to discover global data files is built from this list: `src/_data/**/*.{json,mjs,cjs,js}`. `.ts` files are silently skipped.

**Compliant workaround:** Register `addDataExtension("ts", { read: false, parser })` in `eleventy.config.ts`. When a user data extension is registered, `getUserDataExtensions()` returns `["ts"]`, making the glob `src/_data/**/*.{ts,json,mjs,cjs,js}`. Found `.ts` files are routed to `_parseDataFile(..., options)` with `read: false`, which calls `parser(filePath, filePath)`.

The parser must:
1. `import()` the file path (Node 24 strips types natively).
2. Extract and call the default export if it is a function (Eleventy does this automatically for `.js` files in `getDataValue()` at line 513, but NOT in the `_parseDataFile` path used for user extensions).

```ts
eleventyConfig.addDataExtension("ts", {
  read: false,
  parser: async (filePath: string) => {
    const m = await import(filePath) as { default: unknown };
    const exported = m.default;
    return typeof exported === "function" ? exported() : exported;
  },
});
```

This is NOT a loader. It is the documented `addDataExtension` configuration API. Milestone thesis satisfied.

### FINDING 3 — Node 24.15.0 strips TypeScript types natively by default [VERIFIED: runtime check]

```
node -e "console.log(process.features.typescript)"
// → "strip"
```

`process.features.typescript === 'strip'` confirms type-stripping is active by default (not requiring `--experimental-strip-types`). The `import()` of any `.ts` file works without flags, without `tsx`, without `ts-node`.

### FINDING 4 — `.ts` specifier imports from `eleventy.config.ts` already work [VERIFIED: Phase 34 evidence]

`eleventy.config.js` line 7 already imports:
```js
import { applyGlossaryTerms, buildTermMap } from "./src/_lib/glossary-transform.ts";
```

This `.ts`-specifier import is loaded at config module-load time and Phase 34 confirmed it works under Node 24. The same pattern applies to any `.ts` import in `eleventy.config.ts`.

### FINDING 5 — `tsconfig.node.json` already covers both target files [VERIFIED: direct read]

`tsconfig.node.json` `include` array contains:
- `"eleventy.config.ts"` (line 26) — covers the config
- `"src/_data/**/*.ts"` (line 23) — covers all data files
- `"src/_data/**/*.test.ts"` (line 28) — covers data file tests

**Gap:** `eleventy.config.test.ts` (root-level test file, not in a subdirectory) is NOT covered by any existing glob. The include array must add `"eleventy.config.test.ts"` explicitly.

---

## Standard Stack

### Core (no new packages needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@11ty/eleventy` | 3.1.5 | Static site generator; loads config + data | Already installed; `--config` flag and `addDataExtension` API are v3 built-ins |
| `@duckdb/node-api` | 1.5.1-r.2 | DuckDB Node.js API; `getRowObjectsJS()` returns `unknown` | Already installed; same boundary as Phases 34/35 |
| `@types/node` | ^24.13.1 | Node built-in types for `execFile`, `readFileSync`, etc. | Already installed; `tsconfig.node.json` types:["node"] |
| `typescript` | ^6.0.3 | Type-checker (`tsc --noEmit`) | Already installed |

No new packages required. Phase 36 is a rename+annotate migration with no new dependencies.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `--config=eleventy.config.ts` flag | Keep `eleventy.config.js` wrapper that imports `.ts` | Wrapper means two files; flag is cleaner and is the Eleventy-native approach |
| `addDataExtension("ts", { read: false, parser })` | Rename data files back to `.js` and keep types in `.d.ts` shims | `.d.ts` shims (like `taxon.d.ts` D-04 stopgap) are exactly what this phase deletes; the extension registration is the correct path |

**Installation:** No new packages. No `npm install` step needed.

---

## Package Legitimacy Audit

No new packages are installed in this phase. Audit not required.

---

## Architecture Patterns

### System Architecture Diagram

```
package.json build:eleventy
    │
    └─ eleventy --config=eleventy.config.ts
                │
                ├─ Node 24 import() → eleventy.config.ts
                │   ├─ import glossary-transform.ts (line 7, already works)
                │   ├─ readFileSync("data/glossary.csv") + buildTermMap()  [module-init side effect]
                │   ├─ addDataExtension("ts", { read: false, parser: import() })
                │   ├─ addPlugin(EleventyVitePlugin, { base: pathPrefix })
                │   │   └─ writeBundle hook → execFile("node", ["scripts/copy-images.ts"])
                │   │                       → execFile("node", ["scripts/emit-species-states.ts"])
                │   ├─ eleventy.after hook (serve mode only)
                │   │   └─ execFile("node", ["scripts/copy-images.ts"])
                │   │   └─ execFile("node", ["scripts/emit-species-states.ts"])
                │   └─ return { pathPrefix, dir: { input:"src", output:"_site", data:"_data" } }
                │
                └─ Eleventy discovers src/_data/*.{ts,json,...}
                    │
                    ├─ glossary.ts   → import() → default() → grouped { A:[...], F:[...] }
                    ├─ images.ts     → import() → default() → { slug: [ImageRow, ...] }
                    ├─ plates.ts     → import() → default() → PlateEntry[]
                    ├─ species.ts    → import() → default() → SpeciesRow[]
                    ├─ speciesPhotos.ts → import() → default() → { [slug]: SpeciesPhoto }
                    ├─ taxon.ts      → import() → default() → TaxonFamily[]
                    └─ speciesSlugs.json → (unchanged)
```

### Recommended Project Structure

No directory changes. Files rename in-place:
```
src/_data/
├─ glossary.ts         (was glossary.js)
├─ images.ts           (was images.js)
├─ plates.ts           (was plates.js)
├─ species.ts          (was species.js)
├─ speciesPhotos.ts    (was speciesPhotos.js)
├─ speciesSlugs.json   (unchanged — committed JSON, not source)
└─ taxon.ts            (was taxon.js; taxon.d.ts deleted)
eleventy.config.ts     (was eleventy.config.js)
eleventy.config.test.ts (was eleventy.config.test.js)
```

### Pattern 1: DuckDB boundary guard (D-03 template from Phase 34/35)

**What:** Write a minimal hand-typed interface covering only the columns actually consumed from `getRowObjectsJS()`, then narrow the `unknown` return with a type guard. Never use an unguarded `as unknown as T`.

**When to use:** Any `_data` file that calls `conn.runAndReadAll(...)` followed by `.getRowObjectsJS()`.

**Canonical example from `scripts/build-data.ts` (Phase 35):**
```typescript
// Source: scripts/build-data.ts line 239
const speciesRows = speciesResult.getRowObjectsJS() as Array<{ id: number; genus: string; species: string }>;
```

The Phase 35 pattern used an inline cast because those particular fields had known DuckDB column types from the explicit `SELECT id, genus, species` projection. For the `_data` files, the preferred D-03 approach is a separate interface + guard, but when the query projection is narrow enough that the cast is self-evidently correct, the inline cast is also acceptable (it's not an `as unknown as T` — it's a single narrowing from `unknown` to a concrete type).

**Full guard pattern (preferred for complex reshapes):**
```typescript
// Source: scripts/lib/manifest.ts lines 84-88 (Phase 34)
function isManifestRow(obj: unknown): obj is ManifestRow {
  if (typeof obj !== 'object' || obj === null) return false;
  const rec = obj as Record<string, unknown>;
  return COLUMNS.every(col => typeof rec[col] === 'string');
}
```

For `_data` files, the guard checks the DuckDB-projected fields that the reshape logic actually reads.

### Pattern 2: Config `addDataExtension` registration

**What:** Register `.ts` as a data extension so Eleventy's glob finds and imports `.ts` global data files.

**Where:** Add once at the top of the `eleventyConfig` function body in `eleventy.config.ts`, before any other plugin registration.

```typescript
// Source: Eleventy UserConfig.js addDataExtension API (verified v3.1.5)
eleventyConfig.addDataExtension("ts", {
  read: false,
  parser: async (filePath: string) => {
    const m = await import(filePath) as { default: unknown };
    const exported = m.default;
    return typeof exported === "function" ? exported() : exported;
  },
});
```

**Why `read: false`:** With `read: false`, Eleventy calls `parser(filePath, filePath)` rather than reading the file content first. This allows the parser to use `import()` directly, which triggers Node 24's native type-stripping.

**Why the function-call wrapper:** Eleventy automatically calls the default export function for `.js` data files (in `getDataValue()` at `TemplateData.js:513`). That code path is NOT used for user-registered extensions — `_parseDataFile` just returns whatever the `parser` returns. So the parser must call the function itself.

### Pattern 3: D-02 execFile repoint

**What:** Update four path strings in `eleventy.config.ts` from `.js` to `.ts`.

**Lines to change (in `eleventy.config.js` → `eleventy.config.ts`):**
- Line 91: `execFile("node", ["scripts/copy-images.js"], ...)` → `["scripts/copy-images.ts"]`
- Line 92: `execFile("node", ["scripts/emit-species-states.js"], ...)` → `["scripts/emit-species-states.ts"]`
- Line 103: `execFile("node", ["scripts/copy-images.js"], ...)` → `["scripts/copy-images.ts"]`
- Line 104: `execFile("node", ["scripts/emit-species-states.js"], ...)` → `["scripts/emit-species-states.ts"]`

These already work for `node scripts/*.ts` in Phase 35 (build:data, photos:* scripts) — same Node 24 native stripping. No flag needed.

### Pattern 4: D-01 source-presence test (extending existing test style)

**What:** The existing `eleventy.config.test.js` uses `readFileSync` to load the config as a string and asserts substring presence. Extend this style for the GITHUB_PAGES conditional.

**Current test style (confirmed from source):**
```js
// eleventy.config.test.js lines 1-12
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// ...reads eleventy.config.js as string, asserts CDN_BASE_URL substring
```

**Extension for D-01:**
```typescript
test('eleventy.config.ts: GITHUB_PAGES pathPrefix conditional is present', () => {
  assert.ok(
    configSource.includes('process.env.GITHUB_PAGES ? "/pnwmoths/" : "/"'),
    'pathPrefix must use the GITHUB_PAGES conditional with exact values'
  );
});
```

Note: `configSource` in the converted test must read `eleventy.config.ts` (not `.js`). Update the `readFileSync` call accordingly.

### Anti-Patterns to Avoid

- **Do NOT use `as unknown as T` double-casts** — the guard pattern from Phase 34 is the correct approach. Single `as T` casts from a narrow `SELECT` projection are acceptable when the type is self-evident.
- **Do NOT add `@ts-ignore` comments** — if a type error appears, fix the type, not the error.
- **Do NOT introduce `allowJs`** — the tsconfig is strict `noAllowJs`; this phase completes the `.js` → `.ts` conversion.
- **Do NOT import the config module in the test** — `eleventy.config.ts` calls `readFileSync("data/glossary.csv")` and `buildTermMap()` at module init (lines 21–25). Importing it in a test would require `data/glossary.csv` to be present and readable, making the test environment-dependent. D-01 locks the source-string approach precisely to avoid this.
- **Do NOT forget to call the default export function** in the `addDataExtension` parser — all six `_data` files export async default functions that Eleventy must call to get the actual data.

---

## Config Module Side Effects

This is directly relevant to D-01's decision against a behavioral import test.

When `eleventy.config.ts` is `import()`ed, the following side effects run immediately (not inside the default export function):

```typescript
// Lines 21-25 of current eleventy.config.js
const glossaryRows = parseCsv(readFileSync("data/glossary.csv"), {
  columns: true,
  skip_empty_lines: true,
});
const termMap = buildTermMap(glossaryRows, CDN_BASE_URL);
```

This `readFileSync` call uses a relative path resolved from the process working directory (not `import.meta.url`). In tests, the working directory is typically the project root, so `data/glossary.csv` would be found — BUT: the call is synchronous and runs before any test assertions. Any test that imports the config must have `data/glossary.csv` present, which makes the test fragile in CI environments where data files may not be present.

**Conclusion (confirms D-01):** The behavioral import test is NOT cheap to add safely. The source-string assertion (D-01) is the correct approach and avoids this coupling.

---

## Per-Data-File Conversion Notes

### `species.js` → `species.ts`

DuckDB reads `species.csv` with explicit column types. The `SELECT` query projects: `id` (INTEGER), `genus`, `species`, `common_name`, `noc_id`, `authority`, `family`, `subfamily` (all VARCHAR), `similar_slugs` (derived array), `slug` (derived string).

After `getRowObjectsJS()`, the code mutates `row.id = String(row.id)`.

**Interface approach (D-03):** A local `SpeciesRow` interface covers the consumed post-query fields. The existing `Species` type from `src/types/schemas.ts` covers the pre-reshape DuckDB output (with `id: number`) — using `Omit<Species, 'id' | 'similar_species'> & { id: string; similar_slugs: string[]; slug: string }` is one clean option, or a standalone local interface. Planner's call per D-03 discretion.

The string conversion of `id` happens because Eleventy template context treats string and number differently. The guard must reflect the final emitted shape (with `id: string`).

### `glossary.js` → `glossary.ts`

DuckDB query projects: `term`, `definition`, `image_filename`, `photographer` (all VARCHAR), `letter` (derived), `slug` (derived). Output is reshaped to a `{ [letter: string]: GlossaryRow[] }` grouped map.

The `GlossaryWord` type from `src/types/` has `term`, `definition`, `image_filename`, `photographer`. The extended projection adds `letter` and `slug`. A local `GlossaryEntry` interface (`GlossaryWord & { letter: string; slug: string }`) is the cleanest D-03 option, or derive from `GlossaryWord` directly.

Return type: `Record<string, GlossaryEntry[]>`.

### `taxon.js` → `taxon.ts`

The most complex data file. Uses TWO DuckDB queries (species + images), builds a four-level tree: `TaxonFamily[]`. The existing `src/types/schemas.ts` has fully typed `TaxonFamily`, `TaxonSubfamily`, `TaxonGenus`, `TaxonSpecies`, `NavImage` schemas — these are the exact return shapes.

**Recommended D-03 approach:** Use the `z.infer<>` types directly from `src/types/`:
- DuckDB species query returns `TaxonSpecies`-like rows (minus `navImage`).
- DuckDB image query returns `NavImage`-like rows (post-`TRY_CAST`).
- The final return type is `TaxonFamily[]`.

The `getRowObjectsJS()` guard checks that the projected column names are present. The complex reshape can be typed using the schema-derived types, avoiding a fully independent local interface set.

Note: `taxon.d.ts` must be deleted in this plan (D-04). It is `declare function taxon(): Promise<unknown[]>` — a Phase-35 stopgap. Once `taxon.ts` has real types, this declaration is redundant and confusing.

### `images.js` → `images.ts`

Does NOT use DuckDB. Uses a hand-rolled `parseCSV()` helper and `readFileSync`. The return type is `{ [species_slug: string]: ImageRow[] }`. The `SpeciesImage` type from `src/types/` (all-VARCHAR fields matching the `read_csv` columns) is the right source for the row shape.

This is a simpler conversion: annotate the `parseCSV` return as `Record<string, string>[]`, type the `bySpecies` accumulator and the pushed objects, and set the return type to `Record<string, SpeciesImage[]>`.

No guard needed for the file-read path since the CSV parsing is local logic (not an external API).

### `plates.js` → `plates.ts`

Does NOT use DuckDB. Reads either `data/plates.json` (committed fallback) or the filesystem at `PLATES_Z_SOURCE`. Two code paths:

1. **JSON fallback** (`existsSync(PLATES_Z_SOURCE)` is false): `JSON.parse(await readFile(...))` — type the result as `PlateEntry[]` with a local `PlateEntry` interface covering `{ number: string; family: string; slug: string; width: number; height: number }`.
2. **Filesystem path**: Reads XML files, calls `parseDirName()`, calls `readDimensions()`. The `bySlug` Map and final `plates` array can be typed with a local `PlateEntry` interface.

Given the branching, a single local `PlateEntry` interface covering all consumed/returned fields is the right D-03 approach (no DuckDB boundary, no external API).

### `speciesPhotos.js` → `speciesPhotos.ts`

Simplest conversion. Reads `data/species-photos.json` via `readFile` and `JSON.parse`. Returns `{}` on missing file.

Return type: `Record<string, SpeciesPhoto>` — use the existing `SpeciesPhoto` type from `src/types/schemas.ts`.

```typescript
import type { SpeciesPhoto } from '../types/index.ts';

export default async function (): Promise<Record<string, SpeciesPhoto>> {
  if (!existsSync(MANIFEST_PATH)) { ... return {}; }
  return JSON.parse(await readFile(MANIFEST_PATH, 'utf8')) as Record<string, SpeciesPhoto>;
}
```

The `as Record<string, SpeciesPhoto>` cast is safe here: `species-photos.json` is a committed/build-generated file whose shape is locked by `generate-species-photos.ts` from Phase 35. Runtime schema validation at this boundary (D-11) is NOT required here.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Making Eleventy load `.ts` config | Custom loader, tsx, ts-node | `--config=eleventy.config.ts` flag (built-in) | Node 24 strips natively; flag is documented Eleventy API |
| Making Eleventy discover `.ts` data files | Template extension override | `addDataExtension("ts", { read: false, parser })` | Documented Eleventy API; glob discovery built-in |
| Typing DuckDB row output | Zod runtime validation | Minimal interface + type guard (D-03 template) | Zod reserved for 7 entities; DuckDB boundary is build-side, not CDN-facing |
| `getRowObjectsJS()` return type | `as any` | `as Array<{ field: type; ... }>` or isRow guard | Single cast from narrow SELECT is acceptable; double-cast is not |

**Key insight:** No new library, loader, or transpiler is needed. The entire phase is a rename+annotate migration using existing toolchain primitives.

---

## Byte-Identical Gate

The `_site_baseline/` directory exists from Phase 34 with 1,433 species pages (confirmed: directory present and counts match). The Phase 34 `BASELINE.md` documents the gate command:

```sh
diff -r _site/ _site_baseline/
```

No new baseline is needed unless data changes between Phase 35 completion and Phase 36 execution. Phase 36 changes no templates, no data CSVs, and no JavaScript-level build logic — only renames and adds type annotations. The generated `_site/` must be byte-identical.

**Note:** Content-hashed Vite asset filenames are non-deterministic across builds (documented in Phase 34 STATE.md). The `diff -r` gate assesses HTML prose content and Parquet files — not the Vite-hashed JS bundle names. This is the established behavior from Phases 34/35.

---

## `package.json` Test Glob Update (D-14 pattern)

The current `test` script (line 24) hard-lists individual test files:
```json
"test": "node --test eleventy.config.test.js scripts/build-data.test.ts ..."
```

`eleventy.config.test.js` appears directly by name. After conversion, it becomes `eleventy.config.test.ts` and the reference must be updated.

The D-14 pattern from Phase 34 was to use `*.test.{js,ts}` brace globs for directories. For the root-level config test, the simplest approach is to replace `eleventy.config.test.js` with `eleventy.config.test.ts` directly in the test script (since it is a single named file, not a glob).

---

## `tsconfig.node.json` Gap

The current `include` array covers `eleventy.config.ts` but NOT `eleventy.config.test.ts`:

```json
"include": [
  "scripts/**/*.ts",
  "src/_data/**/*.ts",
  "src/_lib/**/*.ts",
  "src/types/**/*.ts",
  "eleventy.config.ts",         // ← present
  "scripts/**/*.test.ts",
  "src/_data/**/*.test.ts",
  "src/_lib/**/*.test.ts"
  // ← "eleventy.config.test.ts" MISSING
]
```

**Action required:** Add `"eleventy.config.test.ts"` to the `include` array so `tsc --noEmit` covers the test file.

---

## Common Pitfalls

### Pitfall 1: Forgetting `--config` flag — Eleventy silently loads the `.js` file

**What goes wrong:** If `eleventy.config.js` is deleted and `eleventy.config.ts` is created without updating `build:eleventy`, Eleventy errors with "No config file found." If both exist, Eleventy loads `.js` and ignores `.ts`.

**How to avoid:** Update `build:eleventy` AND `dev` simultaneously with `--config=eleventy.config.ts`. Keep `eleventy.config.js` present until both npm scripts are updated.

**Warning signs:** Build succeeds but changes in `eleventy.config.ts` have no effect; the test for the pathPrefix conditional passes on the old `.js` file.

### Pitfall 2: `addDataExtension` parser not calling the default export function

**What goes wrong:** The parser returns the ES module namespace object `{ default: [Function] }` instead of calling the function. Eleventy receives a function reference instead of data. Templates see `undefined` or empty objects for all `_data` variables.

**How to avoid:** The parser must check `typeof m.default === "function"` and call it: `return typeof exported === "function" ? exported() : exported;`

**Warning signs:** Build completes but template variables like `{{ species | length }}` return 0 or error.

### Pitfall 3: `eleventy.config.test.ts` reads `eleventy.config.js` after rename

**What goes wrong:** The test file (converted from `.js` to `.ts`) still has `readFileSync(resolve(ROOT, 'eleventy.config.js'), 'utf8')`. After the config is renamed, this reads a non-existent file and throws `ENOENT`.

**How to avoid:** Update the `readFileSync` path to `eleventy.config.ts` in the same atomic change as the rename. Both files must be updated in one commit.

**Warning signs:** `npm test` reports `ENOENT: no such file or directory, open 'eleventy.config.js'`.

### Pitfall 4: `taxon.d.ts` still in place after `taxon.ts` is created

**What goes wrong:** TypeScript resolves types from `taxon.d.ts` (which declares `default: function(): Promise<unknown[]>`) instead of `taxon.ts`. Downstream consumers see `unknown[]` rather than `TaxonFamily[]`.

**How to avoid:** Delete `taxon.d.ts` in the same commit as creating `taxon.ts`.

### Pitfall 5: `noUncheckedIndexedAccess` failures on `getRowObjectsJS()` results

**What goes wrong:** Under `noUncheckedIndexedAccess`, `rows[0]` returns `T | undefined`. Existing `.js` code uses `for (const row of rows) { row.id = String(row.id) }` — this is safe but `rows[i]` indexed access is not.

**How to avoid:** Use `for...of` loops (not indexed access) when iterating DuckDB results. If destructuring is needed, use `const [first] = rows` with a null check.

---

## Code Examples

### Confirmed addDataExtension registration

```typescript
// Source: Eleventy v3.1.5 UserConfig.js addDataExtension API (verified)
// Place at the top of the export default function body in eleventy.config.ts

export default function (eleventyConfig: UserConfig): ReturnType<EleventyConfigFunction> {
  eleventyConfig.addDataExtension("ts", {
    read: false,
    parser: async (filePath: string) => {
      const m = await import(filePath) as { default: unknown };
      const exported = m.default;
      return typeof exported === "function" ? exported() : exported;
    },
  });
  // ... rest of config
}
```

### D-03 guard for `species.ts`

```typescript
// Local interface covering only the fields the reshape logic reads
interface SpeciesDbRow {
  id: number;          // DuckDB INTEGER — mutated to string after getRowObjectsJS
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
```

### D-01 pathPrefix test extension

```typescript
// Source: eleventy.config.test.js pattern (confirmed from source) — add to converted test
test('eleventy.config.ts: GITHUB_PAGES pathPrefix conditional is present', () => {
  assert.ok(
    configSource.includes('process.env.GITHUB_PAGES ? "/pnwmoths/" : "/"'),
    'pathPrefix must use process.env.GITHUB_PAGES ? "/pnwmoths/" : "/" (exact literal required)'
  );
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `eleventy.config.js` auto-discovered | `--config=eleventy.config.ts` explicit flag | Phase 36 | Must update `build:eleventy` and `dev` scripts |
| `src/_data/*.js` auto-discovered | `addDataExtension("ts", ...)` + explicit glob | Phase 36 | Registration once in config; zero data file changes beyond rename |
| `taxon.d.ts` stopgap declaration | Real types from `taxon.ts` | Phase 36 | `taxon.d.ts` deleted; downstream consumers see `TaxonFamily[]` |

**Deprecated/outdated:**
- `.js` data file extensions: Eleventy's default `.js` discovery is still active — if a `.ts` file's `.js` counterpart still exists, the old `.js` wins. Always delete the `.js` when creating the `.ts`.
- `taxon.d.ts`: A Phase-35 stopgap. Must be deleted in Phase 36 once `taxon.ts` provides real types.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `import(filePath)` in `addDataExtension` parser receives an absolute path suitable for `import()` | §Central Risk Resolution FINDING 2 | If Eleventy passes a relative path, the parser needs `path.resolve(process.cwd(), filePath)`. Low risk — `TemplateData.js` calls `TemplatePath.absolutePath()` on file paths. |
| A2 | `data/glossary.csv` relative path in `eleventy.config.ts` continues to resolve correctly from the project root | §Config Module Side Effects | If cwd changes, the `readFileSync("data/glossary.csv")` call fails. This works today; the rename does not change the resolution behavior. |

**All other claims were verified by direct source inspection or runtime testing.**

---

## Open Questions

1. **Eleventy `addDataExtension` parser: absolute vs relative filePath**
   - What we know: `TemplateData.js` calls `TemplatePath.absolutePath(dataFilePath)` at line 271 before using the path. The glob-discovered files are normalized.
   - What's unclear: Whether the path passed to the `parser(path, path)` call in `_parseDataFile` is the absolute path or a project-relative path.
   - Recommendation: Defensively add `path.resolve(process.cwd(), filePath)` in the parser, OR test empirically by logging the filePath value on first invocation. The planner should note this as a Task 1 verification step.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Native type-stripping for `.ts` imports | Yes | v24.15.0 | — |
| `eleventy` (CLI) | `build:eleventy`, `dev` | Yes | 3.1.5 | — |
| `data/glossary.csv` | `eleventy.config.ts` module init | Yes (project data) | — | None — required for build |
| `_site_baseline/` | Byte-identity diff gate | Yes (1,433 pages) | — | Re-run baseline build if stale |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `node:test` (Node built-in) |
| Config file | None — bare `node --test` invocation |
| Quick run command | `node --test eleventy.config.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MIG-03 | `eleventy.config.ts` has GITHUB_PAGES conditional | unit | `node --test eleventy.config.test.ts` | Wave 0: convert from `.js` |
| MIG-03 | All `_data/*.ts` loaded correctly | integration | `npm run build:eleventy` (byte-identical output) | Part of build gate |
| MIG-03 | No `.js` source remains in `src/_data/` | lint/grep | `find src/_data -name '*.js'` exits 1 | Existing check |
| MIG-03 | `tsc --noEmit` zero errors | typecheck | `npm run typecheck` | Existing |

### Sampling Rate

- **Per task commit:** `npm test` (217 tests, ~8s)
- **Per wave merge:** `npm run typecheck && npm test`
- **Phase gate:** `npm run typecheck && npm test && npm run build:eleventy && diff -r _site/ _site_baseline/`

### Wave 0 Gaps

- [ ] `eleventy.config.test.ts` — must rename from `.js` to `.ts`, update `readFileSync` path to `.ts`, add D-01 pathPrefix assertion
- [ ] `tsconfig.node.json` — add `"eleventy.config.test.ts"` to `include` array
- [ ] `package.json` test script — update `eleventy.config.test.js` → `eleventy.config.test.ts`
- [ ] `package.json` build scripts — add `--config=eleventy.config.ts` to `build:eleventy` and `dev`

---

## Security Domain

This phase is build-side only. No new network endpoints, no auth surfaces, no user-facing behavior. The existing threat model (path injection via DuckDB slug components — already mitigated by `validateSlugComponent` in Phase 35) is unchanged. No ASVS categories apply.

---

## Sources

### Primary (HIGH confidence)

- `node_modules/@11ty/eleventy/src/TemplateConfig.js` (lines 74–79) — config file search list verified by direct source read
- `node_modules/@11ty/eleventy/src/Data/TemplateData.js` (lines 228–229, 449–535) — data extension priority and `getDataValue` logic verified by direct source read
- `node_modules/@11ty/eleventy/src/Util/Require.js` (lines 94–208) — `dynamicImportAbsolutePath` via `import()` verified by direct source read
- `node_modules/@11ty/eleventy/src/UserConfig.js` (lines 1008–1029) — `addDataExtension` API verified by direct source read
- Runtime: `node -e "console.log(process.features.typescript)"` → `'strip'` (Node 24.15.0 native type-stripping confirmed)
- Runtime: `import('/tmp/test-ts-import.ts')` succeeds, proving `import()` of `.ts` files works natively

### Secondary (MEDIUM confidence)

- `eleventy.config.js` line 7 (existing `.ts` specifier import) — field evidence from Phase 34 that `.ts` specifier imports work at config module-load time
- `scripts/build-data.ts` lines 87, 239 — Phase 35 DuckDB boundary-guard cast patterns verified from converted file
- `scripts/lib/manifest.ts` lines 84–88 — Phase 34 full guard pattern verified from converted file

### Tertiary (LOW confidence)

None — all claims verified by direct source inspection or runtime testing.

---

## Metadata

**Confidence breakdown:**
- Central risk (Eleventy TS loading): HIGH — direct source inspection of Eleventy 3.1.5
- Standard stack (no new packages): HIGH — verified from existing installed packages
- Architecture patterns: HIGH — derived from verified source code
- Pitfalls: HIGH — derived from source code analysis and Phase 34/35 precedents

**Research date:** 2026-06-09
**Valid until:** Eleventy 3.x minor update (stable API; `addDataExtension` and `--config` are core v3 features)
