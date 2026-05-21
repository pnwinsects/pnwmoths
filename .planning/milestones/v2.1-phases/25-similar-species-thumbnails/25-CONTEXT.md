# Phase 25: Similar Species Thumbnails - Context

**Gathered:** 2026-05-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Transform the existing plain-text similar species list in `src/species/species.njk` (lines 83–96) into a horizontal thumbnail row. Each similar species entry shows a CDN-loaded thumbnail image (93px height, natural aspect ratio) with the species name below it as a clickable link to that species' page. Species with no image get a purely visual gray placeholder box. This is a pure Eleventy template change — no JS component, no new data files, no Parquet queries. The `images` and `species` global data (already available in the template) provide all needed information.

</domain>

<decisions>
## Implementation Decisions

### Section Layout
- **D-01:** The similar species section renders as a **horizontal flex row** of entries. Each entry contains a thumbnail (or placeholder) on top and the species name below.
- **D-02:** **Species name is visible below each thumbnail** — common name if available, otherwise genus + species. The entire entry (thumbnail + name) is wrapped in a clickable link to the species page.
- **D-03:** The row is horizontally scrollable if there are many similar species entries (consistent with the photo carousel strip pattern from Phase 23).

### Thumbnail Dimensions
- **D-04:** Thumbnail height is **93px**, matching the photo carousel thumbnail strip (Phase 23) and the reference pnwinsects-app.
- **D-05:** Width follows **natural aspect ratio** — no square cropping. Height is fixed at 93px, width varies with the photo's natural proportions.

### No-Image Fallback
- **D-06:** When a similar species has no image in `images.csv`, show a **gray placeholder box** (93px height, same dimensions as a real thumbnail). The placeholder is purely visual — no "No photo" text.
- **D-07:** The species name link still appears below the placeholder, exactly as it would for an entry with a real thumbnail.

### Image Selection
- **D-08:** Use the **first image by weight** (lowest weight = hero image) for the thumbnail — `images[slug][0]`. Images are already sorted by weight ascending in `src/_data/images.js`. No navigational flag filter required.

### Claude's Discretion
- Exact placeholder color (e.g., `var(--pico-muted-background)` or a similar Pico CSS token — something visually neutral that fits the cream background).
- Whether to use `object-fit: cover` or `object-fit: contain` for the thumbnail `<img>` (contain avoids cropping wing details; cover fills the frame uniformly).
- Whether to use `<ul>` with `display: flex` or replace with `<div>` — either is acceptable; choose what's cleanest.
- CSS for the flex row: `gap`, `flex-wrap` behavior (no-wrap with scroll is preferred per D-03).
- Whether to add a max-width or min-width per thumbnail entry.

### Reviewed Todos (not folded)
- **Fix close button on the lightbox** (2026-04-23) — already resolved in Phase 23 (PHOTO-03). No action needed.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Template to Modify
- `src/species/species.njk` lines 83–96 — The similar species section to replace. Currently renders a plain `<ul>` list; replace with the horizontal thumbnail row.

### Data Sources (read-only — no changes expected)
- `src/_data/images.js` — Returns `{ [species_slug]: [{ filename, weight, photographer, ... }] }`. Images are sorted by weight ascending; use index `[0]` for the thumbnail. CDN URL: `{{ cdnBaseUrl }}/{{ slug }}/{{ images[slug][0].filename | urlencode }}`.
- `src/_data/species.js` — Returns species rows including `similar_slugs` (array of strings, already split from pipe-delimited CSV field).
- `eleventy.config.js` line 16 — `CDN_BASE_URL` hard-coded as `"https://pnwmoths.b-cdn.net"`, exposed to all Nunjucks templates as `{{ cdnBaseUrl }}` (line 57).

### Project Context
- `.planning/REQUIREMENTS.md` — SIM-01 (thumbnail from CDN, graceful fallback) and SIM-02 (clickable links).
- `.planning/PROJECT.md` — Key Decisions table; especially: "CDN_BASE_URL as public constant (not env var)" and "species_slug as foreign key in images.csv and records.csv".

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `species.njk` lines 83–96 — Current similar species loop: `{% for slug in sp.similar_slugs %}` → `{% for s in species %}` → `{% if s.slug == slug %}`. Replace the inner `<li>` content with the thumbnail + name card. The double-loop lookup pattern is already established.
- `images[sp.slug]` lookup — Already used at line 36 (`{% set spImages = images[sp.slug] %}`). Same pattern applies for `images[slug]` inside the similar species loop.
- `{{ cdnBaseUrl }}/{{ sp.slug }}/{{ img.filename | urlencode }}` — CDN URL pattern from lines 41. Replicate for similar species: `{{ cdnBaseUrl }}/{{ slug }}/{{ images[slug][0].filename | urlencode }}`.
- `urlencode` filter — Already available and required for filenames with spaces (Django filenames).

### Established Patterns
- **No-JS degradation**: The similar species section is already static HTML (no JS component); the thumbnail row must remain pure HTML — no `<script>`, no web components.
- **`data-pagefind-ignore`**: Not needed here — similar species links should remain indexable by Pagefind search.
- **CDN images via `<img src="{{ cdnBaseUrl }}/...">` with natural sizing**: Same pattern as the main slideshow images. Use `loading="lazy"` for thumbnails below the fold.

### Integration Points
- No JS integration — the similar species section is static and standalone.
- No data pipeline changes — `images.js` and `species.js` already have all needed data.
- The `{{ cdnBaseUrl }}` global is available in all Nunjucks templates via `eleventyConfig.addGlobalData` in `eleventy.config.js`.

</code_context>

<specifics>
## Specific Ideas

- Thumbnail height of **93px** is explicitly derived from the reference pnwinsects-app (same value used in Phase 23's photo carousel). This is a hard design requirement, not an approximation.
- The horizontal scroll row approach mirrors the photo thumbnail strip from Phase 23 — visual consistency between the two sections.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

### Reviewed Todos (not folded)
- **Fix close button on the lightbox** (2026-04-23) — already resolved in Phase 23 (PHOTO-03). Reviewed in Phase 24 as well. No further action needed.

</deferred>

---

*Phase: 25-similar-species-thumbnails*
*Context gathered: 2026-05-20*
