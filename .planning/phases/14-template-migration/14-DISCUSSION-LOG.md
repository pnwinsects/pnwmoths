# Phase 14: Template Migration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-22
**Phase:** 14-template-migration
**Areas discussed:** URL Encoding, srcset Scope & Dimensions, Taxon Browser CDN Wiring

---

## URL Encoding

| Option | Description | Selected |
|--------|-------------|----------|
| Custom urlencode filter | `addFilter("urlencode", v => encodeURIComponent(v))` in eleventy.config.js. Handles all reserved chars in Django filenames (spaces, parens, +, #). Used as `{{ img.filename \| urlencode }}`. | ✓ |
| Inline replace | `{{ img.filename \| replace(' ', '%20') }}`. Zero config but only handles spaces — other reserved chars silently broken. | |

**User's choice:** Custom urlencode filter
**Notes:** Advisor research confirmed Django filenames contain chars beyond spaces that `replace` silently mishandles.

---

## srcset Scope & Dimensions

| Option | Description | Selected |
|--------|-------------|----------|
| Glossary only | Glossary portraits have fixed 188×225px dimensions; 2× srcset is `?width=376&height=450&crop_gravity=north 2x`. No component changes needed. | ✓ |
| Both glossary + species | Update `pnwm-image-slideshow.js` to also read `srcset` from slotted figures in `connectedCallback`; pass through in render(). Requires choosing canonical 1× display width (suggested 800px). | |

**User's choice:** Glossary only for now
**Notes:** Advisor research found that `pnwm-image-slideshow.js` reads only `src` and `alt` from slotted `<figure><img>` in `connectedCallback` (line 80) — a `srcset` attribute on static Nunjucks HTML is silently dropped. Species srcset is effectively dead markup without a component update.

---

## Taxon Browser CDN Wiring

| Option | Description | Selected |
|--------|-------------|----------|
| Hard-code CDN in the component | Inline `const CDN_BASE_URL = 'https://pnwmoths.b-cdn.net'` at top of `pnwm-taxon-browser.js`. Only 1 file changes. `path-prefix` stays for species page links. | ✓ |
| Pass cdn-base-url from template | Add `addGlobalData`, new attribute in browse/index.njk, new Lit property. 3 files. More explicit if CDN URL varies per environment. | |

**User's choice:** Hard-code CDN in the component
**Notes:** CDN URL is already declared a fixed public constant in eleventy.config.js. Unlike `path-prefix` (which varies between GitHub Pages and local), CDN URL is the same everywhere. No reason to add attribute plumbing.

---

## Claude's Discretion

- Whether to add Optimizer query params (e.g. width cap) to species photo CDN URLs in species.njk — deferred to planner

## Deferred Ideas

- Species photo srcset — requires slideshow component update; deferred to a follow-up phase
- Optimizer width cap on species factsheet photos — not required by Phase 14 success criteria
