# Requirements: pnwmoths v5.0 — Administrative Districts

**Defined:** 2026-07-04
**Core Value:** Prove that a static build pipeline can replace a Django/CMS stack for a data-heavy natural history site — and that non-technical maintainers can keep it running.
**Milestone goal:** Give every occurrence record an accurate county / regional-district (re-joining curated legacy data, deriving from coordinates to fill gaps and catch data-entry errors) and add a PNW-scoped county/regional-district filter to the Browse page. (Issues #25, #96.)

## v5.0 Requirements

Requirements for this milestone. Each maps to exactly one roadmap phase.

### District Assignment

The data pipeline that gives each record a county (US) / regional district (BC). Runs offline as maintainer-run, additive-only scripts that write back into committed `data/records.csv`; re-running after adding records assigns the new ones (the static-site equivalent of "assign on upload").

- [x] **DIST-01**: A maintainer-run script re-joins the reference DB's curated county/regional-district onto `data/records.csv`, raising county fill from ~2.8% to ~96%+; it is additive-only and never overwrites a non-blank stated value
- [x] **DIST-02**: A committed, curator-reviewable name→stable-ID crosswalk (US GEOID / BC CDUID) resolves every legacy county/regional-district name — including renamed districts such as "Skeena-Queen Charlotte" → "North Coast" — to a current boundary ID; joins never depend on raw name string-matching
- [x] **DIST-03**: US county + BC regional-district boundary polygons covering WA/OR/ID/MT + BC are acquired once, simplified, reprojected to WGS84, and committed as small GeoJSON under `data/boundaries/`
- [x] **DIST-04**: A shared point-in-polygon module derives a record's district from its coordinates, applying a mandatory lon/lat axis-order guard + bounds sanity gate (lat ∈ [41, 61], lon ∈ [−140, −109]) before any assignment
- [x] **DIST-05**: A maintainer-run script fills the remaining records that lack a district from their coordinates (additive-only), with a nearest-boundary-within-tolerance fallback so coastal/near-water points are assigned rather than dropped
- [x] **DIST-06**: The assignment workflow (legacy re-join + coordinate fill) is documented for maintainers as a repeatable, additive step to run after adding records, mirroring the existing `_instructions/` runbook pattern

### Quality Control

Surfaces likely data-entry errors without blocking the build — the QC half of issue #25.

- [x] **QC-01**: A non-blocking, unlinked report artifact (`_site/records-district-audit.csv`, mirroring `species-audit.csv`) is emitted each build, flagging records whose stated county disagrees with the coordinate-derived district or whose coordinates fall outside all known boundaries; the build never fails on a mismatch
- [x] **QC-02**: Each flagged record is bucketed into a confidence tier (same / adjacent-and-close / far-mismatch / outside-all-boundaries), sorted by severity with summary counts, so the report stays curator-reviewable instead of scaling into noise
- [x] **QC-03**: Records with missing coordinates pass through with no district assigned and no false QC flag

### Browse District Filter

The county/regional-district filter on `/browse/` — issue #96.

- [x] **BFILT-01**: A build-time species×district aggregate (`_site/species-districts.json`), compound-keyed `${state}:${district}` to avoid cross-state county-name collisions, is emitted alongside the existing `species-states.json`
- [x] **BFILT-02**: A single-select district filter is added to `/browse/` (`pnwm-taxon-browser`), state-scoped/cascading against the existing state filter, muting (not hiding) taxa with no records in the selected district
- [x] **BFILT-03**: Filter options are restricted to the PNW allow-list — BC, WA, OR, ID, and an explicit, committed western-MT county list (default: the 10 counties west of the Continental Divide — Flathead, Granite, Lake, Lincoln, Mineral, Missoula, Powell, Ravalli, Sanders, Silver Bow; Glacier excluded; curator-adjustable); Alberta and eastern-MT are excluded from the dropdown while their records keep any assigned district
- [x] **BFILT-04**: The filter labels options per jurisdiction — "Regional District" for BC, "County" for US states — switched dynamically by the selected state/province
- [x] **BFILT-05**: The browse page's no-JS degradation and existing static listing remain intact with the district filter added

## Future Requirements

Deferred to a later v5.x release. Tracked but not in this roadmap.

### Quality Control Enhancements

- **QCX-01**: Distance-to-nearest-boundary numeric score per QC-report row (beyond the confidence tier), so curators can sort by how far off a record is
- **QCX-02**: A curator-maintained accepted-exceptions override CSV (mirrors `species-synonyms.csv`) that suppresses known-good historical-locality mismatches from the QC report

### Browse Filter Enhancements

- **BFILT-06**: Searchable/typeahead district combobox (deferred — unlikely to be needed at ≤~60 total entries)
- **BFILT-07**: Multi-select district filter (no stated need yet)

## Out of Scope

Explicitly excluded. Anti-features from research included with reasoning.

| Feature | Reason |
|---------|--------|
| Auto-overwriting a stated county with the coordinate-derived value | Curator-entered data is authoritative; assignment is additive-only and disagreements are flagged, never silently replaced (issue #25's stated intent) |
| Build-blocking on QC mismatches | Legacy georeferencing noise near boundaries would block deploys; report is advisory (chosen decision) |
| Build-time / on-every-build spatial join | Assignment runs offline once and writes back to committed `records.csv`; `npm run build` stays network-free and deterministic |
| Map-click district-correction UI | Requires a server/interactive editor; violates the static-site, flat-file-editing constraint |
| Nationwide / all-of-Canada district coverage | Filter is scoped to the PNW region (BC/WA/OR/ID/W-MT) per issue #96 |
| Alberta and eastern-Montana in the Browse filter dropdown | Out of the PNW region scope; records still retain any assigned district |
| Python/GDAL/PostGIS spatial microservice | Breaks the TS-only, no-server pipeline invariant; DuckDB spatial / pure-JS PIP suffices |

## Traceability

Which phases cover which requirements. Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DIST-01 | Phase 44 | Complete |
| DIST-02 | Phase 44 | Complete |
| DIST-03 | Phase 45 | Complete |
| DIST-04 | Phase 46 | Complete |
| DIST-05 | Phase 46 | Complete |
| DIST-06 | Phase 46 | Complete |
| QC-01 | Phase 47 | Complete |
| QC-02 | Phase 47 | Complete |
| QC-03 | Phase 47 | Complete |
| BFILT-01 | Phase 48 | Complete |
| BFILT-02 | Phase 48 | Complete |
| BFILT-03 | Phase 48 | Complete |
| BFILT-04 | Phase 48 | Complete |
| BFILT-05 | Phase 48 | Complete |

**Coverage:**

- v5.0 requirements: 14 total
- Mapped to phases: 14 (Phases 44–48) ✓
- Unmapped: 0

---
*Requirements defined: 2026-07-04*
*Last updated: 2026-07-04 after initial definition*
