---
phase: 36
slug: eleventy-data-files-config-migration
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-09
---

# Phase 36 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` (Node 24 built-in, native type-stripping) |
| **Config file** | none — bare `node --test` invocation via `npm test` glob |
| **Quick run command** | `node --test eleventy.config.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~8 seconds (217 tests) |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm run typecheck && npm test`
- **Before `/gsd-verify-work`:** `npm run typecheck && npm test && npm run build:eleventy && diff -r _site/ _site_baseline/` must all be green / empty diff
- **Max feedback latency:** ~8 seconds (unit); ~minutes for full build gate

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 36-01-T1 | 01 config keystone | 1 | MIG-03 | T-36-01/02 | GITHUB_PAGES conditional preserved; `.ts` config loads via `--config`; addDataExtension registered; execFile repointed | typecheck/grep | `npm run typecheck` + grep gates | ✅ existing | ⬜ pending |
| 36-01-T2 | 01 config keystone | 1 | MIG-03 | — | GITHUB_PAGES conditional test-asserted; tsconfig include + test glob fixed | unit | `node --test eleventy.config.test.ts` | ❌ W0 (rename .js→.ts) | ⬜ pending |
| 36-01-T3 | 01 config keystone | 1 | MIG-03 | — | `.ts` config builds byte-identically (`.js` data files still loaded) | integration | `npm run build:eleventy` + `diff -r _site/ _site_baseline/` | ✅ baseline present | ⬜ pending |
| 36-02-T1..T3 | 02 DuckDB data files | 2 | MIG-03 | T-36-04/05 | species/glossary/taxon narrowed via D-03 guard; taxon.d.ts deleted | typecheck/integration | `npm run typecheck` + build+diff | ❌ W2 (rename .js→.ts) | ⬜ pending |
| 36-03-T1..T2 | 03 file-I/O data files | 2 | MIG-03 | T-36-06/07 | images/plates/speciesPhotos typed emitted-shape; soft-fail preserved | typecheck/integration | `npm run typecheck` + build+diff | ❌ W2 (rename .js→.ts) | ⬜ pending |
| 36-04-T1 | 04 phase gate | 3 | MIG-03 | — | no `.js` source; no @ts-ignore/allowJs/double-cast; byte-identical `_site/` | lint/integration | `find src/_data -name '*.js'` empty + `npm test` + `npm run build` + `diff -r _site/ _site_baseline/` | ✅ baseline present | ⬜ pending |
| 36-04-T2 | 04 phase gate | 3 | MIG-03 | T-36-08 | local-dev `/` pathPrefix, no double-prefix | manual (human-verify) | `npm run dev` browser check (Manual-Only) | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Note: exact Task IDs assigned by the planner; rows above map each ROADMAP success criterion to its automated gate.*

---

## Wave 0 Requirements

- [ ] `eleventy.config.test.ts` — rename from `.js`, update any `.js` source-string the test reads to `.ts`, add D-01 pathPrefix conditional assertion
- [ ] `tsconfig.node.json` — add `"eleventy.config.test.ts"` to `include` (root-level test file not covered by existing globs; `eleventy.config.ts` + `src/_data/**/*.ts` already covered per research)
- [ ] `package.json` `test` glob — `eleventy.config.test.js` → `eleventy.config.test.ts`
- [ ] `package.json` `build:eleventy` + `dev` — add `--config=eleventy.config.ts` (Eleventy v3 does not auto-discover `.ts` config)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `npm run dev` serves with local `/` pathPrefix; assets not double-prefixed | MIG-03 (SC-3) | Dev server is long-running; not asserted by `node --test` | Run `npm run dev`, load a species page, confirm asset URLs resolve under `/` (not `/pnwmoths/`) |

*Runtime `/pnwmoths/` correctness (SC-3, GitHub Pages branch) is covered automatically by the byte-identical build gate, which exercises `GITHUB_PAGES=1`.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (Task 36-04-T2 is the single documented manual-only dev-server check; all others have `<automated>`)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (config test rename, tsconfig include, test glob, --config flags — all in Plan 01)
- [x] No watch-mode flags
- [x] Feedback latency < 10s (unit)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planner-approved 2026-06-10 (wave_0_complete flips true on Plan 01 execution)
