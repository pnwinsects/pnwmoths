---
phase: 30
slug: bunny-net-upload-of-tile-pyramids-bulk
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-23
---

# Phase 30 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in test runner (`node:test` + `node:assert/strict`) |
| **Config file** | None — test files enumerated in `package.json` `"test"` script |
| **Quick run command** | `node --test scripts/upload-tiles.test.js` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30 seconds (quick); ~60 seconds (full) |

Current test baseline: 182/182 passing.

---

## Sampling Rate

- **After every task commit:** Run `node --test scripts/upload-tiles.test.js`
- **After every plan wave:** Run `npm test` (full suite)
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 30-01-01 | 01 | 1 | UPLOAD-01 | T-30-01 | `redact()` wraps all error log output | unit | `node --test scripts/upload-tiles.test.js` | ❌ W0 | ⬜ pending |
| 30-01-02 | 01 | 1 | UPLOAD-01 | — | `tileUploadPath()` returns correct Storage Zone path | unit | `node --test scripts/upload-tiles.test.js` | ❌ W0 | ⬜ pending |
| 30-01-03 | 01 | 1 | UPLOAD-01 | T-30-03 | `species_slug` lowercased unconditionally in CDN path | unit | `node --test scripts/upload-tiles.test.js` | ❌ W0 | ⬜ pending |
| 30-01-04 | 01 | 1 | UPLOAD-01 | — | `tilePullZoneUrl()` returns Pull Zone URL (not Storage host) | unit | `node --test scripts/upload-tiles.test.js` | ❌ W0 | ⬜ pending |
| 30-01-05 | 01 | 1 | UPLOAD-02 | — | `isUploadable()` true for `status: tiled`, false for others | unit | `node --test scripts/upload-tiles.test.js` | ❌ W0 | ⬜ pending |
| 30-01-06 | 01 | 1 | UPLOAD-03 | — | Pre-flight footprint walk runs at startup before any PUT | manual | `DRY_RUN=1 npm run photos:upload` | — | ⬜ pending |
| 30-02-01 | 02 | 1 | — | — | `UPLOADING_TILES.md` covers all required runbook sections | manual | open and read | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/upload-tiles.test.js` — unit tests for `tileUploadPath`, `tilePullZoneUrl`, `isUploadable`; covers UPLOAD-01 (path construction, slug lowercasing, Pull Zone URL), UPLOAD-02 (eligibility filter); model on `scripts/tile-photos.test.js` row factory pattern
- [ ] `scripts/upload-tiles.js` must export `tileUploadPath`, `tilePullZoneUrl`, `isUploadable` at module level (not inside `main()`)

*No new test framework needed — existing `node:test` + `node:assert/strict` infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| DRY_RUN prints Pull Zone URLs, first 5 rows, no upload or manifest write | L-03 | Requires live `var/tiles/` corpus | `DRY_RUN=1 npm run photos:upload` — verify URLs start with `https://pnwmoths.b-cdn.net/species-tiles/` |
| API key redacted in error output | L-04 | Error path requires simulated failure | Inspect `redact()` call sites; confirm BUNNY_API_KEY never logged unredacted |
| Pre-flight footprint walk runs at startup | UPLOAD-03 | Requires `var/tiles/` corpus | `npm run photos:upload` — first line of output shows total GB before any PUT |
| Manifest advances `tiled → uploaded` after row success | UPLOAD-01 | Requires live bunny.net | Spot-check first row after upload: `grep "uploaded" data/species-photos-manifest.csv | head -3` |
| Tile directory deleted after successful upload | D-03 | Requires live run | Verify `var/tiles/{slug}/` absent after first row completes |
| Pull Zone URL resolves after upload | UPLOAD-01 SC-4 | Requires uploaded tiles | `curl -I https://pnwmoths.b-cdn.net/species-tiles/{slug}/{id}-{view}.dzi` returns 200 |
| UPLOADING_TILES.md runbook complete | — | Manual review | Open `_instructions/UPLOADING_TILES.md`; verify env setup, dry-run, resume, crash recovery, and spot-check sections present |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
