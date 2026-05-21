# Phase 22: Phenology Chart Improvements - Context

**Gathered:** 2026-05-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Add axis labels ("Month" on X, "# Records" on Y) and fix the Y-axis floor to start at 0 on the phenology chart component. No new data loading, no new filters, no layout changes — purely a Chart.js options update to `pnwm-phenology-chart.js`.

</domain>

<decisions>
## Implementation Decisions

### Axis Labels
- **D-01:** Use Chart.js default label styling — no custom color, font size, or family. Default gray text is acceptable; styling is out of scope.
- **D-02:** X-axis title text: `"Month"`. Y-axis title text: `"# Records"`.

### Y-axis Scale
- **D-03:** Y-axis min fixed at `0` (via `beginAtZero: true` or `min: 0`). Max is auto-computed by Chart.js with its default headroom (~10% padding above tallest bar). No explicit `max` override.
- **D-04:** No additional Chart.js plugin imports needed — axis titles are built into `CategoryScale` and `LinearScale` (already registered). The `Title` plugin is for chart-level titles only; do not add it.

### Claude's Discretion
- Whether to use `min: 0` or `beginAtZero: true` — both are equivalent in Chart.js v4 for non-negative data; prefer `beginAtZero: true` as it is more semantically clear.
- Whether the chart options are inlined or extracted to a named object — inline is fine given the small scope.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Component to Modify
- `src/components/pnwm-phenology-chart.js` — The only file that needs changing. Chart.js config is in `_renderChart()`, lines 100–128. The `scales` key is currently absent from the `options` object.

### Project Context
- `.planning/PROJECT.md` — Key Decisions table; note the established pattern: "CSS custom properties unavailable in Canvas 2D context" (therefore any styling must be hardcoded, but D-01 says default styling is acceptable so no hardcoding needed here)
- `.planning/REQUIREMENTS.md` — CHART-01 and CHART-02 requirements for this phase

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/pnwm-phenology-chart.js` `_renderChart()` — The entire change lives here. Chart is created with `new Chart(canvas, { type: 'bar', data: {...}, options: {...} })`. The `options` object gets a new `scales` key.
- Chart.js v4.5.1 is already installed. `CategoryScale` and `LinearScale` are already registered — no new imports.

### Established Patterns
- **CSS custom props don't work in Canvas 2D** — established in prior research (PROJECT.md Key Decisions). Bar color is hardcoded as `#0172ad`. Axis label color would also need hardcoding, but D-01 accepts default styling so no action needed.
- **Chart update path** — when filters change, `_renderChart()` updates `this._chart.data.datasets[0].data` and calls `this._chart.update()`. The axis config is set only at creation (`new Chart(...)`), so scale options survive filter updates automatically.

### Integration Points
- No template changes needed — the component renders a `<canvas>` and Chart.js draws into it. Axis labels render within the canvas.
- No Parquet data changes — axis labels and Y-floor are purely presentation options.

</code_context>

<specifics>
## Specific Ideas

No specific references — standard Chart.js axis title configuration.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 22-phenology-chart-improvements*
*Context gathered: 2026-05-20*
