# 0005. Lit web components rendered in light DOM

**Status:** Accepted

## Context

The interactive factsheet features — occurrence map (Leaflet), phenology chart (Chart.js),
filters, photo carousel, deep-zoom viewer — need a component model that is lightweight and
low-churn, given a project that may sit unmaintained for stretches. Two hard constraints shape
it: the site's base styles come from **Pico CSS**, which styles bare elements via element
selectors, and **Leaflet** manipulates the DOM in ways that fight Shadow DOM encapsulation.
Standard Lit renders into a shadow root, which blocks both.

## Decision

Use **Lit** web components, but render them in **light DOM** by overriding
`createRenderRoot() { return this; }`. Components render into the regular document tree, not a
shadow root. This must be decided at component creation — it cannot be cleanly retrofitted.

## Consequences

- Pico CSS element selectors reach component markup, and Leaflet operates on real document nodes,
  so the map and chart work correctly.
- Lit is a thin standards-based layer with low dependency churn — appropriate for a
  low-maintenance codebase.
- **No-JS degradation is mandatory** ([0001](0001-static-no-server.md)): taxonomy, prose, and
  photos must render as static HTML so the factsheet is usable with scripting off; components
  enhance, never gate, that content.
- Gotchas: CSS custom properties are **not** available inside Canvas 2D (Chart.js / Leaflet
  canvas), so brand tokens can't be read there; and the lightbox focus trap must inert siblings
  by walking host→`<body>` (a plain `main.inert` self-blocks the component) plus a z-index above
  Leaflet's controls.

## Alternatives considered

- **A framework (React/Vue/Svelte)** — rejected: heavier runtime and more churn than a mostly
  static, progressively-enhanced site needs.
- **Shadow DOM (Lit default)** — rejected: encapsulation blocks Pico's element selectors and
  breaks Leaflet; light DOM is the deliberate escape hatch.
