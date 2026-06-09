---
quick_id: 260609-e2b
plan: 260609-e2b-PLAN.md
status: complete
date: 2026-06-09
---

# Quick Task 260609-e2b — Summary

**Goal:** Factor the occurrence popup body out of `pnwm-occurrence-map.js` into its own Lit component so the popup can grow richer formatting without polluting the map component.

## Outcome

A new `<pnwm-occurrence-popup>` Lit component owns the popup body. The map component now creates one element per marker, sets `.record`, and hands it to Leaflet's `bindPopup`. Field order, labels, and "omit if falsy" behavior match the previous imperative implementation. XSS safety (T-03-01) is preserved by Lit's auto-escaping `html` template tag — `unsafeHTML` is not used.

## Files

- **Created:** `src/components/pnwm-occurrence-popup.js` — shadow-DOM Lit component with reactive `record` property (`attribute: false`), minimal popup-friendly `<p>` styles, and seven-field renderer (Locality, State, County, Year, Month, Collector, Type).
- **Modified:** `src/components/pnwm-occurrence-map.js` — popup-body block at lines ~105-123 replaced with three lines: `createElement` → set `.record` → `bindPopup`.
- **Modified:** `src/components/main.js` — added side-effect import for `pnwm-occurrence-popup.js` so the custom element registers on page load.

## Commits

- `f1e46f49` `feat(quick-260609-e2b-01): add pnwm-occurrence-popup Lit component`
- `8e48ca9c` `refactor(quick-260609-e2b-01): delegate occurrence popup body to <pnwm-occurrence-popup>`

## Verification

- `npm test` — 224 pass / 0 fail.
- `npx eleventy` (the project's bundler entry; Vite is integrated via `@11ty/eleventy-plugin-vite`) produced `_site/assets/main-*.js` containing `customElements.define("pnwm-occurrence-popup", …)`, confirming the new component compiles into the production bundle. The Eleventy run ended with a pre-existing `ENOTEMPTY` rename on a stale `_site/` from prior builds — unrelated to this refactor.
- Grep checks: `pnwm-occurrence-popup` present in both `main.js` and `pnwm-occurrence-map.js`; the old imperative `parts = […].filter(Boolean)` / for-loop block is gone.

## Deviations

The plan suggested `npx vite build` for the bundler check; this project drives Vite through `@11ty/eleventy-plugin-vite`, so I substituted `npx eleventy`, which exercises the same bundler. Verification-procedure clarification only — no scope change.

## Notes for the user

- The remaining `document.createElement('p')` in `pnwm-occurrence-map.js` belongs to the unrelated empty-state message branch and was deliberately left alone.
- The one item that cannot be automated: click a marker on a species detail page and confirm popup parity before merge.
