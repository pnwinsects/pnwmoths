---
spike: 001
name: dropbox-photo-audit
type: standard
validates: "Given a flat Dropbox shared folder of ~200GB of species photos, when we list the folder metadata only (no image bytes) and parse the filenames, then we can produce a quantitative parseability report (clean-match / slug-match / genus-only / likely-synonym / unparseable / non-image) sufficient to scope milestone v2.2."
verdict: VALIDATED
related: []
tags: [dropbox, ingest, milestone-v2.2, data-audit, filename-parsing]
---

# Spike 001: Dropbox photo audit

## What this validates

**Given** a flat Dropbox shared folder of ~200GB of species photos (URL with `rlkey=` share token), and the project's `data/species.csv` (1,348 current species records),
**when** we list the folder metadata via the Dropbox API (no image bytes downloaded) and parse each filename for a binomial,
**then** we can produce a quantitative parseability report — match rate, photos-per-species distribution, top unmatched binomials (synonym candidates), unknown genera, sample filenames per bucket — sufficient to scope milestone v2.2 with confidence.

The spike de-risks **filename parser feasibility** and **synonym-resolution frequency**, the two unknowns flagged in `.planning/notes/high-res-species-photos-exploration.md`.

## Research

### Dropbox API approach

Authoritative spec from `dropbox-api-spec/files.stone`:

```
struct ListFolderArg
    path PathROrId
    recursive Boolean = false
    ...
    shared_link SharedLink?
        "A shared link to list the contents of. If the link is password-protected, the password
        must be provided. If this field is present, ListFolderArg.path will be relative
        to root of the shared link. Only non-recursive mode is supported for shared link."

struct SharedLink
    url SharedLinkUrl
    password String?
```

**Confirmed:** `POST /2/files/list_folder` accepts `shared_link: {url}` with the `rlkey=` URL. Non-recursive only, which is fine because the folder is flat. Pagination via `/2/files/list_folder/continue` with `cursor`.

**Required scope:** `files.metadata.read` (minimal — no file content access needed for the audit).

### Approach comparison

| Approach | Pros | Cons | Status |
|----------|------|------|--------|
| Dropbox API + shared_link | No need to add folder to user's Dropbox; minimal scope; direct fetch with no SDK dep | Requires creating an app + token (one-time) | **Chosen** |
| rclone Dropbox remote | Reuses prior `rclone` familiarity from v1.4 | Requires "Add to Dropbox" + OAuth dance; pulls entire account context | Rejected — heavier setup, not needed for listing |
| Dropbox Node SDK | Typed client | Adds package dep for a one-off spike script | Rejected — direct fetch is fewer moving parts |

### Auth setup (one-time, ~3 minutes)

1. Open <https://www.dropbox.com/developers/apps>
2. Click **Create app**
3. Choose **Scoped access**, then **Full Dropbox** (works for shared-link calls; the app doesn't actually touch the user's own files)
4. Name it (e.g., `pnwmoths-photo-audit`); accept terms; create
5. **Permissions tab:** check `files.metadata.read`, click **Submit**
6. **Settings tab → OAuth 2 → Generated access token:** click **Generate**, copy the token
7. Export it for this shell session only: `export DROPBOX_TOKEN='sl.…'`

The token is bound to your own Dropbox account but only `files.metadata.read` is enabled — it cannot read your private files' content, only metadata. Revoke at any time from the same App Console.

## How to run

```bash
# From the project root:
export DROPBOX_TOKEN='sl.…your_generated_token…'

# Phase 1: list the shared folder (writes outputs/filenames.json, gitignored)
node .planning/spikes/001-dropbox-photo-audit/list-dropbox.mjs

# Phase 2: classify against data/species.csv (writes outputs/classifications.json)
node .planning/spikes/001-dropbox-photo-audit/parse-classify.mjs
```

Both scripts use only the Node built-ins (`node:fs/promises`, global `fetch`) — no npm install needed.

## What to expect

- Phase 1 prints per-page progress to stderr and writes `outputs/filenames.json` (gitignored — may contain a large list of paths).
- Phase 2 prints a human-readable summary to stdout and writes `outputs/classifications.json` (committed — small, the actual evidence).
- I'll consume the summary and write `REPORT.md` interpreting the numbers.

## Observability

- `outputs/filenames.json` — raw listing, every entry with name + size + server_modified + content_hash. **Gitignored** because it may be large.
- `outputs/classifications.json` — analysis output with bucket counts, top unmatched binomials, sample filenames per bucket. **Committed** as the spike's evidence.

## Investigation trail

- **Step 1 (research):** Confirmed Dropbox API supports listing a `scl/fo` shared-link folder via `/2/files/list_folder` with `shared_link` param. Only non-recursive — acceptable because folder is flat. Pagination via cursor.
- **Step 2 (build):** Wrote `list-dropbox.mjs` (paginated fetch) and `parse-classify.mjs` (binomial extraction + classification). Extraction regex: find adjacent `Capitalized + lowercase-only (≥3 char)` token pair after collapsing `_`/`-`/`.` to space. Tested mentally against existing convention `"Abagrotis apposita-A-D.jpg"` → `"abagrotis apposita"` ✓.
- **Step 3 (run):** User generated a Dropbox app token with `files.metadata.read` scope and ran both scripts. Listing returned 5,001 entries (1 folder, 5,000 files) in ~204.6 GB, single API page of 5,000 + pagination overhead. No auth errors, no rate limiting observed.
- **Step 4 (analysis):** 77.5% clean-match, 89.9% genus-or-better. Filename encoding confirmed identical to existing Phase 13 photos. Surprise: parser is **too strict on min species length** (≥3 chars) — misses real binomials like `Trichoplusia ni`, `Rachiplusia ou`. Also misses hyphenated species epithets (`Xestia c-nigrum`, `Autographa v-alba`). Both bugs cheap to fix and folded into the milestone parser as recommendations.
- **Step 5 (report):** Wrote `REPORT.md` with bucket analysis, synonym workload sizing, parser improvements, milestone-shape implications. Updated verdict to VALIDATED.

## Results

**Verdict: VALIDATED.** See [`REPORT.md`](./REPORT.md) for full analysis.

Key findings:

- **5,000 TIFFs / 204.6 GB / 100% uniform format** — no mixed extensions to handle.
- **77.5% clean species match, 89.9% reach genus level** — parseability is much better than the worst case feared during exploration.
- **93.2% of current species have at least one high-res photo** — replacement coverage is excellent.
- **Filename convention matches existing Phase 13 photos** (`Genus species-{specimen}-{view}.{ext}`) — parser is mostly a port, not a from-scratch build.
- **Unmatched workload bounded** — 22.1% of files (~1,105) collapse to an estimated 30–80 unique binomials needing curation decisions, mostly via a small synonym map (e.g., `Grammia → Apantesis`).
- **Specimen IDs** (`OSAC_…`, `WWUC*`) embedded in filenames — must be preserved in the manifest as `specimen_id`.
- **Parser bug fixes identified** — drop 3-char minimum, allow hyphenated epithets. Recovers ~6/20 unparseables.
- **A `*custom` sub-folder exists** — not enumerated by non-recursive listing; needs a separate pass before the bulk run.

Milestone v2.2 can proceed to `/gsd-new-milestone` scoping with confidence. None of the locked architectural decisions from [`../../notes/high-res-species-photos-exploration.md`](../../notes/high-res-species-photos-exploration.md) were overturned.
