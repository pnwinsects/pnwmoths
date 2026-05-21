# Dropbox ingest and filename parsing

Implementation blueprint for the v2.2 high-res species photo pipeline. Synthesized from spike 001 (VALIDATED). Read this before writing any new Dropbox-listing, image-fetching, or filename-parsing code for this project.

## Requirements

These are non-negotiable for the v2.2 build (locked during exploration; reinforced by audit findings):

- **Local manifest is the source of truth** for per-image processing status. SQLite or JSON on the processing server. Survives restarts; doubles as seed for `data/species-photos.json`.
- **Dropbox is a superset of current species.** Match → replace existing low-res photos. Unknown binomial → investigate, do not auto-drop.
- **Manifest must carry `specimen_id`** (single letter like `A`/`B` *or* institutional accession like `OSAC_0001081322`, `WWUC000000083`) and `view` (`D` dorsal | `V` ventral) per image.
- **OSD replaces the Phase 23 lightbox** (carousel unchanged) when high-res is available for a species.
- **Provisional/undescribed IDs (`n sp`, `sp`, `nr <species>`) route to a `provisional` bucket** — parser must not paper over them.
- **The `*custom/` sub-folder in the Dropbox root** is unprocessed by non-recursive listing. Inspect separately before bulk ingest.

## How to build it

### 1. List a Dropbox shared-link folder

Use the Dropbox HTTP API directly — no SDK needed. One-time setup: create a Dropbox app at <https://www.dropbox.com/developers/apps> with scope `files.metadata.read`, generate a token from the App Console (Settings tab → OAuth 2 → Generated access token), export it as `DROPBOX_TOKEN`.

**Endpoint:** `POST /2/files/list_folder`

**Body shape that works for `scl/fo` shared links with `rlkey`:**

```js
{
  path: "",
  shared_link: { url: "https://www.dropbox.com/scl/fo/.../?rlkey=..." },
  recursive: false,           // REQUIRED — shared_link mode only supports non-recursive
  limit: 2000,
  include_media_info: false,
  include_deleted: false,
  include_has_explicit_shared_members: false,
  include_mounted_folders: false,
  include_non_downloadable_files: true,
}
```

**Pagination:** when `has_more === true`, continue with `POST /2/files/list_folder/continue` and `{ cursor }`. See `sources/001-dropbox-photo-audit/list-dropbox.mjs` for the working loop (no SDK, just `fetch`).

**Per-entry metadata preserved:**
- `name` — filename (the thing the parser operates on)
- `path_display` — full path inside the shared link
- `size` — bytes (use for storage planning)
- `server_modified` — ISO timestamp (use for incremental re-listing)
- `content_hash` — Dropbox's deterministic hash (use as manifest key, idempotency check)

### 2. Parse filenames into binomials

The convention is **identical to the existing Phase 13 photos** in `data/images.csv`:

```
Genus species-{specimen}-{view}.{ext}
```

- Genus: capitalized
- species: lowercase, **≥2 chars** (real binomials include `Trichoplusia ni`, `Rachiplusia ou`)
- May contain a **hyphen inside the species epithet** (`Xestia c-nigrum`, `Autographa v-alba`)
- Genus + species may be joined with `-` instead of space (`Paraseptis-adnixa-B-D.tif`)
- specimen: single letter A/B/C/… **OR** institutional ID (`OSAC_…`, `WWUC*`) — do not assume single letter
- view: `D` | `V`

**Parser approach** (battle-tested in `sources/001-dropbox-photo-audit/parse-classify.mjs`):

1. Strip extension.
2. Replace `_`, `-`, `.` with spaces; collapse whitespace.
3. Walk tokens looking for an adjacent pair `[Capitalized] [lowercase, ≥2 chars]`.
4. Return as `${a.toLowerCase()} ${b.toLowerCase()}`.

**The spike's parser was too strict — improve it for the milestone:**

- Drop the ≥3-char min species; use ≥2.
- Allow hyphenated species epithets — match `[a-z]+(-[a-z]+)?` for the second token instead of `[a-z]+`.
- Route `n sp`, `sp`, `nr <epithet>` to a separate `provisional` bucket; don't coerce them.

### 3. Classify against current species data

Load `data/species.csv` (1,348 records as of 2026-05). Build:

- `byBinomial: Map<"genus species", record>` — for clean matches
- `bySlug: Map<"genus-species", record>` — fallback (in practice the binomial path catches everything; slug path was 0% in the spike audit)
- `genera: Set<genus>` — for genus-only fallback

**Match cascade** (in order):

1. `clean-match` — binomial in `byBinomial`
2. `slug-match` — slug in `bySlug` (kept for safety; rarely hit)
3. `genus-only` — first token in `genera` but binomial not in data
4. `likely-synonym` — neither genus nor species in current data
5. `unparseable` — couldn't extract a binomial
6. `provisional` (new) — `sp`, `n sp`, `nr <…>` patterns

### 4. Synonym map for genus reassignments

Expected match-rate lift after one curation pass: **77.5% → 95%+** (per spike audit).

Build `data/species-synonyms.csv` with columns `from_binomial, to_binomial, notes`. Seed with known cases from the audit:

| from_binomial | to_binomial | notes |
|---|---|---|
| `Grammia <species>` | `Apantesis <species>` | Genus reassignment — affects 58 files / multiple species |
| `Smerinthus ophthalmica` | (decide — may be scope-add, not synonym) | 32 files — recognized binomial absent from current data |

Top-N unmatched binomials and unknown genera are in `.planning/spikes/001-dropbox-photo-audit/outputs/classifications.json` (committed).

### 5. Manifest schema

Minimum fields needed for the v2.2 processing pipeline:

```
dropbox_path        TEXT  -- from list_folder entry.path_display
content_hash        TEXT  -- from Dropbox; idempotency key
size_bytes          INT
server_modified     TEXT (ISO timestamp)
filename_raw        TEXT
binomial_raw        TEXT  -- what the parser extracted
specimen_id         TEXT  -- "A", "B", or "OSAC_0001081322" etc.
view                TEXT  -- "D" or "V"
binomial_resolved   TEXT  -- after synonym map
species_slug        TEXT  -- "genus-species" matching data/species.csv
match_bucket        TEXT  -- clean | resolved-via-synonym | provisional | needs-curation
status              TEXT  -- discovered | downloaded | tiled | uploaded | failed | skipped-curation
last_error          TEXT
```

### 6. Reuse Phase 13/18 upload pattern

For uploading tiles to bunny.net, reuse the HTTP PUT pattern from `scripts/migrate-images.js` (Phase 13) and the per-image Zoomify tile layout from `scripts/upload-plates.js` (Phase 18). `cdnBaseUrl` is already wired in `eleventy.config.js`. Templates construct CDN URLs directly — **no `| url` filter on absolute URLs** (v1.3 carry-over decision in STATE.md).

## What to avoid

- **Don't use the Dropbox SDK** for listing — adds a package dep for a one-call API. Direct `fetch` is fewer moving parts.
- **Don't try `recursive: true` with `shared_link`** — the API spec explicitly forbids it. Traverse subfolders one at a time (only the `*custom/` folder needs this; the root is flat).
- **Don't add the shared folder to your own Dropbox** to use rclone — heavier setup, pollutes your namespace, and the API path with `shared_link` parameter avoids it entirely.
- **Don't try to auto-resolve synonyms against GBIF/ITIS/etc.** for v2.2. The unmatched binomials cluster on ~30–80 unique names — manual curation against `data/species-synonyms.csv` is faster and more reliable than wiring up an external taxonomic API.
- **Don't auto-fix the 20 unparseables programmatically before showing them to a curator.** `n sp`, `nr harrisonata` etc. contain real taxonomic information; a parser shouldn't paper over them.
- **Don't require the species epithet to be ≥3 chars.** Misses real species like `Trichoplusia ni`.
- **Don't assume specimen IDs are single letters.** Institutional accessions like `OSAC_0001081322` and `WWUC000000083` are common.
- **Don't ingest the `*custom/` sub-folder in the same pass as the flat root.** Inspect it first.

## Constraints

- **Dropbox `shared_link` mode is non-recursive only.** Hard API limitation per `dropbox-api-spec/files.stone`.
- **Token scope `files.metadata.read` is sufficient for listing.** Do not request broader scopes for the listing pass.
- **Dropbox file content download** (when implemented in phase B) needs the `sharing.read` scope (for `/sharing/get_shared_link_file`) or `files.content.read` if files are mounted in the user's Dropbox. Confirm during phase planning.
- **No password on the share** as of the audit (2026-05-21). If that changes, add `shared_link.password` to the listing call.
- **Source format is 100% TIFF.** Mean ~41 MB/file. Total 204.6 GB across 5,000 files. Tile output estimate ~1 TB on bunny.net (5x DZI expansion). Validate bunny.net storage pricing before phase A.
- **OpenSeadragon supports DZI, Zoomify, and IIIF.** Phase 18 chose Zoomify for plates; the same choice likely fits species photos (consistency + proven pattern). DZI also viable — decide during phase planning.
- **`libvips` `dzsave` operator** is the standard tile-generation tool. Supports both DZI and Zoomify layouts. Already runs comfortably on commodity hardware; no GPU needed.

## Audit numbers as of 2026-05-21

For sizing milestone v2.2 phases:

| Metric | Value |
|---|---|
| Files in Dropbox root | 5,000 (+ 1 sub-folder `*custom/`) |
| Total bytes | 204.6 GB |
| Source format | 100% `.tif` |
| Clean species match (out of 5,000) | 77.5% |
| Genus-or-better (out of 5,000) | 89.9% |
| Current species with ≥1 high-res photo | 1,257 / 1,348 (93.2%) |
| Unique binomials needing curation decisions | ~30–80 (estimated from top-N lists) |
| Median photos per matched species | 2 (D+V pair) |
| Max photos per matched species | 16 (`virbia ferruginosa`) |

## Origin

Synthesized from spike: **001-dropbox-photo-audit** (VALIDATED, 2026-05-21).

Source files preserved in: [`sources/001-dropbox-photo-audit/`](../sources/001-dropbox-photo-audit/)

- `list-dropbox.mjs` — paginated Dropbox listing via `shared_link` parameter
- `parse-classify.mjs` — binomial extraction + classification against `data/species.csv`
- `README.md` — spike's own research notes and investigation trail
- `REPORT.md` — full parseability analysis with samples
