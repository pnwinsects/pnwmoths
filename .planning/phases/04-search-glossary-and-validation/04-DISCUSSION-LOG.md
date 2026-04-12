# Phase 4: Search, Glossary, and Validation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-12
**Phase:** 04-search-glossary-and-validation
**Areas discussed:** Glossary data source, Validation failure modes, Search UI integration

---

## Glossary Data Source

| Option | Description | Selected |
|--------|-------------|----------|
| Single CSV file | data/glossary.csv — consistent with data/species.csv pattern | ✓ |
| Markdown files per term | content/glossary/{term}.md — richer formatting | |
| Single Markdown file | content/glossary.md — simplest to author | |

**User's choice:** Single CSV file
**Notes:** User noted that most glossary terms in the existing site have images — resolved with an `image_filename` + `photographer` column in glossary.csv rather than a separate glossary-images.csv.

---

## Glossary Image Model

| Option | Description | Selected |
|--------|-------------|----------|
| image_filename column in glossary.csv | Nullable column; one image per term | ✓ |
| Separate glossary-images.csv | Mirrors data/images.csv; supports multiple images per term | |

**User's choice:** image_filename column in glossary.csv

---

## Validation — Data Integrity (VALD-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Hard fail | Bad data aborts the build | ✓ |
| Warn only | Prints errors, build continues | |

**User's choice:** Hard fail

---

## Validation — Page Weight (VALD-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Warn at 500KB, don't fail | Informational warning | ✓ |
| Hard fail at 500KB | Blocks deploy | |
| Different threshold | Custom KB value | |

**User's choice:** Warn at 500KB, don't fail

---

## Validation — Link Checker Tool (VALD-01)

| Option | Description | Selected |
|--------|-------------|----------|
| lychee | Rust binary, checks _site/ directory | ✓ |
| Custom Node.js script | No external binary | |
| You decide | Leave to planner | |

**User's choice:** lychee

---

## Search UI Integration

| Option | Description | Selected |
|--------|-------------|----------|
| Pagefind built-in UI widget | Drop-in widget, CSS variable overrides | ✓ |
| Custom HTML with Pagefind JS API | Full control, more code | |
| Lit web component wrapping Pagefind API | Consistent with Phase 3 pattern, most code | |

**User's choice:** Pagefind's built-in UI widget

---

## Search UI Styling

| Option | Description | Selected |
|--------|-------------|----------|
| Pagefind CSS variables only | Override --pagefind-ui-* to match Pico palette | ✓ |
| Skip Pagefind's CSS entirely | Write minimal CSS from scratch | |
| You decide | Leave to planner | |

**User's choice:** Pagefind CSS variables only

---

## Claude's Discretion

- Pagefind configuration details (indexing options, bundle location)
- VALD-03 exact PNW coordinate bounds
- Page weight script implementation (Node.js or shell)
- How lychee is invoked in the build pipeline

## Deferred Ideas

None surfaced during discussion.
