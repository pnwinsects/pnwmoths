# Requirements: PNW Moths

**Defined:** 2026-04-23
**Core Value:** Prove that a static build pipeline can replace a Django/CMS stack for a data-heavy natural history site — and that non-technical maintainers can keep it running.

## v2.0 Requirements

Requirements for the Glossary Tooltips milestone. Each maps to roadmap phases.

### Glossary Transform

- [x] **GLOS-01**: Build emits species prose HTML with the first occurrence of each glossary term wrapped in `<abbr class="glossary-term">` carrying `title`, `data-definition`, and `data-image-url` attributes
- [x] **GLOS-02**: Term matching is case-insensitive and whole-word only (no partial matches inside longer words)
- [x] **GLOS-03**: Terms containing regex metacharacters (e.g., `1A+2A`, `W-mark`, `CuA1`) are safely escaped before matching
- [x] **GLOS-04**: Only the first occurrence of each term per page is wrapped; subsequent occurrences are left as plain text
- [x] **GLOS-05**: Transform runs only on species pages; the `/glossary/` page and browse pages are excluded
- [x] **GLOS-06**: `<abbr title="[definition excerpt]">` provides a no-JS degradation path so the definition is accessible without JavaScript

### Tooltip / Popover UI

- [x] **TIP-01**: Hovering or focusing a wrapped glossary term opens a popover panel showing the full definition text
- [x] **TIP-02**: Popover panel includes the CDN glossary image when the term has one (image URL from `data-image-url`); image-less terms show definition only
- [x] **TIP-03**: Popover is implemented via the native HTML Popover API with a small JS event-listener layer (~20 lines, no external library); it dismisses on mouseout/blur and via Escape

### Quality

- [x] **QA-01**: Automated unit tests cover: regex metacharacter escaping, first-occurrence deduplication per page, and prose-scope guard (glossary and browse pages are not transformed)
- [x] **QA-02**: Pagefind index verified to not include definition text (definition lives in `data-*` attributes, which Pagefind does not index)

## Future Requirements

Acknowledged but deferred beyond v2.0.

### Glossary Transform

- **GLOS-07**: Plural and morphological variants matched (e.g., "larva" matches "larvae") — requires stemming or manual synonym entries in glossary.csv

### Tooltip / Popover UI

- **TIP-04**: CSS Anchor Positioning for tooltip placement (Baseline 2026; not yet cross-browser)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Client-side term scanning (runtime JS) | Build-time transform is the agreed approach; runtime scanning adds JS weight and flash of unstyled content |
| External tooltip library (Floating UI, Tippy.js) | Native Popover API is sufficient; no new runtime dependency |
| Highlighting terms on non-species pages (browse, glossary, etc.) | User scoped to species prose only |
| Build-time performance gate (MAINT-03) | Carry-forward item; tracked separately in STATE.md |
| Advanced filtering (FILT-01, FILT-02) | Deferred to future milestone |
| Django URL redirects (SEO-01) | Deferred to future milestone |
| Photographic plates page (PLAT-01, PLAT-02) | Deferred to future milestone |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| GLOS-01 | Phase 19 | Complete |
| GLOS-02 | Phase 19 | Complete |
| GLOS-03 | Phase 19 | Complete |
| GLOS-04 | Phase 19 | Complete |
| GLOS-05 | Phase 19 | Complete |
| GLOS-06 | Phase 19 | Complete |
| TIP-01 | Phase 20 | Complete |
| TIP-02 | Phase 20 | Complete |
| TIP-03 | Phase 20 | Complete |
| QA-01 | Phase 19 | Complete |
| QA-02 | Phase 20 | Complete |

**Coverage:**
- v2.0 requirements: 11 total
- Mapped to phases: 11
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-23*
*Last updated: 2026-05-19 after v2.0 milestone completion*
