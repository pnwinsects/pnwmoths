# Requirements: v1.2 Tech Debt

**Milestone:** v1.2
**Goal:** Clear all deferred code-quality issues from v1.1.

---

## Code Quality

- [ ] **WR-01**: Build script validates `image_filename` values in glossary.csv against a safe-filename pattern before import, failing the build on invalid values
- [ ] **WR-02**: Pagefind CSS `<link>` is placed in `<head>` (not body) on the search page, eliminating flash of unstyled content
- [ ] **WR-03**: DuckDB connection opened in glossary.js is closed after the query completes, eliminating the resource leak
- [ ] **WR-04**: `check-page-weight.js` handles missing files (ENOENT) without crashing, logging a warning instead

---

## Future Requirements

_(None identified — this milestone is a focused cleanup sprint)_

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| MAINT-03: verify build time under 5 min | Requires live CI observation; not a code change |
| Deploy to real hosting | Separate initiative; deferred to v1.3 or later |
| Visual regression tests | New infrastructure; deferred to future milestone |

---

## Traceability

| REQ-ID | Phase | Plan |
|--------|-------|------|
| WR-01  | —     | —    |
| WR-02  | —     | —    |
| WR-03  | —     | —    |
| WR-04  | —     | —    |
