---
phase: 28
slug: end-to-end-vertical-slice-pilot-one-species
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-22
---

# Phase 28 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | {pytest 7.x / jest 29.x / vitest / go test / other — fill in from planner} |
| **Config file** | {path or "none — Wave 0 installs"} |
| **Quick run command** | `{quick command}` |
| **Full suite command** | `{full command}` |
| **Estimated runtime** | ~{N} seconds |

---

## Sampling Rate

- **After every task commit:** Run `{quick run command}`
- **After every plan wave:** Run `{full suite command}`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** {N} seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 28-01-01 | 01 | 1 | PILOT-01 | — | N/A | manual | — | ⬜ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Note: This phase is a manual integration pilot. Most success criteria are validated by operator observation in a real browser against real bunny.net CDN responses, not by automated unit tests. The planner should populate this table with one row per task; rows that map to manual verification should reference the Manual-Only Verifications block below.*

---

## Wave 0 Requirements

- [ ] *Planner to fill from RESEARCH.md `## Validation Architecture` section*

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| OSD launches in production lightbox, pan/zoom/home work | PILOT-01 | Visual viewer behavior on real CDN tiles cannot be asserted by unit test | Open pilot species page in dev preview against production CDN, click lightbox image, observe OSD canvas; pan with drag, zoom with scroll/pinch, click home control to reset |
| Tiles served from `{{cdnBaseUrl}}/species-tiles/{slug}/{specimen_id}-{view}/...dzi` | PILOT-01 | URL convention validated via DevTools Network panel | DevTools Network tab during lightbox open; assert `.dzi` request returns 200 + correct path; assert `_files/N/X_Y.{ext}` tile requests return 200 |
| CORS headers correct on bunny.net Pull Zone | PILOT-01 | Browser CORS enforcement, no programmatic substitute | DevTools Console; assert no CORS errors on `.dzi` XHR fetch from production origin |
| No regressions to non-high-res species lightbox/carousel | PILOT-01 | Visual confirmation across multiple species pages | Open 2–3 species without `high_res_available`; click lightbox; confirm Phase 23 static carousel unchanged |
| `vips dzsave` recipe reproducibility | PILOT-01 | Operator-machine command, not CI | Operator follows documented recipe on a different specimen pair; confirms tile pyramid generated and uploaded |

*The planner should refine and expand this table from RESEARCH.md `## Validation Architecture` when writing PLAN.md.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies (where automation is feasible — manual rows must reference Manual-Only block)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify (waived for manual-pilot phases; document waiver in plan)
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < {N}s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
