---
phase: 19
slug: build-time-glossary-transform
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-23
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` + `node:assert/strict` (Node 22 built-in) |
| **Config file** | none — test files passed explicitly to `node --test` |
| **Quick run command** | `node --test src/_lib/glossary-transform.test.js` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~2 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test src/_lib/glossary-transform.test.js`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 19-01-01 | 01 | 0 | GLOS-01 | — | escapeHtml() on all attribute values | unit | `node --test src/_lib/glossary-transform.test.js` | ❌ W0 | ⬜ pending |
| 19-01-02 | 01 | 0 | GLOS-03, GLOS-06 | — | escapeRegex and escapeHtml helpers | unit | `node --test src/_lib/glossary-transform.test.js` | ❌ W0 | ⬜ pending |
| 19-01-03 | 01 | 0 | GLOS-01, GLOS-02 | — | buildTermMap longest-first sort | unit | `node --test src/_lib/glossary-transform.test.js` | ❌ W0 | ⬜ pending |
| 19-01-04 | 01 | 0 | GLOS-01, GLOS-04, GLOS-05 | — | seen Set per-invocation; scope guard | unit | `node --test src/_lib/glossary-transform.test.js` | ❌ W0 | ⬜ pending |
| 19-02-01 | 02 | 1 | QA-01 | — | N/A | unit | `node --test src/_lib/glossary-transform.test.js` | ❌ W0 | ⬜ pending |
| 19-03-01 | 03 | 2 | GLOS-01, GLOS-05 | — | N/A | integration | `npm run build` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/_lib/glossary-transform.js` — module stub (exported functions: `escapeRegex`, `escapeHtml`, `buildTermMap`, `applyGlossaryTerms`)
- [ ] `src/_lib/glossary-transform.test.js` — unit test stubs for QA-01 cases
- [ ] `package.json` — add `src/_lib/*.test.js` to `npm test` glob

*Existing `node:test` infrastructure covers all other phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Species page in browser has `<abbr>` wrapping first term occurrence | GLOS-01 | Requires rendered HTML inspection | Run `npm run build`, open `_site/species/habrosyne-scripta/index.html`, inspect DOM for `<abbr class="glossary-term">` |
| Glossary page has no `<abbr class="glossary-term">` | GLOS-05 | Requires build + page check | Run `npm run build`, grep `_site/glossary/index.html` for `abbr class="glossary-term"` — should be empty |
| Browse pages have no `<abbr class="glossary-term">` | GLOS-05 | Requires build + page check | Run `npm run build`, grep `_site/browse/` recursively — should be empty |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
