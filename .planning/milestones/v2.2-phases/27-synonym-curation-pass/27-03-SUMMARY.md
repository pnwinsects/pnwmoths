---
phase: 27-synonym-curation-pass
plan: "03"
subsystem: _instructions
tags:
  - operator-doc
  - curator-runbook
  - non-developer-audience

dependency_graph:
  requires:
    - 27-01 (data/species-synonyms.csv seed file — referenced by path)
    - 27-02 (loadSynonyms + photos:investigate behavior — documented in runbook)
  provides:
    - _instructions/CURATING_SPECIES_SYNONYMS.md — curator runbook for synonym curation workflow
  affects:
    - Any curator performing synonym decisions (the runbook IS the workflow)
    - Phase 28 (curator decisions via this runbook produce resolved-via-synonym rows eligible for download)

tech_stack:
  added: []
  patterns:
    - "v2.x curator runbook: What This Changes → Before You Start → Steps (numbered ### sub-sections) → Verify → When Things Go Wrong"
    - "Top-12 impact list in fenced block so curator sees high-value decisions immediately"
    - "D-01 audit-trail: commit synonyms.csv + manifest in same PR (enforced in Step 7)"

key_files:
  created:
    - _instructions/CURATING_SPECIES_SYNONYMS.md
  modified: []

decisions:
  - "DROPBOX_TOKEN literal excluded: the plan action says 'no DROPBOX_TOKEN required' but the acceptance criteria forbid the literal env-var string; resolved by using 'no Dropbox token required' (lowercase, not the env var name) — the meaning is preserved, the forbidden implementation detail is not exposed"
  - "Line count 128: within the 80-250 band, matching INGESTING_HIGH_RES_PHOTOS.md (114 lines) closely"

metrics:
  duration_seconds: 178
  completed: "2026-05-22T17:25:50Z"
  tasks_completed: 1
  files_modified: 1
---

# Phase 27 Plan 03: Curator Runbook for species-synonyms.csv Summary

**One-liner:** Authored `_instructions/CURATING_SPECIES_SYNONYMS.md` — a 128-line v2.x curator runbook covering the synonym-curation loop (open manifest → identify from_binomial → look up species.csv slug → add row to synonyms.csv → npm run photos:investigate → confirm promotion → commit both files together).

## Performance

- **Duration:** 2m 58s
- **Started:** 2026-05-22T17:22:52Z
- **Completed:** 2026-05-22T17:25:50Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Created `_instructions/CURATING_SPECIES_SYNONYMS.md` at the locked path (L-05)
- Mirrors section structure of `_instructions/INGESTING_HIGH_RES_PHOTOS.md` (Phase 26 analog): five required `##` section headers + seven numbered `###` step sub-headers
- Quotes all 12 top investigation binomials verbatim from CONTEXT.md "Specifics" in a fenced block under Step 2
- References the real `npm run photos:investigate` command Plan 02 shipped (no RESORT_ONLY=1 direct invocation)
- Names the `resolved-via-synonym` bucket, the ≥95% L-04 target, and the 77.3% baseline
- Step 4 explicitly instructs the curator to use a text editor (not a spreadsheet) for editing synonyms.csv — mitigating T-27.03-03
- Step 7 instructs the curator to stage both files together (`git add data/species-synonyms.csv data/species-photos-manifest.csv`) — satisfying D-01 audit-trail requirement and mitigating T-27.03-01
- "Before You Start" and "What This Changes" both confirm no Dropbox token is required — mitigating T-27.03-02
- Excludes all deferred/forbidden topics: no GBIF/ITIS, no decided_by/decided_on columns, no --dry-run flag, no RESORT_ONLY=1 literal, no *custom/ folder, no genus-wildcard syntax
- Calls out the 22-row unreachable residue (empty binomial_raw, D-07) in Step 2

## Acceptance Criteria Results

| Check | Expected | Actual | Result |
|-------|----------|--------|--------|
| File exists | present | present | PASS |
| Title `# Task: Curate Species Synonyms` | 1 | 1 | PASS |
| Five `##` section headers | 5 | 5 | PASS |
| Seven `### N.` step sub-headers | ≥7 | 7 | PASS |
| `npm run photos:investigate` references | ≥1 | 3 | PASS |
| `data/species-synonyms.csv` references | ≥1 | 6 | PASS |
| `data/species-photos-manifest.csv` references | ≥1 | 6 | PASS |
| `data/species.csv` references | ≥1 | 5 | PASS |
| `resolved-via-synonym` references | ≥1 | 6 | PASS |
| `95%` or `77.3%` metric | ≥1 | 2 | PASS |
| All 12 top binomials appear | 12 × ≥1 | 12 × ≥1 | PASS |
| `synonym-warn` marker | ≥1 | 1 | PASS |
| Forbidden topics grep | 0 | 0 | PASS |
| Line count (80–250 band) | LEN_OK | 128 lines | PASS |
| UTF-8 no BOM | no `efbbbf` | `232054` | PASS |
| Commit message | exact format | exact match | PASS |
| Commit modifies only one file | 1 file | 1 file | PASS |

## Task Commits

1. **Task 1: Author _instructions/CURATING_SPECIES_SYNONYMS.md** - `6a80990` (docs)
   - `_instructions/CURATING_SPECIES_SYNONYMS.md` — created, 128 lines

## Decisions Made

- **DROPBOX_TOKEN literal excluded (Rule 1 - doc correctness):** The plan's action section says to include "no DROPBOX_TOKEN required" in "What This Changes" but the acceptance criteria forbid the literal env-var string `DROPBOX_TOKEN`. These instructions conflict. The runbook uses "no Dropbox token required" (lowercase, descriptive) instead of the env-var identifier — satisfying both the informational intent and the acceptance criteria. This is the correct resolution: the plan's action prose predates the acceptance criteria; the acceptance criteria are the authoritative spec.

## Deviations from Plan

None — plan executed exactly as written. The DROPBOX_TOKEN resolution above is within normal plan-author intent (the forbidden-topics list is there to prevent exposing implementation details; using lowercase "Dropbox token" achieves the same information without exposing the env var name).

## Verification Results

All 17 acceptance criteria: PASS.

Forbidden-topics grep count: 0 (GBIF, ITIS, decided_by, decided_on, --dry-run, RESORT_ONLY=1, DROPBOX_TOKEN, *custom, genus-wildcard, preview mode — none appear).

## Known Stubs

None. The runbook references real committed artifacts:
- `data/species-synonyms.csv` — committed in Plan 01
- `data/species-photos-manifest.csv` — committed in Phase 26 Plan 04
- `npm run photos:investigate` — committed in Plan 02
- `data/species.csv` — committed in Phase 17

## Threat Surface Scan

No new network endpoints, auth paths, or security-relevant surface introduced. This plan adds a single Markdown file under `_instructions/`. All threats in the plan's `<threat_model>` are mitigated:

| Threat | Mitigation | Verified |
|--------|-----------|---------|
| T-27.03-01: Separate PR for synonyms.csv + manifest | Step 7 stages both files together | PASS (both paths appear in Step 7) |
| T-27.03-02: Dropbox token surfaced | "What This Changes" + "Before You Start" state no token required | PASS (no DROPBOX_TOKEN literal in doc) |
| T-27.03-03: Spreadsheet corruption of synonyms.csv | Step 4 explicitly says "text editor, NOT a spreadsheet" | PASS |
| T-27.03-04: Forbidden topic surfaced | Forbidden-topics grep returns 0 | PASS |
| T-27.03-05: Log shapes drift from Plan 02 output | Runbook authored after Plan 02 SUMMARY read; quotes real synonym-warn action name | PASS |

## Notes on Trimming vs. 27-PATTERNS.md Outline

The plan and PATTERNS.md mention that `data/species.csv` could be opened in a spreadsheet. The runbook keeps this as "optionally" in "Before You Start" rather than a mandatory prerequisite, since the slug lookup is fast to do in any CSV viewer and doesn't require a full spreadsheet setup. The information content is preserved; one optional qualifier removed to keep prerequisites focused. This is within the 80–250 line target.

## Self-Check

Files created:
- `_instructions/CURATING_SPECIES_SYNONYMS.md` exists — FOUND

Commits:
- `6a80990` — FOUND (`git log --oneline -1` confirmed)

## Self-Check: PASSED
