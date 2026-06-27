---
phase: 41-identify-page-scaffold-filter-panel
verified: 2026-06-25T05:17:29Z
status: passed
score: 8/8 must-haves verified
overrides_applied: 0
human_verification_resolved: 2026-06-25 — all 4 items PASS via automated browser run (playwright-core + system Chrome); see 41-HUMAN-UAT.md. CR-01 fixed (commit 20e3dcc1). Only console noise is a pre-existing site-wide /favicon.ico 404.
human_verification:
  - test: "Open /identify/ in a browser with JavaScript enabled. Expand each of the 8 category sections one by one."
    expected: "Each click expands the section revealing question fieldsets and per-state checkboxes; aria-expanded toggles; the triangle glyph rotates."
    why_human: "Lit component rendering and aria-expanded toggle behavior require a real browser execution context — cannot be verified by grep or node --test."
  - test: "With JS enabled, select two checkboxes in one category, then select one in a different category."
    expected: "The category header for each shows a badge with the count of selected states in that category (e.g. '(2)' and '(1)'). A sticky 'Clear all' button becomes visible."
    why_human: "Real-time badge update requires Lit reactive rendering in a browser."
  - test: "Click 'Clear all' with states selected."
    expected: "All checkboxes deselect, all category badges disappear, and the 'Clear all' button hides itself."
    why_human: "Requires browser execution of _clearAll() and Lit re-render."
  - test: "Open /identify/ in a browser with JavaScript disabled (devtools Network > disable JS or browser extension)."
    expected: "Two noscript sections are visible: 'Characters (JavaScript required to filter)' with all 8 category headings and their states as plain text, and 'All matched key species (1,192)' with Family→Genus links. No JS console errors on JS-enabled load."
    why_human: "Noscript rendering requires a real browser with JS disabled. Console errors require runtime observation."
---

# Phase 41: Identify Page Scaffold & Filter Panel — Verification Report

**Phase Goal:** A navigable `/identify/` page exists with a fully functional 237-state character filter panel, "Clear all" reset, and correct no-JS static degradation — before any results grid is wired in.
**Verified:** 2026-06-25T05:17:29Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | `data/key-matrix.json` has exactly 8 clean categories, none starting with `"` | ✓ VERIFIED | `node -e "const c=new Set(d.characters.map(x=>x.category)); console.log(c.size)"` → `8`; no stray-quote category |
| 2  | `parseCharacterLabel` strips leading/trailing double-quotes before split | ✓ VERIFIED | `scripts/build-key.ts:70` — `const cleaned = label.replace(/^"|"$/g, '');` |
| 3  | Build-key test suite (27 tests) locks the stray-quote fix and 8-category invariant | ✓ VERIFIED | `node --test scripts/build-key.test.ts` → 27 pass, 0 fail |
| 4  | Navigating to `/identify/` serves a page titled "Identify a moth" linked from site nav | ✓ VERIFIED | `_site/identify/index.html` exists; `grep '/identify/' _site/index.html` → `<li><a href="/identify/">Identify</a></li>` |
| 5  | The page inlines 237 characters as `#key-char-data` for the panel (no bitsets/familyGroups) | ✓ VERIFIED | Built page script tag: `keys: ['characters', 'species']`, `characters.length: 237`; `familyGroups` absent |
| 6  | With JS disabled, the full 8-category character hierarchy reads as plain text with no `<input>` elements; all 1,192 matched species appear as Family→Genus links | ⚠ PARTIAL | 8 category `<h3>` headings confirmed; 0 `<input>` in noscript confirmed; 1,192 unique `/species/` links confirmed. **CR-01 bug:** empty-string `family` on `Acopa perpallida` in `species.csv` survives `?? null` unchanged, placing a spurious "(no family)" group at the TOP of the family list (before Drepanidae) instead of the bottom. All 1,192 species remain present and linked — degradation is functional but mis-ordered. |
| 7  | `pnwm-identify` component renders 8 default-collapsed categories with aria-expanded accordion, fieldset/legend question groups, per-category count badges, and conditional "Clear all" | ? UNCERTAIN | Static analysis confirms: `customElements.define('pnwm-identify')`, `createRenderRoot(): this { return this; }` (Light DOM), `aria-expanded` wired to `_toggleCategory`, `<fieldset class="pnwm-kfp-question"><legend>` per question, `_hasSelection() ? html\`...\`Clear all\`\`` conditional render, `.pnwm-kfp-badge` span. Behavior requires browser execution — see Human Verification. |
| 8  | Full test suite passes: 324/324 (includes 17 new pnwm-identify unit tests + 27 build-key tests) | ✓ VERIFIED | `npm test` → 324 pass, 0 fail |

**Score:** 7/8 truths verified (6 VERIFIED, 1 PARTIAL-WARNING on CR-01, 1 UNCERTAIN pending browser)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `scripts/build-key.ts` | `parseCharacterLabel` with quote-stripping normalization | ✓ VERIFIED | Line 70: `label.replace(/^"\|"$/g, '')` present |
| `scripts/build-key.test.ts` | Stray-quote + 8-category invariant tests | ✓ VERIFIED | Contains `Abdomen and thorax` stray-quote case + `new Set(characters.map(c=>c.category)).size === 8` integration assertion |
| `data/key-matrix.json` | 8 clean categories, 237 characters, 1192 species | ✓ VERIFIED | Confirmed by direct node inspection |
| `src/_data/keyMatrix.ts` | Eleventy loader: join family from species.csv, export `{characters, species, familyGroups}` | ✓ VERIFIED | Exists; exports `KeyMatrixData`, `KeySpeciesWithFamily`; confirmed `characters.length===237`, `species.length===1192`, `familyGroups.length===12` |
| `src/identify/index.njk` | `/identify/` route: `#key-char-data` inline + `<pnwm-identify>` host + two-section `<noscript>` | ✓ VERIFIED | All three elements present in template and in `_site/identify/index.html` |
| `src/_includes/base.njk` | Identify nav link using `\| url` filter | ✓ VERIFIED | Line 25: `<li><a href="{{ '/identify/' \| url }}">Identify</a></li>` — no `/pnwmoths/` hardcoded |
| `src/components/pnwm-identify.ts` | Light-DOM Lit component: `buildCategoryMap`, accordion, badges, Clear all, event dispatch | ✓ VERIFIED | `customElements.define('pnwm-identify', PnwmIdentify)` at line 207; `createRenderRoot(): this { return this; }` at line 61; all required methods present |
| `src/components/pnwm-identify.test.ts` | Unit tests for `buildCategoryMap`, `_selectionCountForCategory`, `_hasSelection`, `_clearAll` | ✓ VERIFIED | 17 tests, all pass; real-data gate `buildCategoryMap(characters).size === 8` included |
| `src/components/main.ts` | Side-effect import of `pnwm-identify` | ✓ VERIFIED | Line 9: `import './pnwm-identify.ts';` |
| `src/styles/theme.css` | `.pnwm-kfp-category`, `.pnwm-kfp-badge`, `.pnwm-kfp-sticky`, `.pnwm-kfp-question` rules | ✓ VERIFIED | All four rule blocks present at lines 348–395 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `scripts/build-key.ts` | `data/key-matrix.json` | `parseCharacterLabel` normalization + `npm run build:key` | ✓ WIRED | Quote-strip fix confirmed; JSON regenerated with 8 categories |
| `src/identify/index.njk` | `src/_data/keyMatrix.ts` | `keyMatrix` data variable (`tojson` + `familyGroups` iteration) | ✓ WIRED | Template uses `keyMatrix.characters`, `keyMatrix.species`, `keyMatrix.familyGroups` |
| `src/identify/index.njk` | `data/key-matrix.json` | `keyMatrix.ts` `readFileSync` | ✓ WIRED | Loader reads file at build time; 237 characters confirmed in built page |
| `src/components/pnwm-identify.ts` | `#key-char-data` | `document.getElementById('key-char-data')` in `connectedCallback` | ✓ WIRED | Line 72: `const el = document.getElementById('key-char-data');` |
| `src/components/main.ts` | `src/components/pnwm-identify.ts` | Side-effect import | ✓ WIRED | `import './pnwm-identify.ts';` at line 9 |
| `src/components/pnwm-identify.ts` | `pnwm-key-filter-change` event | `dispatchEvent(new CustomEvent(...))` | ✓ WIRED | Lines 141–148: dispatches with `matchedSlugs: []` placeholder; Phase 42 consumer declared in ROADMAP |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `src/identify/index.njk` | `keyMatrix.characters` / `keyMatrix.familyGroups` | `src/_data/keyMatrix.ts` reads `data/key-matrix.json` + `data/species.csv` | Yes — 237 characters, 1192 species confirmed | ✓ FLOWING |
| `src/components/pnwm-identify.ts` | `_categoryMap` | `connectedCallback` → `document.getElementById('key-char-data')` → `buildCategoryMap(data.characters)` | Yes — 237 characters produce 8-category map (unit-tested with real data) | ✓ FLOWING |
| `src/components/pnwm-identify.ts` | `_selection` → `_dispatchFilterChange` | User checkbox interaction → `_onCheckboxChange` | Placeholder only (`matchedSlugs: []`) — intentional; Phase 42 wires real match computation | ⚠ PLACEHOLDER (deferred to Phase 42) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `data/key-matrix.json` has exactly 8 categories | `node -e "const c=new Set(require('./data/key-matrix.json').characters.map(x=>x.category)); console.log(c.size)"` | `8` | ✓ PASS |
| 237 characters and 1192 species in key-matrix.json | `node -e "const d=require('./data/key-matrix.json'); console.log(d.characters.length, d.species.length)"` | `237 1192` | ✓ PASS |
| Build-key tests (27) pass | `node --test scripts/build-key.test.ts` | 27 pass, 0 fail | ✓ PASS |
| pnwm-identify unit tests (17) pass | `node --test src/components/pnwm-identify.test.ts` | 17 pass, 0 fail | ✓ PASS |
| Full test suite | `npm test` | 324 pass, 0 fail | ✓ PASS |
| Built identify page exists with required elements | `grep -c '<pnwm-identify' _site/identify/index.html && grep -c 'id="key-char-data"' _site/identify/index.html` | `1` / `1` | ✓ PASS |
| 1,192 species links in built page | `grep -o '<a href="/species/[^"]*/">' _site/identify/index.html \| wc -l` | `1192` | ✓ PASS |
| Identify nav link in site pages | `grep '/identify/' _site/index.html` | `<li><a href="/identify/">Identify</a></li>` | ✓ PASS |
| Page weight under 500 KB | `du -h _site/identify/index.html` | `336K` | ✓ PASS |
| No `<input>` in noscript | `grep -A 5000 '<noscript' _site/identify/index.html \| grep -c '<input'` | `0` | ✓ PASS |
| Spurious "(no family)" group at top of species list (CR-01) | `grep -n '(no family)' _site/identify/index.html` | Match at line 65, before Drepanidae | ⚠ WARNING — confirms CR-01 |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| IDENT-01 | Plan 41-02 | New dedicated `/identify/` page, linked from site navigation | ✓ SATISFIED | `_site/identify/index.html` exists; Identify nav link confirmed in `_site/index.html` |
| IDENT-02 | Plans 41-01, 41-03 | Character filter panel renders all 8 categories as collapsible groups (default-collapsed), nesting subcategory→question→state, reusing the `aria-expanded` toggle pattern | ✓ SATISFIED | `pnwm-identify.ts` implements 8-category accordion with `aria-expanded` and `fieldset/legend` question groups; unit-tested; browser confirmation needed for runtime |
| IDENT-03 | Plan 41-03 | User can select and deselect individual character states (checkbox toggle), in any order | ✓ SATISFIED | `_onCheckboxChange` uses new-Set/new-Map replacement reactivity; `_selectionCountForCategory` unit-tested for any-order correctness; browser confirmation needed for runtime |
| IDENT-05 | Plan 41-03 | "Clear all" reset clears every selection and restores the full result set | ✓ SATISFIED | `_clearAll()` resets `_selection = new Map()`; conditionally visible via `_hasSelection()`; `_clearAll` unit-tested; browser confirmation needed for runtime |
| IDENT-06 | Plan 41-02 | No-JS static degradation — full character list and full species list visible as static HTML without JavaScript | ⚠ PARTIAL | 8 category headings confirmed; 1,192 species links confirmed; no `<input>` in noscript confirmed. **CR-01:** one species (`Acopa perpallida`) has empty-string `family` in `species.csv`; `?? null` in `keyMatrix.ts:53` does not convert `''` to `null`; the empty-string group renders as "(no family)" at the **top** of the species list (before Drepanidae) instead of the bottom. The species is present and linked — only its grouping position is wrong. |

Note: IDENT-04 (filter semantics, Phase 40) is not a Phase 41 requirement. GRID-01/02/03 (Phase 42) are correctly deferred.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/components/pnwm-identify.ts` | 142 | `matchedSlugs: []` placeholder | ℹ Info | Intentional — Phase 41 has no results consumer; Phase 42 wires `computeMatching()`. Documented in SUMMARY and plan. |
| `src/_data/keyMatrix.ts` | 53 | `r.family ?? null` does not normalize empty-string family | ⚠ Warning | CR-01: One matched key species (`Acopa perpallida`) has `family === ''` in `species.csv`. Nullish coalescing does not convert `''` to `null`. The empty-string group sorts before all real families, rendering "(no family)" at the top of the no-JS species list. Fix: `r.family?.trim() || null`. |

No `TBD`, `FIXME`, or `XXX` debt markers found in any phase-modified file.

No `return null`, stub-only handlers, or empty implementations found (the `matchedSlugs: []` placeholder is scoped by design to Phase 41's pre-consumer state and is formally addressed in Phase 42 ROADMAP).

Reactive field immutability confirmed: `_expandedCategories` and `_selection` are replaced via `new Set(...)` / `new Map(...)` construction — no in-place `.add()` or `.delete()` on reactive fields.

### Human Verification Required

#### 1. 8-Category Accordion Renders and Toggles Correctly

**Test:** Navigate to `/identify/` in a browser (JS on). Click each of the 8 category section headers.
**Expected:** Each click expands/collapses the section. The triangle glyph rotates 90deg when expanded. `aria-expanded` attribute toggles on the button. Questions appear as `<fieldset>/<legend>` groups with per-state checkboxes when the section is open.
**Why human:** Lit component rendering, DOM attachment, and aria attribute mutation require a real browser execution context.

#### 2. Per-Category Count Badges Update in Real Time

**Test:** Select two checkboxes in the "Distribution" category, then one in "Seasonality".
**Expected:** The Distribution header shows "(2)" badge; Seasonality header shows "(1)" badge. Badges appear/disappear as selections are toggled.
**Why human:** Lit reactive rendering requires a browser.

#### 3. "Clear all" Button Appears and Clears Selections

**Test:** With at least one state selected, observe the sticky "Clear all" button. Click it.
**Expected:** Button is visible and sticky (scrolls with the viewport header). Clicking it deselects all checkboxes, removes all badges, and hides the button itself.
**Why human:** Requires browser execution of `_clearAll()` and Lit re-render cycle.

#### 4. No-JS Degradation — Browser Confirmation

**Test:** Open `/identify/` with JavaScript disabled. Verify the two `<noscript>` sections.
**Expected:** Section 1 heading "Characters (JavaScript required to filter)" with 8 category sub-headings and state list items — no form controls or checkboxes. Section 2 heading "All matched key species (1,192)" with family → genus → species links. Note: due to **CR-01**, the "(no family)" group for *Acopa perpallida* currently appears at the **top** of the list (before Drepanidae) rather than at the bottom. Decide whether this is acceptable or requires the one-line fix in `keyMatrix.ts:53`.
**Why human:** Requires disabling JS in a browser. CR-01 impact requires human judgment on acceptance.

#### 5. No Console Errors on JS-Enabled Load

**Test:** Open `/identify/` with JS enabled; open the browser console.
**Expected:** No errors or unhandled promise rejections. The `<pnwm-identify>` element registers and initialises without warnings.
**Why human:** Runtime errors (e.g. missing `#key-char-data`, failed JSON parse) are only observable at runtime.

### Gaps Summary

No hard blockers. All artifacts exist, are substantive, and are wired correctly.

**CR-01 (WARNING — human decision required):** The empty-string `family` field for *Acopa perpallida* in `species.csv` is treated as a distinct non-null family (via `r.family ?? null` at `keyMatrix.ts:53`), causing a spurious "(no family)" group to appear at the **top** of the no-JS species list instead of the bottom. All 1,192 species remain present and linked — degradation is complete, only the sort order is wrong for one species. The fix is one character: change `r.family ?? null` to `r.family?.trim() || null`. Whether this constitutes a failure of "correct no-JS static degradation" (IDENT-06) is a judgment call for the developer. The REVIEW.md (CR-01) already flags this with the exact fix.

---

_Verified: 2026-06-25T05:17:29Z_
_Verifier: Claude (gsd-verifier)_
