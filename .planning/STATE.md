---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: TypeScript Frontend & Build-Time Data Validation
status: executing
stopped_at: Phase 37 context gathered
last_updated: "2026-06-10T18:58:36.217Z"
last_activity: 2026-06-10
progress:
  total_phases: 20
  completed_phases: 4
  total_plans: 19
  completed_plans: 16
  percent: 20
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-09 after v3.0 milestone started)

**Core value:** Prove that a static build pipeline can replace a Django/CMS stack for a data-heavy natural history site — and that non-technical maintainers can keep it running.
**Current focus:** Phase 37 — lit-web-components-migration

## Current Position

Phase: 37 (lit-web-components-migration) — EXECUTING
Plan: 3 of 5
Status: Ready to execute
Last activity: 2026-06-10

```
v3.0 Progress: [··········] 0/6 phases (0%)
```

## Performance Metrics

**Velocity:**

- Total plans completed: 43 (across v1.0–v1.2), 10 (v1.3), 13 (v1.4), 5 (v2.0), 5 (v2.1), 23 (v2.2) = 85 total across all milestones
- Average duration: unknown
- Total execution time: unknown

**By Milestone:**

| Milestone | Phases | Plans | Shipped |
|-----------|--------|-------|---------|
| v1.0–v1.2 | 7 | 15 | 2026-04-18 |
| v1.3 | 5 | 10 | 2026-04-20 |
| v1.4 | 5 | 13 | 2026-04-22 |
| v2.0 | 3 | 5 | 2026-04-23 |
| v2.1 | 4 | 5 | 2026-05-20 |
| v2.2 | 7 | 23 | 2026-05-24 |
| v3.0 | 6 (planned) | TBD | in flight |

**Recent Trend:**

- v2.2: shipped 2026-05-24 (7 phases, 23 plans, 159 commits, 4 days)
- v3.0: kicked off 2026-06-09 (6 phases planned, full JS→TS migration + data validation)

*Updated after each plan completion*
| Phase 35 P04 | 797 | 3 tasks | 17 files |
| Phase 35 P05 | 45 | 3 tasks | 1 files |
| Phase 36 P01 | 585 | 3 tasks | 7 files |
| Phase 36 P02 | 833 | 3 tasks | 6 files |
| Phase 36 P03 | 365 | 2 tasks | 7 files |
| Phase 37 P02 | 420 | 3 tasks | 5 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- v3.0 toolchain: Node 24 native type-stripping (`--strip-types`) runs `.ts` scripts and tests with no transpiler; `tsc --noEmit` is a separate CI gate only
- v3.0 toolchain: Three separate tsconfigs — `tsconfig.node.json` (nodenext), `tsconfig.browser.json` (bundler, useDefineForClassFields:false), root `tsconfig.json` (includes both); NOT project references
- v3.0 toolchain: `tsc --noEmit` kept OUT of `npm run build` hot path; CI gate only (per SUMMARY.md cross-doc resolution)
- v3.0 schemas: Zod 4 (`zod@^4`, import from `'zod'` not `'zod/v4'`); schemas in `src/types/` importable by both Node scripts and browser components
- v3.0 schemas: Profile null distribution per column BEFORE writing any schema (Pitfall 2 — over-strict schema hard-blocks 85,933-record build)
- v3.0 migration order: A(schema) → B(scripts/lib) → C(src/_lib) → D(scripts/) → E(src/_data+config) → F(src/components/) — producer before consumer
- v3.0 client bundle: Zod absent from production client bundle; DEV-gated or minimal type guards only in parquet-cache.ts
- v3.0 Lit: `useDefineForClassFields: false` MUST be set in browser tsconfig BEFORE any Lit component is touched (Pitfall 1)
- v3.0 tests: All test files migrate to `.ts`; run via `node --test` with no extra flags (Node 24 strips types natively); MIG-05 success criterion = full ~191-test suite green
- v3.0 CI-02: byte-identical `_site/` diff guard after each migration area (diff -r _site_before/ _site_after/)
- Phase 29 fix: Dropbox shared_link API does not return path_display — use '/' + entry.name as fallback; manifest backfilled
- Phase 30 Plan 01: DRY_RUN guard before BUNNY_API_KEY guard — enables dry-run inspection without a real API key
- Phase 30 Plan 01: advanceStatus(row, 'uploaded') before rm/unlink — status committed before deletion (D-03 ordering)
- Phase 33 Plan 01: `allowImportingTsExtensions:true` (not `rewriteRelativeImportExtensions`) in tsconfig.node.json — semantically correct for Node 24 type-stripping + noEmit workflow
- Phase 33 Plan 01: typecheck script invokes each sub-config explicitly (no tsc --build/composite) — tsc does not follow references in plain --noEmit mode
- Phase 33 Plan 01: zod kept in dependencies (not devDeps) — consumed by build scripts at build time
- Phase 33 Plan 02: z.nullable() (not z.optional()) for all profiled-null columns — hyparquet writes null not undefined; county 100% null would reject all records
- Phase 33 Plan 02: allowImportingTsExtensions:true added to tsconfig.browser.json — required for .ts extension imports in src/types/ under the browser config
- Phase 33 Plan 02: types:[node] added to tsconfig.node.json — TypeScript 6 strict NodeNext does not auto-include @types/node globals without explicit types field
- Phase 34 Plan 01: _site_baseline/ gitignored (not committed) — working-tree snapshot for SC-4 byte-identity gate; 1,433 species pages
- Phase 34 Plan 01: package.json test globs broadened to `*.test.{js,ts}` for scripts/lib and src/_lib; Node 24 brace expansion; 224/224 tests pass
- Phase 34 Plan 02: ManifestRow = Record<typeof COLUMNS[number], string> — mapped type over 13-key union; row.status is string (not string|undefined) even under noUncheckedIndexedAccess
- Phase 34 Plan 02: ManifestStatus union uses exactly 5 values; no enum (TS-03 prohibition)
- Phase 34 Plan 02: dbxCall return typed as Promise<unknown>; callers narrow via isDropboxListPage guard (D-01/D-03; Open Question 2)
- Phase 34 Plan 02: [...COLUMNS] spread in writeManifest avoids as-cast to satisfy csv-stringify string[] type (Pitfall 2)
- Phase 34 Plan 02: DropboxError = new Error(...) as DropboxError pattern; single widening cast of own-constructed value — not unguarded double-cast (T-34-02)
- Phase 34 Plan 03: Vite content-hash filename changes between builds are non-deterministic (sourceMappingURL self-reference); byte-identity gate assesses HTML prose content, not asset filenames
- Phase 34 Plan 03: noUncheckedIndexedAccess in test files fixed via destructuring (const [first, second] = buildTermMap(...)) rather than bare index access

### Roadmap Evolution

- Phase 19 added: Build-time Glossary Transform (v2.0)
- Phase 20 added: Popover UI — HTML and CSS (v2.0)
- Phase 21 added: JS Hover Enhancement and Glossary Images (v2.0)
- Phase 22 added: Phenology Chart Improvements (v2.1)
- Phase 23 added: Photo Thumbnail Carousel (v2.1)
- Phase 24 added: County, Collection, and Elevation Filters (v2.1)
- Phase 25 added: Similar Species Thumbnails (v2.1)
- Phase 26 added: Dropbox Ingest, Filename Parser, and Manifest (v2.2)
- Phase 27 added: Synonym Curation Pass (v2.2)
- Phase 28 inserted 2026-05-22: End-to-End Vertical-Slice Pilot — One Species (v2.2)
- Phase 29 added: DZI Tile Generation Pipeline, bulk (v2.2) — renumbered from 28
- Phase 30 added: bunny.net Upload of Tile Pyramids, bulk (v2.2) — renumbered from 29
- Phase 31 added: data/species-photos.json Build Integration (v2.2) — renumbered from 30
- Phase 32 added: OpenSeadragon Viewer in Lightbox, generalize pilot (v2.2) — renumbered from 31
- **Phase 33 added 2026-06-09: Toolchain & Schema Scaffolding (v3.0)**
- **Phase 34 added 2026-06-09: scripts/lib & src/_lib Migration (v3.0)**
- **Phase 35 added 2026-06-09: Build Pipeline Scripts Migration (v3.0)**
- **Phase 36 added 2026-06-09: Eleventy Data Files & Config Migration (v3.0)**
- **Phase 37 added 2026-06-09: Lit Web Components Migration (v3.0)**
- **Phase 38 added 2026-06-09: CI Gate & Full Verification (v3.0)**

### Pending Todos

- Phase 33: Run null-distribution data profile (`COUNT(*) FILTER (WHERE col IS NULL)` per column) against full 85,933 records BEFORE writing any Zod schema — this is the mandatory SCHEMA-03 spike (Pitfall 2)
- Phase 33: Resolve tsconfig `allowImportingTsExtensions` vs `rewriteRelativeImportExtensions` flag choice (SUMMARY.md research flag — verify in Phase 33 spike)
- Phase 33: Verify `execFile("node", ["...ts"])` child-process type-stripping behavior (SUMMARY.md research flag)
- Phase 35: Benchmark `time npm run build:data` after adding Zod validation gates; must stay under 60s (CI-03)
- Phase 37: grep production bundle for `ZodError`/`ZodType` to confirm tree-shaking (SUMMARY.md research flag)

### Blockers/Concerns

None.

## Deferred Items

Items acknowledged and carried forward:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Tech debt | MAINT-03: build time under 5 min unverified | Addressed in v3.0 CI-03 (build:data <60s budget) | v1.2 |
| Tech debt | No automated visual regression tests | Carry forward | v1.2 |
| Tech debt | WR-01 (migrate-species): similar_species links silently dropped for record-only species | Carry forward | v1.4 |
| Tech debt | WR-02 (migrate-species): safeSpecies sanitization logic duplicated in two loops | Carry forward | v1.4 |
| CDN | GitHub LFS storage quota reclaim | Accept billing; out of scope | v1.4 |
| CDN | WebP not yet active on bunny.net Optimizer (serving JPEG) | Deferred | v1.4 |
| v2.2 | `*custom` Dropbox sub-folder | Deferred until contents understood | v2.2 |
| v2.2 | External taxonomic API (GBIF/ITIS) synonym auto-resolution | Manual species-synonyms.csv sufficient for now | v2.2 |
| v3.0-future | TSF-01: Lit TC39 decorator adoption (`accessor` keyword) | Deferred post-migration | v3.0 |
| v3.0-future | TSF-02: TypeScript 6.0 upgrade | Deferred until migration settled | v3.0 |
| v3.0-future | TSF-03: Vitest evaluation | Deferred; keep node --test for now | v3.0 |
| v3.0-future | filterRecords null-coercion behavior fix | Document with TODO(v3.1); do not fix during type migration | v3.0 |

## Quick Tasks Completed

| Quick ID | Description | Date | Status |
|----------|-------------|------|--------|
| 260609-e2b | Factor occurrence popup into its own Lit component (`pnwm-occurrence-popup`) — closes #22 | 2026-06-09 | complete ✓ |

## Session Continuity

Last session: 2026-06-10T18:58:36.207Z
Stopped at: Phase 37 context gathered
Resume file: None
