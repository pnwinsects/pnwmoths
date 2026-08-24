# Task: Audit the CDN — what is in the zone, and why

The bunny.net Storage Zone is the only place where this site's history accumulates. Deploys never
delete, so **every object ever uploaded is still there**: pages for species that have since been
gated, photos for genera that were renamed, tiles for specimens that were withdrawn.

This audit lists the whole zone, joins every object to whatever in this repo accounts for it, and
reports what is left over — plus the reverse, anything the repo says is on the CDN that is not.

Run it before a cleanup, after a batch of renames or removals, or whenever you want to know what is
actually out there. Nothing here deletes anything, and nothing here can fail a build.

Background and rationale: [ADR 0036](../docs/adr/0036-cdn-inventory-by-accountability.md).

## What This Changes

- **`data/cdn-inventory-report.csv`** — committed. One row per finding. Commit it: its diff is how
  you see what became unaccounted for since the last audit.
- **`data/cdn-duplicates-report.csv`** — committed. Images the zone holds more than one copy of,
  where at least one copy is unaccounted for. Commit it with the findings report.
- **`var/cdn-inventory-full.csv`** — local scratch. Every object with what accounts for it. Use
  it to answer one-off questions; it is far too big and too churny to commit.
- **`var/cdn-duplicates-full.csv`** — local scratch. Every duplicate group, including the
  thousands with nothing to decide that the committed report filters out.
- **`var/cdn-listing.csv`**, **`var/cdn-site-manifest.json`** — local scratch. The raw listing, so
  you can re-run the classification without listing the zone again.
- **Nothing on the CDN.** The audit only reads.

## Before You Start

- **`BUNNY_STORAGE_PASSWORD`** — bunny.net → Storage → `pnwmoths` → FTP & API Access. Read-only use
  here, but the storage API needs it even to list.
- **About five minutes.** The sweep is roughly 5,000 directory listings.

## Steps

### 1. Run the audit

```bash
BUNNY_STORAGE_PASSWORD='…' npm run cdn:inventory
```

It prints what accounts for the zone, then the findings:

```text
[emit-cdn-inventory] 146958 units in the zone:
[emit-cdn-inventory]   site                6941  161.1 MB
[emit-cdn-inventory]   superseded-build   98987  446.2 MB
[emit-cdn-inventory]   photo               3951  626.7 MB
[emit-cdn-inventory]   derivative         23702  1.8 GB
[emit-cdn-inventory]   tiles              11761  612.3 MB
[emit-cdn-inventory]   …
[emit-cdn-inventory] 901 finding(s) — 818 unaccounted for, 83 expected and absent:
[emit-cdn-inventory]   photo-no-row                 498
[emit-cdn-inventory]   stale-site                   209
[emit-cdn-inventory]   missing-photo                 83
```

`superseded-build` is the abandoned JavaScript bundles and search-index shards of every previous
deploy. They are expected, they are nobody's decision, and they are why the findings list is 901
rows and not 100,000.

### 2. Read the report

Open `data/cdn-inventory-report.csv` and sort by `shape`. Each shape asks a different question:

| `shape` | What it is | What to do |
|---|---|---|
| `stale-site` | A page or its occurrence data, still served at a public URL, that the current build no longer produces. Usually a species that was gated or removed after being published. | Decide whether it should still be reachable. Removal is manual — see step 4. |
| `photo-no-row` | An image in a species folder with no row in `data/images.csv`. Usually left behind by a genus rename, or a photo uploaded and never registered. | If the photo should be shown, add the row and generate derivatives. If it is superseded, record it in `data/cdn-retired-images.csv`. |
| `missing-photo` | The opposite: a row in `data/images.csv` whose file is not on the CDN. The page will render a broken image the moment the species is published. | Upload the file, or remove the row. Curator's call. |
| `tiles-no-photo` | A high-res tile pyramid for a specimen `data/species-photos-manifest.csv` does not list as uploaded. | Usually a withdrawn specimen. Leave it unless space matters. |
| `missing-tiles` | The manifest says a pyramid was uploaded and it is not there. | Re-run the tiling upload for that row. |
| `key-image-no-row` | A key illustration no row in `data/key-character-images.csv` refers to. | Harmless. Expected for illustrations the Lucid key stopped using. |
| `glossary-no-row` | An image under `glossary/` that `data/glossary.csv` does not name. | Harmless, unless it is an interrupted upload (`.partial`). |
| `unknown` | Nothing recognised it. | Look at it. This is where genuine junk shows up. |

The `detail` column carries the actionable half — whether the species is published, gated, or absent
from `data/species.csv` entirely.

### 2a. Read the duplicates report

Renames are additive: changing a genus copies every photo to the new slug and leaves the old
one in place. `data/cdn-retired-images.csv` records the pairs somebody wrote down;
`data/cdn-duplicates-report.csv` finds the rest, by grouping objects on the SHA256 the storage
listing hands back for free.

Each group is contiguous in the file. A group holding one live copy and one orphan is a
leftover, and its orphan is the one class of unaccounted object you can retire without asking
whether anything is lost — the bytes are still being served from the other path.

```text
xestia-c/Xestia c-nigrum-A-D.jpg          ≡  xestia-c-nigrum/Xestia c-nigrum-A-D.jpg
species-tiles/protorthodes-rufula/A-D…    ≡  species-tiles/trichopolia-rufula/A-D…
key-images/Blue copy.webp                 ≡  key-images/Blue.webp
```

Retiring one means adding a row to `data/cdn-retired-images.csv` — that is what stops it being
reported again, and it is a record rather than a deletion. Deleting the object is a separate,
manual decision (step 4).

Only images are compared. A `.dzi` descriptor is determined entirely by the source's pixel
dimensions, so unrelated specimens shot at the same size have byte-identical descriptors;
comparing those would report 824 groups that mean nothing. The unfiltered list is in
`var/cdn-duplicates-full.csv` if you want it.

### 3. Re-check without re-listing

The listing is cached, so you can re-run the classification instantly — useful after editing a CSV
to confirm a finding is resolved on paper:

```bash
USE_CACHE=1 npm run cdn:inventory
```

A listing that is missing any object's checksum cannot answer the duplicate question, so a run
off one leaves `data/cdn-duplicates-report.csv` alone and says so — rather than writing a report
whose missing groups would read as "somebody cleaned these up". A cached listing from before the
checksum column is the usual reason.

To look at one corner of the zone instead of all of it (this leaves the committed report alone):

```bash
BUNNY_STORAGE_PASSWORD='…' PREFIX='glossary/' npm run cdn:inventory
```

To look inside tile pyramids, which the audit normally treats as single units:

```bash
BUNNY_STORAGE_PASSWORD='…' DEEP=1 npm run cdn:inventory
```

### 4. Act on a finding — carefully

**The audit never deletes, and neither should a script.** The zone holds the only copies of some
photo originals, and one over-broad delete takes them with it ([ADR 0008](../docs/adr/0008-deploy-bunny-additive.md)).

Remove an object only when you have decided it should go, one path at a time:

```bash
curl -X DELETE -H "AccessKey: ${BUNNY_STORAGE_PASSWORD}" \
  "https://la.storage.bunnycdn.com/pnwmoths/species/some-slug/index.html"
```

Then purge the pull-zone cache for that path, or the old copy is served for up to a year
([ADR 0009](../docs/adr/0009-bunny-cache-policy.md)).

### 5. Commit the report

```bash
git checkout -b cdn-audit-YYYY-MM-DD
git add data/cdn-inventory-report.csv data/cdn-duplicates-report.csv
git commit -m "chore: refresh the CDN inventory report"
git push -u origin HEAD
gh pr create --fill
```

`main` is protected, so the refreshed report lands through a pull request like anything else. The
PR diff is the useful artifact: added rows are what became unaccounted for since the last audit,
removed rows are what somebody fixed.

## Schema: data/cdn-duplicates-report.csv

| Field | Description |
|---|---|
| `checksum` | SHA256 from the storage listing, uppercase hex. Rows sharing one are the same bytes. |
| `path` | The storage key of this copy. |
| `bytes` | Stored size. |
| `species_slug` | The species the path claims, if any — often the old slug of a rename. |
| `accounted_by` | What explains this copy: `photo`, `tiles`, `key-image`, … or `unaccounted`. |
| `note` | `superseded` when `data/cdn-retired-images.csv` already records this copy. |

## Schema: data/cdn-inventory-report.csv

| Field | Description |
|---|---|
| `path` | The storage key, or a tile-pyramid directory with a trailing slash. |
| `unit` | `object`, or `tile-pyramid` for a pyramid counted whole. |
| `bytes` | Stored size. Blank for a pyramid (its contents were never listed) and for a `missing-*` finding. |
| `species_slug` | The species the path claims to belong to, if any. It is often a slug that no longer exists — that is the point. |
| `shape` | The finding's kind — the table in step 2. |
| `detail` | Why it is a finding, and what the catalogue says about the species. |

## Troubleshooting

**`BUNNY_STORAGE_PASSWORD is required`** — the storage API will not list without it. `USE_CACHE=1`
works without it once you have run the audit at least once.

**The run aborts on `_site-manifest.json`** — that file is how the audit knows which site paths are
current. Without it every page in the zone would look like an orphan, so the run stops instead of
writing a report full of false findings. Check the zone is reachable and try again.

**A whole asset class suddenly appears as findings** — the layout of that class changed, or the file
that accounts for it was emptied. Check the source file named in the `detail` column before
believing the report.

**The run is slow** — it is thousands of listings. `LIST_CONCURRENCY=24` roughly halves it; go higher
and bunny.net starts refusing.
