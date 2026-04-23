# Pitfalls: Build-Time Glossary Term Injection and Tooltip Display

**Domain:** Eleventy 3.x static site — adding build-time glossary highlighting with tooltip/popover to existing Markdown species prose
**Researched:** 2026-04-23
**Confidence:** HIGH (grounded in existing codebase; verified against Eleventy, Pagefind, and Pico CSS docs)

---

## Critical Pitfalls

### Pitfall 1: Regex replacement mutates HTML attributes and tag names, not just text

**What goes wrong:**
A naive `content.replace(/\bFringe\b/gi, '<abbr ...>Fringe</abbr>')` applied to fully-rendered HTML will match inside attribute values and tag names. For example, a glossary term like "Cell" could corrupt `<section>`, "Abdomen" could match inside an `alt="Abdomen of Manduca sexta"` attribute, and "Anal angle" could mutate the text inside an existing `<a>` tag's `href` if the term somehow appears there. More subtly, terms that are substrings of HTML keywords (e.g., "Cell" → corrupts CSS class names containing "cell") produce silent mis-renders with no build error.

A real example from the glossary: the term "W-mark" contains a hyphen; the term "1A+2A" contains digits and a plus sign; "CuA1", "M1", "M2", "M3" look like abbreviations. A `\b` word-boundary regex treats `+` as a boundary but `1A+2A` as a whole unit only if escaped carefully. Incorrect escaping causes zero matches (silent miss) or too-broad matches.

**Why it happens:**
`addTransform` in Eleventy receives the complete rendered HTML string — `<!DOCTYPE html>...<html>...<body>...`. There is no DOM context. String `replace` does not distinguish text nodes from attributes.

**Consequences:**
- Corrupted attribute values produce invalid HTML that the browser silently repairs, causing visual defects or broken links with no build error
- Glossary wrapping inside existing `<a>` tags creates invalid nested anchors (`<a><abbr>...</abbr></a>` is fine, but if the term is the link text and also wrapped as a click target, UX is broken)
- Non-reproducible defects: depends on order of glossary terms being applied

**Prevention:**
Use a proper HTML tree parser, not string regex. PostHTML (`posthtml` + `posthtml-parser`, already a transitive dependency of Eleventy's HTML transform pipeline) walks the AST and exposes text nodes as plain strings — you can safely run regex replacement only on text node strings, never on tag names or attribute values. The walk pattern is:

```javascript
import posthtml from 'posthtml';

function glossaryPlugin(terms) {
  return (tree) => {
    tree.walk((node) => {
      // Only process string (text) nodes, never tag objects
      if (typeof node === 'string') {
        return applyGlossaryTerms(node, terms);
      }
      return node;
    });
  };
}
```

`applyGlossaryTerms` returns a PostHTML AST fragment (array of strings and tag objects), not a raw HTML string, so the result integrates safely back into the tree.

**Alternative (lower confidence):** If PostHTML is not used, apply the regex only to the content inside the prose container (e.g., extract the `<div class="prose">` block with a conservative outer regex, apply inner replacements, then reinject). This is fragile and not recommended.

**Phase:** Transform implementation phase (the architectural decision about parser vs. regex must be made before any code is written)

---

### Pitfall 2: First-occurrence state leaks between pages when transform state is shared

**What goes wrong:**
The transform for "first-occurrence-per-page" tracking requires a `Set` of already-seen terms, reset for each page. If the Set is declared in module scope (outside the transform function) or closed over in a way that persists across Eleventy's concurrent page renders, term X will be marked "seen" on page A and skipped on page B, C, D, etc. The result is that only the first page processed (arbitrary order) gets the glossary link for each term; all others get none.

Eleventy v3 triggers event callbacks in parallel (documented). Transforms are called per-page but the execution model does not guarantee serial invocation. Module-level mutable state is not safe.

**Why it happens:**
JavaScript module scope is shared across all invocations within the same Node.js process. An `addTransform` callback that uses a `let seen = new Set()` declared outside returns a closure over a single shared Set rather than per-page isolation.

**Consequences:**
Silent correctness failure: most pages lose all glossary links. No build error. Only visible by comparing rendered HTML output across pages.

**Prevention:**
Initialize the seen-terms Set inside the transform function, not in the closure's outer scope:

```javascript
eleventyConfig.addTransform('glossary', function(content) {
  if (!(this.page.outputPath || '').endsWith('.html')) return content;
  // Fresh Set per invocation — safe even if transforms run concurrently
  const seen = new Set();
  return applyGlossary(content, glossaryTerms, seen);
});
```

The glossary terms array itself (read-only) can safely live at module scope. Only the mutable per-page state (the seen Set) must be scoped to the function call.

**Phase:** Transform implementation phase

---

### Pitfall 3: Transform runs on every HTML page, not only species pages with prose

**What goes wrong:**
`addTransform` runs on every output file matching `.html` — including the glossary index page itself, the browse page, the search page, and the home page. Two problems arise:

1. **Performance:** Parsing and walking the HTML AST for 1,348 species pages + all other site pages costs time even when prose is absent. Only ~11 of 1,364 pages currently have prose files; the other 1,353 pages have no glossary terms to inject.

2. **Glossary page self-corruption:** The glossary index (`/glossary/index.html`) contains every definition text. Running the transform on it would inject `<abbr>` wrappers around the first occurrence of each term inside the definition itself — semantically wrong (definitions should not be linked back to the glossary) and visually broken (tooltip-on-tooltip).

**Why it happens:**
`addTransform` applies universally unless you guard with `outputPath`.

**Consequences:**
- Wasted parse time on 1,300+ prose-less pages (adds seconds to build on GHA)
- Glossary page gets recursive self-links on every definition

**Prevention:**
Two guards are needed:

```javascript
eleventyConfig.addTransform('glossary', function(content) {
  const path = this.page.outputPath || '';
  // Only .html pages
  if (!path.endsWith('.html')) return content;
  // Skip glossary page itself
  if (path.includes('/glossary/')) return content;
  // Skip pages with no prose marker — check for prose container or species class
  if (!content.includes('class="species-prose"')) return content;
  // ... apply transform
});
```

Adding a distinctive class (e.g., `class="species-prose"`) to the `{% renderFile %}` container in `species.njk` provides a fast string-scan bail-out before invoking the full PostHTML parse.

**Phase:** Transform implementation phase; species.njk template update phase

---

### Pitfall 4: Tooltip definition text is indexed by Pagefind, polluting search results

**What goes wrong:**
After wrapping, a species page contains injected HTML like:

```html
<abbr data-tooltip="a longitudinal, unbranched vein that extends...">Anal vein</abbr>
```

If the tooltip definition is rendered as visible DOM content (e.g., in a `<span>` inside the `<abbr>`, not a CSS pseudo-element), Pagefind will index it as page content. Search results for "Pagefind" species pages will include fragments of glossary definitions — confusing and inflating index size. Even with Pico CSS's `data-tooltip` (CSS-only, pseudo-element), the attribute value itself is not indexable. But if you choose a JS-driven tooltip that renders a `<div>` with the definition into the DOM, that content will be indexed.

**Why it happens:**
Pagefind indexes visible text in the HTML body. It respects `data-pagefind-ignore` on elements and their children, but it does not ignore attribute values by default. CSS-only tooltips (definition in `data-tooltip` attribute) are safe. JS-rendered DOM tooltips (definition in a child element) are unsafe unless explicitly excluded.

**Consequences:**
- Search results for species pages show definition fragments as excerpts
- Index grows larger, slowing search queries

**Prevention:**
Either:
- Use CSS-only approach (Pico CSS `data-tooltip` attribute — puts content in `::before` pseudo-element, never in DOM, never indexed)
- OR for JS-rendered tooltips, add `data-pagefind-ignore` to every tooltip container element
- OR add a `pagefind.yml` `exclude_selectors` entry for the tooltip class/element

Pico CSS approach preferred: `<abbr data-tooltip="...">term</abbr>` with Pico loaded — zero JS, zero Pagefind risk, graceful no-JS degradation (the term renders as plain text with a dotted underline; tooltip appears on hover).

Additionally, verify by running `pagefind --site _site` after a sample build and checking that species page excerpts in the index do not contain definition text.

**Phase:** Tooltip implementation choice (architectural decision, Phase 1 of implementation)

---

### Pitfall 5: Pico CSS `data-tooltip` uses CSS-only hover — fails on mobile touch and keyboard navigation

**What goes wrong:**
Pico CSS implements tooltips with `[data-tooltip]:hover::before` and `[data-tooltip]:hover::after` pseudo-elements. On mobile (touch), there is no hover state — tapping does not show the tooltip, and there is no tap-to-dismiss. Keyboard users (Tab to focus, then what?) cannot easily trigger hover-only content.

Additionally, the Pico issue tracker (closed Feb 2024) confirms inline element tooltips "do not work on mobile at all." The BOIA accessibility guide notes `<abbr title="...">` with tooltip is only accessible to mouse users, not keyboard or touch users.

For a natural history reference site with glossary terms that are important for understanding content, hover-only access is a real accessibility gap.

**Why it happens:**
Pure CSS `:hover` tooltips have no touch or keyboard equivalent without additional JavaScript.

**Consequences:**
- Mobile users (likely the majority) cannot access glossary definitions inline
- WCAG 1.4.13 (Content on Hover or Focus) requires content triggerable by keyboard focus — CSS-only hover violates this
- Screen reader users get no definition from the tooltip (Pico tooltip is a pseudo-element, invisible to AT)

**Prevention options (in order of preference):**

1. **Hybrid: CSS hover + JS popover fallback.** Use Pico `data-tooltip` for mouse hover, add a small JS snippet that intercepts `click` and `focus` events on `<abbr>` elements and shows the definition in a native `popover` element anchored to the term. The native Popover API is now Baseline across all major browsers (2024). This satisfies WCAG 1.4.13 and works on touch.

2. **CSS-only with `<details>/<summary>` fallback.** Wrap each glossary term in a `<details>` that shows definition on expand. Accessible but visually disruptive.

3. **Link to glossary page.** Instead of a tooltip, wrap the first occurrence as `<a href="/glossary/#term-slug">term</a>`. Fully accessible; no JS needed; no CSS concerns. But changes the reading experience (navigation rather than inline definition).

The roadmap should explicitly plan for the accessibility gap and decide which approach to implement before writing tooltip CSS.

**Phase:** Tooltip design phase (before any template/transform work)

---

### Pitfall 6: Pico CSS `data-tooltip` pseudo-elements are clipped by `overflow:hidden` ancestors

**What goes wrong:**
Pico CSS tooltips use `position: absolute` `::before`/`::after` pseudo-elements placed relative to the target element. If any ancestor element has `overflow: hidden` or `overflow: auto`, the tooltip pseudo-element is clipped at that ancestor's boundary and partially or fully hidden. This is a fundamental CSS limitation: absolutely positioned children can escape their direct parent but not a clipping ancestor.

In the current `theme.css`, `.content-wrapper` has no `overflow` property set, so this is not currently a problem. But `nav` has `overflow: auto` in `theme.css`, and if any prose is rendered inside a scroll container in the future, tooltips will be clipped.

**Why it happens:**
CSS absolute positioning escapes the nearest positioned ancestor, but clipping contexts (from `overflow` other than `visible`) cut off pseudo-elements that extend outside the container boundary.

**Consequences:**
Tooltips silently clip or disappear at container boundaries with no error. Hard to detect without manual visual testing at every use location.

**Prevention:**
- Review every ancestor of the species prose container for `overflow` values before settling on a CSS-only tooltip approach
- If using JS-rendered popover (native Popover API), the popover escapes all clipping contexts by rendering in the top layer — this is the architecturally correct solution for complex page structures
- Add a CSS rule to the prose wrapper that explicitly sets `overflow: visible` if needed
- For the current structure (prose inside `.content-wrapper` with default overflow), CSS tooltips are likely fine; flag as risk if layout changes

**Phase:** Tooltip implementation phase; flag for visual regression testing

---

### Pitfall 7: Terms with special regex characters break the match pattern

**What goes wrong:**
The glossary contains terms with regex metacharacters:
- `1A+2A` — the `+` is a quantifier in regex
- `W-mark` — the `-` inside `[...]` character classes is a range indicator
- `CuA1`, `M1`, `M2`, `M3` — purely alphanumeric but look like abbreviations; `\b` word boundaries around them may behave unexpectedly if they appear adjacent to punctuation like `(M1)` in prose

If glossary terms are used directly in `new RegExp(term)` without escaping, the term `1A+2A` produces a regex pattern `1A+2A` which matches "1A" followed by one or more "A"s then "2A" — a very different match.

Additionally, `\b` word boundaries do not work as expected at boundaries between alphanumeric and special characters: `\b1A\b` will not match "1A" in the string "(1A+2A)" because `(` is a non-word character and `1` is a word character, so `\b` exists before `1`, but `+` is also non-word, so `\b` exists after `A` in `1A` — actually `\b1A\b` matches "1A" inside "(1A+2A)". This needs careful testing.

**Why it happens:**
`new RegExp(term, 'gi')` uses the term string as a raw regex pattern. Metacharacters are interpreted as regex syntax, not literal characters.

**Consequences:**
- Terms with `+` produce wrong matches or runtime regex errors
- Terms without proper boundary handling match inside longer words (e.g., "Anal" matches inside "Analis" or "Anally")

**Prevention:**
Always escape terms before use in RegExp:

```javascript
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const pattern = new RegExp(`(?<![\\w])${escapeRegex(term)}(?![\\w])`, 'gi');
```

Use a negative lookbehind/lookahead for word boundaries instead of `\b` for terms that start or end with non-word characters like `+`.

Test every term in the glossary that contains non-alpha characters: `1A+2A`, `W-mark`, `CuA1`, `M1`, `M2`, `M3`.

**Phase:** Transform implementation phase (unit test the regex builder with special-character terms)

---

### Pitfall 8: Wrapping nested inline elements produces invalid HTML

**What goes wrong:**
If a term appears inside an existing `<em>`, `<strong>`, or `<a>` element in the species prose, and the transform naively wraps it in `<abbr>`, the result can be a nested inline element that is valid HTML — but wrapping across element boundaries is invalid. For example:

```markdown
The *anal vein* runs from base to margin.
```

Renders as:
```html
The <em>anal vein</em> runs from base to margin.
```

A PostHTML text-node walk correctly handles this: `"anal vein"` is a single text node inside `<em>`, so wrapping it produces `<em><abbr data-tooltip="...">anal vein</abbr></em>` — valid. But if the term spans a tag boundary (unlikely with short glossary terms), the walk cannot wrap across nodes.

The larger risk is wrapping the first occurrence when it is already inside an `<a href="...">` that links elsewhere. Producing `<a href="/species/foo/"><abbr data-tooltip="...">term</abbr></a>` is valid HTML but may produce confusing UX (link + tooltip trigger on the same word). If the term is inside an existing glossary link (`<a href="/glossary/#term">term</a>`), adding an `<abbr>` wrapper is redundant.

**Prevention:**
In the PostHTML walk, skip text nodes whose parent node is:
- An `<a>` element (avoid link-inside-tooltip or tooltip-inside-link ambiguity)
- An existing `<abbr>` element (already wrapped)
- A `<dt>`, `<th>`, `<h1>`–`<h6>` heading (avoid wrapping in structural labels)

Check the parent in the walk callback using a node context stack or PostHTML's `match` API with parent inspection.

**Phase:** Transform implementation phase

---

## Moderate Pitfalls

### Pitfall 9: `outputPath` is `false` for pages with `permalink: false` — crashes endsWith check

**What goes wrong:**
The standard transform guard `if (outputPath.endsWith('.html'))` throws `TypeError: outputPath.endsWith is not a function` for any template with `permalink: false`, because `outputPath` is the boolean `false`. This is a documented Eleventy gotcha (Issues #653, #897).

None of the current templates use `permalink: false`, but it is a risk if any new templates are added. The transform will crash the build.

**Prevention:**
Always use the null-coalescing guard pattern:

```javascript
if (!(this.page.outputPath || '').endsWith('.html')) return content;
```

**Phase:** Transform implementation phase (use the safe pattern from day one)

---

### Pitfall 10: Glossary terms match inside `<script>` and `<style>` blocks

**What goes wrong:**
A PostHTML text-node walk processes all text nodes, including the text content of inline `<script type="application/json">` and `<style>` elements. If a glossary term appears in a JSON data block (e.g., species name in the taxon JSON blob) or in a CSS rule embedded in the glossary page's `<style>`, the walk will attempt to wrap it in an `<abbr>`, producing invalid JSON or CSS.

In the current codebase: `species.njk` contains an inline `<script type="module">` block and the glossary page has an inline `<style>`. These must be excluded.

**Prevention:**
In the PostHTML walk, skip all content inside `<script>` and `<style>` elements:

```javascript
tree.walk((node) => {
  if (node.tag === 'script' || node.tag === 'style') {
    return node; // return unchanged — PostHTML will not descend into returned nodes
  }
  if (typeof node === 'string') {
    return applyGlossaryTerms(node, terms);
  }
  return node;
});
```

Note: PostHTML's `walk` does descend into children by default. The correct pattern to prevent descent is to return the node from the callback without recursing — verify this against the posthtml-parser version in use.

**Phase:** Transform implementation phase

---

### Pitfall 11: Case-insensitive matching produces wrong-case display text

**What goes wrong:**
A case-insensitive match (`/anal vein/gi`) will replace "Anal vein" (sentence-case, start of prose) and "anal vein" (mid-sentence). If the replacement uses the canonical glossary term spelling, it may change the displayed text. For example, if prose says "the ANAL VEIN" and the replacement wraps with `>Anal vein</abbr>`, the text changes from uppercase to title case in the HTML output.

**Prevention:**
Use the original matched text (capture group `$0` in string replace, or the matched string in regex exec) as the display text, not the canonical glossary term:

```javascript
content.replace(pattern, (match) => `<abbr data-tooltip="${escapeHtmlAttr(definition)}">${match}</abbr>`);
```

This preserves the original text casing while using the canonical definition in the tooltip.

**Phase:** Transform implementation phase

---

### Pitfall 12: Glossary term matching in species scientific names and headings is undesirable

**What goes wrong:**
Species prose headings like `## Habitat` and `## Life History` are rendered as `<h2>` tags. Scientific names like *Habrosyne scripta* appear in `<em>` or as plain text. Glossary terms that happen to match substrings of scientific names (e.g., "Cell" matching in "Cellfoo") are filtered by word-boundary regex, but anatomical terms that exactly match substrings of common names or heading text will be incorrectly highlighted. For example, if "Anal" is a term and a heading reads "Anal Region Anatomy," the heading would be wrapped.

**Prevention:**
In the PostHTML walk, skip text nodes inside heading elements (`<h1>`–`<h6>`) and inside `<em>/<i>` that is a direct child of `<p>` at the start (which conventionally indicates a scientific name in this codebase). More practically, only apply the transform to text inside specific containers by scoping the walk to nodes under a designated prose container.

**Phase:** Transform implementation phase; requires coordination with Markdown rendering structure

---

### Pitfall 13: Tooltip z-index or stacking context conflict with future page elements

**What goes wrong:**
Pico CSS tooltips position absolutely relative to the inline element. Their z-index is controlled by Pico's internal CSS custom property (`--pico-tooltip-z-index` or similar). If a future page element (image slideshow overlay, a modal, a sticky navigation bar) establishes a new stacking context with a higher z-index, the tooltip will appear behind it.

In the current site, `pnwm-image-slideshow` uses Lit (shadow DOM components). Shadow DOM creates an isolated stacking context. If the slideshow section appears below prose on the page and a tooltip near the bottom of the prose overlaps the slideshow, the shadow DOM's own z-index context may clip or obscure the tooltip.

**Prevention:**
- Inspect the rendered species page with browser devtools to verify tooltip z-index is above `pnwm-image-slideshow`
- If using the native Popover API for JS-driven tooltips, popovers render in the top layer (above all z-index stacking contexts, above shadow DOM) — this is the architecturally correct solution for z-index concerns
- Add a theme.css override if Pico's tooltip z-index is insufficient: `[data-tooltip]::before, [data-tooltip]::after { z-index: 1000; }`

**Phase:** Tooltip implementation phase; visual testing on species pages with photos

---

### Pitfall 14: Build performance — parsing 1,348 HTML pages through PostHTML costs measurable time

**What goes wrong:**
The transform runs on every `.html` output file. With bail-out guards (Pitfall 3), only pages containing species prose actually incur PostHTML parse+walk cost. Currently ~11 pages have prose files. But as prose coverage grows toward the full 1,348 species, the transform will run on all species pages. Each page is approximately 20–30 KB of HTML. PostHTML parse is documented as slower than lightweight parsers (node-html-parser runs at ~2 ms/file vs. PostHTML at potentially 5–10 ms/file).

At full scale: 1,348 pages × 8 ms average = ~11 seconds added to the Eleventy build. With the existing MAINT-03 concern (build time target under 5 minutes), this could be significant.

**Prevention:**
- Use the bail-out guard for pages without prose (Pitfall 3) — reduces the cost to ~0 for prose-less pages
- If performance becomes a problem at scale, consider moving the glossary transform to a Nunjucks filter applied only inside the `{% renderFile %}` block rather than a global `addTransform`. This scopes transformation to the prose HTML fragment before it is embedded in the full page — smaller input, faster processing
- Benchmark: run `DEBUG=Eleventy:TemplateContent eleventy --to=json` and compare build time with/without the transform
- The MAINT-03 threshold (5 min GHA) should be re-tested after adding the transform

**Phase:** Transform implementation phase; performance validation against MAINT-03

---

### Pitfall 15: Pico CSS `data-tooltip` conflicts with existing `[data-tooltip]` or `[title]` uses in the site

**What goes wrong:**
Pico CSS applies tooltip styles globally to any element with `[data-tooltip]`. If any existing templates already use `data-tooltip` or `title` attributes on elements for other purposes (e.g., describing image credits or navigation hints), they will now acquire Pico tooltip styling and show popup text they were not designed for. The Pico tooltip CSS is a global rule — it does not require an opt-in class.

**Why it happens:**
Pico classless mode applies styles to semantic HTML elements and attribute selectors globally.

**Prevention:**
- Audit all templates for existing `data-tooltip` or `title` attribute usage before implementing
- If conflicts are found, use a custom class-based approach instead of Pico's attribute selector (e.g., add a `.gloss-term` class to the `<abbr>` and write custom tooltip CSS scoped to `.gloss-term`)
- The `<abbr>` element itself triggers Pico's dotted underline style; verify this is desired

**Phase:** Before tooltip CSS implementation; template audit step

---

## Phase-Specific Warnings

| Phase | Pitfall | Mitigation |
|-------|---------|------------|
| Architectural decision: parser vs. regex | #1 (attribute mutation) | Decide PostHTML walk before writing any transform code |
| Tooltip design: CSS vs. JS | #5 (mobile/keyboard accessibility), #4 (Pagefind indexing), #6 (overflow clipping), #13 (z-index) | All four interact — choose approach once, not piecemeal |
| Transform code: state management | #2 (shared state), #9 (outputPath false) | Write unit tests for state isolation before integration |
| Transform code: text node processing | #7 (regex metacharacters), #8 (nested elements), #10 (script/style), #11 (case), #12 (headings) | Test each with a fixture HTML string before wiring into build |
| Integration: Pagefind | #4 (definition text indexed) | Run pagefind after first build with transform; inspect excerpt output |
| Integration: Pico CSS | #15 (attribute conflicts), #5 (mobile), #6 (overflow) | Visual test on mobile viewport; keyboard Tab navigation test |
| Performance: MAINT-03 | #14 (build time), #3 (runs on all pages) | Benchmark before and after; add bail-out guard immediately |

---

## Integration Gotchas Specific to This Stack

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|-----------------|
| Eleventy `addTransform` | Module-scope `Set` for first-occurrence tracking | Initialize Set inside the transform callback, not outside |
| Eleventy `addTransform` | Forgetting `outputPath || ''` null guard | Always use `(this.page.outputPath || '').endsWith('.html')` |
| Eleventy `addTransform` | Running on glossary page | Guard with `path.includes('/glossary/')` exclusion |
| PostHTML walk | Descending into `<script>` and `<style>` | Return node unchanged when `node.tag === 'script' || node.tag === 'style'` |
| Regex in transform | Using term string directly in `new RegExp(term)` | Always escape via `str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')` |
| Regex in transform | Replacing with canonical term text, changing displayed case | Use `(match) => \`<abbr ...>${match}</abbr>\`` — preserve original match |
| Pagefind integration | JS-rendered tooltip `<div>` inside body gets indexed | Use CSS-only `data-tooltip` attribute or add `data-pagefind-ignore` to tooltip container |
| Pico CSS `data-tooltip` | Assumes definition fits in one line of a tooltip | Test with long definitions (the glossary has multi-sentence definitions); consider truncating |
| Pico CSS `data-tooltip` | Hover-only — no touch/keyboard access | Add JS popover or link-to-glossary fallback for accessibility |
| Pico CSS classless | `[data-tooltip]` rule is global — conflicts with existing `title`/`data-tooltip` uses | Audit templates; consider scoping to `.gloss-abbr` class |
| GitHub Pages build | MAINT-03 (5 min target) threatened by per-page HTML parse | Add prose-presence bail-out guard; benchmark in CI |

---

## Sources

- `/Users/rainhead/dev/pnwmoths/eleventy.config.js` — addTransform API context; Vite/Eleventy integration structure
- `/Users/rainhead/dev/pnwmoths/data/glossary.csv` — 149 terms including `1A+2A`, `W-mark`, `CuA1`, `M1–M3` (special regex chars)
- `/Users/rainhead/dev/pnwmoths/src/_data/glossary.js` — DuckDB glossary loader; slug/letter grouping
- `/Users/rainhead/dev/pnwmoths/src/species/species.njk` — `{% renderFile %}` prose injection; existing `data-pagefind-ignore` usage
- `/Users/rainhead/dev/pnwmoths/src/glossary/index.njk` — target exclusion page; inline `<style>` block
- `/Users/rainhead/dev/pnwmoths/src/styles/theme.css` — no overflow on `.content-wrapper`; `nav { overflow: auto }`; stacking context context
- `/Users/rainhead/dev/pnwmoths/.planning/PROJECT.md` — MAINT-03 build time concern; Pico CSS decision history; light DOM rationale
- [Eleventy Transforms docs](https://www.11ty.dev/docs/transforms/) — `this.page.outputPath` caution: may be false; transforms run per-page
- [Eleventy Issue #653/#897](https://github.com/11ty/eleventy/issues/653) — `outputPath.endsWith` crashes when `permalink: false`
- [Eleventy Discussion #2201](https://github.com/11ty/eleventy/discussions/2201) — "riskier" to regex-transform all HTML output; custom filter preferred for safety
- [PostHTML README](https://github.com/posthtml/posthtml) — AST walk: strings are text nodes, objects are tags; safe text-only replacement pattern
- [Pagefind Indexing docs](https://pagefind.app/docs/indexing/) — `data-pagefind-ignore`, `exclude_selectors`; children of ignored elements also excluded
- [Pagefind Config Options](https://pagefind.app/docs/config-options/) — `exclude_selectors` for CSS-selector-based exclusion from index
- [Pico CSS Tooltip docs](https://picocss.com/docs/tooltip) — `data-tooltip` + `data-placement`; CSS-only, no JS
- [Pico CSS Issue #184](https://github.com/picocss/pico/issues/184) — mobile tooltip fails: hover-only, touch not supported; closed Feb 2024
- [MDN Popover API](https://developer.mozilla.org/en-US/docs/Web/API/Popover_API) — Baseline Newly Available (all major browsers 2024); renders in top layer, escaping z-index and overflow clipping
- [BOIA: How the HTML abbr element improves accessibility](https://www.boia.org/blog/how-the-html-abbr-element-improves-accessibility) — tooltip accessible only to mouse users; keyboard and touch users cannot access
- [npm-compare: parse5 vs node-html-parser](https://npm-compare.com/cheerio,jsdom,node-html-parser,parse5) — node-html-parser 2 ms/file vs parse5 6.5 ms/file; performance context for 1,348-page builds

---
*Pitfalls research for: v2.0 Glossary Tooltips — build-time injection milestone*
*Researched: 2026-04-23*
