---
phase: 01-data-pipeline-foundation
reviewed: 2026-04-11T00:00:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - .gitignore
  - .nvmrc
  - data/records-bad.csv
  - data/records.csv
  - data/species.csv
  - eleventy.config.js
  - package.json
  - scripts/build-data.js
  - scripts/build-data.test.js
  - src/_data/species.js
  - src/species/species.njk
findings:
  critical: 2
  warning: 3
  info: 3
  total: 8
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-04-11
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

This phase implements a data pipeline that reads CSV files, validates them, imports into an in-memory DuckDB instance, runs quality checks, and exports per-species Parquet files. The overall structure is sound and the path-traversal guard (`validateSlugComponent`) shows good security awareness. However, two issues undermine that intent: a SQL injection risk in the COPY statement and missing connection cleanup on error paths in both the build script and the Eleventy data file.

## Critical Issues

### CR-01: SQL injection in COPY statement via interpolated output path

**File:** `scripts/build-data.js:186-189`
**Issue:** The `outDir` variable is built from DuckDB-returned `sp.genus` and `sp.species` strings and then interpolated directly into a SQL `COPY ... TO '${outDir}/records.parquet'` statement. `validateSlugComponent` allows spaces (`[a-zA-Z0-9 ]`), and while `.replace(/\s+/g, '-')` converts them in the slug, a species name containing a single quote (e.g., from a future data entry error) would break out of the SQL string literal entirely. The validator regex does not allow single quotes today, but the defense should be structural (parameterized or sanitized separately for SQL context), not reliant on a secondary regex staying in sync with the SQL quoting rules.

**Fix:** Quote or escape the path before embedding it in SQL, or use DuckDB's COPY API with a path parameter if the driver supports it. At minimum, add an explicit assertion that `outDir` contains no single quotes before use:
```js
if (outDir.includes("'")) {
  throw new Error(`Unsafe output path derived from species data: ${outDir}`);
}
```

---

### CR-02: `sp.id` interpolated into SQL string without sanitization

**File:** `scripts/build-data.js:187`
**Issue:** `WHERE species_id = ${sp.id}` interpolates the integer primary key directly into SQL. DuckDB's `getRowObjectsJS()` may return the value as a JavaScript `BigInt` (for large integer types), which coerces to string with `n` suffix (e.g., `1n`), producing invalid SQL silently. Even as a plain number, relying on implicit JS-to-SQL coercion for all future schema changes is fragile. Use a parameterized query or cast explicitly.

**Fix:** Cast to a plain integer before interpolation and guard the type:
```js
const speciesId = Number(sp.id);
if (!Number.isInteger(speciesId) || speciesId <= 0) {
  throw new Error(`Invalid species id: ${sp.id}`);
}
// then: WHERE species_id = ${speciesId}
```
Or use DuckDB prepared statements if available in this driver version.

---

## Warnings

### WR-01: No try/finally — DuckDB connection not closed on error

**File:** `scripts/build-data.js:80-197`
**Issue:** The `conn` object is created at line 81 and closed via `conn.closeSync()` at line 197, but any exception thrown between those lines (failed `conn.run()`, validation error during Parquet export, etc.) will bypass the cleanup. The early-exit path at line 168-170 does call `conn.closeSync()` before `process.exit(1)`, but any unexpected throw from lines 83–192 will leak the connection.

**Fix:** Wrap the body of `main()` in a `try/finally`:
```js
const conn = await db.connect();
try {
  // ... all existing logic ...
} finally {
  conn.closeSync();
}
```

---

### WR-02: Same missing try/finally in Eleventy data file

**File:** `src/_data/species.js:4-37`
**Issue:** `conn.closeSync()` at line 35 is only reached on the happy path. If `conn.run()` (line 7) or `conn.runAndReadAll()` (line 22) throws, the connection is leaked. During Eleventy's build, a leaked DuckDB connection could hold file locks or cause opaque failures on subsequent builds.

**Fix:**
```js
const conn = await db.connect();
try {
  await conn.run(`...`);
  const result = await conn.runAndReadAll(`...`);
  return result.getRowObjectsJS();
} finally {
  conn.closeSync();
}
```

---

### WR-03: Unquoted dynamic path in execSync call

**File:** `scripts/build-data.test.js:101`
**Issue:** `execSync(\`node ${wrapperScript}\`, ...)` — if the project is checked out in a directory whose path contains spaces (common on macOS under user home directories with spaces), `wrapperScript` will be word-split by the shell and the command will fail with a confusing "No such file" error.

**Fix:**
```js
execSync(`node "${wrapperScript}"`, { cwd: tmpDir, timeout: 30000, stdio: 'pipe' });
```

---

## Info

### IN-01: Relative CSV paths are cwd-dependent

**File:** `src/_data/species.js:9`, `scripts/build-data.js:73-74`
**Issue:** Both files reference `data/species.csv` and `data/records.csv` as relative paths. This works only when the process cwd is the project root. It is implicitly correct for the current setup, but will produce confusing errors if either script is ever invoked from a different directory.

**Fix:** Use `import.meta.url` to compute an absolute path, the same pattern the test file already uses:
```js
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// then: resolve(ROOT, 'data/species.csv')
```

---

### IN-02: Eleventy passthrough silently skips missing Parquet directory

**File:** `eleventy.config.js:4`
**Issue:** `addPassthroughCopy({ "data/parquet": "species" })` silently does nothing if `data/parquet/` does not exist (e.g., `npm run build:eleventy` run without first running `npm run build:data`). The site builds successfully but all species pages lack their data files. There is no guard that fails the Eleventy build when the Parquet directory is absent.

**Fix:** Add a check at the top of `eleventy.config.js` that throws if `data/parquet/` is missing, or document prominently that `npm run build` (not `build:eleventy` alone) must be used.

---

### IN-03: `import.meta.url` guard fragile under symlinks

**File:** `scripts/build-data.js:201`
**Issue:** `import.meta.url === \`file://${process.argv[1]}\`` — `process.argv[1]` is the literal path as provided to Node.js (may be a symlink or relative path), while `import.meta.url` is the resolved absolute file URL. On some invocation patterns (e.g., via a symlink in `node_modules/.bin/`, or when invoked as `node ./scripts/build-data.js` from a symlinked project root), these will differ and `main()` will silently not execute.

**Fix:** Use `process.argv[1]` resolved through `fileURLToPath` for comparison, or more idiomatically use the pattern already present in the test file:
```js
import { fileURLToPath } from 'node:url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(...);
}
```

---

_Reviewed: 2026-04-11_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
