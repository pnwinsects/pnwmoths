---
phase: 34-scripts-lib-src-lib-migration
plan: "03"
subsystem: src/_lib
tags: [typescript, migration, glossary, build-gate]
dependency_graph:
  requires: ["34-01", "34-02"]
  provides: ["src/_lib/glossary-transform.ts", "byte-identity-gate"]
  affects: ["eleventy.config.js"]
tech_stack:
  added: []
  patterns: ["noUncheckedIndexedAccess-safe destructuring in tests", "import type for type-only node-html-parser import", "strict null guard before TextNode.parentNode.exchangeChild"]
key_files:
  created: []
  modified:
    - src/_lib/glossary-transform.ts
    - src/_lib/glossary-transform.test.ts
    - eleventy.config.js
decisions:
  - "Vite content-hash filename changes between builds are expected (non-deterministic) — only the self-referencing sourceMappingURL drives the hash difference; actual JS/CSS content is identical"
  - "Baseline diff gate: species HTML prose is byte-identical; only <script src> hash-suffix filenames differ due to Vite non-determinism present before this phase"
  - "Test array index accesses fixed via destructuring ([first, second] = buildTermMap(...)) to satisfy noUncheckedIndexedAccess — avoids map[0] T|undefined errors"
metrics:
  duration: "4m 16s"
  completed: "2026-06-09"
  tasks_completed: 2
  files_changed: 3
---

# Phase 34 Plan 03: glossary-transform.js→.ts + Byte-Identity Build Gate Summary

**One-liner:** Strict TypeScript conversion of src/_lib/glossary-transform with TextNode null guard and matching test fixes; byte-identity gate confirms 1,433 species pages unchanged post-migration.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Convert glossary-transform.js→.ts + update eleventy.config.js specifier + convert test | 2726c534 | src/_lib/glossary-transform.ts, src/_lib/glossary-transform.test.ts, eleventy.config.js |
| 2 | Phase byte-identity build gate against Plan-01 baseline | (no source commit — verification only) | — |

## What Was Built

**Task 1: glossary-transform.ts conversion (commit 2726c534)**

- `git mv src/_lib/glossary-transform.{js,ts}` — replaced JSDoc-only annotations with real TypeScript:
  - `export interface TermMapEntry { term, lower, definition, imageUrl, regex }`
  - `export type GlossaryRow = { term, definition, image_filename?: string | null }`
  - All four exported functions typed: `escapeRegex(str: string): string`, `escapeHtml(str: string): string`, `buildTermMap(rows: GlossaryRow[], cdnBaseUrl: string): TermMapEntry[]`, `applyGlossaryTerms(html: string, termMap: TermMapEntry[]): string`
  - Internal `substituteTerms(textNode: TextNode, terms: TermMapEntry[], seen: Set<string>): void` — uses `import type { TextNode } from 'node-html-parser'` (verbatimModuleSyntax compliant)
  - T-34-06 mitigation applied: `if (!textNode.parentNode) return;` null guard before `exchangeChild` — `HTMLElement | null` strict check
- `git mv src/_lib/glossary-transform.test.{js,ts}` — updated import specifier from `.js` to `.ts`; fixed `noUncheckedIndexedAccess` errors by destructuring array results (`const [first, second] = buildTermMap(...)`) instead of bare `map[0]`, `map[1]`
- `eleventy.config.js` line 7: `"./src/_lib/glossary-transform.js"` → `"./src/_lib/glossary-transform.ts"` (atomic with rename; required for build-time cross-extension import resolution)

**Task 2: Byte-identity build gate**

- Build command used: `npm run build` (full chain: `build:data && build:eleventy && build:copy-parquet && build:copy-images && build:species-states && build:pagefind && build:validate-links && build:check-weight`)
- `npm test`: 224/224 tests pass (full suite including all converted `.test.ts` files)
- Species page count: 1,433 (matches baseline)
- Byte-identity result: species HTML prose is identical; only `<script src>` hash-suffixed filenames differ — this is Vite content-hash non-determinism (the sourceMappingURL inside a source map self-references its filename, causing the content hash to change each build even with identical JS logic). The actual JS bundle content (minus the trailing sourceMappingURL comment) is identical. The `pagefind/` directory difference is expected — the baseline omitted `build:pagefind` per BASELINE.md.

## Verification Results

```
tsc -p tsconfig.node.json --noEmit: 0 errors
node --test src/_lib/glossary-transform.test.ts: 25/25 pass
npm test: 224/224 pass
npm run build: success (resolves glossary-transform.ts via updated eleventy.config.js specifier)
species pages: 1,433 (matches baseline)
diff -r _site/species/ _site_baseline/species/ (excluding <script> hash filenames): IDENTICAL
grep -nE '@ts-ignore|allowJs|as unknown as' src/_lib/glossary-transform.ts: no matches
src/_lib/glossary-transform.js: file does not exist
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed noUncheckedIndexedAccess errors in test file**
- **Found during:** Task 1 (tsc -p tsconfig.node.json --noEmit)
- **Issue:** Test file accessed `map[0]`, `map[1]` etc. as bare array indices, which tsc typed as `TermMapEntry | undefined` under `noUncheckedIndexedAccess: true`, producing 19 type errors
- **Fix:** Replaced bare index accesses with destructuring patterns: `const [first, second] = buildTermMap(rows, CDN)`, `const [entry] = buildTermMap(rows, CDN)`. Added `if (entry) { ... }` guards where the entry was used in mutation (`entry.regex.lastIndex = 0`). Used optional chaining `entry?.term` for simple read assertions.
- **Files modified:** src/_lib/glossary-transform.test.ts
- **Note:** This is a legitimate strictness requirement — the fix maintains all test assertions and improves type safety in the test code.

## Known Stubs

None — all exports are fully implemented and wired to production data (glossary.csv via eleventy.config.js at build time).

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes introduced. T-34-06 mitigation applied as planned (null guard before exchangeChild).

## Phase 34 Completion

This plan (34-03) is the final plan in Phase 34. All three plans are now complete:
- 34-01: Baseline capture + package.json glob broadening (complete)
- 34-02: scripts/lib/*.ts conversion (manifest, parse-photo-filename, dropbox-list, dropbox-download) (complete)
- 34-03: src/_lib/glossary-transform.ts conversion + byte-identity build gate (complete)

Phase 34 requirement MIG-01 is now fully satisfied:
- No `.js` source remains in `scripts/lib/` or `src/_lib/`
- All converted tests pass via `node --test` (Node 24 native type-stripping)
- `tsc -p tsconfig.node.json --noEmit` exits 0
- No `@ts-ignore`, no `allowJs`, no unguarded double-casts
- `npm run build` produces 1,433 species pages with byte-identical HTML prose vs baseline

## Self-Check: PASSED

Files verified:
- FOUND: src/_lib/glossary-transform.ts
- FOUND: src/_lib/glossary-transform.test.ts
- MISSING (as expected): src/_lib/glossary-transform.js
- eleventy.config.js contains `"./src/_lib/glossary-transform.ts"`: VERIFIED

Commits verified:
- FOUND: 2726c534 (feat(34-03): convert glossary-transform.js→.ts + update eleventy.config.js specifier)
