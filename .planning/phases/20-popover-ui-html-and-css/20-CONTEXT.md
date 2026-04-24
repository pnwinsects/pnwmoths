# Phase 20: Popover UI — HTML and CSS - Context

**Gathered:** 2026-04-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Rewrite the existing `glossary-tooltip.js` custom-div tooltip to use the native HTML
Popover API. Deliver full TIP-01 + TIP-02 + TIP-03 in one pass (definitions + CDN images
+ Popover API). Phase 21 scope (CDN images) is folded into this phase — Phase 21 is
vacuous after this work ships.

Phase 20 delivers: a user-visible, styled popover that appears on hover/focus over
`<abbr class="glossary-term">` elements, showing definition text and optional CDN image,
using the native Popover API (`popover="auto"`).

</domain>

<decisions>
## Implementation Decisions

### API Approach
- **D-01:** Replace the existing custom `#glossary-tooltip` div (fixed-position, cursor-following)
  with a native Popover API implementation using `popover="auto"`.
- **D-02:** The `<div popover>` element is created and injected at runtime by JS. Build-time
  HTML stays clean — no popover markup in the Eleventy templates or transform output.
- **D-03:** `popover="auto"` chosen over `popover="manual"`: gets Escape dismiss and
  click-outside-to-close for free without adding a keydown listener.

### Positioning
- **D-04:** Popover is positioned **below the `<abbr>` element** using `getBoundingClientRect()`.
  Not cursor-following. Predictable anchor without needing `mousemove` tracking.
- **D-05:** Still requires JS to set `left`/`top` on the popover element (CSS Anchor Positioning
  is not Baseline yet — deferred to TIP-04 in REQUIREMENTS.md future requirements).

### Keyboard Accessibility
- **D-06:** `tabindex="0"` is added to each `<abbr class="glossary-term">` element at runtime
  by JS (when event listeners are wired up). Build-time transform remains unchanged.
  `<abbr>` without `tabindex` is not focusable by keyboard.

### Content
- **D-07:** Popover shows both definition text (from `data-definition`) **and** CDN image
  (from `data-image-url` when non-empty). This covers TIP-02 (Phase 21 scope) in a single
  rewrite. Phase 21 is effectively complete after this phase ships.
- **D-08:** When `data-image-url` is empty string, no broken image placeholder — image element
  is hidden (same behavior as existing `gtImg.hidden = true` pattern).

### title / aria-label Handling
- **D-09:** Continue the existing pattern: JS moves `title` → `aria-label` at runtime to
  prevent the browser's native tooltip from appearing alongside the custom popover.
  No-JS users retain the `<abbr title="...">` fallback (Phase 19's contract).

### Phase Scope
- **D-10:** Phase 21 (JS Hover Enhancement and Glossary Images, TIP-02) is folded into
  Phase 20. After Phase 20 ships, the roadmap should reflect Phase 21 as complete.
  No separate Phase 21 execution needed.

### Claude's Discretion
- Exact popover HTML structure (single `<div>` per term vs. one shared div — implement
  whichever is simpler given Popover API constraints; one-per-term is typical pattern)
- CSS class naming for the new popover element
- Exact pixel offset below the term
- Whether to show/hide via `showPopover()`/`hidePopover()` or toggle

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 19 contracts (what this phase builds on)
- `.planning/phases/19-build-time-glossary-transform/19-UI-SPEC.md` — Element structure
  contract: `<abbr class="glossary-term" title="..." data-definition="..." data-image-url="...">`.
  Locked. Phase 20 must not change what Phase 19 emits.

### Requirements
- `.planning/REQUIREMENTS.md` — TIP-01, TIP-02, TIP-03, QA-02 are the governing
  acceptance criteria for this phase.

### Existing implementation to replace
- `src/components/glossary-tooltip.js` — Current custom-div implementation. Phase 20
  rewrites this file to use Popover API.
- `src/styles/theme.css` — Existing CSS for `abbr.glossary-term` and `#glossary-tooltip`.
  Update the tooltip CSS to target the new popover element.
- `src/components/main.js` — Already imports `glossary-tooltip.js`; no change needed.

### Design system
- `src/styles/theme.css` — Design tokens: `--pico-background-color: #f3e8ba`,
  `--pico-primary: #a4ab78`, `.content-wrapper background: #fff`. Popover must use
  these colors for consistency.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/glossary-tooltip.js`: The logic is nearly right — event wiring
  (mouseenter/leave/focus/blur), show/hide, image conditional. Reuse the structure,
  swap the implementation from custom div to Popover API.
- `src/styles/theme.css` `#glossary-tooltip` block: Existing padding, max-width, shadow,
  border-radius, font-size values are good — port to the new popover element selector.
- `abbr.glossary-term` CSS rule already set: `cursor: help`, dotted underline, olive color.
  Keep as-is.

### Established Patterns
- All other Lit components use Shadow DOM, but glossary tooltip is plain JS — correct,
  consistent with existing approach.
- `data-pagefind-ignore` on interactive sections (see `species.njk`) — the popover is
  injected at runtime so it doesn't affect Pagefind (QA-02 already satisfied by
  definition living in `data-*` attributes at build time).

### Integration Points
- `src/components/main.js` imports `glossary-tooltip.js` — already wired into Vite bundle.
- `src/species/species.njk` renders species pages that the transform annotates.
- `src/_lib/glossary-transform.js` emits the `<abbr>` elements this phase depends on.

</code_context>

<specifics>
## Specific Ideas

- Use `popover="auto"` (not `manual`) so Escape and click-outside-to-close are free.
- Popover positioned **below the term**, not cursor-following. Use `getBoundingClientRect()`
  on the `<abbr>` to compute `left`/`top`.
- `tabindex="0"` added by JS at wiring time, not at build time.
- Phase 21 folded in — one rewrite, both phases complete.

</specifics>

<deferred>
## Deferred Ideas

- **CSS Anchor Positioning** (TIP-04, REQUIREMENTS.md future requirements) — Baseline 2026;
  defer to a future phase when cross-browser support lands.
- **Fix close button on lightbox** (pending todo, `2026-04-23-fix-close-button-on-lightbox.md`)
  — unrelated to glossary tooltip; keep as separate todo.

</deferred>

---

*Phase: 20-popover-ui-html-and-css*
*Context gathered: 2026-04-23*
