---
phase: 2
slug: species-factsheet-static
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-11
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Eleventy build + manual browser check (no test framework detected) |
| **Config file** | eleventy.config.js |
| **Quick run command** | `npx @11ty/eleventy --serve --quiet` |
| **Full suite command** | `npx @11ty/eleventy` (full build, check exit code) |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx @11ty/eleventy` and check exit code 0
- **After every plan wave:** Run full build + spot-check HTML output in `_site/`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 1 | SPEC-02 | — | N/A | build | `npx @11ty/eleventy && grep -r "scientific_name" _site/species/ | head -1` | ✅ | ⬜ pending |
| 2-01-02 | 01 | 1 | SPEC-03 | — | N/A | build | `npx @11ty/eleventy && grep -r "photographer" _site/species/ | head -1` | ✅ | ⬜ pending |
| 2-01-03 | 01 | 1 | SPEC-04 | — | N/A | build | `npx @11ty/eleventy && grep -r 'href="/species/' _site/species/ | head -1` | ✅ | ⬜ pending |
| 2-02-01 | 02 | 2 | BRWS-01 | — | N/A | build | `npx @11ty/eleventy && test -d _site/browse/` | ✅ | ⬜ pending |
| 2-02-02 | 02 | 2 | BRWS-02 | — | N/A | build | `npx @11ty/eleventy && test -d _site/genus/` | ✅ | ⬜ pending |
| 2-02-03 | 02 | 2 | BRWS-03 | — | N/A | build | `npx @11ty/eleventy && grep -r "browse\|search\|glossary" _site/index.html | head -1` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Verify `npx @11ty/eleventy` runs cleanly from project root
- [ ] Confirm `_site/` directory is produced

*No new test framework installation required — validation is build-based.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Placeholder renders for species with no images | SPEC-03 | Requires visual browser check | Open a species page known to have no images; confirm placeholder element visible, no broken img tags |
| Similar species links resolve correctly | SPEC-04 | Requires navigation in browser | Click a similar species link; confirm destination page loads |
| Browse page grouped by family then genus | BRWS-01 | Requires visual layout check | Open /browse/; confirm family headings precede genus subheadings |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
