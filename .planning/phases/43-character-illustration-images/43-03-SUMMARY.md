---
phase: 43-character-illustration-images
plan: 03
subsystem: ui
tags: [lit, cdn, bunny, csv, character-images, details-expander, pure-helpers, css, tdd]

# Dependency graph
requires:
  - phase: 43-01
    provides: CharacterSchema with image_filename + alt_text fields; build-key.ts scaffolding
  - phase: 43-02
    provides: data/key-character-images.csv (77-row curator draft); ~191 WebP objects live on CDN

provides:
  - scripts/build-key.ts — CSV-driven image_filename + alt_text population (CIMG-02 build half)
  - src/components/pnwm-identify.ts — exported characterImageSrc + helpImageAlt pure helpers; per-state <details> expander in _renderQuestion
  - src/styles/theme.css — .pnwm-kfp-help expander rules (UI-SPEC §5)
  - data/key-matrix.json — regenerated with 77 characters having image_filename set

affects:
  - UAT: browser verification that CDN WebP loads in the expander (Task 4 checkpoint)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "KEY_CHAR_IMAGES_CSV env var redirect: allows integration tests to point build-key.ts at temp fixture CSVs without touching the committed data/key-character-images.csv"
    - "Pure exported helpers (characterImageSrc, helpImageAlt) own host-absolute CDN URL logic and alt-text derivation — _renderQuestion consumes them; unit tests assert on plain string returns without render-to-string (zero new deps)"
    - "CDN_BASE_URL constant in pnwm-identify.ts copied verbatim from key-results-grid.ts:9 — the pathPrefix-guard pattern (never this._prefix for CDN URLs)"

key-files:
  created: []
  modified:
    - scripts/build-key.ts
    - scripts/build-key.test.ts
    - src/components/pnwm-identify.ts
    - src/components/pnwm-identify.test.ts
    - src/styles/theme.css
    - data/key-matrix.json

key-decisions:
  - "KEY_CHAR_IMAGES_CSV env var redirect chosen over pure-function extraction for CSV path, minimizing the diff to build-key.ts while making the absent-CSV and out-of-range cases testable via the existing execSync integration harness"
  - "Structural <details>-iff-image_filename test uses the helper-driven branch assertion idiom (char.image_filename ? characterImageSrc(char.image_filename) : null) rather than node-html-parser parsing of TemplateResult — consistent with the existing test idiom, zero new deps"
  - "alt_text blank check uses alt_text && alt_text.trim() in helpImageAlt, matching the plan spec (whitespace-only → fall back to state)"

patterns-established:
  - "Pattern: characterImageSrc is the single home for host-absolute CDN URL + encodeURIComponent + pathPrefix-guard; callers never construct CDN URLs inline"
  - "Pattern: helpImageAlt centralizes the alt-text derivation rule; callers never inline the null/blank fallback"

requirements-completed: [CIMG-02, CIMG-03]

# Metrics
duration: ~30min
completed: 2026-06-25
---

# Phase 43 Plan 03: Character Illustration Images — Build-Key CSV Population + Panel Expander Summary

**CSV-driven image_filename/alt_text population in build-key.ts + exported characterImageSrc/helpImageAlt helpers + per-state <details> CDN expander in the identify panel with UI-SPEC §5 CSS**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-06-25
- **Completed:** 2026-06-25
- **Tasks:** 3 automated + 1 UAT checkpoint (Task 4 pending browser verification)
- **Files modified:** 5 modified + data/key-matrix.json regenerated

## Accomplishments

- `build-key.ts` now reads `data/key-character-images.csv` (soft-skip if absent, warn + skip on out-of-range `char_id`) and populates `image_filename` and `alt_text` per character; `data/key-matrix.json` regenerated with 77 characters mapped
- `pnwm-identify.ts` exports `characterImageSrc(image_filename)` (host-absolute CDN URL, `encodeURIComponent`, pathPrefix-guard) and `helpImageAlt(state, alt_text)` (curator alt_text or state verbatim, never empty); `_renderQuestion` emits `<details class="pnwm-kfp-help">` as sibling of `<label>` iff `image_filename` truthy
- `theme.css` has the four `.pnwm-kfp-help` selectors with muted closed summary, olive focus outline (mirrors `.pnwm-krg-card:focus-visible`), and 320px-capped image on `#f0ece0` tint
- `npm test` green at 400/400; `npm run typecheck` clean

## Task Commits

TDD tasks have RED + GREEN commits:

1. **Task 1 (RED): CIMG-02 failing tests** - `c7f2d5ab` (test)
2. **Task 1 (GREEN): build-key CSV population** - `00297bf4` (feat)
3. **Task 2 (RED): CIMG-03 failing tests for characterImageSrc + helpImageAlt** - `182bf94b` (test)
4. **Task 2 (GREEN): pure helpers + <details> render** - `794359dd` (feat)
5. **Task 3: theme.css .pnwm-kfp-help rules** - `d44a9d51` (feat)

## Files Created/Modified

- `scripts/build-key.ts` — Added existsSync import; CSV read with KEY_CHAR_IMAGES_CSV env var override; soft-skip + out-of-range warn; replaced hardcoded nulls with CSV-driven values
- `scripts/build-key.test.ts` — Added 5 CIMG-02 tests: absent-CSV soft-skip, out-of-range D-08, valid row from committed CSV (char_id=5), valid row from temp fixture CSV
- `src/components/pnwm-identify.ts` — Added CDN_BASE_URL constant; exported characterImageSrc + helpImageAlt pure helpers; updated _renderQuestion to emit <details> expander
- `src/components/pnwm-identify.test.ts` — Added characterImageSrc tests (CDN-absolute, %20, %26, no /pnwmoths/https), helpImageAlt tests (alt wins, null/blank/whitespace fallback, never empty), structural branch tests
- `src/styles/theme.css` — Appended .pnwm-kfp-help block per UI-SPEC §5
- `data/key-matrix.json` — Regenerated; 77 characters have image_filename + alt_text from committed CSV

## Decisions Made

**KEY_CHAR_IMAGES_CSV env var for test fixtures:** The CSV read happens inside `main()` which is tested via the `execSync` integration harness. Rather than extracting a new pure function or modifying the function signature, an env var override (`KEY_CHAR_IMAGES_CSV`) lets tests redirect the path to temp fixture CSVs. This is a minimal diff that makes all three CIMG-02 test cases (absent, out-of-range, valid) testable without touching the committed `data/key-character-images.csv`.

**Structural test idiom (no render-to-string):** The structural `<details>`-iff-`image_filename` test asserts on the helper-driven branch directly (`char.image_filename ? characterImageSrc(char.image_filename) : null`) rather than parsing a rendered `TemplateResult`. This is consistent with the file's existing test idiom (plain method/helper return checks) and adds zero new dependencies (RESEARCH zero-new-deps lock).

## Deviations from Plan

None — plan executed exactly as written. The env var override approach for test fixtures is consistent with the plan's instruction to "write fixtures to a temp path and point the read at it."

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required for code tasks. Task 4 (UAT) requires a browser.

## Next Phase Readiness

**Task 4 (UAT): PASSED (operator-verified 2026-06-26).** The owner confirmed the
`ⓘ illustration` expander works well in the browser: it appears beside mapped
states, opening it loads the CDN WebP via the non-prefixed
`https://pnwmoths.b-cdn.net/key-images/...` src, unmapped states show no expander,
the panel stays fully functional, and keyboard toggle works.

Follow-ups captured (deferred, non-blocking):
- **Disclosure-marker affordance:** the native right-pointing caret (▶) reads as a
  navigation link rather than an expand triangle next to `ⓘ illustration`. Deferred
  to the planned Identify-page UI-polish round —
  `.planning/todos/pending/2026-06-26-identify-help-expander-disclosure-marker-reads-as-nav-link.md`.
- **CSV curator pass:** 12 color-name collisions in the draft `data/key-character-images.csv`
  (e.g. `Black copy.jpg` vs `Black.jpg`) need curator resolution; ~160/237 states remain
  unmapped (best-effort coverage by design).

All automated success criteria are green and UAT is approved.

## Self-Check

- [x] `scripts/build-key.ts` modified with existsSync + CSV read
- [x] `scripts/build-key.test.ts` has 5 CIMG-02 tests all passing
- [x] `src/components/pnwm-identify.ts` exports characterImageSrc + helpImageAlt
- [x] `src/components/pnwm-identify.test.ts` has Phase 43 RED tests all passing
- [x] `src/styles/theme.css` has .pnwm-kfp-help block with 4 selectors + max-height: 320px
- [x] `data/key-matrix.json` regenerated with 77 mapped characters
- [x] `npm test` 400/400 passing
- [x] `npm run typecheck` clean
- [x] Commits c7f2d5ab, 00297bf4, 182bf94b, 794359dd, d44a9d51 present in git log

## Self-Check: PASSED

---
*Phase: 43-character-illustration-images*
*Plan: 03*
*Completed: 2026-06-25*
