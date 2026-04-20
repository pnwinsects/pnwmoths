# Feature Research

**Domain:** Visual taxonomy browse for natural history static site (v1.3 Visual Browse milestone)
**Researched:** 2026-04-18
**Confidence:** HIGH for accordion UX and image selection patterns; MEDIUM for client-side geographic filter specifics

---

## Scope

This document covers **new features only** for the v1.3 milestone:

1. Visual accordion browse (Family → Subfamily → Genus → Species)
2. Navigation images per taxon level (up to 4, show/hide toggle)
3. `navigational` flag on images + fallback to lowest-weight photos
4. Client-side state filter (hides taxa with no records in selected states)
5. Retirement of per-genus static pages (`/browse/{genus}/`)

Previously-built features (species factsheets, map, phenology, filters, Pagefind search, glossary) are out of scope here. The prior FEATURES.md covers them.

---

## Ecosystem Reference

The original **pnwmoths.biol.wwu.edu** already established the canonical pattern for this feature set and is the primary reference. Key observations from it:

- Subfamily-level pages show **4 thumbnail images per genus** in a horizontal row (141×93px cached)
- Navigation uses multi-level URL paths: `browse/family-{f}/subfamily-{s}/{genus}/{species}/`
- The taxonomy hierarchy is Family → Subfamily → Genus → Species (exactly the target hierarchy)
- No client-side state filtering existed on the original — that is new

**BAMONA (butterfliesandmoths.org):** Text-only taxonomy listing with representative photos only at the bottom of family pages as supplementary content. No inline accordion or geographic filter. Confirms that images-per-genus at browse time is a differentiator even among comparable sites.

**iNaturalist:** Shows species as a grid of thumbnails (most-observed first) when filtered to a place. Uses one curated "taxon photo" per species chosen for diagnostic clarity at small size. Geographic filtering is prominent (place-based). No accordion drill-down — uses separate taxon pages per rank.

**eBird/GBIF:** Server-side, API-driven filtering. Not applicable to static site context.

---

## Table Stakes (Users Expect These)

Features users assume exist. Missing these makes the browse feel incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Hierarchical accordion: Family → Subfamily → Genus | Original PNW Moths site established this as the navigation pattern; every moth-specialist site groups by family | MEDIUM | 3-4 levels deep; `<details>`/`<summary>` or Lit `pnwm-taxon-accordion` component; inline expand/collapse |
| Species list inside expanded genus | Users drill down to find and click through to species factsheets | LOW | Static list rendered server-side in Eleventy; no JS required for basic listing |
| Representative image(s) per taxon | Original site shows 4 thumbnails per genus; iNaturalist shows one taxon photo per entry; absence makes taxa indistinguishable visually | MEDIUM | Up to 4 nav images per taxon level; fallback to lowest-weight species photos when none flagged |
| Images on by default, show/hide toggle | Images add scanability; power users want text-only for fast scanning | LOW | Single checkbox state; CSS class toggle on parent; no server round-trip needed |
| Link from genus/species entry to species factsheet | Browse exists to navigate to factsheet; missing links breaks the whole purpose | LOW | Already exists in current text browse; carry forward |
| Subfamily grouping (where applicable) | Taxonomy is 4-level; flat Family → Genus loses the scientific grouping that experts navigate by | MEDIUM | `subfamily` column added to `species.csv`; genera without subfamily fall directly under family |
| Graceful JS-off degradation | Existing site requirement; static build should be readable without JS | LOW | Render all taxa as static HTML; JS component enhances with collapse and images |

---

## Differentiators (Competitive Advantage)

Features that create genuine value above what comparable sites offer.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| `navigational` flag on images | Allows curators to mark the best diagnostic photos as browse candidates, distinct from the weight-ordered gallery photos; iNaturalist has this concept ("taxon photo" vs observation photos) but not as a simple flag on records | LOW | New boolean column in `images.csv`; fallback logic needed for genera with no flagged images |
| Fallback to lowest-weight species photo | No dead zones — every genus shows something even before curators flag navigational images; BAMONA shows no images at genus level at all | LOW | Build-time DuckDB query: for each taxon node, UNION flagged images + fallback to weight=1 per species; cap at 4 |
| Client-side state filter on browse page | Original site had no geographic filter on browse; iNaturalist has place-based filtering but is server-side; letting users hide taxa with no local records focuses a field guide on what they'll actually encounter | HIGH | Requires build-time species-×-state Parquet (from records.csv); Lit component reads Parquet async and toggles visibility of taxon nodes |
| All taxonomy on a single page | Original site required navigating to separate URL per subfamily/genus level; single-page accordion removes multiple page loads for browsing | MEDIUM | Replaces 700+ static `/browse/{genus}/` pages with one dynamic page; reduces hosting complexity |
| Images collapse when drilling down | When a genus is expanded to show species, the genus-level nav images hide to make room — the content adapts to the user's current focus | LOW | CSS/JS: when a child section opens, parent images get `hidden` attribute or CSS display:none |

---

## Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Auto-select "best" nav image via algorithm | Saves manual curation time | Image quality for identification is subjective; algorithmic selection (highest resolution, most-observed) often picks photos that are not diagnostically useful — iNaturalist community has explicitly discussed this problem | `navigational` flag lets curators choose; fallback to weight=1 (photographer-ordered) is a reasonable default with low editorial overhead |
| Expand-all / collapse-all buttons | Seems useful for power users | With 700 species across 10 families, expanding everything produces an overwhelming wall of text and triggers 700+ image loads simultaneously | Show all collapsed on load; let users drill down one level at a time |
| Infinite scroll or pagination within the browse tree | Familiar from feed-style apps | Taxonomy is not a feed; users navigate the tree spatially; pagination destroys the ability to scan by family | Keep all families visible collapsed; families are ~10, manageable without pagination |
| Lazy-load images inside collapsed sections | Sounds like a performance win | Browser native `loading="lazy"` does not trigger until the element is visible in the viewport; collapsed content is visually hidden but still in the DOM — images would load on scroll even when collapsed. Custom lazy-load on accordion expand adds JS complexity for marginal gain given images are small (141×93px thumbnails) | Serve thumbnails at appropriate size; `loading="lazy"` on img elements is fine since collapsed content is typically off-screen anyway; don't implement custom intersection-observer logic |
| Location-based "what's flying near me" auto-filter | Seems like a high-value user feature | Geolocation permission friction; browser location ≠ state boundary; requires client-side coordinate-to-state mapping | State dropdown/checkbox filter is simpler, privacy-friendly, and sufficient for the audience |
| Deep URL per accordion state (e.g., `?open=Sphingidae`) | Enables shareable links to open states | Accordion state is a browsing convenience, not a canonical resource; the species factsheet is the shareable URL | Each species factsheet already has a canonical URL; link there instead |
| Search within browse page | Seems redundant to add a search box on browse | Pagefind already handles site-wide search; adding a second client-side search on the browse page duplicates functionality and adds bundle weight | Link to Pagefind search from browse page header |

---

## Feature Dependencies

```
subfamily column in species.csv
    └──required by──> Family → Subfamily → Genus accordion rendering
                          └──required by──> images-per-taxon display

navigational flag in images.csv
    └──required by──> curated nav image selection
                          └──enhances──> per-taxon image display

Fallback (lowest-weight species photos)
    └──required by──> per-taxon image display (when no navigational flags set)

species-×-state Parquet (build pipeline)
    └──required by──> client-side state filter Lit component

client-side state filter
    └──depends on──> species-×-state Parquet
    └──enhances──> accordion browse (hides taxa with no records in selected states)

Per-genus static pages (/browse/{genus}/)
    └──conflicts with──> single-page accordion browse (replace, not supplement)
```

### Dependency Notes

- **`subfamily` column required before accordion rendering:** The build-time Eleventy data pipeline (`families.js`) needs to group genera under subfamilies. The DuckDB query needs this column. Add it first.
- **Nav image selection requires both `navigational` flag AND fallback logic:** They are two sides of the same feature. Implement the fallback first (it works on existing data), then add `navigational` flag support.
- **State filter Parquet is a new build artifact:** The pipeline emits a species-×-state cross-reference (species_slug, state, record_count or boolean) from `records.csv`. This is a new DuckDB query in the build pipeline, separate from per-species Parquet files.
- **Per-genus static pages must be explicitly retired:** Eleventy currently generates `/browse/{genus}/index.html` via pagination. Removing `genus.njk` (or its pagination config) will stop generating these. The accordion browse page replaces all of them.

---

## MVP Definition

### Launch With (v1.3)

This is the complete milestone — all items are required to replace the existing browse.

- [ ] `subfamily` column in `species.csv` (nullable) — enables 4-level hierarchy
- [ ] `navigational` flag in `images.csv` (boolean) — enables curated nav image selection
- [ ] Build pipeline: nav image query per taxon node (flagged images, fallback to weight=1 per species, cap 4)
- [ ] Build pipeline: species-×-state Parquet emitted from `records.csv`
- [ ] Single `/browse/` page: accordion Lit component (Family → Subfamily → Genus → Species)
- [ ] Images on by default; show/hide checkbox persists per-session (sessionStorage or just checkbox state)
- [ ] Expanding genus shows species list and hides parent taxon images
- [ ] Client-side state filter: Lit component reads species-×-state Parquet, filters accordion nodes
- [ ] Per-genus static pages (`/browse/{genus}/`) retired (remove `genus.njk` pagination)
- [ ] Graceful JS-off: all taxa and species names visible as static HTML

### Deferred (not in v1.3)

- [ ] Shareable URLs for accordion state — not needed; species factsheets are the canonical URLs
- [ ] "Expand all" / "Collapse all" — anti-feature; excluded intentionally
- [ ] Nav image lightbox on browse page — thumbnails link to species factsheet; lightbox is on the factsheet
- [ ] Geographic filter beyond state level (county, elevation) — deferred to v2 per PROJECT.md

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Accordion Family → Subfamily → Genus | HIGH | MEDIUM | P1 |
| Images per taxon (with fallback) | HIGH | MEDIUM | P1 |
| `navigational` flag on images.csv | MEDIUM | LOW | P1 |
| `subfamily` column in species.csv | HIGH | LOW | P1 (data dependency) |
| Species list inside expanded genus | HIGH | LOW | P1 |
| Show/hide images toggle | MEDIUM | LOW | P1 |
| Build pipeline: species-×-state Parquet | HIGH | MEDIUM | P1 (filter dependency) |
| Client-side state filter | HIGH | MEDIUM | P1 |
| Retire per-genus static pages | LOW user-visible | LOW | P1 (cleanup, correctness) |
| Images collapse when drilling down | LOW | LOW | P2 |
| Session-persist show/hide state | LOW | LOW | P2 |

**Priority key:**
- P1: Required for v1.3 milestone completion
- P2: Polish; add within v1.3 if time permits, otherwise v1.3.x

---

## Competitor Feature Analysis

| Feature | pnwmoths.biol.wwu.edu (original) | BAMONA | iNaturalist | Our Approach |
|---------|----------------------------------|--------|-------------|--------------|
| Taxonomy hierarchy | 4-level via URL path navigation (separate pages) | Text list, click to family page | Separate taxon pages per rank | Single-page accordion, all levels inline |
| Images per taxon in browse | 4 thumbnails per genus at subfamily page | None at genus/family level; photos on species page only | One curated "taxon photo" per entry | Up to 4 per taxon node, flagged or fallback |
| Geographic filter on browse | None | Regional checklists (separate pages, server-rendered) | Place-based filter (server-side, login optional) | Client-side state checkbox/dropdown, Parquet-backed |
| Image show/hide | Not present | Not applicable | Not present | Checkbox toggle, images on by default |
| Inline drill-down | No (separate page per level) | No (separate page per family) | No (separate page per rank) | Yes (accordion, all levels on one page) |

---

## Accordion UX Specifics

### Pattern choice: `<details>`/`<summary>` vs. Lit button/`aria-expanded`

**Use `<details>`/`<summary>` for the accordion structure.** Reasons:

- Native browser support; zero JS needed for basic expand/collapse
- Correct accessibility semantics without manual ARIA
- Lit can enhance it (e.g., for image toggle behavior, filter visibility) without replacing the semantic base
- VoiceOver has a known (July 2024) issue where it does not announce state change on `<details>` expand, but does announce current state on focus — acceptable for this use case
- WAI-ARIA APG accordion pattern (button + `aria-expanded`) is more robust for screenreaders but requires more JS; only needed if `<details>` proves insufficient

**Keyboard interaction (per WAI-ARIA APG):**
- Enter/Space on `<summary>` = expand/collapse (native)
- Tab/Shift+Tab = navigate to next interactive element (native)
- No arrow-key navigation needed for 3–4 level hierarchy; that pattern is for long lists of options, not nested trees

### Multiple open sections

Allow multiple families/genera open simultaneously. Auto-close behavior is an anti-pattern for taxonomy browse because users frequently compare species across genera.

### Expand state on page load

All sections start collapsed. This keeps initial page weight and visual complexity low. Users who want to browse a specific family expand it.

---

## Navigation Image Selection Logic

### Build-time query (DuckDB)

For each taxon node (family, subfamily, genus), compute nav images:

1. Select images with `navigational = true` for all species in that taxon, ordered by weight ASC, LIMIT 4
2. If count < 4, fill remaining slots from images with weight = 1 for species in that taxon that have no flagged navigational image (fallback)
3. Cap total at 4

This produces a deterministic, predictable set. Fallback ensures no empty thumbnails on launch before curators have flagged images.

### Image quality criteria (from iNaturalist community research)

A good navigation image:
- Shows diagnostic features clearly at small size (thumbnail ~141×93px)
- Shows the most common form/sex/season variant first
- Prefers dorsal forewing view for moths (the standard identification view)
- Can be "imperfect" — a blurry photo is better than no photo

**Recommendation:** The `navigational` flag is for curator judgment. Do not add algorithmic filtering beyond weight ordering for the fallback. The weight column already encodes photographer preference (weight=1 = their best shot).

---

## Client-Side State Filter

### Data shape

Build pipeline emits a single Parquet file (e.g., `species-states.parquet`) with schema:

```
species_slug: VARCHAR
state: VARCHAR
```

One row per (species, state) pair that has at least one record. Alternatively a JSON file since this is much smaller than per-species occurrence Parquet.

**Recommendation:** JSON is simpler here — the file will be ~700 species × ~10 states = ~7,000 rows, trivially small. Parquet adds hyparquet dependency for a file that doesn't benefit from columnar compression at this scale. Emit as `species-states.json` from DuckDB.

### Filter behavior

- User selects one or more states (checkbox list or multi-select)
- Lit component reads species-states.json on first state selection (lazy load)
- Accordion nodes (genus, subfamily, family) are hidden if they have no species with records in selected states
- Species items within an expanded genus are hidden if not recorded in selected states
- Clear filter button restores all nodes

### States for PNW Moths

Washington, Oregon, Idaho, Montana, British Columbia — the relevant states/provinces for the PNW region. The filter should show only states/provinces that appear in `records.csv` (derived from data, not hardcoded list).

---

## Sources

- [PNW Moths original site — subfamily browse page](https://pnwmoths.biol.wwu.edu/browse/family-erebidae/subfamily-hypeninae/)
- [PNW Moths original site — homepage](https://pnwmoths.biol.wwu.edu/)
- [BAMONA — Crambidae family taxonomy page](https://www.butterfliesandmoths.org/taxonomy/Crambidae)
- [BAMONA — taxonomy overview](https://www.butterfliesandmoths.org/taxonomy)
- [iNaturalist — taxon photo guidelines](https://help.inaturalist.org/en/support/solutions/articles/151000184018-what-guidelines-should-i-follow-when-choosing-taxon-photos-)
- [iNaturalist — Explore screen (species grid + geographic filter)](https://help.inaturalist.org/en/support/solutions/articles/151000198035-inaturalist-iphone-app-the-explore-screen)
- [iNaturalist community — species thumbnail design discussion](https://forum.inaturalist.org/t/display-unique-species-thumbnails-in-every-place/71600)
- [WAI-ARIA Accordion Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/accordion/)
- [Accessible accordions with `<details>` and `<summary>`](https://www.hassellinclusion.com/blog/accessible-accordions-part-2-using-details-summary/)
- [MDN — `aria-expanded`](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-expanded)
- [web.dev — Browser-level image lazy loading](https://web.dev/articles/browser-level-image-lazy-loading)

---

*Feature research for: PNW Moths v1.3 Visual Browse milestone*
*Researched: 2026-04-18*
