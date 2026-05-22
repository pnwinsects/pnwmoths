# Phase 27: Synonym Curation Pass - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-22
**Phase:** 27-synonym-curation-pass
**Areas discussed:** Synonyms CSV schema, Reclassification trigger, Provisional + unparseable handling, Seed synonyms.csv from spike data

---

## Synonyms CSV Schema

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal (2 columns) | `from_binomial,to_species_slug` only. PR diff captures who/when. | ✓ |
| Standard (4 columns) | Add `note` and `decided_on`. Recommended. | |
| Full provenance (5 columns) | Add `decided_by` and `source` (citation). | |

**User's choice:** Minimal (2 columns).
**Notes:** The flat-file ethos from Phase 26 carries forward — git history is the audit trail; no need for in-row provenance columns that add per-row friction.

---

## Reclassification Trigger

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-apply on every ingest | `scripts/ingest-photos.js` always loads `species-synonyms.csv` when it exists. No new flag, no new script. | ✓ |
| New env flag | Add `RECLASSIFY_ONLY=1` (mirrors `RESORT_ONLY=1`); skip Dropbox calls. New npm alias `photos:reclassify`. | |
| Separate script | New `scripts/reclassify-photos.js` + `photos:reclassify` alias. Per D-13 "one script per stage." | |

**User's choice:** Auto-apply on every ingest.
**Notes:** Both `photos:ingest` and `photos:investigate` will pick up the current synonyms.csv. Curator's daily-use command becomes `npm run photos:investigate` (no Dropbox calls, reclassify + re-sort in place).

---

## Provisional + Unparseable Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Synonyms can route any bucket | Match on `binomial_raw` regardless of source bucket; promote to `resolved-via-synonym`. | ✓ |
| Synonyms only route genus-only + likely-synonym | Strictest reading of ROADMAP; provisional and unparseable stay untouched. | |
| Route any bucket WITH separate provisional flag | Same as option 1 but require confirmation for provisional promotions. | |

**User's choice:** Synonyms can route any bucket.
**Notes:** The 22 rows with empty `binomial_raw` (subset of unparseable) remain unreachable — no key to match on. Deferred to post-v2.2.

---

## Seed `species-synonyms.csv`

| Option | Description | Selected |
|--------|-------------|----------|
| Empty starter | Header line only. Every row is a deliberate curator PR. | ✓ |
| Seed with Grammia→Apantesis only | Single representative example. | |
| Seed with all spike-documented cases | Pre-populate every known case from the spike REPORT.md. | |

**User's choice:** Empty starter.
**Notes:** Curator drives every decision; no Claude/spike-author pre-commits.

---

## Claude's Discretion

- **D-09:** Whether synonym loading lives in `loadSpecies()` (returning a fourth map alongside byBinomial/bySlug/genera) or in a sibling `loadSynonyms()` helper. Interface to `classify()` is what matters.
- **D-10:** Whether synonyms.csv gets its own unit test or just integration coverage via existing classify tests. TDD discipline from Phase 26 applies whatever shape the test takes.

## Deferred Ideas

- Filename fixes for the 22 empty-`binomial_raw` unparseable rows (would require Dropbox renames + re-ingest)
- Richer synonyms.csv columns (`note`, `decided_on`, `decided_by`, `source`) — rejected for v2.2
- Preview mode that shows what reclassification WOULD do without writing
- External taxonomic API (GBIF/ITIS) auto-resolution — milestone-level deferral, restated
- Pre-filled `species-synonyms.csv` from spike data — every row is a curator PR
- Genus-wildcard synonyms (`Grammia *` → `Apantesis *`) — per-binomial rows are the v2.2 model
- The lightbox close-button todo (weak match, UI bug not curation) — stays in pending todos
