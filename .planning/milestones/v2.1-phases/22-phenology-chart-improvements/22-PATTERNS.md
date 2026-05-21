# Phase 22: Phenology Chart Improvements - Pattern Map

**Mapped:** 2026-05-20
**Files analyzed:** 1
**Analogs found:** 0 / 1 (no analog needed — self-contained Chart.js options edit)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/components/pnwm-phenology-chart.js` | component | request-response | none | n/a — only Chart.js component in codebase |

## Pattern Assignments

### `src/components/pnwm-phenology-chart.js` (component, request-response)

**Analog:** none. This is the only Chart.js component in the project. No existing `scales` configuration exists in the codebase to copy from. The change is a pure Chart.js v4 options edit; patterns come from Chart.js v4 documentation and the existing structure of `_renderChart()`.

**Existing chart creation pattern** (`src/components/pnwm-phenology-chart.js`, lines 108–127):

```js
this._chart = new Chart(canvas, {
  type: 'bar',
  data: {
    labels: MONTHS,
    datasets: [
      {
        data: counts,
        backgroundColor: '#0172ad', // hardcoded — CSS custom props don't work in Canvas 2D context
      },
    ],
  },
  options: {
    responsive: true,
    plugins: {
      legend: {
        display: false,
      },
    },
  },
});
```

**Target: add `scales` key to `options`** (lines 119–126, inline with existing `plugins` key):

```js
options: {
  responsive: true,
  plugins: {
    legend: {
      display: false,
    },
  },
  scales: {
    x: {
      title: {
        display: true,
        text: 'Month',
      },
    },
    y: {
      beginAtZero: true,
      title: {
        display: true,
        text: '# Records',
      },
    },
  },
},
```

**Key constraints to preserve:**
- No new imports — `CategoryScale` and `LinearScale` are already registered (lines 6–7, 13). The axis `title` sub-option is built into these scales in Chart.js v4; the standalone `Title` plugin is only for chart-level titles and must NOT be imported or registered.
- No color or font overrides — D-01 accepts Chart.js default gray styling.
- `beginAtZero: true` is preferred over `min: 0` per D-03 (more semantically clear, equivalent for non-negative data).
- The `scales` config is set only at chart creation (`new Chart(...)`). The update path (lines 104–106) sets `data` and calls `this._chart.update()` — scale options survive filter updates without any changes to the update branch.

**Chart update path** (lines 104–106) — unchanged:

```js
if (this._chart) {
  this._chart.data.datasets[0].data = counts;
  this._chart.update();
}
```

---

## Shared Patterns

None applicable — single-file, single-concern change.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/components/pnwm-phenology-chart.js` | component | request-response | Only Chart.js component in codebase; no existing `scales` config to copy |

The implementation pattern comes entirely from Chart.js v4 built-in axis title API applied to the existing `options` object structure.

## Metadata

**Analog search scope:** `src/components/`, `src/` (full JS grep for `scales`, `beginAtZero`, `title:`)
**Files scanned:** 1 component file read in full; grep across entire `src/` tree
**Pattern extraction date:** 2026-05-20
