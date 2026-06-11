# Phase 37: Lit Web Components Migration - Pattern Map

**Mapped:** 2026-06-10
**Files analyzed:** 18 new/modified files
**Analogs found:** 17 / 18 (1 new file has no codebase analog)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/components/parquet-cache.ts` | service + validator | request-response + CRUD | `src/components/parquet-cache.js` (self) | exact (rename + annotate + validator injection) |
| `src/components/pnwm-filter-bar.ts` | component | event-driven | `src/components/pnwm-filter-bar.js` (self) | exact (rename + annotate) |
| `src/components/pnwm-taxon-browser.ts` | component + validator | request-response + event-driven | `src/components/pnwm-taxon-browser.js` (self) | exact (rename + annotate + validator injection) |
| `src/components/pnwm-image-slideshow.ts` | component | event-driven | `src/components/pnwm-image-slideshow.js` (self) | exact (rename + annotate) |
| `src/components/pnwm-occurrence-map.ts` | component | event-driven | `src/components/pnwm-filter-bar.js` | role-match (same static get properties() pattern) |
| `src/components/pnwm-occurrence-popup.ts` | component | request-response | `src/components/pnwm-image-slideshow.js` | role-match (same static properties = {} pattern) |
| `src/components/pnwm-phenology-chart.ts` | component | event-driven | `src/components/pnwm-filter-bar.js` | role-match (same static get properties() pattern) |
| `src/components/pnwm-plate-viewer.ts` | component | event-driven | `src/components/pnwm-image-slideshow.js` | role-match (same static properties = {} pattern) |
| `src/components/glossary-tooltip.ts` | utility | request-response | `src/components/glossary-tooltip.js` (self) | exact (rename + DOM type annotations) |
| `src/components/main.ts` | config/entrypoint | transform | `src/components/main.js` (self) | exact (rename + import specifiers .js → .ts) |
| `src/types/schemas.ts` | model | transform | `src/types/schemas.ts` (self) | exact (import swap + functional API migration) |
| `src/types/events.ts` | model/type | event-driven | none | no analog |
| `src/types/index.ts` | config | transform | `src/types/index.ts` (self) | exact (add one re-export line) |
| `src/components/filters.test.ts` | test | — | `src/components/parquet-cache.test.js` (self) | exact (rename + import specifier) |
| `src/components/parquet-cache.test.ts` | test | — | `src/components/parquet-cache.test.js` (self) | exact (rename + new test cases) |
| `src/components/phenology.test.ts` | test | — | `src/components/parquet-cache.test.js` (self) | exact (rename + import specifier) |
| `src/components/pnwm-image-slideshow.test.ts` | test | — | `src/components/pnwm-image-slideshow.test.js` (self) | exact (rename + import specifier) |
| `src/components/pnwm-taxon-browser.test.ts` | test | — | `src/components/pnwm-taxon-browser.test.js` (self) | exact (rename + new test cases) |

---

## Pattern Assignments

### `src/types/schemas.ts` (model, transform) — D-02 migration

**Analog:** itself (in-place refactor)

**Before — classic zod import** (`src/types/schemas.ts` line 5):
```typescript
import { z } from 'zod';
```

**After — zod/mini import** (single replacement):
```typescript
// Source: verified against node_modules/zod/v4/mini/schemas.js
import * as z from 'zod/mini';
```

**Before — chained method API** (lines 17–26, OccurrenceRecordSchema):
```typescript
county:        z.string().nullable(),
elevation_ft:  z.number().int().nullable(),
year:          z.number().int().nullable(),
month:         z.number().int().nullable(),
day:           z.number().int().nullable(),
```

**After — functional API** (all `.nullable()` chains and `.int()` chains throughout the file):
```typescript
county:        z.nullable(z.string()),
elevation_ft:  z.nullable(z.number()),   // .int() dropped — not in zod/mini; int enforced by DuckDB INT32
year:          z.nullable(z.number()),
month:         z.nullable(z.number()),
day:           z.nullable(z.number()),
```

**Conversion table for all chained patterns used in schemas.ts:**
```typescript
// Pattern → mini equivalent
z.string().nullable()       →  z.nullable(z.string())
z.number().nullable()       →  z.nullable(z.number())
z.number().int()            →  z.number()           // .int() absent in zod/mini
z.number().int().nullable() →  z.nullable(z.number())
z.array(X)                  →  z.array(X)           // unchanged
X.nullable()                →  z.nullable(X)        // all occurrences
```

**z.infer and type exports** — unchanged (lines 27, 43, etc.):
```typescript
export type OccurrenceRecord = z.infer<typeof OccurrenceRecordSchema>;
// z.infer<> works identically in zod/mini
```

**Pitfall (Pitfall 3 from RESEARCH.md):** zod/mini has no `.int()` method. Drop it everywhere in the file — 5 occurrences: `elevation_ft`, `year`, `month`, `day` in `OccurrenceRecordSchema`; `id` and `weight` in `SpeciesSchema`/`NavImageSchema`. The constraint is enforced at DuckDB write time.

---

### `src/types/events.ts` (NEW file — no analog)

This is a net-new module. No codebase analog exists. Use the RESEARCH.md Pattern 6 directly.

**Full file content to author** (Pattern 6, RESEARCH.md lines 357–376):
```typescript
// File: src/types/events.ts
// Module file: the export makes this a module, enabling declare global augmentation
// (verbatimModuleSyntax: true requires a module boundary — Pitfall 6 in RESEARCH.md)

export interface FilterChangeDetail {
  state: string;
  recordType: string;
  yearMin: number;
  yearMax: number;
  county: string;
  collection: string;
  elevationMin: number;
  elevationMax: number;
}

// Global HTMLElementEventMap augmentation — types addEventListener('pnwm-filter-change', ...)
// at all listener sites without a cast.
declare global {
  interface HTMLElementEventMap {
    'pnwm-filter-change': CustomEvent<FilterChangeDetail>;
  }
}
```

**Pitfall (Pitfall 6 from RESEARCH.md):** If the file has no `export` statement, `declare global` becomes an ambient script-level declaration and `verbatimModuleSyntax: true` may reject it. The `export interface FilterChangeDetail` line is what makes this a module. Do NOT use `export default`.

---

### `src/types/index.ts` (config, transform)

**Analog:** `src/types/index.ts` (self — one line addition)

**Current file** (`src/types/index.ts` lines 1–4):
```typescript
// Re-exports for all schemas and derived types from src/types/schemas.ts
// Import from this module: import type { OccurrenceRecord } from '../types/index.ts'
// Note: eleventy.d.ts is an ambient .d.ts shim — it is NOT re-exported here.
export * from './schemas.ts';
```

**Add one line** (after line 4):
```typescript
export * from './events.ts';
```

---

### `src/components/parquet-cache.ts` (service + validator, request-response)

**Analog:** `src/components/parquet-cache.js` (self — rename + type annotations + validator injection)

**Imports pattern** (`parquet-cache.js` line 1 → expanded):
```typescript
import { parquetReadObjects, parquetMetadata } from 'hyparquet';
import type { OccurrenceRecord } from '../types/index.ts';
```

**Cache declaration** (line 4 → typed):
```typescript
const cache = new Map<string, OccurrenceRecord[]>();
```

**loadParquet signature and validator injection** (after `const arrayBuffer = await res.arrayBuffer()`; RESEARCH.md Pattern 4):
```typescript
export async function loadParquet(slug: string): Promise<OccurrenceRecord[]> {
  if (cache.has(slug)) return cache.get(slug)!;
  const url = `${import.meta.env.BASE_URL}species/${slug}/records.parquet`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch failed ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    // O(columns) Parquet schema validator — reads footer only, independent of row count
    // parquetMetadata() takes ArrayBuffer directly (not the file object — see Pitfall 4)
    const meta = parquetMetadata(arrayBuffer);
    const actualCols = new Set(meta.schema.slice(1).map((el: { name: string }) => el.name));
    for (const col of EXPECTED_PARQUET_COLUMNS) {
      if (!actualCols.has(col)) {
        throw new Error(`records.parquet schema mismatch: missing column "${col}"`);
      }
    }
    const file = {
      byteLength: arrayBuffer.byteLength,
      slice: (start: number, end: number) => arrayBuffer.slice(start, end),
    };
    const records = await parquetReadObjects({ file }) as OccurrenceRecord[];
    cache.set(slug, records);
    return records;
  } catch (err) {
    console.error(`[pnwmoths] Failed to load parquet: ${url}`, err);
    throw err;  // D-05: reuse the existing throw path
  }
}
```

**Expected columns constant** (add before the function):
```typescript
const EXPECTED_PARQUET_COLUMNS = new Set([
  'species_slug', 'record_type', 'latitude', 'longitude', 'state',
  'county', 'locality', 'elevation_ft', 'year', 'month', 'day',
  'collector', 'collection', 'notes',
]);
```

**filterRecords signature** (`parquet-cache.js` lines 45–57 → typed):
```typescript
export function filterRecords(
  records: OccurrenceRecord[],
  filters: {
    state?: string;
    recordType?: string;
    yearMin?: number;
    yearMax?: number;
    county?: string;
    collection?: string;
    elevationMin?: number;
    elevationMax?: number;
  }
): OccurrenceRecord[] { ... }
```

**aggregateByMonth signature** (`parquet-cache.js` lines 65–73 → typed):
```typescript
export function aggregateByMonth(records: OccurrenceRecord[]): number[] { ... }
```

**Pitfall (Pitfall 4 from RESEARCH.md):** `parquetMetadata(ab)` takes the raw `ArrayBuffer`; the `file` object with `{ byteLength, slice }` is for `parquetReadObjects` only. Do NOT swap them.

---

### `src/components/pnwm-filter-bar.ts` (component, event-driven)

**Analog:** `src/components/pnwm-filter-bar.js` (self — rename + annotate, dispatch site typed)

**Imports** (`pnwm-filter-bar.js` line 1 → expanded):
```typescript
import { LitElement, html, css, type PropertyDeclarations, type CSSResult, type TemplateResult } from 'lit';
import { loadParquet } from './parquet-cache.ts';
import type { OccurrenceRecord } from '../types/index.ts';
import type { FilterChangeDetail } from '../types/index.ts';
```

**static get properties() typing** (`pnwm-filter-bar.js` lines 7–23 → typed):
```typescript
static get properties(): PropertyDeclarations {
  return {
    slug: { type: String },
    _state: { type: String, state: true },
    // ... all 12 properties unchanged
  };
}
```

**static get styles() typing** (`pnwm-filter-bar.js` lines 25–59 → typed):
```typescript
static get styles(): CSSResult {
  return css`...`;
}
```

**Instance fields in constructor** (`pnwm-filter-bar.js` lines 61–76 → with type annotations):
```typescript
slug: string;
_state: string;
_recordType: string;
_yearMin: number;
_yearMax: number;
_states: string[];
_recordTypes: string[];
_county: string;
_collection: string;
_elevationMin: number;
_elevationMax: number;
_counties: string[];
_collections: string[];

constructor() {
  super();
  this.slug = '';
  this._state = 'all';
  // ... all constructor assignments unchanged from .js
}
```

**connectedCallback typed** (`pnwm-filter-bar.js` lines 78–101):
```typescript
async connectedCallback(): Promise<void> {
  super.connectedCallback();
  if (this.slug) {
    try {
      const records: OccurrenceRecord[] = await loadParquet(this.slug);
      // ... body unchanged
    } catch (_err) {
      // Leave empty on error — controls still render with "All" options
    }
  }
}
```

**_dispatchFilterChange typed with FilterChangeDetail** (`pnwm-filter-bar.js` lines 103–118 — D-09):
```typescript
_dispatchFilterChange(): void {
  this.dispatchEvent(new CustomEvent<FilterChangeDetail>('pnwm-filter-change', {
    bubbles: true,
    composed: true,
    detail: {
      state: this._state,
      recordType: this._recordType,
      yearMin: this._yearMin,
      yearMax: this._yearMax,
      county: this._county,
      collection: this._collection,
      elevationMin: this._elevationMin,
      elevationMax: this._elevationMax,
    },
  }));
}
```

**Event handler signatures** (lines 120–175 → typed):
```typescript
_onStateChange(e: Event): void { this._state = (e.target as HTMLSelectElement).value; ... }
_onYearMinChange(e: Event): void { const val = Number((e.target as HTMLInputElement).value); ... }
// Same pattern for all 8 event handlers
```

**render return type** (`pnwm-filter-bar.js` line 177):
```typescript
render(): TemplateResult { return html`...`; }
```

**customElements.define** (`pnwm-filter-bar.js` line 288 — unchanged per D-06):
```typescript
customElements.define('pnwm-filter-bar', PnwmFilterBar);
```

---

### `src/components/pnwm-taxon-browser.ts` (component + validator, request-response + event-driven)

**Analog:** `src/components/pnwm-taxon-browser.js` (self — rename + annotate + species-states validator)

**Imports** (`pnwm-taxon-browser.js` line 1 → expanded):
```typescript
import { LitElement, html, type PropertyDeclarations, type TemplateResult } from 'lit';
import { SpeciesStateSchema, type SpeciesState, type TaxonFamily } from '../types/index.ts';
```

**static get properties() pattern** (`pnwm-taxon-browser.js` lines 49–60 — uses `static get properties()` getter form):
```typescript
static get properties(): PropertyDeclarations {
  return {
    'path-prefix':        { type: String },
    _families:            { attribute: false, state: true },
    _stateMap:            { attribute: false, state: true },
    _statesAvailable:     { attribute: false, state: true },
    _selectedState:       { type: String,  state: true },
    _showImages:          { type: Boolean, state: true },
    _expandedFamilies:    { attribute: false, state: true },
    _expandedSubfamilies: { attribute: false, state: true },
    _expandedGenera:      { attribute: false, state: true },
  };
}
```

**Instance fields** (`pnwm-taxon-browser.js` lines 67–77 → typed):
```typescript
_families: TaxonFamily[];
_stateMap: Record<string, Set<string>>;
_statesAvailable: string[];
_selectedState: string;
_showImages: boolean;
_expandedFamilies: Set<string>;
_expandedSubfamilies: Set<string>;
_expandedGenera: Set<string>;
```

**connectedCallback — species-states.json validator injection** (`pnwm-taxon-browser.js` lines 79–93; D-03 validator added inside the try block after `res.json()`):
```typescript
async connectedCallback(): Promise<void> {
  super.connectedCallback();
  const scriptEl = document.getElementById('taxon-data');
  if (scriptEl) this._families = JSON.parse(scriptEl.textContent ?? '[]') as TaxonFamily[];
  try {
    const res = await fetch(`${this._prefix}species-states.json`);
    const rows: unknown = await res.json();
    // O(1) shape validator — D-03: check top-level + one representative element only
    if (!Array.isArray(rows)) {
      throw new Error('species-states.json: expected array at top level');
    }
    if (rows.length > 0) {
      const probe = SpeciesStateSchema.safeParse(rows[0]);
      if (!probe.success) {
        throw new Error(
          `species-states.json: element shape mismatch: ${probe.error.issues.map((i: { message: string }) => i.message).join('; ')}`
        );
      }
    }
    const typedRows = rows as SpeciesState[];
    this._stateMap = buildStateMap(typedRows);
    this._statesAvailable = [...new Set(typedRows.map(r => r.state))].sort();
  } catch (_e) {
    // D-05 note: validator throws here; existing catch governs degradation behavior.
    // Per D-05, "throw" reuses the existing pattern — the catch determines whether
    // it propagates (hard fail) or swallows (soft degradation). Current behavior:
    // leave stateMap empty (select stays disabled). Planner must confirm if this
    // should re-throw for schema validation errors vs. network errors.
  }
}
```

**buildStateMap, taxonHasState, collectSlugs** (`pnwm-taxon-browser.js` lines 17–45 → typed):
```typescript
export function buildStateMap(rows: SpeciesState[]): Record<string, Set<string>> { ... }
export function taxonHasState(slugs: string[], stateMap: Record<string, Set<string>>, selectedState: string): boolean { ... }
export function collectSlugs(node: TaxonFamily | { genera: ...; } | { subfamilies: ...; }): string[] { ... }
```

**Note on collectSlugs typing:** The node parameter is a union type covering TaxonFamily, TaxonSubfamily, and TaxonGenus from `schemas.ts`. Import those types from `../types/index.ts`.

**customElements.define** (`pnwm-taxon-browser.js` line 327 — unchanged per D-06):
```typescript
customElements.define('pnwm-taxon-browser', PnwmTaxonBrowser);
```

---

### `src/components/pnwm-image-slideshow.ts` (component, event-driven)

**Analog:** `src/components/pnwm-image-slideshow.js` (self — rename + annotate; uses `static properties = {}` class field form)

**Imports** (`pnwm-image-slideshow.js` line 1 → expanded):
```typescript
import { LitElement, html, css, type PropertyDeclarations, type CSSResult, type TemplateResult } from 'lit';
import type { Specimen } from '../types/index.ts';
```

**static properties = {} class field form** (`pnwm-image-slideshow.js` lines 4–15 → typed):
```typescript
static properties: PropertyDeclarations = {
  slug: { type: String },
  _currentIndex: { state: true },
  _lightboxOpen: { state: true },
  _images: { attribute: false, state: true },
  _stripOverflows: { state: true },
  highResAvailable: { type: Boolean, attribute: 'high-res-available' },
  highResSpecimens: { attribute: 'high-res-specimens' },
  cdnBaseUrl: { type: String, attribute: 'cdn-base-url' },
  prefixUrl: { type: String, attribute: 'prefix-url' },
  _highResSpecimens: { state: true },
};

static styles: CSSResult = css`...`;
```

**Instance fields** (constructor assignments → with type declarations above constructor):
```typescript
slug: string;
_currentIndex: number;
_lightboxOpen: boolean;
_images: Array<{ filename: string; photographer: string; license: string }>;
_stripOverflows: boolean;
highResAvailable: boolean;
highResSpecimens: string;          // JSON string attribute, parsed in updated()
cdnBaseUrl: string;
prefixUrl: string;
_highResSpecimens: Specimen[];
_osdViewer: import('openseadragon').Viewer | null;
```

**noUncheckedIndexedAccess handling** (Pitfall 7 — array access needs nullish coalescing):
```typescript
// Existing JS already uses: this._highResSpecimens[this._currentIndex] ?? this._highResSpecimens[0]
// TypeScript under noUncheckedIndexedAccess makes both accesses return T | undefined.
// Keep the existing ?? pattern and add the trailing non-null assertion for the fallback:
const specimen = this._highResSpecimens[this._currentIndex] ?? this._highResSpecimens[0]!;
```

---

### `src/components/pnwm-occurrence-map.ts`, `pnwm-phenology-chart.ts` (components, event-driven)

**Analog for both:** `src/components/pnwm-filter-bar.js` (same `static get properties()` getter form + connectedCallback pattern)

**Imports pattern** (expand existing lit import + add types):
```typescript
import { LitElement, html, css, type PropertyDeclarations, type CSSResult, type TemplateResult } from 'lit';
import type { OccurrenceRecord } from '../types/index.ts';
import type { FilterChangeDetail } from '../types/index.ts';
```

**Listener sites — FilterChangeDetail usage** (these components listen for `pnwm-filter-change`):
```typescript
// With the HTMLElementEventMap merge in events.ts, addEventListener is typed automatically:
this.addEventListener('pnwm-filter-change', (e: CustomEvent<FilterChangeDetail>) => {
  const { state, yearMin, yearMax } = e.detail;
  // ...
});
// The generic annotation is optional after the merge but kept for clarity
```

**pnwm-occurrence-map specific:** Import `L` from `'leaflet'` (already typed via `@types/leaflet`):
```typescript
import L from 'leaflet';
// Instance fields:
_map: L.Map | null;
_markerGroup: L.FeatureGroup | null;
```

**pnwm-phenology-chart specific:** Chart.js types (check existing import pattern in the .js file before annotating).

---

### `src/components/pnwm-occurrence-popup.ts`, `pnwm-plate-viewer.ts` (components)

**Analog:** `src/components/pnwm-image-slideshow.js` (same `static properties = {}` class field form)

**Pattern:** Same `static properties: PropertyDeclarations = {...}` + typed instance fields as pnwm-image-slideshow.ts.

**pnwm-occurrence-popup specific:** Takes an `OccurrenceRecord` as input:
```typescript
import type { OccurrenceRecord } from '../types/index.ts';
// Instance field:
record: OccurrenceRecord | null;
```

---

### `src/components/glossary-tooltip.ts` (utility, vanilla script)

**Analog:** `src/components/glossary-tooltip.js` (self — rename + DOM API type annotations; NOT a Lit component)

**Pattern** (RESEARCH.md Pattern 7 — typed DOM queries):
```typescript
const terms = document.querySelectorAll<HTMLElement>('abbr.glossary-term');

terms.forEach((abbr: HTMLElement, _index: number) => {
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  const popover = document.createElement('div');
  // Non-null assertions justified: elements authored at build time
  const gtImg = popover.querySelector<HTMLImageElement>('.gt-img')!;
  const gtDef = popover.querySelector<HTMLParagraphElement>('.gt-def')!;
});
```

**No class, no LitElement, no customElements.define** — this is a top-level script.

---

### `src/components/main.ts` (config/entrypoint, transform)

**Analog:** `src/components/main.js` (self — rename + import specifiers only)

**Before** (`main.js` lines 1–8):
```javascript
import './pnwm-occurrence-map.js';
import './pnwm-occurrence-popup.js';
// ... all 8 side-effect imports
import './glossary-tooltip.js';
```

**After** (change all 8 `.js` → `.ts`):
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

No other changes.

---

### Test files: `filters.test.ts`, `parquet-cache.test.ts`, `phenology.test.ts`, `pnwm-image-slideshow.test.ts`, `pnwm-taxon-browser.test.ts`

**Analog:** `src/components/parquet-cache.test.js` (lines 1–3) and `src/components/pnwm-taxon-browser.test.js` (lines 1–3)

**Import pattern** (identical across all test files — update specifier):
```typescript
// BEFORE:
import { filterRecords, aggregateByMonth, loadParquet } from './parquet-cache.js';

// AFTER:
import { filterRecords, aggregateByMonth, loadParquet } from './parquet-cache.ts';
```

```typescript
// BEFORE:
import { buildStateMap, taxonHasState, collectSlugs } from './pnwm-taxon-browser.js';

// AFTER:
import { buildStateMap, taxonHasState, collectSlugs } from './pnwm-taxon-browser.ts';
```

**node:test boilerplate** (`parquet-cache.test.js` lines 1–2 — unchanged):
```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
```

**New test cases for parquet-cache.test.ts** (SCHEMA-08 validator tests — no analog, new):
```typescript
describe('loadParquet column validator', () => {
  it('throws when a required column is missing', async () => {
    // Mock fetch to return a minimal Parquet with one column removed
    // Use assert.rejects with the expected error message fragment
    await assert.rejects(
      async () => { /* invoke loadParquet with mocked fetch */ },
      /schema mismatch/
    );
  });
});
```

**New test cases for pnwm-taxon-browser.test.ts** (SCHEMA-08 validator tests):
```typescript
describe('species-states.json validator', () => {
  it('throws when top-level is not an array', () => {
    // Test the validation logic directly (extract to a testable function if needed)
  });

  it('throws when element shape is wrong', () => {
    // Test with a rows[0] missing 'state' field
  });
});
```

---

## Shared Patterns

### Lit PropertyDeclarations typing
**Source:** RESEARCH.md Pattern 1 (verified against `@lit/reactive-element/reactive-element.d.ts` line 143)
**Apply to:** All 8 Lit component `.ts` files

```typescript
// For static get properties() form (pnwm-filter-bar, pnwm-occurrence-map,
//   pnwm-phenology-chart, pnwm-taxon-browser):
static get properties(): PropertyDeclarations { return { ... }; }
static get styles(): CSSResult { return css`...`; }
render(): TemplateResult { return html`...`; }

// For static properties = {} form (pnwm-image-slideshow, pnwm-plate-viewer,
//   pnwm-occurrence-popup):
static properties: PropertyDeclarations = { ... };
static styles: CSSResult = css`...`;
```

Import source for all Lit types:
```typescript
import { LitElement, html, css, type PropertyDeclarations, type CSSResult, type TemplateResult, type PropertyValues } from 'lit';
```

### Instance field declaration + constructor assignment pattern
**Source:** RESEARCH.md Pitfall 1 (D-08; `useDefineForClassFields: false`)
**Apply to:** All 8 Lit component `.ts` files

```typescript
// CORRECT — declare field above constructor, assign in constructor:
class PnwmExample extends LitElement {
  slug: string;          // type declaration (compiles to nothing with useDefineForClassFields: false)

  constructor() {
    super();
    this.slug = '';      // assignment in constructor — correct for Lit reactivity
  }
}

// WRONG — class field initializer without constructor:
class PnwmExample extends LitElement {
  slug = '';             // DO NOT use this form — useDefineForClassFields: false makes this
                         // a constructor assignment anyway, but the style is confusing
}
```

### customElements.define — keep as-is
**Source:** `src/components/pnwm-filter-bar.js` line 288; all component .js files
**Apply to:** All 8 Lit component `.ts` files (D-06)

```typescript
customElements.define('pnwm-filter-bar', PnwmFilterBar);
// Keep at tail of each component file — no @customElement decorator
```

### zod/mini safeParse error handling
**Source:** RESEARCH.md Pattern 5 (verified against zod 4.4.3 API)
**Apply to:** `parquet-cache.ts` (throw on missing column), `pnwm-taxon-browser.ts` (shape probe)

```typescript
const probe = SpeciesStateSchema.safeParse(rows[0]);
if (!probe.success) {
  throw new Error(`...: ${probe.error.issues.map((i: { message: string }) => i.message).join('; ')}`);
}
```

### throw-and-rethrow error pattern
**Source:** `src/components/parquet-cache.js` lines 21–35 (existing pattern)
**Apply to:** `parquet-cache.ts` (already uses it), `pnwm-taxon-browser.ts` validator (D-05)

```typescript
try {
  // ...
} catch (err) {
  console.error(`[pnwmoths] Failed to load ...: ${url}`, err);
  throw err;
}
```

### noUncheckedIndexedAccess array access
**Source:** RESEARCH.md Pitfall 7 (`tsconfig.browser.json` sets `noUncheckedIndexedAccess: true`)
**Apply to:** Any component accessing arrays by index (`pnwm-image-slideshow.ts`, `pnwm-occurrence-map.ts`)

```typescript
// arr[i] returns T | undefined under noUncheckedIndexedAccess
// Use nullish coalescing or non-null assertion with preceding length check:
const item = arr[index] ?? arr[0]!;
// OR: if (index < arr.length) { const item = arr[index]!; }
```

### Test import specifier pattern
**Source:** `src/components/pnwm-taxon-browser.test.js` line 3 (existing)
**Apply to:** All 5 test `.ts` files

```typescript
// Use .ts extension in import specifiers (node --test + native type-stripping requires it)
import { buildStateMap } from './pnwm-taxon-browser.ts';  // NOT .js
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/types/events.ts` | model/type | event-driven | No `HTMLElementEventMap` augmentation or `FilterChangeDetail`-style typed custom event exists in the codebase. No `declare global` in any existing `.ts` file. Use RESEARCH.md Pattern 6 directly. |

---

## Metadata

**Analog search scope:** `src/components/`, `src/types/`, `src/_lib/`, `scripts/`, `scripts/lib/`
**Files scanned:** 14 source files read directly
**Pattern extraction date:** 2026-06-10
