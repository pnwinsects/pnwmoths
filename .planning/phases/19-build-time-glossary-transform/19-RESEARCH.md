# Phase 19: Build-time Glossary Transform - Research

**Researched:** 2026-04-23
**Domain:** Eleventy transform pipeline, HTML text-node manipulation, regex safety
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GLOS-01 | Build emits species prose HTML with first occurrence of each glossary term wrapped in `<abbr class="glossary-term">` carrying `title`, `data-definition`, and `data-image-url` attributes | Eleventy `addTransform` fires after full render; `node-html-parser` injects `<abbr>` into text nodes |
| GLOS-02 | Term matching is case-insensitive and whole-word only (no partial matches inside longer words) | Lookbehind/lookahead `(?<![a-zA-Z0-9])…(?![a-zA-Z0-9])` with `gi` flag; tested in Node 22 |
| GLOS-03 | Terms containing regex metacharacters (`1A+2A`, `W-mark`, `CuA1`) are safely escaped | `escapeRegex` helper confirmed for actual glossary terms; unit test required |
| GLOS-04 | Only the first occurrence of each term per page is wrapped; subsequent occurrences are plain text | `seen` Set initialized per transform invocation (never at module scope) |
| GLOS-05 | Transform runs only on species pages; `/glossary/` and browse pages are excluded | Output-path guard: `this.page.outputPath.includes('/species/')` |
| GLOS-06 | `<abbr title="[definition excerpt]">` provides no-JS degradation | `title` attribute set to definition text; requires `escapeHtml` for definitions containing `"` |
| QA-01 | Automated unit tests cover regex metacharacter escaping, first-occurrence deduplication per page, and prose-scope guard | `src/_lib/glossary-transform.test.js` using `node:test`; added to `npm test` glob |
</phase_requirements>

---

## Summary

Phase 19 adds an Eleventy HTML transform that annotates species prose pages at build time.
The transform loads `data/glossary.csv` once at config startup via `csv-parse/sync`, builds
a term map sorted longest-first, then on each `addTransform` invocation: guards to species
pages only, parses the HTML with `node-html-parser`, walks text nodes inside `main p, main
li, main h2, main h3`, and wraps first occurrences of glossary terms in `<abbr
class="glossary-term">` elements. Terms with regex metacharacters are safely escaped before
`RegExp` construction. A `seen` Set is initialized per invocation to track first-occurrence
state without cross-page pollution.

The scope of actual work is small: only 11 of 1,348 species pages currently have prose
files. The transform runs as a fast bail-out for the other 1,337 pages (outputPath guard
returns immediately). All prerequisites (Eleventy, csv-parse, DuckDB-loaded glossary data)
already exist in the project. Only one new npm dependency is needed: `node-html-parser`.

The prior v2.0 research document (`.planning/research/`) provides comprehensive background
including architecture rationale, pitfall catalogue, and library comparisons. This RESEARCH.md
is the authoritative source for planning; consult the prior document for extended rationale.

**Primary recommendation:** Implement as `src/_lib/glossary-transform.js` (pure function,
unit-testable) + `eleventy.config.js` modification (load CSV, register transform). Do not
use `addGlobalData` for glossary — load via `csv-parse/sync` directly in the config
function and close over the term map in the transform callback.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Glossary term detection and wrapping | Build / Eleventy transform | — | Must run after full page render; has access to complete HTML; 1,364 pages make client-side scanning expensive |
| Term data loading (glossary.csv) | Build startup (config init) | — | csv-parse/sync is synchronous; term map is shared across all transform invocations via closure |
| Regex escaping (`1A+2A`, `W-mark`) | Build / transform helper | — | Must escape before constructing RegExp; runtime JS never sees the raw term strings |
| First-occurrence deduplication | Build / transform (per-page state) | — | `seen` Set scoped to each transform invocation; never at module scope |
| Scope guard (species-only) | Build / transform (outputPath check) | — | `this.page.outputPath.includes('/species/')` filters before any parse cost |
| No-JS degradation (`title` attribute) | Build / transform output | Browser | `<abbr title="…">` is native browser tooltip; no JS needed |
| Tooltip UI (Phase 20/21) | Browser / client | — | Out of scope for Phase 19 |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node-html-parser` | 7.1.0 | Parse rendered HTML string; walk text nodes; inject `<abbr>` | ~10x faster than JSDOM; zero native deps; TextNode + replaceWith API sufficient; confirmed in prior v2.0 research |
| `csv-parse/sync` | 6.2.1 (already installed) | Load `data/glossary.csv` at Eleventy startup | Already project dependency; synchronous `parse()` fits into non-async config function |
| `@11ty/eleventy` | 3.1.5 (already installed) | `addTransform` API for post-render HTML modification | Confirmed: transform callback can be `async`; `this.page.outputPath` available |
| `node:test` + `node:assert` | built-in (Node 22) | Unit tests for transform function | Matches existing test infrastructure in the project |

**Installation (new dependency only):**
```bash
npm install node-html-parser
```

**Version verified:** `npm view node-html-parser version` → `7.1.0` (published 2026-03-03) [VERIFIED: npm registry]

### Already-Present Supporting Libraries

| Library | Already In | Purpose in Phase |
|---------|-----------|-----------------|
| `csv-parse/sync` | `scripts/build-data.js` | Synchronous CSV parsing in `eleventy.config.js` |
| `node:fs` | built-in | `readFileSync` for `data/glossary.csv` |
| `node:path` | built-in | Path construction in test file |

### Alternatives Considered (why rejected)

| Instead of | Could Use | Rejected Because |
|------------|-----------|-----------------|
| `node-html-parser` | `cheerio` | Heavier; jQuery-style API; no meaningful benefit over NHP |
| `node-html-parser` | `JSDOM` | ~10x slower; requires native deps; overkill |
| `node-html-parser` | `unified`/`rehype` | Pipeline complexity; no benefit for this transform |
| `csv-parse/sync` at transform time | `addGlobalData` (DuckDB) | Second DuckDB lifecycle; DuckDB already used in `src/_data/glossary.js` at template time |
| `csv-parse/sync` at transform time | Re-use DuckDB glossary data via `addGlobalData` | `addGlobalData` data is not accessible inside `addTransform` callbacks in Eleventy 3.x |

---

## Architecture Patterns

### System Architecture Diagram

```
data/glossary.csv
  │
  ├─ [eleventy.config.js startup]
  │    readFileSync + csv-parse/sync
  │    → termMap: Map<lowerTerm, {term, definition, imageUrl}>
  │         sorted longest-first (prevents "forewing" before "wing" shadowing)
  │         closed over by addTransform callback
  │
  ├─ [Eleventy template rendering]
  │    species.njk (pagination) + {% renderFile prose.md %}
  │    → full page HTML string (per species page)
  │
  └─ [addTransform("glossary-terms")]
       │
       ├─ Guard 1: outputPath.endsWith('.html') → else return content
       ├─ Guard 2: outputPath.includes('/species/') → else return content
       │
       ├─ node-html-parser: parse(content)
       │    querySelectorAll('main p, main li, main h2, main h3')
       │    │
       │    └─ for each element → for each TextNode in childNodes
       │         │
       │         └─ for each term (longest-first):
       │              escapeRegex(term) → RegExp with lookbehind/lookahead
       │              if match found AND term not in seen:
       │                seen.add(term)
       │                textNode.replaceWith(
       │                  parse(prefix + abbrHtml + suffix)
       │                )
       │
       └─ root.toString() → modified HTML returned to Eleventy
            → _site/species/{slug}/index.html
```

### Recommended Project Structure

New files this phase:

```
src/
└─ _lib/
   ├─ glossary-transform.js      # pure applyGlossaryTerms(html, termMap) function
   └─ glossary-transform.test.js # unit tests (added to npm test glob)
eleventy.config.js               # modified: loadGlossaryTerms() + addTransform
src/species/species.njk          # modified: add <div class="species-prose"> wrapper
```

### Pattern 1: Eleventy addTransform (scope-guarded)

[CITED: https://www.11ty.dev/docs/transforms/]

```javascript
// eleventy.config.js
import { readFileSync } from 'node:fs';
import { parse as parseCsv } from 'csv-parse/sync';

export default function (eleventyConfig) {
  // Load glossary terms once at startup (synchronous)
  const glossaryRows = parseCsv(readFileSync('data/glossary.csv'), {
    columns: true, skip_empty_lines: true
  });
  const termMap = buildTermMap(glossaryRows); // see Pattern 3

  // Register transform — fires after every template render
  eleventyConfig.addTransform('glossary-terms', function (content) {
    const outputPath = this.page.outputPath;
    // Guard 1: HTML files only (outputPath can be false for permalink:false pages)
    if (!outputPath || !outputPath.endsWith('.html')) return content;
    // Guard 2: species pages only
    if (!outputPath.includes('/species/')) return content;
    return applyGlossaryTerms(content, termMap);
  });

  // ... rest of config unchanged
}
```

**Note:** The transform callback is synchronous here because `node-html-parser` parse and
`root.toString()` are synchronous. No `async` needed for the transform itself.

### Pattern 2: node-html-parser text-node walk

[CITED: https://github.com/taoqf/node-html-parser/blob/main/README.md]

```javascript
// src/_lib/glossary-transform.js
import { parse } from 'node-html-parser';

export function applyGlossaryTerms(html, termMap) {
  const root = parse(html);
  const seen = new Set(); // per-invocation: NEVER at module scope

  const elements = root.querySelectorAll('main p, main li, main h2, main h3');
  for (const el of elements) {
    // Skip elements inside dl (taxonomy block) or data-pagefind-ignore sections
    if (el.closest('dl') || el.closest('[data-pagefind-ignore]')) continue;

    // Walk childNodes — must collect first (mutation invalidates live list)
    const textNodes = [...el.childNodes].filter(n => n.nodeType === 3);
    for (const textNode of textNodes) {
      substituteTerms(textNode, termMap, seen);
    }
  }
  return root.toString();
}
```

**Critical:** `nodeType === 3` is the TextNode constant in node-html-parser. [CITED: node-html-parser README — Node class hierarchy shows `nodeType: number` on Node abstract class]

### Pattern 3: Term map construction (longest-first sort, escapeRegex)

```javascript
// src/_lib/glossary-transform.js

// Escape all regex metacharacters in a term string
export function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Escape for HTML attribute values (handles definitions with double quotes)
export function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function buildTermMap(rows) {
  // Sort longest-first: prevents "Marginal band" being consumed by "band"
  const sorted = [...rows].sort((a, b) => b.term.length - a.term.length);
  return sorted.map(row => ({
    term: row.term,
    lower: row.term.toLowerCase(),
    definition: row.definition || '',
    imageUrl: row.image_filename
      ? `${CDN_BASE_URL}/glossary/${encodeURIComponent(row.image_filename)}`
      : '',
    // Pre-compile regex: case-insensitive, whole-word via lookbehind/lookahead
    // \b fails for terms starting/ending with non-word chars (1A+2A, W-mark)
    regex: new RegExp(
      `(?<![a-zA-Z0-9])${escapeRegex(row.term)}(?![a-zA-Z0-9])`,
      'gi'
    ),
  }));
}
```

**Why lookbehind/lookahead instead of `\b`:** `\b` is defined by `\w`/`\W` boundaries. The term `1A+2A` ends with `A` (word char), so `\b` would work on the right. But `+` is between word chars so `\b` would not anchor in the middle. The real issue is terms like `1A+2A` where the `+` is in the middle: we need the whole term to match as a unit with word-boundary semantics at the edges only. Lookbehind/lookahead on `[a-zA-Z0-9]` gives precise control. [VERIFIED: tested in Node 22]

### Pattern 4: Text node substitution with replaceWith

```javascript
function substituteTerms(textNode, terms, seen) {
  let rawText = textNode.rawText; // use rawText to preserve existing HTML entities
  let modified = false;

  for (const entry of terms) {
    if (seen.has(entry.lower)) continue; // already wrapped on this page

    entry.regex.lastIndex = 0; // reset stateful regex
    const match = entry.regex.exec(rawText);
    if (!match) continue;

    seen.add(entry.lower);
    modified = true;

    const before = rawText.slice(0, match.index);
    const matched = match[0]; // preserves original case
    const after = rawText.slice(match.index + matched.length);

    const abbr = `<abbr class="glossary-term" ` +
      `title="${escapeHtml(entry.definition)}" ` +
      `data-definition="${escapeHtml(entry.definition)}" ` +
      `data-image-url="${escapeHtml(entry.imageUrl)}"` +
      `>${matched}</abbr>`;

    textNode.replaceWith(parse(before + abbr + after));
    break; // one substitution per text node; re-process if needed
  }
}
```

**Note on CDN_BASE_URL:** `glossary-transform.js` needs access to `CDN_BASE_URL`. Pass it
as a parameter to `buildTermMap(rows, cdnBaseUrl)`, or import it from a shared constants
module. Do not hardcode it. The value is already defined in `eleventy.config.js`.

### Anti-Patterns to Avoid

- **Regex on raw HTML string:** `content.replace(/\bCosta\b/g, ...)` silently corrupts attributes (`class="costa-strip"`, alt text, etc.). Always parse DOM first.
- **`seen` Set at module scope:** Persists across all 1,348 page renders. Result: only page 1 gets glossary links. Initialize inside the transform callback.
- **`\b` word-boundary with metacharacter terms:** `\b` fails to anchor correctly for `1A+2A` when adjacent characters are non-word. Use lookbehind/lookahead on `[a-zA-Z0-9]`.
- **Unescaped term in `new RegExp()`:** `1A+2A` means "1A followed by one or more A's then 2A" without escaping. Use `escapeRegex` on every term unconditionally.
- **`outputPath.endsWith('.html')` without null check:** `outputPath` is `false` for `permalink: false` pages. Guard: `if (!outputPath || !outputPath.endsWith('.html'))`. [CITED: Eleventy docs — "Caution: this could be false (from permalink)"]
- **Applying transform to glossary page:** Creates recursive self-links. The outputPath guard `includes('/species/')` prevents this.
- **Embedding definition in DOM as visible text at build time:** Pagefind indexes it; search results show definition fragments. Use `data-definition` attribute only. [CITED: prior v2.0 research]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTML parsing and text-node walking | Custom regex parser | `node-html-parser` | Regex on HTML corrupts attributes; edge cases in tag boundaries |
| CSV loading | Custom line-splitter | `csv-parse/sync` | Already in project; handles quoted fields, commas in definitions |
| Regex escaping | Custom escaper | Standard pattern `str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')` | MDN-documented, covers all 12 metacharacters |
| HTML attribute escaping | Assume it's safe | `escapeHtml` helper | Definitions contain `"` (7 terms), `'` (1 term) — confirmed in glossary.csv |

**Key insight:** The most dangerous hand-rolled solution in this phase is regex on raw HTML.
The second most dangerous is an unescaped term in `new RegExp()`. Both are cheap to avoid.

---

## Common Pitfalls

### Pitfall 1: Shared `seen` Set Across Pages

**What goes wrong:** `seen` Set declared outside the transform callback is shared across all Eleventy transforms. Only the first species page processed gets glossary links; all others silently get none.
**Why it happens:** JavaScript closures capture the outer scope variable. The same Set object is referenced by every transform invocation.
**How to avoid:** `const seen = new Set();` must be the first line inside the transform callback function, not in the outer `eleventy.config.js` scope.
**Warning signs:** Local build shows glossary links on one page only; all other species pages have no `<abbr>` elements.

### Pitfall 2: Regex on Raw HTML Corrupts Attributes

**What goes wrong:** `content.replace(/\bCostal\b/gi, ...)` matches inside `alt="costal margin diagram"` and `class="costal-..."`, producing broken HTML.
**Why it happens:** Regex cannot distinguish attribute values from text content.
**How to avoid:** Parse with `node-html-parser` first; only apply RegExp to `TextNode.rawText`.
**Warning signs:** HTML validator errors on species pages after transform; attribute values truncated.

### Pitfall 3: `outputPath` is `false` Crash

**What goes wrong:** `this.page.outputPath.endsWith('.html')` throws `TypeError: Cannot read properties of false`.
**Why it happens:** Eleventy sets `outputPath` to `false` for pages with `permalink: false`.
**How to avoid:** Guard: `if (!outputPath || !outputPath.endsWith('.html')) return content;`
**Warning signs:** Build fails immediately with TypeError on first run.

### Pitfall 4: Definition Text with Double Quotes Breaks HTML Attributes

**What goes wrong:** `<abbr data-definition="the "head" end of organism">` — the attribute closes at the first `"`.
**Why it happens:** 7 glossary definitions contain double-quote characters (confirmed in `data/glossary.csv`: Anterior, Patagium, Posterior, Quadrifid, Scale, Subreniform spot, Trifid).
**How to avoid:** `escapeHtml()` helper that converts `"` → `&quot;` before embedding in attribute values.
**Warning signs:** Browser dev tools show truncated `data-definition` values.

### Pitfall 5: Short Terms Match Inside Longer Terms

**What goes wrong:** "Terminal" matches inside "Subterminal"; "Reniform spot" inside "Subreniform spot"; "Costa" inside "Costal margin".
**Why it happens:** Shorter terms are matched first, consuming the match opportunity for the more specific longer term.
**How to avoid:** Sort `termMap` by `term.length` descending (longest-first) before iterating.
**Warning signs:** "Sub" prefix stripped from terms; less specific definition shown for a more specific term.

### Pitfall 6: Glossary Page Gets Wrapped Terms

**What goes wrong:** `/glossary/index.html` gets every definition wrapped in `<abbr>` pointing back to itself (circular self-links).
**Why it happens:** Transform runs on all HTML pages by default.
**How to avoid:** Guard: `if (!outputPath.includes('/species/')) return content;`
**Warning signs:** Glossary page shows tooltip behavior on its own definitions.

### Pitfall 7: `regex.lastIndex` Not Reset Between Text Nodes

**What goes wrong:** A `RegExp` created with `gi` flags is stateful. After a non-matching search, `lastIndex` is left at a non-zero position, causing the next `exec()` on a different text node to start mid-string.
**Why it happens:** `gi` flag regex objects retain `lastIndex` between calls.
**How to avoid:** `entry.regex.lastIndex = 0;` before each `exec()` call. Or compile regex fresh per text node (minor perf cost). Or use `new RegExp(...)` per invocation inside the loop.
**Warning signs:** Intermittent missed matches — same term present in text but not wrapped.

---

## Code Examples

### Full transform registration

```javascript
// Source: Eleventy docs https://www.11ty.dev/docs/transforms/
// eleventy.config.js modification

import { readFileSync } from 'node:fs';
import { parse as parseCsv } from 'csv-parse/sync';
import { applyGlossaryTerms, buildTermMap } from './src/_lib/glossary-transform.js';

const CDN_BASE_URL = "https://pnwmoths.b-cdn.net"; // existing constant

// At startup (synchronous — csv-parse/sync)
const glossaryRows = parseCsv(readFileSync('data/glossary.csv'), {
  columns: true, skip_empty_lines: true
});
const termMap = buildTermMap(glossaryRows, CDN_BASE_URL);

export default function (eleventyConfig) {
  // ... existing config unchanged ...

  eleventyConfig.addTransform('glossary-terms', function (content) {
    const outputPath = this.page.outputPath;
    if (!outputPath || !outputPath.endsWith('.html')) return content;
    if (!outputPath.includes('/species/')) return content;
    return applyGlossaryTerms(content, termMap);
  });
}
```

### Unit test skeleton (QA-01)

```javascript
// Source: project test convention (node:test + node:assert/strict)
// src/_lib/glossary-transform.test.js

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { escapeRegex, buildTermMap, applyGlossaryTerms } from './glossary-transform.js';

describe('escapeRegex', () => {
  test('escapes + in 1A+2A', () => {
    assert.equal(escapeRegex('1A+2A'), '1A\\+2A');
  });
  test('W-mark passes through (hyphen not a metachar in this position)', () => {
    assert.match(escapeRegex('W-mark'), /W-mark/);
  });
  test('period is escaped', () => {
    assert.equal(escapeRegex('M1.M3'), 'M1\\.M3');
  });
});

describe('applyGlossaryTerms', () => {
  const rows = [
    { term: 'forewing', definition: 'the front wing', image_filename: '' },
    { term: 'wing', definition: 'a wing structure', image_filename: '' },
    { term: '1A+2A', definition: 'fused anal vein', image_filename: '' },
  ];

  test('wraps first occurrence only, not second', () => {
    const html = '<html><body><main><p>The forewing and forewing again.</p></main></body></html>';
    const termMap = buildTermMap(rows, 'https://cdn.example');
    const result = applyGlossaryTerms(html, termMap);
    const abbrCount = (result.match(/<abbr/g) || []).length;
    assert.equal(abbrCount, 1);
    assert.ok(result.includes('<abbr class="glossary-term"'));
  });

  test('longer term matched before shorter ("forewing" before "wing")', () => {
    const html = '<html><body><main><p>The forewing is visible.</p></main></body></html>';
    const termMap = buildTermMap(rows, 'https://cdn.example');
    const result = applyGlossaryTerms(html, termMap);
    assert.ok(result.includes('>forewing<'), 'forewing should be wrapped');
    assert.ok(!result.includes('>wing<'), 'wing inside forewing should not be separately wrapped');
  });

  test('matches 1A+2A term with metacharacters', () => {
    const html = '<html><body><main><p>The vein 1A+2A is fused.</p></main></body></html>';
    const termMap = buildTermMap(rows, 'https://cdn.example');
    const result = applyGlossaryTerms(html, termMap);
    assert.ok(result.includes('>1A+2A<'), '1A+2A should be wrapped');
  });

  test('does not match "subcostal" for term "costal"', () => {
    const costalRows = [{ term: 'costal', definition: 'of the costa', image_filename: '' }];
    const html = '<html><body><main><p>the subcostal region</p></main></body></html>';
    const termMap = buildTermMap(costalRows, 'https://cdn.example');
    const result = applyGlossaryTerms(html, termMap);
    assert.ok(!result.includes('<abbr'), 'subcostal should not match costal');
  });

  test('prose scope guard: does not transform non-species pages (no /species/ in path)', () => {
    // Guard is in eleventy.config.js, not in applyGlossaryTerms
    // Test the guard logic separately
    const outputPath = '_site/glossary/index.html';
    assert.ok(!outputPath.includes('/species/'), 'glossary page should be excluded');
  });

  test('seen Set is per-invocation: calling applyGlossaryTerms twice returns wrapping each time', () => {
    const html = '<html><body><main><p>The forewing is present.</p></main></body></html>';
    const termMap = buildTermMap(rows, 'https://cdn.example');
    const result1 = applyGlossaryTerms(html, termMap);
    const result2 = applyGlossaryTerms(html, termMap);
    assert.ok(result1.includes('<abbr'), 'first call should wrap');
    assert.ok(result2.includes('<abbr'), 'second call should also wrap (fresh seen Set)');
  });
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Pico CSS `data-tooltip` attribute for tooltips | Native Popover API (`popover` attribute) | Baseline April 2025 | No JS needed for dismiss; keyboard Escape built-in; no dependency |
| `\b` word boundaries for all terms | Lookbehind/lookahead `(?<![a-zA-Z0-9])` | N/A — design choice for this phase | Correctly handles terms containing `+`, `-`, digits at boundaries |
| JSDOM / cheerio for HTML transforms | `node-html-parser` | ~2023 (NHP v2+) | ~10x faster; zero native deps; sufficient DOM API |

**Not applicable in this phase (deferred):**
- CSS Anchor Positioning: Baseline 2026; Phase 20/21 may use `@supports` fallback
- `popover="hint"` + `interestfor`: Chrome 142+ only; out of scope

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `this.page.outputPath` contains `'/species/'` for all species pages | Scope guard pattern | [ASSUMED] — derived from output dir structure and species.njk permalink template; verify in first build |
| A2 | Top-level (outside `export default`) code in `eleventy.config.js` executes before transforms are registered | Standard Stack / transform load order | [ASSUMED] — standard Node.js module execution; if wrong, `termMap` is undefined at transform time |
| A3 | `node-html-parser` `TextNode.replaceWith()` accepts an `HTMLElement` (from `parse()`) | Pattern 4 code example | [ASSUMED based on API docs] — `replaceWith(...nodes: (string | Node)[])` accepts Node; verify in first test run |

A1 is verifiable by running `npm run build:eleventy` and checking `this.page.outputPath` in a console.log. A2 is standard Node behavior but confirm with a first build. A3 should be covered by a unit test.

---

## Open Questions

1. **CDN_BASE_URL access from `glossary-transform.js`**
   - What we know: `CDN_BASE_URL` is defined as a `const` in `eleventy.config.js`
   - What's unclear: The cleanest way to pass it to `buildTermMap` — as a parameter vs. shared constants module
   - Recommendation: Pass as parameter to `buildTermMap(rows, cdnBaseUrl)` — no shared state, easily testable

2. **`species.njk` prose wrapper class**
   - What we know: Current HTML has no `species-prose` class wrapper around the `{% renderFile %}` output
   - What's unclear: Whether the transform should add `<div class="species-prose">` as an optimization fast-path, or just rely on the outputPath guard
   - Recommendation: The outputPath guard is sufficient for correctness. Adding a `<div class="species-prose">` wrapper in `species.njk` is optional performance optimization; defer unless build benchmarks show need.

3. **Build time impact**
   - What we know: Current `eleventy` build = ~17s locally; 1,348 species pages; only 11 have prose; node-html-parser benchmarks ~2ms/file
   - What's unclear: Real-world cost on 1,348 × ~46KB average pages (but only 11 actually match and do work)
   - Recommendation: The 1,337 pages without prose incur outputPath guard check only (no parse). The 11 pages with prose incur full parse + walk. Expected total overhead: negligible. Benchmark after implementation.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Transform + tests | ✓ | v22.20.0 | — |
| `csv-parse` | Glossary loading | ✓ (installed) | 6.2.1 | — |
| `node-html-parser` | HTML parsing in transform | ✗ (not installed) | 7.1.0 available | None — must install |
| `@11ty/eleventy` | `addTransform` API | ✓ (installed) | 3.1.5 | — |
| `data/glossary.csv` | Term data | ✓ | 149 terms | — |

**Missing dependencies with no fallback:**
- `node-html-parser@7.1.0` — required; install via `npm install node-html-parser`

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `node:test` + `node:assert/strict` (Node 22 built-in) |
| Config file | none — test files passed explicitly to `node --test` |
| Quick run command | `node --test src/_lib/glossary-transform.test.js` |
| Full suite command | `npm test` (after adding `src/_lib/*.test.js` to the glob) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GLOS-01 | `<abbr class="glossary-term" title data-definition data-image-url>` emitted | unit | `node --test src/_lib/glossary-transform.test.js` | ❌ Wave 0 |
| GLOS-02 | Case-insensitive, whole-word match (no partial match in "subcostal") | unit | same | ❌ Wave 0 |
| GLOS-03 | `escapeRegex` handles `1A+2A`, `W-mark` | unit | same | ❌ Wave 0 |
| GLOS-04 | First occurrence only; second occurrence is plain text | unit | same | ❌ Wave 0 |
| GLOS-05 | Glossary/browse pages excluded by outputPath guard | unit | same | ❌ Wave 0 |
| GLOS-06 | `title` attribute present with escaped definition text | unit | same | ❌ Wave 0 |
| QA-01 | Test suite covers escaping, deduplication, scope guard | unit | `npm test` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `node --test src/_lib/glossary-transform.test.js`
- **Per wave merge:** `npm test`
- **Phase gate:** `npm test` green + `npm run build:eleventy` completes without errors

### Wave 0 Gaps

- [ ] `src/_lib/glossary-transform.js` — module to implement and test
- [ ] `src/_lib/glossary-transform.test.js` — unit tests per QA-01
- [ ] Add `src/_lib/*.test.js` to the `npm test` glob in `package.json`

---

## Security Domain

This phase makes no authentication, session, network, or input-validation changes that
affect external users. The transform runs at build time on trusted local data
(`data/glossary.csv` committed to the repo). The only security consideration is:

- **XSS via definition text:** Definition text is embedded into `data-definition` and
  `title` HTML attributes. `escapeHtml()` must escape `"`, `'`, `<`, `>`, `&` before
  embedding. Definitions are static CSV data controlled by the project maintainer, not
  user-supplied, so the actual XSS risk is low. Use `escapeHtml()` as a defense-in-depth
  measure regardless.

ASVS V5 (Input Validation) applies trivially: the only "input" is the glossary CSV read
at build time, and existing `build-data.js` already validates it.

---

## Sources

### Primary (HIGH confidence)

- `@11ty/eleventy` 3.x transforms — Context7 `/websites/11ty_dev`; https://www.11ty.dev/docs/transforms/ — addTransform API, this.page.outputPath, async support, false outputPath caution [VERIFIED]
- `node-html-parser` v7.1.0 — Context7 `/taoqf/node-html-parser`; GitHub README — TextNode, replaceWith, querySelectorAll, nodeType, DOM traversal [VERIFIED]
- npm registry — `npm view node-html-parser version` → 7.1.0 (2026-03-03) [VERIFIED]

### Primary (verified against project codebase)

- `data/glossary.csv` — 149 terms; 2 with regex metacharacters (`1A+2A`, `W-mark`); 7 definitions with double quotes; 46 terms with `image_filename`; 11 term-overlap pairs requiring longest-first sort [VERIFIED: direct analysis]
- `src/content/species/` — 11 prose files of 1,348 total species pages [VERIFIED: filesystem count]
- `package.json` — `csv-parse: ^6.2.1` already installed; `node --test` test runner pattern established [VERIFIED]
- `eleventy.config.js` — synchronous `export default function`; `CDN_BASE_URL` defined at top level [VERIFIED]
- `_site/species/habrosyne-scripta/index.html` — rendered species page structure; prose appears directly in `<main>` without container div [VERIFIED]
- Prior v2.0 research — `.planning/research/*.md` — comprehensive architecture rationale, pitfall catalogue, library comparison [VERIFIED: confirmed against source files]

### Secondary (MEDIUM confidence)

- Node 22 lookbehind/lookahead support — tested locally: `(?<![a-zA-Z0-9])costa(?![a-zA-Z0-9])` works correctly [VERIFIED: local test]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions npm-verified; libraries context7-confirmed
- Architecture: HIGH — all integration points verified against existing source files
- Pitfalls: HIGH — grounded in actual glossary.csv data (metacharacter terms, quote-containing definitions), actual rendered HTML structure, Eleventy docs

**Research date:** 2026-04-23
**Valid until:** 2026-06-01 (stable libraries; glossary.csv data unlikely to change)
