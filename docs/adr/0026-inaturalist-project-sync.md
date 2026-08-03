# ADR 0026 — iNaturalist records live in a separate, machine-owned file

**Status:** Accepted
**Date:** 2026-08-03
**Issue:** [#23](https://github.com/pnwinsects/pnwmoths/issues/23)

## Context

The collaborator curates an iNaturalist project,
[PNWMoths](https://www.inaturalist.org/projects/pnwmoths), and wants its research-grade
observations to appear on the site. His requirement is a full three-way reconcile on every run:
observations that leave the project are **removed** from our data, changed observations are
**updated**, new ones are **added**. Identity is the observation URL, whose trailing number is
unique.

Two facts shaped the design more than the requirement did.

**The conventions already exist.** `data/records.csv` contains 145 iNaturalist observation URLs
across rows the curator entered by hand, 29 of them tagged `collection = iNaturalist`, all with
`record_type = photograph` and the URL in `notes`, and two annotated
`location accuracy: 26.94km; <url>`. This work automates an established practice; it does not
invent one.

**Reconciliation is destructive.** Removing a row because a remote server changed is unlike
anything else that writes occurrence data here. Every existing `records.csv` writer is
additive-only (CLAUDE.md) and one-shot ([ADR 0025](0025-manifest-locks.md)).

## Decision

**Imported records live in `data/records-inat.csv`, rewritten wholesale on every run.**
`data/records.csv` stays curator-owned and is never written by anything that talks to a network.
Reconciliation then falls out of the file being regenerated: a row exists for exactly as long as
its observation is in the project at research grade.

Supporting decisions:

- **`inat_id` is the identity, and never reaches the browser.** The 16th column keys the
  reconcile; the observation URL travels to the UI in `notes`, which `pnwm-occurrence-popup.ts`
  already renders as a link. No change to `OccurrenceRecordSchema`, the Parquet schema, or any
  Lit component.
- **`scripts/lib/records-source.ts` is the single definition of "every record the site serves."**
  The two files differ in width, so every union selects the 15 canonical columns explicitly.
  Build steps that feed the site go through it; maintainer curation scripts deliberately do not.
- **Geography is derived, never imported.** Point-in-polygon against the committed boundaries
  gives a district; the state comes from the district id's FIPS/CDUID prefix; the county comes
  from `data/district-crosswalk.csv`.
- **Ingest fails closed on geography.** No district, or a district outside the six covered
  jurisdictions, means the observation is rejected to a report — never written with a blank
  state. `build-data.ts` exempts an empty state from its allow-list check, so such a record
  would build cleanly and then be invisible to every filter on the page.
- **Removals carry a reason.** The sync fetches the project's whole eligible set and partitions
  locally, so "left the project" is distinguishable from "lost research grade" and from
  "re-identified as something we have no page for". They call for different responses from the
  curator.
- **Convergence on one file happens by pull.** The sync refuses to emit an observation already
  cited in `records.csv`; `scripts/migrate-inat-records.ts` hands such a record over on demand,
  deleting the hand-entered row so the next sync owns it.

## Rejected alternatives

**Appending imported rows to `data/records.csv`.** Rejected on ownership, not mechanics. A
network-driven row *deleter* pointed at the curator's file is a different kind of program from
every other writer there, and the blast radius of a bug is the corpus the project is built on.

An earlier draft justified the split by claiming that appending would force a regeneration of
`data/records-derived-district.csv` and produce a diff large enough to bury the change under
review. That is false and was removed: `derive-district-audit.ts` emits rows in `records.csv`
order, so appending changes only the appended tail. The ownership argument is the real one.

**Bulk-migrating the 145 hand-entered observations into the new file.** This looks like the
tidy end state and is data loss. Only one of the 145 is in the project today; 17 are `needs_id`
and can never qualify under the research-grade-only rule; and two have identifications
iNaturalist has moved to taxa with no page here. A row survives in the machine-owned file only
while the project holds its observation, so migrating them wholesale would delete 144 records
from the site.

**Treating iNaturalist as authoritative for identification.** Rejected: it is not a strict
upgrade. Of the 145, three identifications have diverged from ours, and two of those now point
at taxa with no page here (`Pseudaletia unipuncta`, `Furcula gigans`) — in the first case our
name is arguably the current one. Divergence is reported for a human decision and never applied
to a curator's record.

**A nightly GitHub Actions job.** The original plan. Dropped because the person who curates the
project is the person who should review the result, and because the ruleset on `main` requires a
PR with a passing `build` check and no bypass actors — a `GITHUB_TOKEN`-authored PR does not
trigger `pull_request` workflows, so the required check would never run and auto-merge would
hang. A maintainer-run script needs no token and puts review where the knowledge is. The
scheduled version remains possible later; nothing here forecloses it.

**A new `observation` record type.** `photograph` is what the curator already uses, is already
valid in `build-data.ts`, and is rendered raw in the map popup. `collection = iNaturalist`
already separates these from specimen photography in the filter bar. (Note `data/README.md`
documented `observation` as a valid `record_type` while `build-data.ts` rejected it; that error
predates this work and is fixed alongside it.)

## Consequences

- Imported records cannot be reproduced from committed inputs — they depend on a live remote —
  so this artifact does **not** satisfy [ADR 0017](0017-reproducible-committed-artifacts.md).
  Output is sorted by `inat_id` for stability given the same response, which is a weaker and
  different property, and the reason the file is committed at all: the build must not require
  network access.
- Two upstream fields are user-editable (the observer's display name, and their place
  description), so an occasional "updated" line reflects an edited iNaturalist profile rather
  than a data change.
- Obscured observations are imported with a state but no county or district. Their published
  coordinates can be ~27 km from the truth, which is wider than many PNW counties. The policy is
  one constant, `OBSCURED_POLICY`, pending the collaborator's answer on #23.
- A record that cannot be placed in a district but whose neighbours within 25 km all agree on a
  state is kept with that state and no district — coastal, island and on-the-water records land
  here. Unanimity is what makes it safe: near a border the neighbours disagree and the record is
  rejected instead of being assigned to the wrong side.
- `src/_data/stats.ts` counts the union, so the home-page record total includes imported records.
