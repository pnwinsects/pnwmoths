# Phase 42: Results Grid — Research

**Researched:** 2026-06-25
**Domain:** Lit Web Components, client-side bitset filtering, CDN thumbnail grid
**Confidence:** HIGH — all findings are from direct codebase inspection

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01** Matched-count only: "N species match" / "Showing all 1,192 species"; never surface the 36 unmatched.
- **D-02** Default landing: prompt ("Select characters to narrow the 1,192 key species") instead of rendering all ~1,190 thumbnails.
- **D-03** At-rest count reads "Showing all 1,192 species" above the prompt placeholder.
- **D-04** Desktop layout: side-by-side, sticky filter panel left, scrolling grid right, count pinned above grid.
- **D-06** Card: italic binomial always; common name on its own line only when non-null; whole card links to `/species/{slug}/`.
- **D-07** Reuse `pnwm-taxon-browser.ts` nav-card CDN mechanics: `const CDN_BASE_URL = 'https://pnwmoths.b-cdn.net'`, `${CDN_BASE_URL}/${slug}/${encodeURIComponent(nav_image)}?height=…`, `loading="lazy"`. Gray `.similar-species-placeholder` block for 2 photo-less species. No broken `<img>` tags.
- **D-09** Zero-match: "No species match the selected characters" + "Clear all" CTA sharing the panel's existing reset path.
- Matrix delivery: fetch `/key-matrix.json` at runtime via `validateKeyMatrix()`. Do NOT inline the 243 KB matrix. Page-weight check must still pass.

### Claude's Discretion

- **D-05** Mobile/narrow layout: baseline stack (panel top, grid below). Exact mobile treatment deferred.
- **D-08** Selection → grid wiring: `pnwm-identify` computes matching and passes `matchedSlugs` (or matched `KeySpecies[]`) down to `key-results-grid` as a reactive property.
- Thumbnail `?height=` value and grid column count: left to UI spec.
- Re-render performance: keyed `repeat()` by slug for up to ~1,190 cards.

### Deferred Ideas (OUT OF SCOPE)

- "Characters used" removable chip strip (IDENT-07)
- URL query-param state persistence (IDENT-08)
- Mobile filter drawer / toggle beyond baseline stack
- Surfacing the 36 unmatched key species
- Character illustration / help images (Phase 43)

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GRID-01 | A live "N species match" count updates on every selection change | Count is derived from `computeMatching()` return value (`count` field); at rest use `meta.matchedSpecies` (1,192) from fetched `KeyMatrix`. |
| GRID-02 | Flat thumbnail grid with CDN thumbnail + binomial + common name, each linking to the species page, with `loading="lazy"` | Mirror `pnwm-taxon-browser.ts` `_renderSpecies` / `_renderImageStrip` pattern. `CDN_BASE_URL`, `encodeURIComponent`, `?height=186`, `loading="lazy"` all confirmed in that file. |
| GRID-03 | Species without a photo show a gray placeholder, consistent with v2.1 similar-species row | `.similar-species-placeholder` (height 93px, width 60px, background `#d6d0bc`) confirmed in `src/styles/theme.css` lines 314–319. Exactly 2 species have `nav_image: null`: `autographa-v-alba` and `xestia-c-nigrum`. |
| GRID-04 | "0 species match" dead-end shows empty-state message + "Clear all" CTA | CTA shares `pnwm-identify._clearAll()` reset path via `@clearall` Lit event binding. |

</phase_requirements>

---

## Summary

Phase 42 adds a single new Lit component (`key-results-grid`) rendered inside `pnwm-identify`'s `render()` method, and wires `pnwm-identify` to actually run `computeMatching()` on every selection change rather than dispatching the placeholder `matchedSlugs: []` from Phase 41. The component is almost entirely composed from patterns that already exist in this codebase: the CDN thumbnail mechanics come from `pnwm-taxon-browser.ts`, the placeholder block from `src/styles/theme.css`, the matching engine from `key-filter.ts`, and the matrix loader from `key-matrix-cache.ts`.

The key architectural decision (D-08, Claude's Discretion) is confirmed: `pnwm-identify` is the right place to fetch the matrix and call `computeMatching()`. It passes the resulting `KeySpecies[]` down to `key-results-grid` as a reactive `@property`, keeping the grid purely presentational (no fetches, no event re-listening). The two-column layout (D-04) requires a CSS-only change in `theme.css` — no structural changes to `src/identify/index.njk` beyond the `path-prefix` attribute that the grid needs for species links.

Page-weight is not a concern: the `_site/identify/index.html` is currently 335.6 KB (164 KB under the 500 KB threshold). The 243 KB `key-matrix.json` is fetched at runtime as a separate HTTP request and is not counted by `check-page-weight.ts`.

**Primary recommendation:** Create `src/components/key-results-grid.ts` as a Light DOM Lit component that receives `matchedSpecies: KeySpecies[]`, `hasSelection: boolean`, and a `clearAll` callback property; update `pnwm-identify.ts` to fetch the matrix, call `computeMatching()`, and pass results down; add side-by-side layout CSS to `theme.css`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Matrix fetch + bitset matching | `pnwm-identify` (Browser/Client) | — | Single fetch, shared `questionGroups`, compute once per selection change |
| Count line ("N species match") | `pnwm-identify` render / `key-results-grid` prop | — | Count derived from `computeMatching.count`; passed as prop |
| Card grid rendering | `key-results-grid` (Browser/Client) | — | Purely presentational; receives `KeySpecies[]` array |
| CDN thumbnail URL construction | `key-results-grid` (inline const) | — | Hardcoded `CDN_BASE_URL` const — matches taxon-browser precedent |
| Gray placeholder block | `key-results-grid` + `theme.css` | — | CSS class `.similar-species-placeholder` already exists |
| Clear all shared reset | `pnwm-identify._clearAll()` | `key-results-grid` (dispatch) | pnwm-identify owns selection state; grid dispatches, identify handles |
| Side-by-side layout | `theme.css` + `identify/index.njk` | — | CSS grid; no new layout component needed |
| No-JS degradation | Phase 41 (`<noscript>` block) | — | Grid is JS-only; static list already delivered |

---

## Standard Stack

### Core (no new packages — all from existing dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `lit` | 3.3.2 [VERIFIED: package.json] | LitElement, `html`, `PropertyDeclarations` | Project standard for all interactive components |
| `lit/directives/repeat.js` | 3.3.2 [VERIFIED: node_modules/lit/directives/repeat.js] | Keyed list rendering; `repeat(items, keyFn, template)` | Prevents full DOM rebuild on filter toggle; key=slug |
| `../types/schemas.ts` | n/a | `KeySpecies`, `KeyMatrix`, `KeyMatrixMeta` | Already defined; `KeySpecies` has all fields needed for cards |
| `../components/key-matrix-cache.ts` | n/a | `validateKeyMatrix()` | Already built; O(characters+species) Zod guard + bitset length check |
| `../_lib/key-filter.ts` | n/a | `computeMatching()`, `buildQuestionGroups()` | Already built and TDD-locked |

**No new `npm install` needed.** This phase is pure code addition/modification.

---

## Package Legitimacy Audit

> No new packages are installed in this phase. All functionality uses existing project dependencies (`lit@3.3.2`, `zod@^4`, project-internal modules). Package legitimacy audit is not required.

---

## Architecture Patterns

### System Architecture Diagram

```
Browser load
│
├─ Sync: pnwm-identify.connectedCallback()
│    └─ reads #key-char-data (characters[], species[]) → _categoryMap, _inlineSpecies
│
├─ Async: fetch(/key-matrix.json) → validateKeyMatrix() → _keyMatrix: KeyMatrix
│    └─ buildQuestionGroups(_keyMatrix.characters) → _questionGroups
│
User selects a character state (checkbox)
│
└─ pnwm-identify._onCheckboxChange()
     ├─ _selection updated (new Map reactivity)
     ├─ computeMatching(_keyMatrix, _selection, _questionGroups)
     │    └─ returns { matchedSlugs, count }
     ├─ _matchedSpecies = _keyMatrix.species.filter(s => matchedSlugSet.has(s.slug))
     ├─ _matchedCount = count
     ├─ _hasSelection = true
     │
     └─ pnwm-identify.render()
          ├─ <key-results-grid
          │    .matchedSpecies=${_matchedSpecies}
          │    .hasSelection=${_hasSelection}
          │    .matchedCount=${_matchedCount}
          │    .totalCount=${_keyMatrix.meta.matchedSpecies}
          │    .pathPrefix=${_prefix}
          │    @pnwm-key-clear-all=${() => this._clearAll()}>
          │  </key-results-grid>
          │
          └─ key-results-grid.render()
               ├─ [hasSelection && matchedSpecies.length > 0] → repeat(matchedSpecies, s=>s.slug, renderCard)
               ├─ [hasSelection && matchedSpecies.length === 0] → empty-state + "Clear all" button
               └─ [!hasSelection] → prompt placeholder
```

### Recommended Project Structure (additions only)

```
src/
├─ components/
│   ├─ key-results-grid.ts        # NEW — presentational grid component
│   ├─ pnwm-identify.ts           # MODIFY — add matrix fetch + computeMatching + mount grid
│   └─ main.ts                    # MODIFY — add import './key-results-grid.ts'
└─ styles/
    └─ theme.css                  # MODIFY — add .pnwm-krg-* grid/layout/count CSS
src/identify/
    └─ index.njk                  # MODIFY — add path-prefix to <pnwm-identify>
```

### Pattern 1: Matrix Fetch in `pnwm-identify` `connectedCallback`

**What:** `pnwm-identify` upgrades its `connectedCallback` from sync-only to async, adds a matrix fetch after the inline-JSON read.

**When to use:** Matches the taxon-browser pattern (sync inline read + async network fetch).

**Example:**
```typescript
// Source: direct codebase read — pnwm-taxon-browser.ts async connectedCallback pattern
// + key-matrix-cache.ts validateKeyMatrix()
async connectedCallback(): Promise<void> {
  super.connectedCallback();
  // Sync: read inline #key-char-data (characters + species for panel render)
  const el = document.getElementById('key-char-data');
  if (!el) return;
  const data = JSON.parse(el.textContent ?? '{}') as { characters: Character[]; species: KeySpecies[] };
  this._categoryMap = buildCategoryMap(data.characters);
  // Async: fetch full matrix (bitsets) for computeMatching
  try {
    const res = await fetch(`${this._prefix}key-matrix.json`);
    const raw: unknown = await res.json();
    validateKeyMatrix(raw);         // throws on shape mismatch
    this._keyMatrix = raw;
    this._questionGroups = buildQuestionGroups(raw.characters);
  } catch (err) {
    // soft degradation: grid stays in "prompt" state; panel still interactive
    console.error('[pnwm-identify] matrix fetch failed:', err);
  }
}
```

### Pattern 2: Compute-and-Pass on Selection Change

**What:** `_dispatchFilterChange()` in `pnwm-identify` is upgraded to actually run `computeMatching()` and store results as reactive state.

**Example:**
```typescript
// Source: key-filter.ts computeMatching() + src/components/pnwm-identify.ts _dispatchFilterChange()
_dispatchFilterChange(): void {
  if (!this._keyMatrix || !this._questionGroups) {
    // matrix not yet loaded — dispatch placeholder (Phase 41 behavior preserved)
    this.dispatchEvent(new CustomEvent<KeyFilterChangeDetail>('pnwm-key-filter-change', {
      bubbles: true,
      detail: { matchedSlugs: [], count: 0, hasSelection: this._hasSelection() },
    }));
    return;
  }
  const { matchedSlugs, count } = computeMatching(
    this._keyMatrix, this._selection, this._questionGroups
  );
  const matchedSlugSet = new Set(matchedSlugs);
  this._matchedSpecies = this._keyMatrix.species.filter(s => matchedSlugSet.has(s.slug));
  this._matchedCount = count;
  this._hasSelection2 = this._hasSelection();   // rename: _hasSelection is already a method
  // Event still dispatched for any external listeners
  this.dispatchEvent(new CustomEvent<KeyFilterChangeDetail>('pnwm-key-filter-change', {
    bubbles: true,
    detail: { matchedSlugs, count, hasSelection: this._hasSelection() },
  }));
}
```

### Pattern 3: `key-results-grid` as a Purely Presentational Component

**What:** The grid component has no fetches, no event listeners on the document — only reactive properties set by its parent.

**Example:**
```typescript
// Source: direct analysis — mirrors pnwm-taxon-browser.ts _renderSpecies pattern (lines 247-262)
// CDN_BASE_URL from pnwm-taxon-browser.ts line 12
import { LitElement, html, type TemplateResult, type PropertyDeclarations } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import type { KeySpecies } from '../types/schemas.ts';

const CDN_BASE_URL = 'https://pnwmoths.b-cdn.net';

class KeyResultsGrid extends LitElement {
  static get properties(): PropertyDeclarations {
    return {
      matchedSpecies: { attribute: false },
      hasSelection:   { type: Boolean },
      matchedCount:   { type: Number },
      totalCount:     { type: Number },
      pathPrefix:     { type: String },
    };
  }

  createRenderRoot(): this { return this; }  // Light DOM — Pico CSS must reach links

  _renderCard(sp: KeySpecies): TemplateResult {
    return html`
      <a class="pnwm-krg-card" href="${this.pathPrefix}species/${sp.slug}/">
        ${sp.nav_image
          ? html`<img
              src="${CDN_BASE_URL}/${sp.slug}/${encodeURIComponent(sp.nav_image)}?height=186"
              alt="${sp.genus} ${sp.epithet}"
              loading="lazy">`
          : html`<div class="similar-species-placeholder" aria-hidden="true"></div>`
        }
        <div class="pnwm-krg-label">
          <em>${sp.genus} ${sp.epithet}</em>
          ${sp.common_name ? html`<br>${sp.common_name}` : ''}
        </div>
      </a>`;
  }

  render(): TemplateResult {
    const count = this.matchedCount ?? this.matchedSpecies?.length ?? 0;
    const total = this.totalCount ?? 1192;
    const countLine = this.hasSelection
      ? html`<p class="pnwm-krg-count">${count} species match</p>`
      : html`<p class="pnwm-krg-count">Showing all ${total} species</p>`;

    if (!this.hasSelection) {
      return html`
        ${countLine}
        <p class="pnwm-krg-prompt">Select characters to narrow the ${total} key species</p>`;
    }
    if (!this.matchedSpecies?.length) {
      return html`
        ${countLine}
        <p class="pnwm-krg-empty">No species match the selected characters</p>
        <button type="button" @click=${() => this.dispatchEvent(new CustomEvent('pnwm-key-clear-all', { bubbles: true }))}>
          Clear all
        </button>`;
    }
    return html`
      ${countLine}
      <div class="pnwm-krg-grid">
        ${repeat(this.matchedSpecies, sp => sp.slug, sp => this._renderCard(sp))}
      </div>`;
  }
}
customElements.define('key-results-grid', KeyResultsGrid);
```

### Pattern 4: "Clear all" CTA → `pnwm-identify._clearAll()` Sharing (D-09)

**What:** The grid's "Clear all" button dispatches a bubbling `pnwm-key-clear-all` CustomEvent. `pnwm-identify` listens with `@pnwm-key-clear-all=${() => this._clearAll()}` in its render template (Lit event binding on the child element). This is the same pattern Lit uses for parent→child event delegation — no `addEventListener` needed.

**Why not pass a callback property?** Lit event bindings (`@event=`) on child elements are cleaner than callback properties: no need to declare a new property type, no closure memory leak concerns, and the pattern matches how Lit connects parent event handlers throughout this codebase.

**Example (pnwm-identify.ts render):**
```typescript
// Source: direct analysis
render(): TemplateResult {
  return html`
    ${this._hasSelection() ? html`
      <div class="pnwm-kfp-sticky">
        <button type="button" @click=${() => this._clearAll()}>Clear all</button>
      </div>` : ''}
    ${[...this._categoryMap.entries()].map(([catName, questions]) =>
      this._renderCategory(catName, questions)
    )}
    <key-results-grid
      .matchedSpecies=${this._matchedSpecies ?? []}
      .hasSelection=${this._hasSelection()}
      .matchedCount=${this._matchedCount ?? 0}
      .totalCount=${this._keyMatrix?.meta.matchedSpecies ?? 1192}
      .pathPrefix=${this._prefix ?? '/'}
      @pnwm-key-clear-all=${() => this._clearAll()}
    ></key-results-grid>`;
}
```

### Pattern 5: Side-by-Side Layout (D-04)

**What:** CSS grid on `pnwm-identify` host element: filter panel left (fixed narrow column), results grid right (flex). Sticky filter: `position: sticky; top: 0; align-self: flex-start; max-height: 100vh; overflow-y: auto;`

**Source:** Analyzed from Phase 41 UI-SPEC layout section — "results grid will sit below or beside the panel" (no side-by-side CSS was added in Phase 41; Phase 42 adds it).

**Key concern:** `pnwm-identify` uses Light DOM (`createRenderRoot(): this { return this; }`), meaning theme.css selectors can target its internals. The layout wrapper div can carry a `.pnwm-identify-layout` class styled in theme.css. At narrow widths (mobile), revert to single column.

### Anti-Patterns to Avoid

- **Grid re-subscribing to `pnwm-key-filter-change` event**: The grid is *inside* `pnwm-identify`, which dispatches the event. Re-listening would work but means two copies of `computeMatching()` or a duplicated race between dispatch and property update. Use the property-passing pattern (D-08).
- **Fetching key-matrix.json inside `key-results-grid`**: The grid receives data as a property. Fetching inside it would create a second network request and a second `computeMatching()` computation.
- **Inlining the matrix bitsets**: The `_site/identify/index.html` is already 335.6 KB. Adding the 243 KB matrix would push it to ~579 KB, exceeding the 500 KB threshold. [VERIFIED: codebase inspection]
- **Mutating `matchedSpecies` array in place**: Lit reactive properties detect change by object identity — always replace with a new array (`this._matchedSpecies = [...]`).
- **Shadow DOM for `key-results-grid`**: Would break `.similar-species-placeholder` CSS from `theme.css`. Must use Light DOM (`createRenderRoot(): this { return this; }`).
- **Using `.map()` instead of `repeat()` for the grid**: With up to 1,190 cards, `.map()` rebuilds all DOM nodes on every filter change. `repeat()` with `keyFn = slug` diffs the list and only touches changed nodes.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Keyed list diffing for ~1,190 cards | Custom DOM diffing | `repeat()` from `lit/directives/repeat.js` | Already available in installed `lit@3.3.2`; exact key=slug semantics |
| Matrix load-time validation | Custom type-check | `validateKeyMatrix()` from `key-matrix-cache.ts` | Already built; Zod + structural invariants |
| Bitset matching logic | Re-implement OR-within/AND-across | `computeMatching()` from `key-filter.ts` | TDD-locked contract; ~150 lines of nuanced bitset logic |
| CDN URL construction | Ad-hoc string concat | Mirror `CDN_BASE_URL + '/' + slug + '/' + encodeURIComponent(nav_image) + '?height=...'` from taxon-browser | Handles special chars in filenames (spaces etc.) |
| Gray no-photo placeholder | New CSS | `.similar-species-placeholder` from `src/styles/theme.css` lines 314–319 | Existing, tested, consistent with v2.1 similar-species row |

**Key insight:** This phase is almost entirely composition of existing pieces. The hard algorithmic work (bitset matching, matrix validation, CDN URL pattern) is already done. The new code is plumbing: fetch once, compute on change, render cards.

---

## Common Pitfalls

### Pitfall 1: `path-prefix` Missing from `<pnwm-identify>` in Template

**What goes wrong:** Species card links render as `/species/slug/` in development but break as `/identify/species/slug/` or similar on GitHub Pages where `pathPrefix = '/pnwmoths/'`.

**Why it happens:** The `identify/index.njk` template currently mounts `<pnwm-identify></pnwm-identify>` with no `path-prefix` attribute. `pnwm-identify` has no `_prefix` property. `key-results-grid` will need `pathPrefix` for its `href="${this.pathPrefix}species/${sp.slug}/"` links.

**How to avoid:** Add `path-prefix` attribute to `pnwm-identify` in `index.njk` (mirror browse page: `path-prefix="{{ '/' | url }}"`), declare `'path-prefix': { type: String }` in `pnwm-identify`, expose `_prefix` getter (copy from taxon-browser line 106: `return (this as { 'path-prefix'?: string })['path-prefix'] || '/'`), then pass `.pathPrefix=${this._prefix}` to `key-results-grid`.

**Warning signs:** Species links work locally but 404 on GitHub Pages preview.

### Pitfall 2: Passing `matchedSlugs: string[]` to Grid Instead of `KeySpecies[]`

**What goes wrong:** Grid must do its own `slug → KeySpecies` lookup, requiring it to hold a copy of `species[]` — duplicate data, extra complexity, or expensive O(n) lookup per render.

**Why it happens:** D-08 mentions "matchedSlugs" first, then parenthetically "(or the matched `KeySpecies[]`)". The planner might follow the simpler-sounding first option.

**How to avoid:** After `computeMatching()`, build a `Set<string>` from `matchedSlugs`, then filter `_keyMatrix.species` preserving order. Pass `KeySpecies[]` to the grid. Grid has all fields (slug, genus, epithet, common_name, nav_image) for card rendering without any lookup.

**Pattern:**
```typescript
const matchedSlugSet = new Set(result.matchedSlugs);
this._matchedSpecies = this._keyMatrix.species.filter(s => matchedSlugSet.has(s.slug));
// species[] order = bitset order = stable species[] order from build time
```

### Pitfall 3: `_clearAll()` Not Triggering Grid Update

**What goes wrong:** User clicks "Clear all" in the sticky panel. `pnwm-identify._clearAll()` resets `_selection` and calls `_dispatchFilterChange()`. If `_dispatchFilterChange()` gates on `this._keyMatrix` being loaded (null check), the `_matchedSpecies` / `_hasSelection` reactive props may not be reset, leaving the grid in a stale "filter active" state after clear.

**How to avoid:** `_clearAll()` should always reset `_matchedSpecies = []` and `_matchedCount = 0` and `_hasSelection2 = false` regardless of matrix load state. Or simpler: separate the "reset display state" from "compute matching" — clearing sets `_selection = new Map()` and then unconditionally resets display props.

### Pitfall 4: `hasSelection` Stays `true` After Clearing via Grid's CTA

**What goes wrong:** Grid renders "Clear all" in the empty-state. User clicks it. `pnwm-key-clear-all` event fires. `pnwm-identify._clearAll()` runs. But if `_hasSelection()` is re-evaluated in the render cycle BEFORE `_matchedSpecies` is updated (due to micro-task ordering), the grid flashes the "0 species match" empty state for one frame before switching to "Select characters" prompt.

**How to avoid:** Set all three reactive state props (`_selection`, `_matchedSpecies`, `_matchedCount`) in a single synchronous call sequence before any `requestUpdate()`. Lit batches updates within a microtask — all mutations in one synchronous call are bundled into one render.

### Pitfall 5: `repeat()` Import Path

**What goes wrong:** Using `import { repeat } from 'lit'` (not available there) instead of the correct path.

**How to avoid:** Import from `'lit/directives/repeat.js'`. [VERIFIED: `node_modules/lit/directives/repeat.js` confirmed present in `lit@3.3.2`]

### Pitfall 6: Layout Overflow When Grid Has Many Cards

**What goes wrong:** With ~1,190 lazy-loaded images, the grid column can overflow the viewport unexpectedly if `min-width: 0` is not set on grid children (common CSS grid pitfall with `overflow: auto`).

**How to avoid:** Apply `min-width: 0` to the grid column in the two-column CSS layout. The `.pnwm-tb-species-grid` pattern in taxon-browser already handles this with `min-width: 0` on `.species-photos, .species-data` in theme.css.

### Pitfall 7: `key-matrix.json` Fetch Path Without `pathPrefix`

**What goes wrong:** `fetch('/key-matrix.json')` works locally but 404s on GitHub Pages where the root is `/pnwmoths/`.

**How to avoid:** Use `fetch(\`${this._prefix}key-matrix.json\`)` in `pnwm-identify.connectedCallback`, after `_prefix` is available (it comes from the `path-prefix` attribute set in the template). This matches how `pnwm-taxon-browser` fetches `${this._prefix}species-states.json`.

**Note:** `_prefix` is derived from the `path-prefix` attribute. Since Pitfall 1 adds that attribute to `index.njk`, this fetch path is correctly resolved at the same time.

---

## Code Examples

### Exact CDN URL Pattern (from taxon-browser — GRID-02)

```typescript
// Source: src/components/pnwm-taxon-browser.ts lines 197, 253
// const CDN_BASE_URL = 'https://pnwmoths.b-cdn.net';  (line 12)
src="${CDN_BASE_URL}/${sp.slug}/${encodeURIComponent(sp.navImage.filename)}?height=186"
// For key-results-grid: sp.nav_image (not sp.navImage.filename — different type shape)
src="${CDN_BASE_URL}/${sp.slug}/${encodeURIComponent(sp.nav_image!)}?height=186"
```

`KeySpecies.nav_image` is a bare filename string (e.g. `"Habrosyne scripta-A-D.jpg"`), not a `NavImage` object. The URL pattern is: `${CDN_BASE_URL}/${slug}/${encodeURIComponent(filename)}?height=186`. The `?height=` value is `186` in taxon-browser; the exact value for the grid is left to the UI spec.

### Exact Gray Placeholder Block (from species.njk + theme.css — GRID-03)

```html
<!-- Source: src/species/species.njk line 103 -->
<div class="similar-species-placeholder" aria-hidden="true"></div>
```

CSS already in `src/styles/theme.css` lines 314–319:
```css
.similar-species-placeholder {
  height: 93px;
  width: 60px;
  background: #d6d0bc;
  border-radius: 2px;
}
```

No new CSS needed for the placeholder. The two species needing it: `autographa-v-alba` and `xestia-c-nigrum` (confirmed from `data/key-matrix.json`).

### Lit `repeat()` with Keyed Slug

```typescript
// Source: lit/directives/repeat.d.ts — type signature confirmed
import { repeat } from 'lit/directives/repeat.js';

// In render():
repeat(
  this.matchedSpecies,     // Iterable<KeySpecies>
  sp => sp.slug,           // KeyFn — unique key per item
  sp => this._renderCard(sp)  // ItemTemplate
)
```

### Reactive Properties New-Set / New-Array Pattern (established project pattern)

```typescript
// Source: src/components/pnwm-identify.ts _onCheckboxChange (lines 90-99)
// and pnwm-taxon-browser.ts _toggleFamily (lines 161-167)
// ALWAYS replace the array/set/map with a new instance:
this._matchedSpecies = this._keyMatrix.species.filter(s => matchedSet.has(s.slug));
// NOT: this._matchedSpecies.splice(...)  — Lit won't detect mutation
```

### KeyMatrix Species Fields Available

```typescript
// Source: src/types/schemas.ts KeySpeciesSchema (lines 167-174)
// Confirmed from data/key-matrix.json first element:
// { slug: 'habrosyne-scripta', genus: 'Habrosyne', epithet: 'scripta', common_name: null, nav_image: 'Habrosyne scripta-A-D.jpg' }
type KeySpecies = {
  slug: string;
  genus: string;
  epithet: string;         // Note: NOT 'species' — it's 'epithet' in KeySpecies
  common_name: string | null;
  nav_image: string | null;  // null for 2 species; bare filename string otherwise
}
// Card binomial: `${sp.genus} ${sp.epithet}` (NOT sp.species — that field is on the Species type)
// Species link: `${pathPrefix}species/${sp.slug}/`
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Phase 41 `matchedSlugs: []` placeholder | Phase 42: real `computeMatching()` result | Phase 42 | `_dispatchFilterChange` no longer stubs; grid receives actual data |
| No grid component | `key-results-grid` Lit component | Phase 42 | SC1–SC4 fulfilled |
| No two-column layout | Side-by-side sticky panel (D-04) | Phase 42 | Layout matches D-04 desktop spec |

**Not yet changed (still placeholder after Phase 42):** none — Phase 42 makes the compute real and delivers the grid.

---

## Research Area Answers (for planner)

### RQ1: Exact wiring — how `pnwm-identify` dispatches and where `computeMatching` is called

**Current state (Phase 41):**
- `pnwm-identify._dispatchFilterChange()` (line 140-149) always dispatches `matchedSlugs: []` (hardcoded placeholder, comment: "Phase 42 will compute")
- `pnwm-identify.connectedCallback()` is **synchronous** — reads `#key-char-data`, builds `_categoryMap`. No fetch.
- `pnwm-identify` does NOT load the matrix; the matrix is NOT fetched anywhere client-side yet.

**Required Phase 42 changes:**
1. Make `connectedCallback()` async; add `fetch('${this._prefix}key-matrix.json')` → `validateKeyMatrix()` → store as `this._keyMatrix: KeyMatrix | null`.
2. Call `buildQuestionGroups(this._keyMatrix.characters)` once after fetch; store as `this._questionGroups`.
3. In `_dispatchFilterChange()`: if `_keyMatrix` loaded, call `computeMatching(_keyMatrix, _selection, _questionGroups)`, set `_matchedSpecies` and `_matchedCount`, then dispatch the event with real values.
4. In `render()`: mount `<key-results-grid>` with reactive props.

### RQ2: `computeMatching()` signature and mapping back to `KeySpecies`

`computeMatching(matrix: KeyMatrix, selection: Selection, questionGroups: QuestionGroups): MatchResult`
- `MatchResult = { matchedSlugs: string[], count: number }`
- `matchedSlugs` are in `species[]` order (from bitset index traversal)
- To get `KeySpecies[]`: `const set = new Set(matchedSlugs); matrix.species.filter(s => set.has(s.slug))`
- `species[]` is available in `_keyMatrix` (fetched). The inline `#key-char-data` also has `species[]` but `_keyMatrix` is the canonical source during compute.

### RQ3: Exact taxon-browser nav-card markup to mirror

From `pnwm-taxon-browser.ts` lines 247–262:
- Container: `<div class="pnwm-tb-species-grid">` with CSS grid (1 col → 2 col at 600px)
- Card: `<a class="pnwm-tb-species-card" href="${prefix}species/${sp.slug}/">`
- Image: `<img src="${CDN_BASE_URL}/${sp.navImage.species_slug}/${encodeURIComponent(sp.navImage.filename)}?height=186" alt="..." loading="lazy">`
- Label: `<div class="pnwm-tb-species-label"><em>${genus} ${name}</em>...`

For `key-results-grid`, adapt:
- Card element name → `pnwm-krg-card`
- Slug-based URL: `${CDN_BASE_URL}/${sp.slug}/${encodeURIComponent(sp.nav_image!)}?height=186` (note: `KeySpecies.nav_image` is the filename directly, not a NavImage object)
- Label: `<em>${sp.genus} ${sp.epithet}</em>` then conditional common name line
- Placeholder: `<div class="similar-species-placeholder" aria-hidden="true">` (reuse existing CSS class)

### RQ4: Re-render performance with `repeat()` keyed by slug

`repeat(items, keyFn, template)` from `lit/directives/repeat.js` (confirmed available in `lit@3.3.2`) performs a minimal DOM diff: it maps each item to its key, then moves/inserts/removes DOM nodes to match the new key order. For ~1,190 cards going to ~50 cards: it removes ~1,140 nodes and preserves ~50. For toggle operations that change a few dozen items: only the changed items are touched.

With D-02 (no cards on initial load, prompt only), the first render is instant. After the first selection, the grid renders the matching subset. Subsequent toggles diff against that subset. No virtualisation is needed — `loading="lazy"` handles the image loading budget. The taxon-browser renders comparable counts (all ~1,700+ species images across genera) via `.map()` without virtualisation; the grid with `repeat()` is at least as fast.

### RQ5: Page-weight check — will Phase 42 still pass?

**Current:** `_site/identify/index.html` = 335,703 bytes (335.6 KB). Threshold: 512,000 bytes (500 KB). Headroom: 164.4 KB. [VERIFIED: direct file stat]

**Phase 42 additions to HTML:**
- `<key-results-grid ...></key-results-grid>` tag with attributes: ~100 bytes
- No new inline JSON (matrix is NOT inlined; `species[]` already inlined from Phase 41)
- No new `<script>` blocks

**Phase 42 does NOT affect page-weight check** because:
1. `check-page-weight.ts` inspects `.html` file size only (confirmed: `statSync(fullPath).size`)
2. The 243 KB `key-matrix.json` is a separate HTTP request, not included in HTML size
3. The new component JS code is bundled into `_site/components/main.js`, not into the HTML

### RQ6: Testing patterns — how to test `key-results-grid`

Established project test pattern: `node:test` + `node:assert/strict`, `.ts` files run directly via Node 24 type-stripping, no DOM (`jsdom` not installed or used — confirmed by checking existing test files).

From `pnwm-identify.test.ts`: tests instantiate the class directly (`const c = new PnwmIdentify()`), set properties, call methods, and assert state — **without triggering `connectedCallback` or rendering**. This works because the test targets are pure logic methods exported from the component.

For `key-results-grid.ts`:
- Export the class (not just the registered custom element) for test access
- TDD-eligible pure logic: none significant (the grid is almost entirely presentational)
- TDD-eligible helpers worth extracting: `buildCountLine(hasSelection, count, total)` → string; `buildCardUrl(slug, navImage)` → string; `buildPhotoUrl(slug, navImage, height)` → string
- Browser-behavior tests (render output): require a browser; these go in Human UAT
- Node-testable: count text logic, URL construction, placeholder condition (`nav_image === null`)

**Recommended test file:** `src/components/key-results-grid.test.ts`

Pattern from `pnwm-identify.test.ts` and `pnwm-taxon-browser.test.ts`:
```typescript
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
// Import exported pure helpers (not the LitElement class itself — no DOM needed)
import { buildCardUrl } from './key-results-grid.ts';

describe('buildCardUrl', () => {
  test('constructs CDN URL with encodeURIComponent', () => {
    assert.equal(
      buildCardUrl('habrosyne-scripta', 'Habrosyne scripta-A-D.jpg', 186),
      'https://pnwmoths.b-cdn.net/habrosyne-scripta/Habrosyne%20scripta-A-D.jpg?height=186'
    );
  });
});
```

Also worth a real-data gate test: confirm `KeySpecies[]` from the actual `data/key-matrix.json` renders without any `nav_image: null` entries unexpectedly (beyond the known 2).

### RQ7: Landmines and edge cases

**CDN_BASE_URL client-side:** Each Lit component that needs it declares `const CDN_BASE_URL = 'https://pnwmoths.b-cdn.net'` as a module-level const (confirmed in `pnwm-taxon-browser.ts` line 12). The server-side `eleventy.config.ts` line 16 has the same value. There is no shared import — both sides hardcode it. `key-results-grid.ts` should do the same.

**`matchedSlugs` ordering maps to `species[]`:** `computeMatching()` iterates `i = 0..nSpecies-1` in order, checking `(result[i>>3] >> (i&7)) & 1`. `matchedSlugs` are therefore in `species[]` index order. When filtering `species[]` via `Set<slug>`, order is `species[]` order (filter preserves order). This is stable and consistent across renders.

**"Clear all" shared reset path:** `pnwm-identify._clearAll()` currently resets `_selection` and calls `_dispatchFilterChange()`. Phase 42 must also reset `_matchedSpecies = []` and `_matchedCount = 0` in `_clearAll()`, so the grid returns to the "prompt" state (not "0 match" empty state). The test `_clearAll resets _selection to empty Map` in `pnwm-identify.test.ts` must be updated (or a new test added) to assert these two new props are also reset.

**No-JS behavior:** The `<key-results-grid>` custom element renders nothing without JS. The Phase 41 `<noscript>` block already provides the static 1,192 species list. Grid is JS-only per design. No action needed.

**`epithet` vs `species` field name:** `KeySpecies` uses `epithet` (not `species`) for the specific epithet. The card binomial is `${sp.genus} ${sp.epithet}`. This is different from the `Species` type (from `SpeciesSchema`) which uses `species`. This is a known gotcha from the schema design.

**`_prefix` unavailable at fetch time:** `pnwm-identify` does not currently have a `_prefix` property (it has no `path-prefix` attribute declared). After Pitfall 1's fix (adding `path-prefix` to template + property declaration), `_prefix` is available at `connectedCallback` time via the attribute. Safe to use in the fetch URL.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in (`node:test`) — no Vitest, no Jest |
| Config file | none — run directly: `node --test src/components/key-results-grid.test.ts` |
| Quick run command | `node --test src/components/key-results-grid.test.ts src/components/pnwm-identify.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GRID-01 | Count text "N species match" / "Showing all 1,192 species" | unit (pure fn) | `node --test src/components/key-results-grid.test.ts` | ❌ Wave 0 |
| GRID-01 | `computeMatching()` result feeds count correctly | unit (pnwm-identify) | `node --test src/components/pnwm-identify.test.ts` | ✅ (extend) |
| GRID-02 | CDN URL construction with `encodeURIComponent` | unit (pure fn) | `node --test src/components/key-results-grid.test.ts` | ❌ Wave 0 |
| GRID-02 | Grid renders without full page reload | HUMAN-UAT | browser only | — |
| GRID-03 | `nav_image: null` → placeholder (no `<img>`) | unit | `node --test src/components/key-results-grid.test.ts` | ❌ Wave 0 |
| GRID-04 | Zero-match empty state | unit (state logic) | `node --test src/components/key-results-grid.test.ts` | ❌ Wave 0 |
| GRID-04 | "Clear all" CTA triggers reset | HUMAN-UAT | browser only | — |

### Sampling Rate

- **Per task commit:** `npm test` (full suite — 324+ tests, currently fast)
- **Per wave merge:** `npm test && npm run build && node scripts/check-page-weight.ts`
- **Phase gate:** Full suite green + page-weight check passes + Human UAT (grid renders, cards link correctly, lazy-load observed) before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/components/key-results-grid.test.ts` — covers GRID-01 (count text logic), GRID-02 (URL construction), GRID-03 (placeholder condition), GRID-04 (empty-state condition)
- [ ] Pure helper exports from `key-results-grid.ts` needed for Node-testable unit tests: `buildCardUrl(slug, navImage, height)` → string or at minimum the URL construction inline-testable
- [ ] `pnwm-identify.test.ts` additions: test that `_dispatchFilterChange()` sets `_matchedSpecies` after matrix is loaded; test `_clearAll()` resets `_matchedSpecies` and `_matchedCount`

---

## Security Domain

> Applicable ASVS categories for this phase:

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes (minimal) | `validateKeyMatrix()` guards the fetched JSON at the client boundary |
| V6 Cryptography | no | — |

No user-supplied data is processed — all inputs are either inlined at build time or fetched from the project's own CDN (`b-cdn.net`). The `validateKeyMatrix()` guard prevents unexpected shapes from crashing the component. No additional security controls are needed.

---

## Environment Availability

> Skip condition: applies — no external CLI tools required, only the existing build.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `lit@3.3.2` | Lit component | ✓ | 3.3.2 | — |
| `lit/directives/repeat.js` | Keyed grid render | ✓ | 3.3.2 (bundled) | `.map()` (fallback, no diffing) |
| `node_modules/zod` | `validateKeyMatrix()` | ✓ | ^4.4.3 | — |
| `_site/key-matrix.json` | Runtime fetch | ✓ | 243 KB, present | Build error if absent |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `?height=186` is the right thumbnail height for the grid cards | Standard Stack / Code Examples | Visual mismatch; UI spec may specify a different value — planner should note this is left to UI spec per CONTEXT.md |
| A2 | `buildCardUrl` / `buildPhotoUrl` are extractable pure helpers | Validation Architecture | If kept inline in render template, unit testing requires DOM; lower test coverage |

**All other claims in this research were verified by direct codebase inspection.** No web searches were needed — the codebase is the authoritative source.

---

## Sources

### Primary (HIGH confidence — direct codebase inspection)
- `src/components/pnwm-identify.ts` — exact current state; `_dispatchFilterChange` placeholder at line 142
- `src/components/pnwm-taxon-browser.ts` — CDN URL pattern (lines 12, 197, 253), Light DOM pattern (line 109), path-prefix pattern (lines 85, 106)
- `src/_lib/key-filter.ts` — `computeMatching()` signature, `MatchResult` type, `buildQuestionGroups()`
- `src/components/key-matrix-cache.ts` — `validateKeyMatrix()` implementation
- `src/types/schemas.ts` — `KeySpecies`, `KeyMatrix`, `KeyMatrixMeta` type definitions
- `src/types/events.ts` — `KeyFilterChangeDetail` interface
- `src/styles/theme.css` — `.similar-species-placeholder` CSS (lines 314–319), `.pnwm-kfp-*` patterns
- `src/species/species.njk` — placeholder block usage (line 103)
- `_site/identify/index.html` — current page size (335,703 bytes), inline JSON keys confirmed
- `_site/key-matrix.json` — species fields confirmed, 2 null nav_image species identified
- `scripts/check-page-weight.ts` — threshold (500 KB), mechanism (statSync on .html files)
- `package.json` — `lit@^3.3.2` dependency, `npm test` command
- `node_modules/lit/directives/repeat.js` — `repeat` directive availability confirmed

### Secondary (MEDIUM confidence)
- `.planning/phases/41-identify-page-scaffold-filter-panel/41-UI-SPEC.md` — layout spec, CSS class naming conventions, placeholder color token
- `.planning/phases/42-results-grid/42-CONTEXT.md` — locked decisions D-01 through D-09

---

## Metadata

**Confidence breakdown:**
- Standard stack (no new packages): HIGH — verified in node_modules
- Architecture (wiring pattern): HIGH — directly read from source files
- Pitfalls: HIGH — confirmed by reading exact code states
- Test patterns: HIGH — read from existing test files

**Research date:** 2026-06-25
**Valid until:** Stable (Lit 3.x API is stable; project-internal code does not change without PRs)
