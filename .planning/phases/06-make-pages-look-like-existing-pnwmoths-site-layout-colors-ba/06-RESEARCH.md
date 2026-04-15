# Phase 6: Make Pages Look Like Existing pnwmoths Site — Research

**Researched:** 2026-04-15
**Domain:** CSS styling, Eleventy templating, Pico CSS 2.x custom properties
**Confidence:** HIGH

---

## Summary

Phase 6 is a pure CSS/HTML change: apply the visual identity of `pnwmoths.biol.wwu.edu` to the Eleventy static rebuild. The work is well-scoped. All page templates inherit from `src/_includes/base.njk` via `layout: base.njk` frontmatter — a single template edit affects all ~700 generated pages. Two files are modified (`base.njk`, `src/index.njk`) and one is created (`src/styles/theme.css`). The banner image must be downloaded from the live site and committed.

The main technical risk is the Eleventy/Vite asset pipeline. CSS files in `src/` are NOT automatically passthroughed — each directory must be explicitly registered in `eleventy.config.js`. A new `src/styles/` directory requires a new `addPassthroughCopy` entry. The existing `pico.min.css` link in `base.njk` uses a hardcoded path (`/css/pico.min.css`) without Eleventy's `| url` filter, but the `pathPrefix` is `/pnwmoths/` — this inconsistency already exists in the codebase and the planner should follow the same pattern used by the pagefind stylesheet (`| url` filter) for the new `theme.css` link.

**Primary recommendation:** Create `src/styles/theme.css` with Pico CSS variable overrides, add a passthrough rule for `src/styles` in `eleventy.config.js`, then update `base.njk` to load the theme, add the banner image, wrap with a `<header>`, and add a `<footer>`. Download `header.png` from the live site with `curl` and commit to `src/images/`.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** White content wrapper (`#ffffff` background, `box-shadow: 0 0 15px 5px rgba(50,50,50,0.25)`, `max-width: 1140px`, `padding: 24px`) applies uniformly to all pages — species, browse, search, glossary, and homepage. No per-page variation.
- **D-02:** Update `src/index.njk` to match the legacy site's homepage layout: a short welcome paragraph plus a prominent "Browse all species" CTA link. No featured image — text + link only.
- **D-03:** Welcome text (exact copy): *"A natural history catalog of Pacific Northwest moths. Browse by family and genus, search by name, or look up terms in the glossary."*
- **D-04:** Primary CTA: `<a href="/browse/">Browse all species</a>` — keep existing URL, existing wording.
- **D-05:** Banner image appears on every page (implemented in `base.njk`, not per-template).

### Claude's Discretion

- Banner image download mechanism (curl at build time vs. committed to repo — UI-SPEC says commit to `src/images/header.png`; implementation detail left to planner)
- Exact Pico CSS `--pico-primary` scoping strategy for the nav (see FLAG in UI-SPEC Dimension 3 — planner decides whether to scope to nav or accept broader application)
- Google Fonts `<link>` tag placement in `<head>` (before or after Pico CSS)
- Whether `<header>` element wraps nav + banner, or banner is a sibling of `<nav>`

### Deferred Ideas (OUT OF SCOPE)

- None — discussion stayed within phase scope. Favicon update and dark mode variant were not raised.
</user_constraints>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Page background color | Browser / Client | — | Pure CSS `--pico-background-color` override |
| Content wrapper (white box + shadow) | Browser / Client | — | CSS rules in theme.css |
| Navigation styling (black bg, white text) | Browser / Client | — | CSS rules on `nav` element |
| Banner image delivery | CDN / Static | Frontend Server (SSR) | Image committed to repo, served as static asset via Eleventy passthrough |
| Footer HTML + content | Frontend Server (SSR) | — | Added in base.njk template, rendered at build time |
| Google Fonts loading | Browser / Client | CDN / Static | `<link>` tag in `<head>` — fetched from Google CDN at runtime |
| Homepage welcome copy | Frontend Server (SSR) | — | Static HTML in `src/index.njk`, rendered at build time |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Pico CSS | 2.1.1 | Base CSS framework | Already installed; classless semantic HTML |
| Google Fonts | CDN | Open Sans + Spinnaker | Already specified in UI-SPEC; matches legacy site fonts |

No new npm packages are required for this phase. All work is CSS + HTML.

**Version verification:** `@picocss/pico@2.1.1` confirmed in `package.json`. [VERIFIED: package.json]

---

## Architecture Patterns

### System Architecture Diagram

```
Google Fonts CDN ─────────────────────────────────┐
                                                   │ (runtime font load)
src/images/header.png (committed) ─────────────────┤
src/styles/theme.css ──────────────┐               │
  (Pico overrides + layout rules)  │               ▼
                                   ├──► base.njk ──► HTML page (all routes)
node_modules/@picocss/pico ────────┘       │
  (passthrough → /css/pico.min.css)        │
                                           ▼
                              <header> (black bg)
                                ├── <img src=header.png>  ← banner
                                └── <nav> (black bg, white links)
                              <main>
                                └── <div class="content-wrapper">  ← white box
                                      {{ content }}
                              <footer> (black bg, white text)
```

### Recommended Project Structure

The new file fits into the existing `src/` layout:

```
src/
├── _includes/
│   └── base.njk        # MODIFY: add theme.css link, banner img, header wrapper, footer
├── styles/             # CREATE directory
│   └── theme.css       # CREATE: Pico CSS variable overrides + layout rules
├── images/             # EXISTS: add header.png here
│   └── header.png      # DOWNLOAD from live site and commit
└── index.njk           # MODIFY: welcome paragraph + Browse CTA only
```

### Pattern 1: Pico CSS Custom Property Override

**What:** Override Pico CSS design tokens in `theme.css` via `:root` CSS custom properties. No Sass compilation needed — the distributed `pico.min.css` reads these at runtime.

**When to use:** Any time the site needs to deviate from Pico defaults while keeping Pico's component styles.

**Verified custom property names** [VERIFIED: Context7/picocss]:

```css
/* src/styles/theme.css */
:root {
  /* Page background — cream */
  --pico-background-color: #f3e8ba;

  /* Accent color — olive green from legacy site */
  --pico-primary: #a4ab78;
  --pico-primary-hover: #7f8956;

  /* Body font */
  --pico-font-family-sans-serif: 'Open Sans', Verdana, sans-serif;
  --pico-font-family: var(--pico-font-family-sans-serif);
}

/* Nav: override background explicitly — --pico-primary does not control nav bg */
nav {
  background-color: #000000;
  color: #ffffff;
}
nav a {
  color: #ffffff;
}
```

**Important:** `--pico-font-family-sans-serif` and `--pico-font-family` are the confirmed Pico 2.x variable names. The UI-SPEC listed both, which is correct. [VERIFIED: Context7/picocss]

### Pattern 2: Eleventy Passthrough Copy for new asset directories

**What:** Eleventy only copies files to `_site/` if they are registered. New directories require explicit `addPassthroughCopy` in `eleventy.config.js`.

**When to use:** Any time a new source directory with static assets is added under `src/`.

**Example** [VERIFIED: existing eleventy.config.js pattern]:

```js
// In eleventy.config.js — add alongside existing passthrough rules
eleventyConfig.addPassthroughCopy({ "src/styles": "styles" });
```

Then reference in `base.njk` as:
```html
<link rel="stylesheet" href="{{ '/styles/theme.css' | url }}">
```

**Critical:** Use the `| url` Eleventy filter so the `pathPrefix: "/pnwmoths/"` is applied correctly. The existing `/css/pico.min.css` hardcoded path is an inconsistency in the codebase — do NOT replicate that pattern for new files.

### Pattern 3: Banner image in header

**What:** A full-width black `<header>` containing the banner `<img>` and below it the `<nav>`.

**When to use:** Site-wide identity placement, implemented once in `base.njk`.

```html
<!-- In base.njk, replacing the bare <nav> -->
<header>
  <img src="{{ '/images/header.png' | url }}"
       alt="Pacific Northwest moths — a row of specimen photographs on black"
       style="display: block; max-width: 1140px; margin: 0 auto; width: 100%;">
  <nav data-pagefind-ignore>
    <ul>
      <li><a href="{{ '/' | url }}">Home</a></li>
      <li><a href="{{ '/browse/' | url }}">Browse</a></li>
      <li><a href="{{ '/search/' | url }}">Search</a></li>
      <li><a href="{{ '/glossary/' | url }}">Glossary</a></li>
    </ul>
  </nav>
</header>
```

**Note on Pico classless mode:** In Pico's classless variant, `<header>` inside `<body>` acts as a container (centered, constrained width). The black background must extend full viewport width, so either use `background-color` on `body` as well, or set `<header>` width to `100vw` / override Pico's container constraint. [VERIFIED: Context7/picocss classless docs]

### Pattern 4: Content wrapper

**What:** A `<div>` wrapping `{{ content | safe }}` inside `<main>` providing the white background and box-shadow.

```html
<main>
  <div class="content-wrapper">
    {{ content | safe }}
  </div>
</main>
```

```css
/* In theme.css */
.content-wrapper {
  background-color: #ffffff;
  max-width: 1140px;
  margin: 0 auto;
  padding: 24px;
  box-shadow: 0 0 15px 5px rgba(50, 50, 50, 0.25);
}
```

### Anti-Patterns to Avoid

- **Per-template CSS overrides:** All visual changes belong in `theme.css` + `base.njk`. Avoid adding style blocks to individual page templates (search page already has one for pagefind — leave that alone, it's a component-specific override).
- **Hardcoding `/pnwmoths/` prefix:** Always use `| url` filter for asset paths. Hardcoded prefixes break if `pathPrefix` changes.
- **Replacing `pico.min.css`:** The UI-SPEC says to override Pico's variables, not replace the stylesheet. Keep the existing `<link rel="stylesheet" href="/css/pico.min.css">`.
- **Forgetting the `src/images` passthrough:** `src/images/` is not in any current `addPassthroughCopy` rule. The images directory at the project root is for source species images, but `src/images/header.png` needs its own passthrough rule.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSS design tokens | Custom CSS variable system | Pico CSS `--pico-*` overrides | Already installed; single-file override is sufficient |
| Font loading | Self-host font files | Google Fonts `<link>` tag | Already specified in UI-SPEC; simpler, no build step |
| Banner download | Build script logic | `curl` at setup time, commit result | Image is static; committing avoids build-time network dependency |

---

## Common Pitfalls

### Pitfall 1: Pico classless `<header>` width constraint

**What goes wrong:** In Pico's classless version, semantic containers (`<header>`, `<main>`, `<footer>`) are width-constrained and centered by default. Setting `background-color: #000` on `<header>` will only paint a centered column black, not the full viewport width.

**Why it happens:** Pico's classless mode uses `max-width` and `margin: 0 auto` on these semantic elements as layout containers.

**How to avoid:** Override Pico's container constraint on `<header>` and `<footer>`:
```css
body > header,
body > footer {
  max-width: 100%;
  width: 100%;
  background-color: #000000;
  padding: 0;
}
```
Then constrain inner content (banner img, nav ul) to `max-width: 1140px` with `margin: auto`.

**Warning signs:** Black background only fills a centered strip, not edge-to-edge.

### Pitfall 2: Missing `src/images` passthrough rule

**What goes wrong:** `src/images/header.png` is placed in the source tree but does not appear in `_site/images/` after build.

**Why it happens:** No `addPassthroughCopy` rule covers `src/images/`. The existing species image handling uses `scripts/copy-images.js` (a post-Vite script) which targets a different source directory.

**How to avoid:** Add to `eleventy.config.js`:
```js
eleventyConfig.addPassthroughCopy({ "src/images": "images" });
```

**Warning signs:** `<img>` renders as broken image; `_site/images/` directory does not exist after build.

### Pitfall 3: `| url` filter missing on theme.css `<link>`

**What goes wrong:** CSS file loads on the dev server but 404s when deployed to GitHub Pages or any host using the `/pnwmoths/` path prefix.

**Why it happens:** Eleventy's `pathPrefix: "/pnwmoths/"` setting only applies when the `| url` filter is used. Hardcoded `/styles/theme.css` paths won't include the prefix.

**How to avoid:** Always write `href="{{ '/styles/theme.css' | url }}"`. Apply the same to the banner `<img src>`.

**Warning signs:** Styles missing in production; browser DevTools shows 404 for `/styles/theme.css` instead of `/pnwmoths/styles/theme.css`.

### Pitfall 4: Google Fonts load order

**What goes wrong:** Body text flashes in system font before Open Sans loads (FOUT — Flash of Unstyled Text).

**Why it happens:** Google Fonts `<link>` placed after Pico CSS `<link>` creates a dependency gap.

**How to avoid:** Place Google Fonts `<link>` before Pico CSS, and include `&display=swap` in the fonts URL to use `font-display: swap`. This matches best practice and the UI-SPEC.

### Pitfall 5: `--pico-primary` affects more than nav

**What goes wrong:** Setting `--pico-primary: #a4ab78` globally changes all Pico primary-color elements — buttons, form focus rings, links — to the olive green.

**Why it happens:** `--pico-primary` is Pico's global accent color used across components.

**How to avoid:** This is a Claude's Discretion item (CONTEXT.md). The planner must decide whether global application is acceptable (it is consistent with the legacy site's accent) or whether to scope `--pico-primary` to specific selectors. For a purely read-only natural history site with no forms, global application is acceptable — search page uses `var(--pico-primary)` in its pagefind `<style>` block, which will inherit correctly.

---

## Code Examples

### Google Fonts link (verified pattern)

```html
<!-- Source: Google Fonts standard embed; display=swap for FOUT mitigation -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600&family=Spinnaker&display=swap" rel="stylesheet">
```

### Download banner image with curl

```bash
curl -o src/images/header.png https://pnwmoths.biol.wwu.edu/media/images/header.png
```

HTTP 200 confirmed for this URL. [VERIFIED: curl probe, 2026-04-15]

### Eleventy passthrough additions for eleventy.config.js

```js
// Add alongside existing passthrough rules
eleventyConfig.addPassthroughCopy({ "src/styles": "styles" });
eleventyConfig.addPassthroughCopy({ "src/images": "images" });
```

### Homepage (src/index.njk) — updated content

```njk
---
layout: base.njk
title: PNW Moths
permalink: /index.html
---
<h1>PNW Moths</h1>
<p>A natural history catalog of Pacific Northwest moths. Browse by family and genus, search by name, or look up terms in the glossary.</p>
<a href="{{ '/browse/' | url }}">Browse all species</a>
```

Note: The welcome text in `src/index.njk` already matches D-03 verbatim. The only structural change needed is removing the `<ul>` with three links and replacing it with a single prominent CTA link.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate SCSS compilation | CSS custom properties in plain CSS | Pico CSS 2.x | No Sass build step needed — override variables in a plain `.css` file |
| `font-display: block` (blocks render) | `font-display: swap` | ~2019 Web Fonts best practice | Prevents invisible text; shows fallback font immediately |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Pico classless semantic containers (`<header>`, `<main>`, `<footer>`) apply `max-width` width constraints by default in Pico 2.1.1 | Pitfall 1, Pattern 3 | If wrong, the full-width black header may work without override — low impact, extra CSS is harmless |
| A2 | `src/images/` has no existing passthrough rule | Pitfall 2, Pattern 3 | Verified via `eleventy.config.js` grep — no rule found. [VERIFIED: eleventy.config.js] |

---

## Open Questions (RESOLVED)

1. **`| url` vs hardcoded path for CSS assets** — RESOLVED: Use `| url` filter for all new asset paths (`theme.css`, `header.png`, nav links). Do not replicate the bare `/css/pico.min.css` pattern, which may be a pre-existing bug with `pathPrefix`. Plans 06-01 and 06-02 use `| url` throughout.

2. **`<header>` wrapper structure** — RESOLVED: Banner and nav are both wrapped in a single `<header>` element in `base.njk`. This matches semantic HTML convention and the legacy site structure. Pico's classless `<header>` max-width is overridden to `100%` in `theme.css` with inner content constrained to 1140px.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| curl | Download `header.png` | ✓ | 8.7.1 | wget or manual download |
| Node.js | Eleventy build | ✓ | 22.20.0 | — |
| pnwmoths.biol.wwu.edu/media/images/header.png | Banner image | ✓ | — (HTTP 200 confirmed) | — |

[VERIFIED: curl probe 2026-04-15, `node --version`]

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner (`node --test`) |
| Config file | none — invoked via `npm test` script |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| — | CSS applies correctly (cream bg, black header/footer, white wrapper) | manual / visual | Build + inspect `_site/index.html` for expected classes/elements | ❌ no automated test — visual verification |
| — | Banner image present in all generated HTML | smoke | `grep -l 'header.png' _site/**/*.html` | ❌ Wave 0 if automated check desired |
| — | Google Fonts link present in all pages | smoke | `grep -l 'fonts.googleapis.com' _site/**/*.html` | ❌ Wave 0 if automated check desired |
| — | Homepage matches D-02/D-03/D-04 copy | manual | Inspect `_site/index.html` | ❌ manual |
| — | Build succeeds without errors | smoke | `npm run build:eleventy` | ✅ existing build pipeline |

### Sampling Rate

- **Per task commit:** `npm run build:eleventy` (confirm build succeeds)
- **Per wave merge:** `npm test` (existing unit tests) + visual spot-check of `_site/index.html`
- **Phase gate:** `npm run build:eleventy` green + visual review of at least 3 page types (homepage, species page, browse page)

### Wave 0 Gaps

- No new test files required — this phase is pure HTML/CSS with no JavaScript logic to unit-test.
- Visual verification is the acceptance criterion. The existing `npm test` suite tests JS components unaffected by this phase.

---

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | no | Static HTML/CSS, no user input |
| V6 Cryptography | no | — |

No security concerns for a pure HTML/CSS styling phase. The Google Fonts CDN link is an external dependency — standard practice for public sites, no credentials involved.

---

## Sources

### Primary (HIGH confidence)
- Context7 `/websites/picocss` — verified `--pico-background-color`, `--pico-font-family`, `--pico-font-family-sans-serif`, `--pico-primary`, classless container behavior
- `eleventy.config.js` (project file) — verified all existing passthrough copy rules; confirmed no `src/styles` or `src/images` entries
- `src/_includes/base.njk` (project file) — verified current structure: bare nav, no header/footer, pico.min.css link pattern
- `package.json` (project file) — verified `@picocss/pico@2.1.1`, no new CSS dependencies needed
- `src/index.njk` (project file) — verified current homepage content matches D-03 text verbatim; structural change only needed

### Secondary (MEDIUM confidence)
- Google Fonts embed pattern — standard `<link>` with `display=swap`; confirmed working pattern

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; existing Pico CSS 2.1.1 confirmed, custom property names verified via Context7
- Architecture: HIGH — single template change pattern confirmed by reading all templates; passthrough mechanism confirmed by existing config
- Pitfalls: HIGH — classless container width issue verified in Context7 docs; passthrough gap verified in config file

**Research date:** 2026-04-15
**Valid until:** 2026-05-15 (stable stack — Pico CSS, Eleventy, Google Fonts)
