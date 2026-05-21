# Phase 24: County, Collection, and Elevation Filters - Pattern Map

**Mapped:** 2026-05-20
**Files analyzed:** 3 (all modifications — no new files)
**Analogs found:** 3 / 3 (all are self-analogs: each file extends its own existing patterns)

---

## File Classification

| Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------|------|-----------|----------------|---------------|
| `src/components/pnwm-filter-bar.js` | component | event-driven | `src/components/pnwm-filter-bar.js` (existing state/year patterns within the same file) | exact |
| `src/components/parquet-cache.js` | service / utility | transform | `src/components/parquet-cache.js` (existing `filterRecords()` condition block) | exact |
| `src/components/filters.test.js` | test | — | `src/components/filters.test.js` (existing `describe` block and fixture records) | exact |

---

## Pattern Assignments

### `src/components/pnwm-filter-bar.js` (component, event-driven)

**Analog:** same file — replicate four distinct internal patterns.

---

#### Pattern A: Reactive property declarations (lines 7–17)

Copy the existing `static get properties()` block and add six new entries — two dropdown selections, two elevation bounds, and two option-list arrays:

```javascript
// Existing (lines 7–17) — copy this shape
static get properties() {
  return {
    slug: { type: String },
    _state:       { type: String, state: true },
    _recordType:  { type: String, state: true },
    _yearMin:     { type: Number, state: true },
    _yearMax:     { type: Number, state: true },
    _states:      { attribute: false, state: true },
    _recordTypes: { attribute: false, state: true },
  };
}
```

Add inside the same return object:

```javascript
_county:       { type: String, state: true },
_collection:   { type: String, state: true },
_elevationMin: { type: Number, state: true },
_elevationMax: { type: Number, state: true },
_counties:     { attribute: false, state: true },
_collections:  { attribute: false, state: true },
```

---

#### Pattern B: Constructor initialization (lines 55–64)

Copy the existing `constructor()` assignments for the new properties:

```javascript
// Existing (lines 55–64)
constructor() {
  super();
  this.slug = '';
  this._state = 'all';
  this._recordType = 'all';
  this._yearMin = 1900;
  this._yearMax = CURRENT_YEAR;
  this._states = [];
  this._recordTypes = [];
}
```

Add alongside existing assignments:

```javascript
this._county = 'all';
this._collection = 'all';
this._elevationMin = 0;       // D-02
this._elevationMax = 15000;   // D-02
this._counties = [];
this._collections = [];
```

---

#### Pattern C: `connectedCallback()` distinct-value extraction (lines 66–83)

The existing Set-population loop is the direct model. Extend the **same `for` loop** — do not add a second pass:

```javascript
// Existing (lines 66–83)
async connectedCallback() {
  super.connectedCallback();
  if (this.slug) {
    try {
      const records = await loadParquet(this.slug);
      const statesSet = new Set();
      const typesSet = new Set();
      for (const r of records) {
        if (r.state)       statesSet.add(r.state);
        if (r.record_type) typesSet.add(r.record_type);
      }
      this._states = [...statesSet].sort();
      this._recordTypes = [...typesSet].sort();
    } catch (err) {
      // Leave empty on error — controls still render with "All" options
    }
  }
}
```

Extend the same `for` loop body and add two sorted assignments after the existing two:

```javascript
const countiesSet     = new Set();
const collectionsSet  = new Set();
// inside the existing for loop:
if (r.county)     countiesSet.add(r.county);       // D-04: null/empty silently excluded
if (r.collection) collectionsSet.add(r.collection);
// after the loop:
this._counties     = [...countiesSet].sort();       // D-06
this._collections  = [...collectionsSet].sort();
```

---

#### Pattern D: Event handlers for dropdowns (lines 98–106)

```javascript
// Existing dropdown handler shape (lines 98–101)
_onStateChange(e) {
  this._state = e.target.value;
  this._dispatchFilterChange();
}
```

Replicate for county and collection:

```javascript
_onCountyChange(e) {
  this._county = e.target.value;
  this._dispatchFilterChange();
}

_onCollectionChange(e) {
  this._collection = e.target.value;
  this._dispatchFilterChange();
}
```

---

#### Pattern E: Event handlers for range sliders (lines 108–118)

```javascript
// Existing year-min handler (lines 108–112) — clamps against the opposite bound
_onYearMinChange(e) {
  const val = Number(e.target.value);
  this._yearMin = Math.min(val, this._yearMax);
  this._dispatchFilterChange();
}

_onYearMaxChange(e) {
  const val = Number(e.target.value);
  this._yearMax = Math.max(val, this._yearMin);
  this._dispatchFilterChange();
}
```

Replicate for elevation (same clamp logic, different property names):

```javascript
_onElevationMinChange(e) {
  const val = Number(e.target.value);
  this._elevationMin = Math.min(val, this._elevationMax);
  this._dispatchFilterChange();
}

_onElevationMaxChange(e) {
  const val = Number(e.target.value);
  this._elevationMax = Math.max(val, this._elevationMin);
  this._dispatchFilterChange();
}
```

---

#### Pattern F: `_dispatchFilterChange()` — extend detail object (lines 85–96)

```javascript
// Existing (lines 85–96)
_dispatchFilterChange() {
  this.dispatchEvent(new CustomEvent('pnwm-filter-change', {
    bubbles: true,
    composed: true,         // REQUIRED — crosses shadow DOM boundary
    detail: {
      state: this._state,
      recordType: this._recordType,
      yearMin: this._yearMin,
      yearMax: this._yearMax,
    },
  }));
}
```

Add four keys to the `detail` object (D-07). Do NOT create a second dispatch:

```javascript
detail: {
  state:        this._state,
  recordType:   this._recordType,
  yearMin:      this._yearMin,
  yearMax:      this._yearMax,
  county:       this._county,        // new
  collection:   this._collection,    // new
  elevationMin: this._elevationMin,  // new
  elevationMax: this._elevationMax,  // new
},
```

---

#### Pattern G: `_onClearFilters()` reset (lines 120–127)

```javascript
// Existing (lines 120–127)
_onClearFilters(e) {
  e.preventDefault();
  this._state = 'all';
  this._recordType = 'all';
  this._yearMin = 1900;
  this._yearMax = CURRENT_YEAR;
  this._dispatchFilterChange();
}
```

Add four reset assignments before the dispatch call (D-02):

```javascript
this._county       = 'all';
this._collection   = 'all';
this._elevationMin = 0;
this._elevationMax = 15000;
```

---

#### Pattern H: `render()` — dropdown control (lines 132–154)

```javascript
// Existing state dropdown (lines 132–142)
<div class="filter-group">
  <label for="filter-state-${this.slug}">State</label>
  <select
    id="filter-state-${this.slug}"
    .value=${this._state}
    @change=${this._onStateChange}
  >
    <option value="all">All states</option>
    ${this._states.map(s => html`<option value=${s} ?selected=${this._state === s}>${s}</option>`)}
  </select>
</div>
```

Replicate for county and collection, substituting:
- `filter-state` → `filter-county` / `filter-collection`
- `State` → `County` / `Collection`
- `.value=${this._state}` → `.value=${this._county}` / `.value=${this._collection}`
- `@change=${this._onStateChange}` → `@change=${this._onCountyChange}` / `@change=${this._onCollectionChange}`
- `All states` → `All counties` / `All collections`
- `this._states.map(...)` → `this._counties.map(...)` / `this._collections.map(...)`

---

#### Pattern I: `render()` — range slider control (lines 156–180)

```javascript
// Existing year-range slider group (lines 156–180)
<div class="filter-group year-range">
  <label>Year range: ${this._yearMin} &ndash; ${this._yearMax}</label>
  <div class="year-range-inputs">
    <label for="filter-year-min-${this.slug}" class="sr-only">Minimum year</label>
    <input
      type="range"
      id="filter-year-min-${this.slug}"
      min="1900"
      max=${CURRENT_YEAR}
      step="1"
      .value=${String(this._yearMin)}
      @input=${this._onYearMinChange}
    >
    <label for="filter-year-max-${this.slug}" class="sr-only">Maximum year</label>
    <input
      type="range"
      id="filter-year-max-${this.slug}"
      min="1900"
      max=${CURRENT_YEAR}
      step="1"
      .value=${String(this._yearMax)}
      @input=${this._onYearMaxChange}
    >
  </div>
</div>
```

Replicate for elevation, substituting (D-01, D-03):
- Container class: `year-range` → `elevation-range` (or reuse `year-range` — discretion)
- Label text: `Year range: ${...} – ${...}` → `Elevation: ${this._elevationMin} – ${this._elevationMax} ft`
- `id` prefixes: `filter-year-min` → `filter-elevation-min`, `filter-year-max` → `filter-elevation-max`
- sr-only labels: `Minimum year` → `Minimum elevation (ft)`, `Maximum year` → `Maximum elevation (ft)`
- `min="1900"` → `min="0"`, `max=${CURRENT_YEAR}` → `max="15000"`, `step="1"` → `step="100"`
- `.value=${String(this._yearMin)}` → `.value=${String(this._elevationMin)}` (string coercion is mandatory — see Pitfall 2)
- Handlers: `_onYearMinChange` / `_onYearMaxChange` → `_onElevationMinChange` / `_onElevationMaxChange`

---

### `src/components/parquet-cache.js` (utility, transform)

**Analog:** same file — extend the existing `filterRecords()` condition block.

**JSDoc to update (lines 39–43):**

```javascript
// Existing JSDoc
/**
 * Filter records by state, record type, and year range.
 * @param {Array} records
 * @param {{ state?: string, recordType?: string, yearMin?: number, yearMax?: number }} filters
 * @returns {Array} filtered records
 */
```

Update description and `@param` typedef to include the four new filter keys:

```javascript
/**
 * Filter records by state, record type, year range, county, collection, and elevation range.
 * @param {Array} records
 * @param {{ state?: string, recordType?: string, yearMin?: number, yearMax?: number,
 *           county?: string, collection?: string, elevationMin?: number, elevationMax?: number }} filters
 * @returns {Array} filtered records
 */
```

**Existing condition block to extend (lines 44–52):**

```javascript
// Existing (lines 44–52)
export function filterRecords(records, filters) {
  return records.filter(r => {
    if (filters.state && filters.state !== 'all' && r.state !== filters.state) return false;
    if (filters.recordType && filters.recordType !== 'all' && r.record_type !== filters.recordType) return false;
    if (filters.yearMin != null && r.year < filters.yearMin) return false;
    if (filters.yearMax != null && r.year > filters.yearMax) return false;
    return true;
  });
}
```

Append four conditions before `return true` (D-08). Note the difference in guard style:
- Dropdowns use a truthy + `!== 'all'` guard (matching state/recordType lines)
- Elevation uses `!= null` guard on the filter value itself (matching yearMin/yearMax lines)

```javascript
if (filters.county     && filters.county     !== 'all' && r.county      !== filters.county)     return false;
if (filters.collection && filters.collection !== 'all' && r.collection  !== filters.collection) return false;
if (filters.elevationMin != null && r.elevation_ft < filters.elevationMin) return false;
if (filters.elevationMax != null && r.elevation_ft > filters.elevationMax) return false;
```

---

### `src/components/filters.test.js` (test)

**Analog:** same file — extend the existing `describe('filterRecords edge cases', ...)` block.

**Existing fixture and describe-block structure (lines 1–69):**

```javascript
// Lines 1–4: imports
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { filterRecords } from './parquet-cache.js';

// Lines 5–14: existing fixture
describe('filterRecords edge cases', () => {
  const records = [
    { state: 'WA', record_type: 'specimen',   year: 2010 },
    { state: 'OR', record_type: 'photograph', year: 2005 },
    ...
  ];
  // ... existing it() cases ...
});
```

Add a new `describe` block (or additional `it()` calls inside the existing block) with its own fixture that includes `county`, `collection`, and `elevation_ft` fields. The existing fixture records lack these fields and should not be modified.

New fixture to use for new test cases:

```javascript
const geoRecords = [
  { county: 'King',    collection: 'UW',  elevation_ft: 100  },
  { county: 'Pierce',  collection: 'PSU', elevation_ft: 500  },
  { county: 'King',    collection: 'UW',  elevation_ft: 2000 },
  { county: null,      collection: null,  elevation_ft: null },
  { county: 'Whatcom', collection: 'UW',  elevation_ft: 5000 },
];
```

Test cases to add (mirroring the style of existing `it()` assertions at lines 16–68):

```javascript
it('filters by county', () => {
  const result = filterRecords(geoRecords, { county: 'King' });
  assert.equal(result.length, 2);
});

it('county "all" returns all records', () => {
  const result = filterRecords(geoRecords, { county: 'all' });
  assert.equal(result.length, geoRecords.length);
});

it('null county record included when county is "all"', () => {
  const result = filterRecords(geoRecords, { county: 'all' });
  assert.ok(result.some(r => r.county === null));
});

it('filters by collection', () => {
  const result = filterRecords(geoRecords, { collection: 'UW' });
  assert.equal(result.length, 3);
});

it('collection "all" returns all records', () => {
  const result = filterRecords(geoRecords, { collection: 'all' });
  assert.equal(result.length, geoRecords.length);
});

it('filters by elevationMin', () => {
  // 500, 2000, 5000 pass; 100 excluded; null coerces to 0 so 0 < 500 → excluded
  const result = filterRecords(geoRecords, { elevationMin: 500 });
  assert.ok(result.every(r => r.elevation_ft === null || r.elevation_ft >= 500));
});

it('filters by elevationMax', () => {
  // 100, 500 pass; 2000, 5000 excluded; null coerces to 0 so 0 <= 1000 → included
  const result = filterRecords(geoRecords, { elevationMax: 1000 });
  assert.ok(result.every(r => r.elevation_ft === null || r.elevation_ft <= 1000));
});

it('elevation range excludes out-of-range', () => {
  const result = filterRecords(geoRecords, { elevationMin: 200, elevationMax: 3000 });
  // 500 and 2000 pass; 100 and 5000 excluded; null excluded (0 < 200)
  assert.equal(result.length, 2);
  assert.ok(result.every(r => r.elevation_ft >= 200 && r.elevation_ft <= 3000));
});

it('null elevation_ft passes through at default bounds (0, 15000)', () => {
  const result = filterRecords(geoRecords, { elevationMin: 0, elevationMax: 15000 });
  // null < 0 → false; null > 15000 → false; null record passes
  assert.ok(result.some(r => r.elevation_ft === null));
});

it('combined county + collection + elevation', () => {
  const result = filterRecords(geoRecords, {
    county: 'King', collection: 'UW', elevationMin: 0, elevationMax: 500,
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].elevation_ft, 100);
});
```

---

## Shared Patterns

### Lit `state: true` reactive property declaration
**Source:** `src/components/pnwm-filter-bar.js` lines 7–17
**Apply to:** All new reactive properties in `pnwm-filter-bar.js`

Internal filter-state properties use `{ type: T, state: true }`. Array option-list properties use `{ attribute: false, state: true }`. The `state: true` flag prevents the value from being reflected as an attribute while still triggering re-renders.

### `?selected` binding on `<option>` elements
**Source:** `src/components/pnwm-filter-bar.js` lines 140, 152
**Apply to:** County and collection dropdown `<option>` elements

```javascript
${this._counties.map(c => html`<option value=${c} ?selected=${this._county === c}>${c}</option>`)}
```

### `.value=${String(val)}` on `<input type="range">`
**Source:** `src/components/pnwm-filter-bar.js` lines 166, 176
**Apply to:** Both elevation range inputs

Must coerce to string. Using a number directly causes incorrect slider positioning in some browsers. Copy exactly: `.value=${String(this._elevationMin)}`.

### `sr-only` label for each range handle
**Source:** `src/components/pnwm-filter-bar.js` lines 159, 169
**Apply to:** Elevation min and max `<input type="range">` elements

```html
<label for="filter-elevation-min-${this.slug}" class="sr-only">Minimum elevation (ft)</label>
```

### `bubbles: true, composed: true` on CustomEvent
**Source:** `src/components/pnwm-filter-bar.js` lines 87–88
**Apply to:** Do not duplicate; extend the existing `_dispatchFilterChange()` only

`composed: true` is required for the event to cross the shadow DOM boundary and reach `species.njk`'s `document.addEventListener`. There must be exactly one dispatch point.

---

## No Analog Found

None. All three files being modified already contain the exact patterns to replicate. No new patterns are needed beyond those present in the files themselves.

---

## Key Pitfall Notes for Planner

1. **Null elevation_ft at default bounds:** At defaults (elevationMin=0, elevationMax=15000), `null < 0` is `false` and `null > 15000` is `false` in JavaScript — null records pass through correctly. Do NOT add a `!= null` guard on the record's `elevation_ft` field itself.

2. **String coercion on `.value`:** `.value=${String(this._elevationMin)}` not `.value=${this._elevationMin}`.

3. **Single loop in `connectedCallback()`:** County and collection Sets are populated in the existing `for (const r of records)` loop, not in a second loop.

4. **No `species.njk` changes:** The event forwarding in `species.njk` passes `e.detail` wholesale to `map.filters` and `chart.filters`. New keys in the detail object are automatically forwarded.

---

## Metadata

**Analog search scope:** `src/components/` (all three modified files are self-analogs)
**Files scanned:** 3 (pnwm-filter-bar.js, parquet-cache.js, filters.test.js)
**Pattern extraction date:** 2026-05-20
