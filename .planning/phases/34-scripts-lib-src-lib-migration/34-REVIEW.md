---
phase: 34-scripts-lib-src-lib-migration
reviewed: 2026-06-10T00:09:11Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - scripts/lib/manifest.ts
  - scripts/lib/parse-photo-filename.ts
  - scripts/lib/dropbox-list.ts
  - scripts/lib/dropbox-download.ts
  - src/_lib/glossary-transform.ts
  - scripts/lib/manifest.test.ts
  - scripts/lib/parse-photo-filename.test.ts
  - scripts/lib/dropbox-download.test.ts
  - src/_lib/glossary-transform.test.ts
findings:
  critical: 0
  warning: 2
  info: 1
  total: 3
status: issues_found
---

# Phase 34: Code Review Report

**Reviewed:** 2026-06-10T00:09:11Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Five build-side TypeScript utility libraries converted from JS, plus their test suites. No `as unknown as T` double-casts found. No `any` leaks. No debug artifacts. The `noUncheckedIndexedAccess` guards are all correctly placed. The `viewRaw` cast in `parseSpecimenAndView` is sound because the regex captures group constrains the value to exactly `D` or `V`. The `DropboxError` widening cast in `downloadSharedFile` is sound (self-constructed value). The `toSpeciesSlug` signature correctly reflects runtime behavior.

Two warnings and one info item found, all in type-guard completeness rather than behavioral bugs.

## Warnings

### WR-01: `isDropboxListPage` guard does not verify `cursor` is a string — type claim overstates what is checked

**File:** `scripts/lib/dropbox-list.ts:44-48`

**Issue:** `isDropboxListPage` validates `entries` (array) and `has_more` (boolean) but not `cursor` (string). The `DropboxListPage` interface declares `cursor: string` as a required, non-optional field; the guard asserts `data is DropboxListPage` but does not verify that field. If a Dropbox response arrives with `has_more: true` and no `cursor` field, the guard passes, TypeScript trusts `raw.cursor` is `string`, but at runtime `raw.cursor` is `undefined`. On the next loop iteration `cursor` holds `undefined`, `JSON.stringify({ cursor: undefined })` produces `{}`, and the `/2/files/list_folder/continue` call returns a Dropbox API error. There is no silent data loss (the error surfaces), but the guard's postcondition is weaker than it claims.

**Fix:**
```typescript
function isDropboxListPage(data: unknown): data is DropboxListPage {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return (
    Array.isArray(d['entries']) &&
    typeof d['has_more'] === 'boolean' &&
    typeof d['cursor'] === 'string'
  );
}
```

---

### WR-02: `isManifestRow` guard verifies key presence but not value types — type claim (`Record<…, string>`) overstates what is checked

**File:** `scripts/lib/manifest.ts:84-87`

**Issue:** `isManifestRow` checks that every column key is present (`col in obj`) but does not verify that each value is a `string`. `ManifestRow` is typed as `Record<typeof COLUMNS[number], string>`, so the guard asserts all 13 values are strings. If any value is not a string (e.g., `null`, `number`) the guard still returns `true` and downstream code treats the value as `string`. In the current pipeline `csv-parse` with `{ columns: true }` always produces string values, so this is not a live bug — but the guard's postcondition is not what it claims, and a future caller or alternative source could pass non-string values silently.

**Fix:** Add a value-type check for each column:
```typescript
function isManifestRow(obj: unknown): obj is ManifestRow {
  if (typeof obj !== 'object' || obj === null) return false;
  const record = obj as Record<string, unknown>;
  return COLUMNS.every(col => col in record && typeof record[col] === 'string');
}
```

---

## Info

### IN-01: `makeTestRow` in `manifest.test.ts` re-declares already-optional fields in its parameter type

**File:** `scripts/lib/manifest.test.ts:16`

**Issue:** The helper signature is `Partial<ManifestRow> & { binomial_raw?: string; match_bucket?: string; _id?: string }`. `binomial_raw` and `match_bucket` are already covered by `Partial<ManifestRow>`, so the explicit re-declaration is redundant. The `_id` field is the only novel addition; the rest of the intersection adds no information and may confuse a future reader into thinking these fields have special handling.

**Fix:** Simplify to the minimal intersection:
```typescript
function makeTestRow(partial: Partial<ManifestRow> & { _id?: string }): ManifestRow {
```

---

_Reviewed: 2026-06-10T00:09:11Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
