---
phase: 19-build-time-glossary-transform
reviewed: 2026-04-23T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - eleventy.config.js
  - package.json
  - src/_lib/glossary-transform.js
  - src/_lib/glossary-transform.test.js
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 19: Code Review Report

**Reviewed:** 2026-04-23
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Four files were reviewed: the core glossary transform utility, its test suite, the Eleventy config, and package.json. The overall implementation is solid — the per-invocation `seen` Set, longest-first sort, `exchangeChild` workaround for node-html-parser 7.x, and regex escaping are all correctly handled. Three functional issues were identified: (1) text nodes inside inline elements are silently skipped, (2) a text node containing two different glossary terms only gets the first one wrapped, and (3) a test inadvertently passes vacuously. Two minor info-level items round out the report.

## Warnings

### WR-01: Text inside inline elements is silently skipped

**File:** `src/_lib/glossary-transform.js:79`
**Issue:** The text node collection uses `[...el.childNodes].filter(n => n.nodeType === 3)`, which only collects *direct* TextNode children of each `p`/`li`/`h2`/`h3`. Any text nested inside inline elements — `<strong>`, `<em>`, `<a>`, `<span>`, etc. — is never visited. For example, `<p>The <strong>forewing</strong> color.</p>` will not annotate "forewing" because it lives inside a `<strong>` child, not as a direct text child of `<p>`.

**Fix:** Recursively collect all descendant text nodes, or use `querySelectorAll` on text-containing leaves. A simple recursive walk:
```js
function collectTextNodes(el) {
  const result = [];
  for (const child of el.childNodes) {
    if (child.nodeType === 3) {
      result.push(child);
    } else if (child.nodeType === 1) {
      // Skip abbr elements already inserted by earlier passes
      if (child.tagName !== 'ABBR') result.push(...collectTextNodes(child));
    }
  }
  return result;
}

// Replace line 79:
const textNodes = collectTextNodes(el);
```

---

### WR-02: Second glossary term in a single text node is silently dropped

**File:** `src/_lib/glossary-transform.js:80-83`
**Issue:** The outer `for` loop iterates over the original pre-collected text nodes exactly once. `substituteTerms` replaces a text node via `exchangeChild` (creating a new fragment) and then `break`s out. The new fragment's internal text nodes are never queued for processing. If a single text node contains two distinct unseen glossary terms — e.g., "The forewing costa is narrow." where both "forewing" and "costal"/"costa" are glossary terms — only the first (longer) term is wrapped; the second is silently skipped because the original text node was consumed and the resulting fragment is never revisited.

**Fix:** Re-queue newly created text nodes for processing, or restructure `substituteTerms` to loop internally over all terms and rebuild the node split by split. The simplest fix is to collect text nodes after each substitution rather than snapshotting before:

```js
// Instead of a pre-collected snapshot, walk childNodes dynamically.
// Or: return the new text nodes from substituteTerms so the outer loop
// can append them to the work queue.
function substituteTerms(textNode, terms, seen) {
  // ... existing logic up to break ...
  // Return the new fragment's text nodes for further processing
  const fragment = parse(before + abbr + after);
  textNode.parentNode.exchangeChild(textNode, fragment);
  return [...fragment.childNodes].filter(n => n.nodeType === 3);
  // Caller appends returned nodes to the work list
}
```

---

### WR-03: Test for "no transform outside main" passes vacuously

**File:** `src/_lib/glossary-transform.test.js:198-204`
**Issue:** The test uses `<main><p>body</p></main>` — the word "body" matches no glossary term, so no `<abbr>` is produced anywhere. The assertion `!result.includes('<abbr')` passes regardless of whether the code correctly guards `<header>` content. A broken implementation that *only* wraps `<header>` text would still pass this test.

**Fix:** Add a term match inside `<main>` so the test confirms the transform fires for `<main>` content but not for `<header>` content:
```js
it('does not transform content outside main (header, footer, nav)', () => {
  const html = '<html><body>' +
    '<header><p>The forewing.</p></header>' +
    '<main><p>The forewing is present.</p></main>' +
    '</body></html>';
  const result = applyGlossaryTerms(html, termMap);
  // abbr appears in main but not in header
  assert.ok(result.includes('<main><p>The <abbr'), 'forewing in main should be wrapped');
  assert.ok(!result.includes('<header><p>The <abbr'), 'forewing in header should not be wrapped');
});
```

---

## Info

### IN-01: Relative path for glossary CSV is fragile

**File:** `eleventy.config.js:21`
**Issue:** `readFileSync("data/glossary.csv")` uses a bare relative path. This works when Eleventy is invoked from the project root (the normal case), but will throw an unguarded `ENOENT` if the working directory differs. Other path resolutions in the file use `resolve()` (line 33).

**Fix:**
```js
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const glossaryRows = parseCsv(
  readFileSync(resolve(__dirname, "data/glossary.csv")),
  { columns: true, skip_empty_lines: true }
);
```

---

### IN-02: Only one substitution per text node is documented but not enforced structurally

**File:** `src/_lib/glossary-transform.js:120`
**Issue:** The `break` on line 120 and the comment "one substitution per text node per call" correctly documents intentional behavior. However, this design is the direct cause of WR-02 above. Consider a brief JSDoc note on `applyGlossaryTerms` acknowledging this limitation, so future maintainers understand it is a known tradeoff (one pass, one match per node) rather than accidentally reaching for a multi-pass fix that could infinite-loop.

**Fix:** Add to the `substituteTerms` JSDoc:
```js
 * NOTE: Only the first unseen match per text node is replaced. Text nodes
 * produced by the replacement are not re-processed. A node containing two
 * glossary terms will have only the first wrapped on this pass.
```

---

_Reviewed: 2026-04-23_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
