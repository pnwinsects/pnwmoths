---
phase: 42
slug: results-grid
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-25
---

# Phase 42 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in (`node:test`) — no Vitest, no Jest |
| **Config file** | none — run directly via `node --test` |
| **Quick run command** | `node --test src/components/key-results-grid.test.ts src/components/pnwm-identify.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds (full suite, 324+ tests) |

---

## Sampling Rate

- **After every task commit:** Run `npm test` (full suite — currently fast)
- **After every plan wave:** Run `npm test && npm run build && node scripts/check-page-weight.ts`
- **Before `/gsd-verify-work`:** Full suite green + page-weight check passes + Human UAT (grid renders, cards link correctly, lazy-load observed)
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 42-0-01 | Wave 0 | 0 | GRID-01..04 | — | N/A (static site, no auth surface) | unit (stubs) | `node --test src/components/key-results-grid.test.ts` | ❌ W0 | ⬜ pending |
| 42-xx | grid | 1 | GRID-01 | — | N/A | unit (pure fn) | `node --test src/components/key-results-grid.test.ts` | ❌ W0 | ⬜ pending |
| 42-xx | grid | 1 | GRID-02 (CDN URL build) | — | N/A | unit (pure fn) | `node --test src/components/key-results-grid.test.ts` | ❌ W0 | ⬜ pending |
| 42-xx | grid | 1 | GRID-03 (placeholder when nav_image null) | — | N/A | unit | `node --test src/components/key-results-grid.test.ts` | ❌ W0 | ⬜ pending |
| 42-xx | grid | 1 | GRID-04 (empty-state condition) | — | N/A | unit (state logic) | `node --test src/components/key-results-grid.test.ts` | ❌ W0 | ⬜ pending |
| 42-xx | identify | 1 | GRID-01 (computeMatching → count) | — | N/A | unit (extend) | `node --test src/components/pnwm-identify.test.ts` | ✅ extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/components/key-results-grid.test.ts` — new test file covering GRID-01 (count text logic), GRID-02 (CDN URL construction with `encodeURIComponent`), GRID-03 (placeholder condition for `nav_image: null`), GRID-04 (zero-match empty-state condition)
- [ ] Pure helper export(s) from `key-results-grid.ts` to make logic Node-testable: e.g. `buildCardUrl(slug, navImage, height)` → string, and a count-text helper (`"N species match"` / `"Showing all 1,192 species"`)
- [ ] `src/components/pnwm-identify.test.ts` additions: `_dispatchFilterChange()` sets matched species after the matrix loads; "Clear all" reset path clears matched state (D-09)
- [ ] Add `src/components/key-results-grid.test.ts` to the `npm test` glob if not auto-discovered

*Existing infrastructure (node:test, jsdom-style Lit harness in pnwm-identify.test.ts) covers the rest.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Grid updates without full page reload on select/deselect | GRID-02 / SC2 | Live DOM re-render + lazy-load observable only in a real browser | Load `/identify/`, open a category, toggle states, confirm thumbnails appear/disappear without a navigation/reload; confirm off-screen images are lazy |
| "Clear all" CTA in empty state resets selection | GRID-04 / SC4 | End-to-end interaction across panel + grid | Select characters until "No species match" appears; click the empty-state "Clear all"; confirm selection clears and the grid returns to the at-rest prompt |
| Gray placeholder renders for the 2 photo-less species | GRID-03 | Requires those specific species to appear in a filtered result | Filter to a combination including a `nav_image: null` species; confirm a gray block (no broken `<img>`) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
