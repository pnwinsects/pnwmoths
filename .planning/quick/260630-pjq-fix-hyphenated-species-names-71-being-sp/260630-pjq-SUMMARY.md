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
  tasks_completed: 2
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

## Task 2: CDN Photo Upload — COMPLETE ✓

**Status:** Done (2026-07-01). Operator supplied Bunny credentials and ran the additive upload.

The 6 legacy photos were extracted from `pnwmoths_https.tar.xz` (canonical `.../static/media/moths_bak/` copy, the earliest complete set in the archive) into `/tmp/legacy-moths-71`, then uploaded to the full-slug CDN folders via `migrate:legacy-photos` (additive/idempotent — HEAD-checks then PUTs only missing objects, never deletes originals).

Steps run:
1. Extract 6 members with `tar --fast-read --strip-components=10 -T members.txt` (real 800×533 JPEGs confirmed via `file`).
2. `DRY_RUN=1 LEGACY_PHOTOS_SRC=/tmp/legacy-moths-71 npx tsx scripts/migrate-legacy-photos.ts` → 6 matched, 0 already on CDN.
3. Operator ran the real PUT with `BUNNY_API_KEY` (in-session `!`, key kept out of assistant context).
4. Verification — all 6 URLs return **HTTP 200** under the full-slug folders:
   - `xestia-c-nigrum/Xestia c-nigrum-{A-D,A-v,B-D,B-V}.jpg` → 200
   - `autographa-v-alba/Autographa v-alba-{A-D,A-V}.jpg` → 200

Both `/species/xestia-c-nigrum/` and `/species/autographa-v-alba/` now render as single complete pages with prose, occurrence map, phenology, and photos. Issue #71 fully resolved.

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
