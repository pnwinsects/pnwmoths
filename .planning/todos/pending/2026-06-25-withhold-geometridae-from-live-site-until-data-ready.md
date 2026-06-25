---
created: 2026-06-25T19:13:06.665Z
title: Withhold Geometridae from live site until data ready
area: general
files:
  - scripts/build-data.ts
  - src/_data/species.ts
  - src/_data/taxon.ts
---

## Problem

The Geometridae family is not ready for public release: its occurrence records
have not yet been sourced, and its species accounts (prose pages) have not been
written. Until both are done, Geometridae species must be **withheld from the
live/published site** — they should not appear in Browse, species pages, search
(Pagefind), or anywhere else user-facing.

This is a release-gating / content-readiness decision, not a data deletion. The
underlying Geometridae data (taxonomy, key scores, etc.) stays in the source so
the family can be re-included automatically once it is complete — mirroring the
existing pattern where unmatched key species are preserved in source but excluded
from Identify results (see [[project_unmatched_key_species]] in memory).

## Solution

TBD — decide the gating mechanism. Candidates:
- Exclude family == "Geometridae" at the data layer (`scripts/build-data.ts` /
  `src/_data/species.ts` / `src/_data/taxon.ts`) so no species pages, Browse
  entries, or Pagefind index entries are emitted.
- Keep it data-driven (a families-to-withhold list / flag) rather than a
  hardcoded family name, so lifting the embargo is a one-line change once
  occurrence records are sourced and accounts are written.
- Confirm interaction with the Identify key (Phase 39–42): if Geometridae key
  species resolve to withheld site pages, they'd become "unmatched" and drop out
  of Identify results automatically — verify that's the desired behavior or
  whether they should stay in the key.

Two preconditions to lift the embargo: (1) Geometridae occurrence records sourced,
(2) Geometridae species accounts written.
</content>
