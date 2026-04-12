---
phase: 03-client-side-interactivity
reviewed: 2026-04-11T00:00:00Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - eleventy.config.js
  - package.json
  - scripts/copy-parquet.js
  - src/_includes/base.njk
  - src/components/filters.test.js
  - src/components/main.js
  - src/components/parquet-cache.js
  - src/components/parquet-cache.test.js
  - src/components/phenology.test.js
  - src/components/pnwm-filter-bar.js
  - src/components/pnwm-image-slideshow.js
  - src/components/pnwm-occurrence-map.js
  - src/components/pnwm-phenology-chart.js
  - src/species/species.njk
  - vite.config.js
findings:
  critical: 0
  warning: 3
  info: 4
  total: 7
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-04-11
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

This phase introduces four Lit-based Web Components (`pnwm-filter-bar`, `pnwm-occurrence-map`, `pnwm-phenology-chart`, `pnwm-image-slideshow`) with a shared Parquet-loading cache, wired together in the species page template. The overall architecture is clean. No security vulnerabilities or data-loss risks were found.

Three warnings were found: a visual-flicker bug from `Math.random()` in a render method, an empty-state DOM node that is never cleaned up when filters are cleared, and an inconsistency in how `null` vs `undefined` year values are treated by `filterRecords`. Four info-level items were also found.

## Warnings

### WR-01: Math.random() in render() causes flicker during loading skeleton

**File:** `src/components/pnwm-phenology-chart.js:73`
**Issue:** The loading skeleton generates bar heights using `Math.random()` inside `render()`. Lit calls `render()` on every reactive property change, so during the async load the skeleton re-renders with different heights each time, producing visual flicker. Random values should not be generated inside render methods.
**Fix:** Generate the random heights once, outside the render path — either in the constructor or when `_loading` is first set to `true`:

```js
constructor() {
  super();
  // ...
  this._skeletonHeights = Array.from({ length: 12 }, () => Math.floor(Math.random() * 60 + 20));
}
```

Then reference `this._skeletonHeights[i]` in the template instead of calling `Math.random()` inline.

---

### WR-02: Empty-state message in occurrence map is never removed when records reappear

**File:** `src/components/pnwm-occurrence-map.js:118-130`
**Issue:** When `markers.length === 0` a `.pnwm-map-empty` paragraph is appended to the map container. When the user clears filters and records return (`markers.length > 0`), the code takes the `fitBounds` branch and never removes the existing empty-state element. The "No occurrence records match" message persists on screen even while markers are rendered.
**Fix:** Remove the stale message unconditionally at the top of `_renderMap`, before the conditional branches:

```js
_renderMap() {
  const container = this.querySelector('[id^="map-"]');
  if (!container) return;

  // Always clear stale empty-state message first
  const existing = container.querySelector('.pnwm-map-empty');
  if (existing) existing.remove();

  // ... rest of the method unchanged
```

---

### WR-03: Inconsistent null vs undefined year handling in filterRecords

**File:** `src/components/parquet-cache.js:33-34`
**Issue:** `filterRecords` uses `!= null` guards before year comparisons, meaning `undefined` years always pass through year range filters (correct — missing data is not excluded). However `null` years coerce to `0` in JS numeric comparisons, so `null < yearMin` is `true` for any `yearMin > 0`, and null-year records are silently excluded. This asymmetry is surprising: both `null` and `undefined` conventionally represent "unknown" but they behave oppositely here.

The test in `filters.test.js` (lines 29-36) documents this behavior and even has contradictory comments within the same test, suggesting the author noticed the inconsistency.

**Fix:** Treat both `null` and `undefined` as unknown (pass-through):

```js
if (filters.yearMin != null && r.year != null && r.year < filters.yearMin) return false;
if (filters.yearMax != null && r.year != null && r.year > filters.yearMax) return false;
```

The `!= null` check (loose equality) already covers both `null` and `undefined`, so adding the same guard on `r.year` is sufficient. Update the tests in `filters.test.js` and `parquet-cache.test.js` to reflect the corrected behavior.

---

## Info

### IN-01: data-photographer attribute on img element is never read

**File:** `src/species/species.njk:50`
**Issue:** The template renders `data-photographer="{{ img.photographer }}"` on the `<img>` element, but `pnwm-image-slideshow.js` reads photographer credit from `figcaption.textContent` (line 81), not from `data-photographer`. The attribute is dead markup — it is never accessed anywhere.
**Fix:** Remove `data-photographer` from the `<img>` element in `species.njk`, or remove it after confirming no other consumer reads it.

---

### IN-02: Contradictory comments in filters.test.js

**File:** `src/components/filters.test.js:29-31`
**Issue:** Lines 29-31 comment "null year passes through yearMin/yearMax" but the assertion on line 36 expects `hasNull === false` (null IS excluded). The comments contradict each other and the actual assertion. If WR-03 is fixed (null treated as pass-through), the assertion itself needs to flip.
**Fix:** After resolving WR-03, update the test comment and assertion to match the intended behavior.

---

### IN-03: Anchor element used as button for "Clear filters"

**File:** `src/components/pnwm-filter-bar.js:183`
**Issue:** `<a href="#" class="clear-filters" @click=${this._onClearFilters}>` uses an anchor with `href="#"` as a trigger for a purely interactive action (no navigation). The handler calls `e.preventDefault()` to suppress the hash jump, but the element communicates "link" semantics to assistive technologies. A `<button>` is semantically correct for an action with no URL destination.
**Fix:**
```html
<button type="button" class="clear-filters" @click=${this._onClearFilters}>Clear filters</button>
```
Update the CSS selector from `a.clear-filters` to `.clear-filters` (or `button.clear-filters`).

---

### IN-04: updated() in pnwm-occurrence-map.js does not guard against _loading state

**File:** `src/components/pnwm-occurrence-map.js:60`
**Issue:** The `updated()` hook calls `_renderMap()` when `_records` or `filters` changes, but only guards against `!this._loading` for the `_records` case (via the combined condition). If `filters` is set via a property assignment before the Parquet load completes — e.g. if `pnwm-filter-change` fires very quickly — `_renderMap()` is called while `_loading` is still `true`. The `if (!container) return` guard in `_renderMap` prevents a crash (the map `div` is not rendered during loading), but the filter change is silently ignored. When loading finishes and `_records` is set, the current `this.filters` value will be applied correctly, so this is not a user-visible bug in practice. Still, the guard in `updated()` should be explicit.
**Fix:**
```js
updated(changed) {
  if ((changed.has('_records') || changed.has('filters')) && !this._loading && !this._error) {
    this._renderMap();
  }
}
```

---

_Reviewed: 2026-04-11_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
