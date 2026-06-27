# Phase 42: Results Grid - Context

**Gathered:** 2026-06-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 42 wires a **live thumbnail results grid** to the filter panel Phase 41 delivered.
Concretely:

- A `key-results-grid` Lit component (roadmap name), registered in `src/components/main.ts`,
  mounted on `/identify/` alongside the existing `character-filter-panel` inside `pnwm-identify`.
- It reacts to the current character selection (via the `pnwm-key-filter-change` event the panel
  already dispatches, or via a `matchedSlugs` property fed down from `pnwm-identify` — see D-08),
  runs `computeMatching()` (Phase 40), and renders matching species as CDN thumbnail cards.
- A running count line above the grid ("N species match" / "Showing all 1,192 species").
- Gray placeholder blocks for the 2 species with no `nav_image`; no broken `<img>` tags.
- A zero-match empty state with a "Clear all" call-to-action (SC4).

**Already delivered (do NOT redo):** the panel + `pnwm-key-filter-change` event + sticky "Clear all"
in the panel (Phase 41); `data/key-matrix.json` with `species[]` (slug/genus/epithet/common_name/
nav_image) + `meta` (matched=1,192, total=1,228) + 237 base64 bitsets (Phase 39/40);
`computeMatching()` + `MatchResult` (Phase 40); `validateKeyMatrix()` (`key-matrix-cache.ts`);
`scripts/copy-key-matrix.ts` copies the matrix into `_site/`.

**Out of scope (later phases / v4.x):** character illustration help images (Phase 43);
"characters used" removable chip strip (IDENT-07); URL query-param state persistence (IDENT-08);
ecoregion→state dependency hint (IDENT-09); pagination (explicitly rejected — one lazy grid handles
1,228 thumbnails, per REQUIREMENTS trade-off table). The no-JS species list is Phase 41's job
(grid is JS-only).

Requirements covered: GRID-01, GRID-02, GRID-03, GRID-04.

</domain>

<decisions>
## Implementation Decisions

### Count display (GRID-01)
- **D-01 — Matched count only.** When ≥1 state is selected: "N species match". At rest (no
  selection): "Showing all 1,192 species". **Never surface the 36 unmatched key species** — they're
  invisible everywhere else on the site (no page exists), so introducing "1,192 of 1,228" here would
  raise a number users can't act on. `N` always counts matched (renderable) species only.

### Default / empty-selection state
- **D-02 — Prompt placeholder until first selection.** With no characters selected, the grid area
  shows a prompt ("Select characters to narrow the 1,192 key species") rather than rendering all
  ~1,190 thumbnails. Avoids a heavy first paint and a wall of unfiltered images on landing.
- **D-03 — At-rest count still reads "Showing all 1,192 species"** and sits above the prompt
  placeholder (count + prompt coexist). This keeps SC1 literally satisfied — **no roadmap/SC wording
  change needed.** The prompt replaces the *thumbnail flood*, not the count line.

### Page layout (desktop)
- **D-04 — Side-by-side, sticky filter panel.** Filter panel in a left column that stays in view
  (sticky) while the grid scrolls in the main column. The count line is pinned above the grid. This
  is the classic faceted-search layout and best uses wide screens for browsing.
- **D-05 — Mobile/narrow = Claude's discretion.** Baseline: stack (panel on top, grid below) — the
  panel is compact because categories are default-collapsed (Phase 41). Exact mobile treatment
  (e.g. a collapsible "Filters" drawer) is left to the UI spec; a drawer toggle would be its own
  affordance, so it's a maybe, not a requirement.

### Card content & markup (GRID-02, GRID-03)
- **D-06 — Card = thumbnail + binomial (+ common name when present).** Italic `Genus epithet` shown
  on every card; the common name appears on its own line **only when `common_name` is non-null**
  (null for many species — show nothing extra, no "Unknown", no reserved blank line). The whole card
  is a link to `/species/{slug}/`.
- **D-07 — Reuse the browse-page (taxon-browser) nav-card visual + v2.1 placeholder.** Thumbnail
  mirrors `pnwm-taxon-browser.ts`'s nav-image card: hardcoded `const CDN_BASE_URL =
  'https://pnwmoths.b-cdn.net'`, URL `${CDN_BASE_URL}/${slug}/${encodeURIComponent(nav_image)}?height=…`,
  `loading="lazy"`. The 2 photo-less species render the gray `.similar-species-placeholder` block
  (from `src/species/species.njk`) — *no broken `<img>`*. Note: GRID-02 cites the "browse-page
  species-card" and GRID-03 cites the "v2.1 similar-species row"; these are two different existing
  visuals — reconcile the exact card styling in the UI spec, but the CDN-thumbnail mechanics come
  from taxon-browser and the placeholder block comes from similar-species.

### Zero-match empty state (GRID-04, SC4)
- **D-09 — Message + "Clear all" CTA.** When the active filter combination matches zero species, the
  grid area shows "No species match the selected characters" with a "Clear all" call-to-action. The
  CTA should trigger the **same reset path** as the panel's existing "Clear all" (Phase 41 D-06) — a
  single source of truth for clearing selection, not a second independent button. (Mechanism — shared
  event/method vs. the panel's button — is a planner/research call; see Claude's Discretion.)

### Claude's Discretion (left to research / planning / UI-spec)
- **D-08 — Selection → grid wiring.** `pnwm-identify` already *dispatches* `pnwm-key-filter-change`.
  Cleanest is for `pnwm-identify` to compute matching once and pass `matchedSlugs` (or the matched
  `KeySpecies[]`) **down to `key-results-grid` as a reactive property**, rather than the grid
  re-subscribing to the event its own parent emits. Research/planner to confirm the host wiring.
- **Matrix data delivery — fetch, do not inline.** Phase 41 deliberately did NOT inline the matrix
  (~243 KB). Phase 42 needs the bitsets + `species[]` for matching/rendering: **fetch
  `/key-matrix.json` at runtime and pass through `validateKeyMatrix()`** (`key-matrix-cache.ts`),
  mirroring the runtime-fetch pattern used for Parquet. Confirm `_site/identify/index.html`
  page-weight check still passes (the JSON is a separate request, not inlined).
- **Re-render performance.** With D-02, initial load is light (prompt only). On filtering, render the
  matched cards with Lit keyed rendering (`repeat()` by slug) so toggling states updates the grid
  without a full reload (SC2). Research to confirm no jank when a broad selection still matches many
  hundreds of cards.
- **Thumbnail size / grid columns / density** — exact `?height=` value and column count left to the
  UI spec (taxon-browser uses `?height=186`).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` § "Phase 42: Results Grid" — goal + SC1–SC4.
- `.planning/REQUIREMENTS.md` — GRID-01, GRID-02, GRID-03, GRID-04; trade-off table row rejecting
  pagination ("`loading="lazy"` on a single grid handles up to 1,228 thumbnails").
- `.planning/phases/41-identify-page-scaffold-filter-panel/41-CONTEXT.md` — the panel, the
  `pnwm-key-filter-change` event, the sticky "Clear all" (D-06), the no-JS species list (JS-only grid
  is the complement). The grid is the listener that "does not exist yet" per Phase 41.
- `.planning/phases/40-filter-logic-tdd-contract/40-CONTEXT.md` — the filter contract; OR-within /
  AND-across + "0 = unscored" already handled in `key-filter.ts`.

### Existing code to extend / mirror
- `src/components/key-results-grid.ts` — **NEW** component to create (roadmap name); register in
  `src/components/main.ts`.
- `src/components/pnwm-identify.ts` — root host; currently dispatches `pnwm-key-filter-change` with
  placeholder `matchedSlugs: []` (line ~142–146). Phase 42 makes this real and mounts the grid in its
  `render()` (line ~195).
- `src/components/pnwm-taxon-browser.ts` — **the "browse-page species-card pattern" (GRID-02)**:
  nav-image card render (~line 253), hardcoded `CDN_BASE_URL` const, `encodeURIComponent(filename)`,
  `?height=186`, `loading="lazy"`. Mirror this for the grid thumbnails.
- `src/species/species.njk` (lines 87–113) — the v2.1 similar-species row: `loading="lazy"` thumb and
  the `.similar-species-placeholder` gray block for the no-photo case (GRID-03).
- `src/_lib/key-filter.ts` — `computeMatching(...)` → `MatchResult { matchedSlugs }` (the grid's
  matching engine); `buildQuestionGroups()`.
- `src/components/key-matrix-cache.ts` — `validateKeyMatrix()` load-time guard for the fetched matrix.
- `src/types/schemas.ts` — `KeySpecies` (slug/genus/epithet/common_name/nav_image), `KeyMatrix`,
  `KeyMatrixMeta` (matched/total counts for the count line).
- `src/types/events.ts` — `KeyFilterChangeDetail` (the `pnwm-key-filter-change` payload).
- `src/styles/theme.css` — Pico tokens (cream `#f3e8ba`, olive `#a4ab78`) + `.similar-species-*`
  styles to reuse/extend.
- `scripts/copy-key-matrix.ts` — already copies `data/key-matrix.json` → `_site/` (so a runtime fetch
  has a file to hit).
- `eleventy.config.ts` (line 16) — `CDN_BASE_URL = "https://pnwmoths.b-cdn.net"` (server side); client
  components hardcode the same const (see taxon-browser).

### Data inputs
- `data/key-matrix.json` — `species[]` (1,192 matched; 1,190 have `nav_image`, 2 don't), `meta`
  (matched 1,192 / total 1,228 / unmatched 36), `matrix` (237 base64 bitsets), `characters` (237).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `pnwm-taxon-browser.ts` nav-image card: exact CDN-thumbnail mechanics (const base URL,
  `encodeURIComponent`, `?height=`, `loading="lazy"`) to copy for grid cards.
- `species.njk` `.similar-species-placeholder`: the gray no-photo block (GRID-03), already styled.
- `computeMatching()` + `validateKeyMatrix()`: matching + matrix-loading already built and tested.
- `KeyMatrixMeta` counts: feed the "Showing all 1,192 species" line directly (no recount needed).

### Established Patterns
- Lit components register via `customElements.define` and import in `src/components/main.ts`
  (Vite → `_site/components/main.js`, MPA mode).
- Large/dynamic data is fetched at runtime (Parquet, and now the key-matrix); only small render-time
  data is inlined as `<script type="application/json">`. The 243 KB matrix is fetched, not inlined.
- Client components hardcode `const CDN_BASE_URL = 'https://pnwmoths.b-cdn.net'` (taxon-browser),
  or accept it as an attribute (`pnwm-image-slideshow` `cdn-base-url`). Hardcoded const is the
  lighter-weight precedent for the grid.

### Integration Points
- `key-results-grid` mounts inside `pnwm-identify` on `/identify/`, beside `character-filter-panel`.
- Selection flows panel → `pnwm-identify` (computes `matchedSlugs`) → grid as a reactive property
  (preferred over the grid re-listening to `pnwm-key-filter-change`; see D-08).
- The grid's empty-state "Clear all" shares the panel's reset path (D-09).

</code_context>

<specifics>
## Specific Ideas

- Count line: "N species match" (filtering) / "Showing all 1,192 species" (at rest) — matched-only,
  never "of 1,228".
- Default landing: prompt "Select characters to narrow the 1,192 key species" + the at-rest count
  above it; thumbnails appear only after the first selection.
- Card: italic binomial always; common name on its own line only when present; whole card links to
  the species page; CDN thumb `?height=…` + `loading="lazy"`; gray placeholder for the 2 photo-less
  species.
- Layout: sticky filter panel left, scrolling grid right, count pinned above grid; stacks on mobile.

</specifics>

<deferred>
## Deferred Ideas

- **"Characters used" removable chip strip** (IDENT-07) and **URL query-param state persistence**
  (IDENT-08) — v4.x.
- **Mobile filter drawer / toggle** — beyond the baseline stack; UI spec may propose it, otherwise its
  own scope.
- **Surfacing the 36 unmatched key species** anywhere (footnote / "of 1,228") — explicitly declined
  for this phase (D-01).
- **Character illustration / help images beside questions** — Phase 43.

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 42-results-grid*
*Context gathered: 2026-06-25*
