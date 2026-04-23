# Phase 19: Build-time Glossary Transform - Pattern Map

**Mapped:** 2026-04-23
**Files analyzed:** 4 (2 new, 2 modified)
**Analogs found:** 4 / 4

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/_lib/glossary-transform.js` | utility | transform | `scripts/build-data.js` | role-match (pure export functions, csv-parse usage) |
| `src/_lib/glossary-transform.test.js` | test | request-response | `src/components/parquet-cache.test.js` | exact (describe+it, node:test, node:assert/strict, imports from sibling) |
| `eleventy.config.js` | config | request-response | `eleventy.config.js` itself (modification) | exact |
| `package.json` | config | — | `package.json` itself (modification) | exact |

---

## Pattern Assignments

### `src/_lib/glossary-transform.js` (utility, transform)

**Analog:** `scripts/build-data.js`

**Imports pattern** (lines 1-6 of build-data.js):
```javascript
import { readFileSync, mkdirSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
```
Apply: glossary-transform.js uses only `node-html-parser` (no csv-parse — that stays in eleventy.config.js). Import pattern: single named-import per line, `node:` prefix for builtins.

**Exported function pattern** (lines 17-50 of build-data.js):
```javascript
/**
 * Pre-flight CSV validation (before DuckDB import).
 * @param {string} filePath - Absolute or relative path to the CSV file
 * @param {string[]} requiredColumns - Column names that must be present
 * @returns {object[]} Parsed rows (array of objects)
 * @throws {Error} If encoding is invalid or required column is missing
 */
export function validateCsv(filePath, requiredColumns) {
  // ...
  const rows = parse(raw, { columns: true, skip_empty_lines: true });
  // ...
  return rows;
}
```
Apply: export each function individually (`export function escapeRegex`, `export function escapeHtml`, `export function buildTermMap`, `export function applyGlossaryTerms`). JSDoc on each exported function. No default export.

**No error handling boilerplate needed:** This module is pure (no I/O, no async). Errors propagate naturally — no try/catch wrapper required at module level.

---

### `src/_lib/glossary-transform.test.js` (test, unit)

**Analog:** `src/components/parquet-cache.test.js`

**Imports pattern** (lines 1-3 of parquet-cache.test.js):
```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { filterRecords, aggregateByMonth, loadParquet } from './parquet-cache.js';
```
Apply: use `describe` + `it` from `node:test` (not `test` as top-level — RESEARCH.md uses `test` inside `describe`, but the codebase standard shown by `parquet-cache.test.js` and `filters.test.js` uses `it`). Import `assert` as default from `node:assert/strict`. Import named exports from `./glossary-transform.js` (relative, no extension needed in Node ESM with `"type": "module"`).

Note: `eleventy.config.test.js` and `scripts/build-data.test.js` use `test` (no describe) for flat top-level tests. `src/components/*.test.js` use `describe` + `it` for grouped tests. Since glossary-transform tests are grouped by function (escapeRegex, applyGlossaryTerms), use `describe` + `it` to match `parquet-cache.test.js`.

**Test structure pattern** (lines 5-41 of parquet-cache.test.js):
```javascript
describe('filterRecords', () => {
  const records = [ /* fixtures defined at describe scope */ ];

  it('filters by state', () => {
    const result = filterRecords(records, { state: 'WA' });
    assert.equal(result.length, 3);
    assert.ok(result.every(r => r.state === 'WA'));
  });
  // ...
});
```
Apply: define shared fixtures (rows array, termMap) at `describe` scope so each `it` block can reuse without reinitializing. Use `assert.equal`, `assert.ok`, `assert.match` from `node:assert/strict`.

**No `__dirname` / `import.meta.url` needed:** glossary-transform.js is a pure function module — tests pass HTML strings and row arrays directly; no file I/O in tests.

---

### `eleventy.config.js` (config, modification)

**Analog:** `eleventy.config.js` itself — additive modification only.

**Existing top-level import pattern** (lines 1-6):
```javascript
import { EleventyRenderPlugin } from "@11ty/eleventy";
import EleventyVitePlugin from "@11ty/eleventy-plugin-vite";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
```
Apply: add new imports at the top of the import block in the same style — one named import per line, `node:` prefix for builtins:
```javascript
import { readFileSync } from "node:fs";          // already present as existsSync; add readFileSync
import { parse as parseCsv } from "csv-parse/sync";
import { applyGlossaryTerms, buildTermMap } from "./src/_lib/glossary-transform.js";
```
Note: `node:fs` is already imported; extend the existing destructure rather than adding a duplicate import line.

**Existing CDN_BASE_URL constant** (lines 10-14):
```javascript
// bunny.net Pull Zone — public CDN base URL. Not a secret; hard-coded here.
const CDN_BASE_URL = "https://pnwmoths.b-cdn.net";
```
This constant is at module scope (outside `export default function`). The glossary term map build (`buildTermMap(rows, CDN_BASE_URL)`) must also live at module scope — after the `CDN_BASE_URL` declaration, before `export default function`. This matches assumption A2 in RESEARCH.md (module-level code runs before transforms register).

**Existing eleventyConfig registration pattern** (lines 18-35):
```javascript
export default function (eleventyConfig) {
  eleventyConfig.addPlugin(EleventyRenderPlugin);

  eleventyConfig.addFilter("fileExists", function (relativePath) {
    return existsSync(resolve(relativePath));
  });
  // ...
}
```
Apply: `addTransform` call goes inside `export default function (eleventyConfig)`, after existing plugins/filters, before the `return` statement. Use a regular `function` callback (not arrow function) to preserve `this.page.outputPath` binding — critical per RESEARCH.md Pattern 1.

**pathPrefix conditional pattern** (line 10):
```javascript
const pathPrefix = process.env.GITHUB_PAGES ? "/pnwmoths/" : "/";
```
Apply: do NOT hardcode `/pnwmoths/` anywhere in the glossary transform integration (per project MEMORY.md constraint).

---

### `package.json` (config, modification)

**Analog:** `package.json` itself — additive modification to `"test"` script only.

**Existing test script** (line 19):
```json
"test": "node --test eleventy.config.test.js scripts/build-data.test.js scripts/check-page-weight.test.js scripts/migrate-species.test.js src/components/*.test.js"
```
Apply: append `src/_lib/*.test.js` to the end of the existing space-separated file list. Do not change the runner (`node --test`) or the order of existing entries.

Result:
```json
"test": "node --test eleventy.config.test.js scripts/build-data.test.js scripts/check-page-weight.test.js scripts/migrate-species.test.js src/components/*.test.js src/_lib/*.test.js"
```

---

## Shared Patterns

### csv-parse/sync usage
**Source:** `scripts/build-data.js` lines 6, 34
**Apply to:** `eleventy.config.js` (module-scope CSV load)
```javascript
import { parse } from 'csv-parse/sync';
// ...
const rows = parse(raw, { columns: true, skip_empty_lines: true });
```
Pass `{ columns: true, skip_empty_lines: true }` — same options used in build-data.js.

### Named export pattern
**Source:** `scripts/build-data.js` line 17
**Apply to:** `src/_lib/glossary-transform.js`
```javascript
export function validateCsv(filePath, requiredColumns) { ... }
```
All public functions in glossary-transform.js are individually named exports. No default export. This matches the pattern used in build-data.js and parquet-cache.js.

### Module-scope constants before export default
**Source:** `eleventy.config.js` lines 10-14
**Apply to:** `eleventy.config.js` modification
```javascript
const pathPrefix = process.env.GITHUB_PAGES ? "/pnwmoths/" : "/";
const CDN_BASE_URL = "https://pnwmoths.b-cdn.net";

export default function (eleventyConfig) { ... }
```
Glossary CSV load and `buildTermMap` call go between `CDN_BASE_URL` and `export default function`, at module scope.

### node:test describe+it grouping
**Source:** `src/components/parquet-cache.test.js` lines 1-41
**Apply to:** `src/_lib/glossary-transform.test.js`
```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('functionName', () => {
  it('behavior description', () => {
    assert.equal(actual, expected);
  });
});
```

---

## No Analog Found

No files are without an analog. All four files have clear matches in the codebase.

---

## Metadata

**Analog search scope:** project root, `scripts/`, `src/_data/`, `src/components/`, `eleventy.config.js`, `package.json`
**Files scanned:** 8 (eleventy.config.js, package.json, scripts/build-data.js, src/_data/glossary.js, src/components/parquet-cache.test.js, src/components/filters.test.js, eleventy.config.test.js, scripts/check-page-weight.test.js)
**Pattern extraction date:** 2026-04-23
