# Phase 4: Search, Glossary, and Validation - Research

**Researched:** 2026-04-12
**Domain:** Static search (Pagefind), Eleventy data templates, Node.js build scripting, link checking (lychee)
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Glossary terms stored in `data/glossary.csv` — columns: `term`, `definition`, `image_filename`, `photographer`.
- **D-02:** `image_filename` and `photographer` are nullable.
- **D-03:** Single image per term; DuckDB sorts `ORDER BY term ASC` at build time.
- **D-04:** Glossary images follow the existing `images/` directory pattern; tracked via Git LFS.
- **D-05:** Use Pagefind's built-in UI widget — drop `<link>` + `<script>` + `<div id="search">` into `src/search/index.njk`. No custom JS wrapper.
- **D-06:** Style Pagefind UI via `--pagefind-ui-*` CSS custom properties matching Pico CSS palette. Do NOT exclude Pagefind's default stylesheet.
- **D-07:** No Lit web component wrapper for search.
- **D-08:** Occurrence data exclusion is architecturally guaranteed (loads from Parquet client-side, never in HTML). No `data-pagefind-ignore` needed for occurrence data.
- **D-09:** Apply `data-pagefind-ignore` to `<nav>`, `<footer>`, and boilerplate regions. Species content indexed by default.
- **D-10:** VALD-01 (link checker): Hard fail. Tool: `lychee`. Checks `_site/` output directory.
- **D-11:** VALD-02 (page weight): Warn only. Threshold: 500KB HTML.
- **D-12:** VALD-03 (data integrity): Hard fail. Catches invalid species IDs, unrecognized state/record_type values, coordinates outside PNW bounds.

### Claude's Discretion

- Pagefind configuration details (indexing options, bundle location).
- VALD-03 exact PNW coordinate bounds.
- Page weight script implementation (Node.js script in `scripts/` or shell one-liner).
- How lychee is invoked (npm script, direct CLI call).

### Deferred Ideas (OUT OF SCOPE)

None surfaced during discussion.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SRCH-01 | Pagefind indexes all species pages after build | Pagefind CLI `--site _site` run post-Eleventy; outputs bundle to `_site/pagefind/` |
| SRCH-02 | Search returns results for scientific names and common names | Both are already in species page HTML from Phase 2; Pagefind indexes all visible text by default |
| SRCH-03 | Occurrence data excluded from Pagefind index | Architecturally guaranteed — occurrence data never in HTML; loads from Parquet client-side |
| SRCH-04 | Search page renders results client-side with no server | Pagefind UI widget is fully client-side; `<div id="search">` + widget JS is sufficient |
| GLOS-01 | Glossary terms stored in CSV and rendered as alphabetized page | New `src/_data/glossary.js` DuckDB query on `data/glossary.csv`; template groups by first letter |
| VALD-01 | Post-build link checker fails on broken internal links | lychee `--root-dir _site '_site/**/*.html'`; exits non-zero on broken links |
| VALD-02 | Page weight warns when any page exceeds 500KB | Node.js script in `scripts/check-page-weight.js`; follows `build-data.js` ESM pattern |
| VALD-03 | Data validation: orphan species IDs, invalid state/record_type, out-of-bounds coords | Already partially implemented in `scripts/build-data.js` — extend to include state validation |
</phase_requirements>

---

## Summary

Phase 4 adds three self-contained capabilities to an already-working Eleventy site. Search is implemented by running the `pagefind` npm package CLI after the Eleventy build, then dropping the built-in UI widget (a `<link>`, `<style>`, `<div>`, and two `<script>` tags) into `src/search/index.njk`. No custom JavaScript is needed. The glossary follows the exact pattern of `src/_data/species.js` — a new `src/_data/glossary.js` file runs a DuckDB query over a new `data/glossary.csv`, and the template iterates the result grouping by first letter. The validation suite is mostly additive: VALD-03 data integrity checks are already implemented in `scripts/build-data.js` and the coordinate bounds are already defined there (lat 42–52, lon -125 to -110); the only gap is state-value validation. VALD-01 (lychee link check) and VALD-02 (page weight) are new build steps.

**Primary recommendation:** Add three new `build:*` npm scripts for pagefind, lychee, and page-weight, extend the existing `build` script to chain them, add `data-pagefind-ignore` attributes to the base template, create `data/glossary.csv` + `src/_data/glossary.js` + an updated `src/glossary/index.njk`, and update `src/search/index.njk` with the Pagefind widget.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pagefind (npm) | 1.5.2 | CLI post-build indexer + client-side search bundle | Official Pagefind npm wrapper; `npx pagefind` works without install |
| lychee | 0.23.0 (brew) | Post-build internal link checker | Rust binary, fast, `--root-dir` flag handles root-relative links in static HTML |
| @duckdb/node-api | 1.5.1 (already installed) | Glossary data query at build time | Already the project's data layer; glossary follows same pattern as species.js |

[VERIFIED: npm registry — pagefind 1.5.2, @pagefind/default-ui 1.5.2]
[VERIFIED: brew info lychee — 0.23.0 stable bottle available, not yet installed]

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node:fs (built-in) | — | Page weight check: stat each HTML file in `_site/` | Already used in build-data.js; no new dependency |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| lychee (Rust binary) | linkinator (npm) | linkinator is pure Node.js so no brew/cargo install, but slower and less configurable; lychee is the locked decision |
| Node.js page-weight script | shell one-liner (`find _site -name '*.html' -size +500k`) | Shell one-liner is simpler but less portable across OS; Node.js script consistent with project pattern |

**Installation:**

```bash
# pagefind via npx (no install needed) or as devDependency:
npm install --save-dev pagefind

# lychee via Homebrew (macOS — available, not yet installed):
brew install lychee
```

[VERIFIED: npm registry] pagefind 1.5.2 is the current stable release.
[VERIFIED: brew info lychee] 0.23.0 available as macOS bottle.

---

## Architecture Patterns

### Recommended Project Structure

```
scripts/
├── build-data.js          # Existing — VALD-03 state validation to be added here
├── build-data.test.js     # Existing — extend with glossary.csv validation test
├── check-page-weight.js   # NEW — warns when any HTML page exceeds 500KB

src/
├── _data/
│   ├── species.js         # Existing
│   ├── images.js          # Existing
│   ├── families.js        # Existing
│   └── glossary.js        # NEW — DuckDB query on data/glossary.csv
├── search/
│   └── index.njk          # Replace stub with Pagefind widget
└── glossary/
    └── index.njk          # Replace stub with rendered terms

data/
└── glossary.csv           # NEW — columns: term, definition, image_filename, photographer
```

### Pattern 1: Pagefind Post-Build CLI Invocation

**What:** Run `pagefind --site _site` after Eleventy build. Pagefind writes its bundle to `_site/pagefind/` (the default `--output-subdir`). No Eleventy passthrough copy needed — the directory is generated directly into `_site/`.

**When to use:** Always. Pagefind must run after Eleventy because it indexes the built HTML.

**npm script chain:**
```json
{
  "build:pagefind": "npx pagefind --site _site",
  "build:validate-links": "lychee --root-dir _site '_site/**/*.html'",
  "build:check-weight": "node scripts/check-page-weight.js",
  "build": "npm run build:data && npm run build:eleventy && npm run build:copy-parquet && npm run build:pagefind && npm run build:validate-links && npm run build:check-weight"
}
```

[CITED: pagefind.app/docs/config-options/ — `--output-subdir` defaults to `pagefind`, relative to `--site` directory]

### Pattern 2: Pagefind UI Widget — Complete Search Page Markup

**What:** The built-in widget requires three additions to `src/search/index.njk`: a CSS link, a JS script, and an init script. The CSS and JS are served from `/pagefind/` which is generated by the CLI.

**Example:**
```html
---
layout: base.njk
title: Search — PNW Moths
permalink: /search/index.html
---
<h1>Search</h1>
<link href="/pagefind/pagefind-ui.css" rel="stylesheet">
<style>
  #search {
    --pagefind-ui-primary: var(--pico-primary);
    --pagefind-ui-text: var(--pico-color);
    --pagefind-ui-background: var(--pico-background-color);
    --pagefind-ui-border: var(--pico-muted-border-color);
    --pagefind-ui-tag: var(--pico-card-background-color);
    --pagefind-ui-font: system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
</style>
<div id="search"></div>
<script src="/pagefind/pagefind-ui.js"></script>
<script>
  window.addEventListener('DOMContentLoaded', () => {
    new PagefindUI({ element: '#search', showSubResults: false });
  });
</script>
<noscript data-pagefind-ignore>
  <p>Search requires JavaScript. <a href="/browse/">Browse all species</a> instead.</p>
</noscript>
```

[CITED: 04-UI-SPEC.md — Component Inventory: Search Page]
[CITED: pagefind.app/docs/ui/ — PagefindUI constructor options]

### Pattern 3: Glossary Data File — DuckDB Query

**What:** `src/_data/glossary.js` follows the exact same pattern as `src/_data/species.js`. Query groups terms by first letter for template iteration.

**Example:**
```javascript
// src/_data/glossary.js
import { DuckDBInstance } from '@duckdb/node-api';

export default async function () {
  const db = await DuckDBInstance.create(':memory:');
  const conn = await db.connect();

  await conn.run(`
    CREATE TABLE glossary AS
    SELECT * FROM read_csv('data/glossary.csv',
      header = true,
      columns = {
        'term': 'VARCHAR',
        'definition': 'VARCHAR',
        'image_filename': 'VARCHAR',
        'photographer': 'VARCHAR'
      }
    )
  `);

  const result = await conn.runAndReadAll(`
    SELECT
      term,
      definition,
      image_filename,
      photographer,
      upper(left(term, 1)) AS letter,
      lower(regexp_replace(term, ' ', '-', 'g')) AS slug
    FROM glossary
    WHERE definition IS NOT NULL AND definition != ''
    ORDER BY term ASC
  `);

  conn.closeSync();
  return result.getRowObjectsJS();
}
```

[ASSUMED: DuckDB `regexp_replace` with `'g'` flag works in node-api version in use — verify during implementation if slug generation needed at query level vs. template level]

### Pattern 4: Lychee Invocation for Static Site

**What:** lychee checks HTML files in `_site/` using `--root-dir` to resolve absolute URLs like `/species/acronicta-americana/` to actual files.

**Command:**
```bash
lychee --root-dir _site '_site/**/*.html'
```

**With external URL skipping (recommended for build speed):**
```bash
lychee --root-dir _site --offline '_site/**/*.html'
```

The `--offline` flag blocks all network requests — since VALD-01 only requires checking internal links, `--offline` is correct and faster.

[CITED: lychee.cli.rs/recipes/local-folder/ — `--root-dir` resolves root-relative links]
[CITED: lychee.cli.rs/guides/cli/ — `--offline` blocks network requests]

### Pattern 5: Page Weight Check Script

**What:** Node.js ESM script consistent with `scripts/build-data.js` — reads `_site/` recursively, warns on any `.html` file over 500KB.

**Example:**
```javascript
// scripts/check-page-weight.js
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const THRESHOLD_BYTES = 500 * 1024; // 500KB
const SITE_DIR = '_site';

function walkHtml(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkHtml(fullPath);
    } else if (entry.name.endsWith('.html')) {
      const { size } = statSync(fullPath);
      if (size > THRESHOLD_BYTES) {
        console.warn(`[page-weight] WARNING: ${fullPath} is ${(size / 1024).toFixed(1)}KB (threshold: 500KB)`);
      }
    }
  }
}

walkHtml(SITE_DIR);
console.log('[page-weight] Check complete.');
```

[ASSUMED: `readdirSync` with `withFileTypes` is available in Node 25.x — it is a stable API since Node 10.10]

### Anti-Patterns to Avoid

- **Do not** add `--output-path pagefind` to the pagefind CLI call. The default `--output-subdir pagefind` already places the bundle at `_site/pagefind/`. Using `--output-path` would place it relative to CWD, not `_site/`.
- **Do not** add Eleventy passthrough copy for the `pagefind/` directory. It is written directly to `_site/` by the CLI and does not exist at Eleventy build time.
- **Do not** run lychee against the `src/` directory — it checks source templates, not built output. Always point lychee at `_site/`.
- **Do not** sort glossary terms in the Nunjucks template — sorting happens in the DuckDB query (`ORDER BY term ASC`). Template only groups by letter.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Client-side search index | Custom full-text search | `pagefind` CLI + built-in UI | Handles tokenization, ranking, bundle splitting, UI — 100+ edge cases |
| Search results UI | Custom JS | Pagefind built-in widget | Handles accessible markup, keyboard navigation, no-results state |
| Link validation | Custom HTML parser + HTTP client | `lychee` | Async Rust binary handles 700+ pages in parallel, proper exit codes for CI |

**Key insight:** Pagefind's CLI is designed for exactly this use case (static Eleventy site, post-build). The built-in widget is production-quality and styled via CSS custom properties — custom wrappers add complexity with no benefit.

---

## Runtime State Inventory

Not applicable — this is a greenfield feature addition (no rename/refactor).

---

## Common Pitfalls

### Pitfall 1: Pagefind Bundle Not Found at Runtime

**What goes wrong:** `/pagefind/pagefind-ui.js` returns 404 because the bundle doesn't exist in the repo and Eleventy passthrough copy wasn't configured for it.

**Why it happens:** Pagefind writes to `_site/pagefind/` only after the post-build CLI step. If `build:pagefind` is skipped or run before `build:eleventy`, the directory is missing.

**How to avoid:** Ensure build script order: `build:eleventy` must complete before `build:pagefind`. Never add passthrough copy for `pagefind/` — it doesn't exist at Eleventy build time.

**Warning signs:** 404 errors in browser console for `/pagefind/pagefind-ui.js`; blank search page.

### Pitfall 2: Lychee Fails on Absolute URLs Without `--root-dir`

**What goes wrong:** lychee reports every root-relative link (e.g., `/browse/`, `/species/acronicta-americana/`) as broken.

**Why it happens:** Without `--root-dir`, lychee cannot resolve root-relative URLs in local HTML files.

**How to avoid:** Always pass `--root-dir _site` when checking `_site/**/*.html`.

**Warning signs:** Hundreds of 404 errors for links that clearly work when served.

### Pitfall 3: Glossary CSV Not Validated Before DuckDB Import

**What goes wrong:** A glossary.csv with missing `term` column or non-UTF-8 bytes causes a cryptic DuckDB error at build time.

**Why it happens:** `src/_data/glossary.js` runs during Eleventy build, not during the pre-flight `build:data` step where `validateCsv` is called.

**How to avoid:** Add `validateCsv('data/glossary.csv', ['term', 'definition', 'image_filename', 'photographer'])` to `scripts/build-data.js` pre-flight validation block — consistent with species.csv and images.csv validation.

**Warning signs:** DuckDB error during Eleventy build step rather than data step; unclear error message.

### Pitfall 4: Pagefind Indexes Navigation and Footer Boilerplate

**What goes wrong:** Search results contain navigation text ("Browse", "Search", "Glossary") rather than species content.

**Why it happens:** Pagefind indexes all text in `<body>` by default. The `<nav>` in `base.njk` appears on every page.

**How to avoid:** Add `data-pagefind-ignore` to `<nav>` in `src/_includes/base.njk`. Also add to `<noscript>` blocks and any web component elements (`<pnwm-filter-bar>` etc.).

**Warning signs:** Searching "Browse" returns all 700 species pages.

### Pitfall 5: Vite Processes Pagefind Bundle and Breaks It

**What goes wrong:** Eleventy's Vite plugin processes files in `_site/` that Pagefind wrote, corrupting the bundle.

**Why it happens:** The `build:pagefind` step runs after `build:eleventy`, which includes the Vite plugin pass. If Vite re-processes `_site/`, it may touch Pagefind's JS files.

**How to avoid:** Run `build:pagefind` after the complete Eleventy+Vite build. The build script order `build:eleventy && build:pagefind` is correct. Verify lychee runs last so it catches any Vite-modified links.

**Warning signs:** Pagefind JS bundle errors in console; "PagefindUI is not defined".

### Pitfall 6: VALD-03 State Validation Gap

**What goes wrong:** VALD-03 requires validating `state` values, but the existing validation in `build-data.js` only checks `record_type`, coordinates, and orphan species IDs. State values are not validated.

**Why it happens:** The current `validationChecks` array in `build-data.js` does not include a state validation query.

**How to avoid:** Add a validation check for `state NOT IN ('WA', 'OR', 'ID', 'BC', ...)` (or whatever the project's valid state set is) to the existing `validationChecks` array in `build-data.js`. This is a one-query addition.

---

## Code Examples

### data-pagefind-ignore in base.njk

```html
<!-- src/_includes/base.njk — add data-pagefind-ignore to nav -->
<nav data-pagefind-ignore>
  <ul>
    <li><a href="/">Home</a></li>
    <li><a href="/browse/">Browse</a></li>
    <li><a href="/search/">Search</a></li>
    <li><a href="/glossary/">Glossary</a></li>
  </ul>
</nav>
```

[CITED: 04-UI-SPEC.md — Pagefind Indexing Contract]
[CITED: pagefind.app/docs/indexing/ — data-pagefind-ignore attribute]

### Glossary Nunjucks Template (grouping by letter)

```nunjucks
{# src/glossary/index.njk #}
---
layout: base.njk
title: Glossary — PNW Moths
permalink: /glossary/index.html
---
<h1>Glossary</h1>

{# Build list of unique letters present in data #}
{% set letters = [] %}
{% for term in glossary %}
  {% if term.letter not in letters %}
    {% set letters = (letters.push(term.letter), letters) %}
  {% endif %}
{% endfor %}

<nav aria-label="Alphabetic index">
  <ul>
    {% for letter in letters %}
      <li><a href="#letter-{{ letter }}">{{ letter }}</a></li>
    {% endfor %}
  </ul>
</nav>

{% for letter in letters %}
  <section id="letter-{{ letter }}">
    <h2>{{ letter }}</h2>
    <dl>
      {% for term in glossary %}
        {% if term.letter == letter %}
          <dt id="term-{{ term.slug }}">{{ term.term }}</dt>
          <dd>
            {{ term.definition }}
            {% if term.image_filename %}
              <figure>
                <img src="/images/glossary/{{ term.image_filename }}"
                     alt="{{ term.term }}"
                     width="120">
                {% if term.photographer %}
                  <figcaption>{{ term.photographer }}</figcaption>
                {% endif %}
              </figure>
            {% endif %}
          </dd>
        {% endif %}
      {% endfor %}
    </dl>
  </section>
{% endfor %}
```

[CITED: 04-UI-SPEC.md — Glossary Page component inventory]
[ASSUMED: Nunjucks `push` filter pattern works in Eleventy 3.x — verify or use a different grouping approach]

### VALD-03 State Validation Addition to build-data.js

```javascript
// Add to validationChecks array in scripts/build-data.js
{
  description: 'invalid state values',
  query: `
    SELECT DISTINCT state FROM records
    WHERE state NOT IN ('WA', 'OR', 'ID', 'BC', 'AB', 'MT')
      AND state IS NOT NULL
      AND state != ''
  `
}
```

[ASSUMED: Valid states are WA, OR, ID, BC, AB, MT — planner should confirm with project owner or source data]

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Pagefind manual download | `npx pagefind` (npm wrapper) | Pagefind 1.0 | No binary install needed; `npm install --save-dev pagefind` pins version |
| Pagefind Default UI (pre-1.5) | Component UI available in 1.5 | Pagefind 1.5.0 | New "Component UI" with modal; Default UI still works — project uses Default UI (D-05) |

**Deprecated/outdated:**

- Pagefind UI `bundlePath` option: Still valid but `--output-subdir` default (`pagefind`) means it is not needed for standard setups.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | DuckDB `regexp_replace(term, ' ', '-', 'g')` works in node-api 1.5.1 | Architecture Patterns — Pattern 3 | Slug generation fails; fix: generate slug in JS after query |
| A2 | Nunjucks `push` inside `{% set %}` works for building letter list in Eleventy 3.x | Code Examples — Glossary template | Template rendering error; fix: generate letters array in `glossary.js` data file instead |
| A3 | Valid PNW state/province codes are WA, OR, ID, BC, AB, MT | Code Examples — VALD-03 addition | False validation failures or missed bad data; confirm against actual records.csv values |
| A4 | Vite plugin does not re-process `_site/` after `build:pagefind` runs | Common Pitfalls — Pitfall 5 | Pagefind bundle corrupted; fix: verify build order is correct |

**Recommendation for A2:** Move letter grouping logic into `src/_data/glossary.js` — return an object keyed by letter (e.g., `{ A: [...], B: [...] }`) rather than a flat array. This avoids Nunjucks array mutation complexity entirely.

---

## Open Questions

1. **Valid state/province values for VALD-03**
   - What we know: The existing validation in `build-data.js` checks `record_type` and coordinates but not `state`.
   - What's unclear: The exact set of valid state/province abbreviations for PNW records.
   - Recommendation: Inspect `data/records.csv` for distinct `state` values during Wave 0 implementation.

2. **Glossary images subdirectory**
   - What we know: D-04 says glossary images follow the `images/` pattern (Git LFS tracked). The existing `images/` directory contains `acronicta-americana/` and `hyles-lineata/` species subdirectories.
   - What's unclear: Whether glossary images go in `images/glossary/` or a flat `images/` directory.
   - Recommendation: Use `images/glossary/` subdirectory (as shown in 04-UI-SPEC.md component inventory) to avoid naming collisions with species images.

3. **Nunjucks letter grouping approach**
   - What we know: Nunjucks array mutation via `push` is unreliable in some Eleventy versions.
   - Recommendation: Return a grouped structure from `src/_data/glossary.js` (object keyed by letter) rather than a flat array, and iterate `glossary | keys` in the template. This is more explicit and avoids template-level logic.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | build scripts, page weight check | Yes | v25.9.0 | — |
| pagefind (npm) | SRCH-01, SRCH-04 | Via npx (not installed) | 1.5.2 | Install as devDependency: `npm install --save-dev pagefind` |
| lychee | VALD-01 | No — not installed | 0.23.0 (brew available) | `brew install lychee` (blocking — no npm wrapper exists) |
| @duckdb/node-api | GLOS-01 | Yes (already installed) | 1.5.1-r.2 | — |
| Homebrew | lychee install | Yes | — | Cargo install: `cargo install lychee` (cargo also available) |

**Missing dependencies with no fallback:**

- `lychee` — not installed, required for VALD-01 hard fail. Must `brew install lychee` before build pipeline runs. No npm equivalent.

**Missing dependencies with fallback:**

- `pagefind` — not installed as devDependency; `npx pagefind` will download it on first run. For reproducible builds, install as devDependency: `npm install --save-dev pagefind`.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner (`node:test`) |
| Config file | none — tests run via `npm test` |
| Quick run command | `node --test scripts/build-data.test.js` |
| Full suite command | `node --test scripts/build-data.test.js src/components/*.test.js` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SRCH-01 | Pagefind produces `_site/pagefind/` directory after build | smoke | `ls _site/pagefind/pagefind-ui.js` (post-build check) | No — Wave 0 |
| SRCH-02 | Species scientific and common names are indexed | manual | Build + search for "Acronicta" and "dagger moth" in browser | No |
| SRCH-03 | No occurrence data in Pagefind index | manual | Verify no collector names appear in search results | No |
| SRCH-04 | Search page works client-side | smoke | `ls _site/search/index.html` + visual verify | No |
| GLOS-01 | Glossary renders all terms alphabetically | unit | Extend `build-data.test.js`: verify glossary.js returns sorted terms | No — Wave 0 |
| VALD-01 | lychee exits 0 on clean build | smoke | `npm run build:validate-links` exits 0 | No — Wave 0 |
| VALD-02 | Page weight script warns on oversized pages | unit | Add test: create fake >500KB HTML file, run script, check warn output | No — Wave 0 |
| VALD-03 | Data validator catches orphan species IDs | unit | Existing: `integration: build-data.js with bad CSV data exits non-zero` | Yes (partial) |
| VALD-03 | Data validator catches invalid state values | unit | Extend `build-data.test.js`: records-bad.csv with bad state | No — Wave 0 |

### Sampling Rate

- **Per task commit:** `node --test scripts/build-data.test.js`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] Extend `scripts/build-data.test.js` — VALD-03 state validation test (needs `records-bad.csv` with invalid state entry or separate bad-state fixture)
- [ ] `scripts/check-page-weight.test.js` — covers VALD-02 warning behavior
- [ ] `data/glossary.csv` — required for `src/_data/glossary.js` to parse; must exist with at least one row for build to succeed

*(SRCH-02, SRCH-03, SRCH-04 require browser/visual verification — no automated test path exists without a browser testing framework, which is out of scope)*

---

## Security Domain

The `security_enforcement` key is absent from `.planning/config.json`, so it is treated as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | — |
| V3 Session Management | No | — |
| V4 Access Control | No | — |
| V5 Input Validation | Yes | `validateCsv` in `build-data.js` (already in use); extend to `glossary.csv` |
| V6 Cryptography | No | — |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| CSV injection via glossary.csv | Tampering | `validateCsv` pre-flight; DuckDB reads with explicit column types |
| Path traversal via image_filename in glossary | Tampering | Validate `image_filename` contains only `[a-zA-Z0-9._-]+` in `build-data.js` (same pattern as images.csv) |
| XSS via glossary term/definition rendered in template | Tampering | Nunjucks auto-escapes by default; do NOT use `| safe` filter on glossary content |

---

## Sources

### Primary (HIGH confidence)

- npm registry — `npm view pagefind version`: 1.5.2 confirmed
- [pagefind.app/docs/config-options/](https://pagefind.app/docs/config-options/) — `--site`, `--output-subdir` options
- [pagefind.app/docs/ui/](https://pagefind.app/docs/ui/) — PagefindUI constructor, `showSubResults` option
- [pagefind.app/docs/indexing/](https://pagefind.app/docs/indexing/) — `data-pagefind-ignore` attribute
- [lychee.cli.rs/recipes/local-folder/](https://lychee.cli.rs/recipes/local-folder/) — `--root-dir` for static site checking
- [lychee.cli.rs/guides/cli/](https://lychee.cli.rs/guides/cli/) — `--offline` flag
- `brew info lychee` — 0.23.0 stable, bottle available

### Secondary (MEDIUM confidence)

- [04-UI-SPEC.md](../04-UI-SPEC.md) — complete search page HTML, glossary structure, Pagefind CSS vars (project-authored spec)
- `scripts/build-data.js` inspection — existing VALD-03 coordinate bounds (lat 42–52, lon -125 to -110), existing validation pattern

### Tertiary (LOW confidence)

- A3 (valid state codes): inferred from PNW geography, not confirmed against actual records.csv data

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — npm registry verified pagefind 1.5.2; brew confirmed lychee 0.23.0
- Architecture: HIGH — patterns derived directly from existing codebase (`species.js`, `build-data.js`) and official Pagefind docs
- Pitfalls: MEDIUM — Pagefind/Vite interaction (Pitfall 5) and Nunjucks array mutation (A2) are based on training knowledge, not verified in this session

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 (pagefind and lychee are stable; 30-day horizon appropriate)
