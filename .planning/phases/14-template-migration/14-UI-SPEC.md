---
phase: 14
slug: template-migration
status: draft
shadcn_initialized: false
preset: none
created: 2026-04-22
---

# Phase 14 — UI Design Contract

> Visual and interaction contract for Phase 14: Template Migration.
> This phase wires CDN URLs into Nunjucks templates and the pnwm-taxon-browser web component.
> It introduces NO new visual components, layouts, or interactions.
> The contract here is the image markup pattern — the exact HTML attribute signatures the executor must produce.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (Pico CSS classless + custom theme overlay) |
| Preset | not applicable |
| Component library | none (vanilla Lit web components) |
| Icon library | none |
| Font | Open Sans (body), Spinnaker (headings) — unchanged from existing theme |

Source: `src/styles/theme.css` — Pico CSS custom property overrides; no shadcn; no Tailwind.

shadcn gate: not applicable — project stack is Eleventy (Nunjucks) + vanilla JS, not React/Next.js/Vite.

---

## Spacing Scale

No changes to spacing in this phase. Existing Pico CSS defaults and theme.css overrides remain unchanged.

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon gaps (taxon browser image strip gap — unchanged) |
| sm | 8px | Compact element spacing |
| md | 16px | Default element spacing |
| lg | 24px | Section padding, content-wrapper padding |
| xl | 32px | Layout gaps |
| 2xl | 48px | Major section breaks |
| 3xl | 64px | Page-level spacing |

Exceptions: none. Phase 14 modifies no layout or spacing.

---

## Typography

No changes to typography in this phase. Pico CSS defaults + Open Sans/Spinnaker theme override remain in force.

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Body | 16px | 400 | 1.5 |
| Label | 14px | 400 | 1.5 |
| Heading (h1/h2) | Pico default rem scale | 700 | 1.2 |
| Display (.pnwm-site-name) | 3rem | 400 | 1.2 |

Source: `src/styles/theme.css` — no new type styles added in Phase 14.

---

## Color

No changes to color in this phase.

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | #f3e8ba | Page background, body |
| Secondary (30%) | #ffffff | Content wrapper (white box), image backgrounds |
| Accent (10%) | #a4ab78 | Primary links, nav hover, Pico primary override |
| Destructive | none | No destructive actions in this phase |

Accent reserved for: nav link hover state, Pico primary interactive elements. No new accent usage added in Phase 14.

Source: `src/styles/theme.css` CSS custom properties.

---

## Image Markup Contract

This section is the primary deliverable of the UI-SPEC for Phase 14. All image `src`, `srcset`, and attribute patterns are locked here.

### CDN Base URL

```
https://pnwmoths.b-cdn.net
```

Exposed to Nunjucks templates as the global `cdnBaseUrl` via `addGlobalData('cdnBaseUrl', CDN_BASE_URL)` in `eleventy.config.js`. Hard-coded as module-level constant in `pnwm-taxon-browser.js`.

### Nunjucks `urlencode` Filter

Defined in `eleventy.config.js`:
```js
eleventyConfig.addFilter("urlencode", v => encodeURIComponent(v));
```

Applied to every `img.filename` and `term.image_filename` in CDN URL expressions. Handles spaces, parentheses, `+`, `#`, and all other reserved URL characters.

---

### species.njk — Species Photo `<img>`

**Location:** `src/species/species.njk`, line 48 (inside `{% for img in spImages %}`).

**Before:**
```html
<img src="/images/{{ sp.slug }}/{{ img.filename }}"
     alt="{{ sp.genus }} {{ sp.species }}"
     data-photographer="{{ img.photographer }}">
```

**After (locked contract):**
```html
<img src="{{ cdnBaseUrl }}/{{ sp.slug }}/{{ img.filename | urlencode }}"
     alt="{{ sp.genus }} {{ sp.species }}"
     data-photographer="{{ img.photographer }}">
```

Constraints:
- No `| url` filter on the `src` value (absolute CDN URLs must not be prefixed by pathPrefix).
- No `srcset` in Phase 14 (deferred — `pnwm-image-slideshow` drops `srcset` on slotted `<img>` in `connectedCallback`; defer to Phase 16 or later).
- No Bunny Optimizer query params on species photos in Phase 14 (not required by success criteria; optional for follow-up).
- `data-photographer` attribute retained as-is.

---

### glossary/index.njk — Glossary Portrait `<img>`

**Location:** `src/glossary/index.njk`, line 41 (inside `{% if term.image_filename %}`).

**Before:**
```html
<img src="{{ ('/images/glossary/' + term.image_filename) | url }}"
     alt="{{ term.term }}"
     width="188" height="225">
```

**After (locked contract):**
```html
<img src="{{ cdnBaseUrl }}/glossary/{{ term.image_filename | urlencode }}?width=188&height=225&crop_gravity=north"
     srcset="{{ cdnBaseUrl }}/glossary/{{ term.image_filename | urlencode }}?width=376&height=450&crop_gravity=north 2x"
     alt="{{ term.term }}"
     width="188" height="225">
```

Constraints:
- `| url` filter MUST be stripped. It corrupts absolute URLs by prepending pathPrefix.
- `width` and `height` HTML attributes retained (188×225) — match the Bunny Optimizer 1× params.
- Bunny Optimizer 1× params: `?width=188&height=225&crop_gravity=north`.
- Bunny Optimizer 2× params (srcset): `?width=376&height=450&crop_gravity=north 2x`.
- `srcset` uses width descriptor `2x` only (no pixel-width breakpoints in Phase 14).
- No Image Classes in the URL (Image Classes disabled — use direct query params per Phase 13 D-18).

Source: CONTEXT.md `<specifics>` and Phase 13 D-10 (Optimizer params confirmed).

---

### pnwm-taxon-browser.js — Nav Thumbnail and Species Card `<img>`

**Location:** `src/components/pnwm-taxon-browser.js`

**CDN constant (add at module level, before class definition):**
```js
const CDN_BASE_URL = 'https://pnwmoths.b-cdn.net';
```

**`_renderImageStrip` — line 143 (nav thumbnail image strip):**

Before:
```js
src="${this._prefix}images/${img.species_slug}/${img.filename}"
```

After (locked contract):
```js
src="${CDN_BASE_URL}/${img.species_slug}/${encodeURIComponent(img.filename)}?height=186"
```

Constraints:
- `?height=186` Bunny Optimizer param applied to nav thumbnails (Phase 13 D-11).
- `encodeURIComponent` applied to filename (handles reserved chars).
- `this._prefix` removed from image src construction entirely — CDN URL is absolute and not path-prefixed.
- `loading="lazy"` and inline style attributes unchanged.

**`_renderSpecies` — line 199 (species card nav image):**

Before:
```js
src="${this._prefix}images/${sp.navImage.species_slug}/${sp.navImage.filename}"
```

After (locked contract):
```js
src="${CDN_BASE_URL}/${sp.navImage.species_slug}/${encodeURIComponent(sp.navImage.filename)}?height=186"
```

Constraints:
- Same `?height=186` param as image strip (consistent nav thumbnail sizing).
- `encodeURIComponent` applied to filename.
- `this._prefix` removed from image src only (retain `${this._prefix}species/${sp.slug}/` for page links — path-prefix still required for non-image URLs).
- `alt` and `loading` attributes unchanged.

**No new Lit property added.** The `cdn-base-url` Lit attribute approach is dropped per CONTEXT.md D-05. The CDN_BASE_URL constant is hard-coded in the module. The `path-prefix` attribute remains for species page href construction only.

---

### browse/index.njk — No Changes

`src/browse/index.njk` passes only `path-prefix` to `<pnwm-taxon-browser>`. No `cdn-base-url` attribute is added (per CONTEXT.md D-05). This file requires no edits in Phase 14.

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Primary CTA | none — this phase has no interactive CTA elements |
| Empty state heading | "No photos on file for this species." (existing, unchanged — `src/species/species.njk` line 57) |
| Empty state body | none — the div with `aria-label="No images available for this species"` is the full empty state |
| Error state | none — no new error states introduced; CDN 404s are invisible to the user (images simply fail to load) |
| Destructive confirmation | none — no destructive actions in this phase |

Note: The empty-state markup at species.njk line 54–59 is NOT modified by this phase. CDN URL changes apply only to the `{% for img in spImages %}` loop.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none | not applicable — not a React project |
| third-party | none | not applicable |

No package registry changes in this phase. No new npm dependencies are added.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending

---

## Pre-Population Sources

| Source | Decisions Used |
|--------|---------------|
| CONTEXT.md | 8 (D-01 urlencode, D-02 cdnBaseUrl global, D-03 glossary srcset 2x, D-04 species srcset deferred, D-05 CDN_BASE_URL hard-coded in JS, D-10 Optimizer params, D-11 nav thumb height=186, D-18 Image Classes disabled) |
| REQUIREMENTS.md | 4 (TMPL-03, TMPL-04, TMPL-05, TMPL-06) |
| Codebase scan | 3 (theme.css token values, species.njk current markup, pnwm-taxon-browser.js image src lines 143+199) |
| User input | 0 |
