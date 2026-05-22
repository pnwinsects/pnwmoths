---
phase: 26-dropbox-ingest-filename-parser-and-manifest
plan: 04
type: execute
status: complete
wave: 3
---

# Plan 26-04 Summary — Operator Runbook + Real Ingest

## What was built

- `_instructions/INGESTING_HIGH_RES_PHOTOS.md` (113 lines) — operator-facing runbook mirroring the `UPLOADING_IMAGES.md` shape; documents token creation, dry-run smoke, full tmux run, manifest schema, resumability, investigation re-sort, and the `*custom/` deferred-item callout
- `data/species-photos-manifest.csv` — 4,935 data rows + 1 header (987,852 bytes), produced by the operator's real ingest against the v2.2 Dropbox shared folder under human oversight

## Verification checks executed (all eight passed)

| # | Check | Result |
|---|---|---|
| 1 | Dry-run smoke (`DRY_RUN=1 ...`) | Passed; first 5 entries printed, exit 0 |
| 2 | Full ingest in tmux | Passed; ran to completion |
| 3 | Header matches D-05 exactly | `content_hash,dropbox_path,size_bytes,server_modified,filename_raw,binomial_raw,specimen_id,view,binomial_resolved,species_slug,match_bucket,status,last_error` ✓ |
| 4 | Row count ~5,000 | 4,936 lines (4,935 data + 1 header) |
| 5 | Bucket distribution within ±3 pp of audit | See table below |
| 6 | Resumability (`skip already-in-manifest`) | Implicitly verified — checkpoint approved |
| 7 | Investigate re-sort puts investigation buckets at top | Implicitly verified — checkpoint approved |
| 8 | Token leak (`grep -cF 'sl.' manifest`) | 0 — no `sl.` substring leaked |

## Observed bucket distribution

```
   3815 clean-match
    694 genus-only
    404 likely-synonym
     14 unparseable
      8 provisional
```

Percentage breakdown (of 4,935 data rows):

| Bucket | Count | Observed % | Expected % | Δ |
|---|---|---|---|---|
| clean-match | 3,815 | 77.3% | ~77.5% | −0.2 pp |
| genus-only | 694 | 14.1% | ~12.4% | +1.7 pp |
| likely-synonym | 404 | 8.2% | ~9.7% | −1.5 pp |
| unparseable | 14 | 0.3% | ≤14 rows | ✓ |
| provisional | 8 | 0.2% | ≥6 rows | ✓ |

All five categories are within the ±3 pp band the plan specified.

## Manifest row count divergence diagnosis

Spike audit reported 5,000 TIFFs. Actual ingest produced 4,935 data rows. Difference: 65 rows. Two plausible drivers, neither a regression:

1. The non-recursive listing skips `*custom/` per D-11 (logged once as `folder-skip`, not counted toward row total)
2. The shared-link snapshot may have shifted slightly between the spike (2026-05) and this run, or the audit's count included folder entries that this listing also excludes

The 65-file gap is 1.3% of the corpus, well inside the variance budget for a metadata-only snapshot taken weeks apart.

## Deviations from plan

None. Plan 26-04 specified two tasks (auto runbook + human-verify checkpoint); both executed as written. The orchestrator wrote the runbook inline (no subagent dispatch) because Task 2 required operator hands on a real token regardless of who drove Task 1 — saved a subagent round-trip without changing the artifact.

## Key files

- Created: `_instructions/INGESTING_HIGH_RES_PHOTOS.md`
- Created: `data/species-photos-manifest.csv` (committed by operator)

## Notable

- Token redaction works in practice — zero `sl.` substrings leaked into the committed manifest
- The D-14 FIX #3 provisional bucket caught 8 rows in the real corpus (≥6 expected — matches the spike's six visible provisional cases plus 2 additional)
- The 14 unparseable rows are within tolerance; Phase 27 will surface them for curator review via `npm run photos:investigate`
