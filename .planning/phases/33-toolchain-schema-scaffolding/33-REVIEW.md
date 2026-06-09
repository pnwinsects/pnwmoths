---
phase: 33-toolchain-schema-scaffolding
reviewed: 2026-06-09T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - package.json
  - scripts/profile-data.ts
  - src/types/eleventy.d.ts
  - src/types/index.ts
  - src/types/schemas.ts
  - tsconfig.browser.json
  - tsconfig.json
  - tsconfig.node.json
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 33: Code Review Report

**Reviewed:** 2026-06-09
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

This phase installs the TypeScript toolchain and authors Zod 4 schemas for seven data entities. The schema field/type mapping against the profiled CSV/DuckDB column shapes is accurate throughout: nullable columns are correctly marked, the all-VARCHAR treatment of `images.csv` is faithfully reflected, and the BigInt coercion guard for `species.id` is defensive but harmless given that `DuckDBResultReader.getRowObjectsJS()` maps `INTEGER` to `numberFromValue` (not `bigint`) in this version of the DuckDB Node API.

Three findings require attention before the harness is relied upon as a correctness gate.

---

## Warnings

### WR-01: `typecheck` script does not invoke the root tsconfig — it is silently dead for typechecking

**File:** `package.json:27`, `tsconfig.json:1-7`

**Issue:** The root `tsconfig.json` has `"files": []` and a `"references"` array. When invoked as `tsc --noEmit` (no `-p` flag), TypeScript checks zero files — `files: []` means there is nothing to type-check in the root config, and `--noEmit` without `--build` does not traverse `references`. The `typecheck` script correctly bypasses the root and calls each sub-config explicitly (`tsc -p tsconfig.browser.json --noEmit && tsc -p tsconfig.node.json --noEmit`). The root config is therefore useful only for IDE/LSP auto-discovery but provides no CI assurance. This is fine in practice, but the root config's header comment or the RESEARCH.md note that "`tsc --noEmit` on a root references config performs type-checking over all referenced configs" is false; anyone reading that description and calling `tsc --noEmit` from CI would silently skip all type checks.

**Fix:** Add a comment to `tsconfig.json` making the intent explicit:
```json
{
  "_comment": "Root config for IDE/LSP only. npm run typecheck uses explicit -p for each sub-config.",
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.browser.json" }
  ]
}
```
(JSON does not support `//` comments; `_comment` is the conventional workaround, or place the note in a code comment in RESEARCH.md.) At minimum, correct 33-RESEARCH.md section "Pitfall 5" and the Architecture Diagram which both assert `tsc --noEmit` traverses references.

---

### WR-02: `**/*.test.ts` glob in `tsconfig.node.json` will pull browser component tests into the Node type-check target when Phase 37 migrates `src/components/*.test.js`

**File:** `tsconfig.node.json:28`

**Issue:** The `include` array contains `"**/*.test.ts"` as the last entry. This glob matches any `.test.ts` file anywhere in the project tree, including `src/components/`. The existing component test files are `.test.js` today, so there is no immediate error. When Phase 37 renames them to `.test.ts`, they will be silently included under the Node target (`lib: ["ES2022"]`, no DOM) rather than the browser target (`lib: ["ES2022", "DOM", "DOM.Iterable"]`). Component tests that reference DOM APIs (via `lit`, `window`, `document`, `CustomEvent`) will produce `Cannot find name 'document'`-class errors under the wrong target — or, if `skipLibCheck` masks them, will receive incorrect Node-compatible types. The browser tsconfig does not include a test glob at all, so those tests would go entirely unchecked unless explicitly added.

**Fix:** Scope the Node test glob to the directories that belong to the Node target:
```json
"include": [
  "scripts/**/*.ts",
  "src/_data/**/*.ts",
  "src/_lib/**/*.ts",
  "src/types/**/*.ts",
  "eleventy.config.ts",
  "scripts/**/*.test.ts",
  "src/_data/**/*.test.ts",
  "src/_lib/**/*.test.ts",
  "eleventy.config.test.ts"
]
```
And add a corresponding browser test glob to `tsconfig.browser.json`:
```json
"include": [
  "src/components/**/*.ts",
  "src/types/**/*.ts"
]
```
(No change needed to the browser include for now; adding `src/components/**/*.test.ts` when those files are migrated in Phase 37 is sufficient.)

---

### WR-03: `addFilter` shim signature uses rest params but the research template used a single-value signature — the mismatch is benign now but could hide real type errors on migration

**File:** `src/types/eleventy.d.ts:11`

**Issue:** The actual shim declares `addFilter` as:
```typescript
addFilter(name: string, fn: (this: unknown, ...args: unknown[]) => unknown): void;
```
The research template (33-RESEARCH.md § Q4) shows:
```typescript
addFilter(name: string, fn: (this: unknown, value: unknown) => unknown): void;
```
The rest-params form (`...args: unknown[]`) is intentionally broader and covers multi-argument Eleventy filters correctly. However, a consequence is that a filter callback typed as `(value: string) => string` is assignable to `(...args: unknown[]) => unknown` under TypeScript's function compatibility rules, meaning a narrowly-typed filter won't produce a type error when passed to `addFilter`. This is not wrong for a minimal shim, but differs from the research spec without explanation in the file. When `eleventy.config.js` is migrated to `.ts` in a later phase, this broadness may allow mismatched filter signatures to pass `tsc --noEmit` silently.

**Fix:** Add a comment explaining the deliberate broadening:
```typescript
// ...args rather than a single `value` param: Eleventy 3 filters can receive
// multiple arguments (e.g. the Liquid/Nunjucks filter context). The shim
// accepts any arity to avoid false positives before eleventy.config.ts migration.
addFilter(name: string, fn: (this: unknown, ...args: unknown[]) => unknown): void;
```

---

## Info

### IN-01: `zod` in `dependencies` is correct but undocumented — future maintainers may move it to `devDependencies` by mistake

**File:** `package.json:44`

**Issue:** `zod` is correctly placed in `dependencies` (not `devDependencies`) because build scripts (`scripts/profile-data.ts`, and future Phase 37 browser components) import the Zod runtime. This is the right classification. However, no comment in the file explains why `zod` is not in `devDependencies` alongside the other type-related packages. A maintainer running a "clean up deps" pass might move it, breaking builds.

**Fix:** No code change needed. Document the rationale in `package.json` via a README note or inline in RESEARCH.md. Alternatively, add a note to `DATA-PROFILE.md` or `33-RESEARCH.md` as a standing decision.

---

### IN-02: The `BigInt` coercion for `species.id` in `profile-data.ts` is unnecessary for this DuckDB API version but its comment is slightly misleading

**File:** `scripts/profile-data.ts:145-151`

**Issue:** The comment reads: "DuckDB INTEGER columns may return as BigInt in some DuckDB node API versions. Coerce id to Number before parse to match z.number().int()". In `@duckdb/node-api` v1.5.1 with `getRowObjectsJS()`, `INTEGER` maps to `numberFromValue` (plain JS `number`), not `bigint`. The coercion is harmless but the comment implies the current API version has this behavior, which is inaccurate. A future API upgrade that does return `bigint` for `INTEGER` would break all other integer fields (e.g. `elevation_ft`, `year`, `month`, `day`) in `OccurrenceRecordSchema` without any coercion guard. The selective guard only on `id` would give a false sense of safety for that column while leaving the rest unprotected.

**Fix:** Either:
1. Update the comment to say the coercion is defensive against future API changes, not a fix for a current issue; and either extend the guard to all `INTEGER` columns or remove it.
2. Remove the coercion and add a version-pinning note: "If upgrading `@duckdb/node-api`, verify that `DuckDBTypeId.INTEGER` still maps to JS `number` in `JSDuckDBValueConverter`."

---

_Reviewed: 2026-06-09_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
