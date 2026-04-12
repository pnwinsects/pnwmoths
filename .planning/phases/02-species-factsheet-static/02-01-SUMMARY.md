---
phase: 02-species-factsheet-static
plan: "01"
subsystem: data-model, templates, eleventy-config
tags: [eleventy, nunjucks, duckdb, pico-css, git-lfs, species-factsheet]
dependency_graph:
  requires: [01-01-SUMMARY, 01-02-SUMMARY]
  provides: [species-factsheet-html, base-layout, images-data, search-stub, glossary-stub]
  affects: [src/_includes/base.njk, src/species/species.njk, src/_data/species.js, src/_data/images.js]
tech_stack:
  added: ["@picocss/pico@2.1.1", "EleventyRenderPlugin (bundled)"]
  patterns: [layout-inheritance-via-content-safe, renderFile-for-md-prose, duckdb-grouped-images, git-lfs-images]
key_files:
  created:
    - data/images.csv
    - src/_data/images.js
    - src/_includes/base.njk
    - src/content/species/acronicta-americana.md
    - src/search/index.njk
    - src/glossary/index.njk
    - .gitattributes
    - images/acronicta-americana/01.jpg
    - images/acronicta-americana/02.jpg
    - images/hyles-lineata/01.jpg
  modified:
    - data/species.csv
    - scripts/build-data.js
    - scripts/build-data.test.js
    - src/_data/species.js
    - src/species/species.njk
    - eleventy.config.js
    - package.json
decisions:
  - "Use EleventyRenderPlugin renderFile (not nunjucks include) for .md prose: nunjucks include silently produced empty output for .md files; renderFile explicitly processes markdown via file extension"
  - "Use content | safe in base.njk layout (not nunjucks block tags): Eleventy layout inheritance injects child content via the content variable, not nunjucks block inheritance"
  - "fileExists filter added to eleventy.config.js to guard renderFile call for optional prose files"
  - "BigInt id normalization: row.id = String(row.id) in species.js after getRowObjectsJS(); images.js uses String(row.species_id) for consistent string-keyed lookup"
metrics:
  duration: "~15 minutes"
  completed: "2026-04-11"
  tasks_completed: 2
  files_changed: 16
---

# Phase 02 Plan 01: Species Factsheet Data Model and Templates Summary

Extends the Phase 1 data pipeline with family/image/similar-species data, creates the shared Pico CSS base layout and site-wide nav, and rewrites the species factsheet template to display taxonomy metadata, prose descriptions, photographer-credited photos, and similar species links.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Extend data model and create data files | 561560f | data/species.csv, data/images.csv, src/_data/images.js, src/_data/species.js, scripts/build-data.js, .gitattributes |
| 2 | Base layout, species template rewrite, Eleventy config | e200cb2 | src/_includes/base.njk, src/species/species.njk, eleventy.config.js, src/search/index.njk, src/glossary/index.njk |

## Verification Results

All acceptance criteria met:

- `npm test` — 6/6 tests pass (including new images.csv validation test)
- `npm run build` — exits 0, 8 HTML files + 9 passthroughs written
- `_site/species/acronicta-americana/index.html` — contains pico.min.css link, nav, dl taxonomy, prose paragraph, figcaption
- `_site/species/autographa-californica/index.html` — contains "No photos on file"
- `_site/species/hyles-lineata/index.html` — contains "Similar species" with slug links
- `_site/search/index.html` — contains "Search coming soon"
- `_site/glossary/index.html` — contains "Glossary coming soon"
- `_site/css/pico.min.css` — exists (passthrough copy)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Nunjucks `include` silently drops .md prose content**
- **Found during:** Task 2 build verification
- **Issue:** `{% include "content/species/slug.md" ignore missing %}` produced empty output — Eleventy's Nunjucks renderer does not process included `.md` files as Markdown.
- **Fix:** Added `EleventyRenderPlugin` to eleventy.config.js and replaced `include` with `{% renderFile prosePath %}` guarded by a `fileExists` filter. renderFile explicitly processes `.md` via file-extension inference.
- **Files modified:** eleventy.config.js, src/species/species.njk
- **Commit:** e200cb2

**2. [Rule 1 - Bug] Nunjucks block tags prevent Eleventy layout content injection**
- **Found during:** Task 2 build verification (empty `<main>` in output)
- **Issue:** `{% block content %}{% endblock %}` in base.njk + `{% block content %}` in child templates produced empty `<main>` — Eleventy layout wrapping injects child content via `{{ content | safe }}`, not via Nunjucks block inheritance.
- **Fix:** Replaced `{% block content %}{% endblock %}` in base.njk with `{{ content | safe }}`; removed block tags from species.njk, search/index.njk, and glossary/index.njk.
- **Files modified:** src/_includes/base.njk, src/species/species.njk, src/search/index.njk, src/glossary/index.njk
- **Commit:** e200cb2

**3. [Rule 1 - Bug] Bad-CSV integration test missing images.csv in tmpDir**
- **Found during:** Task 1 test run
- **Issue:** The integration test that validates bad CSV data created a tmpDir with only species.csv and records.csv. After adding images.csv validation to build-data.js, the test failed with "Cannot read data/images.csv" instead of "Validation failed".
- **Fix:** Added `copyFileSync(images.csv)` to the test's tmpDir setup.
- **Files modified:** scripts/build-data.test.js
- **Commit:** 561560f

## Known Stubs

- `src/search/index.njk` — "Search coming soon" placeholder. Phase 4 will implement Pagefind search.
- `src/glossary/index.njk` — "Glossary coming soon" placeholder. Phase 4 will implement glossary.
- Similar species link text displays raw slugs (e.g. "acronicta-americana") rather than human-readable names. Phase 3 can improve via DuckDB self-join per RESEARCH.md open question 2.

## Threat Flags

None. All mitigations from the plan's threat model were implemented:
- T-02-01: Filename validation regex `/^[a-zA-Z0-9._-]+$/` in build-data.js (mitigate — done)
- T-02-02: Nunjucks auto-escapes photographer names (accept — inherent)
- T-02-03: Slugs auto-escaped in href (accept — inherent)
- T-02-04: Prose files are repo-controlled author content (accept — inherent)

## Self-Check: PASSED

Files exist:
- data/images.csv: FOUND
- src/_data/images.js: FOUND
- src/_includes/base.njk: FOUND
- src/species/species.njk: FOUND
- src/content/species/acronicta-americana.md: FOUND
- src/search/index.njk: FOUND
- src/glossary/index.njk: FOUND
- .gitattributes: FOUND

Commits exist:
- 561560f: FOUND
- e200cb2: FOUND
