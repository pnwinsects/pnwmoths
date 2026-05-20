# Phase 24: County, Collection, and Elevation Filters - Research

**Researched:** 2026-05-20
**Domain:** Lit web components, client-side Parquet filtering, HTML range inputs
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Elevation slider bounds are fixed at 0–15,000 ft for all species. No dynamic min/max calculation from Parquet data.
- **D-02:** Default state: `_elevationMin = 0`, `_elevationMax = 15000`. "Clear filters" resets to these defaults.
- **D-03:** Follow the existing year-range pattern: two separate `<input type="range">` sliders (min and max handles), labeled "Elevation: X – Y ft".
- **D-04:** Null/empty county and collection values are silently excluded from dropdown options. Records missing county or collection still appear when "All counties" / "All collections" is selected.
- **D-05:** Dropdown options populated from distinct values in the already-loaded Parquet data (same `connectedCallback()` load as state/record_type — no second Parquet fetch).
- **D-06:** Options sorted alphabetically (same as existing `_states` / `_recordTypes` sort).
- **D-07:** `_dispatchFilterChange()` adds four keys to the existing event detail: `county`, `collection`, `elevationMin`, `elevationMax`. Receiving components pass the whole detail object to `filterRecords()` — no template or wiring changes.
- **D-08:** Add four condition checks to `filterRecords()` in `parquet-cache.js`: county (string match, skip if `'all'`), collection (string match, skip if `'all'`), elevationMin (numeric, same null-passthrough pattern as yearMin), elevationMax (numeric, same pattern as yearMax). Records with null `elevation_ft` pass through when fixed bounds (0–15,000) are active, matching the year-range null behavior.

### Claude's Discretion

- Step size for elevation sliders (suggest 100 ft given the 0–15,000 range).
- Label text for "no filter selected" state (e.g., "All counties", "All collections").
- Whether to use a screen-reader-only `<label>` for each elevation handle, matching the year range's `class="sr-only"` pattern.
- Tests for the new `filterRecords()` filter dimensions (county, collection, elevationMin/Max) in `filters.test.js`.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FILT-01 | User can filter occurrence records by county using a dropdown populated from the species' data | County values extracted from Parquet in `connectedCallback()` via Set → sorted array pattern (identical to existing `_states` / `_recordTypes`). Parquet schema defines `county` as VARCHAR. |
| FILT-02 | User can filter occurrence records by collection using a dropdown populated from the species' data | Collection values extracted from Parquet via same Set → sorted array pattern. Parquet schema defines `collection` as VARCHAR. |
| FILT-03 | User can filter occurrence records by elevation range using a min/max slider (feet) | Two `<input type="range">` sliders (min=0, max=15000, step=100) following exact year-range pattern already in the component. |
| FILT-04 | County, collection, and elevation filters update the map and phenology chart in real time | `_dispatchFilterChange()` emits `pnwm-filter-change`; `species.njk` already forwards `e.detail` to map and chart via `map.filters = e.detail` / `chart.filters = e.detail`. No wiring changes needed. |
</phase_requirements>

---

## Summary

Phase 24 is a pure extension of existing patterns. The codebase already has a complete, working filter pipeline: `pnwm-filter-bar.js` extracts distinct values from Parquet, renders controls, dispatches `pnwm-filter-change`, and `species.njk` forwards the event detail to both the map and the phenology chart. The `filterRecords()` function in `parquet-cache.js` applies conditions guard-checked with `!=  null` / `!== 'all'` checks.

This phase adds three new filter dimensions — county dropdown, collection dropdown, and elevation range slider — by replicating the exact patterns already present for state/record-type dropdowns and year-range sliders respectively. The only files that change are `pnwm-filter-bar.js` and `parquet-cache.js`, plus tests in `filters.test.js`.

The Parquet data schema already includes `county` (VARCHAR), `collection` (VARCHAR), and `elevation_ft` (INTEGER) columns, confirmed in `scripts/build-data.js` lines 89–136. No data pipeline changes are needed.

**Primary recommendation:** Clone the state/record-type dropdown pattern for county and collection; clone the year-range slider pattern for elevation with fixed bounds 0–15,000 and step 100.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Dropdown option population | Browser / Client (`pnwm-filter-bar.js`) | — | Already-loaded Parquet data drives option lists; no server round-trip |
| Filter state management | Browser / Client (`pnwm-filter-bar.js`) | — | Component internal state (`_county`, `_collection`, `_elevationMin`, `_elevationMax`) |
| Filter dispatch | Browser / Client (`pnwm-filter-bar.js`) | — | `pnwm-filter-change` custom event, bubbling and composed |
| Record filtering | Browser / Client (`parquet-cache.js`) | — | `filterRecords()` called by map and chart in response to the event |
| Event routing | Browser / Client (`species.njk` inline script) | — | Already wires `e.detail` to `map.filters` and `chart.filters`; no changes |

---

## Standard Stack

This phase installs **no new packages**. All dependencies are already present.

### In-Use Libraries (no changes)

| Library | Current Version | Role |
|---------|----------------|------|
| `lit` | ^3.3.2 | Reactive Lit web component (`pnwm-filter-bar`) |
| `hyparquet` | ^1.25.6 | Parquet file reading in the browser |
| Node.js built-in test runner | v24 (Node 24) | Unit tests via `node --test` |

### Package Legitimacy Audit

No new packages are installed in this phase. Audit not applicable.

---

## Architecture Patterns

### System Architecture Diagram

```
User interaction (slider drag / dropdown select)
        |
        v
pnwm-filter-bar.js
  - _onCountyChange / _onCollectionChange / _onElevationMinChange / _onElevationMaxChange
  - updates internal Lit state
  - calls _dispatchFilterChange()
        |
        | CustomEvent('pnwm-filter-change', { detail: { state, recordType, yearMin, yearMax,
        |                                               county, collection, elevationMin, elevationMax } })
        v
species.njk inline script
  - document.addEventListener('pnwm-filter-change', e => {
      map.filters = e.detail;
      chart.filters = e.detail;
    })
        |
        +---> pnwm-occurrence-map.js
        |       - calls filterRecords(allRecords, filters)
        |       - re-renders Leaflet map pins
        |
        +---> pnwm-phenology-chart.js
                - calls filterRecords(allRecords, filters)
                - re-renders Chart.js phenology bars
```

### Recommended Project Structure

No structural changes. All modifications are within existing files:

```
src/components/
├── pnwm-filter-bar.js     # MODIFY — add county/collection dropdowns, elevation sliders
├── parquet-cache.js       # MODIFY — extend filterRecords() with 4 new conditions
└── filters.test.js        # MODIFY — add test cases for new filter dimensions
```

### Pattern 1: Dropdown Population from Parquet (existing — replicate)

**What:** In `connectedCallback()`, iterate loaded records, collect distinct non-null values into a Set, sort, assign to reactive property.

**When to use:** For county and collection, exactly as done for `_states` and `_recordTypes`.

**Example (existing code from `pnwm-filter-bar.js`):**
```javascript
// Source: src/components/pnwm-filter-bar.js connectedCallback()
const statesSet = new Set();
const typesSet = new Set();
for (const r of records) {
  if (r.state) statesSet.add(r.state);
  if (r.record_type) typesSet.add(r.record_type);
}
this._states = [...statesSet].sort();
this._recordTypes = [...typesSet].sort();
```

**Replication for county/collection:**
```javascript
// Add to the same loop — no second Parquet fetch (D-05)
const countiesSet = new Set();
const collectionsSet = new Set();
for (const r of records) {
  if (r.county) countiesSet.add(r.county);       // null/empty silently excluded (D-04)
  if (r.collection) collectionsSet.add(r.collection);
}
this._counties = [...countiesSet].sort();         // alphabetical sort (D-06)
this._collections = [...collectionsSet].sort();
```

### Pattern 2: Year-Range Slider (existing — replicate for elevation)

**What:** Two `<input type="range">` elements with sr-only labels, `.value=${String(val)}` binding, `@input` handler that clamps min/max against each other.

**When to use:** Elevation slider — fixed bounds 0–15,000 ft, step 100.

**Example (existing code from `pnwm-filter-bar.js`):**
```html
<!-- Source: src/components/pnwm-filter-bar.js render() -->
<div class="filter-group year-range">
  <label>Year range: ${this._yearMin} &ndash; ${this._yearMax}</label>
  <div class="year-range-inputs">
    <label for="filter-year-min-${this.slug}" class="sr-only">Minimum year</label>
    <input type="range" id="filter-year-min-${this.slug}"
      min="1900" max=${CURRENT_YEAR} step="1"
      .value=${String(this._yearMin)}
      @input=${this._onYearMinChange}>
    <label for="filter-year-max-${this.slug}" class="sr-only">Maximum year</label>
    <input type="range" id="filter-year-max-${this.slug}"
      min="1900" max=${CURRENT_YEAR} step="1"
      .value=${String(this._yearMax)}
      @input=${this._onYearMaxChange}>
  </div>
</div>
```

**Elevation replication:**
- Container class: reuse `year-range` / `year-range-inputs` CSS classes or add `elevation-range`
- Label: `Elevation: ${this._elevationMin} – ${this._elevationMax} ft`
- `min="0"`, `max="15000"`, `step="100"` (D-01, D-03, discretion)
- Handler clamping: same `Math.min` / `Math.max` guard as year handlers

### Pattern 3: filterRecords() Condition Block (existing — replicate)

**What:** Guard-checked conditions that return `false` to exclude a record.

**Example (existing code from `parquet-cache.js`):**
```javascript
// Source: src/components/parquet-cache.js filterRecords()
if (filters.state && filters.state !== 'all' && r.state !== filters.state) return false;
if (filters.recordType && filters.recordType !== 'all' && r.record_type !== filters.recordType) return false;
if (filters.yearMin != null && r.year < filters.yearMin) return false;
if (filters.yearMax != null && r.year > filters.yearMax) return false;
```

**New conditions to append (D-08):**
```javascript
if (filters.county && filters.county !== 'all' && r.county !== filters.county) return false;
if (filters.collection && filters.collection !== 'all' && r.collection !== filters.collection) return false;
if (filters.elevationMin != null && r.elevation_ft < filters.elevationMin) return false;
if (filters.elevationMax != null && r.elevation_ft > filters.elevationMax) return false;
```

Note: `elevation_ft` is INTEGER in the Parquet schema. Null `elevation_ft` records pass through elevation filters when bounds are at defaults (0, 15000) because `null < 0` is `false` and `null > 15000` is `false` in JavaScript — matching the year null behavior described in D-08. [VERIFIED: observed directly in filters.test.js comment and existing null-guard pattern]

### Pattern 4: _dispatchFilterChange() Extension

**What:** Add new keys to the event detail object — all handlers share one dispatch point.

**Current detail keys:** `state`, `recordType`, `yearMin`, `yearMax`

**Add (D-07):** `county`, `collection`, `elevationMin`, `elevationMax`

```javascript
_dispatchFilterChange() {
  this.dispatchEvent(new CustomEvent('pnwm-filter-change', {
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

### Pattern 5: Lit Reactive Properties Declaration

**What:** New filter state properties must be declared in `static get properties()` with `state: true` to trigger re-renders.

**Replication:**
```javascript
_county:      { type: String, state: true },
_collection:  { type: String, state: true },
_elevationMin: { type: Number, state: true },
_elevationMax: { type: Number, state: true },
_counties:    { attribute: false, state: true },
_collections: { attribute: false, state: true },
```

And initialized in `constructor()`:
```javascript
this._county = 'all';
this._collection = 'all';
this._elevationMin = 0;       // D-02
this._elevationMax = 15000;   // D-02
this._counties = [];
this._collections = [];
```

### Pattern 6: _onClearFilters() Reset

**What:** Reset all new properties alongside existing resets.

```javascript
_onClearFilters(e) {
  e.preventDefault();
  this._state = 'all';
  this._recordType = 'all';
  this._yearMin = 1900;
  this._yearMax = CURRENT_YEAR;
  this._county = 'all';          // new
  this._collection = 'all';     // new
  this._elevationMin = 0;       // new (D-02)
  this._elevationMax = 15000;   // new (D-02)
  this._dispatchFilterChange();
}
```

### Anti-Patterns to Avoid

- **Second Parquet fetch:** County/collection must be extracted from the records already loaded in `connectedCallback()` — not from a separate fetch. D-05 locks this.
- **Dynamic elevation bounds:** Do NOT calculate min/max elevation from Parquet data at load time. D-01 locks bounds at 0–15,000 ft unconditionally.
- **Template wiring changes:** Do NOT modify `species.njk` or the map/chart components. The event detail forwarding already handles unknown keys transparently.
- **Separate loop over records:** Extract county and collection inside the existing `for (const r of records)` loop alongside state and record_type — not in a second pass.
- **Numeric `.value` binding on range inputs:** Must use `.value=${String(val)}` (string coercion), not `.value=${val}`. The existing year-range sliders show the correct pattern — Lit's `.value` property binding requires a string for `<input>` elements.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Distinct value extraction | Custom deduplication logic | `Set` + spread + `.sort()` | Already proven pattern in codebase; one line |
| Filter state routing | Custom pub/sub or store | `pnwm-filter-change` CustomEvent | Already wired in `species.njk`; map and chart already consume it |
| Elevation clamp logic | Complex range collision logic | `Math.min(val, this._elevationMax)` / `Math.max(val, this._elevationMin)` | Exact same 1-liner as year clamp |

---

## Common Pitfalls

### Pitfall 1: Null elevation_ft and filter bounds

**What goes wrong:** When elevationMin is 0 and elevationMax is 15000 (defaults), records with `null` elevation_ft should pass through. The condition `null < 0` evaluates to `false` in JavaScript (null coerces to 0, and 0 < 0 is false), and `null > 15000` also evaluates to `false`. So at defaults, null records are included — correct behavior per D-08.

**Why it happens:** JavaScript numeric coercion of null to 0. Contrast: if a user dragged elevationMin above 0, say to 500, then `null < 500` → `0 < 500` → `true` → record excluded. This matches the intent (missing elevation data drops out under active filter).

**How to avoid:** Implement exactly as D-08 prescribes — the `!= null` guard is for `yearMin`/`yearMax` (where null means "no filter set"). For elevation, the fixed bounds are always set; no `!= null` guard is needed on the filter values themselves. The null behavior on the record side is correct as-is.

**Warning signs:** Tests with `elevation_ft: null` records unexpectedly filtered out at default bounds, or unexpectedly included when user has selected a non-zero minimum.

### Pitfall 2: String .value binding on range inputs

**What goes wrong:** Writing `.value=${this._elevationMin}` (number) instead of `.value=${String(this._elevationMin)}`. Lit's `.value` property setter on `<input>` elements receives the value directly; if it receives a number, the DOM `value` attribute may not update correctly in all browsers.

**Why it happens:** JavaScript's loose typing makes number/string interchangeable in most contexts, but Lit's property binding distinguishes.

**How to avoid:** Follow the existing year-range pattern exactly: `.value=${String(this._yearMin)}`.

**Warning signs:** Slider handle snaps to wrong position on initial render or after clearing filters.

### Pitfall 3: Forgetting composed: true on the custom event

**What goes wrong:** If `composed: false`, the event does not cross shadow DOM boundaries and `species.njk`'s `document.addEventListener` never fires.

**Why it happens:** Lit components render into shadow DOM. The existing `_dispatchFilterChange()` already has `composed: true` — new dispatch is handled by extending the same method, not adding a new one.

**How to avoid:** Extend `_dispatchFilterChange()` only; never add a second dispatch point.

### Pitfall 4: Extracting distinct values before records are loaded

**What goes wrong:** If `connectedCallback()` has an error path that leaves records undefined, the Set population loop would throw.

**Why it happens:** The `try/catch` in `connectedCallback()` swallows errors and leaves `_counties` / `_collections` as `[]` — the "All" option renders alone, which is correct graceful degradation.

**How to avoid:** Populate Sets inside the `try` block, after the `await loadParquet()` call, exactly as the existing state/record_type extraction is placed.

---

## Code Examples

### Complete filterRecords() Extension

```javascript
// Source: src/components/parquet-cache.js — extended version
export function filterRecords(records, filters) {
  return records.filter(r => {
    if (filters.state && filters.state !== 'all' && r.state !== filters.state) return false;
    if (filters.recordType && filters.recordType !== 'all' && r.record_type !== filters.recordType) return false;
    if (filters.yearMin != null && r.year < filters.yearMin) return false;
    if (filters.yearMax != null && r.year > filters.yearMax) return false;
    // New conditions:
    if (filters.county && filters.county !== 'all' && r.county !== filters.county) return false;
    if (filters.collection && filters.collection !== 'all' && r.collection !== filters.collection) return false;
    if (filters.elevationMin != null && r.elevation_ft < filters.elevationMin) return false;
    if (filters.elevationMax != null && r.elevation_ft > filters.elevationMax) return false;
    return true;
  });
}
```

### Test Cases to Add in filters.test.js

```javascript
// Extend existing describe('filterRecords edge cases', () => { ... })
// or add a new describe block for the new dimensions.

const recordsWithGeo = [
  { county: 'King', collection: 'UW', elevation_ft: 100 },
  { county: 'Pierce', collection: 'PSU', elevation_ft: 500 },
  { county: 'King', collection: 'UW', elevation_ft: 2000 },
  { county: null, collection: null, elevation_ft: null },
  { county: 'Whatcom', collection: 'UW', elevation_ft: 5000 },
];

it('filters by county', () => { /* county: 'King' → 2 records */ });
it('county "all" returns all records', () => { /* county: 'all' → 5 */ });
it('filters by collection', () => { /* collection: 'UW' → 3 records */ });
it('filters by elevationMin', () => { /* elevationMin: 500 → records with 500, 2000, 5000, null */ });
it('filters by elevationMax', () => { /* elevationMax: 1000 → records with 100, 500, null */ });
it('elevation range excludes out-of-range', () => { /* min:200, max:3000 → 500, 2000 */ });
it('null elevation_ft passes through at default bounds (0, 15000)', () => { /* null passes */ });
it('null county record included when county is "all"', () => { /* null county included */ });
it('combined county + collection + elevation', () => { /* King + UW + min:0 max:500 → 1 */ });
```

---

## State of the Art

| Old Approach | Current Approach | Notes |
|--------------|------------------|-------|
| — | Parquet-driven dynamic dropdown options | This codebase's pattern since Phase 22 |
| — | Two range inputs for min/max (not a dual-handle range widget) | Matches existing year range; avoids third-party slider dependency |

No deprecated patterns apply to this phase — it is a pure extension of current patterns.

---

## Assumptions Log

All claims in this research were verified by reading the canonical source files directly. No assumed claims.

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| — | — | — | — |

---

## Open Questions

None. All design decisions are locked in CONTEXT.md, and the existing code patterns are fully verified.

---

## Environment Availability

Step 2.6: SKIPPED — this phase modifies only existing JS source files. No new external tools, services, runtimes, databases, or CLI utilities are required.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner (`node:test`) |
| Config file | none — test files passed explicitly on CLI |
| Quick run command | `node --test src/components/filters.test.js` |
| Full suite command | `node --test src/components/filters.test.js src/components/parquet-cache.test.js` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FILT-01 | `filterRecords()` with `county: 'King'` excludes non-King records | unit | `node --test src/components/filters.test.js` | Wave 0 — add cases |
| FILT-01 | `county: 'all'` returns all records regardless of county | unit | `node --test src/components/filters.test.js` | Wave 0 — add cases |
| FILT-02 | `filterRecords()` with `collection: 'UW'` excludes non-UW records | unit | `node --test src/components/filters.test.js` | Wave 0 — add cases |
| FILT-02 | `collection: 'all'` returns all records | unit | `node --test src/components/filters.test.js` | Wave 0 — add cases |
| FILT-03 | `filterRecords()` with `elevationMin: 500` excludes records below 500 ft | unit | `node --test src/components/filters.test.js` | Wave 0 — add cases |
| FILT-03 | `filterRecords()` with `elevationMax: 1000` excludes records above 1000 ft | unit | `node --test src/components/filters.test.js` | Wave 0 — add cases |
| FILT-03 | Null `elevation_ft` passes through at default bounds (0, 15000) | unit | `node --test src/components/filters.test.js` | Wave 0 — add cases |
| FILT-04 | Combined county + collection + elevation range filter | unit | `node --test src/components/filters.test.js` | Wave 0 — add cases |
| FILT-04 | Event detail includes county, collection, elevationMin, elevationMax keys | manual / visual | — | manual |

### Sampling Rate

- **Per task commit:** `node --test src/components/filters.test.js`
- **Per wave merge:** `node --test src/components/filters.test.js src/components/parquet-cache.test.js`
- **Phase gate:** Full component test suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/components/filters.test.js` — add county, collection, and elevation test cases (file exists; extend existing describe block or add new block)

*(No new test files needed — `filters.test.js` already exists and uses `node:test`.)*

---

## Security Domain

This phase adds HTML form controls (dropdowns and range sliders) to a Lit web component. No authentication, sessions, cryptography, or server-side data handling is involved. All filtering is client-side, operating on already-downloaded Parquet data.

### Applicable ASVS Categories

| ASVS Category | Applies | Notes |
|---------------|---------|-------|
| V2 Authentication | no | No auth changes |
| V3 Session Management | no | No session changes |
| V4 Access Control | no | Public species data |
| V5 Input Validation | yes (low risk) | User input drives client-side filter only; no server exposure. String comparison against Parquet values is safe. |
| V6 Cryptography | no | No cryptography |

**Threat patterns:**

- County/collection values displayed in dropdown options come from the Parquet data, not from user text input typed directly — no XSS risk from user-controlled strings entering the DOM.
- Elevation slider values are numeric (`Number(e.target.value)`) bounded by `min=0 max=15000` at the HTML level — no injection risk.

---

## Sources

### Primary (HIGH confidence)

- `src/components/pnwm-filter-bar.js` — full source read; all existing patterns verified directly
- `src/components/parquet-cache.js` — full source read; `filterRecords()` lines 44–52 verified
- `src/components/filters.test.js` — full source read; existing test structure and null behavior verified
- `scripts/build-data.js` lines 89–136 — Parquet schema verified (`county` VARCHAR, `collection` VARCHAR, `elevation_ft` INTEGER)
- `src/species/species.njk` lines 98–106 — event wiring verified; `e.detail` forwarded to map and chart

### Secondary (MEDIUM confidence)

- `.planning/phases/24-county-collection-and-elevation-filters/24-CONTEXT.md` — all design decisions locked

### Tertiary (LOW confidence)

None.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all tools confirmed in `package.json` and source files
- Architecture: HIGH — patterns read directly from production source files
- Pitfalls: HIGH — derived from JavaScript specification (null coercion) and direct code reading
- Test plan: HIGH — test framework and existing test file confirmed by running `node --test src/components/filters.test.js` (7 tests, all pass)

**Research date:** 2026-05-20
**Valid until:** Stable — source files are the ground truth; valid until those files change
