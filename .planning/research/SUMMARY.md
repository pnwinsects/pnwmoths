# Research Summary: v2.0 Glossary Tooltips

**Project:** pnwmoths — Glossary Tooltips milestone (GLOS-02)
**Domain:** Build-time HTML annotation with progressive-enhancement tooltip UI
**Researched:** 2026-04-23
**Confidence:** HIGH

## Executive Summary

This milestone adds build-time glossary term highlighting to species prose pages. All 150 glossary terms, definitions, and images already exist in `data/glossary.csv` and are accessible via DuckDB at build time. The core work is an Eleventy `addTransform` that runs after template rendering, walks prose text nodes using `node-html-parser`, wraps first occurrences of glossary terms in `<abbr>` elements carrying `data-definition` and `data-image-url` attributes, and returns the annotated HTML. The tooltip UI uses the browser-native Popover API (Baseline April 2025, no polyfill needed), styled with Pico CSS design tokens, enhanced with ~20 lines of vanilla JS for hover/focus behavior. No external tooltip library is needed.

The recommended approach is deliberate and conservative: build-time injection (not client-side scanning), `node-html-parser` for safe text-node traversal (not regex on raw HTML), native Popover API (not tippy.js or Floating UI), and `<abbr>` with `data-*` attributes (not inline `<template>` siblings or JSON fetches). This minimizes npm weight, avoids client-side layout shift, and keeps tooltip content out of the Pagefind index. The biggest implementation risks are in the transform itself: regex matching inside HTML attributes corrupts markup silently, shared mutable state between page renders causes silent first-occurrence failures, and terms with regex metacharacters (`1A+2A`, `W-mark`) break match patterns without escaping.

The overall scope is medium complexity. The transform logic is the hard part; the tooltip UI is straightforward. The work is naturally sequenced into three phases: (1) build the transform and verify correctness in isolation, (2) wire in the popover HTML structure and CSS, (3) add JS hover enhancement and glossary images. All three phases use well-documented patterns and can proceed without additional research.

---

## Key Findings

### Recommended Stack

The existing stack is unchanged. One new npm dependency is needed: `node-html-parser ^7.1.0`, for safe DOM-tree traversal inside the Eleventy transform. It is ~10x faster than JSDOM at build time, has zero native dependencies, and its `childNodes`/`TextNode` API is sufficient for this task. The tooltip UI requires no new npm dependencies: the Popover API is browser-native (Baseline April 2025), CSS uses existing Pico CSS design tokens, and hover behavior is ~20 lines of vanilla JS added to the existing Vite entry point.

Glossary data is loaded by reading `data/glossary.csv` directly via `csv-parse` (already a project dependency) inside `eleventy.config.js` at startup — not through DuckDB — to avoid a second DuckDB lifecycle. The data is shaped into a `Map<lowerTerm, { term, definition, imageUrl }>` and sorted longest-first to prevent partial matches ("forewing" before "wing").

**New dependencies:**
- `node-html-parser ^7.1.0` — parse rendered HTML string in Eleventy transform; walk text nodes; inject `<abbr>` markup. Cheerio, JSDOM, unified/rehype all rejected as heavier with no meaningful benefit.
- Popover API (browser-native, no npm) — tooltip show/hide, keyboard Escape, focus management.
- ~20 lines vanilla JS — wire hover/focus events to `showPopover`/`hidePopover`.

**Explicitly excluded:**
- Floating UI, tippy.js, Popper.js — unnecessary given native Popover API.
- `popover="hint"` + `interestfor` — Chrome 142+ only; WebKit objection confirmed; needs JS fallback for Firefox/Safari.
- CSS Anchor Positioning — safe for `@supports` progressive enhancement but not required for v2.0.
- Client-side term scanning (`mark.js`) — contradicts build-time requirement.

### Expected Features

**Must have (table stakes):**
- First-occurrence-only highlighting per page — Wikipedia convention; repeated highlights are visual noise.
- Popover shows definition text on hover and keyboard focus — the core value.
- Keyboard accessible (Tab + Escape) — WCAG requirement; Popover API provides this for free.
- No-JS degradation — `<abbr title="...">` provides native browser tooltip; glossary link as fallback.
- Popover dismisses on Escape and click outside — `popover="auto"` behavior, no JS needed.
- Consistent visual treatment — dotted underline matching Pico CSS `<abbr>` defaults.
- Build-time injection — 1,364 pages; client-side scanning adds JS weight and layout shift.

**Should have (differentiators):**
- Popover shows glossary image when available — ~50 of 150 terms have images; morphological terms are clearer with diagrams.
- CSS Anchor Positioning via `@supports` — auto-placement without JS; safe for progressive enhancement.
- Link-to-glossary as primary trigger — tapping the term on mobile navigates to the full glossary entry.
- Case-insensitive matching with multi-word support — "Anal angle", "Basal area", "Hair pencils" require longest-first ordering.
- Exclusion of code/pre/heading/existing-link contexts — prevents structural annotations.

**Defer (v2+):**
- Animated popover transitions (`@starting-style`, `allow-discrete`) — known to cause pixel-shifting jank in Safari with Popover API.
- Highlighting in browse page accordion descriptions — out of scope for this milestone.
- Stemming/plural matching (larva/larvae) — exact case-insensitive is correct for v2.0.
- `popover="hint"` + `interestfor` — requires JS fallback for Firefox/Safari; marginal UX gain.

**Anti-features (explicitly avoid):**
- Client-side JavaScript term scanning.
- Fuzzy/stemming-based matching.
- Async definition fetch on hover — definitions are static and already in the page.
- Modal-style definitions — `popover="auto"` auto-dismisses correctly.
- Regex applied to raw HTML string — corrupts attributes silently.
- Highlighting every occurrence — first-occurrence convention exists for good reasons.
- `data-pagefind-ignore` on `<abbr>` elements — that would remove the term from search index.

### Architecture Approach

The transform is the architecturally central piece. It runs as an Eleventy `addTransform` on every HTML output file, guarded first by file extension (`.html` only), second by a fast string scan for a prose-presence marker (`class="species-prose"` on the `{% renderFile %}` container in `species.njk`), and third by path exclusion for the glossary page itself. Only pages passing all three guards incur the `node-html-parser` parse cost. Inside the transform, `querySelectorAll('main p, main li, main h2, main h3')` scopes annotation to prose; `closest('dl')` and `closest('[data-pagefind-ignore]')` checks skip taxonomy and interactive sections. A fresh `Set` initialised per transform invocation (never at module scope) tracks seen terms across elements within a page. Terms are processed longest-first. The regex per term uses `escapeRegex` to handle metacharacters and lookbehind/lookahead instead of `\b` for terms starting or ending with non-word characters.

Tooltip content is embedded in `data-definition` and `data-image-url` attributes on `<abbr>` at build time — no runtime fetch, no inline `<template>`, no JSON blob. The JS hover enhancement reads these attributes at runtime to populate a native `<span popover>` element, which keeps definition text out of the DOM at build time and therefore out of the Pagefind index.

**Major components:**

1. `src/_lib/glossary-transform.js` — pure `applyGlossaryTerms(html, termMap)` function + `escapeRegex`, `escapeHtml` helpers; unit-testable in isolation.
2. `eleventy.config.js` modification — `async` export; `loadGlossaryTerms()` at startup via `csv-parse`; `addTransform` registration with three guards.
3. `src/styles/glossary-terms.css` — `.glossary-term` dotted underline, `.gloss-popover` card styling using Pico CSS design tokens.
4. `src/components/glossary-tooltip.js` — ~20-line vanilla JS hover/focus handler; reads `data-definition` and `data-image-url` from `<abbr>`; creates and manages `<span popover>`.
5. `src/species/species.njk` — add `class="species-prose"` wrapper to `{% renderFile %}` container (enables fast bail-out guard).

**Data flow:**

```
data/glossary.csv
  → loadGlossaryTerms() in eleventy.config.js (csv-parse, at startup)
      → Map<lowerTerm, {term, definition, imageUrl}> (sorted longest-first)
          → addTransform closure

species/species.njk + {% renderFile prose.md %}
  → full page HTML string
      → addTransform("glossary-terms"):
          guards → node-html-parser parse → text node walk
          → <abbr data-definition="..." data-image-url="...">term</abbr>
          → root.toString()
              → _site/species/{slug}/index.html

pagefind --site _site
  → indexes <abbr> text content normally; data-* attributes ignored
```

### Critical Pitfalls

1. **Regex on raw HTML corrupts attributes** — A naive `content.replace(/\bCosta\b/gi, ...)` will match inside `class="costa-strip"` or `alt="..."` attribute values. Prevention: always use `node-html-parser` to walk text nodes; never apply regex to the full HTML string. This architectural decision must be made before writing any transform code.

2. **Shared mutable state between page renders** — A `Set` declared at module scope persists across all page renders. Eleventy 3.x triggers transforms with potential concurrency. Result: only the first page processed gets glossary links; all others silently get none. Prevention: initialize the `seen` Set inside the transform callback, not in the closure's outer scope.

3. **Transform runs on glossary page, creating recursive self-links** — Without a guard, `/glossary/index.html` gets every definition wrapped in an `<abbr>` pointing back to itself. Prevention: add `path.includes('/glossary/')` exclusion as a second guard; add `class="species-prose"` bail-out as a third guard.

4. **Terms with regex metacharacters produce silent wrong matches** — `1A+2A` in `new RegExp('1A+2A')` means "1A, then one or more A's, then 2A". The glossary has `1A+2A`, `W-mark`, `CuA1`, `M1–M3`. Prevention: always escape via `str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')` before constructing `RegExp`. Unit-test every non-alpha term explicitly.

5. **Pico CSS `data-tooltip` fails on mobile and keyboard** — CSS `:hover` tooltips have no touch equivalent and violate WCAG 1.4.13. Prevention: do not use Pico's CSS-only tooltip mechanism. Use the Popover API with a JS hover/focus handler. The `<abbr title="...">` attribute provides a no-JS fallback that does not introduce accessibility gaps.

6. **JS-rendered tooltip DOM gets indexed by Pagefind** — If tooltip content is rendered as a visible DOM element at build time, Pagefind indexes it and search results show definition fragments. Prevention: use `data-*` attributes on `<abbr>` (Pagefind ignores attributes); only materialize the popover `<span>` at runtime via JS.

---

## Implications for Roadmap

### Phase 1: Build-time transform

**Rationale:** The transform is the structural foundation; everything else depends on its output HTML. Build and validate it in isolation before adding tooltip UI. Starting with single-word terms and deferring multi-word adds a useful incremental checkpoint.

**Delivers:** Species prose pages with `<abbr data-definition="..." data-image-url="...">` wrapping first occurrences of glossary terms. Correct no-JS degradation via `<abbr title="...">`. Pages pass HTML validation. Unit test suite for the transform function.

**Addresses:** First-occurrence-only, build-time injection, case-insensitive matching, exclusion of inappropriate contexts (headings, code, existing links, `<dl>` taxonomy block).

**Avoids:** Pitfalls 1 (regex on raw HTML), 2 (shared state), 3 (glossary page self-links), 7 (regex metacharacters), 9 (outputPath false crash), 10 (script/style nodes), 11 (case mutation), 12 (headings).

**New files:** `src/_lib/glossary-transform.js`, `src/_lib/glossary-transform.test.js`
**Modified files:** `eleventy.config.js` (async + transform), `src/species/species.njk` (species-prose class), `package.json` (node-html-parser)

### Phase 2: Popover UI — HTML structure and CSS

**Rationale:** Once the transform is verified, add the tooltip UI. HTML structure and CSS can be built and tested without the JS hover enhancement — the Popover API's `popovertarget` on the trigger enables click-to-open natively. This gives a clean accessibility checkpoint before adding hover complexity.

**Delivers:** Fully accessible tooltip popovers (keyboard Tab + Escape, screen reader `role="tooltip"`, click-to-open without JS, mobile tap navigates to glossary page). CSS styled with Pico CSS design tokens. Definition text displayed; no image yet.

**Addresses:** Keyboard accessible, popover dismisses on Escape/click-outside, consistent visual treatment, no-JS degradation.

**Avoids:** Pitfall 4 (Pagefind indexing — popover not in DOM at build time), pitfall 5 (mobile/keyboard — Popover API handles focus and touch), pitfall 6 (overflow clipping — Popover API renders in top layer), pitfall 13 (z-index — same top layer reason), pitfall 15 (Pico attribute conflicts — audit before implementing CSS).

**New files:** `src/styles/glossary-terms.css`
**Modified files:** `src/_includes/base.njk` (add stylesheet link); transform output HTML updated to emit `<button popovertarget>` + `<span popover role="tooltip">` structure.

### Phase 3: JS hover enhancement and glossary images

**Rationale:** Final progressive enhancement layer. Hover handler and image display are additive — they improve the experience for pointer/keyboard users without blocking earlier phases. Images require verifying CDN URL construction and lazy loading behavior.

**Delivers:** Hover/focus show/hide via `showPopover`/`hidePopover`. Glossary images in popovers for the ~50 terms that have `image_filename`. Full rich tooltip experience on desktop.

**Addresses:** Popover shows glossary image, JS hover enhancement, optional CSS Anchor Positioning with `@supports` fallback.

**New files:** `src/components/glossary-tooltip.js` (~20 lines)
**Modified files:** Vite entry point or `species.njk` import for the new JS module.

### Phase Ordering Rationale

- The transform must exist before the tooltip UI — you cannot style or script something that is not in the HTML.
- HTML structure and CSS are validated before JS is added — clean accessibility checkpoint where keyboard and screen reader behavior is confirmed without hover complexity.
- Images come last: pure enrichment, depend on CDN URL construction verified in earlier phases, and the feature is fully usable without them.
- Multi-word term matching should be included in Phase 1 (longest-first sort is required regardless); it is not a separate phase.

### Research Flags

No phase needs a dedicated research run — all patterns are well-documented. Flag these for implementation-time validation:

- **Phase 1 — build time baseline:** Run `npm run build` before and after adding the transform to establish a baseline against the MAINT-03 5-minute CI target. If per-page parse cost is problematic, add a pre-parse string scan bail-out for prose-less pages.
- **Phase 1 — transform concurrency:** Verify per-invocation state isolation with a two-page build before scaling to all species pages.
- **Phase 2 — Pico CSS attribute conflict audit:** Grep all templates for existing `data-tooltip` or `title` attribute usage before implementing tooltip CSS.
- **Phase 2 — Pagefind excerpt output:** Run `pagefind --site _site` after Phase 2 build and inspect species page excerpts to confirm definition text does not appear.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | `addTransform` API verified against Eleventy 3.x docs and Context7. `node-html-parser` API confirmed from GitHub README. Popover API browser support confirmed from MDN (Baseline April 2025). |
| Features | HIGH | UX patterns verified against MDN, hidde.blog (W3C contributor), Smashing Magazine. Browser support table cross-checked across multiple sources. |
| Architecture | HIGH | All integration points verified against existing source files. `csv-parse` already a project dependency. Eleventy 3.x async export supported. |
| Pitfalls | HIGH | Grounded in existing codebase inspection: actual term list with special characters, actual `theme.css` overflow values, actual `species.njk` structure, Eleventy Issues #653/#897. |

**Overall confidence:** HIGH

### Gaps to Address

- **`this.ctx` data availability in Eleventy 3.x transforms:** Not explicitly documented. Confirmed workaround (direct module import at config startup) is reliable; not a blocker.
- **Exact performance cost of `node-html-parser` at scale:** Research cites ~2 ms/file from benchmarks, extrapolating to ~2.7 seconds for 1,348 pages. Real-world measurement on this codebase's HTML size may differ. Benchmark in Phase 1 before worrying about optimizations.
- **CSS Anchor Positioning `@supports` fallback positioning:** When not supported, popover uses browser default positioning. May need a JS fallback for older Safari on positioning; low priority since Anchor Positioning is Baseline 2026.

---

## Sources

### Primary (HIGH confidence)
- Eleventy 3.x `addTransform` API — Context7 `/11ty/eleventy`; https://www.11ty.dev/docs/transforms/
- `node-html-parser` v7.1.0 — npm, GitHub README, Context7 `/taoqf/node-html-parser`
- MDN Popover API — https://developer.mozilla.org/en-US/docs/Web/API/Popover_API (Baseline April 2025)
- hidde.blog — Popover accessibility and semantics (W3C contributor)
- Chrome Developers — Anchor Positioning API
- Eleventy Issues #653/#897 — `outputPath.endsWith` crash when `permalink: false`

### Secondary (MEDIUM confidence)
- Frontend Masters — Popover API for HTML Tooltips (hover JS pattern, image in popover)
- Smashing Magazine — Getting Started With The Popover API (2026-03)
- dbushell.com — Glossary Web Component (2025-05, independent practitioner)
- npm-compare — parse5 vs node-html-parser performance benchmarks
- OddBird — Anchor Positioning polyfill updates

### Project codebase (direct inspection)
- `eleventy.config.js`, `src/_data/glossary.js`, `src/species/species.njk`, `src/glossary/index.njk`
- `data/glossary.csv` — 149 terms; special-character terms: `1A+2A`, `W-mark`, `CuA1`, `M1–M3`
- `src/styles/theme.css` — no `overflow` on `.content-wrapper`; `nav { overflow: auto }`
- `.planning/PROJECT.md` — MAINT-03 build time target; Pico CSS decision history

---
*Research completed: 2026-04-23*
*Ready for roadmap: yes*
