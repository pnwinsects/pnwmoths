---
phase: 41
slug: identify-page-scaffold-filter-panel
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-24
---

# Phase 41 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in test runner (`node --test`, native `.ts` type-stripping) |
| **Config file** | none — test files run via `npm test` glob |
| **Quick run command** | `node --test src/components/pnwm-identify.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm run build` (includes page-weight check)
- **Before `/gsd-verify-work`:** Full `npm run build` green + human visual verify in browser
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 41-W0-strayquote | build-key | 0 | (data) | — | N/A | unit | `node --test scripts/build-key.test.ts` | ✅ extend | ⬜ pending |
| 41-W0-tests | pnwm-identify | 0 | IDENT-02/03/05 | — | N/A | unit (stubs) | `node --test src/components/pnwm-identify.test.ts` | ❌ W0 | ⬜ pending |
| SC1 route render | identify-page | — | IDENT-01 | — | N/A | smoke (grep build) | `grep '<pnwm-identify' _site/identify/index.html` | ❌ W0 | ⬜ pending |
| SC2 accordion + badges | filter-panel | — | IDENT-02, IDENT-03 | — | N/A | unit | `node --test src/components/pnwm-identify.test.ts` | ❌ W0 | ⬜ pending |
| SC3 clear-all | filter-panel | — | IDENT-05 | — | N/A | unit | `node --test src/components/pnwm-identify.test.ts` | ❌ W0 | ⬜ pending |
| SC4 page weight | identify-page | — | IDENT-06 | — | N/A | build check | `npm run build:check-weight` | ✅ | ⬜ pending |
| SC4 no-JS fallback | identify-page | — | IDENT-06 | — | N/A | smoke (grep) | `grep -c '<a href' _site/identify/index.html` (≥1192) | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/components/pnwm-identify.test.ts` — unit stubs for `buildCategoryMap`, `_selectionCountForCategory`, `_hasSelection`, `_clearAll`
- [ ] Extend `scripts/build-key.test.ts` — assert stray-quote label `'"Abdomen and thorax:…:Yes"'` normalizes to category `Abdomen and thorax` / state `Yes`, and that `data/key-matrix.json` has exactly 8 distinct category strings
- [ ] Post-build smoke check: grep `_site/identify/index.html` for `<pnwm-identify>`, `<noscript>`, and ≥1192 species `<a href>` links

*Node test runner already present — no framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Accordion expand/collapse + real-time selection feel | IDENT-02, IDENT-03 | Visual/interaction quality not fully captured by unit assertions | Load `/identify/` in a browser, expand each of the 8 categories, toggle states, confirm badge counts update live and "Clear all" appears/disappears |
| No-JS degradation readability | IDENT-06 | Requires disabling JS and reading rendered output | Disable JS, load `/identify/`, confirm character hierarchy is readable text and species appear as static Family→Genus links |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
