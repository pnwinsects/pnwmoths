# Phase 6: Make pages look like existing pnwmoths site — Context

**Gathered:** 2026-04-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Apply the visual identity of the existing pnwmoths.biol.wwu.edu site to every page of the static rebuild: cream background, black header/footer, moth-strip banner image, Google Fonts (Open Sans + Spinnaker), and a white content wrapper with box-shadow. Also update the homepage content (intro text + Browse CTA) to match the legacy site's homepage. No new features, no JS changes.

</domain>

<decisions>
## Implementation Decisions

### Content wrapper
- **D-01:** White content wrapper (`#ffffff` background, `box-shadow: 0 0 15px 5px rgba(50,50,50,0.25)`, `max-width: 1140px`, `padding: 24px`) applies **uniformly to all pages** — species, browse, search, glossary, and homepage. No per-page variation.

### Homepage content
- **D-02:** Update `src/index.njk` to match the legacy site's homepage layout: a short welcome paragraph plus a prominent "Browse all species" CTA link. **No featured image** — text + link only.
- **D-03:** Welcome text (exact copy for planner): *"A natural history catalog of Pacific Northwest moths. Browse by family and genus, search by name, or look up terms in the glossary."*
- **D-04:** Primary CTA: `<a href="/browse/">Browse all species</a>` — keep existing URL, existing wording (already matches UI-SPEC copywriting contract).

### Banner scope
- **D-05:** Banner image appears on **every page** (implemented in `base.njk`, not per-template). This matches the legacy site and is the simplest approach. No per-page opt-out needed.

### Claude's Discretion
- Banner image download mechanism (curl at build time vs. committed to repo — UI-SPEC says commit to `src/images/header.png`; implementation detail left to planner)
- Exact Pico CSS `--pico-primary` scoping strategy for the nav (see FLAG in UI-SPEC Dimension 3 — planner decides whether to scope to nav or accept broader application)
- Google Fonts `<link>` tag placement in `<head>` (before or after Pico CSS — planner decides)
- Whether `<header>` element wraps nav + banner, or banner is a sibling of `<nav>`

</decisions>

<specifics>
## Specific Ideas

- The existing site's header is distinctive: a horizontal strip of moth specimens pinned on black. This is the primary brand identity element — it should be clearly visible on every page, not tucked away.
- The cream background (`#f3e8ba`) is unusual and deliberate — it's the defining visual character of pnwmoths.biol.wwu.edu. Getting this right is the core goal of Phase 6.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### UI Design Contract
- `.planning/phases/06-make-pages-look-like-existing-pnwmoths-site-layout-colors-ba/06-UI-SPEC.md` — Complete visual contract: exact colors, fonts, spacing scale, layout contract, copywriting, Pico CSS override variables. This is the primary spec for Phase 6.

### Files to modify
- `src/_includes/base.njk` — Base layout template. Currently: `<nav>` + `<main>` + Pico CSS link + component script. Phase 6 adds: Google Fonts `<link>`, banner `<img>`, `<footer>`, and `<header>` wrapper. Apply `theme.css` link here.
- `src/index.njk` — Homepage template. Currently: bare `<h1>` + 3 link bullets. Phase 6 updates content to intro paragraph + Browse CTA.

### New file to create
- `src/styles/theme.css` — Pico CSS custom property overrides + layout rules. Does not exist yet. See UI-SPEC for exact override values.

No external ADRs. All decisions are captured above and in UI-SPEC.

</canonical_refs>

<code_context>
## Existing Code Insights

### Established Patterns
- All pages use `base.njk` as their layout via `layout: base.njk` frontmatter — a single template change affects the entire site
- Pico CSS loaded from `/css/pico.min.css` — the file lives in the built `_site/css/` output; source is in `public/` or equivalent static assets directory (planner should verify with `ls public/ src/css/ 2>/dev/null`)
- No `src/styles/` directory exists yet — `theme.css` is a new file that needs a new directory

### Integration Points
- `base.njk` is the single integration point for header/footer/banner — touching one file applies changes to all ~700 generated pages
- Eleventy static passthrough: CSS files in `src/css/` (or `public/`) are passed through to `_site/`; planner must confirm passthrough config in `.eleventy.js` and add `src/styles/` to passthrough if it's a new directory

</code_context>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope. Favicon update and dark mode variant were not raised.

</deferred>

---

*Phase: 06-make-pages-look-like-existing-pnwmoths-site-layout-colors-ba*
*Context gathered: 2026-04-15*
