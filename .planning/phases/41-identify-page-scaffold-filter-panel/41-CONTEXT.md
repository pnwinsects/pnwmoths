# Phase 41: Identify Page Scaffold & Filter Panel - Context

**Gathered:** 2026-06-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 41 delivers the **navigable `/identify/` page and a fully interactive 237-state
character filter panel** — *before* any results grid is wired in (that is Phase 42).
Concretely:

- A new Eleventy route `src/identify/index.njk` (`permalink: /identify/index.html`,
  `layout: base.njk`) + an "Identify" link in the site nav (`src/_includes/base.njk`).
- `pnwm-identify` root component (registered in `src/components/main.ts`).
- `character-filter-panel` Lit component: 8 collapsible categories (default-collapsed),
  rendering question groups and per-state checkboxes; select/deselect in any order, reflected
  in real time; "Clear all" reset.
- The panel dispatches the `pnwm-key-filter-change` event (detail type already defined in
  Phase 40); **no consumer of that event exists yet** — the results grid is Phase 42.
- Full no-JS static degradation: the complete character hierarchy as plain HTML text and the
  full list of matched key species as static links.
- `npm run build` page-weight check passes for `_site/identify/index.html`.

**Already delivered (do NOT redo):** `data/key-matrix.json` (1,192 matched species × 237
states; Phase 39); `src/_lib/key-filter.ts` `buildQuestionGroups()` + `computeMatching()` and
the `pnwm-key-filter-change` detail type (Phase 40). The panel *consumes* these.

**Out of scope (later phases):** live "N species match" count + thumbnail results grid +
empty-state (Phase 42); character illustration help images (Phase 43); ecoregion→state
dependency hint (IDENT-09, deferred to v4.x); URL state persistence (IDENT-08); "characters
used" chip strip (IDENT-07).

Requirements covered: IDENT-01, IDENT-02, IDENT-03, IDENT-05, IDENT-06 (IDENT-04 done in Phase 40).

</domain>

<decisions>
## Implementation Decisions

### Category inclusion (resolves the Phase 40 deferral — PITFALLS Pitfall 3)
- **D-01 — Include all 8 categories as-is.** Distribution and Seasonality render identically to
  the morphological categories despite overlapping the Browse occurrence filters / phenology
  chart. The overlap is accepted as benign redundancy. Rationale: keeps `key-filter.ts` and the
  panel **category-agnostic** — no special-casing, no per-category product policy baked into the
  component (consistent with Phase 40 D-05). **→ Record this as a PROJECT.md Key Decision per the
  Phase 40 deferral note (PITFALLS Pitfall 3).**
- **D-02 — Distribution renders all 6 questions, including all 5 ecoregion questions (52 states
  total, flat).** No state-dependency UX this phase. The "collapse irrelevant ecoregions unless
  the parent State/Province is selected" affordance is IDENT-09, deferred to v4.x; it lands later
  without re-scoping the panel.

### Accordion / panel structure
- **D-03 — Category-only collapse, default-collapsed.** Only the 8 top-level categories are
  collapsible (`aria-expanded` toggle, mirroring `pnwm-taxon-browser`). Opening a category reveals
  *all* its questions and state checkboxes at once. Within an open category, each **question is a
  labeled group** of checkboxes (the OR-within-question boundary must be visually explicit and
  preserved — it drives `buildQuestionGroups()` semantics) but questions are **not** individually
  collapsible. Note: "Forewing color and pattern" is large (19 questions / 65 states) — it will
  dump 65 checkboxes when opened; that is accepted for this phase.
- **D-04 — Category order = the key's native order** from `key-characters.csv`: Distribution,
  Seasonality, Size, Wing shape and size, Forewing color and pattern, Hindwing color and pattern,
  Abdomen and thorax, Eyes. No curated reordering.

### Selection feedback ("N species match" does not exist until Phase 42)
- **D-05 — Per-category count badges on collapsed headers.** Each category header shows how many
  of its states are currently selected (e.g. "Forewing color and pattern (3)"), so the user sees
  where selections live without expanding. This is the real-time selection reflection for
  IDENT-03 in the absence of a results count.
- **D-06 — "Clear all" sticky at the top of the panel, conditionally visible.** Shown only when
  ≥1 state is selected; clicking it deselects every state; it disappears when nothing is selected
  (IDENT-05 / SC3). Sticky positioning so it stays reachable while scrolling the long (237-state)
  panel.

### No-JS static degradation (IDENT-06 / SC4)
- **D-07 — Species list grouped by Family (like Browse).** The no-JS fallback lists the **1,192
  matched species** (all have site pages) as static links, grouped Family → Genus consistent with
  the existing Browse no-JS experience. Unmatched key species (no site page) are excluded, per
  project policy.
- **D-08 — Character hierarchy as a plain nested text list.** Category → question → state rendered
  as nested static HTML text (no form controls). A static form cannot filter without JS, and inert
  disabled checkboxes would look actionable but do nothing — so plain readable text only, satisfying
  SC4's "readable as plain HTML text."

### Claude's Discretion (left to research / planning / UI-spec)
- **Inline-JSON scope.** The roadmap names an "inline JSON strategy." Decide *what* is inlined vs
  fetched: inline the **character hierarchy metadata** (the 237-state tree the panel needs to render)
  as a `<script type="application/json">` block (mirroring `#taxon-data` on the Browse page) so the
  panel renders with no async fetch; the full matrix bitsets are only needed for *matching*, which is
  Phase 42 — Phase 41 likely does **not** need to inline or fetch the bitsets at all. Confirm against
  the `_site/identify/index.html` page-weight budget (do not inline the ~243 KB raw matrix).
- **Data source for the no-JS species list + inlined hierarchy.** Decide whether an Eleventy data
  file (e.g. a `keyMatrix.ts`-style `_data` loader reading `data/key-matrix.json`) feeds both the
  inlined character JSON and the family-grouped species list, vs reading the JSON directly in the
  template. Mirror the `_data/taxon.ts` → Browse pattern.
- **Light DOM vs Shadow DOM** for the panel — `pnwm-taxon-browser` uses Light DOM + Pico (reaches
  global form-control styles); follow that unless a UI-spec argues otherwise.
- **Badge / sticky-header styling** — exact visual treatment left to UI-spec / Pico tokens.

### Research / data-quality flags (not user decisions)
- **"Abdomen and thorax" stray-quote artifact.** `data/key-matrix.json` `characters` contains TWO
  category strings: `Abdomen and thorax` (7 questions / 14 states) and `"Abdomen and thorax`
  (1 question / 2 states) — a CSV-parsing quote artifact. The roadmap says **8** categories, so these
  must be **merged into one** for panel grouping. Researcher: confirm whether to fix at the
  `build-key.ts` source (preferred — fix the artifact in `data/key-matrix.json`) or normalize in the
  panel. Fixing at source keeps the artifact out of every downstream consumer.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` § "Phase 41: Identify Page Scaffold & Filter Panel" — goal + SC1–SC4.
- `.planning/REQUIREMENTS.md` — IDENT-01, IDENT-02 (collapsible groups reusing the
  `pnwm-taxon-browser` `aria-expanded` pattern), IDENT-03, IDENT-05, IDENT-06. IDENT-04 is
  Complete (Phase 40), context only.
- `.planning/phases/40-filter-logic-tdd-contract/40-CONTEXT.md` — the filter-logic contract the
  panel consumes; D-05 deferred the Distribution/Seasonality product call to *this* phase (now D-01).
- `.planning/phases/39-key-matrix-data-pipeline/39-CONTEXT.md` — `data/key-matrix.json` shape
  (`{ characters, species, matrix }`); the `characters` hierarchy drives panel grouping.

### Filter-semantics background (for the OR-within / AND-across question boundaries)
- `.planning/research/PITFALLS.md` § "Pitfall 3" — Distribution/Seasonality overlap with Browse
  filters (drives D-01); § "Pitfall 2" — "0 = unscored" (already handled in `key-filter.ts`).

### Existing code to extend / mirror
- `src/components/pnwm-taxon-browser.ts` — the collapsible `aria-expanded` accordion + Light-DOM +
  Pico pattern to mirror for the filter panel; multi-level toggle via new-Set reactivity.
- `src/browse/index.njk` — the inline `<script type="application/json" id="taxon-data">` +
  `<noscript>` static-hierarchy degradation pattern to mirror; family-grouped species links for D-07.
- `src/_includes/base.njk` (nav `<ul>`, ~lines 21–30) — add the "Identify" link.
- `src/components/main.ts` — register `pnwm-identify` / the filter-panel component here.
- `src/_data/taxon.ts` — `_data` loader precedent (DuckDB → tree) for an analogous key-matrix data file.
- `src/_lib/key-filter.ts` + `src/types/events.ts` (`pnwm-key-filter-change` detail) — consumed by the panel.
- `src/components/key-matrix-cache.ts` — load-time validation/decoding (relevant only if the panel
  touches the matrix; likely Phase 42).
- `src/styles/theme.css` — Pico custom-property tokens (cream `#f3e8ba`, olive `#a4ab78`).
- `scripts/copy-key-matrix.ts` — copies `data/key-matrix.json` → `_site/` (already wired).

### Data inputs
- `data/key-matrix.json` — `characters` (237 states + `category`/`subcategory`/`question`/`state`
  hierarchy), `species` (1,192 matched, each with `slug` + nav image). Note the D-09 stray-quote artifact.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `pnwm-taxon-browser.ts`: collapsible accordion with `aria-expanded`, Light DOM + Pico, new-Set
  reactivity for toggle state — the direct template for the filter panel.
- Browse page (`src/browse/index.njk`): inline-JSON + `<noscript>` static-hierarchy degradation,
  and Family→Genus species grouping reusable for D-07's no-JS species list.
- `_data/taxon.ts`: precedent for an Eleventy `_data` loader producing a grouped tree from source data.

### Established Patterns
- Standalone Eleventy pages = `src/<name>/index.njk` with `layout: base.njk` + explicit `permalink`.
- Lit components register via `customElements.define(...)` and are imported in `src/components/main.ts`;
  Vite bundles `main.ts` → `_site/components/main.js` (MPA mode).
- Small render-time data inlined as `<script type="application/json">`; large/dynamic data fetched at
  runtime (Parquet, and the key-matrix bitsets in Phase 42).
- Theme via Pico custom properties in `src/styles/theme.css`.

### Integration Points
- `/identify/` route + nav link in `base.njk`.
- `pnwm-identify` (root) hosts `character-filter-panel`; panel dispatches `pnwm-key-filter-change`
  (the Phase 42 results grid will be the listener — none exists yet).
- An Eleventy `_data` loader (or direct template read) sources both the inlined character hierarchy
  and the family-grouped no-JS species list from `data/key-matrix.json`.

</code_context>

<specifics>
## Specific Ideas

- Category badge example: a collapsed "Forewing color and pattern (3)" header communicates active
  selections without expanding (D-05).
- The 8 categories in native order, with question counts to size the work: Distribution (6 q / 52 s),
  Seasonality (1 / 12), Size (5 / 34), Wing shape and size (4 / 11), Forewing color and pattern
  (19 / 65), Hindwing color and pattern (11 / 45), Abdomen and thorax (7 / 14 — plus the 1 q / 2 s
  stray-quote fragment to merge), Eyes (1 / 2).
- No-JS species list mirrors Browse's Family → Genus grouping for visual/navigational consistency.

</specifics>

<deferred>
## Deferred Ideas

- **Ecoregion → State/Province dependency hint** (only show a state's ecoregions when that state is
  selected) — IDENT-09, v4.x. Distribution renders flat for now (D-02).
- **Live "N species match" count + thumbnail results grid + empty state** — Phase 42 (the
  `pnwm-key-filter-change` listener).
- **Character illustration / help images beside questions** — Phase 43.
- **"Characters used" removable chip strip** (IDENT-07) and **URL query-param state persistence**
  (IDENT-08) — v4.x.
- **PROJECT.md Key Decision entry** recording the "include Distribution + Seasonality in Identify
  despite Browse overlap" decision (D-01) — to be added when PROJECT.md is next evolved.

</deferred>

---

*Phase: 41-identify-page-scaffold-filter-panel*
*Context gathered: 2026-06-24*
