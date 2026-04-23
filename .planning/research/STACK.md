# Technology Stack: v2.0 Glossary Tooltips

**Project:** pnwmoths — build-time glossary term detection and tooltip rendering
**Researched:** 2026-04-23
**Milestone:** v2.0 Glossary Tooltips (GLOS-02)
**Scope:** Additions/changes only — existing stack (Eleventy 3.x, Vite, DuckDB, Lit, Pagefind) is unchanged.

---

## What Needs to Be Built

1. **Build-time transform** — scan compiled species prose HTML, detect first occurrence of each glossary term per page, wrap it with tooltip markup.
2. **Tooltip presentation** — on hover/focus, show definition text + optional glossary image. Works without JavaScript (graceful degradation).

The existing glossary data pipeline (DuckDB → `src/_data/glossary.js`) already delivers all terms, definitions, and image filenames to the Eleventy data cascade. No data pipeline changes are needed.

---

## Integration Point: Eleventy `addTransform`

**Use `eleventyConfig.addTransform` in `eleventy.config.js`.** This is the correct, well-documented hook for post-rendering HTML manipulation in Eleventy 3.x. It runs after every template renders but before files are written to `_site/`.

```js
// eleventy.config.js
eleventyConfig.addTransform("glossary-terms", async function (content) {
  // `this.page.outputPath` is available; only process .html files
  if (!this.page.outputPath?.endsWith(".html")) return content;
  // ... HTML manipulation here
  return content;
});
```

The transform receives the full rendered HTML string. The `this` context gives access to `this.page` (url, inputPath, outputPath, date) so the transform can be scoped to species pages only if needed.

**Confidence:** HIGH — confirmed from Eleventy 3.x docs and Context7.

---

## New Dependency: `node-html-parser`

**Version:** `^7.1.0` (current as of 2026-04-23)
**Install:** `npm install node-html-parser`

### Why this library

The transform receives an HTML string. To detect glossary terms in prose text while correctly skipping tag attribute values, `<code>` blocks, existing links, `<abbr>` elements, and already-wrapped terms, the string must be parsed into a DOM tree. String replacement (regex on the raw HTML string) is fragile — it matches inside attributes, crosses tag boundaries, and cannot enforce first-occurrence-per-page logic across nested elements cleanly.

`node-html-parser` is the right choice over alternatives:

| Option | Verdict | Reason |
|--------|---------|--------|
| `node-html-parser` | **Use this** | Fast, zero native deps, full ES module, 7.1.0 stable, childNodes/TextNode API sufficient |
| `jsdom` | Skip | Full browser simulation — massive dependency (puppeteer-weight) for a build transform |
| `cheerio` | Skip | jQuery API over html-parser2, heavier than needed; no meaningful benefit over node-html-parser for this task |
| `linkedom` | Skip | Good but less documentation; node-html-parser has broader community usage and Context7 coverage |
| Regex on raw HTML | Skip | Cannot correctly scope to text nodes only; matches inside attributes and across tag boundaries |
| Nunjucks filter | Skip | Runs during template rendering, not on compiled prose — prose is rendered by `{% renderFile %}` which returns HTML, so the filter cannot see compiled Markdown output from child files |

### Key API patterns for this feature

Walk `childNodes` recursively, check `nodeType` to find text nodes (nodeType === 3), and use `replaceWith` (inherited from `Node`) or splice the parent's `set_content` to inject HTML. Practical pattern:

```js
import { parse } from "node-html-parser";

// In the transform:
const root = parse(content);
const seenTerms = new Set(); // first-occurrence tracking per page

function walkTextNodes(node, glossaryTerms) {
  // Skip elements where term highlighting is inappropriate
  const skip = ["script", "style", "code", "pre", "a", "abbr"];
  if (node.tagName && skip.includes(node.tagName.toLowerCase())) return;

  for (const child of [...node.childNodes]) {
    if (child.nodeType === 3) { // TEXT_NODE
      // ... detect and replace terms in child.rawText
    } else {
      walkTextNodes(child, glossaryTerms);
    }
  }
}
```

The `[...node.childNodes]` snapshot avoids mutation-during-iteration issues when replacing nodes.

**Confidence:** HIGH — API confirmed from Context7 and GitHub README inspection.

---

## Tooltip Implementation: HTML `popover` attribute + small JS enhancement

### Recommended approach: `popover` attribute (HTML-first) with JS hover enhancement

**No new npm dependencies for the tooltip UI.**

The tooltip markup injected by the transform is self-contained HTML + CSS. A small inline `<script>` (or an addition to the existing Vite-bundled entry point) wires hover behavior. The Popover API is the correct platform primitive here.

#### HTML structure injected per matched term

```html
<button class="gloss-trigger" popovertarget="gloss-costa">costa</button>
<span id="gloss-costa" popover role="tooltip" class="gloss-popover">
  <strong>costa</strong>
  <img src="https://pnwmoths.b-cdn.net/glossary/costa_jpg.jpg?width=188&height=225&crop_gravity=north"
       alt="costa" width="188" height="225" loading="lazy">
  <p>The leading edge of the wing.</p>
</span>
```

**Why `<button>` not `<abbr>`:** `<abbr title="...">` is semantically correct for abbreviation expansion but limited: the `title` attribute tooltip is browser-native (not styleable, no image support), and `<abbr>` has no built-in click/focus trigger for a richer popover. `<button popovertarget>` with `role="tooltip"` on the popover gives full keyboard accessibility, is screen-reader-announced, and allows arbitrary rich content (definition + image).

**Why Popover API not a custom Lit component:** The tooltip trigger is injected into prose HTML at build time — the prose is a plain `<div>` rendered by Markdown, not inside a Lit component's template. Injecting a custom element for each glossary term would add significant DOM weight and require the component registry to be loaded before prose renders. The Popover API gives 100% of the needed behavior (show/hide, keyboard Escape, focus management) without component overhead.

**No-JS degradation:** Without JavaScript, `<button popovertarget>` still renders the term text as a button in the prose, but clicking it does nothing (the popover API requires JS to open programmatically when using `popovertarget`). The term itself is still readable in context. This satisfies the "graceful no-JS degradation" requirement — the term is visible, just not interactively highlighted.

For a cleaner no-JS fallback, the `<button>` can be wrapped in an `<abbr>` with `title` set to the definition (truncated), so keyboard and mouse users without JS still see the native browser tooltip on hover/focus.

#### Browser support

- **Popover API** (basic `popover` attribute + `popovertarget`): Baseline Widely Available since April 2025. Works in Chrome, Firefox, Safari, Edge — no polyfill needed.
- **`popover="hint"` + `interestfor`** (hover-trigger without JS): Chrome 142+ only as of April 2026; WebKit has objected; not cross-browser. Do not use.
- **CSS Anchor Positioning** (auto-placement): Chrome/Edge only in 2026; Safari/Firefox support incomplete. Do not use for initial positioning — use a small JS snippet instead.

#### Hover behavior: small JS script

The Popover API `popovertarget` is click-to-toggle. For hover, 15–20 lines of vanilla JS are sufficient:

```js
// Glossary hover behavior — added to existing JS entry point or inline
document.querySelectorAll(".gloss-trigger").forEach(btn => {
  const popover = document.getElementById(btn.getAttribute("popovertarget"));
  if (!popover) return;
  btn.addEventListener("mouseenter", () => popover.showPopover());
  btn.addEventListener("mouseleave", () => popover.hidePopover());
  btn.addEventListener("focus", () => popover.showPopover());
  btn.addEventListener("blur", () => popover.hidePopover());
});
```

This goes into the existing Vite entry point or a new `src/components/glossary-tooltips.js` module imported from `species.njk`. No npm dependency required — Floating UI is not needed because the popover auto-positions to not clip viewport by default, and for prose tooltips exact anchor positioning is a nice-to-have, not a requirement.

**Confidence for Popover API browser support:** HIGH — confirmed from MDN and multiple 2025 sources.
**Confidence for `interestfor` exclusion:** HIGH — Chrome 142+ only, WebKit objection confirmed.

---

## CSS: Popover Styling

Add to `src/styles/theme.css` (already passes through to `_site/`). No new file needed.

```css
/* Glossary term trigger — inline button styled as underlined text */
.gloss-trigger {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  color: inherit;
  cursor: help;
  text-decoration: underline dotted;
  text-underline-offset: 3px;
}

/* Popover card */
.gloss-popover {
  width: 220px;
  padding: 0.75rem;
  border: 1px solid var(--pico-border-color);
  border-radius: var(--pico-border-radius);
  background: var(--pico-background-color);
  box-shadow: 0 4px 12px rgb(0 0 0 / 15%);
  font-size: 0.875rem;
}

.gloss-popover img {
  width: 100%;
  height: auto;
  margin-bottom: 0.5rem;
}
```

Pico CSS design tokens (`--pico-border-color`, `--pico-background-color`, etc.) are already available site-wide via `theme.css`. No additional CSS dependency needed.

---

## Data Flow Through the Transform

The transform needs the flat glossary term list (not the grouped-by-letter version used by the glossary page template). The grouped structure in `src/_data/glossary.js` is consumed by Nunjucks templates. For the transform, a flat array sorted by term length (longest first, to prevent "forewing" matching before "wing") is more useful.

**Option A:** Add a second export from `src/_data/glossary.js` — rejected because Eleventy data files export a single value.

**Option B:** Import the DuckDB query result directly inside `eleventy.config.js` — workable but couples config to data pipeline.

**Option C (recommended):** Add `src/_data/glossaryFlat.js` as a companion data file that returns a flat array:

```js
// src/_data/glossaryFlat.js
// Flat list of all glossary terms for build-time transform use.
// Sorted by term length descending (longest first) to prevent partial matches.
import { DuckDBInstance } from "@duckdb/node-api";

export default async function () {
  const db = await DuckDBInstance.create(":memory:");
  const conn = await db.connect();
  // ... same query as glossary.js but returns flat array, sorted by length desc
  conn.closeSync();
  db.closeSync();
  return terms; // [{ term, definition, image_filename, photographer, slug }, ...]
}
```

Then in `eleventy.config.js`, access via the Eleventy data cascade (available to transforms via `eleventyConfig.addGlobalData` or by importing the module directly):

```js
// Import once at module level (runs before Eleventy starts):
import { default as loadGlossaryFlat } from "./src/_data/glossaryFlat.js";

export default async function (eleventyConfig) {
  const glossaryTerms = await loadGlossaryFlat();
  // Sort longest-first to prevent partial-match priority inversion
  glossaryTerms.sort((a, b) => b.term.length - a.term.length);

  eleventyConfig.addTransform("glossary-terms", function (content) {
    if (!this.page.outputPath?.endsWith(".html")) return content;
    // Only run on species pages
    if (!this.page.url?.startsWith("/species/")) return content;
    return injectGlossaryTerms(content, glossaryTerms);
  });
}
```

**Why import directly rather than Eleventy data cascade:** Transforms run during the build phase where template data is not available via `this.ctx`. Importing the module directly is the correct pattern — it runs the DuckDB query once at startup, not per-page.

**Confidence:** MEDIUM — the transform `this.ctx` data availability in Eleventy 3.x is not explicitly documented for transforms; direct import is the safe, verified pattern.

---

## What NOT to Add

| Temptation | Why Not |
|------------|---------|
| Floating UI (`@floating-ui/dom`) | Smart repositioning is nice-to-have; 20 lines of JS + native popover auto-positioning is sufficient for v2.0 |
| `tippy.js` | Third-party tooltip library with its own lifecycle; the Popover API is the platform-native equivalent with better accessibility defaults |
| `cheerio` | Heavier than node-html-parser; jQuery-style API adds no benefit for this tree-walking task |
| `jsdom` | Full browser simulation — ~15× heavier than needed for a build-time string transform |
| `rehype` / unified pipeline | Correct choice for a Markdown-first pipeline, but this project's prose is rendered via `{% renderFile %}` (Eleventy's built-in Markdown engine); adding a parallel unified pipeline would duplicate processing |
| `mark.js` (client-side) | Runs in the browser, not at build time — requires shipping term list to every page and running regex at page load; contradicts the build-time requirement |
| Lit web component for each tooltip trigger | Adds component instantiation overhead for every term occurrence; popover + vanilla JS is lighter and correct for inline prose |
| `popover="hint"` + `interestfor` | Chrome 142+ only; WebKit objection; not cross-browser in 2026 |
| CSS Anchor Positioning for auto-placement | Incomplete browser support (Chrome/Edge only in 2026) |
| `abbr` as the only mechanism | `<abbr title>` tooltip is not styleable, cannot contain images, not reliably accessible on touchscreen |

---

## Version Summary

| Addition | Version | Purpose |
|----------|---------|---------|
| `node-html-parser` | `^7.1.0` | Parse rendered HTML string in Eleventy transform; walk text nodes; inject tooltip markup |
| Popover API (browser-native) | Baseline April 2025 | Tooltip show/hide, keyboard Escape, focus management — no npm dep |
| ~20-line vanilla JS | — | Wire hover/focus events to `showPopover`/`hidePopover` |

**No other npm dependencies are needed.** The existing DuckDB connection pattern, Eleventy transform API, Vite entry point, and Pico CSS token system handle everything else.

---

## Sources

- Eleventy 3.x `addTransform` API: Context7 `/11ty/eleventy`, topic "html transform addTransform" (HIGH confidence)
- node-html-parser v7.1.0: [npm](https://www.npmjs.com/package/node-html-parser), [GitHub README](https://github.com/taoqf/node-html-parser/blob/main/README.md), Context7 `/taoqf/node-html-parser` (HIGH confidence)
- Popover API browser support (Baseline April 2025): [MDN Popover API](https://developer.mozilla.org/en-US/docs/Web/API/Popover_API), [365i Popover API Guide](https://www.365i.co.uk/blog/2025/03/10/popover-api-guide-create-modals-and-tooltips-without-javascript-in-2025/) (HIGH confidence)
- `popover="hint"` / `interestfor` Chrome-only status: [Chrome for Developers blog](https://developer.chrome.com/blog/popover-hint), [CSS-Tricks Interest Invoker API](https://css-tricks.com/a-first-look-at-the-interest-invoker-api-for-hover-triggered-popovers/), [blink-dev mailing list](https://www.mail-archive.com/blink-dev@chromium.org/msg14657.html) (HIGH confidence — Chrome 142+ only, WebKit objection confirmed)
- Frontend Masters Popover tooltip article (hover JS pattern, image in popover): [frontendmasters.com](https://frontendmasters.com/blog/using-the-popover-api-for-html-tooltips/) (MEDIUM confidence)
- Codebase inspection: `eleventy.config.js`, `src/_data/glossary.js`, `src/species/species.njk`, `src/glossary/index.njk`, `data/glossary.csv`, `package.json`

---
*Stack research for: pnwmoths v2.0 Glossary Tooltips milestone*
*Researched: 2026-04-23*
