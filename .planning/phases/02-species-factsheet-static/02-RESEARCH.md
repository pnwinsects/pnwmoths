# Phase 2: Species Factsheet (Static) — Research

**Researched:** 2026-04-11
**Domain:** Eleventy 3 templating, Nunjucks patterns, Pico CSS, DuckDB schema extension, Git LFS
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Image Data Model:**
- Storage: `data/images.csv` — flat CSV, same pattern as `data/species.csv` and `data/records.csv`
- Columns: `species_id`, `filename`, `photographer`, `weight` (display order), `license`
- File location: `images/{slug}/` — e.g. `images/acronicta-americana/01.jpg`; tracked via Git LFS
- Build query: DuckDB joins images to species at build time; template iterates over per-species image array
- Empty state: Species with no images display a graceful placeholder (no broken `<img>` tags)

**Base Layout and Styling:**
- CSS approach: Classless CSS framework — single stylesheet drop-in, Pico CSS (`@picocss/pico`)
- Base template: Shared Eleventy layout (`src/_includes/base.njk`) used by all page types
- Navigation: Site-wide nav includes all four links — Home, Browse, Search, Glossary — from Phase 2 onward
- Search and Glossary point to stub pages with "coming soon" message until Phase 4
- Nav structure: `<nav>` in base layout, links use relative paths consistent with slug-based URL structure

**Data Model Gaps (Claude's Discretion — already resolved):**
- Family field: Add `family` column to `data/species.csv`. No separate lookup table needed.
- Similar species: Add `similar_species` column to `data/species.csv` as pipe-separated list of slugs (e.g. `acronicta-innotata|acronicta-retardata`)
- Prose Markdown location: `content/species/{slug}.md`

### Claude's Discretion

Data model gaps (resolved above). CSS framework choice resolved as Pico CSS.

### Deferred Ideas (OUT OF SCOPE)

None surfaced during discussion.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SPEC-02 | Each species page includes: scientific name, common name, NOC ID, authority, and a prose description from a per-species Markdown file (if present) | Nunjucks `{% include "..." ignore missing %}` pattern; base layout inheritance; `species.js` extension to include `family` |
| SPEC-03 | Each species page displays photos with photographer credit; image files tracked via Git LFS | New `data/images.csv` + `src/_data/images.js` DuckDB query; passthrough copy for `images/`; `<figure>/<figcaption>` HTML |
| SPEC-04 | Each species page shows a list of similar species with links | `similar_species` pipe-delimited column split in DuckDB or template; link to `/species/{slug}/` |
| BRWS-01 | A browse page lists all species grouped by family then genus | New `src/_data/families.js` DuckDB query returning family/genus tree; single browse template |
| BRWS-02 | Each genus has a listing page showing all its species | New `src/browse/genus.njk` paginated template with genus data; genus-slug permalink |
| BRWS-03 | Site-wide navigation links to browse, search, glossary, and home | `src/_includes/base.njk` with `<nav>` block; stub pages for Search and Glossary |
</phase_requirements>

---

## Summary

Phase 2 builds on the Phase 1 scaffold (5 species, working build, DuckDB data pipeline) to produce complete static factsheets and browse pages. The work divides into three areas: (1) extending the data model (two new CSV columns, one new CSV file), (2) rewriting the species template with layout inheritance and new content sections, and (3) generating three new page types (all-species browse, per-genus browse, stubs for search and glossary).

The Eleventy 3 + Nunjucks stack already handles all required patterns. No new build tools are needed. Pico CSS delivers the styling entirely through semantic HTML elements with no custom classes, which aligns perfectly with the "classless CSS" decision. Git LFS is installed (`git-lfs/3.7.1` confirmed) but not yet configured for this repo — setup requires adding `.gitattributes` and tracking the `images/` directory.

The prose Markdown inclusion problem (optional per-species `.md` files) is solved cleanly by Nunjucks' built-in `{% include "..." ignore missing %}` directive. No custom shortcode or file-existence filter is needed.

**Primary recommendation:** Three distinct Eleventy data files (`species.js` extended, `images.js` new, `families.js` new), one base layout, one expanded species template, one browse-all template, two stub templates, and a genus pagination template. All DuckDB queries; no JavaScript in the browser.

---

## Standard Stack

### Core (already installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@11ty/eleventy` | 3.1.5 [VERIFIED: node_modules] | Static site generation, pagination, Nunjucks templating | Already in use from Phase 1 |
| `@duckdb/node-api` | 1.5.1-r.2 [VERIFIED: node_modules] | Build-time SQL queries across CSV/Parquet data | Already in use from Phase 1 |
| `csv-parse` | 6.2.1 [VERIFIED: node_modules] | CSV validation in build-data.js | Already in use from Phase 1 |

### New in Phase 2

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@picocss/pico` | 2.1.1 [VERIFIED: npm registry] | Classless CSS — styles semantic HTML with no custom classes | Locked decision; official CDN path confirmed: `node_modules/@picocss/pico/css/pico.min.css` |

### Not Needed (confirmed out-of-scope)

| Tool | Reason |
|------|--------|
| markdown-it / remark | Eleventy handles `.md` includes natively via Nunjucks `include` |
| Vite / bundler | Phase 3; no client-side JS in Phase 2 |
| Pagefind | Phase 4 |
| Any image processing tool | Images served as-is; no resizing/optimization in Phase 2 |

**Installation:**
```bash
npm install @picocss/pico
```

---

## Architecture Patterns

### Recommended Project Structure (additions to Phase 1)

```
data/
  species.csv         # add: family, similar_species columns
  images.csv          # new: species_id, filename, photographer, weight, license
images/               # new: Git LFS-tracked image files
  acronicta-americana/
    01.jpg
content/
  species/            # new: optional prose markdown per species
    acronicta-americana.md
src/
  _includes/
    base.njk          # new: shared layout (nav + main wrapper)
  _data/
    species.js        # extend: add family, similar_species to SELECT
    images.js         # new: DuckDB join images -> grouped by species
    families.js       # new: DuckDB GROUP BY family, genus for browse
  species/
    species.njk       # rewrite: use layout, add all content sections
  browse/
    index.njk         # new: all-species browse page (family/genus tree)
    genus.njk         # new: paginated per-genus listing page
  search/
    index.njk         # new: stub page ("Search coming soon")
  glossary/
    index.njk         # new: stub page ("Glossary coming soon")
```

### Pattern 1: Base Layout Inheritance (Nunjucks extends)

**What:** All pages extend `base.njk` which provides `<head>`, `<nav>`, and `<main>` wrapper. The Pico CSS stylesheet is linked once in `<head>`.

**When to use:** Every page template.

```nunjucks
{# src/_includes/base.njk #}
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>{% block title %}PNW Moths{% endblock %}</title>
  <link rel="stylesheet" href="/css/pico.min.css">
</head>
<body>
  <nav>
    <ul>
      <li><a href="/">Home</a></li>
      <li><a href="/browse/">Browse</a></li>
      <li><a href="/search/">Search</a></li>
      <li><a href="/glossary/">Glossary</a></li>
    </ul>
  </nav>
  <main>
    {% block content %}{% endblock %}
  </main>
</body>
</html>
```

```nunjucks
{# src/species/species.njk — front matter snippet #}
---
layout: base.njk
pagination:
  data: species
  size: 1
  alias: sp
permalink: "species/{{ sp.slug }}/index.html"
---
```

**Eleventy layout key:** `layout: base.njk` in front matter activates inheritance. [VERIFIED: Eleventy 3 docs, https://www.11ty.dev/docs/layouts/]

### Pattern 2: Optional Prose Include (Nunjucks `ignore missing`)

**What:** Nunjucks has a built-in `ignore missing` modifier that suppresses errors when an included file doesn't exist. This is the correct zero-custom-code solution for optional per-species Markdown.

**When to use:** Species prose description (SPEC-02 "if present").

```nunjucks
{# Inside species.njk content block #}
{% include ("content/species/" + sp.slug + ".md") ignore missing %}
```

**Caveat:** The path must be relative to the Eleventy input directory (`src/`). Since `content/species/` is outside `src/`, either move prose files inside `src/content/species/` or configure `templateFormats` to allow Markdown includes from project root. Placing prose under `src/content/species/{slug}.md` is the simplest solution. [VERIFIED: Nunjucks templating docs https://mozilla.github.io/nunjucks/templating.html#include] [ASSUMED: Eleventy will process `.md` included via Nunjucks `include` — this needs a quick smoke-test; the `renderFile` shortcode from the Render plugin is the verified fallback if `include` doesn't render Markdown]

**Fallback if `include` doesn't render Markdown:** Use the Eleventy Render plugin's `{% renderFile %}` shortcode, which is bundled with Eleventy core and explicitly handles `.md` → HTML via file extension inference. [VERIFIED: https://www.11ty.dev/docs/plugins/render/]

### Pattern 3: DuckDB Images Join

**What:** `src/_data/images.js` queries `data/images.csv`, joins to species, and returns an object keyed by `species_id` (or slug). The species data file enriches each species row with its images array.

**When to use:** SPEC-03 photo display.

```javascript
// src/_data/images.js
import { DuckDBInstance } from '@duckdb/node-api';

export default async function () {
  const db = await DuckDBInstance.create(':memory:');
  const conn = await db.connect();

  await conn.run(`
    CREATE TABLE images AS
    SELECT * FROM read_csv('data/images.csv',
      header = true,
      columns = {
        'species_id': 'INTEGER',
        'filename': 'VARCHAR',
        'photographer': 'VARCHAR',
        'weight': 'INTEGER',
        'license': 'VARCHAR'
      }
    )
  `);

  const result = await conn.runAndReadAll(`
    SELECT species_id, filename, photographer, weight, license
    FROM images
    ORDER BY species_id, weight
  `);

  conn.closeSync();

  // Group by species_id for O(1) template lookup
  const rows = result.getRowObjectsJS();
  const bySpecies = {};
  for (const row of rows) {
    const id = row.species_id;
    if (!bySpecies[id]) bySpecies[id] = [];
    bySpecies[id].push(row);
  }
  return bySpecies;
}
```

Then in `species.js`, the SELECT adds the images lookup; or the template accesses `images[sp.id]` directly since both are global data files. [ASSUMED: Eleventy makes all `_data/` files available as top-level globals in templates — this is standard Eleventy behavior from Phase 1 precedent, confirmed by `species` being used as pagination data source already]

### Pattern 4: Family/Genus Browse Data

**What:** `src/_data/families.js` returns a structured object for the all-species browse page (BRWS-01). A separate data file or the same file also produces a flat array of genus objects for BRWS-02 per-genus pagination.

```javascript
// src/_data/families.js — returns data for browse/index.njk and browse/genus.njk
import { DuckDBInstance } from '@duckdb/node-api';

export default async function () {
  const db = await DuckDBInstance.create(':memory:');
  const conn = await db.connect();

  await conn.run(`
    CREATE TABLE species AS
    SELECT * FROM read_csv('data/species.csv', header=true,
      columns={
        'id':'INTEGER','genus':'VARCHAR','species':'VARCHAR',
        'common_name':'VARCHAR','noc_id':'VARCHAR','authority':'VARCHAR','family':'VARCHAR',
        'similar_species':'VARCHAR'
      })
  `);

  // For browse/index.njk: all genera with their family, sorted
  const generaResult = await conn.runAndReadAll(`
    SELECT DISTINCT family, genus,
      lower(genus) AS genus_slug
    FROM species
    ORDER BY family, genus
  `);

  // For browse/{genus-slug}/: each genus with its species list
  const speciesResult = await conn.runAndReadAll(`
    SELECT family, genus, species, common_name,
      lower(genus || '-' || species) AS slug,
      lower(genus) AS genus_slug
    FROM species
    ORDER BY genus, species
  `);

  conn.closeSync();

  const genera = generaResult.getRowObjectsJS();
  const allSpecies = speciesResult.getRowObjectsJS();

  // Group species by genus_slug for genus listing pages
  const byGenus = {};
  for (const sp of allSpecies) {
    if (!byGenus[sp.genus_slug]) {
      byGenus[sp.genus_slug] = { genus: sp.genus, family: sp.family, species: [] };
    }
    byGenus[sp.genus_slug].species.push(sp);
  }

  // Convert to array for pagination
  const genusArray = Object.values(byGenus);

  return { genera, genusArray };
}
```

Browse pagination template uses `families.genusArray` as its data source, size 1, one page per genus. [ASSUMED: Eleventy pagination works with nested data paths like `families.genusArray` — confirmed by docs that `data:` can be a dot-path string]

### Pattern 5: Pipe-Delimited Similar Species Rendering

**What:** `similar_species` column contains `slug1|slug2|slug3`. The Nunjucks template splits this and renders links.

```nunjucks
{% if sp.similar_species %}
  <section>
    <h2>Similar species</h2>
    <ul>
      {% for slug in sp.similar_species.split("|") %}
        <li><a href="/species/{{ slug }}/">{{ slug }}</a></li>
      {% endfor %}
    </ul>
  </section>
{% endif %}
```

**Better approach:** Split in the DuckDB data file and return as an array — avoids string manipulation in templates. Add `string_split(similar_species, '|') AS similar_slugs` to the species SELECT. Nunjucks then iterates `sp.similar_slugs` directly. [ASSUMED: DuckDB `string_split()` function is available in the current version — this is a standard DuckDB function confirmed by training knowledge but not verified against the installed version]

### Pattern 6: Git LFS for Images

**What:** Git LFS must be initialized in the repo and `.gitattributes` must track image extensions.

```bash
git lfs install
git lfs track "images/**/*.jpg"
git lfs track "images/**/*.jpeg"
git lfs track "images/**/*.png"
# This auto-creates/updates .gitattributes
git add .gitattributes
```

Git LFS is installed (`git-lfs/3.7.1`) but not yet configured for this repo (no `.gitattributes`, `git lfs status` shows no tracked objects). [VERIFIED: `git lfs version` output]

**Eleventy passthrough:** Add `images/` passthrough to copy image files to `_site/`:
```javascript
eleventyConfig.addPassthroughCopy("images");
```
This outputs images at `_site/images/{slug}/01.jpg`, referenced in templates as `/images/{slug}/01.jpg`. [VERIFIED: Eleventy passthrough copy pattern matches Phase 1 Parquet passthrough pattern already in use]

### Pattern 7: Pico CSS Integration

**What:** Install `@picocss/pico`, copy the minified CSS to `_site/css/` via passthrough, and link it in `base.njk`. No SCSS preprocessing needed.

```javascript
// eleventy.config.js addition
eleventyConfig.addPassthroughCopy({
  "node_modules/@picocss/pico/css/pico.min.css": "css/pico.min.css"
});
```

Then in `base.njk`: `<link rel="stylesheet" href="/css/pico.min.css">`.

CDN alternative (no passthrough needed): `https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css`. CDN approach is acceptable for a PoC but has a network dependency. [VERIFIED: CDN URL from picocss.com/docs] [VERIFIED: npm package path `node_modules/@picocss/pico/css/pico.min.css` confirmed by CDN URL structure matching npm path convention]

### Anti-Patterns to Avoid

- **Custom file-existence filter in Nunjucks:** Unnecessary. Nunjucks `ignore missing` handles missing includes natively.
- **Embedding images array in species.js via a JS loop:** Doing a second DuckDB connection or multiple queries per species in `species.js` is wasteful. Keep images in a separate `_data/images.js` file and let Eleventy merge them as separate globals.
- **Computing similar species display names from slugs at template time:** Reverse-engineering `acronicta-americana` → `Acronicta americana` in the template is fragile. Either (a) store `similar_species` as slugs and accept slug display, or (b) join in DuckDB to get display names. Option (b) is cleaner but requires a self-join; for Phase 2 (PoC), slug display is acceptable since SPEC-04 requires "links" not "human-readable names" specifically.
- **Putting prose markdown files outside the Eleventy input directory:** Nunjucks `include` resolves paths relative to Eleventy's input root. Prose files must live under `src/` to be includable.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSS reset + typography | Custom CSS from scratch | Pico CSS (`@picocss/pico`) | Locked decision; covers all semantic HTML elements, responsive by default |
| Markdown rendering | Custom MD parser | Nunjucks `{% include "..." ignore missing %}` or Eleventy Render plugin `{% renderFile %}` | Eleventy already processes `.md` files; both approaches are built-in |
| File-existence check | Custom `fileExists` filter + `fs.existsSync` | Nunjucks `ignore missing` modifier | Native Nunjucks feature, zero config |
| Per-genus page generation | Manual page creation | Eleventy pagination with `size: 1` over genus array | Standard Eleventy pattern for one-page-per-item |
| Image grouping by species | JavaScript object construction | DuckDB `GROUP BY` or `ORDER BY species_id` + JS reduce | DuckDB is already the data layer; keep logic in SQL |

---

## Common Pitfalls

### Pitfall 1: Prose files outside Eleventy input root

**What goes wrong:** Files at `content/species/acronicta-americana.md` (project root) cannot be included via Nunjucks `{% include %}` — Nunjucks resolves paths relative to the Eleventy input directory (`src/`).

**Why it happens:** CONTEXT.md specifies `content/species/{slug}.md` without clarifying whether `content/` is inside `src/`.

**How to avoid:** Place prose files at `src/content/species/{slug}.md`. The URL structure won't conflict since these are includes, not output pages.

**Warning signs:** Build error "template not found" or silently omitting all prose even when files exist.

### Pitfall 2: DuckDB BigInt species_id in images grouping

**What goes wrong:** `sp.id` from the DuckDB query is a BigInt in Node.js. Direct object key lookup `bySpecies[sp.id]` may fail if `images.js` keys are stored as Number and `species.js` returns BigInt (or vice versa).

**Why it happens:** The existing `species.js` uses `INTEGER` type in DuckDB schema; `@duckdb/node-api` may return this as BigInt. STATE.md documents this as an open concern (CR-02).

**How to avoid:** Normalize IDs to strings when building the lookup object: `const id = String(row.species_id)` in `images.js`, and use `String(sp.id)` as the template lookup key.

### Pitfall 3: `{% extends %}` vs `{% include %}` in Eleventy Nunjucks

**What goes wrong:** Eleventy uses `layout:` front matter for template inheritance, not Nunjucks `{% extends %}`. Using `{% extends "base.njk" %}` directly in a template that also has Eleventy pagination front matter causes conflicts.

**Why it happens:** Eleventy intercepts template rendering and wraps templates with their layout; it doesn't use Nunjucks' native extends mechanism for the top-level layout chain.

**How to avoid:** Use `layout: base.njk` in front matter. Use `{% extends %}` only for Nunjucks-to-Nunjucks inheritance within includes, not for page layouts.

### Pitfall 4: Pico CSS `<nav>` expects `<ul>/<li>/<a>` structure

**What goes wrong:** A `<nav>` with bare `<a>` links won't receive Pico's full navigation styling; Pico expects `<nav><ul><li><a>` nesting.

**Why it happens:** The UI-SPEC shows the nav structure without specifying exact Pico markup requirements.

**How to avoid:** Use `<nav><ul><li><a href="/">Home</a></li>...</ul></nav>` structure. Pico v2 styles this as an inline horizontal nav bar. [VERIFIED: Pico docs confirm `<ul>` inside `<nav>` is the expected pattern]

### Pitfall 5: Empty `similar_species` column breaks split

**What goes wrong:** If `similar_species` is an empty string or NULL, calling `.split("|")` in Nunjucks produces `[""]` or throws.

**Why it happens:** CSV columns can be empty strings when no similar species exist.

**How to avoid:** Guard with `{% if sp.similar_slugs and sp.similar_slugs.length > 0 %}` when splitting in template, or handle NULL/empty in DuckDB: `CASE WHEN similar_species IS NULL OR similar_species = '' THEN [] ELSE string_split(similar_species, '|') END`.

---

## Code Examples

### species.js extended (key changes only)

```javascript
// Source: Phase 1 pattern + CONTEXT.md data model decisions
const result = await conn.runAndReadAll(`
  SELECT
    id,
    genus,
    species,
    common_name,
    noc_id,
    authority,
    family,
    CASE WHEN similar_species IS NULL OR similar_species = ''
         THEN []
         ELSE string_split(similar_species, '|')
    END AS similar_slugs,
    lower(genus || '-' || species) AS slug
  FROM species
  ORDER BY genus, species
`);
```

### Species factsheet template structure

```nunjucks
{# src/species/species.njk #}
---
layout: base.njk
pagination:
  data: species
  size: 1
  alias: sp
permalink: "species/{{ sp.slug }}/index.html"
eleventyComputed:
  title: "{{ sp.genus }} {{ sp.species }} — PNW Moths"
---
<h1><em>{{ sp.genus }} {{ sp.species }}</em></h1>

<dl>
  <dt>Common name</dt><dd>{{ sp.common_name }}</dd>
  <dt>NOC ID</dt><dd>{{ sp.noc_id }}</dd>
  <dt>Authority</dt><dd>{{ sp.authority }}</dd>
  <dt>Family</dt><dd>{{ sp.family }}</dd>
</dl>

{% include ("content/species/" + sp.slug + ".md") ignore missing %}

{% set spImages = images[sp.id | string] %}
{% if spImages and spImages.length > 0 %}
  {% for img in spImages %}
    <figure>
      <img src="/images/{{ sp.slug }}/{{ img.filename }}"
           alt="{{ sp.genus }} {{ sp.species }}">
      <figcaption>{{ img.photographer }}</figcaption>
    </figure>
  {% endfor %}
{% else %}
  <figure>
    <div class="no-image-placeholder" aria-label="No images available for this species">
      No photos on file
    </div>
  </figure>
{% endif %}

{% if sp.similar_slugs and sp.similar_slugs.length > 0 %}
  <section>
    <h2>Similar species</h2>
    <ul>
      {% for slug in sp.similar_slugs %}
        <li><a href="/species/{{ slug }}/">{{ slug }}</a></li>
      {% endfor %}
    </ul>
  </section>
{% endif %}
```

### Browse all-species page

```nunjucks
{# src/browse/index.njk #}
---
layout: base.njk
title: Browse — PNW Moths
permalink: /browse/index.html
---
<h1>Browse all species</h1>
{% set currentFamily = null %}
{% for genus in families.genera %}
  {% if genus.family !== currentFamily %}
    <h2>{{ genus.family }}</h2>
    {% set currentFamily = genus.family %}
  {% endif %}
  <h3><a href="/browse/{{ genus.genus_slug }}/">{{ genus.genus }}</a></h3>
{% endfor %}
```

### Per-genus browse page (paginated)

```nunjucks
{# src/browse/genus.njk #}
---
layout: base.njk
pagination:
  data: families.genusArray
  size: 1
  alias: genusData
permalink: "browse/{{ genusData.genus_slug }}/index.html"
eleventyComputed:
  title: "{{ genusData.genus }} — PNW Moths"
---
<h1>{{ genusData.genus }}</h1>
<ul>
  {% for sp in genusData.species %}
    <li><a href="/species/{{ sp.slug }}/">
      <em>{{ sp.genus }} {{ sp.species }}</em> — {{ sp.common_name }}
    </a></li>
  {% endfor %}
</ul>
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Eleventy 2 `addNunjucksFilter` | Same API in v3 | Stable | No change needed |
| Pico CSS v1 (class-based) | Pico CSS v2 (fully classless) | 2023 | v2 is what's documented; use v2 |
| `eleventyConfig.addPassthroughCopy(string)` | Also supports object `{src: dest}` form | Eleventy 2+ | Phase 1 already uses object form; use same pattern for Pico and images |

**Deprecated / outdated:**
- Pico CSS v1: Switched from class-based to fully classless in v2. All documentation and the locked decision references v2 (`@picocss/pico@2`). Do not use v1.
- Eleventy `addWatchTarget` for passthrough files: Not needed; passthrough copy automatically watches source files in Eleventy 3 dev server.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Nunjucks `{% include "..." ignore missing %}` in Eleventy renders `.md` files as HTML (not raw markdown) | Pattern 2 (Prose Include) | Prose would appear as raw markdown text; fix by switching to `{% renderFile %}` shortcode |
| A2 | Prose files must be under `src/` to be includable via Nunjucks `include` | Pitfall 1, Pattern 2 | Files at project-root `content/` may or may not work; easy to test and adjust |
| A3 | Eleventy `_data/` globals are all available as top-level variables in templates (so `images` data file is accessible as `images[...]` in species template) | Pattern 3 | Standard Eleventy behavior; Phase 1 already relies on `species` global from `species.js` — same mechanism |
| A4 | DuckDB `string_split()` function is available in `@duckdb/node-api` v1.5.1 | Pattern 5, species.js example | `similar_species` cannot be split in SQL; must split in JS or Nunjucks template instead |
| A5 | Pagination data path `families.genusArray` (dot-notation into nested data object) works in Eleventy 3 pagination front matter | Pattern 4, genus template | Genus pages cannot be paginated from nested data; workaround: return flat genus array from a separate `genera.js` data file |

---

## Open Questions

1. **Prose include: `include` vs `renderFile`**
   - What we know: Nunjucks `include` works for `.njk` and `.html` files; Eleventy Render plugin's `renderFile` explicitly handles `.md` → HTML.
   - What's unclear: Whether Eleventy processes `.md` files that are `include`d by Nunjucks (as opposed to being top-level template files).
   - Recommendation: Start with `{% include slug + ".md" ignore missing %}`; if prose renders as raw text, switch to `{% renderFile %}` (requires enabling the Render plugin in `eleventy.config.js`). Both are one-line changes.

2. **Similar species display: slugs vs. display names**
   - What we know: SPEC-04 says "list of similar species with links." The links can work with just slugs.
   - What's unclear: Whether human-readable names (e.g., "Acronicta innotata") should appear as link text or just the slug form.
   - Recommendation: For Phase 2 PoC, render slug as link text. Phase 3 can improve with a DuckDB self-join to get display names.

3. **How `genus_slug` is computed for browse URLs**
   - What we know: Species slugs use `lower(genus || '-' || species)`. Genus slugs need to be `lower(genus)` only (e.g., `/browse/acronicta/`).
   - What's unclear: Whether genus names can contain spaces or special characters (the Phase 1 validator only validates genus+species as alphanumeric+spaces).
   - Recommendation: Use `lower(replace(genus, ' ', '-'))` as genus slug for safety; the validator in `build-data.js` already catches invalid characters.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Eleventy build | Yes | v25.9.0 | — |
| Git LFS | Image file tracking (SPEC-03) | Yes (installed) | 3.7.1 | — |
| Git LFS (repo config) | Image tracking | No (not initialized) | — | Must run `git lfs install` + `git lfs track` before committing images |
| `@picocss/pico` | Styling | No (not installed) | — | CDN fallback available |
| npm | Package install | Yes | (via Node.js) | — |

**Missing dependencies with no fallback:**
- Git LFS repo config: must be initialized before any image files are committed to the repo. This is a Wave 0 task.

**Missing dependencies with fallback:**
- `@picocss/pico`: CDN link is a valid temporary fallback (`https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css`) but npm installation + passthrough copy is preferred for offline builds.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner (`node --test`) |
| Config file | none — invoked directly |
| Quick run command | `npm test` (runs `scripts/build-data.test.js`) |
| Full suite command | `npm run build && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SPEC-02 | Species page includes taxonomy fields + optional prose | smoke (build output check) | `npm run build && grep -l 'NOC ID' _site/species/*/index.html` | ❌ Wave 0 |
| SPEC-03 | Photos render with figcaption; placeholder for no-image species | smoke (build output check) | `npm run build && grep -l 'No photos on file' _site/species/*/index.html` | ❌ Wave 0 |
| SPEC-04 | Similar species links render (when column populated) | smoke (build output check) | `npm run build && grep -l 'Similar species' _site/species/*/index.html` | ❌ Wave 0 |
| BRWS-01 | Browse page exists and contains family/genus headings | smoke | `npm run build && test -f _site/browse/index.html` | ❌ Wave 0 |
| BRWS-02 | Per-genus pages exist for all genera | smoke | `npm run build && ls _site/browse/*/index.html` | ❌ Wave 0 |
| BRWS-03 | Nav links present on all page types | smoke | `npm run build && grep -l 'href="/browse/"' _site/species/*/index.html` | ❌ Wave 0 |
| images.csv validation | build-data.js validates new CSV | unit | `npm test` (extend existing test file) | ❌ Wave 0 (extend existing) |

### Sampling Rate

- **Per task commit:** `npm run build` (full build is fast for 5 sample species)
- **Per wave merge:** `npm run build && npm test`
- **Phase gate:** Full build green + all smoke checks pass before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] Extend `scripts/build-data.test.js` — add images.csv validation tests
- [ ] Add sample `data/images.csv` with at least one species having images and one without
- [ ] Add sample `src/content/species/acronicta-americana.md` prose file for smoke test
- [ ] Add `similar_species` + `family` columns to `data/species.csv` sample data

---

## Security Domain

This phase involves no authentication, no user input, no server, and no client-side JS. ASVS categories do not apply. The primary security concern is the same as Phase 1 — path traversal via species names in DuckDB queries — which is already mitigated by `validateSlugComponent()` in `build-data.js` (STATE.md CR-01 / CR-02).

The new `images.csv` introduces `filename` as a string used in `<img src="/images/{slug}/{filename}">`. Filename values should be validated as alphanumeric+extension-only in `validateCsv` to prevent HTML injection in the `src` attribute. This is a build-time validation concern, not runtime.

---

## Sources

### Primary (HIGH confidence)
- Node.js `node_modules/@11ty/eleventy/package.json` — version 3.1.5 confirmed
- Node.js `node_modules/@duckdb/node-api/package.json` — version 1.5.1-r.2 confirmed
- `npm view @picocss/pico version` — 2.1.1 confirmed as latest
- `npm view @picocss/pico@2 description` — package confirmed
- `git lfs version` — 3.7.1 installed, `.gitattributes` absent (not configured)
- `git lfs status` — no tracked objects
- https://www.11ty.dev/docs/plugins/render/ — `renderFile` shortcode behavior confirmed
- https://mozilla.github.io/nunjucks/templating.html#include — `ignore missing` confirmed
- picocss.com/docs — CDN path `https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css` confirmed

### Secondary (MEDIUM confidence)
- https://www.11ty.dev/docs/languages/markdown/ — markdown-it is Eleventy's default MD processor, `html: true` enabled
- https://www.11ty.dev/docs/pages-from-data/ — pagination with `size: 1` for one-page-per-item confirmed
- https://github.com/11ty/eleventy/issues/2119 — community confirmation of `ignore missing` as preferred pattern for optional includes

### Tertiary (LOW confidence)
- DuckDB `string_split()` availability — based on training knowledge, not verified against installed version

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified against installed packages or npm registry
- Architecture patterns: MEDIUM-HIGH — Eleventy patterns verified via official docs; one key assumption (prose include rendering) flagged
- Pitfalls: MEDIUM — derived from codebase inspection + official docs; BigInt issue documented in STATE.md corroborates

**Research date:** 2026-04-11
**Valid until:** 2026-05-11 (Eleventy and Pico CSS are stable; DuckDB API moves faster — recheck if `@duckdb/node-api` is upgraded)
