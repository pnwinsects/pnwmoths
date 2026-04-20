# Phase 11: Accordion Component - Context

**Gathered:** 2026-04-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 11 implements `<pnwm-taxon-browser>` — the Lit web component that turns the static shell
from Phase 10 into a fully interactive accordion.

Scope:
- Register `pnwm-taxon-browser` in `src/components/main.js`
- Implement expand/collapse at all four levels: Family → Subfamily → Genus → Species
- Show up to 4 navigation images per collapsed taxon; hide parent images when expanded
- Show/hide images toggle (global, on by default)
- State filter dropdown that mutes taxa with no records in the selected state
- Fetch `species-states.json` asynchronously for filter data

Phase 11 does NOT change `browse/index.njk`, `taxon.js`, or the data pipeline.

</domain>

<decisions>
## Implementation Decisions

### Image display
- **D-01:** Navigation images are displayed as a **horizontal thumbnail strip** — `inline-flex` row, `overflow-x: auto` for mobile horizontal scroll, no wrapping.
- **D-02:** Fixed height of **93px** per image cell (user-specified minimum for specimen detail visibility). Width `auto` so images scale proportionally within the cell.
- **D-03:** `object-fit: cover` on `<img>` elements — portrait-orientation moth photos will crop rather than distort.
- **D-04:** **No photographer credit** shown at the accordion thumbnail level — credit belongs on the species factsheet where `pnwm-image-slideshow` already renders it.

### State filter
- **D-05:** State filter UI is a **`<select>` dropdown** — consistent with the `pnwm-filter-bar.js` convention; Pico classless styles `<select>` natively; no custom CSS needed.
- **D-06:** When a state is selected, taxa with no occurrence records in that state are **muted (visually dimmed), not hidden**. Taxonomic structure remains visible — "WA has no Lasiocampidae" is useful information for naturalists. Implementation: toggle a CSS class or `aria-disabled` to reduce opacity; do not remove rows from the DOM.

### Expand/collapse
- **D-07:** Expand/collapse uses **instant show/hide** — `hidden` attribute or `display:none` toggle via Lit reactive property. No CSS height/opacity transitions. Consistent with all other Lit components on the site; avoids layout-recalc jank on large genera subtrees.

### Controls
- **D-08:** The show/hide images toggle and state filter **both live inside `<pnwm-taxon-browser>`** — rendered as a toolbar at the top of the component's own `render()` method. `browse/index.njk` template stays at its current minimal size. Consistent with `pnwm-filter-bar.js` encapsulation pattern.

### Light DOM (locked from prior research)
- **D-09:** `<pnwm-taxon-browser>` must use `createRenderRoot() { return this; }` — Pico CSS element selectors do not penetrate shadow DOM. This was decided in STATE.md v1.3 research and is non-negotiable.

### Data access (locked from Phase 10)
- **D-10:** Component reads taxonomy data from `document.getElementById('taxon-data')` (the embedded `<script type="application/json">` sibling element). No `data-` attributes on the custom element. Source: Phase 10 D-01.
- **D-11:** State filter data is loaded via `fetch('/species-states.json')` in `connectedCallback()`. This file was produced by Phase 9.

### Claude's Discretion
- Form factor for the show/hide images toggle — a `<input type="checkbox">` with a `<label>` is the natural Pico classless choice, but Claude may use a `<button aria-pressed>` if preferred.
- Visual treatment for muted (filtered-out) rows — opacity reduction, a CSS class, `aria-disabled`, or similar. Should be visually distinct but not distracting.
- Single-class vs. sub-components architecture — the component can be one `PnwmTaxonBrowser` class or broken into `PnwmTaxonFamily` etc. Use judgment based on complexity.
- How to handle the `species-states.json` loading state — show a spinner, disable the filter until loaded, or silently defer.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — BROWSE-02, BROWSE-03, BROWSE-04, BROWSE-05, BROWSE-06, SFILT-02 (full specs for Phase 11)
- `.planning/ROADMAP.md` — Phase 11 goal, success criteria, dependencies

### Project Context
- `.planning/PROJECT.md` — Lit component pattern, Pico CSS conventions, maintainability goals
- `.planning/STATE.md` — key v1.3 decisions: light DOM requirement, JSON data embedding pattern

### Prior Phase Context
- `.planning/phases/10-browse-shell-page/10-CONTEXT.md` — data access decisions (D-01 script tag, D-02 full image data in JSON)
- `.planning/phases/10-browse-shell-page/10-UI-SPEC.md` — design contract, color tokens, spacing scale

### Existing Code (must read before implementing)
- `src/browse/index.njk` — the shell page; component mounts here with no attributes
- `src/components/main.js` — where `pnwm-taxon-browser` registration goes (import + define)
- `src/components/pnwm-filter-bar.js` — reference for Lit component structure, `<select>` state filter pattern, light DOM vs. shadow DOM usage
- `src/components/pnwm-occurrence-map.js` — reference for `createRenderRoot()` light DOM pattern
- `src/_data/taxon.js` — data shape the component consumes: `family.name`, `family.navImages[]`, `family.subfamilies[].name` (nullable), `family.subfamilies[].genera[].name`, `family.subfamilies[].genera[].species[]`
- `src/styles/theme.css` — Pico token overrides; color and spacing tokens for the component

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `pnwm-filter-bar.js` — established `<select>`-based Lit filter pattern; import from same directory
- `pnwm-occurrence-map.js` — `createRenderRoot() { return this; }` light DOM pattern; copy exactly
- `taxon` data shape (from `taxon.js`) — already embedded in page as JSON; includes `navImages[]` per taxon with `filename`, `photographer`, `weight`, `navigational` fields

### Established Patterns
- All components: `static get properties()` or `static properties = {}` for reactive state
- Light DOM: `createRenderRoot() { return this; }` — occurrence map already does this
- `connectedCallback()` for async data loading (see `pnwm-filter-bar.js` and `pnwm-occurrence-map.js`)
- Image URLs: `src="/images/{filename}"` — verify existing path convention in current species pages
- Component registration: add `import './pnwm-taxon-browser.js'` to `src/components/main.js`

### Integration Points
- `src/components/main.js` — add one import line to register `pnwm-taxon-browser`
- `/_site/species-states.json` — available at this path in the built site (Phase 9 output); fetch at mount
- Species factsheet links: `/species/{slug}/` (from Phase 10 noscript pattern)

</code_context>

<specifics>
## Specific Ideas

- Image strip: user confirmed 93px is the minimum height to see specimen detail. Do not go lower.
- Mobile behavior: horizontal scroll on the image strip is acceptable — `overflow-x: auto` on the strip container.
- The `species-states.json` maps `{ [species_slug]: [state, ...] }` — the component needs to walk the tree to determine which taxa have any species with records in the selected state.
- The noscript listing in `browse/index.njk` (Phase 10) handles the JS-off path — the accordion component only needs to handle the JS-on path.

</specifics>

<deferred>
## Deferred Ideas

None surfaced — discussion stayed within phase scope.

</deferred>

---

*Phase: 11-accordion-component*
*Context gathered: 2026-04-20*
