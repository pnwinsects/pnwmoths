# Phase 42: Results Grid — Pattern Map

**Mapped:** 2026-06-25
**Files analyzed:** 7
**Analogs found:** 7 / 7

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/components/key-results-grid.ts` | component | request-response (props in, HTML out) | `src/components/pnwm-taxon-browser.ts` | role-match (same CDN card pattern, Light DOM, `path-prefix` getter) |
| `src/components/key-results-grid.test.ts` | test | — | `src/components/pnwm-identify.test.ts` | exact (same `node:test` + class-instantiation harness) |
| `src/components/pnwm-identify.ts` | component | request-response + async fetch | `src/components/pnwm-taxon-browser.ts` | exact (async `connectedCallback`, inline JSON read + network fetch, Light DOM) |
| `src/components/pnwm-identify.test.ts` | test | — | itself (extend existing file) | exact |
| `src/components/main.ts` | config/registry | — | itself | exact (one-liner import) |
| `src/identify/index.njk` | template | — | `src/browse/index.njk` | exact (`path-prefix="{{ '/' | url }}"` attribute pattern) |
| `src/styles/theme.css` | styles | — | itself (`.pnwm-kfp-*` and `.similar-species-*` blocks) | exact (same BEM-ish `.pnwm-xxx-*` class namespace) |

---

## Pattern Assignments

### `src/components/key-results-grid.ts` (component, presentational)

**Primary analog:** `src/components/pnwm-taxon-browser.ts`

**Imports pattern** (taxon-browser lines 1–2, 12):
```typescript
import { LitElement, html, type PropertyDeclarations, type TemplateResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import type { KeySpecies } from '../types/schemas.ts';

const CDN_BASE_URL = 'https://pnwmoths.b-cdn.net';  // hardcoded const — taxon-browser line 12
```

**Light DOM pattern** (taxon-browser line 109):
```typescript
/** Light DOM — Pico CSS and theme.css selectors must reach links and images */
createRenderRoot(): this { return this; }
```

**`_prefix` getter pattern** (taxon-browser line 106):
```typescript
get _prefix(): string { return (this as { 'path-prefix'?: string })['path-prefix'] || '/'; }
```

**`properties()` declaration pattern** (taxon-browser lines 83–95):
```typescript
static get properties(): PropertyDeclarations {
  return {
    'path-prefix':     { type: String },
    matchedSpecies:    { attribute: false },   // KeySpecies[] — no attribute serialization
    hasSelection:      { type: Boolean },
    matchedCount:      { type: Number },
    totalCount:        { type: Number },
  };
}
```
Note: `attribute: false` is the correct form for array/object reactive props (prevents Lit from trying to parse them from attributes). See taxon-browser `_families: { attribute: false, state: true }` (line 86).

**CDN card render pattern** (taxon-browser `_renderSpecies`, lines 247–262):
```typescript
_renderSpecies(species: TaxonGenus['species'], genusName: string): TemplateResult {
  return html`
    <div class="pnwm-tb-species-grid">
      ${species.map(sp => html`
        <a class="pnwm-tb-species-card" href="${this._prefix}species/${sp.slug}/">
          ${sp.navImage ? html`<img
            src="${CDN_BASE_URL}/${sp.navImage.species_slug}/${encodeURIComponent(sp.navImage.filename)}?height=186"
            alt="${genusName} ${sp.name}"
            loading="lazy"
          >` : ''}
          <div class="pnwm-tb-species-label">
            <em>${genusName} ${sp.name}</em>${sp.common_name ? html` — ${sp.common_name}` : ''}
          </div>
        </a>
      `)}
    </div>`;
}
```
For `key-results-grid`, adapt:
- Replace `.map()` with `repeat(matchedSpecies, sp => sp.slug, sp => ...)` (keyed diffing)
- Replace `sp.navImage.species_slug / sp.navImage.filename` with `sp.slug / sp.nav_image` (`KeySpecies.nav_image` is a bare string, not a `NavImage` object)
- CDN URL: `${CDN_BASE_URL}/${sp.slug}/${encodeURIComponent(sp.nav_image!)}?height=320` (UI-SPEC: 320 for 2× at 160px display height)
- Replace no-image `''` with `<div class="pnwm-krg-placeholder-wrap"><div class="similar-species-placeholder" aria-hidden="true"></div></div>`
- Card binomial: `<em>${sp.genus} ${sp.epithet}</em>` (field is `epithet`, not `name` or `species`)
- Common name: `${sp.common_name ? html`<br><span class="pnwm-krg-common">${sp.common_name}</span>` : ''}` (only when non-null)

**New-Set/new-array reactivity pattern** (taxon-browser lines 161–166):
```typescript
// ALWAYS replace collection with new instance — Lit detects change by object identity
this._expandedFamilies = new Set([...this._expandedFamilies, name]);
// For key-results-grid parent (pnwm-identify):
this._matchedSpecies = this._keyMatrix.species.filter(s => matchedSlugSet.has(s.slug));
```

**`repeat()` import** (confirmed path from `node_modules/lit/directives/repeat.js`):
```typescript
import { repeat } from 'lit/directives/repeat.js';
// Usage in render():
repeat(this.matchedSpecies, sp => sp.slug, sp => this._renderCard(sp))
```

**`customElements.define` pattern** (taxon-browser line 379):
```typescript
customElements.define('key-results-grid', KeyResultsGrid);
```

---

### `src/components/key-results-grid.test.ts` (test)

**Primary analog:** `src/components/pnwm-identify.test.ts` (lines 1–15, 160–176)

**File header + import pattern** (pnwm-identify.test.ts lines 1–16):
```typescript
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

// Import exported pure helpers — no DOM required
import { buildCategoryMap, PnwmIdentify } from './pnwm-identify.ts';
```
Adapt: import exported helpers from `./key-results-grid.ts` (e.g. `buildCardUrl`).

**No-DOM instance test pattern** (pnwm-identify.test.ts lines 160–176):
```typescript
describe('_clearAll', () => {
  test('resets _selection to an empty Map', () => {
    const c = new PnwmIdentify();
    c._categoryMap = buildCategoryMap(FIXTURE);
    c._selection = new Map([['Forewing color', new Set([1, 2])]]);
    // Override _dispatchFilterChange to avoid DOM dependency
    c._dispatchFilterChange = () => {};
    c._clearAll();
    assert.equal(c._selection.size, 0);
  });
});
```
Note: `LitElement` constructor does not require DOM — components can be instantiated and state-tested in Node without `connectedCallback`.

**Real-data gate pattern** (pnwm-identify.test.ts lines 79–84):
```typescript
test('returns exactly 8 categories from real data/key-matrix.json', () => {
  const raw = JSON.parse(readFileSync(resolve(ROOT, 'data/key-matrix.json'), 'utf-8')) as { characters: Character[] };
  const map = buildCategoryMap(raw.characters);
  assert.equal(map.size, 8, `expected 8 categories, got ${map.size}: ${[...map.keys()].join(', ')}`);
});
```
Adapt for `key-results-grid`: confirm exactly 2 species have `nav_image: null`, confirm `buildCardUrl` produces correct `encodeURIComponent` output.

---

### `src/components/pnwm-identify.ts` (MODIFY)

**Primary analog:** `src/components/pnwm-taxon-browser.ts` for the async connectedCallback pattern; itself for all existing structure.

**Current `connectedCallback` (pnwm-identify.ts lines 70–76) — synchronous, to be made async:**
```typescript
connectedCallback(): void {
  super.connectedCallback();
  const el = document.getElementById('key-char-data');
  if (!el) return;
  const data = JSON.parse(el.textContent ?? '{}') as { characters: Character[] };
  this._categoryMap = buildCategoryMap(data.characters);
}
```

**Async `connectedCallback` model to copy** (taxon-browser lines 123–145):
```typescript
async connectedCallback(): Promise<void> {
  super.connectedCallback();
  // Sync: read taxonomy JSON embedded by index.njk
  const scriptEl = document.getElementById('taxon-data');
  if (scriptEl) this._families = JSON.parse(scriptEl.textContent ?? '[]') as TaxonFamily[];
  // Async: fetch state filter data
  try {
    const res = await fetch(`${this._prefix}species-states.json`);
    const rows: unknown = await res.json();
    validateSpeciesStates(rows);
    this._stateMap = buildStateMap(rows);
    this._statesAvailable = [...new Set(rows.map(r => r.state))].sort();
  } catch (err) {
    if (err instanceof SchemaValidationError) {
      throw err;
    }
    // Network/fetch errors: soft degradation
  }
}
```
For `pnwm-identify`: replace `species-states.json` with `key-matrix.json`, replace `validateSpeciesStates` with `validateKeyMatrix`, store result as `this._keyMatrix: KeyMatrix | null`, and call `buildQuestionGroups(raw.characters)` to store `this._questionGroups`. Soft-degrade on ALL errors (including schema mismatch) per 42-RESEARCH.md Pattern 1 — grid stays in prompt state.

**`_prefix` getter to add** (taxon-browser line 106):
```typescript
get _prefix(): string { return (this as { 'path-prefix'?: string })['path-prefix'] || '/'; }
```
Must also declare `'path-prefix': { type: String }` in `properties()`.

**Current `_dispatchFilterChange` placeholder** (pnwm-identify.ts lines 140–149):
```typescript
_dispatchFilterChange(): void {
  const detail: KeyFilterChangeDetail = {
    matchedSlugs: [],  // Phase 42 will compute; placeholder in Phase 41
    count: 0,
    hasSelection: this._hasSelection(),
  };
  this.dispatchEvent(new CustomEvent<KeyFilterChangeDetail>('pnwm-key-filter-change', {
    bubbles: true,
    detail,
  }));
}
```
Phase 42 replaces the placeholder with a real `computeMatching()` call and sets `_matchedSpecies` / `_matchedCount` reactive properties.

**`_clearAll` current** (pnwm-identify.ts lines 102–105):
```typescript
_clearAll(): void {
  this._selection = new Map();
  this._dispatchFilterChange();
}
```
Phase 42 must also reset `this._matchedSpecies = []` and `this._matchedCount = 0` here (Pitfall 3 — clear must reset display props regardless of matrix load state).

**Current `render()` (pnwm-identify.ts lines 195–204) — to receive `<key-results-grid>` and layout wrapper:**
```typescript
render(): TemplateResult {
  return html`
    ${this._hasSelection() ? html`
      <div class="pnwm-kfp-sticky">
        <button type="button" @click=${() => this._clearAll()}>Clear all</button>
      </div>` : ''}
    ${[...this._categoryMap.entries()].map(([catName, questions]) =>
      this._renderCategory(catName, questions)
    )}`;
}
```
Phase 42 wraps in `.pnwm-identify-layout` div with `<aside class="pnwm-identify-panel">` for the panel and `<div class="pnwm-identify-grid-area">` for `<key-results-grid>`.

`computeMatching` signature (key-filter.ts lines 110–114):
```typescript
export function computeMatching(
  matrix: KeyMatrix,
  selection: Selection,
  questionGroups: QuestionGroups,
): MatchResult   // { matchedSlugs: string[], count: number }
```

`validateKeyMatrix` signature (key-matrix-cache.ts line 23):
```typescript
export function validateKeyMatrix(data: unknown): asserts data is KeyMatrix
// Throws Error on schema mismatch — catch all errors for soft degradation
```

---

### `src/components/pnwm-identify.test.ts` (MODIFY — extend)

**Pattern:** add new `describe` blocks following existing structure.

New tests to add (following the `_clearAll` describe block pattern at lines 159–190):
- `_dispatchFilterChange sets _matchedSpecies after matrix is loaded` — set `c._keyMatrix` to a minimal fixture, call `c._dispatchFilterChange()`, assert `c._matchedSpecies` is populated
- `_clearAll resets _matchedSpecies and _matchedCount` — extend the existing `_clearAll resets _selection to empty Map` test to also check the new reactive props

The `c._dispatchFilterChange = () => {}` override pattern (line 165) is how to avoid DOM dependency in tests.

---

### `src/components/main.ts` (MODIFY — one-liner)

**Current file** (main.ts lines 1–9):
```typescript
import './pnwm-occurrence-map.ts';
import './pnwm-occurrence-popup.ts';
import './pnwm-phenology-chart.ts';
import './pnwm-filter-bar.ts';
import './pnwm-image-slideshow.ts';
import './pnwm-taxon-browser.ts';
import './pnwm-plate-viewer.ts';
import './glossary-tooltip.ts';
import './pnwm-identify.ts';
```
Add one line: `import './key-results-grid.ts';` — insert before or after `pnwm-identify.ts` (order does not matter for Lit; after is conventional as the grid is mounted inside identify).

---

### `src/identify/index.njk` (MODIFY — add `path-prefix` attribute)

**Current** (index.njk line 14):
```njk
<pnwm-identify></pnwm-identify>
```

**Browse-page pattern to mirror** (browse/index.njk line 12):
```njk
<pnwm-taxon-browser path-prefix="{{ '/' | url }}"></pnwm-taxon-browser>
```

**Change to:**
```njk
<pnwm-identify path-prefix="{{ '/' | url }}"></pnwm-identify>
```
`'/' | url` resolves to `/` in local dev and `/pnwmoths/` on GitHub Pages (controlled by `GITHUB_PAGES` env var in `eleventy.config.ts`). This is the only safe way to handle the path prefix — see memory note `pathPrefix must be conditional on GITHUB_PAGES`.

---

### `src/styles/theme.css` (MODIFY — add `.pnwm-krg-*` and `.pnwm-identify-layout`)

**Existing similar-species CSS pattern to NOT redefine** (theme.css lines 314–319):
```css
.similar-species-placeholder {
  height: 93px;
  width: 60px;
  background: #d6d0bc;
  border-radius: 2px;
}
```
Do not add a new rule for `.similar-species-placeholder` — it is reused as-is inside `.pnwm-krg-placeholder-wrap`.

**Existing `.pnwm-kfp-sticky` pattern to mirror for sticky panel** (theme.css lines 381–387):
```css
.pnwm-kfp-sticky {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #ffffff;
  padding: 8px 0;
}
```

**Existing species-page two-column breakpoint** (theme.css — search for `.species-content` — uses `gap: 1.5rem` and breaks at 768px):
The new `.pnwm-identify-layout` should use the same 768px breakpoint and 1.5rem gap.

**New CSS to add** (from UI-SPEC.md Layout section, confirmed against existing patterns):
```css
/* Two-column layout for /identify/ — desktop (Phase 42) */
.pnwm-identify-layout {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 24px;
  align-items: start;
}

.pnwm-identify-panel {
  position: sticky;
  top: 0;
  max-height: 100vh;
  overflow-y: auto;
  align-self: start;
  min-width: 0;
}

.pnwm-identify-grid-area {
  min-width: 0;  /* prevents grid blowout with many cards — Pitfall 6 */
}

@media (max-width: 768px) {
  .pnwm-identify-layout {
    grid-template-columns: 1fr;
    gap: 16px;
  }
  .pnwm-identify-panel {
    position: static;
    max-height: none;
    overflow-y: visible;
  }
}

/* Results grid count line */
.pnwm-krg-count {
  font-size: 0.875rem;
  color: var(--pico-muted-color);
  margin: 0 0 8px 0;
  padding: 8px 0 0 0;
}

/* Results grid container */
.pnwm-krg-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 16px;
}

/* Card link */
.pnwm-krg-card {
  display: block;
  text-decoration: none;
  color: inherit;
}

.pnwm-krg-card:hover,
.pnwm-krg-card:focus-visible {
  outline: 2px solid var(--pico-primary);
  outline-offset: 2px;
  border-radius: 2px;
}

.pnwm-krg-card img {
  width: 100%;
  height: 160px;
  object-fit: cover;
  display: block;
  border-radius: 2px;
}

/* Wrapper that centers the gray placeholder block at card image height */
.pnwm-krg-placeholder-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 160px;
  background: #f0ece0;
  border-radius: 2px;
}

/* Card label */
.pnwm-krg-label {
  padding: 4px 0 0 0;
  font-size: 0.875rem;
  line-height: 1.3;
}

.pnwm-krg-common {
  font-size: 1rem;
  font-style: normal;
  display: block;
  line-height: 1.4;
  margin-top: 4px;
}

/* At-rest prompt and zero-match empty-state text */
.pnwm-krg-prompt,
.pnwm-krg-empty {
  font-size: 0.875rem;
  color: var(--pico-muted-color);
  margin: 16px 0;
}
```
Append this block after the existing `.pnwm-kfp-*` rules (currently ending around line 394).

---

## Shared Patterns

### Light DOM (`createRenderRoot`)
**Source:** `src/components/pnwm-taxon-browser.ts` line 109; `src/components/pnwm-identify.ts` line 61
**Apply to:** `key-results-grid.ts` (mandatory — `.similar-species-placeholder` CSS from `theme.css` must reach the component's internals)
```typescript
createRenderRoot(): this { return this; }
```

### `path-prefix` attribute + `_prefix` getter
**Source:** `src/components/pnwm-taxon-browser.ts` lines 85, 106
**Apply to:** `pnwm-identify.ts` (new), then passed as `.pathPrefix=${this._prefix}` to `key-results-grid`
```typescript
// In properties():
'path-prefix': { type: String },
// Getter:
get _prefix(): string { return (this as { 'path-prefix'?: string })['path-prefix'] || '/'; }
```

### New-collection reactivity
**Source:** `src/components/pnwm-taxon-browser.ts` lines 161–166; `src/components/pnwm-identify.ts` lines 82–88
**Apply to:** all `_selection`, `_matchedSpecies`, `_expandedCategories` mutations in `pnwm-identify.ts`
Always assign `this._matchedSpecies = array.filter(...)` rather than mutating in place.

### Async fetch + soft degradation
**Source:** `src/components/pnwm-taxon-browser.ts` lines 123–145
**Apply to:** `pnwm-identify.ts` `connectedCallback` upgrade
Pattern: `try { fetch → validate → store } catch (err) { console.error; leave state at default }`.

### `node:test` test harness (no DOM)
**Source:** `src/components/pnwm-identify.test.ts` lines 1–16, 160–176
**Apply to:** `key-results-grid.test.ts`
Instantiate `new KeyResultsGrid()` directly; set properties; call exported pure helpers; assert without `connectedCallback` or rendering.

---

## No Analog Found

All files have direct analogs. No files require falling back to RESEARCH.md patterns exclusively.

---

## Metadata

**Analog search scope:** `src/components/`, `src/styles/`, `src/identify/`, `src/browse/`, `src/_lib/`
**Files read:** 10 source files + 3 planning documents
**Pattern extraction date:** 2026-06-25
