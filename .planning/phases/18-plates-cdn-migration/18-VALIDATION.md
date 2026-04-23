---
phase: 18
slug: plates-cdn-migration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-22
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in test runner |
| **Config file** | none (tests run via npm test) |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test && npm run build` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test && npm run build`
- **Before `/gsd-verify-work`:** Full suite must be green + manual browser verification of plate viewer
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 18-01-01 | 01 | 1 | PLATES-04 | — | N/A | shell | `grep "data/plates.json" src/_data/plates.js` | ❌ W0 | ⬜ pending |
| 18-01-02 | 01 | 1 | PLATES-01 | — | N/A | shell | `node -e "const d=JSON.parse(require('fs').readFileSync('data/plates.json','utf8')); console.assert(d.length===98, 'Expected 98 plates, got ' + d.length)"` | ❌ W0 | ⬜ pending |
| 18-01-03 | 01 | 1 | PLATES-02 | — | N/A | shell | `grep "cdnBaseUrl" src/plates/plate.njk` | ❌ W0 | ⬜ pending |
| 18-01-04 | 01 | 1 | PLATES-03 | — | N/A | shell | `grep "cdnBaseUrl" src/plates/index.njk` | ❌ W0 | ⬜ pending |
| 18-01-05 | 01 | 2 | PLATES-05 | — | N/A | auto | `npm run build 2>&1 \| grep "plates"` | ✅ existing | ⬜ pending |
| 18-01-06 | 01 | 2 | PLATES-06 | — | BUNNY_API_KEY in env var only | manual | `curl -sI "https://pnwmoths.b-cdn.net/plates/plate-1-drepanidae/TileGroup0/0-0-0.jpg" \| grep "HTTP"` | ❌ after upload | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `data/plates.json` — must be created (copied from `plates/manifest.json`) before plates.js can read it
- [ ] Template changes and plates.js update — deliverables, not new test files; existing `npm test` (72 tests) covers CDN constant; no new unit tests needed

*Existing test infrastructure covers all other phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CDN delivers plate tiles at 200 OK | PLATES-06 | Requires upload to run first (one-time local operation) | `curl -sI "https://pnwmoths.b-cdn.net/plates/plate-1-drepanidae/TileGroup0/0-0-0.jpg" \| grep HTTP` — expect `HTTP/2 200` |
| OpenSeadragon plate viewer loads in browser | PLATES-06 | Visual rendering requires browser | Open any plate page; confirm deep zoom tiles load; check Network tab for 200 tile responses |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
