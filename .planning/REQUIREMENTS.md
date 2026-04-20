# Requirements: PNW Moths Static Site — v1.3 Visual Browse

**Defined:** 2026-04-20
**Core Value:** Prove that a static build pipeline can replace a Django/CMS stack for a data-heavy natural history site — and that non-technical maintainers can keep it running.

## v1.3 Requirements

### Taxonomy Data

- [ ] **TAXON-01**: `subfamily` column added to `species.csv`; genera without a subfamily fall directly under their family in the browse hierarchy
- [ ] **TAXON-02**: `navigational` boolean flag added to `images.csv`; marks images as candidates for browse navigation thumbnails
- [ ] **TAXON-03**: Build pipeline validates both new columns; blank `subfamily` treated as null (not empty string); `navigational` defaults to false when absent

### Browse Page

- [ ] **BROWSE-01**: `/browse/` replaced by a single dynamic page mounting a `<pnwm-taxon-browser>` Lit component; per-genus static pages (`/browse/{genus}/`) retired
- [ ] **BROWSE-02**: Accordion lists all families collapsed by default, each with up to 4 navigation images
- [ ] **BROWSE-03**: Expanding a family reveals its subfamilies (or genera if no subfamily exists for that family) with up to 4 images; parent images hidden while expanded
- [ ] **BROWSE-04**: Expanding a subfamily reveals its genera with up to 4 images; subfamily images hidden while expanded
- [ ] **BROWSE-05**: Expanding a genus reveals its species as links to species factsheet pages
- [ ] **BROWSE-06**: Navigation images fall back to `navigational`-flagged images from member species; further fallback to lowest-weight photos when none flagged
- [ ] **BROWSE-07**: Show/hide images toggle on by default; `<noscript>` static listing of all taxa visible without JS

### State Filter

- [ ] **SFILT-01**: Build pipeline emits `species-states.json` (DISTINCT species_slug × state) to `_site/`
- [ ] **SFILT-02**: Browse page state filter hides taxa with no occurrence records in selected states

## Future Requirements

### Browse Polish

- **BROWSE-08**: Images collapse when drilling into a child taxon (images visible at family level hide when subfamily expanded, etc.)
- **BROWSE-09**: Show/hide images toggle state persists across page reloads (sessionStorage)

### Filtering

- **FILT-03**: Browse page county filter (hides taxa with no records in selected counties)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Expand-all / collapse-all | Anti-feature at 700 species — triggers mass image load |
| Shareable accordion URLs (deep links) | Species factsheet is canonical URL; accordion state is ephemeral |
| Location-based auto-filter | Adds friction vs. simple state dropdown |
| Search within browse | Pagefind already handles site-wide search |
| County filter (v1.3) | Deferred — state filter sufficient for v1.3; see FILT-03 |
| Advanced filtering (collector, elevation, date range) | Deferred to v2 (FILT-01, FILT-02) |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TAXON-01 | TBD | Pending |
| TAXON-02 | TBD | Pending |
| TAXON-03 | TBD | Pending |
| BROWSE-01 | TBD | Pending |
| BROWSE-02 | TBD | Pending |
| BROWSE-03 | TBD | Pending |
| BROWSE-04 | TBD | Pending |
| BROWSE-05 | TBD | Pending |
| BROWSE-06 | TBD | Pending |
| BROWSE-07 | TBD | Pending |
| SFILT-01 | TBD | Pending |
| SFILT-02 | TBD | Pending |

**Coverage:**
- v1.3 requirements: 12 total
- Mapped to phases: 0 (pending roadmap)
- Unmapped: 12 ⚠️

---
*Requirements defined: 2026-04-20*
*Last updated: 2026-04-20 after initial definition*
