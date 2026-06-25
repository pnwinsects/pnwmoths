# Phase 41: Identify Page Scaffold & Filter Panel — Pattern Map

**Mapped:** 2026-06-24
**Files analyzed:** 8 new/modified files
**Analogs found:** 8 / 8

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/identify/index.njk` | route/template | request-response (SSR) | `src/browse/index.njk` | exact |
| `src/_data/keyMatrix.ts` | data loader | batch (build-time) | `src/_data/taxon.ts` | role-match |
| `src/components/pnwm-identify.ts` | component | event-driven | `src/components/pnwm-taxon-browser.ts` | exact |
| `src/components/pnwm-identify.test.ts` | test | — | `scripts/build-key.test.ts` (pattern only) | role-match |
| `src/_includes/base.njk` | layout (modify) | request-response | `src/_includes/base.njk` lines 21–29 | self |
| `src/components/main.ts` | registry (modify) | — | `src/components/main.ts` lines 1–8 | self |
| `scripts/build-key.ts` | build script (modify) | batch | `scripts/build-key.ts` lines 62–87 | self |
| `src/styles/theme.css` | stylesheet (modify) | — | `src/styles/theme.css` lines 108–143 | self |

---

## Pattern Assignments

### `src/identify/index.njk` (route/template, SSR)

**Analog:** `src/browse/index.njk`

**Frontmatter pattern** (browse/index.njk lines 1–5):
```njk
---
layout: base.njk
title: Browse — PNW Moths
permalink: /browse/index.html
---
```
Copy this pattern; change `title` to `"Identify a moth — PNW Moths"`, `permalink` to `/identify/index.html`.

**Inline JSON block** (browse/index.njk lines 8–10):
```njk
<script type="application/json" id="taxon-data" data-pagefind-ignore>
  {{ taxon | tojson | safe }}
</script>
```
Mirror exactly; change `id` to `key-char-data` and data variable to `keyMatrix`:
```njk
<script type="application/json" id="key-char-data" data-pagefind-ignore>
  {{ keyMatrix | tojson | safe }}
</script>
```
Note: `keyMatrix` exports `{ characters, species }` only — NOT the full matrix. Keep `data-pagefind-ignore`.

**Custom element instantiation** (browse/index.njk line 12):
```njk
<pnwm-taxon-browser path-prefix="{{ '/' | url }}"></pnwm-taxon-browser>
```
Mirror; the identify component needs no attribute: `<pnwm-identify></pnwm-identify>`.

**`<noscript>` degradation** (browse/index.njk lines 14–33):
```njk
<noscript data-pagefind-ignore>
  {% for family in taxon %}
    <h2>{{ family.name }}</h2>
    {% for subfam in family.subfamilies %}
      {% if subfam.name %}<h3>{{ subfam.name }}</h3>{% endif %}
      {% for genus in subfam.genera %}
        <h4>{{ genus.name }}</h4>
        <ul>
          {% for sp in genus.species %}
            <li><a href="{{ ('/species/' + sp.slug + '/') | url }}">
              <em>{{ genus.name }} {{ sp.name }}</em>{% if sp.common_name %} — {{ sp.common_name }}{% endif %}
            </a></li>
          {% endfor %}
        </ul>
      {% endfor %}
    {% endfor %}
  {% endfor %}
</noscript>
```
The identify `<noscript>` needs TWO sections (character hierarchy as nested text + species list). The species list mirrors this loop structure but iterates `keyMatrix.familyGroups` (pre-grouped in the data loader). The character hierarchy uses `keyMatrix.characters` as a flat list, breaking on `category` change for `<h2>` headings and iterating question/state as `<ul>/<li>` text (no form controls per D-08).

---

### `src/_data/keyMatrix.ts` (data loader, build-time batch)

**Analog:** `src/_data/taxon.ts`

**Export signature pattern** (taxon.ts line 87):
```typescript
export default async function (): Promise<TaxonFamily[]> {
```
`keyMatrix.ts` is synchronous (no DuckDB needed — data is already JSON), so:
```typescript
export default function (): KeyMatrixData {
```

**File read pattern** — taxon.ts uses DuckDB; keyMatrix.ts uses `readFileSync` and `csv-parse/sync`:
```typescript
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseCsv } from 'csv-parse/sync';
```

**CSV parse pattern** (taxon.ts lines 91–107 uses DuckDB SQL; keyMatrix.ts uses csv-parse/sync directly):
```typescript
const speciesRows = parseCsv(
  readFileSync(resolve('data/species.csv')),
  { columns: true, skip_empty_lines: true }
) as Array<{ genus: string; species: string; family: string }>;
```

**Map-building pattern** (taxon.ts lines 179–200 — Map for O(1) lookup):
```typescript
const familyMap: Record<string, TaxonFamilyBuild> = {};
for (const row of speciesRows) {
  const famKey = String(row.family);
  if (!familyMap[famKey]) { ... }
  ...
}
```
keyMatrix.ts mirrors this for a slug→family lookup:
```typescript
const familyBySlug = new Map(
  speciesRows.map(r => [
    `${r.genus.toLowerCase()}-${r.species.toLowerCase()}`,
    r.family ?? null
  ])
);
```

**Return value**: `{ characters, species, familyGroups }` where `familyGroups` pre-groups species for the no-JS Nunjucks template (avoids Nunjucks `{% set %}` within `{% for %}` persistence issues). See RESEARCH.md Q3 for the full interface.

---

### `src/components/pnwm-identify.ts` (component, event-driven)

**Analog:** `src/components/pnwm-taxon-browser.ts`

**Imports pattern** (pnwm-taxon-browser.ts lines 1–2):
```typescript
import { LitElement, html, type PropertyDeclarations, type TemplateResult } from 'lit';
import { SpeciesStateSchema, type SpeciesState, type TaxonFamily, ... } from '../types/index.ts';
```
Mirror for pnwm-identify.ts:
```typescript
import { LitElement, html, type TemplateResult, type PropertyDeclarations } from 'lit';
import type { Character, KeySpecies } from '../types/schemas.ts';
import type { KeyFilterChangeDetail } from '../types/events.ts';
```

**Light DOM pattern** (pnwm-taxon-browser.ts line 109):
```typescript
/** Light DOM — Pico CSS must reach selects, headings, links inside this component (D-09) */
createRenderRoot(): this { return this; }
```
Copy this verbatim. NEVER use default `createRenderRoot()` (Shadow DOM breaks Pico form controls).

**Properties declaration pattern** (pnwm-taxon-browser.ts lines 83–95):
```typescript
static get properties(): PropertyDeclarations {
  return {
    'path-prefix':        { type: String },
    _families:            { attribute: false, state: true },
    _expandedFamilies:    { attribute: false, state: true },
    ...
  };
}
```
Mirror for pnwm-identify.ts: `_categoryMap`, `_expandedCategories`, `_selection` — all with `{ attribute: false, state: true }`.

**Constructor initialization** (pnwm-taxon-browser.ts lines 111–121):
```typescript
constructor() {
  super();
  this._families = [];
  this._expandedFamilies = new Set();
  ...
}
```
Mirror: initialize `_categoryMap = new Map()`, `_expandedCategories = new Set()`, `_selection = new Map()`.

**connectedCallback inline JSON read** (pnwm-taxon-browser.ts lines 123–127):
```typescript
async connectedCallback(): Promise<void> {
  super.connectedCallback();
  // Sync: read taxonomy JSON embedded by index.njk (D-10)
  const scriptEl = document.getElementById('taxon-data');
  if (scriptEl) this._families = JSON.parse(scriptEl.textContent ?? '[]') as TaxonFamily[];
  ...
}
```
Mirror for pnwm-identify.ts (synchronous only — no async fetch in Phase 41):
```typescript
connectedCallback(): void {
  super.connectedCallback();
  const el = document.getElementById('key-char-data');
  if (!el) return;
  const data = JSON.parse(el.textContent ?? '{}') as { characters: Character[] };
  this._categoryMap = buildCategoryMap(data.characters);
}
```

**new-Set toggle pattern** (pnwm-taxon-browser.ts lines 160–167):
```typescript
_toggleFamily(name: string): void {
  if (this._expandedFamilies.has(name)) {
    this._expandedFamilies = new Set([...this._expandedFamilies].filter(n => n !== name));
  } else {
    this._expandedFamilies = new Set([...this._expandedFamilies, name]);
  }
}
```
**Critical:** Always create a new Set — never `.add()` in place. Apply identically for `_toggleCategory`. Apply same pattern for `_selection` (new Map on each mutation).

**aria-expanded accordion pattern** (pnwm-taxon-browser.ts lines 311–328):
```typescript
_renderFamily(family: TaxonFamily): TemplateResult {
  const expanded = this._expandedFamilies.has(family.name);
  return html`
    <div class="pnwm-tb-family-row">
      <h2>
        <button
          type="button"
          aria-expanded="${expanded}"
          @click=${() => this._toggleFamily(family.name)}
        >${family.name}</button>
      </h2>
      ${!expanded ? ... : ''}
      <div ?hidden=${!expanded}>
        ${family.subfamilies.map(s => this._renderSubfamily(s, family.name))}
      </div>
    </div>`;
}
```
Mirror for `_renderCategory`; use `pnwm-kfp-category` CSS class prefix (not `pnwm-tb-`). Add badge span when `selCount > 0`. Use `?hidden=${!expanded}` — not CSS `display:none`.

**customElements.define pattern** (pnwm-taxon-browser.ts line 379):
```typescript
customElements.define('pnwm-taxon-browser', PnwmTaxonBrowser);
```
Mirror: `customElements.define('pnwm-identify', PnwmIdentify);`

---

### `src/components/pnwm-identify.test.ts` (test)

**Analog:** `scripts/build-key.test.ts` (Node built-in test runner pattern; check existing file for import style)

The test framework is Node.js built-in (`node --test`). Tests run `.ts` files directly via Node 24 type-stripping. Pattern: `import { test, describe } from 'node:test'; import { strict as assert } from 'node:assert';`.

Test targets:
- `buildCategoryMap(characters)` — returns exactly 8 categories after stray-quote fix
- `_selectionCountForCategory` — correct badge count after checkbox toggles
- `_hasSelection()` — returns false on empty Map, true after any selection
- `_clearAll()` — resets `_selection` to empty Map

---

### `src/_includes/base.njk` (layout, modify nav)

**Self-analog** (base.njk lines 21–29):
```njk
<nav class="site-nav" data-pagefind-ignore>
  <ul>
    <li><a href="{{ '/' | url }}">Home</a></li>
    <li><a href="{{ '/browse/' | url }}">Browse</a></li>
    <li><a href="{{ '/search/' | url }}">Search</a></li>
    <li><a href="{{ '/glossary/' | url }}">Glossary</a></li>
    <li><a href="{{ '/faqs/' | url }}">FAQs</a></li>
    <li><a href="{{ '/plates/' | url }}">Plates</a></li>
  </ul>
</nav>
```
Add one `<li>` after "Browse": `<li><a href="{{ '/identify/' | url }}">Identify</a></li>`.

---

### `src/components/main.ts` (registry, modify)

**Self-analog** (main.ts lines 1–8):
```typescript
import './pnwm-occurrence-map.ts';
import './pnwm-occurrence-popup.ts';
import './pnwm-phenology-chart.ts';
import './pnwm-filter-bar.ts';
import './pnwm-image-slideshow.ts';
import './pnwm-taxon-browser.ts';
import './pnwm-plate-viewer.ts';
import './glossary-tooltip.ts';
```
Add one line: `import './pnwm-identify.ts';`

---

### `scripts/build-key.ts` — `parseCharacterLabel` (build script, modify)

**Self-analog** (build-key.ts lines 62–87 — current implementation):
```typescript
export function parseCharacterLabel(label: string): {
  category: string;
  subcategory: string | null;
  question: string;
  state: string;
} {
  const parts = label.split(':');
  if (parts.length === 3) {
    const [category, question, state] = parts as [string, string, string];
    return {
      category: category.trim(),
      subcategory: null,
      question: question.trim(),
      state: state.trim(),
    };
  } else if (parts.length === 4) {
    const [category, subcategory, question, state] = parts as [string, string, string, string];
    return {
      category: category.trim(),
      subcategory: subcategory.trim(),
      question: question.trim(),
      state: state.trim(),
    };
  }
  throw new Error(`Unexpected character label depth: "${label}" (${parts.length} parts; expected 3 or 4)`);
}
```

**Minimal diff — add one line at the top of the function body before `label.split(':')`:**
```typescript
  // Strip leading/trailing double-quotes produced by csv-parse relax_quotes on embedded-quote fields.
  // e.g. '"Abdomen and thorax:Abdomen:...:Yes"' → 'Abdomen and thorax:Abdomen:...:Yes'
  const cleaned = label.replace(/^"|"$/g, '');
  const parts = cleaned.split(':');
```
All subsequent references to `parts` remain unchanged. After this fix, re-run `npm run build:key` to regenerate `data/key-matrix.json` with 8 clean category strings.

---

### `src/styles/theme.css` (stylesheet, modify)

**Self-analog** (theme.css lines 108–143 — existing `.pnwm-tb-*` accordion rules):
```css
.pnwm-tb-family-row h2 button,
.pnwm-tb-subfamily-row h3 button,
.pnwm-tb-genus-row h4 button {
  all: unset;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.35em;
}

.pnwm-tb-family-row h2 button::before,
.pnwm-tb-subfamily-row h3 button::before,
.pnwm-tb-genus-row h4 button::before {
  content: '▶';
  font-size: 0.6em;
  display: inline-block;
  transition: transform 0.15s;
  flex-shrink: 0;
}

.pnwm-tb-family-row h2 button[aria-expanded="true"]::before,
.pnwm-tb-subfamily-row h3 button[aria-expanded="true"]::before,
.pnwm-tb-genus-row h4 button[aria-expanded="true"]::before {
  transform: rotate(90deg);
}

.pnwm-tb-subfamily-row { padding-left: 1.5rem; }
.pnwm-tb-genus-row     { padding-left: 1.5rem; }
```
Copy this block; replace prefix `pnwm-tb-family-row h2` with `pnwm-kfp-category h2` throughout. Add new rules for:
- `.pnwm-kfp-badge` — pill badge: `background: #a4ab78; color: #fff; border-radius: 1em; padding: 0 0.4em; font-size: 0.75em;`
- `.pnwm-kfp-sticky` — sticky "Clear all" bar: `position: sticky; top: 0; z-index: 1; background: #ffffff; padding: 8px 0;`
- `.pnwm-kfp-question` — fieldset question group: strip Pico fieldset default margin/border for compact rendering

**Key token values** (from theme.css `:root`):
- `--pico-primary: #a4ab78` (olive — use for badge background, "Clear all" button)
- `--pico-background-color: #f3e8ba` (cream — page background, already inherited)
- `.content-wrapper` background: `#ffffff` (white — use for sticky bar background)

---

## Shared Patterns

### Light DOM (applies to all Lit components)
**Source:** `src/components/pnwm-taxon-browser.ts` line 109
```typescript
createRenderRoot(): this { return this; }
```
Apply to `pnwm-identify.ts`. Required so Pico CSS reaches `<input type="checkbox">`, `<fieldset>`, `<legend>`.

### new-Set / new-Map reactivity (applies to all Lit state mutations)
**Source:** `src/components/pnwm-taxon-browser.ts` lines 160–167
```typescript
this._expandedFamilies = new Set([...this._expandedFamilies].filter(n => n !== name));
// or:
this._expandedFamilies = new Set([...this._expandedFamilies, name]);
```
NEVER `.add()` or `.delete()` in place. Always replace the property with a new collection. Apply for `_expandedCategories` (Set) and `_selection` (Map).

### Inline JSON via `_data` loader (applies to identify/index.njk + keyMatrix.ts)
**Source:** `src/browse/index.njk` lines 8–10 + `src/_data/taxon.ts` line 87
```njk
<script type="application/json" id="taxon-data" data-pagefind-ignore>
  {{ taxon | tojson | safe }}
</script>
```
Data flows: `_data/taxon.ts` default export → Eleventy injects as `taxon` → template inlines with `| tojson | safe`. Mirror: `keyMatrix.ts` → `keyMatrix` in template.

### `data-pagefind-ignore` (applies to inline JSON blocks and `<noscript>`)
**Source:** `src/browse/index.njk` lines 8, 14
All `<script type="application/json">` blocks and `<noscript>` sections must carry `data-pagefind-ignore`.

### customElements.define at file end
**Source:** `src/components/pnwm-taxon-browser.ts` line 379
Every component file ends with `customElements.define('tag-name', ClassName);`. The component class itself is NOT exported (consistent with all existing components in this project).

### `| url` filter for all hrefs
**Source:** `src/_includes/base.njk` lines 23–28 + `src/browse/index.njk` line 25
```njk
<a href="{{ '/browse/' | url }}">
<a href="{{ ('/species/' + sp.slug + '/') | url }}">
```
Every href in Nunjucks templates uses the `| url` filter (handles `pathPrefix` for GitHub Pages). Never hardcode `/pnwmoths/` or any path prefix directly.

---

## No Analog Found

No files in this phase are without analog. All files mirror confirmed existing patterns.

---

## Metadata

**Analog search scope:** `src/components/`, `src/_data/`, `src/_includes/`, `src/browse/`, `src/styles/`, `scripts/`
**Files scanned:** 8 analog files read
**Pattern extraction date:** 2026-06-24
