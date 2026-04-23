# Architecture: Build-Time Glossary Term Detection

**Milestone:** v2.0 Glossary Tooltips
**Researched:** 2026-04-23
**Confidence:** HIGH — all integration points verified against existing source files and
Eleventy 3.x documentation

---

## Decision Summary

Use an **Eleventy HTML transform** (`eleventyConfig.addTransform`) that runs after all
templates (including `{% renderFile %}`) have been rendered. The transform receives the
complete page HTML as a string, uses a lightweight DOM manipulation library (or regex
against `<p>` and `<li>` text nodes) to wrap first occurrences of glossary terms in
`<abbr>` elements carrying `data-*` tooltip attributes, and returns the modified string.
Glossary data is loaded once at config startup via `eleventyConfig.addGlobalData` (the
same mechanism already used for `cdnBaseUrl`) and closed over by the transform function.

---

## 1. Why a Transform, Not a Nunjucks Filter or markdown-it Plugin

### Option A — Nunjucks filter on `content`

Species prose is rendered by `{% renderFile prosePath %}` inside `species.njk`. The
`renderFile` shortcode outputs rendered HTML as a block into the page. There is no
Nunjucks-accessible variable that holds only the prose HTML at filter-application time —
the prose is emitted directly into the output stream. A filter would have to be applied
to the entire page content (`{{ content | safe }}`), but `content` in `base.njk` is the
already-serialised page body including the `<dl>` taxonomy block, occurrence section,
and photos section. Filtering `content` would require wrapping every use of the filter
everywhere the layout is used, which is fragile and incomplete.

**Verdict: not suitable.** Nunjucks filters operate on strings at template render time,
not on the final composed page. The render plugin deliberately streams output, so the
prose is not available as a discrete string variable for filtering.

### Option B — markdown-it plugin

A custom markdown-it plugin could intercept text tokens during Markdown parsing and wrap
glossary terms inline. This runs before Nunjucks template rendering and therefore before
the surrounding page structure is assembled.

Problems:
1. The markdown-it instance is configured once globally (`eleventyConfig.setLibrary` or
   `eleventyConfig.amendLibrary`). Making glossary data available to the plugin requires
   either a module-level variable (fragile singleton) or re-constructing the library for
   each page (expensive at 1,364 species pages).
2. "First occurrence per page" is impossible to enforce within the markdown-it plugin
   because the plugin processes only the prose fragment, not the full page. The same
   term in the taxonomy `<dl>` or in navigation would never be seen by the plugin, so
   "first on the page" correctly collapses to "first in prose," but the constraint cannot
   be verified without page context.
3. The prose files are currently rendered with `{% renderFile prosePath %}` using the
   `EleventyRenderPlugin`. The markdown-it plugin fires inside that shortcode's
   compilation step. Testing this interaction is harder than testing a standalone
   transform.

**Verdict: possible but overfit.** The transform approach handles all three issues
without the singleton or per-page library rebuild.

### Option C — Eleventy HTML transform (RECOMMENDED)

`eleventyConfig.addTransform("glossary-terms", async function(content) { ... })` runs
after Eleventy has fully rendered each output file (template → layout → content
assembled). At this point:
- `content` is the complete HTML string for the page.
- `this.page.outputPath` identifies whether this is an HTML file.
- `this.page.inputPath` can distinguish species pages from glossary/browse pages if
  scope-limiting is needed.

The transform runs on every HTML output file. A guard (`if
(!outputPath.endsWith('.html')) return content`) restricts processing to HTML pages.
An additional guard targeting only species pages (checking `this.page.inputPath` for
`species/species.njk`) is optional but recommended for performance: there are 1,364
species pages and applying term detection to browse, glossary, and search pages is
unnecessary.

**Verdict: correct integration point.** Transform fires after all rendering, has access
to complete page HTML, can enforce first-occurrence-per-page naturally (scan the HTML
once, mark terms seen), and is testable in isolation with a string input.

---

## 2. Build Order: What Must Be Ready Before the Transform

```
npm run build:data          ← generates data/parquet/; validates glossary.csv
  └─ glossary.csv validated for safe filename characters
npm run build:eleventy      ← Eleventy + Vite pipeline
  ├─ Eleventy starts; loads src/_data/*.js (including glossary.js → DuckDB query)
  │    └─ glossary data (term, definition, image_filename) available at config time
  ├─ eleventy.config.js addGlobalData("glossaryTerms", ...) closure ready
  ├─ Template rendering: species.njk + {% renderFile %} prose → raw HTML
  ├─ Layout: base.njk wraps rendered content
  └─ Transform: "glossary-terms" fires on completed HTML string
       └─ term detection + <abbr> wrapping → final HTML written to _site/
npm run build:pagefind      ← indexes _site/ HTML (after transform output)
```

Glossary data must be loaded before the transform is registered. Loading it
synchronously inside `addGlobalData` (which already accepts async functions) ensures the
data is resolved before Eleventy begins template processing.

There is no conflict with the Vite plugin: `eleventyPlugin-vite` fires `writeBundle`
after Eleventy writes `_site/` files. The HTML transform runs before Vite sees the
files, so the annotated `<abbr>` markup will be present in whatever Vite processes.
Vite's HTML transformer rewrites asset URLs and module imports — it does not touch
arbitrary element attributes, so the `data-*` attributes survive Vite's pass intact.

Pagefind runs after `build:eleventy` and indexes the already-transformed HTML. The
`<abbr>` wrappers appear as inline text content within paragraphs; Pagefind will index
the term text normally. Tooltip metadata in `data-definition` and `data-image-url`
attributes is not indexed by Pagefind (attributes are not indexed, only text content).
No `data-pagefind-ignore` is needed on the `<abbr>` elements themselves.

---

## 3. Glossary Data: Loading and Making It Available to the Transform

The existing `src/_data/glossary.js` returns data grouped by first letter (for the
glossary index template). The transform needs a flat structure indexed for fast lookup:
a `Map<normalizedTerm, { term, definition, imageUrl }>`.

Do not modify the existing `src/_data/glossary.js` — it is shaped for the template.
Instead, load glossary data a second time inside `eleventy.config.js` using
`addGlobalData` with a separate key, or — better — load it once in `eleventy.config.js`
at startup and use `addGlobalData` for the transform-time closure.

**Recommended pattern:**

```js
// eleventy.config.js (top-level, outside the export default function)
import { DuckDBInstance } from '@duckdb/node-api';
import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';

async function loadGlossaryTerms() {
  // Lightweight: read CSV directly without DuckDB to avoid a second DB lifecycle.
  // glossary.csv is already validated by build:data before build:eleventy runs.
  const raw = readFileSync('data/glossary.csv');
  const rows = parse(raw, { columns: true, skip_empty_lines: true });
  const map = new Map();
  for (const row of rows) {
    if (!row.definition) continue;
    const imageUrl = row.image_filename
      ? `${CDN_BASE_URL}/glossary/${encodeURIComponent(row.image_filename)}?width=188&height=225&crop_gravity=north`
      : null;
    map.set(row.term.toLowerCase(), {
      term: row.term,
      definition: row.definition,
      imageUrl,
    });
  }
  return map;
}
```

The map is keyed on `term.toLowerCase()` for case-insensitive matching. The transform
uses this map. `csv-parse` is already a project dependency.

Load the map before registering the transform:

```js
export default async function(eleventyConfig) {
  // ... existing plugins and filters ...

  const glossaryTerms = await loadGlossaryTerms();  // ~149 terms, instant

  eleventyConfig.addTransform("glossary-terms", function(content) {
    if (!(this.page.outputPath || "").endsWith(".html")) return content;
    if (!this.page.inputPath.includes("species/species.njk")) return content;
    return applyGlossaryTerms(content, glossaryTerms);
  });
}
```

Note: `eleventy.config.js` exports an async default function. The existing code does
not use `async` on the export function, but Eleventy 3.x supports it. Adding `async`
here is safe and necessary to `await loadGlossaryTerms()`.

Alternatively, `loadGlossaryTerms()` can be called at module top level (outside the
export function) and awaited via a top-level await since the file is an ES module
(`"type": "module"` in package.json). Either approach works; the `async` export function
is slightly cleaner as it keeps all config setup inside the function boundary.

---

## 4. Term Detection and Wrapping Algorithm

### Scope: where to apply

Apply only to paragraph-level text within the prose block. The complete page HTML
contains:

1. Taxonomy `<dl>` block — term text here (e.g., "Family: Noctuidae") should not be
   highlighted.
2. Species prose from `{% renderFile %}` — the target: `<p>`, `<h2>`, `<h3>` elements
   within a `<section>` or directly inside `<main>`.
3. Occurrence section (Lit web components with `data-pagefind-ignore`).
4. Photos section.
5. Similar species list.
6. Navigation and footer.

Use a DOM library to scope the transform to the prose paragraphs only. The prose
rendered by `{% renderFile %}` produces vanilla `<p>`, `<h2>`, `<ul>`, `<li>` elements
with no wrapper element distinguishing it from the taxonomy `<dl>`. The safest scope
strategy is to process only `<p>` and `<li>` elements that are descendants of `<main>`
and not inside a `<dl>`, `<section class="occurrence">`, or any element with
`data-pagefind-ignore`.

**Recommended library: `node-html-parser`** (fast, zero native deps, no JSDOM overhead).
At 1,364 pages, JSDOM would add meaningful build time; node-html-parser is ~10× faster
for this use case. It supports querySelector and text manipulation.

If build-time performance proves acceptable, JSDOM is fine and provides a more complete
DOM API. Decide after profiling with a representative run.

### First-occurrence-per-page enforcement

Use a `Set<string>` of already-matched terms, initialised fresh for each page call.
When a term is matched, add it to the set. On subsequent text nodes, skip any term
already in the set.

### Matching strategy

Sort terms longest-first before iterating, so multi-word terms ("Reniform spot",
"Anal angle") are matched before their component words ("Anal", "angle"). Apply a
case-insensitive whole-word regex for each term.

Pattern per term: `\b(term)\b` with the `i` flag, where `term` is regex-escaped.
"Whole word" is needed to avoid matching "larvae" when the term is "larva". Note that
entomological terms often have plural forms that differ (larva/larvae, pupa/pupae) —
matching only the exact term (singular) is fine for a first pass; stemming can be added
later if needed.

Do not use a single giant alternation regex across all 149 terms — it becomes
unmaintainable. Instead, iterate terms in longest-first order and apply each regex to
the current text content.

### Pseudo-code

```js
function applyGlossaryTerms(html, glossaryTerms) {
  const root = parse(html);  // node-html-parser
  const seen = new Set();

  // Process only text-bearing elements in <main>, not in <dl> or data-pagefind-ignore
  const paragraphs = root.querySelectorAll('main p, main li, main h2, main h3');

  // Sort terms longest-first for multi-word priority
  const sortedTerms = [...glossaryTerms.values()].sort(
    (a, b) => b.term.length - a.term.length
  );

  for (const el of paragraphs) {
    // Skip if inside a <dl> (taxonomy block) or marked pagefind-ignore
    if (el.closest('dl') || el.closest('[data-pagefind-ignore]')) continue;

    for (const { term, definition, imageUrl } of sortedTerms) {
      if (seen.has(term.toLowerCase())) continue;
      const pattern = new RegExp(`\\b(${escapeRegex(term)})\\b`, 'i');
      const text = el.innerHTML;
      if (pattern.test(text)) {
        el.innerHTML = text.replace(pattern, (match) => {
          seen.add(term.toLowerCase());
          const attrs = [
            `class="glossary-term"`,
            `data-definition="${escapeHtml(definition)}"`,
            imageUrl ? `data-image-url="${imageUrl}"` : '',
          ].filter(Boolean).join(' ');
          return `<abbr ${attrs}>${match}</abbr>`;
        });
        // Only replace first occurrence globally; move to next term after match
      }
    }
  }

  return root.toString();
}
```

Note: `el.innerHTML` replacement using `String.replace` with a regex will replace only
the first match because the regex has no `g` flag. This enforces first-occurrence-per-
element. The `seen` Set enforces first-occurrence-per-page across elements.

---

## 5. Tooltip Content Embedding Strategy

**Embed tooltip content in `data-*` attributes on the `<abbr>` element.**

| Approach | Assessment |
|----------|------------|
| `data-definition` + `data-image-url` on `<abbr>` | Recommended. All content baked into HTML at build time. No JS fetch. Works with no-JS (see degradation below). Pagefind ignores attributes. |
| Inline `<template>` sibling element | Heavier DOM; tooltip JS must navigate siblings. More markup per term. |
| Separate JSON fetch at runtime | Requires a network request per page load. Defeats the static-site model. Unnecessary — glossary has only 149 terms at ~50 KB total. |
| Embedded JSON `<script>` block per page | Single fetch per page. Adds ~50 KB to every species page. Wasteful when only a handful of terms appear per page. |

**`data-definition` + `data-image-url` is the correct choice.** The definition strings
are prose (~50–200 chars each). The image URL is a CDN URL constructed at build time
using the same `CDN_BASE_URL` pattern already in use. No additional data needs to be
available at runtime.

### CDN image URL construction

Glossary images live at `{CDN_BASE_URL}/glossary/{filename}`. The URL with Optimizer
parameters matches the existing glossary template:

```
https://pnwmoths.b-cdn.net/glossary/{filename}?width=188&height=225&crop_gravity=north
```

`filename` must be URL-encoded (`encodeURIComponent`). The `urlencode` Nunjucks filter
already handles this in the glossary template; the transform must do the same in JS.

### HTML attribute escaping

`definition` text contains commas, apostrophes, and double-quoted examples (e.g., the
"head" end). Embed definitions in double-quoted attributes and HTML-entity-escape
internal double quotes: `"` → `&quot;`. A minimal `escapeHtml` function:

```js
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
```

---

## 6. Graceful No-JS Degradation

`<abbr>` is a semantic HTML element with no interactive behaviour by default. In a
no-JS environment it renders as underlined text (or with a dotted underline per browser
default). The native `title` attribute on `<abbr>` provides a browser-rendered tooltip
on hover (text only, no image) without any JavaScript:

```html
<abbr class="glossary-term"
      data-definition="..."
      data-image-url="..."
      title="...short definition...">Larva</abbr>
```

Set `title` to the first sentence of the definition (up to ~80 chars) truncated at a
word boundary. This gives meaningful no-JS behaviour. The JS component (a Lit element
or plain custom event handler) replaces the `title` tooltip with the rich popover.

This matches the existing no-JS degradation model: the species page's taxonomy, prose,
and photos are visible without JS; only interactive components (map, chart, slideshow)
require it.

---

## 7. Pagefind Compatibility

Pagefind indexes text content of HTML elements. `<abbr>` is inline and its text content
("Larva") flows naturally into the surrounding paragraph text. Pagefind indexes this
correctly — the term word is still present in the prose, just wrapped in `<abbr>`.

`data-*` attributes are not indexed by Pagefind. The definition text in
`data-definition` is not indexed (which is correct — the definition belongs to the
glossary page, not the species page).

No `data-pagefind-ignore` is needed on `<abbr>` elements. Adding it would exclude the
term word from the species page index, which is wrong — "larva" should be searchable.

If Pagefind produces redundant excerpts that include the `<abbr>` markup visually, the
CSS for `.glossary-term` in search result snippets can be set to display normally.

---

## 8. File Inventory: New vs Modified

### New files

| File | Purpose |
|------|---------|
| `src/_lib/glossary-transform.js` | `applyGlossaryTerms(html, termMap)` pure function + helpers |
| `src/_lib/glossary-transform.test.js` | Unit tests for the transform function |
| `src/styles/glossary-terms.css` | CSS for `.glossary-term` underline style and tooltip popover |
| `src/components/glossary-tooltip.js` | JS (Lit or plain) for the rich tooltip popover |

### Modified files

| File | Change |
|------|--------|
| `eleventy.config.js` | `async` on export function; `loadGlossaryTerms()` call; `addTransform("glossary-terms", ...)` |
| `src/_includes/base.njk` | Add `<link rel="stylesheet" href="/styles/glossary-terms.css">` |
| `package.json` | Add `node-html-parser` to `dependencies` |

### Files with no changes

| File | Reason |
|------|---------|
| `src/_data/glossary.js` | Still serves the grouped-by-letter data for the glossary index page; not modified |
| `src/species/species.njk` | Prose rendering via `{% renderFile %}` is unchanged; transform runs post-render |
| `data/glossary.csv` | Source data unchanged; already validated |
| `scripts/build-data.js` | Already validates `image_filename`; no changes needed |

---

## 9. Data Flow: glossary.csv → transform → HTML output

```
data/glossary.csv
  └─ scripts/build-data.js (validation: safe filenames, required columns)
       └─ [build:data succeeds]
            └─ eleventy.config.js startup
                 └─ loadGlossaryTerms() reads glossary.csv via csv-parse
                      └─ Map<lowerTerm, { term, definition, imageUrl }>
                           └─ glossaryTerms (closure over transform fn)

Template rendering (species/species.njk):
  {% renderFile src/content/species/{slug}.md %}
    → markdown-it parses prose → <p>...</p> HTML fragment
    → injected into species.njk body
  base.njk layout wraps everything
  → full page HTML string (content)
       └─ addTransform("glossary-terms", fn):
            ├─ guard: .html output only
            ├─ guard: species/species.njk input only
            ├─ node-html-parser: parse content
            ├─ for each <p>, <li> in <main> not in <dl>:
            │    for each term (longest-first):
            │      if not seen: regex match → replace with <abbr data-definition="..." data-image-url="...">
            └─ root.toString() → final HTML written to _site/species/{slug}/index.html

pagefind --site _site
  └─ indexes <abbr> text content normally (attributes ignored)
```

---

## 10. Pitfalls

**Double-replacement.** If `innerHTML` is mutated and then the outer loop re-processes
the same element, a term already wrapped in `<abbr>` could be matched again. Prevent
this by tracking `seen` terms in the Set before replacing, and using the regex without
the `g` flag (replaces first match only per element). After replacing in an element,
mark the term seen so it is skipped in subsequent elements.

**Regex matching inside HTML tags.** A naive regex on `innerHTML` can match text inside
attribute values or tag names (e.g., the term "Costa" in `class="costa-strip"`). Use
a negative-lookahead to avoid matching inside tags:
`\b(term)\b(?![^<]*>)` — this is a common pattern and sufficient for simple prose HTML.
For production robustness, match only on text nodes via the DOM library rather than raw
HTML string manipulation.

**Terms with special regex characters.** Terms like "1A+2A" and "M1" contain `+` and
digits that are safe in regex, but the `+` needs escaping. `escapeRegex` must cover:
`. * + ? ^ $ { } [ ] | ( ) \`.

**Multi-word terms vs. their component words.** "Anal angle" must match before "Anal"
and "angle" individually. Longest-first sort handles this, but requires that the loop
processes terms in that sorted order for each element, not just globally.

**Prose files with no glossary terms.** The transform must return content unchanged
efficiently (no DOM parse if no terms match). Consider a fast pre-check: if none of the
~149 term strings appear anywhere in `content`, skip the DOM parse entirely.

**eleventy.config.js becoming async.** The current export is synchronous. Adding
`async` is supported in Eleventy 3.x but must be tested. If `loadGlossaryTerms` fails
(e.g., missing CSV), Eleventy will surface the async rejection as a build error — which
is correct fail-fast behaviour.

**Tooltip popover vs. Pagefind excerpt.** Pagefind generates text excerpts for search
results. If a matching term appears in an excerpt, Pagefind will render the `<abbr>`
element markup. This is safe — `<abbr>` renders as plain underlined text in Pagefind
UI's excerpt display — but verify the output looks acceptable.

**`node-html-parser` vs JSDOM performance.** At 1,364 pages, even 10 ms per page adds
~14 seconds to the build. Benchmark before committing to a library. If performance is
unacceptable, fall back to a careful regex-on-text-nodes approach without a full DOM
parse.
