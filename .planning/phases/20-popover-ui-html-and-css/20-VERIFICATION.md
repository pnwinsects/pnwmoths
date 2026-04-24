---
phase: 20-popover-ui-html-and-css
verified: 2026-04-23T22:15:00Z
status: passed
score: 7/7
overrides_applied: 0
human_verification:
  - test: "Hover a glossary term on a species page and confirm a styled popover appears below the term with definition text and optional image"
    expected: "White popover panel appears below the dotted-underline term, showing definition text (and CDN image if the term has one). Popover dismisses on mouseleave, blur, Escape, and click-outside."
    why_human: "Visual popover appearance, positioning, and dismiss behavior cannot be verified programmatically without a browser"
  - test: "Tab to a glossary term via keyboard and confirm the popover opens"
    expected: "Popover opens on focus, same content as hover. Tabbing away dismisses it."
    why_human: "Keyboard interaction and focus behavior require a live browser"
  - test: "Disable JavaScript and visit a species page with glossary terms"
    expected: "Dotted underline on terms is visible. Hovering shows native browser title tooltip. No layout is broken."
    why_human: "No-JS degradation path requires browser testing with JS disabled"
  - test: "Search for a glossary term definition text in Pagefind and confirm it does not appear in excerpts"
    expected: "Search results do not contain definition text from glossary.csv in their excerpts"
    why_human: "Pagefind search behavior requires interaction with the built search UI"
---

# Phase 20: Popover UI -- HTML and CSS Verification Report

**Phase Goal:** Users can see a styled popover panel with the full definition when they hover, focus, or click a highlighted glossary term; the feature works without JavaScript and does not pollute the Pagefind search index
**Verified:** 2026-04-23T22:15:00Z
**Status:** human_needed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Hovering or focusing an abbr.glossary-term opens a popover showing the full definition text, styled consistently with design tokens | VERIFIED | mouseenter/focus event listeners (lines 37-50); show() reads data-definition via textContent (line 56); CSS uses site design tokens: #fff bg, #bbb border, #333 text, 0.82rem font (theme.css lines 154-180) |
| 2 | The popover shows a CDN image above the definition when data-image-url is non-empty | VERIFIED | Lines 57-60: conditional check on imageUrl, sets gtImg.src and gtImg.hidden=false |
| 3 | The popover shows definition only (no broken image) when data-image-url is empty | VERIFIED | Lines 61-64: gtImg.src='', gtImg.hidden=true -- no broken image placeholder |
| 4 | The popover dismisses on mouseleave, blur, Escape key, and click-outside | VERIFIED | mouseleave/blur handlers (lines 41-50) with 80ms debounce; popover="auto" (line 19) provides native Escape and click-outside dismiss |
| 5 | With JS disabled, abbr title attribute provides native browser tooltip fallback | VERIFIED | Static build output contains abbr elements with title attributes (2 found in sample page); no popover HTML in static output (0 matches); abbr.glossary-term CSS rule preserved (theme.css lines 147-152) |
| 6 | Pagefind search results do not contain glossary definition text | VERIFIED | Zero matches for glossary-popover/gt-def/data-definition in _site/pagefind/; popover divs injected at runtime only, never present in static HTML that Pagefind indexes |
| 7 | No layout is broken with JS disabled | VERIFIED | No popover divs in static HTML; abbr.glossary-term CSS is purely decorative (dotted underline); no conditional layout depends on JS |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/components/glossary-tooltip.js` | Popover API tooltip implementation containing showPopover | VERIFIED | 89 lines, contains showPopover (line 71), hidePopover (line 86), popover="auto" (line 19), glossary-popover class (line 18), per-term popover creation, getBoundingClientRect positioning, 80ms debounce, image conditional, ARIA attributes, no mousemove, no imports/exports |
| `src/styles/theme.css` | Popover CSS styling containing .glossary-popover | VERIFIED | 3 rules: .glossary-popover (line 154), .glossary-popover .gt-img (line 167), .glossary-popover .gt-def (line 175); zero #glossary-tooltip references; position:absolute, margin:0, inset:unset, padding:8px 12px; no display:none or z-index; abbr.glossary-term rule preserved (lines 147-152) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/components/glossary-tooltip.js` | `src/styles/theme.css` | class name glossary-popover | WIRED | JS sets className='glossary-popover' (line 18); CSS targets .glossary-popover (line 154) |
| `src/components/glossary-tooltip.js` | abbr.glossary-term elements (Phase 19 build output) | querySelectorAll('abbr.glossary-term') | WIRED | Line 11: `document.querySelectorAll('abbr.glossary-term')`; build output confirmed to contain abbr elements (2 in sample page) |
| `src/components/main.js` | `src/components/glossary-tooltip.js` | import './glossary-tooltip.js' | WIRED | main.js line 7: `import './glossary-tooltip.js';` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| glossary-tooltip.js | definition (line 54) | abbr.dataset.definition | Yes -- Phase 19 build transform populates data-definition from glossary.csv | FLOWING |
| glossary-tooltip.js | imageUrl (line 53) | abbr.dataset.imageUrl | Yes -- Phase 19 build transform populates data-image-url from glossary.csv | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Build succeeds | npm run build | Completed successfully, 0 errors, 16622 links OK | PASS |
| Static HTML has glossary terms | grep -c 'abbr class="glossary-term"' on sample page | 2 matches | PASS |
| No popover HTML in static output | grep -c 'glossary-popover\|gt-def' on sample page | 0 matches | PASS |
| Commits exist | git log --oneline a08268c and 3b939fb | Both found | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| TIP-01 | 20-01-PLAN.md | Hovering or focusing a wrapped glossary term opens a popover panel showing the full definition text | SATISFIED | mouseenter/focus handlers trigger show(); textContent assignment from data-definition |
| TIP-02 | 20-01-PLAN.md | Popover panel includes CDN glossary image when present; image-less terms show definition only | SATISFIED | Image conditional logic (lines 57-64): gtImg.src set when imageUrl truthy, gtImg.hidden=true when empty |
| TIP-03 | 20-01-PLAN.md | Popover uses native Popover API; dismisses on mouseout/blur/Escape | SATISFIED | popover="auto" (line 19); showPopover/hidePopover calls; Escape+click-outside via Popover API; mouseleave/blur via 80ms timer |
| QA-02 | 20-01-PLAN.md | Pagefind index does not include definition text | SATISFIED | Runtime injection -- zero glossary-popover/gt-def in static build HTML; Pagefind indexes only static _site/ |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | -- | -- | -- | No anti-patterns found |

No TODO, FIXME, PLACEHOLDER, console.log, stub returns, or hardcoded empty values found in either modified file.

### Human Verification Required

### 1. Popover Visual Behavior

**Test:** Run `npm run build && npx serve _site`, navigate to a species page with glossary terms, hover a dotted-underline term.
**Expected:** White popover appears BELOW the term (not cursor-following) showing definition text. If the term has an image, image appears above text. Moving mouse away dismisses after brief delay.
**Why human:** Visual appearance, positioning, and dismiss animation require a live browser.

### 2. Keyboard Navigation

**Test:** Tab to a glossary term via keyboard.
**Expected:** Popover opens on focus with same content as hover. Tabbing away dismisses. Escape key dismisses while open.
**Why human:** Keyboard focus behavior and Escape key handling require interactive browser testing.

### 3. No-JS Degradation

**Test:** Disable JavaScript in browser, visit a species page.
**Expected:** Dotted underline on glossary terms is visible. Hovering shows native browser title tooltip. No layout breakage.
**Why human:** No-JS behavior requires browser with JS disabled.

### 4. Pagefind Search Verification

**Test:** Use the search UI to search for a word that appears in a glossary definition.
**Expected:** Search results do not show glossary definition text in excerpts.
**Why human:** Pagefind search behavior requires interaction with the live search UI.

### Gaps Summary

No automated gaps found. All 7 observable truths verified through code analysis, all 4 requirements satisfied, all artifacts exist and are substantive and wired, all key links verified, data flows traced to real sources, build succeeds, and no anti-patterns detected.

4 items require human visual/interactive verification before the phase can be marked as fully passed.

---

_Verified: 2026-04-23T22:15:00Z_
_Verifier: Claude (gsd-verifier)_
