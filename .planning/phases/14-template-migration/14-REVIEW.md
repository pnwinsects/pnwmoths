---
phase: 14-template-migration
reviewed: 2026-04-22T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - eleventy.config.js
  - src/components/pnwm-taxon-browser.js
  - src/glossary/index.njk
  - src/species/species.njk
findings:
  critical: 0
  warning: 4
  info: 2
  total: 6
status: issues_found
---

# Phase 14: Code Review Report

**Reviewed:** 2026-04-22
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Four files reviewed covering the template migration: the Eleventy build config, the Lit-based taxon browser web component, and two Nunjucks templates (glossary and species pages). The CDN URL migration is correctly implemented in the Nunjucks templates. The main concerns are: `stderr` from child processes is silently discarded in `eleventy.config.js`, `fetch` response status is unchecked in the taxon browser, an empty `<figcaption>` is unconditionally rendered when `photographer` is null/empty in `species.njk`, and the CDN base URL is duplicated between `eleventy.config.js` and `pnwm-taxon-browser.js` with no shared source of truth.

---

## Warnings

### WR-01: `stderr` from child-process scripts is silently discarded

**File:** `eleventy.config.js:63-65, 76-78`

**Issue:** All six `execFile` callbacks capture `stdout` and forward it, and reject the promise on non-zero exit, but the `stderr` argument is not destructured at all. Script errors written to stderr (stack traces, DuckDB warnings, etc.) vanish silently, making build failures very hard to diagnose. The callback signature is `(err, stdout, stderr)`.

**Fix:**
```js
execFile("node", ["scripts/copy-images.js"], (err, stdout, stderr) => {
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  if (err) rej(err); else res();
});
```
Apply the same pattern to all six `execFile` calls (lines 63-65 and 76-78).

---

### WR-02: `fetch` response status is not checked before calling `.json()`

**File:** `src/components/pnwm-taxon-browser.js:86-87`

**Issue:** A non-2xx HTTP response (404, 500, etc.) does not cause `fetch` to reject the promise. The code calls `res.json()` unconditionally, which will attempt to parse an error response body as JSON. This may throw or, worse, silently populate `_stateMap` with garbage data depending on the server's error body. The catch block then suppresses the error, leaving `_statesAvailable` empty, which is the correct degradation — but the fetch failure is entirely invisible.

**Fix:**
```js
const res = await fetch(`${this._prefix}species-states.json`);
if (!res.ok) throw new Error(`Failed to load species-states.json: ${res.status}`);
const rows = await res.json();
```

---

### WR-03: `<figcaption>` rendered unconditionally even when `photographer` is null

**File:** `src/species/species.njk:51`

**Issue:** The images data uses `nullstr = ''` in DuckDB, so `photographer` arrives as either a string or `null`/empty string. The `<figcaption>` is always rendered regardless:

```njk
<figcaption>{{ img.photographer }}</figcaption>
```

When `photographer` is null or empty, this emits `<figcaption></figcaption>` — an empty element that may confuse screen readers and misrepresents the image semantics. The glossary template (line 45-47) correctly guards this with `{% if term.photographer %}`.

**Fix:**
```njk
{% if img.photographer %}
  <figcaption>{{ img.photographer }}</figcaption>
{% endif %}
```

---

### WR-04: CDN base URL duplicated — component cannot receive the build-configured value

**File:** `src/components/pnwm-taxon-browser.js:11`

**Issue:** `CDN_BASE_URL` is hardcoded as a module-level constant in `pnwm-taxon-browser.js` and separately in `eleventy.config.js` (line 14). The Nunjucks templates correctly use the `cdnBaseUrl` global data injected by Eleventy, but the client-side component uses its own hardcoded copy. If the CDN hostname is ever changed, two separate files must be updated in sync, with no tooling to enforce consistency.

A secondary concern: the component has a `path-prefix` attribute for routing flexibility (correctly wired from the template), but no equivalent attribute for CDN base URL. This also means the component cannot be tested against a different CDN origin without editing source.

**Fix:** Expose `cdnBaseUrl` as an attribute on `<pnwm-taxon-browser>` in the same way `path-prefix` is handled, and pass it from the template:

In `src/browse/index.njk`:
```njk
<pnwm-taxon-browser
  path-prefix="{{ '/' | url }}"
  cdn-base-url="{{ cdnBaseUrl }}"
></pnwm-taxon-browser>
```

In `pnwm-taxon-browser.js`:
```js
static get properties() {
  return {
    'path-prefix': { type: String },
    'cdn-base-url': { type: String },
    // ...
  };
}
get _cdnBaseUrl() { return this['cdn-base-url'] || 'https://pnwmoths.b-cdn.net'; }
```
Then replace `CDN_BASE_URL` references with `this._cdnBaseUrl`.

---

## Info

### IN-01: `_renderSubfamily` passes wrong `familyKey` to `_renderGenus` for named subfamilies

**File:** `src/components/pnwm-taxon-browser.js:254`

**Issue:** When a subfamily has a real name, `_renderGenus` is called with the `subfamKey` (e.g. `"Noctuidae__Hadeninae"`) as `familyKey`. Inside `_renderGenus`, the genus key is constructed as `` `${familyKey}__${genus.genus_slug}` `` (line 214), producing a three-segment key like `"Noctuidae__Hadeninae__actebia"`. However, in `_expandToSpecies` (line 173), the expanded-genera key is also constructed as a three-segment string: `` `${subfamKey}__${genus.genus_slug}` ``. These match, so the expand-to-species feature works correctly. This is consistent but the abstraction is leaky — `familyKey` is actually used as a prefix, not a family name, when passed from a named subfamily context. No bug currently, but the naming is misleading and could cause a future regression if the key construction is changed in one place but not the other.

**Fix:** Rename the `familyKey` parameter in `_renderGenus` to `parentKey` to reflect its actual role as an opaque prefix.

---

### IN-02: Nested O(n²) loop in `similar_slugs` rendering at build time

**File:** `src/species/species.njk:68-76`

**Issue:** For every slug in `sp.similar_slugs`, the template iterates the entire `species` collection to find the matching species object. This is an O(n × m) scan at Eleventy build time, executed once per species page. With a large species dataset it will slow the build, though it is a build-time cost, not a runtime cost. Mentioned here as an Info item since performance is out of scope for v1, but it is worth noting.

**Fix (build-time):** Pre-compute a slug-to-species lookup in the data pipeline, or pass `similar_species` as a pre-resolved array alongside `similar_slugs` so the template can iterate directly. Alternatively, pass the `species` collection keyed by slug as a separate global data object.

---

_Reviewed: 2026-04-22_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
