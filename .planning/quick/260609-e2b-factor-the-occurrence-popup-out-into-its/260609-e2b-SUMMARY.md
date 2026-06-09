---
quick_id: 260609-e2b
plan: 260609-e2b-PLAN.md
status: complete
date: 2026-06-09
issue: 22
---

# Quick Task 260609-e2b — Summary

**Goal:** Factor the occurrence popup body out of `pnwm-occurrence-map.js` into its own Lit component so the popup can grow richer formatting without polluting the map component.

**GitHub issue:** [#22 — Species account: occurrence info popover](https://github.com/pnwinsects/pnwmoths/issues/22) (per-record info shown on map-marker click).

## Coverage vs issue #22

Merrill's request:

- **Truncated default view:** state · county · locality · M/D/Y · collector · collection.
- **Detailed expandable view:** + lat/long · elevation · notes.

What this PR ships (single combined view, no toggle):

| Field | In popup | Notes |
|---|---|---|
| state | ✓ | Place line, with county |
| county | ✓ | Abbreviated `Co.` |
| locality | ✓ | Place line, first |
| day / month / year | ✓ | `14 Sep 1995` (degrades to month+year or year alone) |
| collector | ✓ | Attribution line |
| collection | ✓ | Attribution line, parenthesized |
| record_type | ✓ | Date line, e.g. `… · specimen` |
| elevation_ft | ✓ | Place line, e.g. `… · 1,500 ft` |
| notes | ✓ | Muted paragraphs, split on `;`, URLs autolinked |
| latitude / longitude | ✗ | Deferred — redundant with marker position; revisit if Merrill wants exact coords visible |
| **truncated/detailed toggle** | ✗ | Deferred — current design fits everything except lat/long in one compact block, so a toggle felt premature; revisit if records get noisy in practice |

## Outcome

A new `<pnwm-occurrence-popup>` Lit component owns the popup body. The map component creates one element per marker, sets `.record`, and hands it to Leaflet's `bindPopup`. The popup body was then redesigned from a seven-paragraph label/value list into three composed lines with optional notes:

```
H. J. Andrews Exp. For., Lane Co., OR · 1,500 ft
14 Sep 1995 · specimen
D. N. Ross (OSAC)
photo ID by L. Crabo
https://bugguide.net/node/view/223667   ← real <a>, target=_blank
```

Fields surfaced: locality, county (abbreviated `Co.`), state, elevation (with thousands separator), year/month/day, record_type, collector, collection, and notes. Notes are split on `;`, trimmed, and rendered as muted-style paragraphs with bare URLs autolinked. XSS safety (T-03-01) is preserved end-to-end by Lit's `html` tag — `unsafeHTML` is not used.

## Files

- **Created:** `src/components/pnwm-occurrence-popup.js` — light-DOM Lit component with reactive `record` property (`attribute: false`), `formatPlace` / `formatDateLine` / `formatAttribution` / `formatNotes` helpers, and URL tokenizer that strips trailing sentence punctuation.
- **Modified:** `src/components/pnwm-occurrence-map.js` — popup-body block at lines ~105–123 replaced with three lines: `createElement` → set `.record` → `bindPopup`.
- **Modified:** `src/components/main.js` — side-effect import for `pnwm-occurrence-popup.js`.
- **Modified:** `src/styles/theme.css` — `pnwm-occurrence-popup p` rhythm + `.pnwm-occ-note` muted styling.

## Layout fixes (post-executor)

Three layout/timing issues surfaced when the user actually opened a popup. Each is now solved in the component:

1. **Shadow DOM measurement** — the original shadow-DOM component had no intrinsic width; Leaflet's auto-sizer measured the host as a single non-breakable word. Fix: light DOM via `createRenderRoot() { return this; }` so Leaflet measures the `<p>` children directly.
2. **Inline display default** — unknown HTML elements default to `display: inline`. An inline host with block `<p>` children contributes near-zero intrinsic inline width, so Leaflet pinned `.leaflet-popup-content` at 51 px (minWidth + 1). Fix: `this.style.display = 'block'` in `connectedCallback`.
3. **Async first render** — Lit's first render is scheduled in a microtask after `connectedCallback`, but Leaflet runs `_updateLayout` synchronously after insertion. Leaflet measured the host while it was still empty. Fix: `this.performUpdate()` in `connectedCallback` forces a synchronous first render before Leaflet measures.

All three fixes are documented in the component's header comment so the gotcha doesn't get re-introduced.

## Commits

- `f1e46f49` `feat(quick-260609-e2b-01): add pnwm-occurrence-popup Lit component`
- `8e48ca9c` `refactor(quick-260609-e2b-01): delegate occurrence popup body to <pnwm-occurrence-popup>`
- `08841845` `Render occurrence popup in light DOM`
- `0dbcef96` `Force display:block on occurrence popup host`
- `6cdf8f7f` `Render occurrence popup synchronously so Leaflet measures real width`
- `fdc54e0d` `Group occurrence popup fields into place/date/attribution + notes`

## Verification

- `npm test` — 224 pass / 0 fail (re-run after the field-grouping change).
- `npx eleventy` produced `_site/assets/main-*.js` containing `customElements.define("pnwm-occurrence-popup", …)`.
- Manual: marker click on a species detail page now shows the three-line popup at its content-natural width, with autolinked URLs in notes opening in a new tab.

## Deviations

- The plan suggested `npx vite build`; this project drives Vite through `@11ty/eleventy-plugin-vite`, so `npx eleventy` is the right bundler entry. Verification-procedure clarification, no scope change.
- The plan's scope was a 1-to-1 extraction. The popup body was then redesigned per a follow-up workshop with the user (grouped lines + autolinked notes). All within the same quick-task branch and component file.

## Notes for the user

- The remaining `document.createElement('p')` in `pnwm-occurrence-map.js` belongs to the empty-state message branch and was left untouched (out of scope).
- The light-DOM rendering means Pico's global `<p>` styles apply inside the popup. They're tightened via `pnwm-occurrence-popup p` rules in `theme.css`.
