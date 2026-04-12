# Phase 4: Search, Glossary, and Validation - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 4 delivers three capabilities:
1. **Static search** — Pagefind indexes all species pages after build; search results page renders client-side with no server.
2. **Glossary page** — Single alphabetized page rendered from flat-file data.
3. **Post-build validators** — Link checker, page weight check, and data integrity validator run as part of the build pipeline.

This phase does NOT add new interactive components, modify species factsheet behavior, or change the Eleventy data pipeline beyond what's needed for search indexing and glossary rendering.

</domain>

<decisions>
## Implementation Decisions

### Glossary Data Source
- **D-01:** Glossary terms stored in `data/glossary.csv` — consistent with `data/species.csv`, `data/images.csv` flat-file pattern.
- **D-02:** Columns: `term`, `definition`, `image_filename`, `photographer`. `image_filename` and `photographer` are nullable (most terms have an image, but not all).
- **D-03:** Single image per term — no separate glossary-images.csv needed. Build query sorts terms alphabetically at build time via DuckDB.
- **D-04:** Image files for glossary terms follow the existing `images/` directory pattern; tracked via Git LFS.

### Search UI
- **D-05:** Use Pagefind's built-in UI widget — drop `<link>` + `<script>` tags and `<div id="search">` into `src/search/index.njk`. No custom Pagefind JS API wrapper needed.
- **D-06:** Style Pagefind UI via CSS custom properties (`--pagefind-ui-*`) to match Pico CSS palette. Do NOT exclude Pagefind's default stylesheet — override selectively.
- **D-07:** No Lit web component wrapper for search. The built-in widget is sufficient.

### Pagefind Indexing
- **D-08:** Occurrence data exclusion is already handled by architecture — occurrence data loads from Parquet files client-side and never appears in HTML. No special `data-pagefind-ignore` needed for occurrence data.
- **D-09:** Apply `data-pagefind-ignore` to site navigation (`<nav>`), page footer, and any boilerplate regions to keep results clean. Species content areas should be indexed by default.

### Validation Failure Modes
- **D-10:** VALD-01 (link checker): **Hard fail** — broken internal links abort the build. Tool: `lychee` (Rust binary, fast, checks `_site/` output directory).
- **D-11:** VALD-02 (page weight): **Warn only** — emit a warning when any HTML page exceeds 500KB; do not abort the build. Threshold: 500KB.
- **D-12:** VALD-03 (data integrity): **Hard fail** — invalid species IDs in records, unrecognized state/record_type values, or coordinates outside plausible PNW bounds abort the build with a clear error message. Consistent with DATA-05 behavior established in Phase 1.

### Claude's Discretion
- Pagefind configuration details (indexing options, bundle location) — planner decides based on Pagefind docs.
- VALD-03 exact PNW coordinate bounds — planner defines reasonable lat/long ranges for the Pacific Northwest.
- Page weight script implementation — can be a Node.js script in `scripts/` consistent with `scripts/build-data.js` pattern, or a shell one-liner.
- How lychee is invoked (npm script, direct CLI call in build) — planner decides.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — SRCH-01 through SRCH-04, GLOS-01, VALD-01 through VALD-03

### Project Context
- `.planning/PROJECT.md` — PoC scope, flat-file pattern, key decisions log
- `.planning/ROADMAP.md` — Phase 4 goal, success criteria, requirements mapping

### Existing Code
- `src/search/index.njk` — Stub search page to be replaced with Pagefind widget
- `src/glossary/index.njk` — Stub glossary page to be replaced with rendered terms
- `src/_includes/base.njk` — Shared layout (nav, Pico CSS import)
- `eleventy.config.js` — Current build config (passthrough copy, Vite plugin)
- `scripts/build-data.js` — Existing data pipeline script pattern

No external ADRs or specs beyond the above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/_includes/base.njk`: All new pages (search, glossary) use this layout.
- `data/*.csv` pattern: Glossary CSV follows the same flat-file convention already in use.
- `scripts/build-data.js`: Page weight checker script can follow the same Node.js ESM pattern.

### Established Patterns
- Pico CSS classless styling: No custom classes — semantic HTML only.
- DuckDB at build time: Glossary sort (`ORDER BY term ASC`) happens in the build query, not in the template.
- Eleventy passthrough copy: May need to passthrough Pagefind's JS/CSS bundle output to `_site/`.

### Integration Points
- `eleventy.config.js`: Pagefind runs post-Eleventy build; may need a `build` npm script update to call `pagefind --site _site` after `npm run build:eleventy`.
- `package.json` `build` script: Currently `build:data && build:eleventy && build:copy-parquet`. Will need `build:pagefind`, `build:validate-links`, `build:check-weight` steps added.
- `data/glossary.csv`: New file; DuckDB data file in `src/_data/` reads it at build time (consistent with species data pattern).

</code_context>

<specifics>
## Specific Ideas

- Pagefind should index species scientific names and common names (already in HTML from Phase 2) — SRCH-02 is satisfied by the content that's already on the page.
- Occurrence data (collector names, county strings, raw coordinates) never appears in HTML — they load from Parquet. SRCH-03 is architecturally guaranteed.
- The glossary's existing terms in the Django app include images — `image_filename` column handles this; empty string or null for terms without images.

</specifics>

<deferred>
## Deferred Ideas

None surfaced during discussion.

</deferred>

---

*Phase: 04-search-glossary-and-validation*
*Context gathered: 2026-04-12*
