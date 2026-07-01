---
gsd_state_version: 1.0
milestone: v4.0
milestone_name: Key Characters — Visual Identification
status: Awaiting next milestone
stopped_at: Phase 43 UI-SPEC approved
last_updated: "2026-06-27T20:58:29.660Z"
last_activity: 2026-06-27 — Milestone v4.0 completed and archived
progress:
  total_phases: 25
  completed_phases: 5
  total_plans: 13
  completed_plans: 13
  percent: 20
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-24 for v4.0 milestone)

**Core value:** Prove that a static build pipeline can replace a Django/CMS stack for a data-heavy natural history site — and that non-technical maintainers can keep it running.
**Current focus:** Phase 43 — Character Illustration Images

## Current Position

Phase: Milestone v4.0 complete
Plan: —
Status: Awaiting next milestone
Last activity: 2026-07-01 — Completed quick task 260630-pjq: fixed hyphenated species names split into two pages (#71); data consolidated + 6 legacy photos re-uploaded to full-slug CDN folders

## Performance Metrics

**Velocity:**

- Total plans completed: 64 (across v1.0–v1.2), 10 (v1.3), 13 (v1.4), 5 (v2.0), 5 (v2.1), 23 (v2.2), 22 (v3.0) = 129 total across all milestones
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
| v3.0 | 6 | 22 | 2026-06-10 |
| v4.0 | 5 (planned) | TBD | in flight |

**Recent Trend:**

- v3.0: shipped 2026-06-10 (6 phases, 22 plans, full JS→TS migration + data validation)
- v4.0: kicked off 2026-06-24 (5 phases planned, Identify page with key character filter)

| Phase 39 P01 | 15 minutes | 3 tasks | 10 files |
| Phase 40 P01 | 12 | 3 tasks | 4 files |
| Phase 40 P03 | 274 | 3 tasks | 4 files |
| Phase 41 P02 | 15 minutes | 2 tasks | 3 files |
| Phase 42 P01 | 3 minutes | 2 tasks | 3 files |
| Phase 42-results-grid P02 | 30m | 2 tasks | 6 files |
| Phase 43 P01 | 10 | 3 tasks | 5 files |
| Phase 43 P02 | operator-gated | 3 tasks | 5 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- v3.0 toolchain: Node 24 native type-stripping (`--strip-types`) runs `.ts` scripts and tests with no transpiler; `tsc --noEmit` is a separate CI gate only
- v3.0 toolchain: Three separate tsconfigs — `tsconfig.node.json` (nodenext), `tsconfig.browser.json` (bundler, useDefineForClassFields:false), root `tsconfig.json` (includes both)
- v3.0 schemas: Zod 4 (`zod@^4`, import from `'zod'` not `'zod/v4'`); schemas in `src/types/` importable by both Node scripts and browser components
- v4.0 artifact format: bitset JSON (per-character-state base64 `Uint8Array`, ~29 KB gzip) — NOT nested-array JSON (170 KB gzip); SUMMARY.md resolved the STACK.md vs ARCHITECTURE.md divergence in favor of bitsets
- v4.0 filter bus: `pnwm-identify` is self-contained; filter state lives in Lit reactive properties; `FilterChangeDetail` is NOT extended; `pnwm-key-filter-change` is a distinct event type scoped to parent→child communication within `pnwm-identify`
- v4.0 filter semantics: "0 = unscored, not absent" — a species is eliminated only if it scores `1` for an opposing state in the same question; raw `0`/blank NEVER excludes; this must be locked by TDD before any component is written (IDENT-04)
- v4.0 Distribution/Seasonality: all 8 categories included in the filter panel (locked product decision); UI must label Distribution/Seasonality data as "Key data (2015)" to distinguish from occurrence-record-based filters
- v4.0 character images: automated heuristic filename→character mapping rejected; `data/key-character-images.csv` is curator-maintained; ships empty (all `image_filename: null`); page is fully functional before any image coverage
- v4.0 results grid: species without nav image use gray placeholder (same pattern as v2.1 similar-species row); `<img>` only emitted for confirmed-nav-image species; never points to unconfirmed CDN paths
- v4.0 copy pattern: `scripts/copy-key-matrix.ts` runs post-eleventy (same reason as `copy-parquet.ts` — Vite wipes `_site/` during build)
- v4.0 no-JS degradation: `<noscript>` block shows character group headings as readable text + full species list as links; no pre-filtered static HTML (impractical for 237 states)
- v4.0 `build:key` runs unconditionally (reads `species-synonyms.csv` + `key-character-images.csv` + `images.csv`, all of which can change independently of `key.csv`)
- v4.0 stray-quote fix: `parseCharacterLabel` strips `/^"|"$/g` before `split(':')` — one-line fix, no signature change; eliminates 9th spurious category from key-matrix.json
- [Phase ?]: Phase 39-01: Lucid CSV parsing quirk discovered
- [Phase ?]: event-bus isolation: KeyFilterChangeDetail is fully separate from FilterChangeDetail
- [Phase ?]: build-key.ts meta emission done in Plan 01 (not 02) because KeyMatrixSchema.parse() fails without it
- [Phase ?]: verified against real matrix
- [Phase ?]: correct bitset expression locks IDENT-04 contract
- [Phase ?]: Inline only { characters, species } in #key-char-data (not familyGroups) — familyGroups duplicates species data causing 410 KB JSON; template iterates keyMatrix.familyGroups directly in noscript
- [Phase ?]: keyMatrix.ts is synchronous (no DuckDB) — data/key-matrix.json is already clean JSON from Plan 41-01; familyGroups pre-grouped in loader to avoid Nunjucks set-inside-for persistence trap
- [Phase ?]: buildCardUrl and buildCountText exported as pure helpers so Plan 42-02 can reuse them inside the component render without duplication
- [Phase ?]: _hasSelection kept as a METHOD in pnwm-identify to avoid name collision with Lit reactive props
- [Phase ?]: eleventy.config.ts requires src/_lib passthrough copy for Vite module resolution (Rule 3 auto-fix)

### Roadmap Evolution

- Phase 39 added 2026-06-24: Key Matrix Data Pipeline (v4.0)
- Phase 40 added 2026-06-24: Filter Logic TDD Contract (v4.0)
- Phase 41 added 2026-06-24: Identify Page Scaffold & Filter Panel (v4.0)
- Phase 42 added 2026-06-24: Results Grid (v4.0)
- Phase 43 added 2026-06-24: Character Illustration Images (v4.0)

### Pending Todos

- Phase 39: Verify `sharp` is in `package.json` dependencies (not just PATH-available); add if absent (needed for CIMG-01 image resize)
- Phase 39: Confirm build sequence position — `build:key` runs after `build:data` and before `build:eleventy`; `build:copy-key-matrix` runs after `build:eleventy` in the post-eleventy copy group
- Phase 40: Write concrete matrix fixture tests for the "0,0 pair passes through" invariant BEFORE writing any Lit component code
- Phase 43: Curator session needed to assess realistic effort for `data/key-character-images.csv` population — image count (~196 non-specimen images) is confirmed; filename→character mapping effort is uncertain

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
| v3.0-future | MIG-04 debt: filterRecords (parquet-cache.ts) uses inline structural type instead of importing FilterChangeDetail | Carry forward | v3.0 |
| v4.x | IDENT-07: "Characters used" removable chip strip above results | Deferred to v4.x | v4.0 |
| v4.x | IDENT-08: URL query-param state persistence for shareable identification sessions | Deferred to v4.x | v4.0 |
| v4.x | IDENT-09: Ecoregion-to-state dependency hint | Deferred to v4.x | v4.0 |
| v4.x | SIZE-01: Approximate/precise size question coupling | Deferred to v4.x | v4.0 |

## Quick Tasks Completed

| Quick ID | Description | Date | Status |
|----------|-------------|------|--------|
| 260609-e2b | Factor occurrence popup into its own Lit component (`pnwm-occurrence-popup`) — closes #22 | 2026-06-09 | complete ✓ |
| 260627-kdt | Data-driven family-withholding gate (`data/withheld-families.csv`) — holds Geometridae from pages/Browse/Identify/search + build-time leak gate; release = delete one line — #48 | 2026-06-27 | complete ✓ |
| 260627-oe1 | Home-page static target-range SVG map (generated from shared `PNW_REGION_RING`) + build-time species/record/image stats (`stats.ts`, gate-aware) | 2026-06-27 | complete ✓ |
| 260628-jtl | Switch production to custom domain (moths.pnwinsects.org) via Bunny; demote GitHub Pages to manual staging — additive Storage upload, image CDN host moved to custom domain, split deploy into `production.yml`/`staging.yml` | 2026-06-28 | complete ✓ |
| 260629-geq | Exclude larvae/reared specimens from phenology graphs — `REARED_TERMS` + `isRearedRecord` keyword scan on `notes` only, applied in `aggregateByMonth` (map/popup untouched) — closes #59 | 2026-06-29 | complete ✓ |
| 260630-pjq | Fix hyphenated species split into two pages (#71) — root cause was duplicate hyphen-truncated migration rows in `species.csv`; consolidated `Xestia c`→`Xestia c-nigrum` and `Autographa v`→`Autographa v-alba` by deleting truncated rows, re-keying 510 records + 6 images, repointing similar_species link, pruning redirect allow-list; 6 legacy photos additively re-uploaded to full-slug CDN folders (all 200) | 2026-07-01 | complete ✓ |

## Session Continuity

Last session: 2026-06-26T00:03:37.574Z
Stopped at: Phase 43 UI-SPEC approved
Resume file: .planning/phases/43-character-illustration-images/43-UI-SPEC.md

## Operator Next Steps

- Start the next milestone with /gsd-new-milestone
