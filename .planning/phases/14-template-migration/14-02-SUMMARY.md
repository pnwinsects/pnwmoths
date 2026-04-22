---
phase: 14-template-migration
plan: "02"
subsystem: ui
tags: [eleventy, nunjucks, cdn, bunnynet, templates, images]

# Dependency graph
requires:
  - phase: 14-template-migration/14-01
    provides: urlencode Nunjucks filter and cdnBaseUrl global registered in Eleventy

provides:
  - species factsheet photos served via CDN (pnwmoths.b-cdn.net/{slug}/{encoded-filename})
  - glossary portrait images served via CDN with Bunny Optimizer 1x params (width=188, height=225, crop_gravity=north)
  - glossary portrait srcset with 2x descriptor (width=376, height=450)
  - | url filter removed from all CDN image expressions in templates

affects:
  - 14-03-lfs-removal (templates no longer reference local /images/ paths)
  - 14-04-ci-update (CI no longer needs LFS checkout for image src to resolve)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Species CDN URL: {{ cdnBaseUrl }}/{{ sp.slug }}/{{ img.filename | urlencode }}"
    - "Glossary CDN URL: {{ cdnBaseUrl }}/glossary/{{ term.image_filename | urlencode }}?width=188&height=225&crop_gravity=north"
    - "Glossary srcset 2x: {{ cdnBaseUrl }}/glossary/{{ term.image_filename | urlencode }}?width=376&height=450&crop_gravity=north 2x"
    - "No | url filter on absolute CDN URLs — pathPrefix must not be prepended to external URLs"

key-files:
  created: []
  modified:
    - src/species/species.njk
    - src/glossary/index.njk

key-decisions:
  - "No srcset on species photo img — pnwm-image-slideshow drops srcset on slotted img elements in connectedCallback (CONTEXT.md D-04); deferred to Phase 16"
  - "No Bunny Optimizer query params on species photo URLs — not required by Phase 14 success criteria; deferred to Phase 16"
  - "grep '| url' matching urlencode is a false positive — the | url pathPrefix filter is fully eliminated; urlencode contains the substring 'url'"

patterns-established:
  - "CDN Nunjucks image pattern: {{ cdnBaseUrl }}/path/{{ filename | urlencode }}?optimizer_params"
  - "2x srcset uses doubled pixel dimensions with same crop_gravity param"

requirements-completed: [TMPL-03, TMPL-04, TMPL-06]

# Metrics
duration: 3min
completed: 2026-04-22
---

# Phase 14 Plan 02: Template Migration Summary

**Species factsheet and glossary portrait img tags rewritten to CDN URLs with Bunny Optimizer params and 2x srcset; all local /images/ paths and | url filters eliminated from both templates**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-22T20:43:22Z
- **Completed:** 2026-04-22T20:46:30Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Replaced `/images/{{ sp.slug }}/{{ img.filename }}` with `{{ cdnBaseUrl }}/{{ sp.slug }}/{{ img.filename | urlencode }}` in species.njk
- Replaced `{{ ('/images/glossary/' + term.image_filename) | url }}` with CDN URL + Bunny Optimizer params in glossary/index.njk
- Added `srcset` attribute to glossary portrait img with 2x descriptor (doubled pixel dimensions, same crop_gravity)
- Removed `| url` filter from glossary image expression — absolute CDN URLs must not be prefixed by pathPrefix
- Build exits 0; 0 link checker errors; CDN URLs confirmed present in built HTML artifacts

## Task Commits

Each task was committed atomically:

1. **Task 1: Update species photo img src to CDN URL** - `26f1855` (feat)
2. **Task 2: Update glossary portrait img src to CDN URL + add srcset** - `83c3e8e` (feat)

## Files Created/Modified
- `/Users/rainhead/dev/pnwmoths/src/species/species.njk` - img src changed from local /images/ path to cdnBaseUrl + urlencode pattern
- `/Users/rainhead/dev/pnwmoths/src/glossary/index.njk` - img src rewritten to CDN URL with Optimizer params; srcset 2x added; | url filter removed

## Decisions Made
- No `srcset` on species photo img elements — `pnwm-image-slideshow` web component drops `srcset` on slotted img elements during `connectedCallback` (CONTEXT.md D-04); wiring srcset at the template level would have no effect; deferred to Phase 16
- No Bunny Optimizer query params on species photo URLs — not required by Phase 14 success criteria; defer to Phase 16
- `grep '| url'` matches `urlencode` (substring), producing apparent false positives. Used `grep ' | url[^e]'` to confirm the actual `| url` pathPrefix filter is fully absent (0 matches)

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
Minor: plan verification command `grep -c '| url' src/glossary/index.njk` produces 2 false-positive matches because `| urlencode` contains the substring `| url`. Verified using `grep ' | url[^e]'` which correctly returns 0. The `| url` pathPrefix filter is fully eliminated.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All Nunjucks templates now use CDN URLs; no local `/images/` paths remain in species.njk or glossary/index.njk
- LFS removal (Phase 14 next plans) can proceed; templates no longer reference local image paths
- CI/CD update (drop LFS checkout) can proceed
- No blockers

---
*Phase: 14-template-migration*
*Completed: 2026-04-22*
