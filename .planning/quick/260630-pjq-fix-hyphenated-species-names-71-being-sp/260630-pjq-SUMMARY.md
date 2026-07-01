---
phase: quick-260630-pjq
plan: 01
subsystem: data
tags: [data-fix, species, slugs, records, images]
dependency_graph:
  requires: []
  provides: [clean-species-slugs-for-xestia-c-nigrum, clean-species-slugs-for-autographa-v-alba]
  affects: [data/species.csv, data/records.csv, data/images.csv, src/_data/speciesSlugs.json]
tech_stack:
  added: []
  patterns: [anchored-sed-re-key, orphaned-records-gate]
key_files:
  created: []
  modified:
    - data/species.csv
    - data/records.csv
    - data/images.csv
    - src/_data/speciesSlugs.json
decisions:
  - "Full slug (xestia-c-nigrum, autographa-v-alba) is canonical; truncated rows (ids 2676, 1551) were migration artifacts"
  - "sed substitutions anchored to ^slug, to prevent touching slugs like xestia-cinerascens"
metrics:
  duration_minutes: 10
  completed_date: "2026-06-30"
  tasks_completed: 1
  tasks_total: 2
  files_changed: 4
---

# Quick Task 260630-pjq: Fix Hyphenated Species Names (#71) Summary

**One-liner:** Deleted two hyphen-truncated duplicate rows from species.csv and re-keyed 510 occurrence records + 6 image rows to the canonical full-slug counterparts (xestia-c-nigrum, autographa-v-alba), so each species now renders as exactly one complete page.

## What Was Done

Task 1 — the four coordinated data edits — executed and committed atomically as `105efe02`.

### Changes Made

| File | Change |
|------|--------|
| `data/species.csv` | Deleted row id 2676 (`Xestia,c`) and row id 1551 (`Autographa,v`); repointed `similar_species` on Autographa speciosa from `autographa-v` to `autographa-v-alba` |
| `data/records.csv` | Re-keyed 458 `^xestia-c,` rows and 52 `^autographa-v,` rows to their full slugs |
| `data/images.csv` | Re-keyed 4 `^xestia-c,` rows and 2 `^autographa-v,` rows to their full slugs |
| `src/_data/speciesSlugs.json` | Removed `"xestia-c"` and `"autographa-v"` from the redirect allow-list |

### Verification Results

All assertions in the plan's `<verify>` block passed:

- Zero truncated-slug rows remain in records.csv and images.csv
- `npm run build:data` exited 0 (orphaned-records gate passed, all 510 records now map to surviving species rows)
- `data/parquet/xestia-c-nigrum/` and `data/parquet/autographa-v-alba/` exist; `xestia-c/` and `autographa-v/` are absent
- `npm run build:eleventy` produced no `/species/xestia-c/` or `/species/autographa-v/` pages
- Both full-name pages contain `class="species-prose"` and `pnwm-occurrence-map` bound to their own full slug
- Output: **ALL PAGE + DATA ASSERTIONS PASS**

## Deviations from Plan

None — plan executed exactly as written. All sed substitutions were anchored correctly and touched only the intended rows.

## Commits

| Task | Commit | Files |
|------|--------|-------|
| Task 1: Consolidate split species onto canonical slugs | `105efe02` | data/species.csv, data/records.csv, data/images.csv, src/_data/speciesSlugs.json |

## Task 2: Awaiting Human Operator (CDN Photo Upload)

**Status:** Not started — gate requires Bunny storage credentials.

The 6 legacy photos are re-keyed in `data/images.csv` but the CDN objects currently exist only under the old folders (`xestia-c/`, `autographa-v/`). Without an additive re-upload, the fixed pages would show broken images. See Task 2 in the PLAN.md for exact steps:

1. Preview: `DRY_RUN=1 LEGACY_PHOTOS_SRC=<media dir> npm run migrate:legacy-photos`
2. Upload: `BUNNY_API_KEY=<password> LEGACY_PHOTOS_SRC=<same dir> npm run migrate:legacy-photos`
3. Verify all 6 URLs return HTTP 200 under the new full-slug CDN folders

Resume signal: type "approved" once the 6 URLs return 200.

## Known Stubs

None.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. All edits are data-only (CSV/JSON). Threat mitigations T-71-01 and T-71-02 confirmed applied.

## Self-Check

- `data/species.csv` modified: confirmed (ids 2676 and 1551 absent, similar_species repointed)
- `data/records.csv` modified: 458 + 52 rows re-keyed, confirmed by verify grep counts
- `data/images.csv` modified: 4 + 2 rows re-keyed, confirmed by verify grep counts
- `src/_data/speciesSlugs.json` modified: confirmed (truncated entries absent)
- Commit `105efe02` exists: confirmed

## Self-Check: PASSED
