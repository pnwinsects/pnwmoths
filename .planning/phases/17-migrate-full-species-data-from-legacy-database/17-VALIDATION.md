---
phase: 17
slug: migrate-full-species-data-from-legacy-database
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-22
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (Node 22 built-in) |
| **Config file** | none — invoked via `npm test` |
| **Quick run command** | `node --test scripts/migrate-species.test.js` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30 seconds (migration script reads 634 MB dump) |

---

## Sampling Rate

- **After every task commit:** Run `node --test scripts/migrate-species.test.js` (smoke tests on output CSVs)
- **After every plan wave:** Run `npm run build:data && npm test`
- **Before `/gsd-verify-work`:** Full `npm run build` must be green
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 17-01-01 | 01 | 1 | SC-1 | — | N/A | integration smoke | `node --test scripts/migrate-species.test.js` | ❌ W0 | ⬜ pending |
| 17-01-02 | 01 | 1 | SC-2 | — | N/A | integration smoke | `node --test scripts/migrate-species.test.js` | ❌ W0 | ⬜ pending |
| 17-01-03 | 01 | 2 | SC-3 | — | N/A | system | `npm run build:data` | ✅ | ⬜ pending |
| 17-01-04 | 01 | 3 | SC-4 | — | N/A | unit/integration | `npm test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/migrate-species.test.js` — smoke tests for SC-1 and SC-2:
  - species.csv has ≥ 1,300 rows (not stub 11 rows)
  - records.csv has ≥ 3,000 rows (not stub 667 rows)
  - No row in records.csv has a `species_slug` that doesn't appear in species.csv
  - species.csv has required columns: `id,genus,species,common_name,noc_id,authority,family,similar_species,subfamily`
  - records.csv has no non-PNW state codes (no CA, AK, UT, etc.)
  - records.csv has no rows with blank `latitude` or `longitude`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| family/subfamily correct for sample species | SC-1 | Cross-check requires human knowledge | Pick 5 species, verify family/subfamily in browser at pnwmoths.biol.wwu.edu |
| similar_species links resolve | SC-1 | Requires built site | Build site, visit a factsheet, click similar species link — should not 404 |
| Browse accordion shows all families | SC-3 | Requires built site | Build + serve, open /browse/, verify at least 10 families present |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
