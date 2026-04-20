---
phase: 12-validation
reviewed: 2026-04-20T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - src/components/pnwm-taxon-browser.js
  - src/styles/theme.css
  - src/species/species.njk
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 12: Code Review Report

**Reviewed:** 2026-04-20
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Three files reviewed: the main Lit web component for the taxon browser, the theme stylesheet, and the Nunjucks species page template. No critical (security or crash-on-correct-input) issues were found. Three warnings relate to unguarded error paths in `connectedCallback` — specifically a missing try/catch around embedded JSON parsing, and missing HTTP response validation before calling `.json()`. One info item covers a redundant Lit binding, another an unconditional empty `<dd>` for missing common names in the species template.

## Warnings

### WR-01: Unguarded JSON.parse on embedded script element

**File:** `src/components/pnwm-taxon-browser.js:81`
**Issue:** `JSON.parse(scriptEl.textContent)` has no error handling. If the embedded `#taxon-data` script element contains malformed JSON (e.g., a build-time error produces truncated output), this throws synchronously inside `connectedCallback`, before the async fetch runs. The exception propagates uncaught, leaving the component in a broken initial state with no diagnostic.
**Fix:**
```js
try {
  if (scriptEl) this._families = JSON.parse(scriptEl.textContent);
} catch (e) {
  console.error('[pnwm-taxon-browser] Failed to parse taxon-data JSON', e);
  // _families stays [] — component renders empty but doesn't crash
}
```

### WR-02: HTTP response status not checked before calling .json()

**File:** `src/components/pnwm-taxon-browser.js:84-85`
**Issue:** `fetch()` resolves successfully for any HTTP response, including 404 and 500. `res.ok` is never checked. A non-200 response body may not be valid JSON (e.g., an HTML error page), causing `res.json()` to throw with a confusing parse error rather than a meaningful HTTP error. The outer `catch` silently swallows this, but the error message in dev tools will be misleading.
**Fix:**
```js
const res = await fetch(`${this._prefix}species-states.json`);
if (!res.ok) throw new Error(`species-states.json: HTTP ${res.status}`);
const rows = await res.json();
```

### WR-03: No Array.isArray guard before calling .map() on fetch response

**File:** `src/components/pnwm-taxon-browser.js:86-87`
**Issue:** `buildStateMap(rows)` and `rows.map(r => r.state)` both assume `rows` is an array. If the server returns a non-array JSON value (e.g., an error object like `{"error": "not found"}`), calling `.map()` on a plain object throws a TypeError. This is also caught by the outer `catch`, but silently — the same fix as WR-02 (checking `res.ok`) would prevent reaching this code with a bad payload.
**Fix:** Adding the `res.ok` check from WR-02 is sufficient. Optionally add a defensive guard:
```js
if (!Array.isArray(rows)) throw new Error('species-states.json: unexpected response shape');
```

## Info

### IN-01: Redundant ?selected binding on <option> elements

**File:** `src/components/pnwm-taxon-browser.js:263`
**Issue:** Each `<option>` has `?selected=${this._selectedState === s}`, but the `<select>` already uses the `.value` property binding (`.value=${this._selectedState}`) which sets the selected option via DOM property assignment. The `?selected` attribute bindings are redundant and could create confusion about which mechanism controls selection.
**Fix:** Remove `?selected` from the options and rely solely on `.value` on the `<select>`:
```js
html`<option value=${s}>${STATE_NAMES[s] || s}</option>`
```

### IN-02: Common name <dd> renders unconditionally even when value is absent

**File:** `src/species/species.njk:14`
**Issue:** `<dt>Common name</dt><dd>{{ sp.common_name }}</dd>` renders an empty `<dd>` when `sp.common_name` is absent or null. Users see a blank "Common name" row in the definition list for species that have no common name, which looks like missing data rather than intentional absence.
**Fix:** Conditionally include the row:
```nunjucks
{% if sp.common_name %}
  <dt>Common name</dt><dd>{{ sp.common_name }}</dd>
{% endif %}
```

---

_Reviewed: 2026-04-20_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
