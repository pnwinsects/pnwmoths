# Requirements: v2.1 Species Fact Sheet Gaps

**Milestone goal:** Close the remaining UX and feature gaps between pnwmoths and the reference pnwinsects-app on species fact sheet pages.

---

## v2.1 Requirements

### Chart Improvements
- [ ] **CHART-01**: User sees axis labels on the phenology chart — X-axis labeled "Month", Y-axis labeled "# Records"
- [ ] **CHART-02**: Phenology chart Y-axis begins at 0 and scales to the highest monthly record count

### Photo Navigation
- [ ] **PHOTO-01**: User sees a thumbnail strip below the main species image; clicking any thumbnail selects it as the main displayed image
- [ ] **PHOTO-02**: Thumbnail strip replaces dot navigation for multi-image species (dots removed)
- [ ] **PHOTO-03**: User can close the lightbox via the close button (fix carry-forward bug)

### Data Filters
- [ ] **FILT-01**: User can filter occurrence records by county using a dropdown populated from the species' data
- [ ] **FILT-02**: User can filter occurrence records by collection using a dropdown populated from the species' data
- [ ] **FILT-03**: User can filter occurrence records by elevation range using a min/max slider (feet)
- [ ] **FILT-04**: County, collection, and elevation filters update the map and phenology chart in real time

### Similar Species
- [ ] **SIM-01**: Similar species section displays a thumbnail image for each similar species, loaded from CDN
- [ ] **SIM-02**: Similar species thumbnail entries are clickable links to the respective species pages

---

## Future Requirements

- Multi-select dropdowns for state and record type (reference app had multi-select; current pnwmoths uses single-select)
- Subspecies filter (data exists in records but not exposed in UI)
- Month/day filters (reference app had these; low value for current dataset density)

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| County/collection multi-select | Single-select sufficient for v2.1; multi-select adds implementation complexity |
| Subspecies, linked_photo filters | Low value for current data; deferred |
| Month/day discrete filters | Low value; year range slider covers the primary use case |
| Photographic plate link on species pages | Plates are not linked to species in current data model; deferred |
| Zoomify / deep-zoom viewer | Out of scope (established v1.0 decision) |

---

## Traceability

| Phase | Requirements |
|-------|-------------|
| TBD   | CHART-01, CHART-02 |
| TBD   | PHOTO-01, PHOTO-02, PHOTO-03 |
| TBD   | FILT-01, FILT-02, FILT-03, FILT-04 |
| TBD   | SIM-01, SIM-02 |
