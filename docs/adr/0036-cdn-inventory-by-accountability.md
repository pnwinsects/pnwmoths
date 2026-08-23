# 0036. The CDN is inventoried by accountability — every object joined to what explains it

**Status:** Accepted

## Context

The Bunny Storage Zone is the only place where this project's history accumulates. Deploys are
additive: no purge, no deletes ([0008](0008-deploy-bunny-additive.md)), because the zone holds the
photo originals and a syncing delete would take them with it. So every object ever uploaded is
still there, and nothing in the repo could say what that set was
([#277](https://github.com/pnwinsects/pnwmoths/issues/277)).

Three cleanups in one afternoon each ran aground on the same missing answer, and each was recovered
by probing URLs one at a time: a species page assumed gone was still live
([#268](https://github.com/pnwinsects/pnwmoths/issues/268)); 33 more were found only by requesting
all 45 deny-listed slugs by hand ([#273](https://github.com/pnwinsects/pnwmoths/issues/273)); 171
orphan `records.parquet` files surfaced only because someone happened to list a directory while
deleting something else ([#275](https://github.com/pnwinsects/pnwmoths/issues/275)).

What existed was partial and answered a different question. `_site-manifest.json` hashes the
*current* upload and says nothing about what it stopped covering. `data/images.csv` records intent,
not what was uploaded. `data/image-derivatives.csv` covers one asset class.
`data/cdn-retired-images.csv` is hand-maintained and images-only.

## Decision

[`scripts/emit-cdn-inventory.ts`](../../scripts/emit-cdn-inventory.ts) (`npm run cdn:inventory`)
lists the zone, joins **every object against the artifact in this repo that should account for it**,
and writes the residue to a committed report, `data/cdn-inventory-report.csv`.

Accountability, not enumeration, is the organising idea. A list of 147,000 object keys answers
"what is in the zone" and none of "why", which is the half a maintainer needs before touching
anything. Each object is attributed to `site` (a path in the current `_site-manifest.json`),
`photo`, `derivative`, `tiles`, `plate`, `glossary-image`, `key-image`, `retired-photo`,
`analytics`, `superseded-build` — or to nothing, which is the report.

Six properties are load-bearing:

1. **The site manifest is the site's source of truth, and its absence is fatal.** It lists the paths
   of the build that is live now, so a site-shaped object missing from it is *by definition* a
   leftover from an earlier deploy — #273's still-live pages and #275's orphan Parquet, without
   knowing anything about gating. If the manifest fetch fails, the run aborts rather than reporting
   every site object as an orphan.

2. **The report runs in both directions.** A `missing-*` row is a path the repo claims is on the CDN
   that the listing did not find. Every other check in this repo runs repo→zone over *derived*
   paths only, so a photo row whose file was never uploaded is invisible until a page renders it
   broken. The first run named exactly the 83 rows of
   [#232](https://github.com/pnwinsects/pnwmoths/issues/232), which had been sitting in
   `docs/concerns.md` as a thing someone found by accident.

3. **Tile pyramids are units, not objects.** `_files/` and `TileGroup*` directories are recorded
   whole and not descended into. Enumerating them would cost ~40,000 directory listings to answer a
   question — is there a pyramid here, and does anything account for it — that one listing per
   pyramid answers. `DEEP=1` descends everything for the rare day you suspect junk inside a pyramid.

4. **Content-addressed build output is accounted for, not reported.** Abandoned Vite bundles and
   Pagefind shards are 98,987 of the zone's 146,958 units. They are unreachable except from the
   build that named them and there is nothing in them for a human to decide. They get their own
   summary line — 446 MB of deploy churn is worth knowing — but keeping them out of the report is
   what makes 901 findings legible instead of 100,000.

5. **Advisory, never a gate.** It exits 0 whatever it finds. It needs the network, and the build is
   offline by construction, so it is not in `npm run build` — the district audits set the
   precedent ([0014](0014-districts-offline-writeback.md)), and a network sweep that can fail a
   build on a blip is the thing [0027](0027-no-link-check-cache.md) already refused.

6. **It never deletes.** What to do about an orphan is a curator's call and the zone holds the
   originals. The script reads; the runbook's cleanup steps are manual and deliberate.

The expensive half is cached: `var/cdn-listing.csv` and `var/cdn-site-manifest.json` let
`USE_CACHE=1` re-classify offline, which is how the classifier gets iterated on without re-listing
147,000 objects. The full per-unit accounting is written to `var/cdn-inventory-full.csv` and is
**not** committed: it is ~10 MB and every deploy rewrites most of it, so committing it would bury
the report's signal under exactly the churn [0017](0017-reproducible-committed-artifacts.md) exists
to keep out of diffs.

## Consequences

- "What is in the zone, and what accounts for it" is one command. The first run: 146,958 units,
  901 findings — 209 stale site paths, 498 photos with no row, 83 rows with no photo, 74 tile
  pyramids for photos the manifest never confirmed, 34 unreferenced key illustrations, and one
  `test/somefile.jpg`.
- The report's diff is the signal: a new row means something became unaccounted for since the last
  run. That only works because the report is sorted and holds findings alone.
- `data/cdn-inventory-report.csv` carries a `species_slug` for slugs that are, in the normal case,
  *absent* from `data/species.csv` — so it is excused from the referential-integrity meta-guard
  ([0033](0033-referential-integrity-gate.md)) the same way `data/key-coverage-report.json` is.
- The zone's own conventions are now asserted in code (`_files/`, `TileGroup*`, `species-tiles/
  {slug}/{specimen}-{view}`, `derived/` mirroring its source path). A layout change that nothing
  else notices shows up here as a burst of new findings, which is the right alarm.
- The listing is ~5,000 storage-API requests and takes a few minutes. It is a maintainer command,
  not something to run in a loop.

## Alternatives considered

- **git-annex over the zone.** Rejected in detail on #277. It tracks content you cannot regenerate;
  the zone is a publish target whose derivatives and tiles are reproducible. There is no Bunny
  special remote, and each workaround loses something load-bearing: an `rclone` remote stores by
  annex key and destroys the public URL layout, `exporttree=yes` deletes remote objects that leave
  the tree (a direct collision with 0008 and with `cdn-retired-images.csv`), and
  `addurl --relaxed` records no hash, certifying nothing a CSV does not. It would also inventory
  *keys* rather than accountability, and still could not say that a directory has no species row.
- **A committed full listing of every object.** Rejected: ~10 MB rewritten on every deploy, and the
  interesting 900 rows would be unfindable in it. It stays in `var/`.
- **Making orphans fail the build.** Rejected: the check needs the network, and the correct response
  to nearly every finding is a curator's judgement, not a build failure. Same reasoning as the
  district audits.
- **Deriving the site's accounting from `data/species.csv` and the gating rules** instead of the
  uploaded manifest. Rejected: it re-implements what the build already decided, and would be wrong
  in exactly the interesting case — a page published under rules that have since changed.
- **Deleting what the report finds, or offering a `--fix`.** Rejected outright. The zone is shared
  with the photo originals; nothing in this repo may grow a syncing delete (0008).
