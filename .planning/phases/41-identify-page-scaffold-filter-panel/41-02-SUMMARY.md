---
phase: 41-identify-page-scaffold-filter-panel
plan: "02"
subsystem: identify-page
tags: [eleventy, nunjucks, data-loader, no-js-degradation, nav-link]
dependency_graph:
  requires: [data/key-matrix.json with 8 clean categories (Plan 41-01)]
  provides: [/identify/ route, #key-char-data inline JSON contract, Identify nav link, no-JS species degradation]
  affects: [Plan 41-03 filter panel component (reads #key-char-data), Phase 42 results grid (sibling of pnwm-identify)]
tech_stack:
  added: [csv-parse/sync (already in deps — used by new keyMatrix.ts loader)]
  patterns: [Eleventy _data synchronous loader, Nunjucks familyGroups iteration, tojson+safe inline JSON, noscript degradation]
key_files:
  created:
    - src/_data/keyMatrix.ts
    - src/identify/index.njk
  modified:
    - src/_includes/base.njk
decisions:
  - "Inline only { characters, species } in #key-char-data (not familyGroups) — familyGroups duplicates species data, causing 410 KB JSON that would push page over 500 KB; template iterates keyMatrix.familyGroups directly in <noscript>"
  - "keyMatrix.ts is synchronous (no DuckDB) — data/key-matrix.json is already clean JSON from Plan 41-01"
  - "familyGroups pre-grouped in loader (not in template) — avoids Nunjucks {% set %} inside {% for %} persistence trap"
metrics:
  duration: "~15 minutes"
  completed: "2026-06-25T05:15:00Z"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 3
---

# Phase 41 Plan 02: keyMatrix Loader + /identify/ Route + Nav Link Summary

One-liner: Synchronous `keyMatrix.ts` loader joins species.csv for family, pre-groups Family→Genus, and feeds `src/identify/index.njk` which inlines `#key-char-data` for the Plan 03 component and renders a two-section no-JS degradation (character text + 1,192 species links).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create src/_data/keyMatrix.ts loader (join family, pre-group Family→Genus) | 4ae3cc92 | src/_data/keyMatrix.ts |
| 2 | Create src/identify/index.njk route + Identify nav link | 6786cb85 | src/identify/index.njk, src/_includes/base.njk |

## What Was Built

### Task 1: `src/_data/keyMatrix.ts`

Synchronous `export default function (): KeyMatrixData` that:

1. Reads and parses `data/key-matrix.json` as `{ characters: Character[]; species: KeySpecies[] }` — excluding `matrix` and `meta` from the return value (page-weight guard: bitsets would add ~29 KB)
2. Reads `data/species.csv` with `csv-parse/sync` and builds a `familyBySlug: Map<string, string|null>` keyed by `${genus.toLowerCase()}-${species.toLowerCase()}`
3. Maps `KeySpecies[]` → `KeySpeciesWithFamily[]` (extends with `family: string | null`) by looking up each slug in `familyBySlug`; 1191 of 1192 species resolve a non-null family
4. Builds `familyGroups`: families sorted alphabetically (null-family group at end), within each family genera sorted alphabetically

Exports: `interface KeySpeciesWithFamily`, `interface KeyMatrixData`, `export default function`

Verification:
- `characters.length === 237` ✓
- `species.length === 1192` ✓
- `familyGroups.length === 12` ✓
- `withFamily === 1191` (only 1 species has no csv match) ✓
- No `matrix` or `meta` keys in return ✓
- `npx tsc --noEmit`: zero errors ✓

### Task 2: `src/identify/index.njk` + `src/_includes/base.njk`

`src/identify/index.njk`:
- Frontmatter: `layout: base.njk`, `title: "Identify a moth — PNW Moths"`, `permalink: /identify/index.html`
- `<h1>Identify a moth</h1>` + lead paragraph
- `<script type="application/json" id="key-char-data" data-pagefind-ignore>{{ { characters: keyMatrix.characters, species: keyMatrix.species } | tojson | safe }}</script>` — inlines characters+species only (~220 KB raw; page stays under 500 KB)
- `<pnwm-identify></pnwm-identify>` host element (no attributes needed)
- `<noscript data-pagefind-ignore>` with two sections:
  1. "Characters (JavaScript required to filter)" — flat `keyMatrix.characters` iterated with category-change detection for `<h3>` headings; `<li>question: state</li>` entries; no `<input>` elements
  2. "All matched key species (1,192)" — `keyMatrix.familyGroups` iterated for `<h3>family</h3> <h4>genus</h4> <ul>species links</ul>`

`src/_includes/base.njk`:
- Added `<li><a href="{{ '/identify/' | url }}">Identify</a></li>` after Browse nav item

Verification:
- `_site/identify/index.html` exists ✓
- `<pnwm-identify>` present ✓
- `id="key-char-data"` + `data-pagefind-ignore` present ✓
- `<noscript>` h2s: ["Characters (JavaScript required to filter)", "All matched key species (1,192)"] ✓
- 1192 species links in `<noscript>` ✓
- 0 `<input>` elements in `<noscript>` ✓
- `/identify/` found in `_site/index.html` nav ✓
- Page weight: under 500 KB (no over-budget warning) ✓
- No hardcoded `/pnwmoths/` paths ✓

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] keyMatrix inline JSON size exceeded 500 KB page-weight threshold**

- **Found during:** Task 2 build verification (`npm run build:check-weight`)
- **Issue:** The plan action said `{{ keyMatrix | tojson | safe }}` would inline the whole object (~124 KB), but actual measurement showed `familyGroups` duplicates all 1,192 species objects in nested form, expanding the inline JSON to 410 KB raw (520.8 KB total page)
- **Fix:** Changed the inline `<script>` to emit only `{ characters: keyMatrix.characters, species: keyMatrix.species }` (~220 KB raw), keeping page under 500 KB. The Nunjucks template iterates `keyMatrix.familyGroups` directly (from Eleventy template context, not from the inlined JSON), so the `<noscript>` species list is unaffected
- **Impact on contracts:** The `#key-char-data` contract for Plan 03 is unchanged — the component reads `.characters` (and `.species` for the results grid). Plan 03 does not read `.familyGroups` from the inline JSON
- **Files modified:** `src/identify/index.njk`
- **Commit:** 6786cb85

## Known Stubs

None. The `<pnwm-identify>` element renders as an empty host until Plan 03 implements the component class. This is intentional — the host element is the contract boundary between this plan and Plan 03.

## Threat Flags

None. Static-only output; no network boundary, auth, or user input. `data-pagefind-ignore` on inline JSON and `<noscript>` blocks keeps the Pagefind index clean.

## Self-Check: PASSED

- `src/_data/keyMatrix.ts` exists: confirmed
- `src/identify/index.njk` exists: confirmed
- `src/_includes/base.njk` contains `/identify/`: confirmed
- `_site/identify/index.html` exists with 1192 species links: confirmed
- Commits `4ae3cc92` and `6786cb85` exist in git log: confirmed
