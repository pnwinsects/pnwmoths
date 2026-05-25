# Phase 31: `data/species-photos.json` Build Integration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-23
**Phase:** 31-data-species-photos-json-build-integration
**Areas discussed:** Generation mechanism, DATA-03 scope

---

## Generation mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Script + commit | Operator runs `npm run photos:materialize` after upload pipeline, commits `data/species-photos.json`. Same pattern as `data/plates.json` (Phase 18). | ✓ |
| Eleventy build-time | `src/_data/speciesPhotos.js` reads manifest CSV directly on every build. No committed JSON needed. | |

**User's choice:** Script + commit (plates.json pattern)
**Notes:** Matches existing committed-manifest patterns in the codebase. Operator controls when the snapshot updates.

---

## DATA-03 scope

| Option | Description | Selected |
|--------|-------------|----------|
| Phase 31 adds template guard | Wraps images.csv `<figure>` loop; suppresses low-res elements for high-res species. | ✓ |
| Defer to Phase 32 | Phase 31 is data only; Phase 32 handles all species.njk changes. | |

**User's choice:** Phase 31 adds the template guard.
**Notes:** User corrected the requirement — the intent is that high-res photos **replace** low-res entries (not coexist). "No double rendering" means the low-res `<figure>` elements are absent from the HTML entirely. DATA-03 is stronger than initially modeled: it's full replacement, not just viewer-level selection.

---

## Claude's Discretion

- npm alias: `photos:materialize` (following `photos:ingest` / `photos:tile` / `photos:upload`)
- Multi-specimen ordering: alphabetical by `specimen_id`, then D before V within same specimen
- Script logging: `logStage`-style with summary at end
- `DRY_RUN=1`: print derived JSON without writing, consistent with other `photos:` scripts
- Self-contained helpers: copy `logStage` and `redact` from `upload-tiles.js` verbatim

## Deferred Ideas

- No-JS fallback for high-res species (no `<figure>` slot content) — Phase 32 concern
- Carousel thumbnail rendering from `high-res-specimens` when low-res figures are absent — Phase 32
