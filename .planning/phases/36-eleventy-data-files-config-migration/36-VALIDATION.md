---
phase: 36
slug: eleventy-data-files-config-migration
status: draft
nyquist_compliant: false
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
| 36-XX | tooling | 1 | MIG-03 | — | N/A | typecheck | `npm run typecheck` | ✅ existing | ⬜ pending |
| 36-XX | config | — | MIG-03 | — | GITHUB_PAGES conditional preserved | unit | `node --test eleventy.config.test.ts` | ❌ W0 (rename .js→.ts) | ⬜ pending |
| 36-XX | data files | — | MIG-03 | — | `.ts` data files load via `addDataExtension` | integration | `npm run build:eleventy` | ✅ build gate | ⬜ pending |
| 36-XX | cleanup | — | MIG-03 | — | no `.js` source remains | lint/grep | `find src/_data -name '*.js' \| head -1` empty + no `eleventy.config.js` | ✅ existing | ⬜ pending |
| 36-XX | gate | final | MIG-03 | — | byte-identical `_site/` | integration | `diff -r _site/ _site_baseline/` empty | ✅ baseline present | ⬜ pending |

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

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s (unit)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
