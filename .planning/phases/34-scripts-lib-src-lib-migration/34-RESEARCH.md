# Phase 34: scripts/lib & src/_lib Migration — Research

**Researched:** 2026-06-09
**Domain:** TypeScript conversion of shared utility libs; Node 24 native type-stripping; cross-extension import mechanics
**Confidence:** HIGH — all critical unknowns resolved by live Node 24 experiments on the installed runtime; library types verified from installed node_modules; status values enumerated from source

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**External-boundary typing**
- D-01: Hand-write minimal consumed-field interfaces for Dropbox HTTP API JSON and csv-parse output; narrow through a small runtime guard. No unguarded `as unknown as T`.
- D-02: Guards are hand-rolled / lightweight — NOT Zod. Dropbox API and manifest shapes are build/operator-side.
- D-03: Guard validates fields the code reads; extra/unknown fields on an external response must not throw.

**Manifest row type**
- D-04: `type ManifestRow = Record<typeof COLUMNS[number], string>` — COLUMNS is single source of truth.
- D-05: `status` is a string-literal union (no enum). Planner must confirm complete set from `ingest-photos.js` before finalizing (done — see Status Union section below).
- D-06: `readManifest()` returns `ManifestRow[]` via D-01 guard. `advanceStatus(row, nextStatus, extra)` takes `ManifestRow`, a status-union value, `Partial<ManifestRow>`; returns mutated `ManifestRow`. `writeManifest()` keeps emitting COLUMNS header/order.

### Claude's Discretion
- Whether to lift `view` (`'D' | 'V'`) and `match_bucket` to string-literal unions — not required.
- Exact local interface names/shapes for Dropbox API responses.
- `dropbox-list.js` has no existing test — Phase 34 converts existing tests only; adding new coverage is out of scope.
- Test-runner mechanics: script glob update and flag requirements — resolved below.

### Deferred Ideas (OUT OF SCOPE)
- Adding test coverage for `dropbox-list.js`.
- Lifting `view` / `match_bucket` to string-literal unions everywhere — spans files beyond this phase.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MIG-01 | `scripts/lib/` and `src/_lib/` fully converted to TypeScript; no `.js` source remains in either dir; all converted tests run via `node --test` with Node 24 native type-stripping; zero `tsc --noEmit` errors; no `@ts-ignore`, no `allowJs`, no unguarded double-casts | § Cross-Extension Import Mechanics; § Strict-Mode Landmines; § Proposed Type Signatures |
</phase_requirements>

---

## Summary

Phase 34 renames five `.js` source files and four `.test.js` files to `.ts`, adds full strict-type annotations, and proves the Node 24 native type-stripping path end-to-end. The scope is deliberately minimal: only the shared-library layer is touched; all consuming scripts (`ingest-photos.js`, `tile-photos.js`, `upload-tiles.js`, `generate-species-photos.js`, `eleventy.config.js`) stay `.js` during this phase.

The phase has one blocking technical constraint that every plan must respect: **Node 24 native type-stripping does not rewrite import specifiers.** A `.js` consumer that has `import { foo } from './lib/manifest.js'` will fail at runtime with `ERR_MODULE_NOT_FOUND` after `manifest.js` is renamed to `manifest.ts`. The `.js` specifier is used literally; Node never looks for a `.ts` sibling. The fix is straightforward — update each consumer's import specifier to use the `.ts` extension — but the plan must sequence this update alongside (or immediately after) the rename for every consumer, otherwise the build and tests break mid-phase.

All five libraries use ESM (`import`/`export`) and contain no module-system changes in scope. Conversion is: rename + add type annotations + update import specifiers in consumers. The tsconfig.node.json produced in Phase 33 already includes both `scripts/**/*.ts` and `src/_lib/**/*.ts` with the scoped `*.test.ts` globs. The `types: ["node"]` in tsconfig.node.json means no per-file triple-slash directives are needed. No new packages are required.

**Primary recommendation:** Rename and annotate one file at a time (or in tight rename + consumer-update pairs), running `tsc -p tsconfig.node.json --noEmit` and `node --test` after each pair to catch regressions early. `manifest.ts` is the most complex (COLUMNS-derived type, guard, status union) and should be converted first so all other consumers can immediately get typed `ManifestRow`. `glossary-transform.ts` is the simplest (pure functions, well-typed external library) and is a good warm-up or parallel track.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Type checking lib/test files | Node (`tsconfig.node.json`) | — | Both dirs are already in the node tsconfig `include` globs |
| Running tests | `node --test` (Node 24 built-in) | — | Native type-stripping handles `.ts` test files directly |
| Build-time execution of libs | Node 24 (direct `node` call via npm scripts) | — | Scripts invoke libs at runtime under type-stripping |
| Consumer import resolution | Node ESM resolver | — | Resolves specifiers literally; `.ts` extension required for `.ts` files |

---

## Standard Stack

No new packages are required for Phase 34. All necessary libraries are already installed.

### Already Installed — Use These

| Library | Installed Version | Role in Phase 34 |
|---------|------------------|------------------|
| `typescript` | 6.0.3 (devDep) | `tsc -p tsconfig.node.json --noEmit` type checking |
| `csv-parse` | 6.2.1 | `manifest.ts` — ships own TS types at `lib/sync.d.ts` (via `./sync` exports map) |
| `csv-stringify` | 6.7.0 | `manifest.ts` — ships own TS types at `lib/sync.d.ts` (via `./sync` exports map) |
| `node-html-parser` | 7.1.0 | `glossary-transform.ts` — ships own TS types at `dist/index.d.ts` |
| `@types/node` | 24.13.1 (devDep) | All five files — covers `fs`, `path`, `stream`, `os` |

[VERIFIED: node_modules inspection] — All three libraries (`csv-parse`, `csv-stringify`, `node-html-parser`) ship their own TypeScript declarations via their `exports` map. No `@types/*` packages are needed for them.

### No New Packages

No packages need to be installed or removed in Phase 34. The Phase 33 package corrections are already applied (typescript, @types/node, @types/leaflet in devDependencies; zod in dependencies; @types/openseadragon removed per 33-RESEARCH.md).

---

## Package Legitimacy Audit

> No new packages installed in Phase 34. Audit not required.

---

## Critical Technical Findings

### Finding 1: Cross-Extension Imports — VERIFIED BEHAVIOR [VERIFIED: live Node 24.15.0 experiment]

**Node 24 native type-stripping does NOT perform specifier rewriting.**

| Import specifier in .js file | What Node does | Result |
|------------------------------|---------------|--------|
| `import { x } from './lib/manifest.ts'` | Finds `manifest.ts`, strips types, executes | **Works** |
| `import { x } from './lib/manifest.js'` | Looks for `manifest.js` only — no `.ts` fallback | **ERR_MODULE_NOT_FOUND** |

Neither `--experimental-strip-types` nor `--experimental-transform-types` adds `.ts` fallback resolution to `.js` specifiers. Both flags were tested on Node v24.15.0 and produce the same `ERR_MODULE_NOT_FOUND` error.

**Consequence for Phase 34:** Every `.js` consumer of a converted lib must update its import specifier from `.js` to `.ts` as part of the same phase. The four consumers are:

| Consumer (stays .js) | Current specifier(s) | Must change to |
|----------------------|---------------------|----------------|
| `scripts/ingest-photos.js` | `'./lib/parse-photo-filename.js'`, `'./lib/dropbox-list.js'`, `'./lib/manifest.js'` | `.ts` extension on each |
| `scripts/tile-photos.js` | `'./lib/manifest.js'`, `'./lib/dropbox-download.js'` | `.ts` extension on each |
| `scripts/upload-tiles.js` | `'./lib/manifest.js'` | `.ts` extension |
| `scripts/generate-species-photos.js` | `'./lib/manifest.js'` | `.ts` extension |
| `eleventy.config.js` | `'./src/_lib/glossary-transform.js'` | `.ts` extension |

The import specifier update is a **one-line change per import** and does not change runtime behavior. Node 24.15.0 accepts `.ts` extension specifiers from `.js` files (confirmed by experiment: `import { greet } from './helper.ts'` in a `.js` ESM module runs successfully with native type-stripping).

### Finding 2: `node --test` with `.ts` files — VERIFIED [VERIFIED: live Node 24.15.0 experiment]

`node --test path/to/foo.test.ts` runs `.ts` test files with **no additional flags** on Node 24.15.0. The `typescript` feature is `strip` by default (`process.features.typescript === 'strip'`). No `--experimental-strip-types` flag is needed.

Mixed globs work: `node --test 'scripts/lib/*.test.{js,ts}'` selects both `.js` and `.ts` files.

**`package.json` test script update required:**

The current `test` script lists `scripts/lib/*.test.js` and `src/_lib/*.test.js`. After Phase 34:
- All four lib test files convert to `.ts`
- No `.js` test files will remain in those directories

Update the two glob segments:
- `scripts/lib/*.test.js` → `scripts/lib/*.test.ts`
- `src/_lib/*.test.ts` → `src/_lib/*.test.ts`

The scripts-level test files (`scripts/*.test.js`, `eleventy.config.test.js`) stay `.js` through Phase 34 and continue working unchanged.

### Finding 3: `verbatimModuleSyntax` and `isolatedModules` in test files [VERIFIED: live Node 24.15.0 experiment]

`import type` is stripped correctly by Node 24 native type-stripping. Test files may use `import type` wherever only types are needed. `verbatimModuleSyntax: true` (set in tsconfig.node.json) requires that any import used only as a type be annotated `import type` — tsc will error on bare `import` that is type-only. This is enforced at typecheck time, not at runtime.

### Finding 4: `noUncheckedIndexedAccess` — key annotation points [VERIFIED: tsc 6.0.3 experiment]

With `noUncheckedIndexedAccess: true` (set in tsconfig.node.json):

| Access pattern | Type returned | Fix |
|----------------|--------------|-----|
| `Record<string, string>[key]` | `string \| undefined` | Use `Record<union, string>` (mapped type over known union) |
| `Record<typeof COLUMNS[number], string>[col]` | `string` (no `\| undefined`) | **No fix needed** — mapped type over known union is exact |
| `array[i]` in `for (let i = 0; i < arr.length; i++)` | `T \| undefined` | Add `if (!item) continue;` guard, or use `for..of` |
| `match[1]` after regex `.match()` | `string \| undefined` | Destructure: `const [, specimen, view] = match` (still `string \| undefined`); use `?? ''` or `!` assertion post-null-check |
| `Map.get(key)` | `T \| undefined` | Already `T \| undefined` — no change from `noUncheckedIndexedAccess` |

**Critical:** `type ManifestRow = Record<typeof COLUMNS[number], string>` produces a mapped type (not an index signature), so `row.status` is `string` (not `string | undefined`). This is the correct pattern per D-04.

---

## Status Union — Complete Enumeration [VERIFIED: source code inspection]

All `status` values across the full pipeline, enumerated from `scripts/ingest-photos.js`, `scripts/tile-photos.js`, and `scripts/upload-tiles.js`:

| Value | Set by | Script |
|-------|--------|--------|
| `'discovered'` | Initial ingest — every new row from `ingest-photos.js` | `ingest-photos.js:449, 487` |
| `'downloaded'` | TIFF downloaded from Dropbox | `tile-photos.js:415, 421` |
| `'tiled'` | DZI tiles generated by vips | `tile-photos.js:393, 433` |
| `'uploaded'` | Tile directory uploaded to bunny.net | `upload-tiles.js:374` |
| `'failed'` | Any stage failure (persists last_error) | `ingest-photos.js:508`, `tile-photos.js:438`, `upload-tiles.js:385` |

**The complete D-05 union (locked):**
```typescript
type ManifestStatus = 'discovered' | 'downloaded' | 'tiled' | 'uploaded' | 'failed';
```

No other status value appears anywhere in the pipeline. The `advanceStatus` function signature therefore becomes:
```typescript
function advanceStatus(
  row: ManifestRow,
  nextStatus: ManifestStatus,
  extra?: Partial<ManifestRow>
): ManifestRow
```

---

## Architecture Patterns

### System Architecture Diagram

```
scripts/lib/*.ts           src/_lib/*.ts
(manifest, parse-photo-    (glossary-transform)
 filename, dropbox-list,
 dropbox-download)
       │                          │
       │ .ts specifiers           │ .ts specifier
       ↓                          ↓
scripts/ingest-photos.js   eleventy.config.js (still .js)
scripts/tile-photos.js     (Phase 36 converts these)
scripts/upload-tiles.js
scripts/generate-species-photos.js
(all still .js — Phase 35 converts these)

Type checking:
  tsc -p tsconfig.node.json --noEmit
    ← includes scripts/**/*.ts, src/_lib/**/*.ts, *.test.ts

Test execution:
  node --test scripts/lib/*.test.ts src/_lib/*.test.ts ...
    ← Node 24.15.0 strips types natively, no flag needed
```

### Recommended File Rename Map

```
scripts/lib/manifest.js            → scripts/lib/manifest.ts
scripts/lib/manifest.test.js       → scripts/lib/manifest.test.ts
scripts/lib/parse-photo-filename.js → scripts/lib/parse-photo-filename.ts
scripts/lib/parse-photo-filename.test.js → scripts/lib/parse-photo-filename.test.ts
scripts/lib/dropbox-list.js        → scripts/lib/dropbox-list.ts
  (no test file — none to rename)
scripts/lib/dropbox-download.js    → scripts/lib/dropbox-download.ts
scripts/lib/dropbox-download.test.js → scripts/lib/dropbox-download.test.ts
src/_lib/glossary-transform.js     → src/_lib/glossary-transform.ts
src/_lib/glossary-transform.test.js → src/_lib/glossary-transform.test.ts
```

### Anti-Patterns to Avoid

- **Renaming a lib without updating all consumers:** The `.js` specifier in any consumer becomes a broken import at runtime. Rename + specifier update must be atomic within a plan wave.
- **Using `as unknown as T` double-cast to silence the csv-parse generic:** The `parse<ManifestRow[]>` approach using `OptionsWithColumns<ManifestRow>` works cleanly; no cast needed.
- **Using `enum` for ManifestStatus:** TS-03 forbids enums; Node 24 throws `SyntaxError` at runtime. Use string literal union only.
- **Leaving `row.match_bucket` as just `string`:** The discretion item says it's fine to leave this as `string` — but if lifted to a union, it must be a string-literal union, not an enum.

---

## Proposed Type Signatures (Concrete, Ready for Plan Use)

### `manifest.ts`

```typescript
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

export const COLUMNS = [
  'content_hash', 'dropbox_path', 'size_bytes', 'server_modified',
  'filename_raw', 'binomial_raw', 'specimen_id', 'view',
  'binomial_resolved', 'species_slug', 'match_bucket', 'status', 'last_error',
] as const;

export type ManifestStatus = 'discovered' | 'downloaded' | 'tiled' | 'uploaded' | 'failed';
export type ManifestRow = Record<typeof COLUMNS[number], string>;

// Guard for csv-parse output (D-01 / D-02 pattern)
function isManifestRow(obj: unknown): obj is ManifestRow {
  if (typeof obj !== 'object' || obj === null) return false;
  return COLUMNS.every(col => col in (obj as Record<string, unknown>));
}

export async function readManifest(path: string): Promise<ManifestRow[]> {
  if (!existsSync(path)) return [];
  const raw = await readFile(path);
  const rows = parse(raw, { columns: true, skip_empty_lines: true }) as unknown[];
  return rows.filter(isManifestRow);
}

export async function writeManifest(path: string, rows: ManifestRow[]): Promise<void> {
  const csv = stringify(rows, { header: true, columns: COLUMNS as unknown as string[] });
  await writeFile(path, csv);
}

export function advanceStatus(
  row: ManifestRow,
  nextStatus: ManifestStatus,
  extra: Partial<ManifestRow> = {}
): ManifestRow {
  if (row == null) throw new TypeError('advanceStatus: row required');
  if (!nextStatus) throw new TypeError('advanceStatus: nextStatus must be a non-empty string');
  row.status = nextStatus;
  row.last_error = nextStatus === 'failed' ? String(extra.last_error ?? '') : '';
  return row;
}

export function sortForInvestigation(rows: ManifestRow[]): ManifestRow[] { ... }
```

Note on `parse` return type: `csv-parse/sync` `parse<T>` with `OptionsWithColumns<T>` returns `T[]`, but the type parameter must be provided. The cleanest approach is to cast the `parse` call result to `unknown[]` and then filter with the `isManifestRow` guard — this satisfies D-01 (runtime guard) and D-02 (no Zod, no unguarded double-cast). Alternatively, `parse` may be called with `columns: true` returning `unknown[]` directly.

### `parse-photo-filename.ts`

```typescript
export interface ExtractBinomialResult {
  binomial: string | null;
  bucketHint: 'provisional' | null;
}

export interface ParseSpecimenAndViewResult {
  specimen: string;
  view: 'D' | 'V' | '';
}

export function extractBinomial(filename: string): ExtractBinomialResult { ... }
export function parseSpecimenAndView(filename: string): ParseSpecimenAndViewResult { ... }
export function toSpeciesSlug(binomial: string): string { ... }
```

Key `noUncheckedIndexedAccess` fix: The regex capture groups are accessed after a null check. Use destructuring:
```typescript
const match = filename.match(TAIL_RE);
if (!match) return { specimen: '', view: '' };
const [, specimenRaw, viewRaw] = match;
return { specimen: specimenRaw ?? '', view: (viewRaw ?? '') as 'D' | 'V' | '' };
```

### `dropbox-list.ts`

```typescript
// D-01 consumed-field interface for list_folder / list_folder/continue response
interface DropboxListPage {
  entries: DropboxEntry[];
  has_more: boolean;
  cursor: string;
}

// D-01 consumed-field interface for a file/folder entry
export interface DropboxEntry {
  '.tag': string;
  name: string;
  path_display?: string;
  size?: number;
  server_modified?: string;
  content_hash?: string;
}

// D-03 guard: validates only consumed fields; extra fields ignored
function isDropboxListPage(data: unknown): data is DropboxListPage {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return Array.isArray(d['entries']) && typeof d['has_more'] === 'boolean';
}

export async function dbxCall(endpoint: string, body: unknown, token: string): Promise<unknown> { ... }

export async function* listSharedFolder(
  params: { shareUrl: string; token: string }
): AsyncGenerator<DropboxEntry, void, undefined> { ... }
```

The `dbxCall` return type is `Promise<unknown>` — callers narrow via the guard. This satisfies D-01 without an unguarded cast.

### `dropbox-download.ts`

```typescript
interface DownloadParams {
  shareUrl: string;
  dropboxPath: string;
  token: string;
  destPath: string;
}

// Custom error type for retriable flag (avoids modifying Error prototype)
interface DropboxError extends Error {
  retriable: boolean;
}

export async function downloadSharedFile(params: DownloadParams): Promise<void> { ... }
```

For the `retriable` property: cast the Error after construction:
```typescript
const err = new Error(`...`) as DropboxError;
err.retriable = res.status === 429;
throw err;
```

`pipeline(res.body, createWriteStream(destPath))` type-checks correctly: `Response.body` is `ReadableStream<Uint8Array>` (from undici via @types/node) which implements `Symbol.asyncIterator`, satisfying `PipelineSource<Uint8Array>` in node:stream/promises. [VERIFIED: @types/node source inspection]

### `glossary-transform.ts`

The simplest conversion. `node-html-parser` ships full types at `dist/index.d.ts`.

```typescript
import { parse } from 'node-html-parser';
import type { TextNode } from 'node-html-parser';

export interface TermMapEntry {
  term: string;
  lower: string;
  definition: string;
  imageUrl: string;
  regex: RegExp;
}

export type GlossaryRow = {
  term: string;
  definition: string;
  image_filename?: string | null;
};

export function escapeRegex(str: string): string { ... }
export function escapeHtml(str: string): string { ... }
export function buildTermMap(rows: GlossaryRow[], cdnBaseUrl: string): TermMapEntry[] { ... }
export function applyGlossaryTerms(html: string, termMap: TermMapEntry[]): string { ... }
```

The `substituteTerms` function takes `TextNode` (from node-html-parser) — use `import type { TextNode }` since the type is erased at runtime. Note: `textNode.parentNode.exchangeChild(textNode, parse(html))` — `parentNode` may be typed as `HTMLElement | null` in node-html-parser; add a null guard.

---

## Strict-Mode Landmines — Per-File Guidance

### `manifest.ts` — `noUncheckedIndexedAccess` on COLUMNS-derived type

**D-04 safety:** `Record<typeof COLUMNS[number], string>` creates a mapped type over 13 known string-literal keys. Accessing `row.status`, `row.content_hash`, etc. returns `string` (no `| undefined`). This is intentional and confirmed by tsc experiment.

**Array iteration in `sortForInvestigation`:** The loop `for (let i = 0; i < rows.length; i++)` must guard against `rows[i]` being `undefined`. Either switch to `for..of` (no index access), or add `const row = rows[i]; if (!row) continue;`. The current code's `row?.match_bucket ?? ''` optional chain already handles it, but tsc will still see `rows[i]` as `ManifestRow | undefined` and require a null check before use.

**`freq.get(key) ?? 0` pattern:** already correct — `Map.get()` always returns `T | undefined` regardless of `noUncheckedIndexedAccess`.

### `parse-photo-filename.ts` — regex capture groups

`match[1]` and `match[2]` are `string | undefined` with `noUncheckedIndexedAccess`. After the `if (!match) return ...` null check, use destructuring:
```typescript
const [, specimen, view] = match;
return { specimen: specimen ?? '', view: (view as 'D' | 'V' | '') ?? '' };
```

The `PROVISIONAL_SINGLE_TOKENS.has(lower)` pattern is fine — `Set.has()` takes the element type, which is `string` here.

The token loop `provisionalTokens[i]` and `provisionalTokens[i + 1]` are `string | undefined` — the existing null-check on `provisionalTokens.length` doesn't help tsc; add explicit guards or use `for..of` where possible.

### `dropbox-list.ts` — `noImplicitReturns` on async generator

An async generator with `noImplicitReturns` must not fall off the end implicitly in a code path that doesn't `yield`. Since `listSharedFolder` always loops until `!data.has_more`, it naturally terminates. The `while (true)` + `break` pattern is valid — the function returns `undefined` (void) when it hits `break` and the generator is exhausted, which is correct for `AsyncGenerator<DropboxEntry, void, undefined>`.

The `data.entries` access: after the guard `isDropboxListPage(data)`, `data.entries` is `DropboxEntry[]`, so `for (const e of data.entries)` is clean (no index access, no `| undefined`).

### `dropbox-download.ts` — `pipeline` and web `ReadableStream`

`res.body` is `ReadableStream<Uint8Array> | null` from `Response`. The existing `if (!res.ok)` branch means `res.body` is non-null on success (HTTP 200), but tsc doesn't know this. Add an explicit null check:
```typescript
if (!res.body) throw new Error('downloadSharedFile: response body is null');
await pipeline(res.body, createWriteStream(destPath));
```

`pipeline` from `node:stream/promises` accepts `PipelineSource<T>` which includes `AsyncIterable<T>`. `ReadableStream<Uint8Array>` from `node:stream/web` implements `Symbol.asyncIterator`, so it satisfies `AsyncIterable<Uint8Array>`. [VERIFIED: @types/node stream.web.d.ts]

### `glossary-transform.ts` — `textNode.parentNode` nullable

`node-html-parser`'s `Node.parentNode` is typed as `HTMLElement | null`. The current code calls `textNode.parentNode.exchangeChild(...)` without a null check. With strict null checks, this is a type error. Add:
```typescript
if (!textNode.parentNode) return;
textNode.parentNode.exchangeChild(textNode, parse(html));
```

The `ReturnType<typeof buildTermMap>` pattern used in JSDoc works as a TypeScript type reference too — `TermMapEntry[]` is more explicit and preferred.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TypeScript declarations for csv-parse/sync | Custom type stubs | Library's own `lib/sync.d.ts` via `./sync` exports map | Ships accurate generic overloads |
| TypeScript declarations for node-html-parser | Custom stubs | Library's own `dist/index.d.ts` | Covers `TextNode`, `HTMLElement`, `parse()` |
| Import extension rewriting in consumers | Loader/plugin | Plain `.ts` specifier update (1 line per import) | Node 24 handles it natively; no loader needed |
| Status-value guard at runtime | Zod schema | `ManifestStatus` literal union + TypeScript narrowing | Build-side / operator-side data (D-02); static type check is sufficient |

---

## Common Pitfalls

### Pitfall 1: Renaming lib without updating consumer specifiers

**What goes wrong:** `scripts/ingest-photos.js` still has `import ... from './lib/manifest.js'`. After `manifest.js` → `manifest.ts`, running `node scripts/ingest-photos.js` throws `ERR_MODULE_NOT_FOUND` for `manifest.js`. Tests that invoke the full pipeline also fail.

**Why it happens:** Node 24's ESM resolver is strict about extensions. `--experimental-strip-types` does not add a `.ts` fallback for `.js` specifiers.

**How to avoid:** In each plan wave that renames a lib file, include the specifier update in the same wave for all consumers. The four scripts + `eleventy.config.js` must update their specifiers before the wave is committed.

**Warning signs:** `ERR_MODULE_NOT_FOUND` for a `.js` path after a rename. `npm run build` or `npm test` fails on the pipeline scripts.

### Pitfall 2: `COLUMNS as const` — `as const` is erasable; `as unknown[]` cast in stringify is not

**What goes wrong:** `stringify(rows, { header: true, columns: COLUMNS })` — the `columns` option in csv-stringify expects `string[]` but `typeof COLUMNS` is `readonly ['content_hash', ...]` (a `ReadonlyArray`). tsc may error: "Argument of type 'readonly string[]' is not assignable to parameter of type 'string[]'".

**How to avoid:** Cast `COLUMNS` to `string[]` in the stringify call:
```typescript
stringify(rows, { header: true, columns: COLUMNS as unknown as string[] })
```
Or use `[...COLUMNS]` to spread into a mutable array.

### Pitfall 3: `import type` required by `verbatimModuleSyntax` for type-only imports

**What goes wrong:** `import { TextNode } from 'node-html-parser'` — if `TextNode` is used only as a type (not as a value), `verbatimModuleSyntax: true` requires it be `import type { TextNode }`. tsc errors: "This import is never used as a value and must use 'import type'."

**How to avoid:** Use `import type` for all imports used only as types. `import type { TextNode } from 'node-html-parser'` is the correct form.

### Pitfall 4: Test files importing lib with `.js` specifiers after rename

**What goes wrong:** The four test files currently import from `'./manifest.js'`, `'./parse-photo-filename.js'`, etc. After the test files are renamed to `.ts`, their imports must be updated to `.ts` specifiers. If left as `.js`, running `node --test` on the `.ts` test file throws `ERR_MODULE_NOT_FOUND`.

**How to avoid:** The rename of each test file must include the specifier update in the same wave.

### Pitfall 5: `csv-parse` `parse()` type widening

**What goes wrong:** `parse(raw, { columns: true, skip_empty_lines: true })` — `columns: true` triggers the `OptionsWithColumns<T, U>` overload. Without an explicit type parameter, T defaults to `unknown`, and the return is `unknown[]`. Assigning `unknown[]` to `ManifestRow[]` requires narrowing.

**How to avoid:** Apply the D-01 runtime guard after the parse call:
```typescript
const rows = parse(raw, { columns: true, skip_empty_lines: true }) as unknown[];
return rows.filter(isManifestRow);
```
This satisfies D-01 (guard exists) and D-02 (no Zod) and avoids an unguarded double-cast.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate test runner (Jest, Mocha) | `node --test` (built-in) | Node 18+ (stable) | No test framework dependency; `.ts` files work natively in Node 24 |
| `ts-node` / `tsx` loader for `.ts` | Node 24 native type-stripping | Node 22.6+ (stable in v24) | No loader needed; `node file.ts` works directly |
| Import extension rewriting (`rewriteRelativeImportExtensions`) | `allowImportingTsExtensions: true` + `.ts` specifiers | TS 5.7+ | Semantically correct for no-emit workflows |

**Confirmed no-ops:**
- `--experimental-strip-types` — already the default in Node 24 (`process.features.typescript === 'strip'`); no benefit to adding it explicitly
- `--experimental-transform-types` — only needed for `enum`, `namespace`, `parameter properties`; none present in these 5 files

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `csv-parse`'s `parse()` with `columns: true` returns rows as `Record<string, string>` (all values are strings since no type coercion is configured) | Manifest type | Low: we filter with `isManifestRow` which checks keys, not value types; downstream code treats all values as strings |
| A2 | `node-html-parser`'s `TextNode.parentNode` is typed as `HTMLElement \| null` (nullable) | Glossary strict pitfall | Low: if it's non-nullable in the actual type declaration, the null guard is harmless |
| A3 | The `retriable` custom property on `Error` does not cause issues with `@types/node` error type definitions | dropbox-download typing | Low: the `DropboxError extends Error` interface + cast pattern is standard TS and doesn't conflict |

---

## Open Questions

1. **`COLUMNS as const` — does it need `satisfies string[]` or `as string[]` cast?**
   - What we know: `COLUMNS` is `readonly [...]` after `as const`; csv-stringify's `columns` option type may or may not accept `readonly` arrays
   - What's unclear: exact csv-stringify Options type for `columns` field (checked `lib/sync.d.ts`: `Options` type)
   - Recommendation: Use `[...COLUMNS]` spread in the `stringify` call to produce a mutable copy — avoids the cast entirely

2. **`dropbox-list.ts` `dbxCall` return type: `Promise<unknown>` vs `Promise<DropboxListPage>`**
   - What we know: `listSharedFolder` calls `dbxCall` and then uses the result's `.entries`, `.has_more`, `.cursor` fields
   - What's unclear: whether to type `dbxCall` return as `Promise<unknown>` (caller guards) or `Promise<DropboxListPage>` (callee returns narrowed)
   - Recommendation: Keep `dbxCall` as `Promise<unknown>` — it's a generic utility; `listSharedFolder` applies the guard after calling it. This matches D-01/D-03.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | type-stripping, tests | ✓ | v24.15.0 | — |
| `typescript` | `npm run typecheck` | ✓ | 6.0.3 (devDep) | — |
| `csv-parse` | `manifest.ts` | ✓ | 6.2.1 (ships own types) | — |
| `csv-stringify` | `manifest.ts` | ✓ | 6.7.0 (ships own types) | — |
| `node-html-parser` | `glossary-transform.ts` | ✓ | 7.1.0 (ships own types) | — |
| `@types/node` | all Node built-ins | ✓ | 24.13.1 (devDep) | — |

**Missing dependencies with no fallback:** none.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner (`node --test`) |
| Config file | none — test files listed explicitly in `package.json` `test` script |
| Quick run command | `node --test scripts/lib/*.test.ts src/_lib/*.test.ts` |
| Full suite command | `npm test` (after test script glob update) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MIG-01 | Zero tsc errors on converted files | type check | `tsc -p tsconfig.node.json --noEmit` | ✅ tsconfig.node.json exists (Phase 33) |
| MIG-01 | All 4 converted test files pass | unit | `node --test scripts/lib/*.test.ts src/_lib/*.test.ts` | ❌ Wave 0: rename .js → .ts |
| MIG-01 | No `.js` source files remain in scripts/lib/ or src/_lib/ | structural | `ls scripts/lib/*.js src/_lib/*.js` (must return empty) | ❌ Wave 0: all 5 source files still .js |
| MIG-01 | No `@ts-ignore`, no `allowJs`, no unguarded double-casts | grep | `grep -r '@ts-ignore\|allowJs' scripts/lib/ src/_lib/` | ❌ Wave 0: annotations not yet added |
| MIG-01 | `npm run build` produces 1,433 species pages, `_site/` byte-identical | integration | `npm run build && diff -r _site/ _site_baseline/` | ❌ Wave 0: capture baseline before any rename |
| MIG-01 | Cross-extension consumer imports work at runtime | smoke | `node -e "import('./scripts/lib/manifest.ts')"` | ❌ Wave 0: files still .js |

### Sampling Rate

- **Per task commit:** `tsc -p tsconfig.node.json --noEmit && node --test scripts/lib/*.test.ts src/_lib/*.test.ts`
- **Per wave merge:** Full `npm test` (all test files including still-.js suite)
- **Phase gate:** `npm run typecheck && npm test && npm run build` — all green; zero `.js` remaining in lib dirs

### Wave 0 Gaps

- [ ] Capture `_site/` byte-for-byte baseline BEFORE any rename (required for CI-02 byte-identity check)
- [ ] Test script glob in `package.json` updated: `scripts/lib/*.test.js` → `scripts/lib/*.test.ts`, `src/_lib/*.test.js` → `src/_lib/*.test.ts`
- [ ] Five source files renamed to `.ts` (with type annotations added)
- [ ] Four test files renamed to `.ts` (with import specifiers updated to `.ts`)
- [ ] Five consumer files updated with `.ts` import specifiers

---

## Security Domain

> `security_enforcement` not set to false — treated as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Phase 34 is a rename/annotation phase; no auth changes |
| V3 Session Management | no | Static build pipeline |
| V4 Access Control | no | No access control changes |
| V5 Input Validation | yes (D-01 guards) | Hand-rolled guards on Dropbox API responses and csv-parse output |
| V6 Cryptography | no | No crypto |

### Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| `err.retriable` exposes token via error message | Information Disclosure | Existing `redact()` function in `ingest-photos.js`; token never in `err.message` per current design; preserve this invariant in the typed error shape |
| D-03 guard too strict — rejects extra fields in Dropbox response | Availability | Guards check for presence of consumed fields only (`'entries' in d && 'has_more' in d`); extra fields are not checked |

---

## Sources

### Primary (HIGH confidence)

- Live Node v24.15.0 experiments: cross-extension import tests, `node --test` with `.ts` files, mixed glob, `process.features.typescript` check — all run in this session
- tsc 6.0.3 experiments: `noUncheckedIndexedAccess` behavior with `Record<union, T>` vs `Record<string, T>`, regex match array destructuring, pipeline type check — all run in this session
- Source code inspection: `scripts/ingest-photos.js`, `scripts/tile-photos.js`, `scripts/upload-tiles.js` — complete status value enumeration
- Source code inspection: `scripts/lib/*.js`, `src/_lib/glossary-transform.js` — exact function signatures, field usage patterns
- node_modules inspection: `csv-parse/lib/sync.d.ts`, `csv-stringify/lib/sync.d.ts`, `node-html-parser/dist/nodes/text.d.ts`, `@types/node/stream/web.d.ts`, `undici-types/fetch.d.ts` — type declarations for all external dependencies

### Secondary (MEDIUM confidence)

- Codebase glob patterns and package.json `test` script — confirmed current state of test file locations and import specifiers

### Tertiary (LOW confidence)

None.

---

## Metadata

**Confidence breakdown:**
- Cross-extension import mechanics: HIGH — directly tested on Node v24.15.0
- Status union: HIGH — enumerated by source code inspection of all three pipeline scripts
- Strict-mode landmines: HIGH — verified by running tsc 6.0.3 against targeted test cases
- External library types: HIGH — verified from installed node_modules type declarations
- Architecture: HIGH — grounded in existing code structure

**Research date:** 2026-06-09
**Valid until:** 2026-07-09 (Node and TypeScript versions are stable; Dropbox API shape is stable)
