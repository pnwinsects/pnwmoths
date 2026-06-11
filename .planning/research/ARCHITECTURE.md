# Architecture Research: TypeScript + Shared Validation Layer (v3.0)

**Domain:** Strict TypeScript migration + build-time data validation for Eleventy+Vite+Lit+DuckDB static site
**Researched:** 2026-06-09
**Confidence:** HIGH — all integration points verified against existing source files, installed package type definitions, and official Node/Vite/Zod documentation

---

## System Overview: Two Compilation Targets

The repo has two distinct runtime environments with different module resolution requirements:

```
┌─────────────────────────────────────────────────────────────────────┐
│  BUILD TARGET (Node 24, native type-stripping, "module": "module")  │
│                                                                       │
│  scripts/*.ts          src/_data/*.ts        src/_lib/*.ts           │
│  ├─ build-data.ts      ├─ species.ts         ├─ glossary-transform.ts│
│  ├─ emit-species-states.ts                   └─ (shared lib)         │
│  ├─ copy-parquet.ts    ├─ taxon.ts                                    │
│  └─ (etc.)             └─ (etc.)                                      │
│                                                                       │
│  eleventy.config.ts  (Node-executed, NOT Vite-bundled)               │
│  *.test.ts           (node --test, Node-executed)                     │
├─────────────────────────────────────────────────────────────────────┤
│  SHARED SCHEMA LAYER (pure types + Zod schemas, no Node/DOM APIs)   │
│                                                                       │
│  src/types/                                                           │
│  ├─ schemas.ts   ← Zod schemas → TS types via z.infer<>             │
│  └─ index.ts     ← re-exports                                        │
├─────────────────────────────────────────────────────────────────────┤
│  BROWSER TARGET (Vite/Oxc transform, "module": "ESNext", DOM)       │
│                                                                       │
│  src/components/*.ts   (Lit web components, Vite-bundled)            │
│  ├─ parquet-cache.ts   ← imports src/types/ schemas for validation  │
│  ├─ pnwm-occurrence-map.ts                                           │
│  └─ (etc.)                                                           │
└─────────────────────────────────────────────────────────────────────┘
```

The schema module at `src/types/` is the critical shared layer. It must be importable by both environments without environment-specific code.

---

## Question 1: Where Does the Shared Schema Layer Live, and How Are Imports Resolved?

### Physical location: `src/types/`

Place the shared schema module at `src/types/schemas.ts` (re-exported via `src/types/index.ts`). Do not use `src/_schema/` — Eleventy treats `_`-prefixed directories under `src/` as data/layout directories and they are subject to special handling in the copy pipeline. `src/types/` is outside that convention.

### Import path in Node-executed files (scripts/, src/_data/, eleventy.config.ts)

Node 24 type-stripping requires **explicit `.ts` extensions** in import statements — bare specifiers and `.js` extension rewrites do not work. Node ignores `tsconfig.json` paths aliases entirely.

```typescript
// scripts/build-data.ts
import { SpeciesRecordSchema } from '../src/types/index.ts';
```

```typescript
// src/_data/species.ts
import { SpeciesRowSchema } from '../types/index.ts';
// (relative path from src/_data/ to src/types/ is ../types/)
```

```typescript
// eleventy.config.ts
import { GlossaryRowSchema } from './src/types/index.ts';
```

The `rewriteRelativeImportExtensions: true` tsconfig option makes `tsc --noEmit` accept `.ts` extensions in import paths (which would otherwise be flagged as non-standard). This must be set in the Node tsconfig.

### Import path in Vite-bundled files (src/components/)

Vite uses Oxc for TypeScript transpilation. Vite resolves modules with `moduleResolution: "bundler"`, which accepts both `.ts` extensions and extension-less imports. Both of the following work in Vite:

```typescript
// src/components/parquet-cache.ts — both forms work with Vite
import { OccurrenceRecordSchema } from '../types/index.ts';  // explicit .ts — preferred
import { OccurrenceRecordSchema } from '../types/index';     // extension-less — also works
```

Use explicit `.ts` extensions uniformly across both targets. This is consistent with Node's requirement and is unambiguous.

### Key constraint: no tsconfig `paths` aliases

Node 24 ignores `compilerOptions.paths`. Path aliases like `@types/*` cannot be used in Node-executed files. Use only relative import paths. This is not a significant burden given the small number of cross-boundary imports.

---

## Question 2: Validation Insertion Points

### Data flow with validation gates

```
data/species.csv
data/records.csv        ← SOURCE CSVs (upstream input)
data/images.csv
data/glossary.csv
       │
       ▼
scripts/build-data.ts
  validateCsv() ← GATE 1: CSV input validation (build-time, fail-fast)
       │          Zod: CsvSpeciesRow, CsvRecordRow, etc.
       │          Validates column presence + value constraints
       │          Throws on failure → build exits 1
       ▼
DuckDB: COPY TO data/parquet/{slug}/records.parquet
       │
       ▼
  parquet verification ← GATE 2: Parquet round-trip check (build-time spot-check)
       │                  Read back a sample with hyparquet; parse with OccurrenceRecordSchema.safeParse()
       │                  Fails build if column types diverge from schema
       ▼
scripts/emit-species-states.ts
  → writes _site/species-states.json ← GATE 3: JSON output validation (build-time)
       │                                 JSON.parse() result validated with SpeciesStateSchema
       │                                 Fails build if shape wrong
       ▼
src/_data/*.ts (Eleventy data cascade)
  → data objects ← GATE 4: Eleventy data validation (build-time, optional but recommended)
       │            z.array(SpeciesRowSchema).parse(rows) in species.ts, taxon.ts
       │            Catches DuckDB → getRowObjectsJS() shape drift early
       ▼
                 ← (deployment boundary) →
       ▼
Browser: src/components/parquet-cache.ts
  hyparquet: parquetReadObjects() ← GATE 5: Client-side validation (dev-mode only)
       │                             OccurrenceRecordSchema.safeParse(record) in development builds
       │                             Logs warnings; never throws (graceful degradation required)
       ▼
Browser: fetch('/species-states.json')
  ← GATE 6: Client-side JSON fetch validation (dev-mode only)
       │     SpeciesStateSchema.array().safeParse(data); log on mismatch
```

### Which validations are build-time gates vs. optional dev checks

| Gate | Location | Mode | Action on failure |
|------|----------|------|-------------------|
| 1: CSV input | `scripts/build-data.ts` | Always | `process.exit(1)` — hard failure |
| 2: Parquet round-trip | `scripts/build-data.ts` (post-COPY) | Always | `process.exit(1)` — hard failure |
| 3: JSON emit | `scripts/emit-species-states.ts` | Always | `process.exit(1)` — hard failure |
| 4: Eleventy data | `src/_data/*.ts` | Always | Throws — propagates as Eleventy build error |
| 5: Client Parquet | `src/components/parquet-cache.ts` | Dev builds only | `console.warn()` — never throws |
| 6: Client JSON | fetch handlers in components | Dev builds only | `console.warn()` — never throws |

Gates 5 and 6 use `import.meta.env.DEV` (Vite-provided) to gate validation at the call site. The Zod parse calls are tree-shaken from production builds when the `if (import.meta.env.DEV)` branch is statically false. This ensures zero runtime cost in production.

Gates 1–4 must fail the build loudly — they are the authoritative data validation checks.

---

## Question 3: The DuckDB-Write vs. hyparquet-Read Type Asymmetry

### Concrete type mappings for this repo's Parquet columns

The records.parquet file is written by DuckDB with these SQL column types, which map to these Parquet physical types and these hyparquet JS values:

| SQL Type | Parquet physical | hyparquet output (non-NULL) | hyparquet output (NULL) |
|----------|------------------|-----------------------------|-------------------------|
| `VARCHAR` | BYTE_ARRAY + STRING logical | `string` | `null` |
| `DOUBLE` | DOUBLE | `number` | `null` |
| `INTEGER` | INT32 | `number` (from Int32Array) | `null` (when nullable, from `any[]`) |
| `BOOLEAN` | BOOLEAN | `boolean` | `null` |

**Critical behavior for nullable columns:** hyparquet detects nullability from the Parquet schema `repetition_type`. When a column is OPTIONAL (nullable), hyparquet allocates a plain `any[]` array instead of a typed array (e.g., `Int32Array`), and inserts `null` for null values. Individual values in the array are still plain JS `number` for non-null INTEGER rows. There is no `bigint` in this data — DuckDB's `INTEGER` (INT32) and `DOUBLE` are safe as `number`.

**No BIGINT exposure:** The records.csv schema uses `INTEGER` for year/month/day/elevation_ft and `DOUBLE` for lat/lon. DuckDB writes these as INT32 and DOUBLE respectively. hyparquet produces `number` for both. The `bigint` type only appears if DuckDB writes `BIGINT` (INT64) columns, which does not occur in this repo's data.

**No DATE or TIMESTAMP columns:** The CSV schema has separate year/month/day INTEGER columns. No Parquet DATE or TIMESTAMP conversion applies.

### The write-type vs. read-type schema asymmetry

The Zod schema for occurrence records must model what hyparquet produces, not what DuckDB writes. This distinction matters for nullable fields:

```typescript
// src/types/schemas.ts

import { z } from 'zod';

// What hyparquet produces when reading records.parquet
// All optional/nullable fields use z.nullable() to match hyparquet's null values
export const OccurrenceRecordSchema = z.object({
  species_slug:  z.string(),
  record_type:   z.string().nullable(),
  latitude:      z.number(),
  longitude:     z.number(),
  state:         z.string().nullable(),
  county:        z.string().nullable(),
  locality:      z.string().nullable(),
  elevation_ft:  z.number().int().nullable(),  // INTEGER → number (nullable → null, not undefined)
  year:          z.number().int().nullable(),
  month:         z.number().int().nullable(),
  day:           z.number().int().nullable(),
  collector:     z.string().nullable(),
  collection:    z.string().nullable(),
  notes:         z.string().nullable(),
});

export type OccurrenceRecord = z.infer<typeof OccurrenceRecordSchema>;
```

**Do not use `z.optional()` for nullable Parquet fields.** hyparquet writes `null`, not `undefined`. `z.nullable()` is the correct choice. The existing `parquet-cache.ts` code already checks `r.elevation_ft < N` (null < N is false), which is consistent with null values being present.

### For CSV input validation (build-time)

CSV rows from csv-parse arrive as `Record<string, string>` — all values are strings. The CSV schema is distinct from the hyparquet output schema:

```typescript
// CSV row schema: all fields are strings (csv-parse returns strings)
export const CsvRecordRowSchema = z.object({
  species_slug:  z.string().min(1),
  record_type:   z.string(),
  latitude:      z.string().regex(/^-?\d+\.?\d*$/),
  longitude:     z.string().regex(/^-?\d+\.?\d*$/),
  // ... etc
});
```

The CSV schemas are build-side only — they do not need to be imported by browser components.

---

## Question 4: Build-Order and Dependency Graph Changes

### Current build sequence

```
build:data → build:eleventy → build:copy-parquet → build:copy-images
           → build:species-states → build:pagefind → build:validate-links
           → build:check-weight
```

### After v3.0: typecheck steps

Typecheck is orthogonal to the data pipeline — it validates source code types, not data. It should run as a **separate step that does not block the data pipeline** in development but **blocks CI**.

```
npm run typecheck          ← new: tsc --noEmit (both tsconfigs, all files)
npm run build:data         ← as before, but now .ts files
npm run build:eleventy     ← as before
npm run build:copy-parquet ← as before
npm run build:copy-images  ← as before
npm run build:species-states ← as before
npm run build:pagefind     ← as before
npm run build:validate-links ← as before
npm run build:check-weight ← as before
```

The `typecheck` script does NOT join `npm run build` for the main production build. Rationale: `tsc --noEmit` with a large project can add 5–15 seconds to the build. The data pipeline doesn't depend on type correctness to produce correct output. Instead, typecheck is a CI gate in `.github/workflows/pr-check.yml` added as a separate step before `npm run build:data`.

For `npm run build`, optionally add typecheck as a prefix:
```
"build": "npm run typecheck && npm run build:data && ..."
```
This is a policy choice — document which approach is chosen in the roadmap.

### Parquet verification as a separate script

Add `npm run build:verify-parquet` that reads back a sample of Parquet files and validates them against the schema. This runs after `build:data` in both CI and local builds:

```
"build:verify-parquet": "node scripts/verify-parquet.ts"
"build": "npm run build:data && npm run build:verify-parquet && npm run build:eleventy && ..."
```

Alternatively, embed the verification inside `build-data.ts` as a post-COPY step. Inline is simpler; a separate script is independently runnable for debugging. Recommend inline for the initial implementation, promoted to a separate script if it grows complex.

---

## Question 5: New Files, Modified Files, and Directory Layout

### New files

| File | Purpose |
|------|---------|
| `src/types/schemas.ts` | Zod schemas and derived TS types for all data contracts |
| `src/types/index.ts` | Re-exports from schemas.ts |
| `tsconfig.json` | Root tsconfig: `references` to node + browser configs; used by `tsc --noEmit` |
| `tsconfig.node.json` | Node 24 target: `module: "nodenext"`, `moduleResolution: "nodenext"`, `rewriteRelativeImportExtensions: true`, `erasableSyntaxOnly: true`, covers `scripts/`, `src/_data/`, `src/_lib/`, `eleventy.config.ts`, `*.test.ts` |
| `tsconfig.browser.json` | Vite/browser target: `module: "ESNext"`, `moduleResolution: "bundler"`, `lib: ["ES2022","DOM","DOM.Iterable"]`, `isolatedModules: true`, covers `src/components/` |
| `scripts/verify-parquet.ts` | (optional) Standalone Parquet round-trip verifier; reads sample files, validates against OccurrenceRecordSchema |

### Modified files

| File | Change |
|------|--------|
| `scripts/build-data.js` → `.ts` | Add Zod CSV input validation at Gate 1; add inline Parquet spot-check at Gate 2; add TS types |
| `scripts/emit-species-states.js` → `.ts` | Add SpeciesStateSchema validation of output before writeFileSync (Gate 3) |
| `src/_data/species.js` → `.ts` | Add SpeciesRowSchema.array().parse() on DuckDB result rows (Gate 4) |
| `src/_data/taxon.js` → `.ts` | Add TaxonFamilySchema validation (Gate 4) |
| `src/_data/images.js` → `.ts` | Add SpeciesImageSchema validation (Gate 4) |
| `src/_data/glossary.js` → `.ts` | Add GlossaryRowSchema validation (Gate 4) |
| `src/_data/speciesPhotos.js` → `.ts` | Add SpeciesPhotosSchema validation (Gate 4) |
| `src/_lib/glossary-transform.js` → `.ts` | Type the termMap parameter and return types |
| `src/components/parquet-cache.js` → `.ts` | Type records array as `OccurrenceRecord[]`; add dev-only Gate 5 validation |
| `src/components/pnwm-occurrence-map.js` → `.ts` | Type Lit properties |
| `src/components/pnwm-phenology-chart.js` → `.ts` | Type records array |
| `src/components/pnwm-filter-bar.js` → `.ts` | Type filter state |
| `src/components/pnwm-image-slideshow.js` → `.ts` | Type image data |
| `src/components/pnwm-taxon-browser.js` → `.ts` | Type taxon tree |
| `src/components/pnwm-occurrence-popup.js` → `.ts` | Type occurrence record |
| `src/components/glossary-tooltip.js` → `.ts` | Type event handlers |
| `eleventy.config.js` → `.ts` | Type the config function; keep glossary loading pattern |
| `eleventy.config.test.js` → `.ts` | Migrate tests |
| `package.json` | Add `typescript`, `zod` deps; add `"typecheck"` and `"build:verify-parquet"` scripts; update test glob to `**/*.test.ts` |
| `.github/workflows/pr-check.yml` | Add `npm run typecheck` step before `npm run build:data` |
| `.github/workflows/deploy.yml` | Add `npm run typecheck` step before build |

### Directory layout after migration

```
pnwmoths/
├── src/
│   ├── types/                     ← NEW: shared schema module
│   │   ├── schemas.ts             ← Zod schemas + z.infer<> types
│   │   └── index.ts               ← re-exports
│   ├── _data/                     ← .js → .ts (Eleventy data cascade, Node-executed)
│   ├── _lib/                      ← .js → .ts (build-side lib)
│   └── components/                ← .js → .ts (Vite-bundled browser components)
├── scripts/                       ← .js → .ts (Node-executed build scripts)
├── tsconfig.json                  ← NEW: root, references node + browser
├── tsconfig.node.json             ← NEW: Node 24 target
├── tsconfig.browser.json          ← NEW: Vite/browser target
└── package.json                   ← add typescript, zod; add typecheck script
```

---

## Question 6: Recommended Build Order for the Migration

### Migration phases ordered by integration risk

**Phase ordering rationale:** Start with zero-runtime-impact changes (tsconfigs, schema module in isolation), then migrate the producer side (build scripts) before the consumer side (components), because the schema types flow producer→consumer. Eleventy data files are the middle layer and should come after scripts but before components, since they consume from scripts and feed into templates.

```
Phase A: Scaffolding (zero risk)
  1. Install typescript + zod (devDependencies)
  2. Create tsconfig.json (root with references)
  3. Create tsconfig.node.json
  4. Create tsconfig.browser.json
  5. Create src/types/schemas.ts with all schemas defined
  6. Run tsc --noEmit — expect type errors; this is the baseline
  7. Add "typecheck" script; CI passes (typecheck not yet in CI gate)

Phase B: Schema module verification
  8. src/types/schemas.ts is importable from a .ts test file under scripts/
  9. src/types/schemas.ts is importable from a .ts test file in src/components/
  10. Confirm both import paths resolve correctly: ../src/types/index.ts (scripts)
      and ../types/index.ts (components)

Phase C: Build scripts migration (scripts/ → .ts)
  11. Migrate scripts/build-data.js → .ts; add Gate 1 + Gate 2 validation
  12. Migrate scripts/emit-species-states.js → .ts; add Gate 3 validation
  13. Migrate remaining scripts/ files .js → .ts (copy-parquet, copy-images, etc.)
  14. Migrate scripts/lib/*.js → .ts
  15. Run node --test to confirm all scripts tests pass
  16. Run npm run build:data to confirm build works

Phase D: Eleventy data files migration (src/_data/ → .ts)
  17. Migrate src/_data/species.js → .ts; add Gate 4 validation
  18. Migrate src/_data/taxon.js → .ts; add Gate 4 validation
  19. Migrate remaining src/_data/*.js → .ts
  20. Run npm run build:eleventy to confirm Eleventy still builds

Phase E: Build-side lib migration (src/_lib/ → .ts)
  21. Migrate src/_lib/glossary-transform.js → .ts
  22. Migrate eleventy.config.js → .ts (imports from src/_lib/)
  23. Run full build to confirm no regressions

Phase F: Browser components migration (src/components/ → .ts)
  24. Migrate parquet-cache.js → .ts first (most imported, lowest component complexity)
  25. Add Gate 5 dev-only validation to parquet-cache.ts
  26. Migrate remaining src/components/*.js → .ts one by one
  27. Run Vite build to confirm component bundle builds
  28. Run full build + verify _site output is equivalent

Phase G: CI gate
  29. Add typecheck step to pr-check.yml and deploy.yml
  30. tsc --noEmit must pass with zero errors before merge
```

### Key dependency invariant

`src/types/schemas.ts` must be written before any migration in Phase C–F. Once schemas.ts exists, each migration step can immediately import and use schemas rather than waiting for a later phase. Do not defer schema definitions to match each migration phase.

---

## tsconfig Architecture: Two Targets, One Root

### tsconfig.json (root — drives `tsc --noEmit`)

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.browser.json" }
  ]
}
```

### tsconfig.node.json

```json
{
  "compilerOptions": {
    "noEmit": true,
    "target": "esnext",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "rewriteRelativeImportExtensions": true,
    "erasableSyntaxOnly": true,
    "verbatimModuleSyntax": true,
    "strict": true,
    "composite": true,
    "tsBuildInfoFile": ".tsbuildinfo/node"
  },
  "include": [
    "scripts/**/*.ts",
    "src/_data/**/*.ts",
    "src/_lib/**/*.ts",
    "src/types/**/*.ts",
    "eleventy.config.ts",
    "**/*.test.ts"
  ]
}
```

### tsconfig.browser.json

```json
{
  "compilerOptions": {
    "noEmit": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "strict": true,
    "types": ["vite/client"],
    "composite": true,
    "tsBuildInfoFile": ".tsbuildinfo/browser"
  },
  "include": [
    "src/components/**/*.ts",
    "src/types/**/*.ts"
  ]
}
```

**Why two configs:**
- `module: "nodenext"` requires explicit `.ts` extensions and validates ESM semantics per Node's resolver. Using it for browser code would flag missing `.ts` extensions on npm package imports (e.g., `import { LitElement } from 'lit'` has no `.ts` extension — correct for node_modules, invalid under nodenext rules for relative imports).
- `module: "ESNext"` with `moduleResolution: "bundler"` is the correct Vite target — it understands Vite's enhanced module resolution including bare specifiers without extension enforcement on relative imports.
- `src/types/` appears in both configs' `include` arrays. This means the shared schema module is type-checked under both targets. If it accidentally imports a Node API or DOM API, tsc will catch it under the wrong tsconfig.

**`isolatedModules: true` for browser target** is required because Vite's Oxc transpiler processes each file in isolation without type information. This means `const enum` and `namespace` with runtime values are forbidden in browser code (same restriction as Node's type-stripping).

---

## Zod Integration: Version and Import Path

Use **Zod v4** (`import { z } from 'zod'`) with the standard import path. Do not use `import { z } from 'zod/v4'` — the versioned subpath triggers a Vite bundler resolution error (missing `./v4/core` specifier, Issue #4907). The standard `'zod'` import resolves to Zod v4 when zod@4.x is installed.

Zod v4 is browser-compatible ESM with zero external dependencies. Bundle impact with Vite tree-shaking: approximately 3–7 KB gzipped for the schemas used in browser components (Zod Mini achieves 1.9 KB but requires a different API surface — defer to a later optimization pass). For a static site where the Parquet file fetch is the dominant load, this is negligible.

**TypeScript version required:** Zod v4 benefits from TypeScript 5.5+. Node 24's bundled type-stripping is compatible with TypeScript 5.8+ syntax. Install TypeScript 5.8.x or later as a devDependency.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Using `import type` aliases in tsconfig `paths` for cross-boundary imports

Node 24 ignores `compilerOptions.paths`. Any `@types/*` alias that resolves via tsconfig paths will cause a runtime `ERR_MODULE_NOT_FOUND` when Node executes `scripts/*.ts`. Use only relative `.ts` imports for Node-executed files.

**Do not:**
```typescript
// tsconfig.node.json paths: { "@types/*": ["./src/types/*"] }
import { OccurrenceRecord } from '@types/schemas.ts';  // fails at runtime
```

**Do:**
```typescript
import { OccurrenceRecord } from '../src/types/schemas.ts';  // works
```

### Anti-Pattern 2: Putting environment-specific code in src/types/schemas.ts

The schema module is imported by both Node and browser. Do not import `node:fs`, `node:path`, DuckDB, or any DOM API from `src/types/`. It must be pure TypeScript types and Zod schemas with no side effects. If a schema utility needs Node or DOM access, it belongs in the relevant target directory, not in `src/types/`.

### Anti-Pattern 3: Using z.optional() for nullable Parquet fields

hyparquet writes `null` for NULL Parquet values, not `undefined`. `z.optional()` accepts `undefined` but rejects `null`. Use `z.nullable()`. Misuse will cause parse failures on every record with a null elevation or month field.

### Anti-Pattern 4: Running tsc --noEmit inside npm run build for the main pipeline

`tsc --noEmit` on a full repo with strict settings takes 5–15 seconds. The build pipeline (eleventy + Vite) runs on CI on every push. Adding typecheck to the hot path of `npm run build` punishes every local development iteration. Keep typecheck as a separate `npm run typecheck` script that is invoked in CI and in `npm run build` only if the latency is acceptable.

### Anti-Pattern 5: Validating Parquet rows in production browser builds

Zod parse calls in the browser add CPU cost on the first render of species pages. Production deployments must not validate every Parquet record. Gate all client-side validation behind `if (import.meta.env.DEV)`. Vite's dead-code elimination removes these branches from the production bundle.

---

## Scaling Considerations

This is a build-time static site with no server. Scaling concerns are build performance and maintainability, not user traffic.

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Current (1,364 species, 85,933 records) | Single tsc --noEmit pass on full repo; inline Parquet verification in build-data.ts |
| 5,000+ species | tsc --noEmit with `--incremental` flag using `.tsbuildinfo` files; verify-parquet as separate script with sampling |
| Schema changes | Any change to OccurrenceRecordSchema must be verified against existing Parquet files before deploy — add to CI as a schema drift check |

---

## Integration Points Summary

| Boundary | Integration Point | File(s) | Validation Type |
|----------|------------------|---------|-----------------|
| CSV → DuckDB | validateCsv() + Zod CsvRowSchema | `scripts/build-data.ts` | Build-time gate |
| DuckDB COPY → Parquet | Inline spot-check after COPY | `scripts/build-data.ts` | Build-time gate |
| DuckDB query → JSON | Zod schema on JSON.stringify input | `scripts/emit-species-states.ts` | Build-time gate |
| DuckDB query → Eleventy data | Zod schema on getRowObjectsJS() | `src/_data/*.ts` | Build-time gate |
| Parquet → Browser JS | Zod schema on parquetReadObjects() result | `src/components/parquet-cache.ts` | Dev-only check |
| JSON fetch → Browser JS | Zod schema on fetch() JSON | `src/components/*.ts` | Dev-only check |
| Node src/types/ ← scripts | Relative `.ts` import, no aliases | `scripts/*.ts` | Static type-check |
| Node src/types/ ← eleventy config | Relative `.ts` import | `eleventy.config.ts` | Static type-check |
| Vite src/types/ ← components | Relative `.ts` import | `src/components/*.ts` | Static type-check + bundle |

---

## Sources

- [Node.js v24 TypeScript documentation](https://nodejs.org/docs/latest-v24.x/api/typescript.html) — type-stripping requirements, tsconfig restrictions, extension requirements
- [Vite Features: TypeScript](https://vite.dev/guide/features) — Oxc transpilation, isolatedModules requirement
- hyparquet type definitions: `/node_modules/hyparquet/src/types.d.ts`, `/node_modules/hyparquet/src/convert.js` — nullable column handling, DecodedArray types
- [Zod v4 release notes](https://zod.dev/v4) — ESM compatibility, bundle size
- [Zod v4 + Vite bundling issue](https://github.com/colinhacks/zod/issues/4907) — use `'zod'` not `'zod/v4'` import path
- [Vite multiple tsconfig discussion](https://github.com/vitejs/vite/discussions/20149) — rationale for split configs

---
*Architecture research for: TypeScript + shared validation layer, pnwmoths v3.0*
*Researched: 2026-06-09*
