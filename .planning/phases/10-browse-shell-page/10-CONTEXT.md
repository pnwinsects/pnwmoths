# Phase 10: Browse Shell Page - Context

**Gathered:** 2026-04-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 10 rewrites `/browse/` as a single Eleventy-generated page that:
1. Mounts a `<pnwm-taxon-browser>` custom element (implemented in Phase 11)
2. Passes the full taxonomy tree via a sibling `<script type="application/json" id="taxon-data">` element
3. Includes a `<noscript>` block with a static 4-level HTML listing of all taxa
4. Retires `src/browse/genus.njk` (per-genus pagination template) and `src/_data/families.js`

Phase 10 does NOT implement the accordion component — that is Phase 11. The `<pnwm-taxon-browser>` element exists in the DOM as an unregistered custom element in Phase 10 output; the component registers itself in Phase 11.

</domain>

<decisions>
## Implementation Decisions

### Taxonomy data embedding
- **D-01:** Use a `<script type="application/json" id="taxon-data">` sibling element rather than a `data-taxonomy` attribute on `<pnwm-taxon-browser>`. The component reads the data via `document.getElementById('taxon-data')`. This avoids HTML-attribute JSON escaping complexity and handles the full tree payload (families + navImages) more cleanly.
- **D-02:** Include full image data (navImages with filename, photographer, weight, navigational flag) in the serialized JSON — the accordion component needs this in Phase 11 and there is no separate image endpoint.
- **D-03:** ROADMAP.md success criteria SC-1 states "taxonomy tree in a `data-taxonomy` attribute" — this is overridden by D-01. Update success criteria to reference the script tag approach when planning.

### Noscript fallback
- **D-04:** The `<noscript>` block renders the full 4-level hierarchy: Family → Subfamily → Genus → Species. Uses `taxon` data directly (same source as the component).
- **D-05:** Species entries in the noscript block link to `/species/{slug}/` factsheet pages.
- **D-06:** Subfamilies with `name === null` (genera that fall directly under family) should be rendered without a subfamily heading — just flatten those genera under the family.

### Files retired in Phase 10
- **D-07:** `src/browse/genus.njk` — delete. This template generates per-genus static pages (`/browse/{genus}/`). Once deleted, `npm run build` no longer emits those pages.
- **D-08:** `src/_data/families.js` — delete. Only consumed by `browse/index.njk` and `genus.njk` (both retired). Phase 9 explicitly deferred this deletion to Phase 10.
- **D-09:** `src/browse/index.njk` — rewrite entirely. New template uses `taxon` data (from `taxon.js`), not `families`.

### Component placeholder
- **Claude's Discretion:** No stub Lit component file needed in Phase 10. The `<pnwm-taxon-browser>` element appears in the HTML as an unregistered unknown element — browsers render nothing, which is correct. The `<noscript>` block covers JS-off users. Phase 11 adds the component registration.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — BROWSE-01 (single dynamic page + retire per-genus), BROWSE-07 (show/hide toggle + noscript listing)
- `.planning/ROADMAP.md` — Phase 10 goal, success criteria, dependency on Phase 9

### Project Context
- `.planning/PROJECT.md` — Eleventy stack, flat-file conventions, Lit web component pattern
- `.planning/STATE.md` — current state, key v1.3 decisions

### Existing Code (must read before editing)
- `src/browse/index.njk` — current browse template being replaced
- `src/browse/genus.njk` — per-genus pagination template being deleted
- `src/_data/taxon.js` — Eleventy data file returning `taxon` array (4-level tree with navImages); this is the data source for Phase 10
- `src/_data/families.js` — being deleted; do not reference in new code
- `src/_includes/base.njk` — base layout; shows how templates are structured and how `main.js` is loaded
- `src/components/main.js` — Lit component registrations; Phase 10 does NOT add `pnwm-taxon-browser` here (Phase 11 does)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `taxon` Eleventy global data variable — already available in all templates via `src/_data/taxon.js`; returns array of family objects with `name`, `navImages`, `subfamilies[]` (each with `name` (nullable), `navImages`, `genera[]` (each with `name`, `genus_slug`, `navImages`, `species[]`))
- `base.njk` layout — all pages use `layout: base.njk`; follow the same frontmatter pattern as existing browse templates

### Established Patterns
- Nunjucks templates use `{{ '/' | url }}` and `{{ ('/species/' + slug + '/') | url }}` for URL generation
- Frontmatter: `layout`, `title`, `permalink` keys
- `tojson` filter available in Eleventy/Nunjucks for JSON serialization inside templates

### Integration Points
- `/browse/` permalink: `src/browse/index.njk` currently owns this; rewrite the same file
- `src/components/main.js` is loaded globally via base.njk — no changes needed here for Phase 10
- Link checker runs post-build; all internal links pointing to `/browse/{genus}/` must be gone (they are only in `browse/index.njk`, which is being rewritten)

</code_context>

<specifics>
## Specific Ideas

- The `<script type="application/json" id="taxon-data">` pattern is analogous to Next.js's `__NEXT_DATA__` pattern — well understood and easy for the Phase 11 component to consume.
- Noscript fallback uses `taxon` loop directly: `{% for family in taxon %}` → `{% for subfam in family.subfamilies %}` → `{% if subfam.name %}` heading → `{% for genus in subfam.genera %}` → `{% for sp in genus.species %}`.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 10-browse-shell-page*
*Context gathered: 2026-04-20*
