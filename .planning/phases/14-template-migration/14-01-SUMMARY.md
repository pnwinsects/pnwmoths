---
phase: 14-template-migration
plan: "01"
subsystem: infra
tags: [eleventy, nunjucks, lit, cdn, bunnynet, javascript]

# Dependency graph
requires:
  - phase: 13-cdn-provisioning
    provides: CDN_BASE_URL constant in eleventy.config.js and provisioned bunny.net Pull Zone
provides:
  - urlencode Nunjucks filter registered in Eleventy (encodeURIComponent)
  - cdnBaseUrl global data available to all Nunjucks templates as the string "https://pnwmoths.b-cdn.net"
  - CDN_BASE_URL module-level constant in pnwm-taxon-browser.js
  - Both taxon browser image src sites rewritten to CDN URLs with encodeURIComponent and ?height=186
affects:
  - 14-02-template-updates (requires cdnBaseUrl global and urlencode filter from this plan)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CDN URL construction: CDN_BASE_URL + '/' + encodeURIComponent(filename) + '?height=186'"
    - "Nunjucks CDN URL pattern: {{ cdnBaseUrl }}/path/{{ filename | urlencode }} (available to Plan 02)"
    - "Module-level constant (not Lit property) for CDN base URL in web components (D-05)"

key-files:
  created: []
  modified:
    - eleventy.config.js
    - src/components/pnwm-taxon-browser.js

key-decisions:
  - "urlencode filter uses encodeURIComponent (not encodeURI) to handle spaces, parentheses, +, # in Django filenames"
  - "addGlobalData receives string value directly (not wrapped in function)"
  - "CDN_BASE_URL in pnwm-taxon-browser.js is module-level constant, not a Lit property/attribute (D-05)"

patterns-established:
  - "CDN image URL pattern: ${CDN_BASE_URL}/${species_slug}/${encodeURIComponent(filename)}?height=186"
  - "this._prefix retained only for species-states.json fetch and species page href — not image src"

requirements-completed: [TMPL-01, TMPL-02, TMPL-05]

# Metrics
duration: 2min
completed: 2026-04-22
---

# Phase 14 Plan 01: Template Migration Foundation Summary

**urlencode Nunjucks filter + cdnBaseUrl global registered in Eleventy; taxon browser image src sites rewritten to CDN URLs with encodeURIComponent and ?height=186**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-22T20:39:26Z
- **Completed:** 2026-04-22T20:41:34Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Registered `urlencode` filter (`encodeURIComponent`) in Eleventy for use in CDN URL construction in Nunjucks templates
- Exposed `cdnBaseUrl` ("https://pnwmoths.b-cdn.net") as a global data value to all Nunjucks templates
- Added module-level `CDN_BASE_URL` constant to `pnwm-taxon-browser.js`
- Replaced both `this._prefix images/...` image src expressions with CDN URLs using `encodeURIComponent` and `?height=186` optimizer param
- `this._prefix` retained for `species-states.json` fetch and species page `href` (unchanged)
- Build exits 0

## Task Commits

Each task was committed atomically:

1. **Task 1: Add urlencode filter and cdnBaseUrl global to eleventy.config.js** - `75fceee` (feat)
2. **Task 2: Add CDN_BASE_URL constant and update image src sites in pnwm-taxon-browser.js** - `1fddab3` (feat)

## Files Created/Modified
- `/Users/rainhead/dev/pnwmoths/eleventy.config.js` - Added `urlencode` filter and `cdnBaseUrl` globalData (7 lines inserted)
- `/Users/rainhead/dev/pnwmoths/src/components/pnwm-taxon-browser.js` - Added `CDN_BASE_URL` constant; updated two `img src` template literals to use CDN URL with encodeURIComponent

## Decisions Made
- `urlencode` uses `encodeURIComponent` (not `encodeURI`) — handles all reserved URL characters including spaces, parens, +, # found in Django filenames
- `addGlobalData` receives the string value directly, not wrapped in a function
- CDN constant in taxon browser is module-level only, not a Lit property (per D-05 in 14-CONTEXT.md)

## Deviations from Plan
None — plan executed exactly as written.

## Issues Encountered
None. Build green on first attempt. Pre-existing `browse/index.html` page-weight warning (711KB vs 500KB threshold) is unrelated to this plan.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- `cdnBaseUrl` global and `urlencode` filter are now available to all Nunjucks templates
- Plan 02 (template updates) can proceed: `{{ cdnBaseUrl }}/{{ image.species_slug }}/{{ image.filename | urlencode }}` pattern is ready
- No blockers

---
*Phase: 14-template-migration*
*Completed: 2026-04-22*
