# 0034. Generators merge into their committed artifact; they never emit it from scratch

**Status:** Accepted

## Context

Two of the photo pipeline's committed artifacts are written by a script but are not wholly derived
from that script's inputs:

- **`data/species-photos.json`** — `generate-species-photos.ts` derives `high_res_available` and
  `specimens` from the manifest. `photographer` and `license` have no manifest column at all; they
  were added to the committed file by hand ([6632d9be](https://github.com/pnwinsects/pnwmoths/commit/6632d9be)).
- **`data/image-derivatives.csv`** — `upload-derivatives.ts` emits the record of what is on the CDN
  from the rows in `var/derivatives-manifest.csv`, which is scratch.

Both scripts wrote their output by serialising what they had just computed. Neither read the file
it was about to replace. That is correct only when a run always covers the whole corpus, and
neither one does:

- Regenerating `species-photos.json` dropped `photographer` and `license` from all 1,241 entries.
  `SpeciesPhotoSchema` requires both and `src/_data/speciesPhotos.ts` annotates the imported JSON,
  so `tsc --noEmit` failed — meaning **`npm run photos:materialize` broke the build every time it
  ran**, and the documented recovery was an undocumented manual re-annotation.
- `var/` is scratch that may be absent, stale, or hold only the slice a scoped run touched.
  `GENERATING_DERIVATIVES.md` actively recommends scoping (`KIND=highres`, `LIMIT=8`), and any such
  run would rewrite the committed CSV with only its own rows — deleting the record of ~23,000
  derivatives that are still on the CDN, and failing the source gate for every species not in the
  run.

Both were found while working [#214](https://github.com/pnwinsects/pnwmoths/issues/214), which
needed exactly the scoped, incremental runs that trigger them.

## Decision

A generator that writes a committed artifact **reads the existing artifact and merges into it**.
Specifically:

1. **Fields the generator does not derive are carried forward** from the committed copy. The
   generator owns the derived fields and nothing else.
2. **Entries the current run did not touch are preserved**, not dropped. A run's scope determines
   what it *updates*, never what *survives*.
3. **A curator-entered value is never overwritten by a generated one.** A blank counts as absent,
   so a documented default may fill it, and every defaulted entry is named in the run's output.

This is the additive-only rule the district write-back and CDN migrations already follow, stated
for generated artifacts: *derived columns are rewritten, everything else is preserved.*

`species-photos.json` gains `DEFAULT_PHOTOGRAPHER` / `DEFAULT_LICENSE` for species appearing for
the first time. The whole high-res corpus comes from one Dropbox share, and all 1,241 pre-existing
entries carried these same values, so a new *page* is not a new photographer. The run names every
slug it defaulted, because an inherited default is only safe when it is visible.

## Consequences

- `npm run photos:materialize` is now safe to run on its own and leaves a diff that is purely
  additive. Its output no longer needs hand-repair before it will typecheck.
- Scoped derivative runs are safe, which is what makes adding a handful of photos a minutes-long
  operation instead of a multi-hour full regeneration (see `ONLY=` in
  [GENERATING_DERIVATIVES.md](../../_instructions/GENERATING_DERIVATIVES.md)).
- Stale entries are never garbage-collected by these scripts. That is deliberate and consistent
  with [0008](0008-deploy-bunny-additive.md): nothing is deleted from the Storage Zone, so nothing
  is deleted from the record of it. Removing an entry is a manual, deliberate edit.
- The failure mode these scripts had is quiet — a valid file, a green script, and data missing.
  Tests pin the merge behaviour for both artifacts; a regression should fail there rather than in a
  build days later.

## Rejected alternatives

**Move `photographer`/`license` into the manifest.** The manifest is ingest state keyed by
`content_hash`, and attribution is per species. It would also put a curator-owned field inside a
file three scripts rewrite in full, which is the arrangement [0025](0025-manifest-locks.md) exists
to make safe.

**Keep emitting from scratch and require full runs.** This is the status quo that made a two-photo
addition cost a full-corpus regeneration, and it left the "delete everything else" behaviour one
`LIMIT=8` away — recommended by the runbook itself.

**Have the generator fail when a curator field is missing.** It converts a silent data loss into a
loud stop, but still leaves adding a species a manual two-step. The default-and-report path keeps
the pipeline runnable while making every assumption visible.
