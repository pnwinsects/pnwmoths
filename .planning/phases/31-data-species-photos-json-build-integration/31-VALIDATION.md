---
phase: 31
slug: data-species-photos-json-build-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-23
---

# Phase 31 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in `node:test` (no external test runner) |
| **Config file** | none — tests listed explicitly in `npm test` |
| **Quick run command** | `node --test scripts/generate-species-photos.test.js` |
| **Full suite command** | `node --test eleventy.config.test.js scripts/build-data.test.js scripts/check-page-weight.test.js scripts/ingest-photos.test.js scripts/migrate-species.test.js scripts/tile-photos.test.js scripts/upload-tiles.test.js scripts/generate-species-photos.test.js scripts/lib/*.test.js src/components/*.test.js src/_lib/*.test.js` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test scripts/generate-species-photos.test.js`
- **After every plan wave:** Run full suite (add `scripts/generate-species-photos.test.js` to the `npm test` command)
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 31-01-01 | 01 | 0 | DATA-01 | — | N/A | unit | `node --test scripts/generate-species-photos.test.js` | ❌ Wave 0 | ⬜ pending |
| 31-01-02 | 01 | 1 | DATA-01 | — | N/A | unit | `node --test scripts/generate-species-photos.test.js` | ❌ Wave 0 | ⬜ pending |
| 31-02-01 | 02 | 1 | DATA-03 | — | N/A | manual | `npm run build:eleventy` + inspect `_site/species/abagrotis-apposita/index.html` | ✅ existing | ⬜ pending |
| 31-02-02 | 02 | 1 | DATA-02 | — | N/A | manual | `npm run build:eleventy` + verify 1,364 species pages | ✅ existing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/generate-species-photos.test.js` — unit tests for exported pure functions: `buildSpeciesPhotos`, `isMaterializable`, `toTilesPath`; row factory supplying synthetic `uploaded`-status rows (no real manifest rows locally)
- [ ] Add `scripts/generate-species-photos.test.js` to the `npm test` command in `package.json`

*These are the only Wave 0 requirements. Existing test infrastructure (Node.js built-in test runner, csv-parse, all other test files) already covers the project.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Template guard suppresses low-res `<figure>` for high-res species | DATA-03 | Nunjucks template output requires build + HTML inspection; no unit test covers Nunjucks rendering | Run `npm run build:eleventy`; open `_site/species/abagrotis-apposita/index.html` (or any `high_res_available: true` species after `photos:materialize`); confirm no `<figure>` elements inside `pnwm-image-slideshow` for that species |
| `speciesPhotos.js` exposes `high_res_available` per slug | DATA-02 | Existing loader — no code change required; confirmed by reading the file | `node -e "const m = await import('./src/_data/speciesPhotos.js'); console.log(Object.keys(await m.default()).slice(0,3))"` — should list species slugs without error |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
