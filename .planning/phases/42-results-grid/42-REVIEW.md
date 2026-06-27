---
phase: 42-results-grid
reviewed: 2026-06-25T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - src/components/key-results-grid.ts
  - src/components/key-results-grid.test.ts
  - src/components/pnwm-identify.ts
  - src/components/pnwm-identify.test.ts
  - src/components/main.ts
  - src/identify/index.njk
  - src/styles/theme.css
  - eleventy.config.ts
findings:
  critical: 1
  warning: 4
  info: 3
  total: 8
status: issues_found
---

# Phase 42: Code Review Report

**Reviewed:** 2026-06-25T00:00:00Z
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Phase 42 adds the `key-results-grid` Light-DOM Lit component and wires it into
`pnwm-identify` (async matrix fetch + `computeMatching`). The pure helpers
(`buildCardUrl`, `buildCountText`) are correct and well-tested, CDN URLs are
properly `encodeURIComponent`-encoded with Lit attribute templating (no
`innerHTML`), and the matrix fetch degrades softly on failure.

However, there is one **BLOCKER**: a property-name mismatch between the parent's
binding (`.pathPrefix`) and the child's reactive property (`'path-prefix'`)
means the results grid **never receives the path prefix** and silently falls
back to `/`. On GitHub Pages (where the site lives under `/pnwmoths/`) every
species card link in the results grid will be broken (404). This is exactly the
pathPrefix hazard flagged in project memory, and no test covers it because the
component is never rendered in the test suite. Additional warnings cover an
unvalidated post-fetch type assertion, a dead inline `species` payload in the
template, an unreachable `?? 1192` / `?? 0` defensive branch, and a missing
guard on a non-`.ok` fetch response.

## Critical Issues

### CR-01: Results-grid `path-prefix` is never set — all card links break on GitHub Pages

**File:** `src/components/pnwm-identify.ts:258` (binding) and `src/components/key-results-grid.ts:52,66,71` (consumer)

**Issue:** `pnwm-identify` binds the prefix to the grid using a **camelCase
property binding**:

```ts
// pnwm-identify.ts:258
.pathPrefix=${this._prefix}
```

A `.`-prefixed Lit binding sets a JavaScript property whose name is taken
verbatim — here `pathPrefix`. But `key-results-grid` declares its reactive
property and reads it under the **kebab-case** name `path-prefix`:

```ts
// key-results-grid.ts:52
'path-prefix':  { type: String },
// key-results-grid.ts:66
get _prefix(): string {
  return (this as { 'path-prefix'?: string })['path-prefix'] || '/';
}
// key-results-grid.ts:71
href="${this._prefix}species/${sp.slug}/"
```

`.pathPrefix=` writes to `el.pathPrefix`; the grid's getter reads
`el['path-prefix']`. These are two different properties, so the grid's
`_prefix` always returns the `|| '/'` fallback. The grid is not given a
`path-prefix` attribute in `index.njk` either (only `pnwm-identify` gets one,
line 14), so there is no fallback source.

Result: on GitHub Pages (`pathPrefix = "/pnwmoths/"`), `pnwm-identify._prefix`
is `/pnwmoths/` but the grid emits `href="/species/<slug>/"` instead of
`href="/pnwmoths/species/<slug>/"` — every results-card link 404s. This
violates the project rule that `pathPrefix` must be honored for GitHub Pages
(MEMORY: "pathPrefix must be conditional on GITHUB_PAGES"). It works locally
only because the local prefix happens to be `/`, which masks the bug in dev.

The test suite never instantiates/renders the grid with a prefix, so this is
uncaught.

**Fix:** Make the binding and the consumer agree. Simplest is to give the grid
a conventional camelCase reactive property with an explicit kebab attribute,
matching the `pnwm-taxon-browser` convention, and bind to it consistently:

```ts
// key-results-grid.ts
static get properties(): PropertyDeclarations {
  return {
    matchedSpecies: { attribute: false },
    hasSelection:   { type: Boolean },
    matchedCount:   { type: Number },
    totalCount:     { type: Number },
    pathPrefix:     { type: String, attribute: 'path-prefix' },
  };
}
pathPrefix = '/';
get _prefix(): string { return this.pathPrefix || '/'; }
```

The parent binding `.pathPrefix=${this._prefix}` (line 258) then resolves
correctly. Add a render test that mounts the grid with
`pathPrefix="/pnwmoths/"` and asserts a card `href` starts with
`/pnwmoths/species/`.

## Warnings

### WR-01: `this._keyMatrix = raw` assigns an unvalidated `unknown` after the assertion

**File:** `src/components/pnwm-identify.ts:102-105`

**Issue:** `validateKeyMatrix(raw)` is declared `asserts data is KeyMatrix`, so
after the call TypeScript narrows `raw` to `KeyMatrix` and the assignment
compiles. That is fine for types, but note the ordering relies entirely on
`validateKeyMatrix` *throwing* on bad input. It does (zod `.parse` +
structural checks), so this is correct as written — but `res.json()` is awaited
and assigned to `raw: unknown` with **no check on `res.ok`** first (see WR-04).
If a 404 HTML error page is returned, `res.json()` rejects and is caught, which
is acceptable, but a 200 response carrying an unexpected JSON shape relies
solely on `validateKeyMatrix`. Confirm `validateKeyMatrix` rejects partial
objects (it does via `KeyMatrixSchema.parse`); no code change strictly
required, but the silent `console.error`-only degradation means a malformed
deploy shows the "prompt" state with no user-visible error. Consider
surfacing a non-fatal notice.

**Fix:** Optionally set a `_loadError` state flag in the `catch` and render a
small "Filtering unavailable" note in the grid area, so a broken
`key-matrix.json` deploy is visible rather than silently stuck at the at-rest
prompt.

### WR-02: `fetch` response is used without checking `res.ok`

**File:** `src/components/pnwm-identify.ts:101-104`

**Issue:**

```ts
const res = await fetch(`${this._prefix}key-matrix.json`);
const raw: unknown = await res.json();
validateKeyMatrix(raw);
```

`fetch` only rejects on network failure; an HTTP 404/500 resolves with
`res.ok === false`. The code proceeds straight to `res.json()`. For a 404
serving an HTML body, `res.json()` throws and is caught — so it degrades — but
the thrown error is a confusing JSON parse error rather than a clear
"matrix not found" signal, and a 404 that happens to serve valid JSON (e.g. a
SPA fallback) would pass into `validateKeyMatrix` with a misleading message.

**Fix:**

```ts
const res = await fetch(`${this._prefix}key-matrix.json`);
if (!res.ok) throw new Error(`key-matrix.json HTTP ${res.status}`);
const raw: unknown = await res.json();
```

### WR-03: Empty-state "Clear all" button is reachable only after a selection, but the at-rest path can never reach it — branch ordering hides a latent dead path

**File:** `src/components/key-results-grid.ts:95-102`

**Issue:** The empty-state branch fires when
`this.hasSelection === true && !this.matchedSpecies?.length`. That is correct.
But the empty-state renders its own `Clear all` button that dispatches
`pnwm-key-clear-all`, while `pnwm-identify` also renders a `Clear all` button
in its sticky panel (`pnwm-identify.ts:244-247`). Both exist simultaneously in
the zero-match state, giving the user two "Clear all" controls with the same
effect. This is a UX/maintenance smell (duplicated control, two code paths to
keep in sync). Not a correctness bug, but worth consolidating.

**Fix:** Either suppress the panel's sticky Clear-all when the grid shows its
own, or drop the grid's button and rely on the panel's. Prefer a single source
of the action.

### WR-04: `totalCount` default duplicated and can drift from the schema-derived total

**File:** `src/components/key-results-grid.ts:59,86` and `src/components/pnwm-identify.ts:257`

**Issue:** The magic number `1192` is hard-coded in three places: the grid's
property initializer (`totalCount = 1192`, line 59), the grid's render fallback
(`const total = this.totalCount ?? 1192`, line 86), and the parent's binding
fallback (`.totalCount=${this._keyMatrix?.meta.matchedSpecies ?? 1192}`, line
257). The authoritative value is `meta.matchedSpecies` in the matrix. If the
key data changes (new species added), two of these literals go stale and the
at-rest count line ("Showing all 1,192 species") will lie until every literal
is updated. The njk template (`index.njk:30`) hard-codes `1,192` a fourth time.

**Fix:** Define a single `DEFAULT_KEY_SPECIES_TOTAL` constant (or accept that
the real value always arrives via `meta.matchedSpecies` and make the fallback
`0`/`—` rather than a plausible-but-wrong number). At minimum, centralize the
literal so it cannot silently diverge across the four sites.

## Info

### IN-01: Unreachable defensive coalescing in `render()`

**File:** `src/components/key-results-grid.ts:86-87`

**Issue:** `totalCount` and `matchedCount` are declared with non-null
initializers (`totalCount = 1192`, `matchedCount = 0`) and typed `number`, so
`this.totalCount ?? 1192` and `this.matchedCount ?? 0` can never take the
right-hand side under normal use. The `?? 1192` here also disagrees with the
initializer if it were ever changed. Dead defensive code.

**Fix:** Use `this.totalCount` / `this.matchedCount` directly, or make the
properties nullable if "unset" is a real state to model.

### IN-02: `index.njk` embeds `species` in `#key-char-data` but the component never reads it

**File:** `src/identify/index.njk:11` and `src/components/pnwm-identify.ts:97`

**Issue:** The inline JSON payload is
`{ characters: ..., species: keyMatrix.species }`, but `connectedCallback`
only consumes `data.characters` (line 97); species comes from the async
`key-matrix.json` fetch instead. The inlined `species` array is dead weight in
the HTML (it duplicates data already fetched), bloating every `/identify/`
page load.

**Fix:** Drop `species:` from the inline `#key-char-data` payload unless the
no-JS/SSR path needs it (the `<noscript>` block uses `keyMatrix.familyGroups`,
not this payload, so it does not).

### IN-03: `_renderCard` `alt` text omits subspecies/common name and may read awkwardly for hyphenated epithets

**File:** `src/components/key-results-grid.ts:75`

**Issue:** `alt="${sp.genus} ${sp.epithet}"` yields e.g. "Autographa v-alba",
which is acceptable but inconsistent with the visible label that also shows
`common_name`. Minor accessibility nicety, not a defect.

**Fix:** Consider `alt="${sp.genus} ${sp.epithet}${sp.common_name ? ' — ' + sp.common_name : ''}"`
for parity with the visible label, or keep as-is intentionally.

---

_Reviewed: 2026-06-25T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
