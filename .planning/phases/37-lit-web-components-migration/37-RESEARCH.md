# Phase 37: Lit Web Components Migration - Research

**Researched:** 2026-06-10
**Domain:** TypeScript conversion of Lit web components, zod/mini bundle-safe schemas, hyparquet column-schema validation, HTMLElementEventMap declaration merge
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Use `zod/mini` for both load-time validators (not hand-rolled)
- **D-02 (CRITICAL):** Existing `schemas.ts` uses classic `import { z } from 'zod'` with chained `.nullable()` — a browser component importing this pulls full Zod into the bundle (violates SC-4). The two runtime-validated entities (`OccurrenceRecord`, `SpeciesState`) must be refactored so the browser import is `zod/mini` only. Researcher determines the cleanest module layout.
- **D-03:** Do NOT `z.array(SpeciesStateSchema).parse(data)` — that is O(rows). Validate `species-states.json` by checking top-level is an array + parsing a single representative element's shape. Validate `records.parquet` from hyparquet column-schema metadata (O(columns)), not by parsing the records array.
- **D-04:** Measure and record the gzipped bundle delta over the pre-migration baseline.
- **D-05:** On validation failure, throw — reusing `loadParquet()`'s existing `try/catch`-and-throw pattern.
- **D-06:** Keep existing `static get properties()` / `static get styles()` pattern and manual `customElements.define(...)`. Do NOT adopt `@customElement`/`@property`/`@state` decorators.
- **D-07:** Lit decorators are incompatible with `node --test` native type-stripping. Empirically confirmed: Node 24.15.0 throws `SyntaxError` on `@customElement`. Keeping `static get properties()` is a hard requirement.
- **D-08:** Keep `useDefineForClassFields: false` in `tsconfig.browser.json` — still required for Lit reactive-field pattern, independent of decorators.
- **D-09:** Define `FilterChangeDetail` in `src/types/` and add a global `HTMLElementEventMap` declaration merge so `addEventListener('pnwm-filter-change', ...)` is typed without casting. Use at dispatch (`pnwm-filter-bar.ts`) and listener sites.

### Claude's Discretion

- Exact module layout for making `OccurrenceRecord`/`SpeciesState` browser-safe under D-02 (refactor-in-place vs. dedicated mini module)
- Per-component field/method annotation specifics; whether `glossary-tooltip`, `plate-viewer`, `occurrence-popup` need any guard or are simple typed conversions
- Exact file for `FilterChangeDetail` (`src/types/events.ts` vs. appending to an existing types file) and the precise declaration-merge mechanics
- Whether the SC-4 gzip-delta note is committed or transient

### Deferred Ideas (OUT OF SCOPE)

- Fix close button on the lightbox (`2026-04-23-fix-close-button-on-lightbox.md`) — behavior fix, violates SC-5 (byte-identical / behavior-unchanged)
- Migrate Pagefind to Component UI (`2026-05-23-migrate-pagefind-to-component-ui.md`) — new UI feature, not TS migration
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MIG-04 | All Lit web components in `src/components/` converted to TypeScript, with `pnwm-filter-change` event typed via a shared detail interface | D-06..D-09 conversion pattern; `FilterChangeDetail` + `HTMLElementEventMap` merge; conversion of all 10 component files + 5 test files |
| SCHEMA-08 | Data fetched dynamically from CDN validated at load time by structure, not per-row (O(columns), independent of dataset size): `records.parquet` via hyparquet column metadata, `species-states.json` by top-level + element shape; runs in production using `zod/mini` | D-01..D-03 validator design; hyparquet `parquetMetadata()` API for O(columns) column check; `zod/mini` O(1) element-shape check for `species-states.json` |
</phase_requirements>

---

## Summary

Phase 37 is a TypeScript conversion phase with two genuinely new behaviors layered on top of the otherwise templated rename-and-annotate work: (1) two O(structure) load-time validators at the only dynamic CDN fetch boundaries, and (2) a typed CustomEvent contract via `FilterChangeDetail` + `HTMLElementEventMap`. The client bundle constraint (SC-4: no full-Zod runtime) is the most technically interesting constraint, and D-02 (making `schemas.ts` browser-safe) is the key unresolved design question this research answers.

**The D-02 answer (verified):** Refactor `OccurrenceRecordSchema` and `SpeciesStateSchema` in-place in `src/types/schemas.ts` to use the `zod/mini` functional API (`import * as z from 'zod/mini'`; `z.nullable(z.string())` instead of `z.string().nullable()`). The remaining five schemas (`Species`, `GlossaryWord`, `SpeciesImage`, `SpecimenSchema`/`SpeciesPhotoSchema`, `TaxonNode`) stay on classic full-zod; only the two runtime-validated entities move to mini. The `zod/mini` functional API is a strict superset of what the two schemas need, `z.infer<>` works identically, and `safeParse()` error structure is compatible with `verify-parquet.ts` (which reads `result.error.issues[].path/message`). The build-side Node scripts (`verify-parquet.ts`) can import mini just as well as classic since bundle weight is irrelevant there.

**Key verified facts for planners:**
- `parquetMetadata(arrayBuffer)` (from hyparquet) reads only the Parquet file footer and returns a `metadata.schema` array. `metadata.schema.slice(1)` gives one element per column (skip element 0, the root group). Each element has a `.name` property. This is O(columns), reads no rows.
- The browser's `loadParquet()` already fetches the whole file into an ArrayBuffer; the same ArrayBuffer is passed to `parquetMetadata(ab)` for validation and to `parquetReadObjects({ file })` for reading — no extra fetch.
- `zod/mini` does NOT export `ZodError` or `ZodType` (only `ZodMiniType` and helper functions). The SC-4 bundle grep (`grep ZodError ZodType bundle.js`) will be absent if the only import is `zod/mini`.
- zod/mini (v4.4.3): `~34 KB` unminified vs. classic zod `~83 KB` (plus a shared core of `~220 KB`). Both entrypoints share the core module, so the marginal bundle cost of adding `zod/mini` validators is the ~30 KB mini-specific `schemas.js` that doesn't ship if zod is entirely absent.
- 3 of 9 Lit components already use `static properties = {...}` class field syntax (`pnwm-image-slideshow`, `pnwm-plate-viewer`, `pnwm-occurrence-popup`). 4 use `static get properties() {}` getter syntax (`pnwm-filter-bar`, `pnwm-occurrence-map`, `pnwm-phenology-chart`, `pnwm-taxon-browser`). Both syntaxes are equally valid under `useDefineForClassFields: false` and are compatible with Lit reactivity. The conversion does not require normalizing to one form.
- `glossary-tooltip.js` is a vanilla JS script (no class, no Lit) — conversion is purely rename + type annotations on DOM API calls.

**Pre-migration bundle baseline (SC-4 delta):** `_site/assets/main-mhZWKs7f.js` is 391,256 bytes (121,833 bytes gzipped). No Zod code is currently in this bundle. After Phase 37, adding `zod/mini` validators introduces the mini schemas entrypoint. The gzip delta should be recorded after the bundle is rebuilt.

**Primary recommendation:** Use the refactor-in-place approach for D-02: `src/types/schemas.ts` imports `import * as z from 'zod/mini'` and converts `OccurrenceRecordSchema` and `SpeciesStateSchema` to the functional API; all other schemas and the rest of `schemas.ts` can stay, as they all use the same functional API that `zod/mini` provides. The build-side Zod usage (verify-parquet.ts, build-data.ts) is unaffected because `zod/mini` and classic zod produce the same parse results.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Load-time Parquet column validation | Browser (loadParquet chokepoint) | — | Validates CDN-fetched data before it enters the app; throw path already exists there |
| Load-time species-states.json validation | Browser (pnwm-taxon-browser connectedCallback) | — | Only consumer of this fetch; natural injection point after `res.json()` |
| FilterChangeDetail event type | Shared types (src/types/) | Browser (dispatch + listeners) | Shared interface consumed at both dispatch site and listener sites |
| HTMLElementEventMap merge | Global ambient declaration (src/types/) | — | Must be global to type addEventListener at all listener sites without importing |
| Component field typing | Browser (each .ts component) | — | Per-component instance fields and Lit PropertyDeclarations |
| zod/mini schema definitions | Shared types (src/types/schemas.ts) | — | Single source of truth; imported by both browser and Node build scripts |
| SC-4 bundle grep | CI / verification step | — | Post-build verification; not a runtime concern |
| SC-5 byte-identical verification | Build output comparison | — | `diff -r` of data files + HTML content; Parquet/JSON identical; JS hashes differ (expected) |

---

## Standard Stack

### Core (already installed, no new packages)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| lit | ^3.3.2 | LitElement base class, html/css tagged templates | All components already use it |
| zod | ^4.4.3 | Runtime validation via `zod/mini` entrypoint for browser safety | Already installed; `zod/mini` is the same package, different entrypoint |
| hyparquet | ^1.25.6 | Parquet file reading + metadata API for column schema validation | Already installed; `parquetMetadata()` is the O(columns) validation API |
| typescript | ^6.0.3 | Type checking via `tsconfig.browser.json` | Already installed |
| @types/leaflet | ^1.9.21 | Leaflet types for pnwm-occurrence-map | Already installed |

**No new packages required for Phase 37.** [VERIFIED: npm registry]

### Supporting Type Imports (from lit)

| Import | Source | Purpose |
|--------|--------|---------|
| `PropertyDeclarations` | `@lit/reactive-element` (re-exported via `lit`) | Type annotation for `static get properties()` return value |
| `PropertyValues` | `@lit/reactive-element` | Type annotation for `updated(changedProperties: PropertyValues)` |
| `CSSResult` | `lit` | Type for `static get styles()` return value (when using `css` template tag) |
| `TemplateResult` | `lit` | Return type for `render()` method |
| `LitElement` | `lit` | Base class |

---

## Package Legitimacy Audit

No new packages are being installed in Phase 37. All packages listed above were installed in prior phases (Phase 33–36) and have been in use throughout the v3.0 migration. No legitimacy audit is required.

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
Browser request for species page
         |
    [Static HTML served by CDN]
         |
    [main.ts] — side-effect imports all components
         |
    pnwm-filter-bar.ts ──dispatchEvent('pnwm-filter-change', {detail: FilterChangeDetail})──►
         |                                                                                    |
    loadParquet(slug)                                                            pnwm-occurrence-map.ts
         |                                                                       pnwm-phenology-chart.ts
    fetch(records.parquet)  ← CDN (mutable URL — trust boundary)
         |
    parquetMetadata(ab)   [O(columns) schema validator — throws on mismatch]
         |
    parquetReadObjects({file})   [returns OccurrenceRecord[]]
         |
    component re-renders with typed data

    pnwm-taxon-browser.ts
         |
    fetch(species-states.json)  ← CDN (mutable URL — trust boundary)
         |
    Array.isArray(rows) check + SpeciesStateSchemaMini.safeParse(rows[0])
    [O(1) shape validator — throws on mismatch]
         |
    buildStateMap(rows as SpeciesState[])   [filters browser accordion]
```

### Recommended Project Structure

No structural changes to `src/components/` or `src/types/`. Conversions are in-place renames:

```
src/
├── components/
│   ├── glossary-tooltip.ts       # was .js; vanilla script → typed DOM calls
│   ├── main.ts                   # was .js; import specifiers .js → .ts
│   ├── parquet-cache.ts          # was .js; O(columns) Parquet validator ADDED here
│   ├── pnwm-filter-bar.ts        # was .js; FilterChangeDetail<> at dispatch site
│   ├── pnwm-image-slideshow.ts   # was .js; typed Specimen, OSD, light-DOM image shape
│   ├── pnwm-occurrence-map.ts    # was .js; L.Map, L.FeatureGroup typed; OccurrenceRecord fields
│   ├── pnwm-occurrence-popup.ts  # was .js; OccurrenceRecord param type
│   ├── pnwm-phenology-chart.ts   # was .js; Chart.js typed usage
│   ├── pnwm-plate-viewer.ts      # was .js; simple typed fields
│   ├── pnwm-taxon-browser.ts     # was .js; SpeciesState validator ADDED here
│   ├── filters.test.ts           # was .test.js
│   ├── parquet-cache.test.ts     # was .test.js
│   ├── phenology.test.ts         # was .test.js
│   ├── pnwm-image-slideshow.test.ts  # was .test.js
│   └── pnwm-taxon-browser.test.ts    # was .test.js
├── types/
│   ├── schemas.ts                # OccurrenceRecord + SpeciesState MIGRATED to zod/mini API
│   ├── events.ts                 # NEW: FilterChangeDetail interface + HTMLElementEventMap merge
│   └── index.ts                  # re-exports (unchanged, but now also re-exports from events.ts)
```

### Pattern 1: Lit Static Properties Typing

Components with `static get properties()` need the return value typed as `PropertyDeclarations`. Instance fields with typed values are assigned in the constructor (compatible with `useDefineForClassFields: false`):

```typescript
// Source: verified against @lit/reactive-element/reactive-element.d.ts (line 143-144)
import { LitElement, html, css, type PropertyDeclarations, type PropertyValues, type TemplateResult, type CSSResult } from 'lit';

class PnwmFilterBar extends LitElement {
  static get properties(): PropertyDeclarations {
    return {
      slug: { type: String },
      _state: { type: String, state: true },
      _states: { attribute: false, state: true },
    };
  }

  static get styles(): CSSResult {
    return css`:host { display: block; }`;
  }

  // Instance fields: assigned in constructor (useDefineForClassFields: false compiles these as this.x = '')
  slug: string;
  _state: string;
  _states: string[];

  constructor() {
    super();
    this.slug = '';
    this._state = 'all';
    this._states = [];
  }

  render(): TemplateResult {
    return html`...`;
  }

  updated(changedProperties: PropertyValues): void {
    super.updated(changedProperties);
    // ...
  }
}
```

### Pattern 2: Lit Static Class Fields (already used in image-slideshow, plate-viewer, occurrence-popup)

`pnwm-image-slideshow`, `pnwm-plate-viewer`, and `pnwm-occurrence-popup` already use `static properties = {...}` class field syntax. Under `useDefineForClassFields: false`, static class fields are unaffected (the flag only controls instance field assignment timing). These convert without changing the declaration form:

```typescript
// Source: verified against pnwm-image-slideshow.js (existing working code)
import { LitElement, html, css, type PropertyDeclarations } from 'lit';

export class PnwmImageSlideshow extends LitElement {
  static properties: PropertyDeclarations = {
    slug: { type: String },
    _currentIndex: { state: true },
    highResAvailable: { type: Boolean, attribute: 'high-res-available' },
  };

  static styles = css`...`;

  // Typed instance fields (constructor assignment pattern — same as static get properties() components)
  slug: string;
  _currentIndex: number;
  highResAvailable: boolean;
  _osdViewer: import('openseadragon').Viewer | null;

  constructor() {
    super();
    this.slug = '';
    this._currentIndex = 0;
    this.highResAvailable = false;
    this._osdViewer = null;
  }
}
```

### Pattern 3: zod/mini Functional API (D-02 schema refactor)

The existing classic zod API uses method chaining; `zod/mini` uses a functional API. The conversion is mechanical:

```typescript
// BEFORE (classic zod in src/types/schemas.ts):
import { z } from 'zod';
export const OccurrenceRecordSchema = z.object({
  county: z.string().nullable(),
  year:   z.number().int().nullable(),
});

// AFTER (zod/mini in src/types/schemas.ts):
// Source: verified against node_modules/zod/v4/mini/schemas.js
import * as z from 'zod/mini';
export const OccurrenceRecordSchema = z.object({
  county: z.nullable(z.string()),
  year:   z.nullable(z.number()),
});
// Note: zod/mini does not have .int() — just z.number() is sufficient for runtime validation
// (the int constraint is enforced at build time via DuckDB INT32 Parquet type)
export type OccurrenceRecord = z.infer<typeof OccurrenceRecordSchema>;
```

The `z.infer<>` type utility works identically in `zod/mini`. The `safeParse()` method is available and its error `issues[].path` / `issues[].message` structure is compatible with `verify-parquet.ts`'s existing error-reporting code.

**IMPORTANT:** Only `OccurrenceRecordSchema` and `SpeciesStateSchema` need to move to `zod/mini`. The other five schemas (`Species`, `GlossaryWord`, `SpeciesImage`, `Specimen`/`SpeciesPhoto`, `TaxonNode`) are NOT imported by browser components and can stay on classic full-zod — **but** the same file cannot mix `import { z } from 'zod'` and `import * as z from 'zod/mini'`. The cleanest resolution: **convert all schemas in `schemas.ts` to the `zod/mini` functional API** and change the single import to `import * as z from 'zod/mini'`. The `zod/mini` API is a complete functional superset of what `schemas.ts` uses (all methods used: `z.object()`, `z.string()`, `z.number()`, `z.boolean()`, `z.array()`, `z.nullable()` — all exist in `zod/mini`). This avoids a two-import split and keeps `schemas.ts` as a single coherent module.

### Pattern 4: O(columns) Parquet Validator in loadParquet()

```typescript
// Source: verified against hyparquet npm (parquetMetadata API), node 24.15.0 testing
import { parquetReadObjects, parquetMetadata } from 'hyparquet';

const EXPECTED_PARQUET_COLUMNS = new Set([
  'species_slug', 'record_type', 'latitude', 'longitude', 'state',
  'county', 'locality', 'elevation_ft', 'year', 'month', 'day',
  'collector', 'collection', 'notes',
]);

export async function loadParquet(slug: string): Promise<OccurrenceRecord[]> {
  if (cache.has(slug)) return cache.get(slug)!;
  const url = `${import.meta.env.BASE_URL}species/${slug}/records.parquet`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch failed ${res.status}`);
    const ab = await res.arrayBuffer();
    // O(columns) schema validator — reads footer only, independent of row count
    // parquetMetadata takes the ArrayBuffer directly (not the file object)
    const meta = parquetMetadata(ab);
    const actualCols = new Set(meta.schema.slice(1).map(el => el.name));
    for (const expected of EXPECTED_PARQUET_COLUMNS) {
      if (!actualCols.has(expected)) {
        throw new Error(`records.parquet schema mismatch: missing column "${expected}"`);
      }
    }
    const file = { byteLength: ab.byteLength, slice: (s: number, e: number) => ab.slice(s, e) };
    const records = await parquetReadObjects({ file }) as OccurrenceRecord[];
    cache.set(slug, records);
    return records;
  } catch (err) {
    console.error(`[pnwmoths] Failed to load parquet: ${url}`, err);
    throw err;
  }
}
```

**Key API detail:** `parquetMetadata(ab: ArrayBuffer)` — takes the raw `ArrayBuffer` directly. `meta.schema[0]` is the root group element (name: `"duckdb_schema"`, no type); `meta.schema.slice(1)` gives the 14 column elements, each with `.name: string`. No extra fetch needed: the `ab` from `res.arrayBuffer()` is passed to both `parquetMetadata` and the `file` object for `parquetReadObjects`.

### Pattern 5: O(1) species-states.json Validator in pnwm-taxon-browser

```typescript
// Source: verified zod/mini API, verified species-states.json structure
import * as z from 'zod/mini';
import { SpeciesStateSchema, type SpeciesState } from '../types/index.ts';

// In connectedCallback(), after: const rows = await res.json();
if (!Array.isArray(rows)) {
  throw new Error('species-states.json: expected array at top level');
}
if (rows.length > 0) {
  const probe = SpeciesStateSchema.safeParse(rows[0]);
  if (!probe.success) {
    throw new Error(`species-states.json: element shape mismatch: ${probe.error.issues.map(i => i.message).join('; ')}`);
  }
}
const typedRows = rows as SpeciesState[];
this._stateMap = buildStateMap(typedRows);
this._statesAvailable = [...new Set(typedRows.map(r => r.state))].sort();
```

The `SpeciesStateSchema` is imported from `src/types/index.ts`, which re-exports from `schemas.ts` — the same module the planner migrates to `zod/mini`. The throw propagates up through the existing `try/catch` in `connectedCallback()`, matching D-05 (throw on validation failure, consistent with `loadParquet`).

**Note on D-03 throw discipline for `pnwm-taxon-browser`:** The current `connectedCallback()` already has a `try { ... } catch (_e) { /* Leave stateMap empty */ }` that silently swallows errors. Per D-05, the validator throw should propagate from inside the try block to be caught by that existing catch — which means the current "leave empty on error" behavior is preserved for validation failures too. If the user wants hard failure (not silent degradation) for schema mismatches, the catch block needs to be changed to re-throw. Per D-05 ("throw — reusing the existing throw pattern"), the validator should throw and the existing catch behavior governs whether it propagates. **This is a planner decision: confirm whether pnwm-taxon-browser's validator should throw-and-rethrow (hard fail) or throw-and-catch-silently (soft fail), consistent with D-05 intent that "showing no occurrence data beats rendering silently-wrong data".**

### Pattern 6: FilterChangeDetail + HTMLElementEventMap Global Merge

```typescript
// Source: TypeScript handbook ambient module augmentation; verified tsconfig.browser.json includes src/types/**
// File: src/types/events.ts

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

// Global declaration merge — types addEventListener('pnwm-filter-change', ...) everywhere
// Must be in a module file (has 'export') for the 'declare global' to be a module augmentation
declare global {
  interface HTMLElementEventMap {
    'pnwm-filter-change': CustomEvent<FilterChangeDetail>;
  }
}
```

```typescript
// Usage at dispatch site (pnwm-filter-bar.ts):
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
```

```typescript
// Usage at listener sites (any component that calls addEventListener):
el.addEventListener('pnwm-filter-change', (e: CustomEvent<FilterChangeDetail>) => {
  const { state, yearMin } = e.detail; // fully typed, no cast needed
});
// With HTMLElementEventMap merge, TypeScript infers the event type automatically
// so the explicit generic annotation is optional (but doesn't hurt to keep it)
```

**File placement:** `src/types/events.ts` (new file). Add `export * from './events.ts'` to `src/types/index.ts`. This file must be a module (not ambient) — the `export interface` line makes it a module, enabling the `declare global` augmentation to work correctly. `tsconfig.browser.json` already includes `src/types/**/*.ts` so no tsconfig change needed. This file is browser-only; do not add it to `tsconfig.node.json`'s include (the node-side code does not dispatch filter events).

### Pattern 7: Vanilla JS → TypeScript (glossary-tooltip.ts)

`glossary-tooltip.js` is not a Lit component — it's a top-level script that queries the DOM and adds event listeners. The conversion is straightforward typed annotations:

```typescript
// Source: verified against glossary-tooltip.js
const terms = document.querySelectorAll<HTMLElement>('abbr.glossary-term');

terms.forEach((abbr: HTMLElement, index: number) => {
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  const popover = document.createElement('div');
  // ...
  const gtImg = popover.querySelector<HTMLImageElement>('.gt-img')!;
  const gtDef = popover.querySelector<HTMLParagraphElement>('.gt-def')!;
  // ...
});
```

The non-null assertions on `querySelector` are justified because the HTML is authored at build time with those elements present. Alternatively use optional chaining with early returns if strict null-free is required.

### Pattern 8: main.ts import specifier update

```typescript
// BEFORE (main.js):
import './pnwm-occurrence-map.js';

// AFTER (main.ts):
import './pnwm-occurrence-map.ts';
```

All eight side-effect imports update their `.js` → `.ts` specifier. No behavior change.

### Pattern 9: Test file import specifier update

```typescript
// BEFORE (pnwm-taxon-browser.test.js):
import { buildStateMap, taxonHasState, collectSlugs } from './pnwm-taxon-browser.js';

// AFTER (pnwm-taxon-browser.test.ts):
import { buildStateMap, taxonHasState, collectSlugs } from './pnwm-taxon-browser.ts';
```

### Anti-Patterns to Avoid

- **Using decorators (`@customElement`, `@property`):** Throws `SyntaxError` under Node 24 native type-stripping. All component tests import component classes directly; a decorated class would fail under bare `node --test` (D-07, D-06).
- **Importing from `'zod'` in browser components:** Pulls `ZodError`/`ZodType` into the Vite bundle (SC-4 violation). Only `import * as z from 'zod/mini'` in browser-side code.
- **Mixing `import { z } from 'zod'` and `import * as z from 'zod/mini'` in schemas.ts:** Two different `z` objects in the same file; impossible to merge imports. Convert all schemas to mini API.
- **`z.array(SpeciesStateSchema).parse(rows)` for species-states.json validation:** O(rows) cost — 1,433 species × multiple states = thousands of parse calls. Probe only `rows[0]` (D-03).
- **Parsing row data with zod/mini to validate Parquet:** `parquetReadObjects()` returns all rows; validating each row is O(rows). Use `parquetMetadata()` on the ArrayBuffer to validate column names from the footer (O(columns)).
- **Unguarded `as OccurrenceRecord[]` cast without column validation:** Would silently accept a Parquet file with wrong schema (D-03 exists to catch CDN version skew).
- **`enum` or `namespace` in any converted file:** Violates `isolatedModules: true` and Node 24 type-stripping. Use string literal unions instead.
- **`export default` in `src/types/events.ts`:** Breaks the `export *` re-export pattern in `index.ts`. Use named exports.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Schema validation at CDN boundaries | Custom type-checking guards | `zod/mini` schemas | Single source of truth; D-01 locked decision |
| Parquet column presence check | Custom binary parser | `parquetMetadata()` from hyparquet | Already in bundle; reads footer only (O(columns)); no extra fetch |
| O(1) element-shape check | Custom duck-typing guard | `SpeciesStateSchema.safeParse(rows[0])` | Uses the already-authored schema; free with mini |
| Lit typed properties | Custom `PropertyDeclarations` interface | Import `PropertyDeclarations` from `lit` | Already typed in `@lit/reactive-element`; line 143 |
| CustomEvent type | Custom event class | `CustomEvent<FilterChangeDetail>` generic + `HTMLElementEventMap` merge | Standard TypeScript pattern; zero runtime overhead |

**Key insight:** The only code to actually write for SCHEMA-08 is ~12 lines in `loadParquet()` and ~6 lines in `connectedCallback()`. Everything else is Zod machinery the project already has.

---

## Common Pitfalls

### Pitfall 1: `useDefineForClassFields: false` and instance field declarations

**What goes wrong:** If you write `slug = ''` as a class field without a constructor assignment, TypeScript (with `useDefineForClassFields: true`) compiles this to `Object.defineProperty(this, 'slug', ...)`, which runs AFTER `super()` and wipes Lit's reactive property descriptor set up by `static get properties()`. With `useDefineForClassFields: false`, the same declaration compiles to a constructor assignment `this.slug = ''`, which is correct.

**Why it happens:** Phase 33 identified this as Pitfall 1. `tsconfig.browser.json` already has `useDefineForClassFields: false`, so any `.ts` file in `src/components/` compiled by that config is safe.

**How to avoid:** Always declare instance fields explicitly in the constructor (`this.slug = ''`), not just as class field initializers. Adding `: string` type annotations to constructor assignments is fine.

**Warning signs:** `TypeError: Cannot read property 'requestUpdate' of undefined` at runtime, or Lit reactive properties not triggering re-renders.

### Pitfall 2: `static properties = {...}` vs `static get properties() {...}` — both are fine

**What goes wrong:** Planners or implementors may assume all components need to be normalized to one form.

**Why it happens:** The codebase currently has both forms. 3 components use class field syntax; 4 use getter syntax.

**How to avoid:** Keep each component's existing form. Both are compatible with `useDefineForClassFields: false` and Lit reactivity. `static properties = {...}` is a static class field — the `useDefineForClassFields` flag only affects instance fields, not static ones.

### Pitfall 3: zod/mini lacks `.int()`, `.min()`, `.max()` method chains

**What goes wrong:** Writing `z.number().int()` in `zod/mini` fails because `zod/mini` does not include the chained `.int()` method.

**Why it happens:** `zod/mini` deliberately excludes rich validation chains (`.int()`, `.min()`, `.max()`, `.email()`) to reduce bundle size. The classic API chains these as methods; `zod/mini` would require `z.int(z.number())` as a separate call.

**How to avoid:** For the two browser-validated schemas (`OccurrenceRecord`, `SpeciesState`), `.int()` is not needed — the Parquet column validator checks column presence (not type precision), and `SpeciesStateSchema` only uses `z.string()`. When converting other schemas (which may have `.int()` in classic zod), drop `.int()` from the mini version — the int constraint is enforced upstream (DuckDB `INT32` Parquet type) and the runtime validator need not duplicate it.

### Pitfall 4: `parquetMetadata()` takes an ArrayBuffer, not a file object

**What goes wrong:** Passing the `{ byteLength, slice }` file object to `parquetMetadata()` throws `Error: parquet expected ArrayBuffer`.

**Why it happens:** `parquetMetadata(arrayBuffer)` takes the raw `ArrayBuffer` directly. `parquetReadObjects({ file })` takes the `{ byteLength, slice }` file object.

**How to avoid:** After `const ab = await res.arrayBuffer()`, call `parquetMetadata(ab)` directly. Then create `const file = { byteLength: ab.byteLength, slice: (s, e) => ab.slice(s, e) }` for `parquetReadObjects`.

### Pitfall 5: Mixing classic zod and zod/mini imports in one file

**What goes wrong:** `import { z } from 'zod'` and `import * as z from 'zod/mini'` in the same file create two `z` bindings and TypeScript complains about the re-declaration. More seriously, any Vite-bundled import of `import { z } from 'zod'` pulls in full Zod including `ZodError`/`ZodType`.

**Why it happens:** Both classic and mini share the `zod` package name; they're separate entrypoints.

**How to avoid:** Convert all schemas in `schemas.ts` to the `zod/mini` functional API and use a single `import * as z from 'zod/mini'` at the top. Verify with `grep ZodError dist/assets/main*.js` after build (SC-4 gate).

### Pitfall 6: `declare global` without a module boundary

**What goes wrong:** If `src/types/events.ts` has no top-level imports or exports (making it an ambient script), `declare global { interface HTMLElementEventMap {...} }` is still a global augmentation but the file must be explicitly included in `tsconfig.browser.json` — which it already is via `src/types/**/*.ts`. However, `verbatimModuleSyntax: true` requires every file to be a module or explicit ambient declaration. Adding `export {}` or any real export makes it a module.

**How to avoid:** Add `export interface FilterChangeDetail {...}` (a real named export) before the `declare global` block. This makes `events.ts` a module, satisfying `verbatimModuleSyntax: true`, and the `declare global` augmentation works correctly within a module.

### Pitfall 7: noUncheckedIndexedAccess and array element access

**What goes wrong:** `tsconfig.browser.json` sets `noUncheckedIndexedAccess: true`, so `arr[0]` returns `T | undefined` even when `arr.length > 0` is checked above. The component code has many patterns like `this._highResSpecimens[this._currentIndex]` that need nullish handling.

**Why it happens:** `noUncheckedIndexedAccess` is a strict flag that was already causing issues in Phase 34 (fixed via destructuring in test files).

**How to avoid:** Use `this._highResSpecimens[this._currentIndex] ?? this._highResSpecimens[0]!` (the existing JS already does `?? this._highResSpecimens[0]`), or restructure to use `.at()` and conditional narrowing. The existing `_prevSpecimen`/`_nextSpecimen` methods already use the `?? this._highResSpecimens[0]` pattern.

---

## Code Examples

### Hyparquet Column Schema Validation (O(columns))

```typescript
// Source: verified against hyparquet v1.25.6 parquetMetadata API, tested 2026-06-10
import { parquetMetadata, parquetReadObjects } from 'hyparquet';

const EXPECTED_COLUMNS = new Set([
  'species_slug', 'record_type', 'latitude', 'longitude', 'state',
  'county', 'locality', 'elevation_ft', 'year', 'month', 'day',
  'collector', 'collection', 'notes',
]);

// After: const ab = await res.arrayBuffer();
// meta.schema[0] is the root group (name: 'duckdb_schema', no type property)
// meta.schema.slice(1) are the 14 leaf column elements, each with .name: string
const meta = parquetMetadata(ab);
const actualCols = new Set(meta.schema.slice(1).map((el: { name: string }) => el.name));
for (const col of EXPECTED_COLUMNS) {
  if (!actualCols.has(col)) {
    throw new Error(`records.parquet schema mismatch: missing column "${col}"`);
  }
}
```

### zod/mini Functional API vs Classic Chained API

```typescript
// CLASSIC (full zod — NOT for browser components):
import { z } from 'zod';
const s = z.object({
  county: z.string().nullable(),
  year:   z.number().int().nullable(),
});

// MINI (zod/mini — safe for browser bundle):
// Source: verified against node_modules/zod/v4/mini/schemas.js, tested 2026-06-10
import * as z from 'zod/mini';
const s = z.object({
  county: z.nullable(z.string()),
  year:   z.nullable(z.number()),   // no .int() in mini — not needed for structural validation
});

// Both produce identical parse results and z.infer<> types
type S = z.infer<typeof s>;  // { county: string | null; year: number | null }
```

### SC-4 Bundle Grep Verification

```bash
# After npm run build, verify ZodError and ZodType are absent from the client bundle:
# Source: verified — zod/mini does NOT export ZodError or ZodType (only ZodMiniType)
grep -c "ZodError\|ZodType" _site/assets/main-*.js
# Expected output: 0

# Also check the chunk file
grep -c "ZodError\|ZodType" _site/assets/chunk-*.js
# Expected output: 0
```

### SC-4 Gzip Delta Measurement

```bash
# Pre-migration baseline (already built as _site/assets/main-mhZWKs7f.js):
gzip -c _site/assets/main-mhZWKs7f.js | wc -c
# Baseline: 121,833 bytes gzipped

# After migration, rebuild and measure new bundle:
npm run build
gzip -c _site/assets/main-*.js | wc -c
# Compare; document delta in a comment or BUNDLE-DELTA.md
```

### package.json test glob update

```json
"test": "node --test eleventy.config.test.ts scripts/build-data.test.ts ... src/components/*.test.ts 'src/_lib/*.test.{js,ts}'"
```

Change `src/components/*.test.js` → `src/components/*.test.ts` (no brace expansion needed since all files move to `.test.ts`).

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@customElement`/`@property` decorators | `static get properties()` getter + `customElements.define()` | Lit 1→3 transition; TC39 decorators still in flux | No decorators = no transpilation required; compatible with Node 24 type-stripping |
| Full Zod in browser bundles | `zod/mini` entrypoint | Zod 4 (this year) | ~58% smaller Zod module; `ZodError`/`ZodType` not exported by mini |
| `z.string().nullable()` (method chain) | `z.nullable(z.string())` (functional) | Zod 4 `zod/mini` entrypoint | Same parse results; different import path |
| Node 24 type-stripping (no enum/namespace) | Already enforced by `isolatedModules: true` + TS-03 | Phase 33 | No change required; all prior phases already comply |

**Deprecated/outdated:**

- `import { z } from 'zod'` in browser-side code: replaced by `import * as z from 'zod/mini'` for the two runtime-validated schemas. Full classic import still correct for Node-only build scripts.
- `z.number().int()` in zod/mini: not available; drop `.int()` for mini-side schemas (int enforcement lives in DuckDB/Parquet type).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `zod/mini` `z.nullable(z.number())` suffices without `.int()` for the `OccurrenceRecord` schema's integer columns | Pattern 3 | Low: `.int()` is a stronger constraint that would fail on non-integers; removing it makes the mini schema more permissive, not less. DuckDB writes INT32 Parquet, so non-integer values are impossible at write time. |
| A2 | `meta.schema[0]` is always the root group element for DuckDB-written Parquet; `meta.schema.slice(1)` gives exactly the column elements | Pattern 4, Code Examples | Medium: verified against one species file. If DuckDB writes nested group schema elements, the slice(1) would miss them. However, all OccurrenceRecord columns are flat (no nesting), so this is safe for this specific schema. |
| A3 | `src/types/events.ts` being a module (has named exports) is sufficient for `declare global` to work with `verbatimModuleSyntax: true` | Pattern 6 | Low: standard TypeScript behavior; verified in Pitfall 6 analysis. |

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed. (The three items above are low-risk and well-understood.)

---

## Open Questions

1. **D-05 throw behavior in `pnwm-taxon-browser` connectedCallback**
   - What we know: `loadParquet()` throws and callers handle it. `pnwm-taxon-browser.connectedCallback` has a `try { ... } catch (_e) { /* leave empty */ }` that currently swallows errors silently.
   - What's unclear: Should the SCHEMA-08 validator in `pnwm-taxon-browser` throw hard (propagating through the catch, re-throwing) or throw soft (caught by the existing catch, leaving state empty)? D-05 says "throw — reusing loadParquet()'s throw pattern" which implies hard failure, but the existing catch in taxon-browser provides soft degradation.
   - Recommendation: The planner should specify whether to change the catch block to re-throw on schema validation errors. The scientifically-correct behavior per D-05 is to treat a schema mismatch as a hard error (no silently wrong data). This means changing `catch (_e) { }` to `catch (err) { console.error(...); throw err; }` for schema errors — or using a type discriminant to only re-throw `SchemaValidationError` instances.

2. **`_site_baseline/` currency for SC-5 gate**
   - What we know: `_site_baseline/` was captured in Phase 34. The current `_site/` differs from it in HTML (different asset hashes from Phase 36 Eleventy config changes). A fresh pre-Phase-37 baseline is needed.
   - What's unclear: Should the plan capture a new `_site_baseline/` at the start of Phase 37 Wave 0, or use the existing one from Phase 34?
   - Recommendation: Capture a fresh baseline at the start of Phase 37 (before any component conversions), since the current `_site/` already reflects Phase 36 changes. The SC-5 verification then diffs pre-Phase-37 vs post-Phase-37.

---

## Environment Availability

No new external dependencies. All tools already verified in prior phases.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Type-stripping, test runner | ✓ | 24.15.0 | — |
| TypeScript | `npm run typecheck` | ✓ | 6.0.3 | — |
| hyparquet | Parquet column metadata API | ✓ | 1.25.6 | — |
| zod (zod/mini entrypoint) | Runtime validators | ✓ | 4.4.3 | — |
| lit | LitElement base class | ✓ | 3.3.2 | — |
| Vite (via eleventy-plugin-vite) | Bundle build + SC-4 grep | ✓ | 8.0.8 | — |

**Missing dependencies with no fallback:** none
**Missing dependencies with fallback:** none

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` |
| Config file | none — invoked directly via `node --test` |
| Quick run command | `node --test src/components/*.test.ts` |
| Full suite command | `node --test eleventy.config.test.ts scripts/build-data.test.ts scripts/check-page-weight.test.ts scripts/ingest-photos.test.ts scripts/tile-photos.test.ts scripts/upload-tiles.test.ts scripts/generate-species-photos.test.ts 'scripts/lib/*.test.{js,ts}' src/components/*.test.ts 'src/_lib/*.test.{js,ts}'` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MIG-04 | All 10 component `.js` files converted to `.ts`, typecheck passes | static type check | `npm run typecheck` | ✅ tsconfig.browser.json |
| MIG-04 | All 5 component test files converted to `.ts`, pass via `node --test` | unit | `node --test src/components/*.test.ts` | ❌ Wave 0 (rename) |
| MIG-04 | `FilterChangeDetail` interface exists in `src/types/`, dispatch site uses it | static type check | `npm run typecheck` | ❌ Wave 0 (new file) |
| MIG-04 | `HTMLElementEventMap` merge enables typed `addEventListener('pnwm-filter-change', ...)` | static type check | `npm run typecheck` | ❌ Wave 0 (new file) |
| SCHEMA-08 | `loadParquet()` throws on Parquet with missing column | unit | `node --test src/components/parquet-cache.test.ts` | ✅ (needs new test case) |
| SCHEMA-08 | `loadParquet()` succeeds on valid Parquet (regression) | unit | `node --test src/components/parquet-cache.test.ts` | ✅ existing tests pass |
| SCHEMA-08 | `species-states.json` validator throws on bad top-level type | unit | `node --test src/components/pnwm-taxon-browser.test.ts` | ✅ (needs new test case) |
| SCHEMA-08 | `species-states.json` validator throws on bad element shape | unit | `node --test src/components/pnwm-taxon-browser.test.ts` | ✅ (needs new test case) |
| SC-4 | `ZodError`/`ZodType` absent from production bundle | bundle grep | `grep -c "ZodError\|ZodType" _site/assets/main-*.js` | manual (post-build) |
| SC-4 | Gzip delta recorded | measurement | `gzip -c _site/assets/main-*.js \| wc -c` | manual (post-build) |
| SC-5 | Parquet files byte-identical to pre-migration baseline | diff | `diff -r _site_baseline/ _site/ --include="*.parquet"` | ✅ (existing _site_baseline/ pattern) |
| SC-5 | HTML identical modulo content-hashed asset filenames | diff + normalize | custom script or `diff -r` excluding assets/ | manual (post-build) |
| SC-5 | Full test suite passes | unit | Full suite command above | ✅ all 218 existing tests |

### Sampling Rate

- **Per task commit:** `node --test src/components/*.test.ts`
- **Per wave merge:** Full suite command
- **Phase gate:** Full suite green, SC-4 bundle grep clean, SC-5 baseline diff accepted, before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/types/events.ts` — `FilterChangeDetail` interface + `HTMLElementEventMap` merge
- [ ] Rename all `src/components/*.test.js` → `*.test.ts` (import specifiers updated to `.ts`)
- [ ] Fresh `_site_baseline/` snapshot (pre-Phase-37 baseline for SC-5)
- [ ] 2 new test cases in `parquet-cache.test.ts`: validator throws on missing column; succeeds on valid schema
- [ ] 2 new test cases in `pnwm-taxon-browser.test.ts`: validator throws on non-array; throws on bad element shape

---

## Security Domain

Phase 37 involves browser-side data handling. The dynamic fetch boundaries are the primary security surface.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes | `parquetMetadata()` column check + `SpeciesStateSchema.safeParse()` at CDN fetch boundaries |
| V6 Cryptography | no | — |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| CDN cache poisoning / version skew (wrong Parquet schema) | Tampering | `parquetMetadata()` column validator; throw on missing column; no silently wrong data rendered |
| Malformed `species-states.json` (wrong structure) | Tampering | `Array.isArray()` + `SpeciesStateSchema.safeParse(rows[0])`; throw on bad shape |
| XSS via occurrence record data rendered in popup | Tampering | Existing: Lit's `html` template escapes text content; `pnwm-occurrence-popup` already uses this. No change required. |

**Note:** The CDN is bunny.net object storage, not a user-controlled surface. The threat is CDN version skew (stale file after a schema migration) rather than active injection. The validators exist to surface schema drift, not to defend against adversarial input.

---

## Sources

### Primary (HIGH confidence)

- hyparquet v1.25.6 — `parquetMetadata(ab)` API verified by running against production Parquet file; `meta.schema.slice(1)` structure confirmed. [VERIFIED: tested locally]
- zod 4.4.3 `zod/mini` entrypoint — functional API (`z.nullable(z.string())`) verified; `z.infer<>` works; `safeParse()` error structure (`.issues[].path/message`) compatible with `verify-parquet.ts`. [VERIFIED: tested locally]
- `@lit/reactive-element` types (`PropertyDeclarations`, `PropertyValues`) — verified at `node_modules/@lit/reactive-element/reactive-element.d.ts` line 143. [VERIFIED: local node_modules]
- `tsconfig.browser.json` — `useDefineForClassFields: false`, `experimentalDecorators: true`, `verbatimModuleSyntax: true`, `isolatedModules: true`, `noUncheckedIndexedAccess: true`. [VERIFIED: local file]
- SC-4 baseline: `main-mhZWKs7f.js` at 391,256 bytes (121,833 gzipped); no Zod in current bundle confirmed. [VERIFIED: local filesystem]
- Test count: 218 tests pass currently (63 component tests, 155 in other areas). [VERIFIED: `node --test` run]

### Secondary (MEDIUM confidence)

- `declare global { interface HTMLElementEventMap {...} }` pattern for CustomEvent typing — standard TypeScript module augmentation; the `export` makes the file a module enabling `declare global`. [CITED: TypeScript docs on declaration merging / module augmentation]
- `static properties = {...}` class field syntax vs `static get properties()` — both valid; `useDefineForClassFields` only affects instance fields. [ASSUMED: based on JS spec and TypeScript compilation model, consistent with verified behavior in existing code]

### Tertiary (LOW confidence)

- None. All critical claims were verified locally.

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all packages already installed and in use
- Architecture: HIGH — all patterns verified against actual source files and hyparquet/zod APIs
- Pitfalls: HIGH — all from prior phase experience (Phases 33–36) or verified by direct API inspection
- D-02 resolution (refactor-in-place to zod/mini): HIGH — API compatibility and full-file migration verified

**Research date:** 2026-06-10
**Valid until:** 2026-07-10 (stable stack; only risk is hyparquet API change)
