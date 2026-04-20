---
phase: 11-accordion-component
plan: "03"
subsystem: client-side-components
tags: [lit, web-components, accordion, vite, bundle, wiring]
dependency_graph:
  requires:
    - phase: 11-02
      provides: src/components/pnwm-taxon-browser.js — full Lit accordion component
  provides:
    - src/components/main.js — pnwm-taxon-browser registered via side-effect import
  affects: [browse-page, vite-bundle]
tech-stack:
  added: []
  patterns:
    - Side-effect import for custom element registration (no named exports needed)
key-files:
  created: []
  modified:
    - src/components/main.js — appended import './pnwm-taxon-browser.js';
key-decisions:
  - "Import appended at end of existing import block — no reorganization needed"
metrics:
  duration: 47s
  completed: 2026-04-20
---

# Phase 11 Plan 03: Component Wiring Summary

**One import line in main.js activates pnwm-taxon-browser in the Vite bundle — build succeeds, 58/58 tests green, manual browser verification pending**

## Performance

- **Duration:** 47s
- **Started:** 2026-04-20T21:15:34Z
- **Completed:** 2026-04-20T21:16:21Z
- **Tasks:** 2 of 3 automated (1 checkpoint pending)
- **Files modified:** 1

## Accomplishments

- Added `import './pnwm-taxon-browser.js';` to `src/components/main.js`
- Full build succeeded — Vite bundled 86 modules including the new component
- `pnwm-taxon-browser` tag confirmed present in `_site/browse/index.html`
- Full test suite: 58/58 tests pass across all 8 test files
- No build warnings beyond pre-existing pagefind advisory

## Task Commits

1. **Task 1: Add pnwm-taxon-browser import to main.js** — `4f59b56` (feat)
2. **Task 2: Build verification — component registered, tests green** — `674bd08` (chore)

## Files Created/Modified

- `src/components/main.js` — appended `import './pnwm-taxon-browser.js';` (5 lines total, was 4)

## Build Output

```
vite v7.3.2 building client environment for production...
✓ 86 modules transformed.
_site/browse/index.html  11.06 kB │ gzip: 1.81 kB
_site/assets/main-Cj9rdKk5.js  369.14 kB │ gzip: 117.43 kB
✓ built in 864ms
[page-weight] All pages under 500KB threshold.
```

No errors. One pre-existing advisory: pagefind script tag lacks `type="module"` — not introduced by this plan.

## Test Results

```
# tests 58
# suites 8
# pass 58
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

All 13 pnwm-taxon-browser unit tests pass (from Plan 02 GREEN phase).
All pre-existing 45 tests remain green.

## Acceptance Criteria Verification

- [x] `grep "pnwm-taxon-browser" src/components/main.js` — returns 1 match
- [x] `npm run build` exits 0
- [x] `grep "pnwm-taxon-browser" _site/browse/index.html` — found
- [x] `ls _site/assets/main-*.js` — bundle exists (`main-Cj9rdKk5.js`)
- [x] Full test suite exits 0 — 58/58 pass
- [ ] Manual browser verification — awaiting checkpoint approval

## Manual Verification (Pending)

Task 3 is a `checkpoint:human-verify`. The 8 behaviors to verify:
1. BROWSE-02: Families collapsed by default with images (up to 4, 93px)
2. BROWSE-03: Expand family reveals subfamilies or genera; family images hide
3. BROWSE-04: Expand subfamily reveals genera with images
4. BROWSE-05: Expand genus reveals species links to `/species/{slug}/`
5. BROWSE-06: Image strips are 93px tall, no broken images
6. Show/hide images toggle works globally
7. SFILT-02: State filter dims taxa with no records (opacity ~0.35)
8. "All states" restores full opacity

Resume signal: type "approved" or describe issues found.

## Deviations from Plan

None — plan executed exactly as written. One import line added, build verified, tests green.

## Known Stubs

None — data fully wired:
- Taxonomy from `#taxon-data` script element in browse page
- State filter from `/species-states.json` (built by `emit-species-states.js`)
- Image URLs from `navImages[]` arrays in taxon data

## Threat Flags

None — single import line, no new security surface. Bundle content is maintainer-controlled source only (T-11-06 disposition: accept, as documented in plan threat model).

## Self-Check: PASSED

- [x] `src/components/main.js` contains `import './pnwm-taxon-browser.js';`
- [x] Commit `4f59b56` present in git log
- [x] Commit `674bd08` present in git log
- [x] Build succeeded (86 modules, exit 0)
- [x] 58/58 tests pass

---
*Phase: 11-accordion-component*
*Completed: 2026-04-20 (Tasks 1-2; Task 3 checkpoint pending)*
