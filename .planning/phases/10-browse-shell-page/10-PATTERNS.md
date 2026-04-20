# Phase 10: Browse Shell Page - Pattern Map

**Mapped:** 2026-04-20
**Files analyzed:** 3 (1 rewrite + 2 deletes; analogs extracted for the rewrite only)
**Analogs found:** 3 / 1 (multiple analogs for the single rewritten template)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/browse/index.njk` | template (page) | transform (data tree → HTML + JSON embed) | `src/species/species.njk` | role-match (same: custom element + noscript, same data-driven loop) |
| `src/browse/genus.njk` | — | — | deleted; no analog needed | — |
| `src/_data/families.js` | — | — | deleted; no analog needed | — |

---

## Pattern Assignments

### `src/browse/index.njk` (template, transform)

This file is the only file being written. It replaces the current 14-line template with a new structure: frontmatter, a JSON data embed script, a bare custom element placeholder, and a noscript fallback.

**Analog 1:** `src/species/species.njk` — best structural match (custom element placement, noscript block, URL generation with `| url` filter, data-driven loops)

**Analog 2:** `src/search/index.njk` — noscript pattern and inline `<script>` within a base.njk-layout page

**Analog 3:** `src/glossary/index.njk` — multi-level nested loop over Eleventy global data

---

#### Frontmatter pattern

Source: `src/browse/index.njk` lines 1–5 (current file) and `src/search/index.njk` lines 1–6

```
---
layout: base.njk
title: Browse — PNW Moths
permalink: /browse/index.html
---
```

Rules:
- `layout: base.njk` — all page templates use this
- `title` key — consumed by `{{ title or "PNW Moths" }}` in `src/_includes/base.njk` line 6
- `permalink` key — explicit `.html` suffix; matches pattern in every other page template

---

#### Custom element placeholder pattern

Source: `src/species/species.njk` lines 33–39 (pnwm-filter-bar, pnwm-occurrence-map, pnwm-phenology-chart placements)

```nunjucks
<pnwm-filter-bar slug="{{ sp.slug }}" data-pagefind-ignore></pnwm-filter-bar>
<pnwm-occurrence-map slug="{{ sp.slug }}" data-pagefind-ignore></pnwm-occurrence-map>
```

For Phase 10, `<pnwm-taxon-browser>` takes no attributes (data comes from the sibling script element, not an attribute). Per UI-SPEC.md constraint 3, the element has no attributes:

```html
<pnwm-taxon-browser></pnwm-taxon-browser>
```

`data-pagefind-ignore` goes on the `<script>` element, not on the custom element itself.

---

#### JSON data embed pattern

No existing analog in the codebase — this is the first use of `<script type="application/json">` in the project. Use the `| tojson` Nunjucks filter (confirmed available in CONTEXT.md code_context).

The pattern follows the UI-SPEC.md constraint 1–2:

```nunjucks
<script type="application/json" id="taxon-data" data-pagefind-ignore>
  {{ taxon | tojson }}
</script>
```

Notes:
- `type="application/json"` — browser does not execute this block
- `id="taxon-data"` — Phase 11 component reads via `document.getElementById('taxon-data')`
- `data-pagefind-ignore` — prevents Pagefind indexing raw JSON (per STATE.md blocker and UI-SPEC constraint 2)
- `taxon` is the Eleventy global data variable from `src/_data/taxon.js` — available automatically in all templates

---

#### Noscript block pattern

Source: `src/search/index.njk` lines 25–27 (noscript shell with `data-pagefind-ignore`)

```nunjucks
<noscript data-pagefind-ignore>
  <p>Search requires JavaScript. <a href="{{ '/browse/' | url }}">Browse all species</a> instead.</p>
</noscript>
```

Source for nested loop structure: `src/glossary/index.njk` lines 16–38 (two-level loop) and CONTEXT.md `<specifics>` block

The Phase 10 noscript block uses a four-level loop — the structure from CONTEXT.md specifics:

```nunjucks
<noscript>
  {% for family in taxon %}
    <h2>{{ family.name }}</h2>
    {% for subfam in family.subfamilies %}
      {% if subfam.name %}
        <h3>{{ subfam.name }}</h3>
      {% endif %}
      {% for genus in subfam.genera %}
        <h4>{{ genus.name }}</h4>
        <ul>
          {% for sp in genus.species %}
            <li><a href="{{ ('/species/' + sp.slug + '/') | url }}">
              <em>{{ genus.name }} {{ sp.name }}</em>
              {% if sp.common_name %} — {{ sp.common_name }}{% endif %}
            </a></li>
          {% endfor %}
        </ul>
      {% endfor %}
    {% endfor %}
  {% endfor %}
</noscript>
```

Key rules (per CONTEXT.md decisions):
- D-06: When `subfam.name` is null, skip the `<h3>` — genera render directly under the family `<h2>`
- D-04/D-05: Species link to `/species/{slug}/` using `| url` filter
- Heading levels: h2 (family) → h3 (subfamily, conditional) → h4 (genus) → ul/li (species)
- Species data shape from `src/_data/taxon.js` line 110: `{ slug, name, common_name }`

---

#### URL generation pattern

Source: `src/species/species.njk` line 50, `src/glossary/index.njk` line 28, `src/index.njk` line 8

```nunjucks
{{ ('/species/' + sp.slug + '/') | url }}
{{ ('/images/glossary/' + term.image_filename) | url }}
{{ '/browse/' | url }}
```

Pattern: always use `| url` filter on path strings. Trailing slash on directory paths. Path built via string concatenation in the template expression.

---

## Shared Patterns

### Layout inheritance
**Source:** Every `.njk` in `src/` except `_includes/base.njk` itself
**Apply to:** `src/browse/index.njk`

```
---
layout: base.njk
---
```

`src/_includes/base.njk` wraps all page content in `<main><div class="content-wrapper">{{ content | safe }}</div></main>` (lines 27–30) and loads `<script type="module" src="/components/main.js"></script>` (line 35). No changes to base.njk or main.js are needed in Phase 10.

### Noscript placement
**Source:** `src/species/species.njk` lines 36–38, `src/search/index.njk` lines 25–27
**Apply to:** `src/browse/index.njk`

```nunjucks
<noscript data-pagefind-ignore>
  ...
</noscript>
```

`data-pagefind-ignore` on the noscript element prevents Pagefind from indexing the static fallback content (consistent with usage on species page).

### data-pagefind-ignore
**Source:** `src/species/species.njk` lines 33–38 (on custom elements and noscript)
**Apply to:** `src/browse/index.njk` — on `<script type="application/json">` and on `<noscript>`

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `<script type="application/json" id="taxon-data">` pattern | embed | transform | No existing JSON data embed in any template; `tojson` filter not previously used |

The `| tojson` filter is confirmed available in CONTEXT.md code_context ("tojson filter available in Eleventy/Nunjucks for JSON serialization inside templates"). No codebase example exists to copy from; use it directly.

---

## Files Being Deleted (no pattern work needed)

| File | Action | Note |
|------|--------|------|
| `src/browse/genus.njk` | Delete | Eleventy pagination template generating `/browse/{genus}/` pages; retiring removes those static pages from the build |
| `src/_data/families.js` | Delete | Only consumed by `browse/index.njk` (rewritten) and `genus.njk` (deleted); safe to remove after both template files are handled |

**Delete order:** Delete `src/_data/families.js` and `src/browse/genus.njk` together (or `genus.njk` first); the rewritten `src/browse/index.njk` must not reference `families` at all.

---

## Metadata

**Analog search scope:** `src/**/*.njk`, `src/_data/*.js`, `src/components/main.js`
**Files scanned:** 9
**Pattern extraction date:** 2026-04-20
