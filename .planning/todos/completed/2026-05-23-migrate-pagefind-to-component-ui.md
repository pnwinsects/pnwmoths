---
created: 2026-05-23T04:59:34.402Z
title: Migrate Pagefind to Component UI
area: ui
files: []
---

## Problem

Pagefind is currently using the Default UI (`pagefind-ui.js`). As of Pagefind 1.5.0, the Component UI is the recommended integration path for new setups. The build warns about this on each run.

## Solution

Replace the Default UI integration with the Component UI, which provides a search modal, improved accessibility, and better customization options. See https://pagefind.app/docs/search-ui/ for migration guidance.

## Resolution (2026-06-10)

Migrated the `/search/` page from the Pagefind Default UI (`PagefindUI` /
`pagefind-ui.js`) to the Component UI (custom elements `<pagefind-config>`,
`<pagefind-input>`, `<pagefind-summary>`, `<pagefind-results>`), per the
build-time deprecation notice (Pagefind 1.5.0+).

Changes:
- `src/_includes/base.njk` — the `pagefindUi` flag now loads
  `pagefind-component-ui.css` instead of `pagefind-ui.css`.
- `src/search/index.njk` — replaced the `new PagefindUI(...)` script with the
  inline Component UI elements. `showSubResults: false` preserved via
  `hide-sub-results` on `<pagefind-results>`. Theming remapped from the old
  `--pagefind-ui-*` variables to the Component UI's `--pf-*` variables (still
  bound to Pico tokens). `bundle-path`/`base-url` use the `| url` filter so the
  GitHub Pages path prefix is applied correctly.

Verified locally (served `_site`, browser):
- Pagefind build no longer emits the Default-UI deprecation warning.
- Search runs: "8 results for noctua"; result URLs resolve to `/species/...`
  (verified via the Pagefind JS API — fragments load, no double-slash).
- Page-weight gate: search page is well under threshold (unchanged).

Note: result-card visual hydration could not be screenshot-confirmed (the
headless preview reports a 0×0 viewport, so the IntersectionObserver-based lazy
hydration never fires), but the underlying search/data/URL path is proven
correct via the Pagefind API. Status: resolved.
