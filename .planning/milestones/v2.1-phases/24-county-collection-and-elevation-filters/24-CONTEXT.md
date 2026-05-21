# Phase 24: County, Collection, and Elevation Filters - Context

**Gathered:** 2026-05-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend `pnwm-filter-bar.js` with three new controls: county dropdown, collection dropdown, and elevation range slider (feet). Extend `filterRecords()` in `parquet-cache.js` to apply all three new filter dimensions. No template changes needed — `species.njk` already forwards the `pnwm-filter-change` event detail to both the occurrence map and phenology chart via their `filters` property.

</domain>

<decisions>
## Implementation Decisions

### Elevation Range Slider
- **D-01:** Elevation slider bounds are **fixed at 0–15,000 ft** for all species. No dynamic min/max calculation from Parquet data.
- **D-02:** Default state: `_elevationMin = 0`, `_elevationMax = 15000`. "Clear filters" resets to these defaults.
- **D-03:** Follow the existing year-range pattern: two separate `<input type="range">` sliders (min and max handles), labeled "Elevation: X – Y ft".

### County and Collection Dropdowns
- **D-04:** Null/empty county and collection values are **silently excluded** from dropdown options. Records missing county or collection will still appear when "All counties" / "All collections" is selected.
- **D-05:** Dropdown options populated from distinct values in the already-loaded Parquet data (same `connectedCallback()` load as state/record_type — no second Parquet fetch).
- **D-06:** Options sorted alphabetically (same as existing `_states` / `_recordTypes` sort).

### Filter Event Extension
- **D-07:** `_dispatchFilterChange()` adds four keys to the existing event detail: `county`, `collection`, `elevationMin`, `elevationMax`. Receiving components pass the whole detail object to `filterRecords()` — no template or wiring changes.

### filterRecords() Extension
- **D-08:** Add four condition checks to `filterRecords()` in `parquet-cache.js`: county (string match, skip if `'all'`), collection (string match, skip if `'all'`), elevationMin (numeric, same null-passthrough pattern as yearMin), elevationMax (numeric, same pattern as yearMax). Records with null `elevation_ft` pass through when fixed bounds (0–15,000) are active, matching the year-range null behavior.

### Claude's Discretion
- Step size for elevation sliders (suggest 100 ft given the 0–15,000 range).
- Label text for "no filter selected" state (e.g., "All counties", "All collections").
- Whether to use a screen-reader-only `<label>` for each elevation handle, matching the year range's `class="sr-only"` pattern.
- Tests for the new `filterRecords()` filter dimensions (county, collection, elevationMin/Max) in `filters.test.js`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Component to Modify
- `src/components/pnwm-filter-bar.js` — The only Lit component that needs new controls. Add county/collection state properties, populate from Parquet in `connectedCallback()`, add slider state properties, extend `_dispatchFilterChange()` and `_onClearFilters()`, extend `render()`.
- `src/components/parquet-cache.js` — `filterRecords()` (lines 41–50): add county, collection, elevationMin, elevationMax condition checks. Update JSDoc comment.

### Supporting Components (read-only context)
- `src/components/pnwm-occurrence-map.js` — Already has `filters` property; passes `filters` to `filterRecords()`. No changes expected.
- `src/components/pnwm-phenology-chart.js` — Already has `filters` property; passes `filters` to `filterRecords()`. No changes expected.
- `src/components/filters.test.js` — Existing filter tests to extend with county/collection/elevation cases.

### Template (reference only — no changes expected)
- `src/species/species.njk` (lines 98–106) — `pnwm-filter-change` event listener already forwards `e.detail` to map and chart. No changes needed.

### Data Schema
- `scripts/build-data.js` (lines 89–133) — Parquet schema defines `county` (VARCHAR), `collection` (VARCHAR), `elevation_ft` (INTEGER).

### Project Context
- `.planning/REQUIREMENTS.md` — FILT-01, FILT-02, FILT-03, FILT-04 requirements for this phase.
- `.planning/PROJECT.md` — Key Decisions table; especially: "Parquet + hyparquet for client-side occurrence data" and "Lit for client-side components — light DOM required for Leaflet; CSS custom properties unavailable in Canvas 2D" (Canvas constraint does NOT apply here — filter bar is HTML/CSS, not canvas).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `pnwm-filter-bar.js` `connectedCallback()` — Already loads Parquet and extracts distinct values. Extend with `county` and `collection` extraction (same `Set` → sorted array pattern as `_states` / `_recordTypes`).
- `pnwm-filter-bar.js` `_dispatchFilterChange()` — Single dispatch point; add new keys here. All handlers call this, so all new filters fire automatically.
- `pnwm-filter-bar.js` `_onClearFilters()` — Reset all new properties here alongside existing resets.
- `parquet-cache.js` `filterRecords()` — Four-condition function; append four more conditions (county, collection, elevationMin, elevationMax) following the exact same null-guard pattern as yearMin/yearMax.

### Established Patterns
- **Dropdown pattern**: `_state` / `_recordType` → `const valuesSet = new Set(); for (const r of records) { if (r.field) valuesSet.add(r.field); } this._values = [...valuesSet].sort();` — replicate for county and collection.
- **Year range slider pattern**: Two `<input type="range">` with `min`, `max`, `step`, `.value=${String(val)}`, `@input=${handler}`. Replicate for elevation with `min="0"`, `max="15000"`, `step="100"`.
- **filterRecords null guard**: `if (filters.yearMin != null && r.year < filters.yearMin) return false;` — same pattern for elevation.
- **Lit shadow DOM with CSS custom properties**: `var(--pico-primary)` etc. work in this context (HTML/CSS, not Canvas).

### Integration Points
- `pnwm-filter-change` event detail object is the sole integration surface. New keys (`county`, `collection`, `elevationMin`, `elevationMax`) are forwarded unchanged to map and chart via existing `species.njk` listener.
- `filterRecords()` is the sole filtering function; both map and chart call it. Extending it here updates both visualizations.

</code_context>

<specifics>
## Specific Ideas

- Elevation bounds 0–15,000 ft chosen for simplicity; missing elevation data will be filled in via [pnwinsects/pnwmoths#25](https://github.com/pnwinsects/pnwmoths/issues/25).
- Null county/collection records are excluded from dropdowns because the data gap will be addressed upstream (issue #25), not by a "(none)" filter option.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

### Reviewed Todos (not folded)
- **Fix close button on the lightbox** (2026-04-23) — already resolved in Phase 23 (PHOTO-03). No action needed.

</deferred>

---

*Phase: 24-county-collection-and-elevation-filters*
*Context gathered: 2026-05-20*
