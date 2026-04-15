---
phase: 06-make-pages-look-like-existing-pnwmoths-site-layout-colors-ba
plan: 02
subsystem: ui
tags: [nunjucks, eleventy, google-fonts, css, layout]

requires:
  - phase: 06-make-pages-look-like-existing-pnwmoths-site-layout-colors-ba
    plan: 01
    provides: src/styles/theme.css and src/images/header.png (consumed by base.njk)

provides:
  - base.njk with Google Fonts, theme.css, header with moth-strip banner, content-wrapper div, and CC-licensed footer
  - index.njk homepage with welcome paragraph and single Browse CTA (no bullet list)

affects: [all pages — base.njk is universal layout for ~700 generated pages]

tech-stack:
  added: [Google Fonts CDN (Open Sans, Spinnaker)]
  patterns: [| url filter on all asset paths for pathPrefix compatibility, <header> wrapping banner img + nav, content wrapped in .content-wrapper div]

key-files:
  created: []
  modified:
    - src/_includes/base.njk
    - src/index.njk

key-decisions:
  - "Banner image rendered in <header> element wrapping both <img> and <nav>, consistent with D-05"
  - "Google Fonts preconnect + stylesheet added before pico.min.css in <head>"
  - "theme.css linked after pico.min.css so overrides take effect correctly"
  - "Homepage ul replaced with standalone <a> CTA per D-02/D-04; welcome text retained per D-03"

patterns-established:
  - "All asset paths in templates use | url filter for pathPrefix compatibility"
  - "content-wrapper div inside <main> is the site-wide content container"

requirements-completed: []

duration: 12min
completed: 2026-04-15
---

# Phase 06 Plan 02: Layout and Homepage Update Summary

**Cream-background pnwmoths visual identity applied to all ~700 pages via base.njk: Google Fonts, moth-strip banner, white content wrapper, black footer; homepage simplified to welcome text + single Browse CTA**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-04-15T19:00:00Z
- **Completed:** 2026-04-15T19:12:00Z
- **Tasks:** 2 complete (Task 3 visual checkpoint pending user review)
- **Files modified:** 2

## Accomplishments

- Rewrote base.njk to include Google Fonts (Open Sans + Spinnaker), theme.css link, moth-strip banner image inside `<header>`, `.content-wrapper` div around page content, and Creative Commons footer
- Updated index.njk homepage: removed three-link `<ul>` list, replaced with single `<a href="/browse/">Browse all species</a>` CTA per D-02/D-04, retained D-03 welcome paragraph
- Build succeeds cleanly: 27 files written, all ~700 pages inherit the layout changes
- All asset paths use `| url` filter for pathPrefix compatibility

## Task Commits

1. **Task 1: Update base.njk with header, banner, footer, fonts, and theme.css** - `e897483` (feat)
2. **Task 2: Update homepage content to welcome text + Browse CTA** - `119f606` (feat)
3. **Task 3: Visual verification of pnwmoths visual identity** - PENDING (checkpoint:human-verify — awaiting user visual review)

## Files Created/Modified

- `src/_includes/base.njk` — Universal layout template: added Google Fonts, theme.css link, `<header>` with banner + nav, `<div class="content-wrapper">`, `<footer>` with licensing text
- `src/index.njk` — Homepage: replaced 3-item `<ul>` with standalone Browse CTA link

## Decisions Made

- Google Fonts preconnect links added before pico.min.css to avoid blocking render
- `<header>` wraps both banner `<img>` and `<nav>` per D-05 (banner on every page)
- theme.css positioned after pico.min.css so custom property overrides cascade correctly
- The plan's automated check `! grep -q "<ul>" _site/index.html` was noted as technically incorrect — the nav in base.njk always renders a `<ul>`. The actual requirement (no homepage body `<ul>`) is verified: exactly one `<ul>` exists in the output (the nav), and line 33 shows the standalone CTA link. Acceptance criteria are met.

## Deviations from Plan

None - plan executed exactly as written. The automated verify command in Task 2 (`! grep -q "<ul>"`) would have failed due to the nav's `<ul>`, but the actual acceptance criteria (homepage body has no list, single Browse CTA present) are satisfied.

## Issues Encountered

The Task 2 automated verify check `! grep -q "<ul>" _site/index.html` returns false because the nav in `base.njk` contains a `<ul>`. The acceptance criteria state the homepage should not contain `<ul>` or `<li>` from the *homepage body* — the nav is expected and correct. Verified by checking there is exactly one `<ul>` (the nav at line 21) and the standalone CTA `<a>` appears at line 33 with no surrounding list elements.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Task 3 (visual checkpoint) is PENDING: the user must run `npx @11ty/eleventy --serve`, open `http://localhost:8080/pnwmoths/` and compare visually against `https://pnwmoths.biol.wwu.edu/`
- Once visual checkpoint approved, plan 02 is complete
- All ~700 pages now carry the pnwmoths visual identity — no further layout changes needed unless visual review identifies issues

---
*Phase: 06-make-pages-look-like-existing-pnwmoths-site-layout-colors-ba*
*Completed: 2026-04-15 (Tasks 1-2); Task 3 visual checkpoint pending*
