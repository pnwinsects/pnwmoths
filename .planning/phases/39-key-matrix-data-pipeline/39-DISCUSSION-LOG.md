# Phase 39: Key Matrix Data Pipeline - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-24
**Phase:** 39-key-matrix-data-pipeline
**Areas discussed:** key.csv source, 39↔40 boundary, Artifact shape, Budget & validation

---

## key.csv source

The source file was located on disk at `~/Downloads/may 6 2015 key files/may 6 2015 key.csv`
(629 KB; 1,229 × 238, confirmed structure).

| Option | Description | Selected |
|--------|-------------|----------|
| Commit as data/key.csv | Copy verbatim, terse name | |
| Commit, cleaned name | Commit with a descriptive name | ✓ |
| External path + env var | Leave outside repo, read via env var | |

**User's choice:** Commit, cleaned name.

Follow-up — exact filename:

| Option | Description | Selected |
|--------|-------------|----------|
| data/key.csv | Short, matches artifact/script names | |
| data/lucid-key.csv | Names the provenance | |
| data/key-characters.csv | Describes content; aligns with milestone name | ✓ |

**User's choice:** `data/key-characters.csv`.
**Notes:** Build must be reproducible with no external file dependency (no-server constraint).

---

## 39↔40 boundary

Contradiction surfaced: ROADMAP Phase 39 SC1/SC4 and Phase 40 SC1/SC2 both claim slug
resolution + coverage report; research SUMMARY places all of it in Phase 1 (=39).

| Option | Description | Selected |
|--------|-------------|----------|
| All in Phase 39 | Full pipeline (ingest + slug resolution + nav join + coverage + bitset) in 39; 40 shrinks to pure filter logic | ✓ |
| Matching deferred to 40 | 39 emits raw-binomial matrix; 40 does matching + rewrites artifact | |
| Split the seam | 39 direct match + first-pass coverage; 40 adds synonym curation | |

**User's choice:** All in Phase 39.
**Notes:** Recorded a roadmap-edit flag — ROADMAP Phase 40 SC1/SC2 should move into Phase 39.

---

## Artifact shape

Research resolved to bitset; ROADMAP SC1 wording says "237 × N binary rows".

| Option | Description | Selected |
|--------|-------------|----------|
| Per-state base64 bitset | base64 Uint8Array bitsets, ~29 KB gzip; research pick / KEY-01 | ✓ |
| Nested array number[][] | ~170 KB gzip; human-readable; matches SC1 wording | |
| Bitset + decide layout in plan | Commit to bitset, defer exact byte layout to planner | |

**User's choice:** Per-state base64 bitset.
**Notes:** Overrides ROADMAP SC1's "binary rows" wording (roadmap-edit flag).

---

## Budget & validation

Two open questions; the Zod O(states+species) shape rule was carried forward from KEY-03
without re-asking.

**Budget basis:**

| Option | Description | Selected |
|--------|-------------|----------|
| Raw ≤100KB | fs.statSync on uncompressed file; matches SC3 verbatim | |
| Gzip ≤50KB | Gzipped transfer size; more meaningful for mobile | ✓ |
| Both raw + gzip | Assert both | |

**User's choice:** Gzip ≤50KB.
**Notes:** Diverges from SC3's "100KB" raw number (roadmap-edit flag); check needs a gzip step.

**Commit artifacts:**

| Option | Description | Selected |
|--------|-------------|----------|
| Commit both | key-matrix.json + key-coverage-report.json in git | ✓ |
| Commit coverage only | Gitignore the machine artifact | |
| Build-only | Gitignore both | |

**User's choice:** Commit both.
**Notes:** Consistent with existing species-photos.json / plates.json precedent.

---

## Claude's Discretion

- Exact bitset byte layout/orientation, coverage-report JSON shape, and precise
  `build:key` / `copy-key-matrix` script wiring — left to research/planning within the
  decision constraints above.

## Deferred Ideas

- Filter semantics / `key-filter.ts` / event type → Phase 40.
- `sharp` direct-dependency verification → Phase 43.
- Curating remaining ~53 unmatched binomials beyond Grammia→Apantesis → ongoing curator work.
- ROADMAP success-criteria corrections (artifact shape, budget basis, 39/40 split) → apply
  via `/gsd-phase` edit when convenient.
