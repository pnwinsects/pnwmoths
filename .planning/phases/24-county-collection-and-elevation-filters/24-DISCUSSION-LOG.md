# Phase 24: County, Collection, and Elevation Filters - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-20
**Phase:** 24-county-collection-and-elevation-filters
**Areas discussed:** Elevation slider bounds, Null county/collection

---

## Elevation Slider Bounds

| Option | Description | Selected |
|--------|-------------|----------|
| Dynamic — data range | Slider min = lowest elevation_ft in species' records; max = highest. Tight, useful range per species. | |
| Fixed — 0–15,000 ft | Same bounds for every species. Simpler, consistent. | ✓ |
| Let Claude decide | Claude picks the better option based on data and existing patterns. | |

**User's choice:** Fixed — 0–15,000 ft
**Notes:** No additional context provided. Simpler implementation chosen.

---

## Null County/Collection

| Option | Description | Selected |
|--------|-------------|----------|
| Skip — exclude from dropdown | Null county/collection records don't appear as a filter option. Still visible when "All" is selected. | ✓ |
| Include as '(none)' | Null values appear as a selectable option for users who want to filter explicitly for unattributed records. | |

**User's choice:** Skip — exclude from dropdown
**Notes:** User noted: "missing data will get filled in in https://github.com/pnwinsects/pnwmoths/issues/25". The data gap will be addressed upstream, making a "(none)" filter option unnecessary.

---

## Claude's Discretion

- Step size for elevation range sliders (suggest 100 ft given 0–15,000 range)
- Screen-reader label pattern for elevation handles (mirror year range's `class="sr-only"`)
- Test coverage for new `filterRecords()` dimensions in `filters.test.js`

## Deferred Ideas

None — discussion stayed within phase scope.
