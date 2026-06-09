---
phase: 34
slug: scripts-lib-src-lib-migration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-09
---

# Phase 34 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node --test` (Node 24.15 native test runner + native type-stripping — runs `.ts` flag-free) |
| **Config file** | none — `package.json` `test` script globs (updated to match `*.test.ts` for converted dirs) |
| **Quick run command** | `npm run typecheck` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10–60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run typecheck` (zero `tsc --noEmit` errors) + the converted file's own `node --test` target
- **After every plan wave:** Run `npm test` (full suite — converted `.ts` + still-`.js` tests)
- **Before `/gsd-verify-work`:** Full suite green + `npm run build` byte-identical to baseline
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

> Filled by the planner. Each converted module maps to: its `node --test` target (the
> converted test must pass under type-stripping), `npm run typecheck` (zero errors, no
> `@ts-ignore`/`allowJs`/unguarded `as unknown as T`), and — for modules with `.js`
> consumers — proof the consumer's updated import specifier still resolves at runtime.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| {N}-01-01 | 01 | 1 | MIG-01 | — | N/A | unit | `node --test src/_lib/glossary-transform.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `package.json` `test` script globs updated so converted `.ts` tests run alongside remaining `.js` tests (`scripts/lib/*.test.js` → `*.test.ts`, `src/_lib/*.test.js` → `*.test.ts`) — required before any converted `.ts` test is exercised by `npm test`
- [ ] Cross-extension import specifiers in the 5 `.js` consumers (`ingest-photos.js`, `tile-photos.js`, `upload-tiles.js`, `generate-species-photos.js`, `eleventy.config.js`) updated to `.ts` atomically with each lib rename — required for the runtime-resolution and build no-regression assertions

*Phase 33's `typecheck` toolchain already exists; this phase bootstraps only the test-glob and import-specifier updates above.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `npm run build` emits 1,433 species pages, `_site/` byte-identical to baseline | MIG-01 | Full build is a slow end-of-phase smoke check (and `eleventy.config.js` imports the converted `glossary-transform.ts` at build time) | `npm run build` then count `_site/species/*/index.html` (== 1,433) and diff `_site/` against the pre-migration baseline |

*The build no-regression check is automatable as a CLI assertion and should be wired as one, not left manual.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (test-glob + import-specifier updates)
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
