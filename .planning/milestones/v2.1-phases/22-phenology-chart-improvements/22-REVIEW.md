---
phase: 22-phenology-chart-improvements
reviewed: 2026-05-20T00:00:00Z
depth: standard
files_reviewed: 1
files_reviewed_list:
  - src/components/pnwm-phenology-chart.js
findings:
  critical: 0
  warning: 4
  info: 1
  total: 5
status: issues_found
---

# Phase 22: Code Review Report

**Reviewed:** 2026-05-20
**Depth:** standard
**Files Reviewed:** 1
**Status:** issues_found

## Summary

`pnwm-phenology-chart.js` is a LitElement web component that loads species occurrence records from a Parquet file and renders a Chart.js bar chart by month. The phase 22 changes (axis labels and `beginAtZero: true`) are correctly implemented. However, the review surfaced four warnings in the existing code that affect correctness or robustness, and one info item.

---

## Warnings

### WR-01: `Math.random()` in skeleton loader causes hydration thrash and spurious re-renders

**File:** `src/components/pnwm-phenology-chart.js:73`
**Issue:** Each call to `render()` while `_loading` is `true` generates fresh random heights for the 12 skeleton bars via `Math.floor(Math.random() * 60 + 20)`. Lit re-renders on every reactive property change. If any property triggers a re-render before loading completes (e.g., a parent sets `filters` before data arrives), the skeleton bars will jump to new random heights. Beyond the visual jitter, Lit's template diffing computes a new value per bar on every render pass, making it impossible to achieve CSS transitions or stable layout. The comment says "no animation (per UI-SPEC)" but `Math.random()` values guarantee visual instability across renders.

**Fix:** Pre-compute the random heights once, in the constructor, and store them as a fixed array:

```js
constructor() {
  super();
  // ...
  this._skeletonHeights = Array.from({ length: 12 }, () => Math.floor(Math.random() * 60 + 20));
}
```

Then in `render()`:
```js
${MONTHS.map((_, i) => html`
  <div style="flex:1;background:var(--pico-muted-border-color,#ccc);height:${this._skeletonHeights[i]}px;border-radius:2px"></div>
`)}
```

---

### WR-02: Error in `connectedCallback` is silently swallowed — no user-visible error state

**File:** `src/components/pnwm-phenology-chart.js:58-61`
**Issue:** When `loadParquet` throws (network failure, 404, malformed file), the catch block sets `_records = []` and `_loading = false` but does not set any error flag. The component then falls through to `render()`, where `visible.length === 0` triggers the message "No records match the current filters." — which is factually wrong and misleading. A user with a working filter will see a false "no match" message instead of a load error. A network failure is silently indistinguishable from a species with zero records.

**Fix:** Add an `_error` state property and render a distinct error message:

```js
static get properties() {
  return {
    // ...existing...
    _error: { state: true },
  };
}

constructor() {
  super();
  // ...
  this._error = null;
}

// in connectedCallback catch block:
} catch (err) {
  this._error = err.message || 'Failed to load records.';
  this._loading = false;
}

// in render():
if (this._error) {
  return html`<p style="color:var(--pico-muted-color)">Could not load occurrence data.</p>`;
}
```

---

### WR-03: `updated()` does not guard against the "no visible records" render path — chart is not destroyed when data disappears

**File:** `src/components/pnwm-phenology-chart.js:91-98`
**Issue:** When `filters` changes such that `visible.length === 0`, `render()` returns the "No records" `<p>` element (line 81) — the `<canvas>` is removed from the DOM. However, `updated()` still runs after every property change and checks `this.shadowRoot.querySelector('canvas')`. In the zero-records case that query returns `null`, so `_renderChart` is not called — that part is safe. But `this._chart` is left alive pointing to a destroyed canvas. When filters later change back and the canvas reappears, `_renderChart` takes the `if (this._chart)` branch (line 104) and calls `this._chart.data.datasets[0].data = counts; this._chart.update()` on a Chart instance whose underlying canvas is no longer in the DOM. Chart.js may silently fail or log errors in this case.

**Fix:** Destroy the chart when the canvas is absent:

```js
updated(changed) {
  if (changed.has('_records') || changed.has('filters')) {
    const canvas = this.shadowRoot && this.shadowRoot.querySelector('canvas');
    if (canvas) {
      this._renderChart(canvas);
    } else if (this._chart) {
      this._chart.destroy();
      this._chart = null;
    }
  }
}
```

---

### WR-04: `slug` property change after initial connection is not handled — data is never reloaded

**File:** `src/components/pnwm-phenology-chart.js:51-65`
**Issue:** Data loading happens only in `connectedCallback`. If a parent component changes the `slug` attribute after the element is connected (e.g., a single-page navigation that reuses the element), `updated()` does not react to `slug` changes and `connectedCallback` does not run again. The component will continue displaying stale data for the previous slug. The parquet cache in `parquet-cache.js` is keyed by slug, so the new slug's data is never fetched.

**Fix:** React to `slug` changes in `updated()`:

```js
async updated(changed) {
  if (changed.has('slug') && this.slug) {
    this._loading = true;
    this._error = null;
    try {
      this._records = await loadParquet(this.slug);
    } catch (err) {
      this._error = err.message || 'Failed to load records.';
      this._records = [];
    } finally {
      this._loading = false;
    }
  }
  if (changed.has('_records') || changed.has('filters')) {
    // ...chart rendering logic...
  }
}
```

(Move the fetch logic out of `connectedCallback` into this handler, calling it from `connectedCallback` by calling `super.connectedCallback()` and then triggering `requestUpdate()`, or simply keeping a small bootstrap call in `connectedCallback` that delegates to a shared private method.)

---

## Info

### IN-01: `_loading` declared with `{ type: Boolean, state: true }` — redundant `type` on a state-only property

**File:** `src/components/pnwm-phenology-chart.js:23`
**Issue:** The `type` converter (`type: Boolean`) is only meaningful when the property reflects an HTML attribute (it controls how the string attribute value is coerced). `_loading` has no attribute binding (no `attribute: false` but the leading underscore convention implies it is internal). Adding `type: Boolean` is harmless but misleading — it implies attribute reflection that does not occur. The existing `_records` property correctly uses `{ attribute: false, state: true }` without a `type`.

**Fix:**
```js
_loading: { state: true },
```

---

_Reviewed: 2026-05-20_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
