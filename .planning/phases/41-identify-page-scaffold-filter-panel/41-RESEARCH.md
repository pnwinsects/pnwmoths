# Phase 41: Identify Page Scaffold & Filter Panel - Research

**Researched:** 2026-06-24
**Domain:** Lit Web Components + Eleventy _data pipeline + inline JSON strategy + no-JS degradation
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: All 8 categories included (Distribution, Seasonality, and all morphological). No special-casing.
- D-02: Distribution renders all 6 questions / 52 states flat; no ecoregion dependency UX this phase.
- D-03: Category-only collapse (default-collapsed). Within a category, questions are labeled groups (fieldset/legend) but NOT individually collapsible.
- D-04: Category order = native key order from key-characters.csv.
- D-05: Per-category count badges on collapsed headers ("Forewing color and pattern (3)").
- D-06: "Clear all" sticky at panel top, conditionally visible (shown when ≥1 state selected).
- D-07: No-JS species list = all 1,192 matched species as links, grouped Family → Genus (mirrors Browse).
- D-08: No-JS character hierarchy = plain nested text (h2/h3/ul/li), no form controls.

### Claude's Discretion
- Inline-JSON scope: what is inlined vs fetched.
- Data source for no-JS species list + inlined hierarchy: _data loader vs direct template read.
- Light DOM vs Shadow DOM for the panel.
- Badge / sticky-header styling (exact visual treatment per Pico tokens).

### Deferred Ideas (OUT OF SCOPE)
- Ecoregion → State/Province dependency hint (IDENT-09, v4.x)
- Live "N species match" count + thumbnail results grid (Phase 42)
- Character illustration / help images (Phase 43)
- "Characters used" removable chip strip (IDENT-07, v4.x)
- URL query-param state persistence (IDENT-08, v4.x)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| IDENT-01 | New dedicated `/identify/` page (Eleventy route), linked from site navigation | `src/identify/index.njk` + base.njk nav link pattern confirmed |
| IDENT-02 | Character filter panel renders all 8 categories as collapsible groups (default-collapsed), nesting subcategory → question → state, reusing `aria-expanded` toggle pattern from `pnwm-taxon-browser` | `pnwm-taxon-browser.ts` patterns confirmed; new-Set reactivity required |
| IDENT-03 | User can select/deselect individual character states (checkbox toggle), in any order | Checkbox state tracked in `Selection` Map; dispatches `pnwm-key-filter-change` |
| IDENT-05 | "Clear all" reset clears every selection and restores the full result set | Clears `_selection` Map; dispatches event with `hasSelection: false` |
| IDENT-06 | No-JS static degradation — full character list and full species list visible as static HTML without JS, consistent with browse page | `<noscript>` pattern confirmed from `src/browse/index.njk` |
</phase_requirements>

---

## Summary

Phase 41 creates the `/identify/` page with a fully interactive 237-state character filter panel before any results grid is wired in. The panel mirrors the existing `pnwm-taxon-browser` component's Light DOM + Pico + `aria-expanded` accordion pattern, reading character hierarchy data from an inlined `<script type="application/json" id="key-char-data">` block.

The five open technical questions (stray-quote artifact, inline-JSON scope, data-source pattern, page-weight mechanics, and buildQuestionGroups/event contract) are all fully resolved by the codebase investigation. Concretely: the stray-quote artifact must be fixed in `scripts/build-key.ts` at the `parseCharacterLabel` level; inlining `characters` only (~41 KB raw, ~3.5 KB gzip) is well within the 500 KB page budget; a `src/_data/keyMatrix.ts` loader mirrors the `taxon.ts` pattern and feeds both inline JSON and the no-JS species list; the page-weight check (`scripts/check-page-weight.ts`) counts raw HTML bytes against a 500 KB threshold; and `buildQuestionGroups()` returns `Map<string, Character[]>` while `KeyFilterChangeDetail` carries `{ matchedSlugs, count, hasSelection }`.

**Primary recommendation:** Two-component architecture: `pnwm-identify` (root, Light DOM, reads `#key-char-data`) contains the filter panel logic inline (not a separate custom element), matching the simplest interpretation of the UI-SPEC's "internal to `pnwm-identify` or separate `pnwm-key-filter-panel`" note. Keep it one file until complexity demands splitting.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Identify page route + nav link | Frontend Server (SSR / Eleventy) | — | Static Eleventy template; no server needed |
| Character hierarchy data for panel render | Frontend Server (SSR) | Browser (read from DOM) | Inlined at build time as `#key-char-data`; read synchronously in `connectedCallback` |
| No-JS species list (Family → Genus) | Frontend Server (SSR) | — | Rendered in `<noscript>` by Eleventy template using `_data/keyMatrix.ts` output |
| Character filter panel (checkboxes, accordion, badges, Clear all) | Browser / Client (Lit component) | — | Interactive state; requires JS |
| `pnwm-key-filter-change` event dispatch | Browser / Client (Lit component) | — | Dispatched on user interaction; no consumer in Phase 41 |
| Page-weight validation | Build Pipeline | — | `scripts/check-page-weight.ts` runs post-Eleventy in `npm run build` |

---

## Open Questions — Answered

### Q1: Stray-Quote Artifact in `data/key-matrix.json`

**Root cause confirmed.** Lines 235–236 of `data/key-characters.csv` contain a field with embedded double-quotes that are not properly escaped:

```
"Abdomen and thorax:Abdomen:Does it appear as if the tip of the abdomen was "dipped" in a different color?:Yes"
```

The opening `"` of `"dipped"` is treated by `csv-parse` with `relax_quotes: true` as a closing quote for the cell. What csv-parse returns is `"Abdomen and thorax:Abdomen:Does it appear as if the tip of the abdomen was ` — i.e., everything before `"dipped"` including the leading `"`. This leaves `parseCharacterLabel` receiving a label that starts with `"Abdomen and thorax` (note the leading `"`), which propagates into `character.category`.

**Fix location: `scripts/build-key.ts` in `parseCharacterLabel()`.** [VERIFIED: source code]

The fix is a single line added at the top of `parseCharacterLabel`:

```typescript
export function parseCharacterLabel(label: string): { ... } {
  // Strip leading/trailing double-quotes (relax_quotes artifact from embedded-quote fields)
  const cleaned = label.replace(/^"|"$/g, '').trim();
  const parts = cleaned.split(':');
  // ... rest unchanged
}
```

This is the correct fix location because:
1. It keeps the artifact out of `data/key-matrix.json` (the committed artifact) and therefore out of all downstream consumers including Phase 42 and Phase 43.
2. `parseCharacterLabel` is already the normalisation point for character labels.
3. The stray characters are `id: 233` and `id: 234`; after the fix their `category` becomes `Abdomen and thorax` (8 categories total, correct) and their `state` values become `Yes` / `No` (stripping trailing `"`).
4. Also strip the state field's trailing `"`: `state: state.replace(/"/g, '').trim()` — the state values `Yes"` and `No"` both carry a trailing quote.

**Concrete diff to `parseCharacterLabel` in `scripts/build-key.ts`:**

```typescript
export function parseCharacterLabel(label: string): {
  category: string;
  subcategory: string | null;
  question: string;
  state: string;
} {
  // Strip leading/trailing double-quotes produced by relax_quotes on embedded-quote fields.
  // e.g. '"Abdomen and thorax:...:Yes"' → 'Abdomen and thorax:...:Yes'
  const cleaned = label.replace(/^"|"$/g, '');
  const parts = cleaned.split(':');
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

After the fix, `npm run build:key` must be re-run to regenerate `data/key-matrix.json` with clean category strings. The existing `build-key.test.ts` should gain a test for the embedded-quote case.

### Q2: Inline-JSON Scope vs Page-Weight Budget

**Confirmed: inline `characters` only.** [VERIFIED: source code + size measurement]

Measured sizes from `data/key-matrix.json`:
- `characters` array: 41,708 bytes raw / **3,532 bytes gzip**
- `species` array (slug + genus + epithet, no bitsets): 83,005 bytes raw / 14,724 bytes gzip
- `matrix` bitsets: ~48 KB raw (not needed until Phase 42)
- Full file: 243,580 bytes raw / 42,166 bytes gzip

The page-weight threshold is **500 KB raw HTML bytes** (see Q4 below). Inlining `characters` alone adds 41,708 bytes to the page — comfortably under budget. The `species` array (83 KB raw) is needed for the no-JS fallback. The combined `characters` + `species` inline is ~124 KB raw / ~18.6 KB gzip — still well within budget.

**Recommendation:** Inline `{ characters, species }` as `#key-char-data`. The panel only reads `characters` at runtime; the `species` data is consumed by the `<noscript>` Nunjucks template (see Q3). An alternative is to split them into two script elements — but a single `#key-char-data` containing both is simpler and already matches the UI-SPEC decision.

The ~243 KB raw matrix bitsets are NOT inlined. They live in `_site/key-matrix.json` (already wired via `scripts/copy-key-matrix.ts`) and are fetched only in Phase 42 when `computeMatching()` is needed.

### Q3: Data-Source Pattern — `_data` Loader vs Direct Template Read

**Recommendation: create `src/_data/keyMatrix.ts` mirroring `taxon.ts`.** [ASSUMED — pattern recommendation based on existing code]

The `src/_data/taxon.ts` precedent:
- Is a TypeScript file with `export default async function()`.
- Is discovered by `eleventy.config.ts`'s `addDataExtension("ts", ...)` handler, which calls the default export.
- Returns data that is available in templates as `{{ taxon }}`.
- In `browse/index.njk`: `{{ taxon | tojson | safe }}` inlines it; the `<noscript>` block iterates it.

`src/_data/keyMatrix.ts` should:
1. Read `data/key-matrix.json` synchronously (no DuckDB needed — it is already a clean JSON file).
2. Export a plain object: `{ characters: Character[], species: KeySpecies[] }` (drop `matrix` and `meta`; the panel does not need them at render time).
3. Return type matches the existing `Character` and `KeySpecies` Zod-derived types from `src/types/schemas.ts`.

The template then uses:
```njk
<script type="application/json" id="key-char-data" data-pagefind-ignore>
  {{ keyMatrix | tojson | safe }}
</script>
```

And the `<noscript>` block iterates `keyMatrix.species` (grouped by family via a Nunjucks macro or template logic).

**Why not read JSON directly in template?** Eleventy Nunjucks templates cannot `readFileSync` — data must flow through the `_data` layer. The `_data` pattern also gives TypeScript type-safety (via the `Character` and `KeySpecies` types), validates the data at build time, and matches the established project convention.

**Note on grouping for no-JS species list:** `key-matrix.json` `species` objects have `slug`, `genus`, `epithet`, `common_name`, `nav_image`. They do NOT carry `family`. To group by Family → Genus for the no-JS list, the keyMatrix data loader must join to `data/species.csv` (or use `src/_data/taxon.ts`'s output) to get family information. The simplest approach: in `keyMatrix.ts`, after loading the species list, read `species.csv` with csv-parse to build a `Map<slug, family>` and attach `family` to each `KeySpecies` before returning. Alternatively, the template can join `keyMatrix.species` against `taxon` (the family tree already available from `_data/taxon.ts`) using Nunjucks logic. The template join approach avoids duplicating CSV parsing but makes the template more complex. The data-loader approach is cleaner and more testable.

**Concrete interface for `keyMatrix.ts` export:**

```typescript
// src/_data/keyMatrix.ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseCsv } from 'csv-parse/sync';
import type { Character, KeySpecies } from '../types/schemas.ts';

export interface KeyMatrixData {
  characters: Character[];
  species: KeySpeciesWithFamily[];
}

export interface KeySpeciesWithFamily extends KeySpecies {
  family: string | null;
}

export default function (): KeyMatrixData {
  const raw = JSON.parse(readFileSync(resolve('data/key-matrix.json'), 'utf-8'));
  const characters: Character[] = raw.characters;
  const keySpecies: KeySpecies[] = raw.species;

  // Join family from species.csv for no-JS grouping
  const speciesRows = parseCsv(readFileSync(resolve('data/species.csv')), {
    columns: true, skip_empty_lines: true
  }) as Array<{ genus: string; species: string; family: string | null }>;
  const familyBySlug = new Map(
    speciesRows.map(r => [
      `${r.genus.toLowerCase()}-${r.species.toLowerCase()}`,
      r.family ?? null
    ])
  );

  const species: KeySpeciesWithFamily[] = keySpecies.map(sp => ({
    ...sp,
    family: familyBySlug.get(sp.slug) ?? null,
  }));

  return { characters, species };
}
```

### Q4: Page-Weight Check Mechanics

**Confirmed.** [VERIFIED: source code — `scripts/check-page-weight.ts`]

- Script: `scripts/check-page-weight.ts`
- npm script: `npm run build:check-weight` (runs last in `npm run build`)
- Threshold: **500 KB per HTML file** (raw bytes, not gzip) — `const THRESHOLD_BYTES = 500 * 1024`
- What counts: all `.html` files under `_site/` are walked recursively; `statSync(fullPath).size` is compared directly to the threshold
- Behavior: warnings only (non-zero `warnCount` is logged) — the script does NOT exit 1 on threshold breach. It logs a warning but the build continues.
- The `_site/key-matrix.json` has its own separate byte-budget check (`scripts/check-key-weight.ts`, 50 KB gzip limit) — already passing.

**For SC4:** `_site/identify/index.html` must stay under 500 KB raw. With `characters` + `species` inlined (~124 KB raw JSON), the page template overhead, and normal HTML, the page will be approximately 130–140 KB — safely within budget. No action needed beyond avoiding inadvertent bitset inclusion.

**Note:** The page-weight check is warnings-only, not a hard failure. SC4's true gate is human verification that the build runs without warnings about `/identify/index.html`.

### Q5: buildQuestionGroups() Contract and pnwm-key-filter-change Detail Type

**Confirmed from source.** [VERIFIED: source code — `src/_lib/key-filter.ts`, `src/types/events.ts`]

**`buildQuestionGroups(characters: Character[]): QuestionGroups`**
- Input: the `characters` array from `KeyMatrix` (237 entries)
- Output: `Map<string, Character[]>` — keyed by `character.question` string (55 unique questions for the real matrix), insertion order preserved
- The panel calls `buildQuestionGroups(characters)` once on page load after reading `#key-char-data`
- The panel uses the Map to render: for each category, filter entries by `character.category`; within a category, use the Map's entries to render question groups (`<fieldset>/<legend>`) containing per-state checkboxes

**Grouping strategy for the panel:** `buildQuestionGroups` groups by question alone. For rendering categories, the panel must additionally group by `character.category`. The natural rendering loop:

```typescript
// Build category → question → states hierarchy for rendering
type CategoryMap = Map<string, Map<string, Character[]>>; // category → questionGroups
function buildCategoryMap(characters: Character[]): CategoryMap {
  const catMap = new Map<string, Map<string, Character[]>>();
  for (const char of characters) {
    const cat = char.category; // already cleaned after stray-quote fix
    if (!catMap.has(cat)) catMap.set(cat, new Map());
    const qMap = catMap.get(cat)!;
    if (!qMap.has(char.question)) qMap.set(char.question, []);
    qMap.get(char.question)!.push(char);
  }
  return catMap;
}
```

This is the panel's own internal grouping; it does not call `buildQuestionGroups` from `key-filter.ts` directly (that function is for `computeMatching`'s `QuestionGroups` type, which is the same shape but used differently). The panel may import `buildQuestionGroups` for consistency or define its own equivalent — both are valid.

**`KeyFilterChangeDetail` (from `src/types/events.ts`):**
```typescript
export interface KeyFilterChangeDetail {
  matchedSlugs: string[];    // current matching species slugs
  count: number;             // matchedSlugs.length
  hasSelection: boolean;     // true iff any states are selected
}
```

The `HTMLElementEventMap` augmentation already registers `'pnwm-key-filter-change'` → `CustomEvent<KeyFilterChangeDetail>` — the panel can dispatch typed without casting:

```typescript
this.dispatchEvent(new CustomEvent<KeyFilterChangeDetail>('pnwm-key-filter-change', {
  bubbles: true,
  detail: { matchedSlugs: [], count: 0, hasSelection: false }
}));
```

**Phase 41 does not call `computeMatching`.** The panel only dispatches the event; the results grid (Phase 42) will be the consumer. In Phase 41, `matchedSlugs` in the event detail can be left empty `[]` (or all 1,192 slugs) since no consumer reads it.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Lit | 3.x (in package.json) | Lit Web Components for `pnwm-identify` | Project standard; all components use Lit |
| Pico CSS v2 | classless (loaded globally) | Styling for form controls, headings, layout | Project design system; theme tokens in `src/styles/theme.css` |
| Eleventy | 3.x (in package.json) | Static site generation, template rendering | Project SSG; `_data/` loader pattern established |
| TypeScript | 5.x + Node 24 type-stripping | Types for all new files | Project standard since Phase 33 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| csv-parse/sync | installed | CSV parsing in `keyMatrix.ts` data loader | Joining family data from species.csv |
| zod/mini | installed | Runtime type validation | If adding a load-time guard on `#key-char-data` |

### No New Packages
Phase 41 installs zero new npm packages. All required libraries are already in the project.

---

## Package Legitimacy Audit

No packages are installed in this phase — all dependencies already exist in `package.json`.

---

## Architecture Patterns

### System Architecture Diagram

```
Build time:
  data/key-characters.csv
       ↓ (build-key.ts — after stray-quote fix)
  data/key-matrix.json  {characters[], species[], matrix[], meta}
       ↓
  src/_data/keyMatrix.ts  →  { characters[], species[](+family) }
       ↓
  src/identify/index.njk  →  _site/identify/index.html
       ├── <script id="key-char-data"> JSON.stringify({characters, species}) </script>
       ├── <pnwm-identify> (custom element, rendered empty at SSR time)
       └── <noscript>  character text + species links  </noscript>

Browser runtime (JS enabled):
  _site/identify/index.html loads
       ↓
  /components/main.js (Vite bundle) registers pnwm-identify
       ↓
  connectedCallback reads #key-char-data synchronously
       ↓
  buildCategoryMap(characters) → 8 categories × questions × states
       ↓
  render() → 8 collapsed <div class="pnwm-kfp-category"> sections
       ↓
  User interaction:
    checkbox click → _selection Map updated → requestUpdate()
                  → category badge count updated
                  → pnwm-key-filter-change dispatched (no consumer Phase 41)
    "Clear all"   → _selection cleared → requestUpdate()
                  → pnwm-key-filter-change dispatched { hasSelection: false }
```

### Recommended Project Structure

```
src/
├── identify/
│   └── index.njk          # New Eleventy route (mirrors browse/index.njk)
├── _data/
│   └── keyMatrix.ts        # New _data loader (mirrors taxon.ts)
├── components/
│   ├── main.ts             # Add import of pnwm-identify.ts
│   └── pnwm-identify.ts   # New: root component + filter panel
└── _includes/
    └── base.njk            # Add "Identify" nav link
```

CSS additions go in `src/styles/theme.css` (new `.pnwm-kfp-*` rules) following the `.pnwm-tb-*` pattern.

### Pattern 1: Light DOM Component (mirror pnwm-taxon-browser)

**What:** `createRenderRoot() { return this; }` enables Pico CSS to reach all form controls inside the component.
**When to use:** Any Lit component that needs global Pico CSS on `<input>`, `<fieldset>`, `<label>`, `<button>`.

```typescript
// Source: src/components/pnwm-taxon-browser.ts line 109
createRenderRoot(): this { return this; }
```

### Pattern 2: new-Set Reactivity for Toggle State

**What:** Lit detects property change by reference equality. Mutating a Set in place does NOT trigger re-render. Always create a new Set.

```typescript
// Source: src/components/pnwm-taxon-browser.ts lines 160-167
_toggleCategory(name: string): void {
  if (this._expandedCategories.has(name)) {
    this._expandedCategories = new Set([...this._expandedCategories].filter(n => n !== name));
  } else {
    this._expandedCategories = new Set([...this._expandedCategories, name]);
  }
}
```

### Pattern 3: Inline JSON Read in connectedCallback

**What:** Read inlined JSON from a `<script type="application/json">` element synchronously on component mount.

```typescript
// Source: src/components/pnwm-taxon-browser.ts lines 126-127
async connectedCallback(): Promise<void> {
  super.connectedCallback();
  const scriptEl = document.getElementById('key-char-data');
  if (scriptEl) {
    const data = JSON.parse(scriptEl.textContent ?? '{}') as { characters: Character[]; species: KeySpecies[] };
    this._characters = data.characters;
    this._categoryMap = buildCategoryMap(data.characters);
  }
}
```

### Pattern 4: Accordion with aria-expanded

**What:** Category headings use `<h2><button type="button" aria-expanded="false">`. Content uses `?hidden=${!expanded}`. Triangle via CSS `content: '▶'`.

```typescript
// Source: src/components/pnwm-taxon-browser.ts lines 311-327
_renderFamily(family: TaxonFamily): TemplateResult {
  const expanded = this._expandedFamilies.has(family.name);
  return html`
    <div class="pnwm-tb-family-row">
      <h2>
        <button type="button" aria-expanded="${expanded}"
          @click=${() => this._toggleFamily(family.name)}
        >${family.name}</button>
      </h2>
      <div ?hidden=${!expanded}>...</div>
    </div>`;
}
```

**For the filter panel:**
```typescript
_renderCategory(catName: string, questions: Map<string, Character[]>): TemplateResult {
  const expanded = this._expandedCategories.has(catName);
  const selCount = this._selectionCountForCategory(catName);
  return html`
    <div class="pnwm-kfp-category">
      <h2>
        <button type="button" aria-expanded="${expanded}"
          @click=${() => this._toggleCategory(catName)}
        >${catName}${selCount > 0 ? html` <span class="pnwm-kfp-badge">(${selCount})</span>` : ''}
        </button>
      </h2>
      <div ?hidden=${!expanded}>
        ${[...questions.entries()].map(([q, chars]) => this._renderQuestion(q, chars))}
      </div>
    </div>`;
}
```

### Pattern 5: Inline JSON in Nunjucks Template (Browse Pattern)

```njk
{# Source: src/browse/index.njk lines 8-10 #}
<script type="application/json" id="key-char-data" data-pagefind-ignore>
  {{ keyMatrix | tojson | safe }}
</script>
```

### Pattern 6: noscript Degradation (Browse Pattern)

```njk
{# Source: src/browse/index.njk lines 14-33 #}
<noscript data-pagefind-ignore>
  {% for family in taxon %}
    <h2>{{ family.name }}</h2>
    ...
  {% endfor %}
</noscript>
```

For the Identify page, two `<noscript>` blocks (character hierarchy + species list). The species list requires grouping `keyMatrix.species` by family — use Nunjucks `groupby` filter or pre-group in `keyMatrix.ts`.

### Anti-Patterns to Avoid

- **Shadow DOM:** Never use default `createRenderRoot()` — Pico CSS form-control styles cannot reach checkboxes inside Shadow DOM.
- **Mutating Set in place:** `this._expandedCategories.add(name)` does NOT trigger Lit re-render. Always `new Set(...)`.
- **Inlining the full matrix:** The bitset `matrix` array is ~48 KB raw (plus the `species` array brings it to ~243 KB total). Inlining the full file would risk hitting the 500 KB page-weight threshold and is unnecessary — matching is Phase 42.
- **Calling computeMatching in Phase 41:** The matching function requires the bitset `matrix` (not inlined). Phase 41 dispatches the event with placeholder data only.
- **aria-expanded with boolean:** Lit's `aria-expanded="${expanded}"` must stringify correctly. Use `?hidden` for the content div, not CSS display:none, so AT announces collapse state correctly.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Checkbox state change reactivity | Custom event listeners + manual DOM updates | Lit `@change` handler + `@state()` properties + `requestUpdate()` | Lit's reactive update cycle handles batching and diffing |
| Toggle button triangle animation | Custom SVG or image | CSS `content: '▶'` + `transform: rotate(90deg)` on `[aria-expanded="true"]` | Already in `theme.css` for `.pnwm-tb-*`; extend the same rule |
| Form control styling | Custom CSS for checkboxes | Pico CSS classless form-control defaults | Pico handles checked state via `--pico-primary` (`#a4ab78`) |
| Bitset decoding for Phase 41 | Any bitset logic | None needed in Phase 41 | The panel only renders the hierarchy; matching is Phase 42 |
| JSON parsing with Zod at browser load | Full Zod schema parse | Simple structural guard (typeof checks) or trust the build-time validated artifact | Avoids bundle bloat; the inlined `#key-char-data` was Zod-validated at build time |

**Key insight:** The hardest parts (filter semantics, bitset decoding, slug matching) are already implemented in `src/_lib/key-filter.ts`. Phase 41 is UI composition only.

---

## Common Pitfalls

### Pitfall 1: Stray-Quote in Category Without Source Fix
**What goes wrong:** Panel renders 9 categories (includes `"Abdomen and thorax` as a spurious 9th); the badge count for the real `Abdomen and thorax` is split; some states are unreachable.
**Why it happens:** `data/key-matrix.json` currently has two category strings: `Abdomen and thorax` (14 chars) and `"Abdomen and thorax` (15 chars + leading quote). A category-equality check will treat these as distinct.
**How to avoid:** Fix `parseCharacterLabel` in `build-key.ts` FIRST (Wave 0 of the plan), re-run `npm run build:key`, commit the updated `data/key-matrix.json` before any UI work.
**Warning signs:** `[...new Set(characters.map(c => c.category))].length === 9` instead of 8.

### Pitfall 2: Lit Set Mutation Does Not Trigger Re-Render
**What goes wrong:** Expanding a category appears to do nothing; the UI does not update.
**Why it happens:** `this._expandedCategories.add(name)` mutates the existing Set; Lit compares by reference and sees no change.
**How to avoid:** Always `this._expandedCategories = new Set([...this._expandedCategories, name])`.
**Warning signs:** Clicking a category header has no visible effect.

### Pitfall 3: Shadow DOM Breaks Pico Form Controls
**What goes wrong:** Checkboxes render unstyled (browser default appearance); `--pico-primary` color not applied.
**Why it happens:** Shadow DOM boundary blocks global CSS from `pico.min.css`.
**How to avoid:** `createRenderRoot() { return this; }` — Light DOM only.
**Warning signs:** Checkboxes look grey/default, not olive-green on check.

### Pitfall 4: Inlining Full Matrix Bitsets
**What goes wrong:** `_site/identify/index.html` approaches or exceeds 500 KB; `npm run build:check-weight` warns; page load is slow.
**Why it happens:** Accidentally passing `keyMatrix` (full object) to the template instead of `{ characters, species }`.
**How to avoid:** `keyMatrix.ts` default export returns `{ characters, species }` only — NOT `{ characters, species, matrix, meta }`.
**Warning signs:** `data/key-matrix.json` is 243 KB; inlining it fully puts the page at ~260 KB of just the inline JSON.

### Pitfall 5: No-JS Species List Missing Family Grouping
**What goes wrong:** `<noscript>` species list renders as a flat list with no Family/Genus structure.
**Why it happens:** `KeySpecies` objects in `key-matrix.json` do not carry `family` or `subfamily` fields.
**How to avoid:** `keyMatrix.ts` joins `species.csv` to attach `family` to each `KeySpecies`. The template then uses Nunjucks `groupby` on `family`, then groups by `genus` within each family.
**Warning signs:** No `<h2>` headings in the `<noscript>` block — just a flat list of links.

### Pitfall 6: Missing `data-pagefind-ignore` on Inline JSON
**What goes wrong:** Pagefind indexes the raw JSON text of `#key-char-data`, polluting search results with character state strings.
**Why it happens:** Without `data-pagefind-ignore`, Pagefind includes all visible text content including script tags.
**How to avoid:** `<script type="application/json" id="key-char-data" data-pagefind-ignore>`.
**Warning signs:** Search results for species pages show character label fragments.

### Pitfall 7: Selection Map Tracks character.id but Category Badge Counts category
**What goes wrong:** Badge count does not update when a state is selected; or badge count is wrong.
**Why it happens:** The `Selection` type is `Map<string, Set<number>>` keyed by question text. To compute a category badge count, the panel must sum `selectedIds.size` across all questions that belong to that category.
**How to avoid:** Helper function `_selectionCountForCategory(catName: string): number` that iterates the `_categoryMap` for the category, then sums up selection sizes.

---

## Code Examples

### pnwm-identify.ts Skeleton

```typescript
// Source pattern: src/components/pnwm-taxon-browser.ts
import { LitElement, html, type TemplateResult, type PropertyDeclarations } from 'lit';
import type { Character, KeySpecies } from '../types/schemas.ts';
import type { KeyFilterChangeDetail } from '../types/events.ts';

// Internal grouping type: category → question → Character[]
type CategoryMap = Map<string, Map<string, Character[]>>;

function buildCategoryMap(characters: Character[]): CategoryMap {
  const catMap = new Map<string, Map<string, Character[]>>();
  for (const char of characters) {
    if (!catMap.has(char.category)) catMap.set(char.category, new Map());
    const qMap = catMap.get(char.category)!;
    if (!qMap.has(char.question)) qMap.set(char.question, []);
    qMap.get(char.question)!.push(char);
  }
  return catMap;
}

class PnwmIdentify extends LitElement {
  static get properties(): PropertyDeclarations {
    return {
      _categoryMap:       { attribute: false, state: true },
      _expandedCategories: { attribute: false, state: true },
      _selection:         { attribute: false, state: true },
    };
  }

  _categoryMap: CategoryMap;
  _expandedCategories: Set<string>;
  /** Selection: Map<questionText, Set<characterId>> */
  _selection: Map<string, Set<number>>;

  createRenderRoot(): this { return this; }

  constructor() {
    super();
    this._categoryMap = new Map();
    this._expandedCategories = new Set();
    this._selection = new Map();
  }

  connectedCallback(): void {
    super.connectedCallback();
    const el = document.getElementById('key-char-data');
    if (!el) return;
    const data = JSON.parse(el.textContent ?? '{}') as { characters: Character[] };
    this._categoryMap = buildCategoryMap(data.characters);
  }

  _toggleCategory(name: string): void {
    if (this._expandedCategories.has(name)) {
      this._expandedCategories = new Set([...this._expandedCategories].filter(n => n !== name));
    } else {
      this._expandedCategories = new Set([...this._expandedCategories, name]);
    }
  }

  _onCheckboxChange(q: string, charId: number, checked: boolean): void {
    const prev = this._selection.get(q) ?? new Set<number>();
    const next = new Set(prev);
    if (checked) next.add(charId); else next.delete(charId);
    this._selection = new Map(this._selection).set(q, next);
    this._dispatchFilterChange();
  }

  _clearAll(): void {
    this._selection = new Map();
    this._dispatchFilterChange();
  }

  _hasSelection(): boolean {
    for (const ids of this._selection.values()) if (ids.size > 0) return true;
    return false;
  }

  _selectionCountForCategory(catName: string): number {
    const qMap = this._categoryMap.get(catName);
    if (!qMap) return 0;
    let count = 0;
    for (const [q, chars] of qMap) {
      const ids = this._selection.get(q);
      if (ids) for (const char of chars) if (ids.has(char.id)) count++;
    }
    return count;
  }

  _dispatchFilterChange(): void {
    const detail: KeyFilterChangeDetail = {
      matchedSlugs: [],  // Phase 42 will compute; empty in Phase 41
      count: 0,
      hasSelection: this._hasSelection(),
    };
    this.dispatchEvent(new CustomEvent<KeyFilterChangeDetail>('pnwm-key-filter-change', {
      bubbles: true, detail,
    }));
  }

  // render() omitted for brevity — see Architecture Patterns above
}

customElements.define('pnwm-identify', PnwmIdentify);
```

### keyMatrix.ts Data Loader Skeleton

```typescript
// src/_data/keyMatrix.ts — mirrors src/_data/taxon.ts pattern
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseCsv } from 'csv-parse/sync';
import type { Character, KeySpecies } from '../types/schemas.ts';

export interface KeySpeciesWithFamily extends KeySpecies {
  family: string | null;
  genus: string;   // already on KeySpecies
  epithet: string; // already on KeySpecies
}

export interface KeyMatrixData {
  characters: Character[];
  species: KeySpeciesWithFamily[];
}

export default function (): KeyMatrixData {
  const raw = JSON.parse(
    readFileSync(resolve('data/key-matrix.json'), 'utf-8')
  ) as { characters: Character[]; species: KeySpecies[] };

  const speciesRows = parseCsv(
    readFileSync(resolve('data/species.csv')),
    { columns: true, skip_empty_lines: true }
  ) as Array<{ genus: string; species: string; family: string }>;

  const familyBySlug = new Map(
    speciesRows.map(r => [
      `${r.genus.toLowerCase()}-${r.species.toLowerCase()}`,
      r.family ?? null
    ])
  );

  return {
    characters: raw.characters,
    species: raw.species.map(sp => ({
      ...sp,
      family: familyBySlug.get(sp.slug) ?? null,
    })),
  };
}
```

### identify/index.njk Template Skeleton

```njk
---
layout: base.njk
title: Identify a moth — PNW Moths
permalink: /identify/index.html
---
<h1>Identify a moth</h1>
<p>Select morphological characters to narrow the list of matching PNW moths.</p>

<script type="application/json" id="key-char-data" data-pagefind-ignore>
  {{ keyMatrix | tojson | safe }}
</script>

<pnwm-identify></pnwm-identify>

<noscript data-pagefind-ignore>
  <h2>Characters (JavaScript required to filter)</h2>
  {# Group characters by category, then by question #}
  {% set currentCat = '' %}
  {% for char in keyMatrix.characters %}
    {% if char.category != currentCat %}
      {% if currentCat != '' %}</ul>{% endif %}
      <h2>{{ char.category }}</h2>
      <ul>
      {% set currentCat = char.category %}
    {% endif %}
    <li>{{ char.question }}: {{ char.state }}</li>
  {% endfor %}
  </ul>

  <h2>All matched key species (1,192)</h2>
  {# Group by family, then by genus slug #}
  {% set currentFamily = null %}
  {% set currentGenus = '' %}
  {% for sp in keyMatrix.species | sort(attribute='family') %}
    {% if sp.family != currentFamily %}
      {% if currentFamily != null %}</ul>{% endif %}
      <h2>{{ sp.family or '(no family)' }}</h2>
      <ul>
      {% set currentFamily = sp.family %}
      {% set currentGenus = '' %}
    {% endif %}
    {% if sp.genus != currentGenus %}
      <li><strong>{{ sp.genus }}</strong>
        <ul>
        {% set currentGenus = sp.genus %}
    {% endif %}
    <li><a href="{{ ('/species/' + sp.slug + '/') | url }}">
      <em>{{ sp.genus }} {{ sp.epithet }}</em>
    </a></li>
  {% endfor %}
  </ul>
</noscript>
```

Note: Nunjucks does not support `{% set %}` inside `{% for %}` with the set persisting across iterations in all versions. The actual template may need to use a different grouping approach (e.g., pre-group species by family+genus in `keyMatrix.ts`).

**Alternative (cleaner):** Pre-group species in `keyMatrix.ts`:

```typescript
export interface KeyMatrixData {
  characters: Character[];
  species: KeySpeciesWithFamily[];
  familyGroups: Array<{ family: string; genera: Array<{ genus: string; species: KeySpecies[] }> }>;
}
```

Then the template iterates `keyMatrix.familyGroups` directly — no Nunjucks grouping needed.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner (`node --test`) |
| Config file | none — test files listed explicitly in `npm test` |
| Quick run command | `node --test src/components/pnwm-identify.test.ts` (to be created) |
| Full suite command | `npm test` |

### Success Criteria → Test Map

| SC | Behavior | Test Type | Automated Command | File Exists? |
|----|----------|-----------|-------------------|-------------|
| SC1 | `/identify/` route renders a page with `<h1>Identify a moth</h1>` and `<pnwm-identify>` tag | Build smoke test (grep `_site/identify/index.html`) | `node --test scripts/check-page-weight.test.ts` + manual grep | ❌ Wave 0 |
| SC2 | 8 categories render (after stray-quote fix), accordion expand/collapse works | Unit test of `buildCategoryMap` + component render | `node --test src/components/pnwm-identify.test.ts` | ❌ Wave 0 |
| SC2 | Checkbox selection updates badge count | Unit test: `_selectionCountForCategory` | same | ❌ Wave 0 |
| SC3 | "Clear all" visible when ≥1 state selected; hidden when 0; clears on click | Unit test: `_hasSelection()`, `_clearAll()` | same | ❌ Wave 0 |
| SC4 | `_site/identify/index.html` exists and is under 500 KB | Build check (`check-page-weight.ts`) — already exists | `npm run build:check-weight` | ✅ |
| SC4 | `<noscript>` contains character text and 1,192 species links | Manual grep or snapshot test | `grep -c "<a href" _site/identify/index.html` (should be ≥ 1192) | ❌ Wave 0 |
| Stray-quote fix | `data/key-matrix.json` has exactly 8 distinct category strings | Existing `build-key.test.ts` extended | `node --test scripts/build-key.test.ts` | Extend existing |

### Sampling Rate
- **Per task commit:** `npm test` (full suite, fast — ~30 seconds)
- **Per wave merge:** `npm run build` (includes page-weight check)
- **Phase gate:** Full `npm run build` green + human visual verify in browser before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/components/pnwm-identify.test.ts` — unit tests for `buildCategoryMap`, `_selectionCountForCategory`, `_hasSelection`, `_clearAll`
- [ ] Extend `scripts/build-key.test.ts` — add test case for stray-quote label `'"Abdomen and thorax:...:Yes"'` → cleaned category `Abdomen and thorax`, cleaned state `Yes`
- [ ] Post-build smoke test: grep `_site/identify/index.html` for `<pnwm-identify>` and `<noscript>` presence

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Shadow DOM Lit components | Light DOM (`createRenderRoot() { return this; }`) for Pico-styled components | Phase 37 | Pico global CSS reaches form controls |
| `.js` components | `.ts` with Node 24 native type-stripping | Phase 37 | No transpiler; `node --test` runs `.ts` files directly |
| Global Zod in browser bundle | `zod/mini` only | Phase 37 | Smaller bundle; no `ZodError` runtime |
| `data` folder JSON read in template | `src/_data/*.ts` loader | Phase 36 | Type-safe; reusable across templates |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Pre-grouping `species` by `familyGroups` in `keyMatrix.ts` is the recommended approach for no-JS template grouping | Q3 / Code Examples | Nunjucks groupby may be sufficient; pre-grouping adds loader complexity |
| A2 | `pnwm-identify` as a single component (panel logic internal, not split to `pnwm-key-filter-panel`) is the right default | Architecture | If panel grows complex, splitting improves testability |
| A3 | Phase 41 dispatches `matchedSlugs: []` (empty) in the event detail | Q5 | Phase 42 reads this; if Phase 42 expects all 1,192 slugs on init, the event detail should carry them; verify with Phase 42 research |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js 24 | All scripts + test runner | ✓ | v24.15.0 | — |
| csv-parse/sync | `keyMatrix.ts` data loader | ✓ | in package.json | — |
| Lit | `pnwm-identify.ts` | ✓ | in package.json | — |
| Eleventy | Template build | ✓ | in package.json | — |
| `data/key-matrix.json` | Everything | ✓ | on disk | Re-run `npm run build:key` |

No missing dependencies.

---

## Security Domain

This phase has no network boundaries, authentication, or user data storage. The only inputs are:
- Static inline JSON (built from a committed data file, Zod-validated at build time)
- User checkbox interactions (client-side only, no server)

ASVS categories: Not applicable for a static client-side filter with no auth, no persistence, no server.

---

## Sources

### Primary (HIGH confidence)
- `src/components/pnwm-taxon-browser.ts` — Light DOM, new-Set reactivity, aria-expanded accordion, inline JSON read pattern
- `src/browse/index.njk` — inline JSON and noscript degradation pattern
- `src/_data/taxon.ts` — _data loader precedent
- `src/_lib/key-filter.ts` — buildQuestionGroups return type, Selection type, MatchResult
- `src/types/events.ts` — KeyFilterChangeDetail interface, HTMLElementEventMap augmentation
- `src/types/schemas.ts` — Character, KeySpecies, KeyMatrix types
- `scripts/build-key.ts` — parseCharacterLabel (stray-quote fix location)
- `scripts/check-page-weight.ts` — 500 KB threshold, warnings-only behavior
- `scripts/check-key-weight.ts` — separate 50 KB gzip budget for key-matrix.json artifact
- `data/key-characters.csv` — raw stray-quote source confirmed (lines 235–236)
- `data/key-matrix.json` — size measurements, category enumeration, stray-quote artifact confirmed
- `eleventy.config.ts` — addDataExtension("ts", ...) pattern for _data loader discovery
- `src/_includes/base.njk` — nav `<ul>` structure for adding "Identify" link
- `src/components/main.ts` — import pattern for registering new components
- `src/styles/theme.css` — existing `.pnwm-tb-*` CSS patterns and Pico token values
- `package.json` — npm scripts, build pipeline order, test glob

### Secondary (MEDIUM confidence)
- `.planning/phases/41-identify-page-scaffold-filter-panel/41-CONTEXT.md` — locked decisions, phase boundary
- `.planning/phases/41-identify-page-scaffold-filter-panel/41-UI-SPEC.md` — visual/interaction contract
- `.planning/REQUIREMENTS.md` — IDENT-01 through IDENT-06 requirements

---

## Metadata

**Confidence breakdown:**
- Stray-quote fix location and approach: HIGH — root cause verified in source CSV and build script
- Inline-JSON scope: HIGH — size measurements confirmed; both 41-UI-SPEC and CONTEXT.md align
- Data-source pattern (`_data/keyMatrix.ts`): HIGH — mirrors confirmed working `taxon.ts` pattern
- Page-weight check mechanics: HIGH — source code confirmed (500 KB, warnings-only)
- buildQuestionGroups / event contract: HIGH — source code confirmed

**Research date:** 2026-06-24
**Valid until:** 2026-07-24 (stable stack; Lit and Eleventy APIs unlikely to change in 30 days)
