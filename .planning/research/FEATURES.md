# Feature Landscape: Glossary Term Tooltips/Popovers

**Domain:** Inline glossary term highlighting with definition+image popovers in a static site
**Researched:** 2026-04-23
**Overall confidence:** HIGH (core UX patterns verified; browser API specifics from MDN and Smashing Magazine)

---

## Context

This milestone adds build-time glossary term highlighting to species prose pages. The glossary
already exists (150 terms from `data/glossary.csv`, rendered alphabetically at `/glossary/`).
Species prose is short Markdown files rendered via Eleventy's `{% renderFile %}`. The stack is
Eleventy 3.x + Lit web components + Vite. There are currently 11 species with prose, but the
pipeline must scale to all 1,364 species pages.

---

## UX Pattern Inventory

### Wikipedia style (recommended for this project)

First occurrence of each term per page is underlined/highlighted. Hovering or focusing shows a
floating card (popover) with the definition and optionally an image. No link; clicking the term
does nothing (or optionally links to the full glossary entry as a fallback). This is the dominant
pattern for educational natural history content because:

- Readers are not interrupted unless they choose to hover.
- The popover disappears when focus/hover moves away (non-modal).
- Repeat readers are not re-interrupted on every use of a term.
- The visual cue (dotted underline) is familiar from `<abbr>` styling.

### Wiktionary / inline definition style

Term becomes a link to its full definition page. Simpler, but interrupts reading flow with
navigation. Works well when full definition pages add substantial value beyond a tooltip
(e.g., usage examples, etymology). Appropriate as a no-JS fallback; not as the primary UX.

### Wiktionary with hover preview (Wikipedia's Page Previews)

Wiktionary and Wikipedia both use hover-preview popovers over ordinary `<a>` links. Hovering
on the link fetches the definition asynchronously. This is optimal for large wikis where
definitions are dynamically authored and updated. For this project, definitions are static,
so async fetch adds complexity with no benefit.

---

## Table Stakes

Features that users and maintainers will expect. Missing any of these means the feature feels
broken or incomplete.

| Feature | Why Expected | Complexity | Stack Dependency |
|---------|--------------|------------|-----------------|
| First-occurrence-only highlighting per page | Wikipedia convention; repeated highlights create visual noise and confuse "what counts as a glossary term" | Medium — requires tracking seen terms in build transform | Eleventy `addTransform`; `cheerio` or `parse5` for safe text-node traversal |
| Popover shows definition text on hover/focus | The core value; without it there is no feature | Low — definition text is already in glossary data at build time | HTML `popover` attribute + CSS; or Lit component wrapper |
| Keyboard accessible (Tab + Escape) | WCAG requirement; moth site has academic audience who may use keyboard navigation | Low-Medium — native Popover API provides this for free if used correctly | HTML `popover` attribute; `popovertarget` on trigger |
| No-JS degradation: term still visually distinct, definition accessible | JS is already required for occurrence maps but prose should degrade gracefully | Low — use `<a href="/glossary/#term-{slug}">` as the trigger; popover enhances it | Pure HTML; no extra work if trigger is a link |
| Popover dismisses on Escape and on click outside | Standard popover behavior; users expect it | None — native `popover="auto"` behavior | HTML `popover` attribute |
| Consistent visual treatment of highlighted terms | Dotted underline under terms must match across light/dark backgrounds and Pico CSS base styles | Low — single CSS rule | `theme.css` override; Pico CSS does not define this by default |
| Build-time injection (no client-side scanning) | With 1,364 species pages, client-side term detection on DOMContentLoaded adds JS weight and layout shift | High — requires Eleventy transform | `eleventy.config.js` `addTransform`; glossary data available as Eleventy global data |

---

## Differentiators

Features that add value but are not required for the feature to feel complete.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Popover shows glossary image when available | Morphological terms (costal margin, reniform spot) are much clearer with the reference diagram | Low-Medium — image URL constructed at build time from `image_filename` column | CDN URL pattern already established; ~50 of 150 terms have images |
| Popover positioned near trigger (CSS Anchor Positioning) | Prevents popover from obscuring surrounding text | Medium — Anchor Positioning is Baseline 2026 (Chrome 125+, Firefox 147+, Safari 26); no polyfill needed at this point | Use `anchor-name` on trigger, `position-anchor` on popover; pure CSS |
| Link-to-glossary-page as primary trigger fallback | On mobile (no hover), tapping the term navigates to the full glossary entry; this is meaningful rather than nothing | Low — if trigger is `<a href="/glossary/#term-{slug}">`, tap behavior is free | Combine with `interestfor` or JS for hover enhancement |
| `popover="hint"` + `interestfor` declarative hover | Zero-JavaScript hover trigger for Chromium 135+; clean progressive enhancement | Low — CSS-only where supported; JS fallback elsewhere | `interestfor` is Chromium-only in 2026; needs JS fallback for Firefox/Safari |
| Case-insensitive term matching with multi-word support | Glossary has multi-word terms like "Anal angle", "Basal area", "Hair pencils"; naive word-boundary regex misses them | Medium — requires careful regex construction with word boundary anchors | See PITFALLS.md; multi-word matching needs longest-first ordering |
| Exact-match exclusion for code/pre/heading contexts | Terms appearing in headings, code blocks, or figure captions should not be highlighted | Low-Medium — text-node traversal with parent tag exclusion | Cheerio `.not('h1,h2,h3,code,pre,figcaption')` filter |

---

## Anti-Features

Features to explicitly avoid in this milestone.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Client-side JavaScript term scanning | Adds JS weight; causes layout shift as highlights inject after parse; unnecessary since data is available at build time | Build-time Eleventy transform |
| Floating UI / Popper.js / tippy.js library | These are 10–40 kB positioning libraries suited to dynamic SPA content; the native Popover API + CSS Anchor Positioning handles static tooltip positioning without any extra dependency | Use `popover` attribute + CSS anchor positioning |
| Highlighting every occurrence | Visual noise; confusing; Wikipedia-style first-occurrence is the established convention for reference content | Track seen-set per page in the transform |
| Matching inside HTML attributes | Regex applied to serialized HTML will corrupt `href`, `alt`, `src` values if a term matches | Use DOM text-node traversal (Cheerio / parse5), never innerHTML regex |
| Asynchronous definition fetch (AJAX on hover) | Definitions are static; runtime fetch adds network latency, error handling complexity, and a server/CDN round-trip for data already available in the page | Embed definition inline in the popover element at build time |
| Fuzzy / stemming-based matching | "Ventral" should not match "dorsoventral"; "larva" should not match "larvae" unless both are glossary terms | Exact case-insensitive whole-term matching only |
| Custom tooltip `<div>` with JS position calculation | Fragile; breaks at viewport edges; re-invented wheel | Use CSS `popover` + Anchor Positioning |
| Highlighting in Pagefind-indexed regions | Pagefind indexes the page prose; injecting `<mark>` or custom elements inflates index and may tokenize strangely | Add `data-pagefind-ignore` to all injected popover elements |
| Modal-style definitions (click-to-open, requires explicit close) | Users reading prose do not want to stop reading to close a panel | `popover="auto"` auto-dismisses; `popover="hint"` never blocks |

---

## Feature Dependencies

```
Glossary data (already exists)
  glossary.js Eleventy data file → { A: [{term, definition, image_filename, slug}] }
  glossary.csv (150 terms) → build-time data

Build-time transform (new)
  eleventy.config.js addTransform('glossary-terms', ...)
    → Receives rendered HTML of species pages
    → Traverses text nodes in <article> or prose container only
    → Finds first occurrence of each glossary term (case-insensitive)
    → Wraps in <a href="/glossary/#term-{slug}" ...> with popover markup
    → Glossary data must be accessible from within the transform function
      (pass via closure from the data file or re-read at transform registration time)

HTML popover structure (new, injected at build time)
  <a href="/glossary/#term-{slug}" class="glossary-term"
     id="term-trigger-{slug}-{pageIndex}"
     popovertarget="term-popover-{slug}-{pageIndex}">
    {matched text as found in source}
  </a>
  <span id="term-popover-{slug}-{pageIndex}" popover role="tooltip"
        data-pagefind-ignore>
    <strong>{term}</strong>
    {definition text}
    [optional: <img src="{cdnBaseUrl}/glossary/{image_filename}?width=188" alt="{term}">]
    <a href="/glossary/#term-{slug}">Full entry →</a>
  </span>

CSS (new, in theme.css or a new glossary.css)
  .glossary-term { text-decoration: underline dotted; cursor: help; }
  [popover][role="tooltip"] { /* popover card styling */ }
  @supports (anchor-name: --x) {
    .glossary-term { anchor-name: var(--anchor-id); }
    [popover][role="tooltip"] { position-anchor: var(--anchor-id); ... }
  }

CDN image URL (reuses existing pattern)
  cdnBaseUrl global already available in Eleventy templates
  Same ?width=188 pattern used in glossary/index.njk

Pagefind integration (no change needed)
  Popover elements carry data-pagefind-ignore; prose text nodes are unchanged text
  so search indexing of species prose is unaffected
```

---

## No-JS Fallback Analysis

**Current species page behavior without JS:** Taxonomy, prose, and photos render. Occurrence
maps and interactive components show noscript messages.

**After glossary tooltips — behavior without JS:**
- The highlighted terms remain as styled `<a>` links (dotted underline).
- Clicking the link navigates to the full glossary page at `/glossary/#term-{slug}`.
- The popover element (`<span popover>`) is inert without JS — it stays hidden in the DOM.
- The `popover` attribute alone (without JS) still enables click-to-open in browsers that
  support it, via the `popovertarget` button/link, because Popover API is a browser feature
  not a JS feature. This is a bonus: even with JS disabled, the native popover behavior
  works in modern browsers if the trigger element has `popovertarget`.

**Assessment:** The no-JS experience is acceptable — terms are visually distinct and clickable
to their definitions. This matches the "Graceful no-JS degradation" requirement in PROJECT.md.

---

## Accessibility Considerations

**Keyboard navigation (HIGH confidence from MDN/hidde.blog):**
- The `popover` attribute + `popovertarget` on a link gives Tab-key reachability for free.
- `popover="auto"` dismisses on Escape without JavaScript.
- Browser reorders tab sequence so popover content follows its trigger even if distant in DOM.

**Screen readers:**
- Use `role="tooltip"` on the popover element so screen readers announce it as a tooltip.
- Browsers with Popover API create an implicit `aria-details` relationship between trigger
  and popover; screen readers can navigate to details with JAWS/NVDA keyboard commands.
- The trigger link's text (the term itself) is the accessible name — no extra `aria-label` needed.
- Do NOT use `aria-describedby` pointing to the popover ID; this creates redundancy since the
  Popover API already establishes the relationship via `aria-details`.

**Touch devices:**
- `popover="auto"` opens on tap of the trigger.
- If trigger is `<a href>`, tap navigates unless JS intercepts (which it should not for primary behavior).
- Recommendation: allow tap-to-navigate as the primary touch behavior; hover enhancement for
  pointer devices is a progressive enhancement.

**Color and contrast:**
- Dotted underline must remain visible on the cream background (`#fdf6e3` per PROJECT.md visual identity).
- Popover card needs sufficient contrast ratio (WCAG AA: 4.5:1 for text).

---

## Browser Support Assessment (as of 2026-04)

| Feature | Chrome | Firefox | Safari | Notes |
|---------|--------|---------|--------|-------|
| `popover` attribute | 114+ | 125+ | 17+ | Baseline 2024 — safe to use |
| `popover="auto"` dismiss behavior | 114+ | 125+ | 17+ | Same as above |
| `role="tooltip"` | All | All | All | Standard ARIA |
| CSS Anchor Positioning | 125+ | 147+ | 26+ | Baseline 2026 — safe to use |
| `popover="hint"` | 135+ | 147+ | 26+ | Newer; hint type allows multiple popovers open simultaneously |
| `interestfor` (declarative hover) | 135+ | Not yet | Not yet | Chromium-only; needs JS fallback |

**Recommendation:** Use `popover="auto"` (not `hint`) to avoid `interestfor` dependency.
Implement hover/focus show/hide with a small JS snippet (mouseover/focus event listeners on
trigger elements). This is ~10 lines of JS, not a library. CSS Anchor Positioning is safe for
the popover positioning layer — add a `@supports` block so older browsers get fallback positioning.

---

## Complexity Assessment

| Sub-task | Estimated Complexity | Risk |
|----------|---------------------|------|
| Eleventy `addTransform` for term detection | Medium | Multi-word terms, case normalization, DOM-safe traversal |
| Making glossary data available inside transform | Low | Pass via module-level variable or re-query |
| HTML structure for popover trigger + panel | Low | Standard markup pattern |
| Unique IDs per page per term | Low | Counter or slug + page hash |
| CSS styling (dotted underline, popover card) | Low | 20–30 lines in theme.css |
| CSS Anchor Positioning for placement | Low-Medium | `@supports` wrapper ensures graceful fallback |
| JS hover/focus enhancement (mouseover/blur) | Low | ~10 lines in main.js or a Lit component |
| Excluding non-prose contexts (headings, code) | Low-Medium | Cheerio parent-element filter |
| Popover image URL construction | Low | Reuse existing `cdnBaseUrl` global |
| Testing the transform | Medium | Unit test with sample HTML; verify first-occurrence, multi-word, exclusions |

**Overall complexity: Medium.** The hardest part is the build-time transform (safe text-node
traversal, first-occurrence tracking, multi-word term handling). The popover UI itself is
straightforward given the native Popover API.

---

## MVP Recommendation

Build in this order:

1. **Build-time transform** — Eleventy `addTransform` that injects `<a class="glossary-term" ...>` wrappers around first occurrences. Start with exact single-word terms only; add multi-word after single-word works.

2. **Popover HTML structure** — Inline definition text (no image yet). Validate keyboard and screen reader behavior before adding visual complexity.

3. **CSS styling** — Dotted underline, popover card, Anchor Positioning with `@supports` fallback.

4. **Image in popover** — Add `<img>` to popover for terms that have `image_filename`. Use same CDN URL pattern as glossary page (already working).

5. **JS hover enhancement** — Small event listener to show popover on mouseover/focus and hide on mouseout/blur. Not a library; inline or in `main.js`.

Defer:

- `popover="hint"` + `interestfor`: requires JS fallback for Firefox/Safari and adds complexity for marginal UX improvement.
- Highlighting in body copy outside species prose (e.g., browse page accordion descriptions): out of scope for this milestone.
- Animated transitions (`@starting-style`, `allow-discrete`): known to cause "pixel-shifting jank" in Safari when combined with Popover API (confirmed by dbushell.com implementation experience).

---

## Sources

- [dbushell.com — Glossary Web Component](https://dbushell.com/2025/05/07/glossary-web-component/) — MEDIUM confidence (independent practitioner, 2025, consistent with other sources)
- [MDN — Using the Popover API](https://developer.mozilla.org/en-US/docs/Web/API/Popover_API/Using) — HIGH confidence
- [hidde.blog — Popover accessibility](https://hidde.blog/popover-accessibility/) — HIGH confidence (W3C contributor)
- [hidde.blog — Semantics and the popover attribute](https://hidde.blog/popover-semantics/) — HIGH confidence
- [Frontend Masters — Popover API for HTML Tooltips](https://frontendmasters.com/blog/using-the-popover-api-for-html-tooltips/) — MEDIUM confidence
- [Smashing Magazine — Getting Started With The Popover API](https://www.smashingmagazine.com/2026/03/getting-started-popover-api/) — MEDIUM confidence
- [OddBird — Anchor Positioning polyfill updates](https://www.oddbird.net/2025/05/06/polyfill-updates/) — MEDIUM confidence
- [Chrome Developers — Anchor Positioning API](https://developer.chrome.com/blog/anchor-positioning-api) — HIGH confidence
- [bitsofco.de — Making abbr work for touchscreen, keyboard, and mouse](https://bitsofco.de/making-abbr-work-for-touchscreen-keyboard-mouse/) — MEDIUM confidence

*Feature research for: PNW Moths v2.0 Glossary Tooltips milestone*
*Researched: 2026-04-23*
