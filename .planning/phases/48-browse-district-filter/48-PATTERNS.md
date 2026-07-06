# Phase 48: Browse District Filter - Pattern Map

**Mapped:** 2026-07-05
**Files analyzed:** 7
**Analogs found:** 7 / 7

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|---------------|
| `scripts/emit-species-districts.ts` | build script (emitter) | batch/transform | `scripts/emit-species-audit.ts` (structure) + `scripts/emit-species-states.ts` (DuckDB query shape) | role-match (hybrid) |
| `scripts/emit-species-districts.test.ts` | test | batch/transform | `scripts/emit-species-audit.test.ts` | exact (structural sibling) |
| `data/mt-county-allowlist.csv` | config (data) | file-I/O | `data/withheld-families.csv` | exact |
| loader for allowlist (new fn, likely in the emitter or a small `src/_lib/*.ts`) | utility | file-I/O | `src/_lib/withheld-families.ts` `loadWithheldFamilies` | exact |
| `src/components/pnwm-taxon-browser.ts` (modified) | component (Lit) | request-response (fetch) + event-driven (UI) | itself — extend existing state-filter code in the same file | exact (self-extension) |
| `src/components/pnwm-taxon-browser.test.ts` (modified) | test | event-driven | itself — extend existing `buildStateMap`/`taxonHasState` test blocks | exact (self-extension) |
| `src/types/schemas.ts` (modified) | model/schema | transform | `SpeciesStateSchema` (same file, lines 105-112) | exact |
| `package.json` (modified) | config | batch | existing `build:species-states` / `build:records-district-audit` script wiring | exact |

## Pattern Assignments

### `scripts/emit-species-districts.ts` (build script, batch/transform)

**Analogs:** `scripts/emit-species-audit.ts` (structure/testability) + `scripts/emit-species-states.ts` (DuckDB query/output shape)

Per RESEARCH.md's explicit recommendation: copy `emit-species-states.ts`'s DuckDB connect/query/write mechanics, but structure the file like `emit-species-audit.ts` — pure exported builder functions + a thin `main()` — NOT `emit-species-states.ts`'s untested all-inline style.

**Imports pattern** (from `emit-species-audit.ts` lines 12-17):
```typescript
import { DuckDBInstance } from '@duckdb/node-api';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'csv-parse/sync';
import { loadWithheldFamilies, isWithheldOrUnclassified } from '../src/_lib/withheld-families.ts';
```
Substitute a new `loadMtCountyAllowlist()` import (mirroring `loadWithheldFamilies`) in place of the withheld-families import — see the `data/mt-county-allowlist.csv` section below.

**DuckDB read_csv columns map — copy verbatim** (`scripts/emit-species-states.ts` lines 12-34, also duplicated in `emit-species-audit.ts` lines 134-154):
```typescript
await conn.run(`
  CREATE TABLE records AS
  SELECT * FROM read_csv('data/records.csv',
    header = true,
    columns = {
      'species_slug': 'VARCHAR',
      'record_type': 'VARCHAR',
      'latitude': 'DOUBLE',
      'longitude': 'DOUBLE',
      'state': 'VARCHAR',
      'county': 'VARCHAR',
      'locality': 'VARCHAR',
      'elevation_ft': 'INTEGER',
      'year': 'INTEGER',
      'month': 'INTEGER',
      'day': 'INTEGER',
      'collector': 'VARCHAR',
      'collection': 'VARCHAR',
      'notes': 'VARCHAR',
      'district_id': 'VARCHAR'
    }
  )
`);
```
Pitfall 4 (RESEARCH.md): this map MUST list all 15 columns or the query throws — copy, don't retype.

**DISTINCT query pattern** (`emit-species-states.ts` lines 36-41, adapted):
```typescript
const result = await conn.runAndReadAll(`
  SELECT DISTINCT species_slug, state, county
  FROM records
  WHERE state IS NOT NULL AND state != ''
    AND county IS NOT NULL AND county != ''
  ORDER BY species_slug, state, county
`);
const rows = result.getRowObjectsJS() as Record<string, unknown>[];
```

**Pure builder function to write (new, per Pattern 3 in RESEARCH.md, structured like `buildSpeciesAuditRows` in `emit-species-audit.ts` lines 68-92):**
```typescript
export interface SpeciesDistrictRow { species_slug: string; state: string; county: string }

export function filterToPnwAllowlist(
  rows: SpeciesDistrictRow[],
  pnwStates: Set<string>,
  mtAllowlist: Set<string>,
): SpeciesDistrictRow[] {
  return rows.filter(r => {
    if (!pnwStates.has(r.state)) return false;
    if (r.state === 'MT') return mtAllowlist.has(r.county);
    return true;
  });
}
```
This is directly quoted from RESEARCH.md Pattern 3 (already vetted) — implement it exactly as the exported, zero-I/O, unit-testable function.

**Output/write pattern** (`emit-species-states.ts` lines 44-49):
```typescript
const outPath = resolve('_site/species-districts.json');
mkdirSync(resolve('_site'), { recursive: true });
writeFileSync(outPath, JSON.stringify(rows));
console.log(`Wrote ${rows.length} species-district pairs to _site/species-districts.json`);
```

**CLI-guard pattern** (`emit-species-states.ts` lines 52-57, identical in `emit-species-audit.ts` lines 199-204):
```typescript
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error((err as Error).message);
    process.exit(1);
  });
}
```

---

### `scripts/emit-species-districts.test.ts` (test)

**Analog:** `scripts/emit-species-audit.test.ts` — not fully read here (not needed; the sibling `emit-species-audit.ts` production file's exported function shapes are the contract to test). Follow the same `node:test`/`node:assert/strict` style visible in `pnwm-taxon-browser.test.ts` (imports below), targeting the new exported pure functions (`filterToPnwAllowlist`, and any row-builder equivalent to `buildSpeciesAuditRows`).

**Import/describe/it pattern** (`pnwm-taxon-browser.test.ts` lines 1-9, same idiom used throughout the test suite):
```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { filterToPnwAllowlist } from './emit-species-districts.ts';

describe('filterToPnwAllowlist', () => {
  it('drops AB rows regardless of county', () => {
    const rows = [{ species_slug: 'a', state: 'AB', county: 'Somewhere' }];
    assert.deepEqual(filterToPnwAllowlist(rows, new Set(['BC','WA','OR','ID','MT']), new Set()), []);
  });
  it('keeps MT rows only when county is allow-listed', () => {
    const rows = [
      { species_slug: 'a', state: 'MT', county: 'Missoula' },
      { species_slug: 'b', state: 'MT', county: 'Custer' }, // eastern MT, excluded
    ];
    const result = filterToPnwAllowlist(rows, new Set(['MT']), new Set(['Missoula']));
    assert.deepEqual(result, [rows[0]]);
  });
});
```
Cross-state collision test fixtures (Pitfall 3) should include at least two states sharing a county name (e.g. "Lincoln" in WA and MT) to prove the compound key downstream, even though that assertion mostly belongs in `pnwm-taxon-browser.test.ts`'s `buildDistrictMap`/`taxonHasDistrict` tests.

**Must be added explicitly to `package.json`'s `"test"` script's file list** — unlike `src/components/*.test.ts` (glob-matched already), `scripts/*.test.ts` files are NOT globbed; every existing `scripts/*.test.ts` is listed by exact name (see `package.json` line 39). `emit-species-districts.test.ts` needs its own explicit entry.

---

### `data/mt-county-allowlist.csv` (config/data, file-I/O)

**Analog:** `data/withheld-families.csv` (not read directly, but its loader `src/_lib/withheld-families.ts` documents the exact shape/contract) — one value per row, header row, curator-editable.

Expected shape (mirroring the "one bare value per row" precedent implied by `loadWithheldFamilies`'s `{ family: string }` row shape):
```csv
county
Flathead
Granite
Lake
Lincoln
Mineral
Missoula
Powell
Ravalli
Sanders
Silver Bow
```

**Loader pattern — copy `loadWithheldFamilies` almost verbatim** (`src/_lib/withheld-families.ts` lines 1-39):
```typescript
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'csv-parse/sync';

const DEFAULT_CSV_PATH = resolve('data/mt-county-allowlist.csv');

export function loadMtCountyAllowlist(csvPath: string = DEFAULT_CSV_PATH): Set<string> {
  if (!existsSync(csvPath)) {
    console.warn(`[mt-county-allowlist] ${csvPath} not found — no MT counties selectable (build continues)`);
    return new Set<string>();
  }
  const rows = parse(
    readFileSync(csvPath),
    { columns: true, skip_empty_lines: true }
  ) as Array<{ county: string }>;
  return new Set<string>(rows.map(r => (r.county ?? '').trim()).filter(c => c.length > 0));
}
```
Note: unlike `isWithheld`'s case-insensitive lowercasing (families), county names here should almost certainly preserve case exactly since they're compared/displayed verbatim against `data/records.csv`'s `county` column (no case-folding elsewhere in the state-filter precedent) — do NOT `.toLowerCase()` this set, keep exact-match semantics against the DuckDB `county` values.

Where this loader function lives (new tiny `src/_lib/mt-county-allowlist.ts` vs inlined in the emitter script) is a planner discretion call; `withheld-families.ts` is a standalone `src/_lib/*.ts` module reused by 3 call sites, but this new allowlist likely has only one call site (the emitter) — inlining as a private function in `emit-species-districts.ts` is also consistent with house style if no second consumer exists.

---

### `src/components/pnwm-taxon-browser.ts` (modified — component, request-response fetch + event-driven UI)

**Analog:** itself — the existing state-filter code in the same file is the direct template to generalize (RESEARCH.md Pattern 1/2, UI-SPEC.md's markup contract).

**Constant to add, parallel to `STATE_NAMES`** (lines 4-10) — no districtNAMES map needed; district labels are computed, not looked up (see `districtLabel` below). Do add the PNW allow-list derivation per D-05/Pitfall 1:
```typescript
// Pitfall 1 fix: filter _statesAvailable to STATE_NAMES' keys (drops AB, which has no entry)
this._statesAvailable = [...new Set(rows.map(r => r.state))]
  .filter(s => s in STATE_NAMES)
  .sort();
```
This line replaces the existing line 142 (`this._statesAvailable = [...new Set(rows.map(r => r.state))].sort();`) — the single most important behavioral diff for D-05.

**Schema validator to add, parallel to `validateSpeciesStates`** (lines 34-46):
```typescript
export function validateSpeciesDistricts(rows: unknown): asserts rows is SpeciesDistrict[] {
  if (!Array.isArray(rows)) {
    throw new SchemaValidationError('species-districts.json: expected array at top level');
  }
  if (rows.length > 0) {
    const probe = SpeciesDistrictSchema.safeParse(rows[0]);
    if (!probe.success) {
      throw new SchemaValidationError(
        `species-districts.json: element shape mismatch: ${probe.error.issues.map((i: { message: string }) => i.message).join('; ')}`
      );
    }
  }
}
```

**Map-builder + predicate, parallel to `buildStateMap`/`taxonHasState`** (lines 48-68) — copy RESEARCH.md's Pattern 1 verbatim (already vetted against Pitfall 3's compound-key requirement):
```typescript
export function buildDistrictMap(rows: SpeciesDistrict[]): Record<string, Set<string>> {
  const map: Record<string, Set<string>> = {};
  for (const { species_slug, state, county } of rows) {
    if (!map[species_slug]) map[species_slug] = new Set();
    map[species_slug]!.add(`${state}:${county}`);
  }
  return map;
}

export function taxonHasDistrict(
  slugs: string[],
  districtMap: Record<string, Set<string>>,
  selectedState: string,
  selectedCounty: string,
): boolean {
  if (!selectedCounty) return true;
  const key = `${selectedState}:${selectedCounty}`;
  return slugs.some(slug => districtMap[slug]?.has(key));
}
```

**State-scoped option-list pure fn, new (RESEARCH.md Pattern 2):**
```typescript
export function districtsForState(rows: SpeciesDistrict[], state: string): string[] {
  const set = new Set(rows.filter(r => r.state === state).map(r => r.county));
  return [...set].sort();
}
```

**Dynamic label pure fn, new (RESEARCH.md Code Examples, BFILT-04):**
```typescript
export function districtLabel(selectedState: string): string {
  return selectedState === 'BC' ? 'Regional District' : 'County';
}
```

**`connectedCallback` extension pattern** (lines 123-151) — add a second try/fetch block, mirroring the existing one at lines 135-150:
```typescript
try {
  const res = await fetch(`${this._prefix}species-districts.json`);
  const rows: unknown = await res.json();
  validateSpeciesDistricts(rows);
  this._districtRows = rows; // keep raw rows for districtsForState() recompute on state change
  this._districtMap = buildDistrictMap(rows);
} catch (err) {
  if (err instanceof SchemaValidationError) throw err;
  // soft-degrade: leave districtMap empty, select stays disabled
}
```

**`_onStateChange` extension — Pitfall 5 fix (D-02: atomic reset)** (existing handler at lines 175-177):
```typescript
_onStateChange(e: Event): void {
  this._selectedState = (e.target as HTMLSelectElement).value;
  this._selectedDistrict = ''; // D-02: MUST reset in the same handler invocation
}

_onDistrictChange(e: Event): void {
  this._selectedDistrict = (e.target as HTMLSelectElement).value;
}
```

**`_mutedStyle` extension** (existing at lines 260-265) — generalize to check district when selected, else fall back to state-only (D-02):
```typescript
_mutedStyle(slugs: string[]): string {
  if (this._selectedDistrict) {
    return taxonHasDistrict(slugs, this._districtMap, this._selectedState, this._selectedDistrict)
      ? '' : 'opacity:0.35';
  }
  if (!this._selectedState) return '';
  return taxonHasState(slugs, this._stateMap, this._selectedState) ? '' : 'opacity:0.35';
}
```

**Markup — copy the exact contract from UI-SPEC.md** (already fully specified, lines 98-113 of `48-UI-SPEC.md`), inserted as a third flex child in the existing `.pnwm-tb-toolbar` div (lines 372-396 of `pnwm-taxon-browser.ts`), immediately after the existing state-filter `<div>` (lines 381-395):
```html
<div style="display:flex;align-items:baseline;gap:0.5em">
  <label for="pnwm-tb-district-filter">${districtLabel(this._selectedState)}</label>
  <select
    id="pnwm-tb-district-filter"
    style="width:auto"
    .value=${this._selectedDistrict}
    ?disabled=${!this._selectedState}
    @change=${this._onDistrictChange}
  >
    <option value="">${this._selectedState === 'BC' ? 'All regional districts' : this._selectedState ? 'All counties' : 'Select a state first'}</option>
    ${this._districtsAvailable.map(d =>
      html`<option value=${d} ?selected=${this._selectedDistrict === d}>${d}</option>`
    )}
  </select>
</div>
```
Note the disabled condition is `!this._selectedState` — NOT `!this._districtsAvailable.length` (a different trigger than the state select's own `?disabled` condition at line 387). `_districtsAvailable` must be recomputed whenever `_selectedState` changes (either in `_onStateChange` via `districtsForState(this._districtRows, newState)`, or as a Lit `willUpdate`/getter — planner's call, but it MUST happen synchronously with the state reset per Pitfall 5).

---

### `src/components/pnwm-taxon-browser.test.ts` (modified — test)

**Analog:** itself — `describe('buildStateMap', ...)` / `describe('taxonHasState', ...)` blocks (lines 6-67) are the direct template for `describe('buildDistrictMap', ...)` / `describe('taxonHasDistrict', ...)`. Also add `describe('districtsForState', ...)`, `describe('districtLabel', ...)`, and a new `describe('_statesAvailable PNW filtering', ...)`-style test proving AB is excluded (Pitfall 1's own stated warning-sign: "a test that only checks `STATE_NAMES['AB']` is undefined without checking `_statesAvailable` doesn't contain `'AB'`" — write the latter).

**Cross-state collision test (Pitfall 3) — required, not optional:**
```typescript
describe('taxonHasDistrict', () => {
  const districtMap = buildDistrictMap([
    { species_slug: 'a', state: 'WA', county: 'Lincoln' },
    { species_slug: 'b', state: 'MT', county: 'Lincoln' },
  ]);
  it('does not conflate same-named counties across states', () => {
    assert.equal(taxonHasDistrict(['b'], districtMap, 'WA', 'Lincoln'), false);
    assert.equal(taxonHasDistrict(['a'], districtMap, 'WA', 'Lincoln'), true);
  });
});
```
This test file is already glob-matched by `package.json`'s `test` script (`src/components/*.test.ts`) — no `package.json` change needed for this file specifically.

---

### `src/types/schemas.ts` (modified — model/schema)

**Analog:** `SpeciesStateSchema` (same file, lines 105-112) — exact structural precedent, one field added.

**Pattern to copy verbatim, extended:**
```typescript
// --- SpeciesDistrict ---
// One element of the species-districts.json flat array
// Validated at browser load time (Phase 48) as an array of these
export const SpeciesDistrictSchema = z.object({
  species_slug: z.string(),
  state:        z.string(),
  county:       z.string(),
});
export type SpeciesDistrict = z.infer<typeof SpeciesDistrictSchema>;
```
Place immediately after `SpeciesStateSchema`/`SpeciesState` (after line 112) to keep the two sibling schemas adjacent, matching this file's existing convention of grouping related schemas with a `--- Name ---` comment banner (see banners at lines 8, 35, 51, 61, 87, 105, 114).

---

### `package.json` (modified — config)

**Analog:** the existing `build:species-states` / `build:records-district-audit` wiring (lines 19-22 in the read excerpt above).

**Pattern — add a new script entry, then wire it into `build:site`'s chain:**
```json
"build:species-districts": "node scripts/emit-species-districts.ts",
```
Insert alongside `build:species-states` (line 19) and `build:records-district-audit` (line 21). Then add `&& npm run build:species-districts` to the `build:site` chain (line 22), immediately after `npm run build:species-states` (both consume the same `data/records.csv`, so ordering relative to each other doesn't matter, but both must run after `build:data`/`build:copy-parquet` per the existing chain's ordering).

**Test-list pattern — `scripts/*.test.ts` are NOT auto-globbed** (unlike `src/components/*.test.ts`, `src/_lib/*.test.ts`, `src/_data/*.test.ts` which use glob patterns at the end of the `"test"` string, line 39): every existing `scripts/*.test.ts` file (e.g. `scripts/emit-species-audit.test.ts`, `scripts/emit-records-district-audit.test.ts`) is listed explicitly by name. Add `scripts/emit-species-districts.test.ts` explicitly to this same list — forgetting this means the new test file silently never runs in CI/`npm test`.

## Shared Patterns

### DuckDB `read_csv` typed columns map (Pitfall 4)
**Source:** `scripts/emit-species-states.ts` lines 12-34 (identical copy also in `scripts/emit-species-audit.ts` lines 134-154)
**Apply to:** `scripts/emit-species-districts.ts` — copy verbatim, do not retype; must list all 15 `data/records.csv` columns or DuckDB throws.

### Pure-builder-then-thin-CLI script structure
**Source:** `scripts/emit-species-audit.ts` (whole-file structure: exported interfaces + pure functions first, `main()`/CLI-guard last)
**Apply to:** `scripts/emit-species-districts.ts` — this is the current (post-Phase-47) house style; do NOT copy `emit-species-states.ts`'s untested all-inline style even though its DuckDB query shape is reused.

### Committed curator-editable CSV + defensive loader
**Source:** `src/_lib/withheld-families.ts` (whole file) — `existsSync` guard + warn-and-empty-Set fallback, `csv-parse/sync` with `{ columns: true, skip_empty_lines: true }`
**Apply to:** `data/mt-county-allowlist.csv`'s loader — same defensive shape, but do NOT lowercase-fold county names (case must match `data/records.csv`'s `county` column exactly, unlike family names which are intentionally case-folded).

### O(1) probe-one-element schema validator + hard-fail/soft-degrade split
**Source:** `src/components/pnwm-taxon-browser.ts` lines 19-46 (`SchemaValidationError` class + `validateSpeciesStates`)
**Apply to:** new `validateSpeciesDistricts` — identical shape, reusing the same `SchemaValidationError` class (do not create a second error class); `connectedCallback`'s catch block re-throws `SchemaValidationError` (hard-fail) but swallows plain fetch/network errors (soft-degrade), for both the states and districts fetches.

### `<select>` markup contract (Pico CSS, light-DOM, `width:auto`)
**Source:** `src/components/pnwm-taxon-browser.ts` lines 381-395 (existing state filter); exact copy target specified in `48-UI-SPEC.md` lines 96-119
**Apply to:** new district `<select>` — `style="width:auto"` is REQUIRED (prevents Pico classless-mode full-width stretch); disabled condition is `!this._selectedState`, distinct from the state filter's own `!this._statesAvailable.length` disabled condition — do not conflate the two.

### Atomic dual-state reset in event handlers (Pitfall 5)
**Source:** new pattern, no existing precedent (state filter has only one piece of reactive state) — but the general Lit convention of always assigning a *new* Set/value (never mutating) for change detection is visible throughout `_toggleFamily`/`_toggleSubfamily`/`_toggleGenus` (`pnwm-taxon-browser.ts` lines 182-204).
**Apply to:** `_onStateChange` must set both `_selectedState` and `_selectedDistrict = ''` in the same handler invocation (D-02); `_districtsAvailable` must be recomputed synchronously (either inline in the handler via `districtsForState(...)`, or via a Lit lifecycle hook) so no stale `<option>`-less value is ever selected.

## No Analog Found

None. Every file in this phase's scope has a direct, already-merged precedent in this codebase (confirmed by RESEARCH.md's own "Key insight" and independently verified above by reading each analog file directly).

## Metadata

**Analog search scope:** `scripts/`, `src/components/`, `src/_lib/`, `src/types/`, `data/`, `package.json` (root)
**Files scanned/read directly for this pattern map:** `scripts/emit-species-states.ts`, `scripts/emit-species-audit.ts`, `src/_lib/withheld-families.ts`, `src/components/pnwm-taxon-browser.ts`, `src/components/pnwm-taxon-browser.test.ts` (partial), `src/types/schemas.ts`, `package.json` (scripts block)
**Pattern extraction date:** 2026-07-05
