---
phase: 20
slug: popover-ui-html-and-css
status: draft
shadcn_initialized: false
preset: none
created: 2026-04-23
---

# Phase 20 — UI Design Contract

> Visual and interaction contract for the Popover UI — HTML and CSS phase.
>
> **Scope note:** This phase rewrites `src/components/glossary-tooltip.js` from a
> custom `#glossary-tooltip` fixed div to a native Popover API implementation, and
> updates the CSS in `src/styles/theme.css` to target the new popover selector.
> It also delivers TIP-02 (CDN images) by folding Phase 21 scope in. No new pages,
> no new typography, no new layout — this is a surgical component rewrite.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (Pico CSS classless, custom overrides in `src/styles/theme.css`) |
| Preset | not applicable |
| Component library | Pico CSS 2.x (`@picocss/pico`) |
| Icon library | none |
| Font | Body: Open Sans 400/600 via Google Fonts; Headings: Spinnaker via Google Fonts |

No shadcn. No Tailwind. No React. This is a static Eleventy/Vite site.
The shadcn gate does not apply.

Source: `src/styles/theme.css` (verified 2026-04-23); Phase 19 UI-SPEC.md.

---

## Popover Element Structure Contract

Phase 20 JS creates and injects exactly one `<div popover>` per `<abbr class="glossary-term">` element at runtime. Build-time HTML is unchanged.

### Popover element

```html
<div
  id="gt-popover-{index}"
  class="glossary-popover"
  popover="auto"
  role="tooltip"
  aria-hidden="true"
>
  <img class="gt-img" alt="" hidden>
  <p class="gt-def"></p>
</div>
```

**Field-by-field specification:**

| Attribute / Property | Required | Value | Rationale |
|----------------------|----------|-------|-----------|
| `id` | yes | `gt-popover-{index}` where index is the zero-based position of the `<abbr>` in `querySelectorAll` order | Unique ID needed for `popovertarget` wiring |
| `class` | yes | `glossary-popover` | CSS target; replaces `#glossary-tooltip` |
| `popover` | yes | `"auto"` | Auto mode gives Escape + click-outside-to-close for free (D-03) |
| `role` | yes | `"tooltip"` | ARIA semantics — announced as tooltip |
| `aria-hidden` | yes | `"true"` initially; removed on `showPopover()` | Screen reader suppression while hidden |
| `.gt-img` `alt` | yes | `""` (empty) | Decorative — definition text in `.gt-def` is the semantic content |
| `.gt-img` `hidden` | conditional | present when `data-image-url` is empty string; absent when URL is set | D-08 |
| `.gt-def` | yes | `textContent` set from `abbr.dataset.definition` at show time | D-07 |

### abbr element modifications (applied by JS at runtime)

| Modification | Rule |
|--------------|------|
| `tabindex="0"` added | D-06: makes term keyboard-focusable |
| `title` removed, `aria-label` set to same value | D-09: prevents double-tooltip (native + custom) |
| No-JS fallback: `<abbr title="...">` remains until JS runs | GLOS-06: no change to build-time output |

### Positioning

Popover is positioned **below the `<abbr>` element** using `getBoundingClientRect()`. Not cursor-following.

```
left  = abbr.getBoundingClientRect().left + window.scrollX
top   = abbr.getBoundingClientRect().bottom + window.scrollY + 6px (offset)
```

The 6px gap between term bottom and popover top is the fixed offset (D-04, D-05).

Viewport edge clamp: if `left + popoverWidth > viewportWidth - 8px`, clamp to `viewportWidth - popoverWidth - 8px`.

### Show / hide mechanism

| Action | Method |
|--------|--------|
| Show | `popover.showPopover()` then set `aria-hidden="false"` |
| Hide | `popover.hidePopover()` then set `aria-hidden="true"` |
| Escape key | Popover API `popover="auto"` handles this natively — no keydown listener needed |
| Click outside | Popover API `popover="auto"` handles this natively |

Event triggers: `mouseenter` / `mouseleave` on `<abbr>`, `focus` / `blur` on `<abbr>` (80ms hide debounce carried from existing implementation).

---

## Spacing Scale

Carried from site design tokens. Phase 20 uses these values directly in popover CSS.

| Token | Value | Usage in Phase 20 |
|-------|-------|-------------------|
| xs | 4px | border-radius on image (2px used — sub-token, pre-existing) |
| sm | 8px | image margin-bottom; viewport clamp padding |
| md | 16px | not used inside popover panel |
| lg | 24px | not used inside popover panel |
| xl | 32px | not used inside popover panel |
| 2xl | 48px | not used inside popover panel |
| 3xl | 64px | not used inside popover panel |

**Popover internal padding:** 10px top/bottom, 12px left/right. Carried from existing `#glossary-tooltip` CSS. These are not multiples of 4px but are preserved from the existing implementation to avoid visual regression.

Exceptions: 10px vertical padding (existing value, carried forward).

Source: `src/styles/theme.css` `#glossary-tooltip` block (verified 2026-04-23).

---

## Typography

Carried from site design. Phase 20 adds no new typographic roles. The popover definition text uses the "label / small text" role.

| Role | Size | Weight | Line Height | Phase 20 usage |
|------|------|--------|-------------|----------------|
| Body | 16px (Pico default) | 400 (regular) | 1.5 | Surrounding page text |
| Label / small text | 13.12px (0.82rem) | 400 | 1.45 | `.gt-def` definition text inside popover |
| Heading (h2/h3) | 20–24px (Pico scale) | 400 (Spinnaker) | 1.2 | Not used in popover |
| Display (h1) | 48px (3rem) | 400 | 1.2 | Not used in popover |

The `0.82rem` font size for `.gt-def` is carried from existing `#glossary-tooltip .gt-def` rule.

Source: `src/styles/theme.css` (verified 2026-04-23).

---

## Color

Carried from site design tokens. Phase 20 popover CSS must stay within these values.

| Role | Value | Phase 20 usage |
|------|-------|----------------|
| Dominant (60%) | `#f3e8ba` | Page background — not used inside popover |
| Secondary (30%) | `#ffffff` | Popover panel background (`background: #fff`) |
| Accent (10%) | `#a4ab78` | `abbr.glossary-term` dotted underline indicator color (already `#7f8956` in existing CSS — keep as-is, it is the hover-dark of `--pico-primary`) |
| Destructive | none | No destructive actions in Phase 20 |

**Additional popover colors (carried from existing `#glossary-tooltip` CSS):**

| Element | Value | Usage |
|---------|-------|-------|
| Border | `#bbb` | Popover panel border (`border: 1px solid #bbb`) |
| Box shadow | `rgba(0,0,0,0.18)` | `0 3px 10px rgba(0,0,0,0.18)` — depth cue |
| Definition text | `#333` | `.gt-def` text color |

Accent reserved for: navigation link hover state, primary button/link affordances, `abbr.glossary-term` underline indicator. No new accent uses in Phase 20.

Source: `src/styles/theme.css` (verified 2026-04-23); Phase 19 UI-SPEC.md.

---

## CSS Selector Migration

The existing `#glossary-tooltip` ID selector must be replaced with `.glossary-popover`. The `abbr.glossary-term` rule remains unchanged.

**Old selector → New selector:**

| Old | New |
|-----|-----|
| `#glossary-tooltip` | `.glossary-popover` |
| `#glossary-tooltip .gt-img` | `.glossary-popover .gt-img` |
| `#glossary-tooltip .gt-def` | `.glossary-popover .gt-def` |

**New required CSS declarations for Popover API:**

```css
.glossary-popover {
  /* Reset browser popover default margin/inset */
  margin: 0;
  inset: unset;
  /* Positioning handled by JS */
  position: absolute;
}
```

The `display: none` / `display: block` toggle from the old implementation is replaced by the Popover API's built-in show/hide (`[popover]` is hidden by default via `:popover-open` pseudo-class control). Remove `display: none` from the `.glossary-popover` rule — the Popover API manages display state.

**Preserved CSS values (unchanged from existing `#glossary-tooltip`):**

| Property | Value |
|----------|-------|
| `background` | `#fff` |
| `border` | `1px solid #bbb` |
| `border-radius` | `4px` |
| `padding` | `10px 12px` |
| `max-width` | `260px` |
| `box-shadow` | `0 3px 10px rgba(0,0,0,0.18)` |
| `pointer-events` | `none` |
| `.gt-img` `max-width` | `100%` |
| `.gt-img` `height` | `auto` |
| `.gt-img` `display` | `block` |
| `.gt-img` `margin-bottom` | `8px` |
| `.gt-img` `border-radius` | `2px` |
| `.gt-def` `font-size` | `0.82rem` |
| `.gt-def` `line-height` | `1.45` |
| `.gt-def` `color` | `#333` |
| `.gt-def` `margin` | `0` |

Source: `src/styles/theme.css` `#glossary-tooltip` block (verified 2026-04-23).

---

## No-JS Degradation Contract

When JavaScript is disabled:

1. No popover is injected (JS is required to create and append `<div popover>`).
2. `<abbr title="...">` native browser tooltip remains available (Phase 19's contract — unchanged).
3. The dotted underline on `abbr.glossary-term` remains visible — Phase 20 CSS must NOT remove `text-decoration: underline dotted 2px` from `abbr.glossary-term`.
4. No layout is broken — the popover element simply does not exist.

Source: GLOS-06 (REQUIREMENTS.md); Phase 19 UI-SPEC.md No-JS Degradation Contract.

---

## Accessibility Contract

| Concern | Requirement |
|---------|-------------|
| Keyboard focusable | `tabindex="0"` added to each `<abbr class="glossary-term">` at JS wiring time (D-06) |
| Screen reader label | `aria-label` set from `title` value; `title` removed at runtime (D-09) |
| Popover ARIA | `role="tooltip"` on popover element; `aria-hidden="true"` while hidden, `aria-hidden` removed while visible |
| Image alt | `alt=""` (empty string) — image is decorative; semantic content is in `.gt-def` |
| Escape dismiss | Provided natively by `popover="auto"` — no additional listener needed |
| No focus trap | Popover is `pointer-events: none` — user focus stays on `<abbr>`, not inside popover |

---

## Pagefind Safety Contract (QA-02)

The popover `<div>` is injected at runtime by JS, not at build time. Pagefind indexes the static `_site/` HTML before JS runs. Definition text lives only in `data-definition` and `title` attributes (build-time output from Phase 19), neither of which Pagefind indexes. The popover element and its `.gt-def` text content are never present in the static HTML file.

QA-02 is satisfied by architectural constraint — no build-time popover HTML, no Pagefind exposure.

Source: QA-02 (REQUIREMENTS.md); Phase 19 UI-SPEC.md Pagefind Safety Contract; 20-CONTEXT.md `<code_context>`.

---

## Copywriting Contract

This phase emits no user-authored copy. All visible text in the popover comes from `data/glossary.csv` via the `data-definition` attribute set at build time by Phase 19.

| Element | Copy |
|---------|------|
| Primary CTA | none — no CTA in this phase |
| Empty state (no definition text) | none — `data-definition` is always non-empty for matched terms (glossary CSV validation) |
| Image absent state | no broken placeholder — image element hidden via `hidden` attribute (D-08) |
| Error state | none — no user-facing error states in a tooltip |
| Destructive confirmation | none — no destructive actions |

Source: 20-CONTEXT.md D-07, D-08; REQUIREMENTS.md TIP-01, TIP-02.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none | not applicable |
| npm (runtime) | none added | no new runtime dependencies in this phase |

No shadcn. No third-party component registries. No new npm runtime dependencies.
The rewrite is pure vanilla JS + CSS using the native Popover API.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
