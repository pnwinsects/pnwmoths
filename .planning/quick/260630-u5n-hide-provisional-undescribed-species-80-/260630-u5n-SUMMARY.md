---
phase: quick-260630-u5n
plan: 01
subsystem: data-pipeline
tags: [deny-list, provisional-species, build-gate, issue-80]
dependency_graph:
  requires: []
  provides: [unpublished-species-gate]
  affects: [species-pages, browse-tree, key-matrix, site-stats]
tech_stack:
  added: []
  patterns: [csv-deny-list, normalizing-predicate, post-build-gate]
key_files:
  created:
    - data/unpublished-species.csv
    - src/_lib/unpublished-species.ts
    - src/_lib/unpublished-species.test.ts
    - scripts/check-unpublished.ts
    - scripts/check-unpublished.test.ts
  modified:
    - src/_data/species.ts
    - src/_data/taxon.ts
    - src/_data/stats.ts
    - scripts/build-key.ts
    - src/_data/species.test.ts
    - package.json
    - data/key-matrix.json
    - data/key-coverage-report.json
decisions:
  - normalizeSlug is the single source of truth for space→hyphen reconciliation (raw slugs vs. deny-list entries)
  - stats.ts SQL uses DuckDB replace() with single-space→hyphen (data has only single spaces — verified); isUnpublished uses /\s+/g for defense-in-depth
  - T-80-01: unpublished list values are single-quote-escaped before SQL interpolation, matching existing withheldList pattern
  - T-80-02: check-unpublished well-formedness gate fails the build if any deny-list slug matches 0 or >1 species.csv row
metrics:
  duration: ~25 minutes
  completed: "2026-07-01T05:08:40Z"
  tasks: 3
  files: 13
---

# Quick Task 260630-u5n: Hide Provisional/Undescribed Species (ISSUE-80) Summary

**One-liner:** Data-driven build-time deny-list (`data/unpublished-species.csv`) excludes 20 provisional morphospecies from species pages, Browse tree, Pagefind search index, and key-matrix.json, with a post-build leak gate mirroring the family-withholding pattern.

## What Was Built

Three atomic tasks:

**Task 1 — Deny-list CSV + shared loader/predicate (TDD)**
- `data/unpublished-species.csv`: two-column CSV (`slug,reason`) with header + 20 provisional slug rows
- `src/_lib/unpublished-species.ts`: exports `normalizeSlug` (trim/lowercase/`\s+`→`-`), `loadUnpublishedSpecies` (existsSync guard, columns:true parse, returns Set), `isUnpublished` (normalizes before Set lookup — callers pass either raw-space or hyphenated form)
- `src/_lib/unpublished-species.test.ts`: 13 unit tests (all green)

**Task 2 — Wire the four choke points (TDD)**
- `src/_data/species.ts`: `isUnpublished(row.slug, unpublished)` guard after `isWithheldOrUnclassified`
- `src/_data/taxon.ts`: same pattern for Browse tree row filter
- `scripts/build-key.ts`: extends `speciesRows` filter so unpublished slugs never enter `siteSlugSet`
- `src/_data/stats.ts`: SQL shown-CTE adds `replace(lower(genus||'-'||species), ' ', '-') NOT IN (${unpublishedList})` (T-80-01: values single-quote-escaped)
- `src/_data/species.test.ts`: two new tests — 0 deny-listed slugs emitted; `drasteria-parallela` and `aseptis-binotata` still present (genus not over-filtered)

**Task 3 — Post-build leak gate**
- `scripts/check-unpublished.ts`: pure `findUnpublishedLeaks(opts)` helper + CLI main() with well-formedness assertion (T-80-02), page gate (decodeURIComponent + normalize), and key-matrix gate; exits 1 on any leak
- `scripts/check-unpublished.test.ts`: 5 unit tests for the pure helper
- `package.json`: `build:check-unpublished` script added; inserted in build chain after `build:check-withheld`; added to explicit test file list

## Verification Results

- `npm test`: 511/511 pass (includes 18 new tests from this task)
- `npm run typecheck`: green (both tsconfig.browser.json and tsconfig.node.json)
- `node scripts/check-unpublished.ts`: PASS — 20 deny-list slugs checked, 0 page leaks, 0 key-matrix leaks
- `data/records.csv`: 34 rows for the 20 slugs — unchanged
- `data/images.csv`: 19 rows for the 20 slugs — unchanged
- `data/parquet/<slug>/`: directories untouched (plan modifies none of records.csv, images.csv, build-data.ts, or parquet/)
- `data/key-matrix.json`: 1191 matched species — none of the 20 are present (confirmed 0 leaks; matches HEAD baseline; only timestamp changed)

## Commits

| Hash | Task | Message |
|------|------|---------|
| `e6bc29f7` | Task 1 | `feat(data): add unpublished-species deny-list + loader (#80)` |
| `e39dd25c` | Task 2 | `feat(build): exclude unpublished species from pages/browse/search/identify (#80)` |
| `7f98e550` | Task 3 | `feat(build): add check-unpublished leak gate + wire into build (#80)` |

## Deviations from Plan

None — plan executed exactly as written. All grounding facts were confirmed accurate:
- The slug-normalization approach (spaces→hyphens) works as specified
- None of the 20 provisional species appear in the Lucid key source (key-matrix.json species count 1191 was already the baseline)
- `similar_species` cross-refs for denied species self-heal (no extra code needed)

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. The SQL injection threat (T-80-01) is mitigated by single-quote escaping, matching the existing `withheldList` pattern in `stats.ts`.

## Self-Check: PASSED

All created files found on disk. All 3 task commits verified in git history.
