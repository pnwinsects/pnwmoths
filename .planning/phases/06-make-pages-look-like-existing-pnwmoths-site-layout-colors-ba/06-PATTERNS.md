# Phase 6: Make Pages Look Like Existing pnwmoths Site — Pattern Map

**Mapped:** 2026-04-15
**Files analyzed:** 3 (2 modified, 1 created)
**Analogs found:** 2 / 3

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/_includes/base.njk` | layout template | request-response (SSR) | `src/_includes/base.njk` (self — extend existing) | self |
| `src/index.njk` | page template | request-response (SSR) | `src/browse/index.njk` | role-match |
| `src/styles/theme.css` | config/style | transform (CSS variables) | none | no analog |
| `eleventy.config.js` | config | transform | `eleventy.config.js` (self — extend existing) | self |

---

## Pattern Assignments

### `src/_includes/base.njk` (layout template — modify)

**Analog:** self — read the existing file and extend it.

**Current file** (`src/_includes/base.njk`, lines 1–24):
```njk
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{ title or "PNW Moths" }}</title>
  <link rel="stylesheet" href="/css/pico.min.css">
  {% if pagefindUi %}<link rel="stylesheet" href="{{ '/pagefind/pagefind-ui.css' | url }}">{% endif %}
</head>
<body>
  <nav data-pagefind-ignore>
    <ul>
      <li><a href="{{ '/' | url }}">Home</a></li>
      <li><a href="{{ '/browse/' | url }}">Browse</a></li>
      <li><a href="{{ '/search/' | url }}">Search</a></li>
      <li><a href="{{ '/glossary/' | url }}">Glossary</a></li>
    </ul>
  </nav>
  <main>
    {{ content | safe }}
  </main>
  <script type="module" src="/components/main.js"></script>
</body>
</html>
```

**Key patterns to preserve:**
- Conditional `pagefindUi` stylesheet uses `| url` filter (line 8) — use the same filter for `theme.css` link
- Nav links all use `| url` filter (lines 13–16) — use same for banner `<img src>` and footer links
- `{{ content | safe }}` is the content injection point (line 21)

**Additions required:**

1. **Google Fonts `<link>` in `<head>` — place BEFORE `pico.min.css`:**
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,400;0,600&family=Spinnaker&display=swap" rel="stylesheet">
```

2. **`theme.css` `<link>` in `<head>` — place AFTER `pico.min.css`:**
```njk
<link rel="stylesheet" href="{{ '/styles/theme.css' | url }}">
```
Note: Uses `| url` filter — matches the `pagefind-ui.css` pattern on line 8, NOT the bare `/css/pico.min.css` pattern on line 7.

3. **Replace bare `<nav>` with `<header>` wrapping banner + nav:**
```njk
<header>
  <img src="{{ '/images/header.png' | url }}"
       alt="Pacific Northwest moths — a row of specimen photographs on black">
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

4. **Wrap `{{ content | safe }}` in `.content-wrapper` div:**
```njk
<main>
  <div class="content-wrapper">
    {{ content | safe }}
  </div>
</main>
```

5. **Add `<footer>` after `<main>`, before `<script>`:**
```html
<footer>
  <p>Pacific Northwest Moths. Licensed under <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/">Creative Commons Attribution-NonCommercial-ShareAlike 4.0</a>.</p>
</footer>
```

---

### `src/index.njk` (page template — modify)

**Analog:** `src/browse/index.njk` (same role: a top-level page template using `base.njk` layout with static content body)

**Analog pattern** (`src/browse/index.njk`, lines 1–6 — frontmatter structure to copy):
```njk
---
layout: base.njk
title: Browse — PNW Moths
permalink: /browse/index.html
---
<h1>Browse all species</h1>
```

**Current file** (`src/index.njk`, lines 1–13 — entire file):
```njk
---
layout: base.njk
title: PNW Moths
permalink: /index.html
---
<h1>PNW Moths</h1>
<p>A natural history catalog of Pacific Northwest moths. Browse by family and genus, search by name, or look up terms in the glossary.</p>
<ul>
  <li><a href="{{ '/browse/' | url }}">Browse all species</a></li>
  <li><a href="{{ '/search/' | url }}">Search</a></li>
  <li><a href="{{ '/glossary/' | url }}">Glossary</a></li>
</ul>
```

**Change required:** Replace `<ul>` with three `<li>` links with a single standalone `<a>` CTA. The `<h1>` and `<p>` are already correct per D-03. The frontmatter stays unchanged.

**Target body** (D-02, D-03, D-04 from CONTEXT.md):
```njk
<h1>PNW Moths</h1>
<p>A natural history catalog of Pacific Northwest moths. Browse by family and genus, search by name, or look up terms in the glossary.</p>
<a href="{{ '/browse/' | url }}">Browse all species</a>
```

**`| url` filter pattern** — copy from `src/search/index.njk` line 19 and existing `src/index.njk` line 9:
```njk
{{ '/browse/' | url }}
```

---

### `src/styles/theme.css` (config/style — create new)

**Analog:** None. No CSS files exist under `src/` in this project. The project has no authored stylesheets yet — only the passthrough-copied `pico.min.css` from `node_modules`.

**Use RESEARCH.md patterns directly.** The complete content is fully specified between RESEARCH.md and UI-SPEC.md. Key sections:

**Pico CSS variable overrides (`:root` block):**
```css
:root {
  --pico-background-color: #f3e8ba;
  --pico-primary: #a4ab78;
  --pico-primary-hover: #7f8956;
  --pico-font-family-sans-serif: 'Open Sans', Verdana, sans-serif;
  --pico-font-family: var(--pico-font-family-sans-serif);
}
```

**Full-width header/footer override (Pitfall 1 from RESEARCH.md):**
```css
body > header,
body > footer {
  max-width: 100%;
  width: 100%;
  background-color: #000000;
  color: #ffffff;
  padding: 0;
}
```

**Nav link colors:**
```css
nav a {
  color: #ffffff;
  text-decoration: none;
}
```

**Content wrapper (D-01 from CONTEXT.md):**
```css
.content-wrapper {
  background-color: #ffffff;
  max-width: 1140px;
  margin: 0 auto;
  padding: 24px;
  box-shadow: 0 0 15px 5px rgba(50, 50, 50, 0.25);
}
```

**Banner image centering:**
```css
body > header img {
  display: block;
  max-width: 1140px;
  margin: 0 auto;
  width: 100%;
}
```

**Heading font (Spinnaker per UI-SPEC typography table):**
```css
h1, h2, h3, h4, h5, h6 {
  font-family: 'Spinnaker', 'Open Sans', sans-serif;
}
```

---

### `eleventy.config.js` (config — modify)

**Analog:** self — extend existing passthrough copy rules.

**Existing passthrough pattern** (`eleventy.config.js`, lines 17–28):
```js
eleventyConfig.addPassthroughCopy({ "data/parquet": "species" });

eleventyConfig.addPassthroughCopy({
  "node_modules/@picocss/pico/css/pico.min.css": "css/pico.min.css"
});

eleventyConfig.addPassthroughCopy({ "src/components": "components" });
```

**Additions required — follow identical object-shorthand pattern:**
```js
// Add after existing passthrough rules, before the Vite plugin
eleventyConfig.addPassthroughCopy({ "src/styles": "styles" });
eleventyConfig.addPassthroughCopy({ "src/images": "images" });
```

Both entries are needed: `src/styles` for `theme.css`, `src/images` for `header.png`. Neither directory is covered by any existing rule (verified: no `src/styles` or `src/images` entry in `eleventy.config.js`).

---

## Shared Patterns

### Eleventy `| url` filter for asset paths

**Source:** `src/_includes/base.njk` line 8; `src/search/index.njk` line 19
**Apply to:** All new asset paths in `base.njk` (theme.css link, banner img src) and all link hrefs in page templates

```njk
{{ '/path/to/asset' | url }}
```

This applies `pathPrefix: "/pnwmoths/"` so assets resolve correctly on GitHub Pages deployment. Do NOT use bare paths like `/styles/theme.css` — the existing `/css/pico.min.css` pattern is a pre-existing inconsistency, not a pattern to copy.

### Frontmatter structure for page templates

**Source:** All page templates (`src/index.njk`, `src/browse/index.njk`, `src/search/index.njk`)
**Apply to:** No new page templates in this phase — pattern shown for reference only

```njk
---
layout: base.njk
title: Page Title — PNW Moths
permalink: /page/index.html
---
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/styles/theme.css` | config/style | transform | No CSS files exist under `src/` — this is the first authored stylesheet in the project. Use RESEARCH.md + UI-SPEC.md patterns directly. |

---

## Metadata

**Analog search scope:** `src/` (all `.njk` templates), `eleventy.config.js`, project root
**Files scanned:** 8 (base.njk, index.njk, browse/index.njk, browse/genus.njk, glossary/index.njk, search/index.njk, species/species.njk, eleventy.config.js)
**Pattern extraction date:** 2026-04-15
