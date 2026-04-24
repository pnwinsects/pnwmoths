---
phase: 19-build-time-glossary-transform
reviewed: 2026-04-23T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - src/_lib/glossary-transform.js
  - src/_lib/glossary-transform.test.js
  - eleventy.config.js
  - package.json
findings:
  critical: 0
  warning: 1
  info: 3
  total: 4
status: issues_found
---

# Phase 19: Code Review Report

**Reviewed:** 2026-04-23
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

The glossary transform implementation is correct. The `substituteTerms` while-loop correctly wraps all unseen terms in a single text node in one pass, regex `lastIndex` management is sound across all code paths (when `exec()` returns `null` on a `g`-flag regex it automatically resets `lastIndex` to 0, so the no-substitution break path does not leave stale state), and the `seen` Set is properly scoped per-invocation to prevent cross-page contamination. All 25 tests pass.

One warning and three info-level items were found. The warning is a functional gap: terms inside nested inline elements are silently skipped because the transform only collects direct text-node children of matched elements. The three info items cover a test description inaccuracy, a bare `readFileSync` call at module scope with no actionable error, and a path-guard pattern that is broader than its stated intent.

## Warnings

### WR-01: Terms inside inline elements are silently skipped

**File:** `src/_lib/glossary-transform.js:79`
**Issue:** `applyGlossaryTerms` collects only direct text-node children of each matched element:
```js
const textNodes = [...el.childNodes].filter(n => n.nodeType === 3);
```
Any text nested inside inline elements — `<em>`, `<strong>`, `<a>`, `<code>`, etc. — is never passed to `substituteTerms`. Verified experimentally: `<p>The <strong>forewing</strong> is visible.</p>` leaves "forewing" unannotated. Markdown prose that italicises a term on its first occurrence (e.g., `*Habrosyne scripta* is found with *forewing* …`) would silently produce no `<abbr>`. The function's JSDoc does not document this constraint.

**Fix (minimal):** Document the limitation in the JSDoc so future authors know to avoid inline-element formatting around a term's first occurrence:
```js
 * NOTE: Only direct text-node children of each matched element are processed.
 * Terms appearing inside nested inline elements (<em>, <strong>, <a>, etc.)
 * will not be annotated.
```

**Fix (full):** Replace the direct childNodes filter with a recursive text-node collector:
```js
function collectTextNodes(node) {
  const result = [];
  for (const child of node.childNodes) {
    if (child.nodeType === 3) result.push(child);
    else if (child.nodeType === 1 && child.tagName !== 'ABBR')
      result.push(...collectTextNodes(child));
  }
  return result;
}
// line 79:
const textNodes = collectTextNodes(el);
```

---

## Info

### IN-01: Test description says "12 metacharacters" but the array has 14

**File:** `src/_lib/glossary-transform.test.js:26`
**Issue:** The `it()` name reads `'escapes all 12 metacharacters'` and the inline comment repeats the count. The array literal directly below contains 14 entries: `. * + ? ^ $ { } ( ) | [ ] \`. JavaScript regex metacharacters total 14, not 12.
**Fix:**
```js
it('escapes all 14 metacharacters', () => {
  // Each metacharacter from /[.*+?^${}()|[\]\\]/
```

### IN-02: `readFileSync('data/glossary.csv')` at module scope with no actionable error

**File:** `eleventy.config.js:21-24`
**Issue:** The CSV load runs synchronously at module evaluation time using a bare relative path. If `data/glossary.csv` is absent or Eleventy is invoked from a non-root directory, Node throws a raw `ENOENT` that gives no hint of what went wrong or how to fix it. The `fileExists` filter on line 33 uses `resolve()` for robustness; the glossary load does not.
**Fix:**
```js
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = fileURLToPath(new URL('.', import.meta.url));

let glossaryRows;
try {
  glossaryRows = parseCsv(
    readFileSync(resolve(__dirname, "data/glossary.csv")),
    { columns: true, skip_empty_lines: true }
  );
} catch (err) {
  throw new Error(
    `glossary-transform: cannot read data/glossary.csv — ` +
    `ensure the file exists and Eleventy is run from the project root.\n${err.message}`
  );
}
```

### IN-03: Path guard `includes('/species/')` is broader than intended

**File:** `eleventy.config.js:52`
**Issue:** `outputPath.includes('/species/')` matches any path containing the substring `/species/`, including a hypothetical `/species-guide/index.html` or `/all-species/index.html`. For the current site layout this is harmless, but the stated intent is "only species detail pages."
**Fix:**
```js
if (!/\/species\/[^/]+\/index\.html$/.test(outputPath)) return content;
```

---

_Reviewed: 2026-04-23_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
