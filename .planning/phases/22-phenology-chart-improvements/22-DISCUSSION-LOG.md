# Phase 22: Phenology Chart Improvements - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-20
**Phase:** 22-phenology-chart-improvements
**Areas discussed:** Axis label styling, Y-axis ceiling behavior

---

## Axis Label Styling

| Option | Description | Selected |
|--------|-------------|----------|
| Default Chart.js | Small gray text, no extra config. Matches Chart.js visual defaults. | ✓ |
| Styled to match site | Hardcoded color (#555) and font (Open Sans) — required since CSS custom props don't work in Canvas 2D. | |

**User's choice:** Default Chart.js styling
**Notes:** The extra config burden of hardcoding fonts/colors is not justified for axis labels; default gray is fine.

---

## Y-Axis Ceiling Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-scale with headroom | Chart.js default: ~10% breathing room above tallest bar. Only Y min fixed at 0. | ✓ |
| Exact max = highest count | Set `max` to the exact highest monthly count — tallest bar touches the ceiling. | |

**User's choice:** Auto-scale with headroom
**Notes:** Prevents the tallest bar from being flush with the chart edge. `min: 0` (or `beginAtZero: true`) is the only scale change needed.

---

## Claude's Discretion

- `min: 0` vs `beginAtZero: true` — prefer `beginAtZero: true` as more semantically clear
- Whether to inline or extract the chart options object — inline is fine given the small scope

## Deferred Ideas

None.
