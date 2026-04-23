---
phase: 19
slug: build-time-glossary-transform
status: draft
shadcn_initialized: false
preset: none
created: 2026-04-23
---

# Phase 19 — UI Design Contract

> Visual and interaction contract for the build-time glossary transform.
>
> **Scope note:** Phase 19 is a BUILD-TIME HTML transform that emits `<abbr>` elements.
> There is no visible UI in this phase. The "UI contract" here is the HTML/attribute
> structure contract between the build-time transform (Phase 19) and the CSS/JS tooltip
> layers (Phases 20 and 21). This document locks element structure, attribute names,
> class names, and accessibility attributes so Phases 20 and 21 can build on a stable
> foundation.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (Pico CSS classless, custom overrides in `src/styles/theme.css`) |
| Preset | not applicable |
| Component library | Pico CSS 2.x (`@picocss/pico`) |
| Icon library | none |
| Font | Body: Open Sans 400/600 via Google Fonts; Headings: Spinnaker via Google Fonts |

Source: `src/styles/theme.css` (verified 2026-04-23).

No shadcn. No Tailwind. No React. This is a static Eleventy site. The shadcn gate does
not apply.

---

## Element Structure Contract

This is the primary contract for Phase 19. Every field is locked and must not be changed
without updating Phases 20 and 21.

### Annotated term element

The build-time transform emits exactly this structure for the first occurrence of each
glossary term on a species page:

```html
<abbr
  class="glossary-term"
  title="{escaped definition text}"
  data-definition="{escaped definition text}"
  data-image-url="{CDN URL or empty string}"
>{matched text as-found in source, original case preserved}</abbr>
```

**Field-by-field specification:**

| Attribute | Required | Value | Source |
|-----------|----------|-------|--------|
| `class` | yes | `glossary-term` (single class, no others added by Phase 19) | GLOS-01 (REQUIREMENTS.md) |
| `title` | yes | Full definition text, HTML-escaped (`"` → `&quot;`, `&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`) | GLOS-06 (REQUIREMENTS.md) |
| `data-definition` | yes | Same value as `title` | GLOS-01 (REQUIREMENTS.md) |
| `data-image-url` | yes | CDN URL when `image_filename` is present; empty string `""` when absent | GLOS-01 (REQUIREMENTS.md) |
| Inner text | yes | The matched text from source, preserving original capitalisation (e.g., "Forewing" if that is how it appears in prose) | GLOS-01 (REQUIREMENTS.md) |

**Why `data-definition` duplicates `title`:**
`title` provides the no-JS degradation path (GLOS-06). `data-definition` is the
machine-readable attribute that Phase 20/21 JS reads to populate the popover; it must
not be computed from `title` at runtime to avoid re-parsing HTML entities. Both attributes
carry the same escaped string.

**Why `data-image-url` is an empty string (not omitted) when absent:**
Simplifies Phase 21 JS — `el.dataset.imageUrl` is always a string, never `undefined`.
The empty string is falsy, so `if (el.dataset.imageUrl)` still works as a guard.

### CDN URL construction for image

```
https://pnwmoths.b-cdn.net/glossary/{encodeURIComponent(image_filename)}
```

Source: `eleventy.config.js` — `CDN_BASE_URL` constant; pass to `buildTermMap(rows, cdnBaseUrl)` as parameter (see 19-RESEARCH.md Pattern 3).

---

## Scope Guard Contract

The transform applies ONLY to output files matching both guards:

1. `outputPath` is truthy AND ends with `.html`
2. `outputPath.includes('/species/')`

All other pages (glossary, browse, home, FAQs, plates, search) receive the content
unchanged. This is a hard contract: Phase 20 and 21 must NOT rely on `<abbr
class="glossary-term">` appearing on any non-species page.

Source: GLOS-05 (REQUIREMENTS.md); 19-RESEARCH.md Pattern 1.

---

## DOM Walk Scope Contract

Inside a matched species page, the transform walks text nodes inside:

```
main p, main li, main h2, main h3
```

Elements inside `dl` or `[data-pagefind-ignore]` are skipped even if they match the
selector above.

Source: 19-RESEARCH.md Pattern 2; species.njk (the taxonomy `<dl>` block and
`data-pagefind-ignore` occurrence components must not be annotated).

---

## First-Occurrence Contract

Only the FIRST occurrence of each term on a given page is wrapped. All subsequent
occurrences remain as plain text. Case-insensitive comparison is used to determine
whether a term has been seen (the lower-cased form of the term is stored in `seen`).

Source: GLOS-04 (REQUIREMENTS.md).

---

## Matching Contract

| Property | Rule |
|----------|------|
| Case sensitivity | Case-insensitive (`gi` regex flag) |
| Whole-word | Lookbehind `(?<![a-zA-Z0-9])` + lookahead `(?![a-zA-Z0-9])` — NOT `\b` |
| Metacharacter safety | All terms escaped via `escapeRegex` before `new RegExp()` |
| Match priority | Longest term matched first (sort by `term.length` descending) |

Source: GLOS-02, GLOS-03 (REQUIREMENTS.md); 19-RESEARCH.md Patterns 3 and 7.

---

## Pagefind Safety Contract

Definition text is stored ONLY in `data-definition` and `title` HTML attributes.
It must NEVER be emitted as visible text content at build time. Pagefind does not
index `data-*` attributes or `title` attributes; the definition text therefore
does not pollute search index excerpts.

Source: QA-02 (REQUIREMENTS.md); 19-RESEARCH.md Anti-Patterns.

---

## No-JS Degradation Contract

When JavaScript is disabled, the native browser tooltip from `<abbr title="...">` is
the only fallback. No layout must break; the term text remains readable as plain text
with the abbreviation underline decoration. Phase 19 is solely responsible for setting
`title`. Phase 20 CSS must not remove the `abbr[title]` default dotted underline without
providing an equivalent visible affordance.

Source: GLOS-06 (REQUIREMENTS.md).

---

## Accessibility Contract

| Concern | Requirement |
|---------|-------------|
| Screen reader announcement | `<abbr title="...">` is announced by screen readers with the title; Phase 19 must ensure `title` is set and human-readable (not escaped HTML entities in the text — use `escapeHtml()` at attribute embed time, not at display time) |
| Keyboard access | Phase 19 makes no keyboard changes; the term is focusable only because it is an `<abbr>` inline element (Phase 20 adds `tabindex="0"` and the popover trigger) |
| No ARIA at Phase 19 | Phase 19 must not add ARIA attributes (`aria-describedby`, `aria-expanded`, etc.) — those are Phase 20/21 responsibility |

---

## Spacing Scale

This phase emits no UI layout. The spacing scale below is carried from the site's
existing design tokens for reference by Phases 20 and 21.

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon gaps, inline padding |
| sm | 8px | Compact element spacing |
| md | 16px | Default element spacing |
| lg | 24px | Section padding (confirmed in `.content-wrapper`, `.site-nav`) |
| xl | 32px | Layout gaps |
| 2xl | 48px | Major section breaks |
| 3xl | 64px | Page-level spacing |

Exceptions: none.

Source: `src/styles/theme.css` (padding: 24px on `.content-wrapper` and `.site-nav`).

---

## Typography

Carried from the existing site design. Phase 19 emits no new typographic elements;
Phase 20 CSS for the popover must use these values.

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Body | 16px (Pico default) | 400 (regular) | 1.5 (Pico default) |
| Label / small text | 14px | 400 | 1.5 |
| Heading (h2/h3) | 20–24px (Pico scale) | 400 (Spinnaker is a display face, no bold) | 1.2 |
| Display (h1) | 48px (3rem, site name) | 400 | 1.2 |

Fonts: `Open Sans` (body/label/UI), `Spinnaker` (headings only).

Source: `src/styles/theme.css` — `--pico-font-family-sans-serif: 'Open Sans'`; `h1–h6 font-family: 'Spinnaker'`; footer `font-size: 14px`.

---

## Color

Carried from the existing site design. Phase 19 emits no styled elements.
Phase 20 CSS must stay within these constraints.

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `#f3e8ba` | Page background, `body`, warm cream |
| Secondary (30%) | `#ffffff` | `.content-wrapper` cards; content surface |
| Accent (10%) | `#a4ab78` | Olive green — navigation hover, primary interactive affordances |
| Destructive | none | No destructive actions in Phases 19–21 |

Accent reserved for: navigation link hover state, primary button/link interactive affordances. Phase 20 MAY use the accent color for the `<abbr>` underline indicator.

Source: `src/styles/theme.css` — `--pico-background-color: #f3e8ba`; `--pico-primary: #a4ab78`; `.content-wrapper background-color: #ffffff`.

---

## Copywriting Contract

Phase 19 is a build-time transform and emits no user-facing copy except the values
already present in `data/glossary.csv`. The following constraints apply.

| Element | Copy |
|---------|------|
| `title` attribute on `<abbr>` | Full definition text from `glossary.csv` `definition` column, HTML-escaped. Not truncated. Not summarised. |
| `data-definition` attribute | Same as `title`. |
| Empty `data-image-url` | Empty string `""`. No placeholder text. |

There are no primary CTAs, empty states, error states, or destructive confirmations in
this phase. This phase produces no visible UI text.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none | not applicable |
| npm (node-html-parser 7.1.0) | build-only dependency | vetted in 19-RESEARCH.md — zero runtime exposure; installed as devDependency |

No shadcn, no third-party component registries, no runtime JS dependencies added in
this phase.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
