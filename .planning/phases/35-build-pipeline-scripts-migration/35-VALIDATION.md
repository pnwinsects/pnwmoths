---
phase: 35
slug: build-pipeline-scripts-migration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-09
---

# Phase 35 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in test runner (`node --test`, Node 24 native type-stripping) |
| **Config file** | none — files listed explicitly in `package.json` `test` script |
| **Quick run command** | `npm run typecheck` (~5s) |
| **Full suite command** | `npm test` (updated glob — converted `*.test.ts`, `migrate-species.test.js` removed) |
| **Estimated runtime** | typecheck ~5s · `npm test` ~tens of seconds · `build:data` ~4s baseline · `verify:parquet` ~0.5s |

---

## Sampling Rate

- **After every task commit:** Run `npm run typecheck`
- **After every plan wave:** Run `npm run typecheck && npm test`
- **Before `/gsd-verify-work`:** `npm run typecheck && npm test && npm run build:data && npm run verify:parquet` all green + byte-identity diff of `_site/` against the pre-migration baseline
- **Max feedback latency:** ~5 seconds (typecheck)

---

## Per-Task Verification Map

| Task area | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|-----------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| Delete dead scripts + remove `migrate:*` npm scripts; update test glob | 0 | MIG-02 | — | N/A | structural | `! ls scripts/migrate-*.js scripts/cdn-*.js scripts/upload-plates.js scripts/add-image-metadata.js scripts/test-redirect.js 2>/dev/null` | ❌ W0 | ⬜ pending |
| `verify-parquet.ts` (new) + `verify:parquet` npm script | 0 | SCHEMA-07 | — | N/A | smoke | `npm run verify:parquet` exits 0 with single summary line | ❌ W0 | ⬜ pending |
| Convert active pipeline scripts `.js`→`.ts` (strict) | 1 | MIG-02 | — | N/A | structural | `npm run typecheck` (0 errors) && `! find scripts -maxdepth 1 -name '*.js'` | ❌ W0 | ⬜ pending |
| Convert existing test files `.test.js`→`.test.ts` | 1 | MIG-02 | — | N/A | unit | `npm test` passes via `node --test` | ❌ W0 | ⬜ pending |
| SCHEMA-04 build-time column check in `build-data.ts` (DuckDB DESCRIBE, first species) | 1 | SCHEMA-04 | T-35-01 | Build fails on Parquet column-schema mismatch | integration | `npm run build:data` (fails build on injected schema mismatch) | ❌ W0 | ⬜ pending |
| SCHEMA-05 static types for build-locked JSON (`generate-species-photos.ts` output, taxon tree) | 1 | SCHEMA-05 | — | N/A | type | `npm run typecheck` | ❌ W0 | ⬜ pending |
| SCHEMA-06 confirm DuckDB typed `read_csv` is the CSV input gate (no hot-path Zod) | 1 | SCHEMA-06 | T-35-02 | Bad CSV coercion fails the build; no per-row Zod in hot path | integration | existing `build-data.test.ts` integrity tests | ✅ existing | ⬜ pending |
| `view`/`match_bucket` string-literal unions across photo-pipeline scripts | 1 | MIG-02 | — | N/A | type | `npm run typecheck` | ❌ W0 | ⬜ pending |
| Doc updates for deleted scripts (`_instructions/ADDING_PLATE.md`, `UPLOADING_TILES.md`) | 1 | MIG-02 (D-02) | — | N/A | manual/grep | `! grep -rl 'upload-plates' _instructions/` | ❌ W0 | ⬜ pending |
| Phase gate: byte-identical `_site/` + 60s `build:data` budget | 2 | all | — | N/A | integration | `time npm run build:data` < 60s; `diff -r` `_site/` vs baseline | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/verify-parquet.ts` — new standalone script (SCHEMA-07); reads `data/parquet/{slug}/records.parquet` for every species via hyparquet, validates all rows against `OccurrenceRecordSchema`, scan-all → collect → single quiet summary line → exit non-zero on any failure. **Must apply the ArrayBuffer-pool slice fix** (`raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)`) — RESEARCH Pitfall 1.
- [ ] `package.json` — add `"verify:parquet": "node scripts/verify-parquet.ts"`; update `test` script (drop `scripts/migrate-species.test.js`; converted files become `.test.ts`); update `build:data`/`photos:*`/`build:*` invocations to reference the renamed `.ts` files (Node 24 does not resolve `.ts` from a `.js` specifier — RESEARCH Pitfall 2).
- [ ] Capture a pre-migration `_site/` baseline (if not already present) for the byte-identity gate.

*Existing infrastructure (`node --test`, build-data.test.ts integrity SQL) covers SCHEMA-06 and most conversion tests.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `_site/` byte-identity vs pre-migration baseline | all (SC-5) | Requires a clean baseline build to diff against; environment-specific | Run `npm run build` on the pre-migration commit into `_site_baseline/`, then `diff -r _site/ _site_baseline/` (allowing only content-hashed asset filename differences if any — but Phase 35 is build-side, expect zero diff) |
| `ADDING_PLATE.md` operator workflow correctness after upload-plates deletion | MIG-02 (D-02) | Depends on operator knowledge of whether photographic-plate uploads are still performed | Confirm with maintainer; update Step 4 to current workflow or remove |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (`verify-parquet.ts`, package.json, baseline)
- [ ] No watch-mode flags
- [ ] Feedback latency < ~5s (typecheck)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
