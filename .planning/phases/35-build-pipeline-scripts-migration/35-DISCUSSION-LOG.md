# Phase 35: Build Pipeline Scripts Migration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-09
**Phase:** 35-build-pipeline-scripts-migration
**Areas discussed:** One-off script disposition, verify:parquet design, Build-time Parquet check, view/match_bucket unions

---

## One-off script disposition

### Policy

| Option | Description | Selected |
|--------|-------------|----------|
| Delete dead, convert active | Delete the truly-spent one-offs (output already committed), convert only active pipeline. Leanest; git history preserves them. | ✓ |
| Archive dead, convert active | Move spent one-offs to scripts/archive/ excluded from tsconfig; convert only active. | |
| Convert everything | Honor ROADMAP criterion 1 literally — every .js becomes strict TS incl. dead one-offs. | |

**User's choice:** Delete dead, convert active.

### Which scripts are dead (multiSelect)

| Option | Description | Selected |
|--------|-------------|----------|
| migrate-species(+test) & migrate-images | One-time legacy MySQL/Django → data/*.csv imports; still wired as migrate:* npm scripts. | ✓ |
| migrate-species-accounts | One-time Django CMS → src/content/species/*.md extraction. | ✓ |
| cdn-copy-reclassified & cdn-fix-bad-slugs | One-time bunny.net CDN slug-fix copies. | ✓ |
| upload-plates, add-image-metadata, test-redirect | One-time Zoomify upload / MySQL→images.csv merge / ad-hoc redirect check. | ✓ |

**User's choice:** "drop all" — delete all eight + migrate-species.test.js; remove migrate:images / migrate:species npm scripts.
**Notes:** Active pipeline (build-data, copy-parquet, copy-images, emit-species-states, check-page-weight, ingest-photos, tile-photos, upload-tiles, generate-species-photos + their tests) is always converted.

---

## verify:parquet design

### Failure handling

| Option | Description | Selected |
|--------|-------------|----------|
| Scan all, summarize | Validate every row, collect all failures, print summary, exit non-zero. | ✓ |
| Fail fast | Stop at first invalid row. | |
| Scan all, cap output | Scan all but cap report to first N per species + totals. | |

**User's choice:** Scan all, summarize.

### Output on a clean run

| Option | Description | Selected |
|--------|-------------|----------|
| Progress + final OK | Lightweight progress during run + final OK line. | |
| Quiet, summary only | Single final summary line, no per-file noise. | ✓ |
| You decide | Planner picks. | |

**User's choice:** Quiet, summary only.

---

## Build-time Parquet check (SCHEMA-04)

### Which species to sample

| Option | Description | Selected |
|--------|-------------|----------|
| First deterministic | First species in a stable ordering; reproducible, always exists. | ✓ |
| Fixed known-good slug | Pin one specific species; stable but rots if renamed/removed. | |
| You decide | Planner picks. | |

**User's choice:** First deterministic.

### Which reader

| Option | Description | Selected |
|--------|-------------|----------|
| hyparquet | Same library production uses at load time. | |
| DuckDB | Reuse build-data's already-open connection; zero new hot-path dependency. | ✓ |
| You decide | Planner picks. | |

**User's choice:** DuckDB. (Production hyparquet path covered by verify:parquet + Phase 37 load-time guard.)

---

## view / match_bucket unions

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, lift both now | view = 'D'\|'V'; match_bucket = literal union (set from parse-photo-filename.ts), used everywhere. | ✓ |
| Lift match_bucket only | Union match_bucket, leave view as string. | |
| Leave both as string | Minimize churn. | |

**User's choice:** Yes, lift both now.
**Notes:** Exact match_bucket value set must be derived from scripts/lib/parse-photo-filename.ts — do not invent (same rule Phase 34 applied to status). No enum (TS-03).

---

## Claude's Discretion

- verify:parquet exact filename/location and where it reads built Parquet from.
- Summary-line / failure-report format (within scan-all + quiet constraints).
- Local interface shapes for remaining external responses (driven by consumed fields).
- How the build-time column comparison is expressed against OccurrenceRecordSchema (DuckDB DESCRIBE vs introspection).

## Deferred Ideas

- Content-hash / fingerprint per-species Parquet URLs — caching/deploy change, out of scope for v3.0 (from Phase 33).
- New test coverage for previously-untested scripts (copy-parquet, copy-images, emit-species-states) — not required by MIG-02; cheap additions at planner discretion.
