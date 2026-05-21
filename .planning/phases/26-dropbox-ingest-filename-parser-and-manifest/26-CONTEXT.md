# Phase 26: Dropbox Ingest, Filename Parser, and Manifest - Context

**Gathered:** 2026-05-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 26 produces a **metadata-only** ingest pass over the v2.2 Dropbox shared folder. It does NOT download any TIFF bytes. The deliverable is:

1. A committed `data/species-photos-manifest.csv` with one row per file in the Dropbox root, classified against current `data/species.csv` into match buckets (clean / slug / genus-only / likely-synonym / provisional / unparseable), populated with the schema downstream phases will mutate.
2. A small, resumable CLI for running and re-running the listing+classification pass on this machine (`maderas.amandrai.net`), driven by env-var-supplied `DROPBOX_TOKEN`.
3. The operability harness (per-stage logs, retry-with-backoff on Dropbox 429/5xx, resume-from-interruption via the manifest as recovery state) — built here so Phases 28 and 29 can reuse it.

Out of scope for Phase 26: downloading TIFF bytes, tile generation, bunny.net upload, synonym curation (Phase 27), Eleventy build integration (Phase 30), viewer changes (Phase 31). The `*custom/` Dropbox subfolder is deliberately untouched.

</domain>

<decisions>
## Implementation Decisions

### Manifest format & location
- **D-01:** Manifest is **in-repo, committed**, at `data/species-photos-manifest.csv` — same flat-file ethos as `species.csv`, `images.csv`, `glossary.csv`. Non-technical curators can open it in a spreadsheet; PR history shows curation decisions over time.
- **D-02:** Format is **CSV**, not JSON / NDJSON / SQLite. csv-parse / csv-stringify are already in `dependencies`. Status updates from Phases 28/29 will require rewrites — that's fine at ~5,000 rows / ~1.5 MB.
- **D-03:** Manifest scope is **high-res only**. The existing `data/images.csv` is untouched; Phase 30 reads both files and decides per-species which to render. Unifying the two is explicitly NOT a v2.2 goal.
- **D-04:** Row identity is **`content_hash` alone** (Dropbox's deterministic hash). Same file at two paths → one row. Re-shot photos at the same filename create a NEW row, leaving the curator to decide which to publish.
- **D-05 (manifest schema):** Columns, per the spike findings reference:
  ```
  content_hash, dropbox_path, size_bytes, server_modified,
  filename_raw, binomial_raw, specimen_id, view,
  binomial_resolved, species_slug, match_bucket, status, last_error
  ```
  Phase 26 populates everything except `last_error` (which only fills in on retry failures). `status` for every Phase 26 row is `discovered`.

### Cache lifecycle (cross-phase decision, locked here)
- **D-06:** Pipeline-wide cache strategy is **stream**: download → tile → upload → delete original AND delete tile dir, per-image. There is no other choice — this server has 48 GB free disk, the source is 204 GB, the tile output is ~1 TB.
- **D-07:** Phase 26 itself is **metadata-only**. It does not touch the Dropbox `/2/files/download` endpoint at all; only `/2/files/list_folder` + `/2/files/list_folder/continue`. The `files.metadata.read` scope is sufficient for the whole phase; `sharing.read` / `files.content.read` scopes are a Phase 28 concern.
- **D-08:** Target server is **this machine** (`maderas.amandrai.net`): Ubuntu, 79 GB total disk / 48 GB free, 3.8 GiB RAM, 2 cores, Node v24.12.0 (matches `.nvmrc`), `libvips` NOT yet installed. The exploration note's "datacenter server" framing was a placeholder; the real constraints belong here.
- **D-09:** Run shape is **multi-day continuous in tmux**. The pipeline (whole milestone, not just Phase 26) is built to be killed and restarted; manifest is the recovery state. No `--max-images` or `--genus X` flags in v2.2.
- **D-10:** Secrets pass via **env vars at invocation**:
  ```
  DROPBOX_TOKEN=sl... node scripts/ingest-photos.js
  BUNNY_API_KEY=xxx node scripts/upload-tiles.js  # Phase 29
  ```
  Mirrors existing `BUNNY_API_KEY=xxx node scripts/upload-plates.js` convention from Phase 18. No `.env` file, no XDG config, no dotenv dep.

### `*custom/` folder + investigation queue surface
- **D-11:** The Dropbox `*custom/` subfolder is **not listed by Phase 26**. The phase's contributor-doc deliverable mentions it as a deferred item ("inspect contents before deciding how to ingest"); no manifest rows are written for its contents.
- **D-12:** The "needs investigation" view is the **manifest itself, re-sorted**. A separate command (`npm run photos:investigate` or equivalent — exact CLI shape is Claude's discretion under D-13) rewrites `species-photos-manifest.csv` with the needs-investigation buckets (`genus-only`, `likely-synonym`, `provisional`, `unparseable`) at the top, ordered by binomial frequency. Curator opens the file in a spreadsheet and works top-down. No separate markdown report, no CLI query interface.

### Claude's Discretion
- **D-13 (operator CLI shape):** User deferred to me. Follow the existing per-stage script convention in `scripts/`: `scripts/ingest-photos.js` (Phase 26, listing+classification), `scripts/download-and-tile.js` (Phase 28), `scripts/upload-tiles.js` (Phase 29), all invoked via `npm run` aliases. Each script is self-contained, env-var driven, `DRY_RUN=1` supported, prints clear progress. Subcommands inside one script — rejected; the project pattern is one script per stage.
- **D-14 (filename-parser internals):** The spike's `parse-classify.mjs` is the working reference. Phase 26 ports it into `scripts/lib/parse-photo-filename.js` (or similar shared location), applies the three fixes the spike called out (drop ≥3-char epithet rule, allow hyphenated epithets, route provisional IDs to their own bucket), and adds unit tests for every audit edge case (`v-alba`, `c-nigrum`, `n sp`, `nr harrisonata`, `Trichoplusia ni`, `Rachiplusia ou`, `Paraseptis-adnixa-B-D.tif`, `OSAC_…`, `WWUC*`).
- **D-15 (logging/operability harness):** Reuse the `upload-plates.js` append-only progress-file pattern conceptually, but the manifest CSV replaces `.upload-plates-progress` (since the manifest already carries `status` + `last_error`). Log format: one line per stage transition, with timestamp, content_hash, action, outcome. Retry: exponential backoff (2s/4s/8s/16s/32s capped) on Dropbox 429/5xx; mark `status: failed` + populate `last_error` and move on, never crash.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Spike findings (the implementation blueprint)
- `.claude/skills/spike-findings-pnwmoths/SKILL.md` — auto-loaded skill; locks the v2.2 requirements
- `.claude/skills/spike-findings-pnwmoths/references/dropbox-ingest-and-filename-parsing.md` — full how-to: Dropbox API call shape, parser approach with code patterns, match cascade, manifest schema, what to avoid
- `.planning/spikes/001-dropbox-photo-audit/REPORT.md` — VALIDATED audit; quotes the 5,000-file bucket distribution, top unmatched binomials, parser edge cases, unparseable case-by-case
- `.planning/spikes/001-dropbox-photo-audit/parse-classify.mjs` — working parser reference (Node built-ins only); port and extend
- `.planning/spikes/001-dropbox-photo-audit/list-dropbox.mjs` — working `list_folder` + `list_folder/continue` paginated loop (no SDK, just `fetch`); port directly
- `.planning/spikes/001-dropbox-photo-audit/outputs/classifications.json` — committed; the top-N unmatched binomials and unknown genera live here, ready to seed `data/species-synonyms.csv` in Phase 27

### Milestone scope
- `.planning/seeds/milestone-v2.2-high-res-photos.md` — user-confirmed v2.2 scope; phase A–F shape
- `.planning/notes/high-res-species-photos-exploration.md` — locked architectural decisions (manifest as source of truth, Dropbox-is-superset replace-on-match policy, flat folder + encoded filenames, OSD replaces lightbox)
- `.planning/REQUIREMENTS.md` — Phase 26 owns INGEST-01..05, OPS-01..03 (8 reqs); see Traceability table
- `.planning/ROADMAP.md` §"Phase 26" — goal + 7 success criteria; the success criteria reference the audit's 77.5% / genus-only / etc. classification distribution as a manifest-level verification

### Project context
- `.planning/PROJECT.md` — Current Milestone section + Key Decisions table (the streaming-readline / module-level-env-constant / CDN_BASE_URL-public-constant patterns all carry forward)
- `data/species.csv` — 1,348 records; the classification step joins against `lower(genus || ' ' || species)` and `lower(genus || '-' || species)`
- `data/images.csv` — existing low-res photo schema; Phase 26 does NOT write here; Phase 30 reads both files

### Prior art to reuse (Phase 13, Phase 17, Phase 18)
- `scripts/migrate-images.js` — Phase 13 HTTP PUT pattern; `BUNNY_API_KEY`, `BUNNY_STORAGE_HOST`, `BUNNY_ZONE` env var shape; `DRY_RUN=1` convention; module-level env constants
- `scripts/upload-plates.js` — Phase 18 resumable bulk upload; append-only progress file (`.upload-plates-progress`); 5-attempt exponential-ish backoff with API key redaction in error messages; redact-the-key pattern is mandatory
- `scripts/migrate-species.js` — Phase 17 streaming readline parser for huge inputs; pattern for "this file is too big to load into memory"
- `package.json` — `csv-parse@^6.2.1`, `csv-stringify@^6.7.0` already deps (use for manifest read/write); `openseadragon@^6.0.2` already dep (Phase 31)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `csv-parse/sync` + `csv-stringify/sync` (already in dependencies) — exactly the right API for reading + writing `species-photos-manifest.csv`. No streaming needed at ~5,000 rows.
- `execFileSync('curl', ...)` pattern from `upload-plates.js` lines 96–119 — applies wholesale to a Dropbox HTTPS download in Phase 28 (substitute Authorization header for `AccessKey`); not used in Phase 26 since this phase is metadata-only.
- The append-only `.upload-plates-progress` pattern (`upload-plates.js` lines 78–84, 120) is the conceptual ancestor of the manifest's `status` column; the manifest just lifts that pattern into a queryable shape.
- `parseFloat`/`Number()` coercion patterns from `migrate-species.js` already handle the "DuckDB stringly-typed input → JS number" edge cases the v1.4 phases hit.

### Established Patterns
- **Module-level constants for env-driven config:** every `scripts/` file uses `const FOO = process.env.FOO ?? 'default';` at module top. Mirror exactly.
- **API key redaction in error messages:** `err.message.replace(new RegExp(BUNNY_API_KEY, 'g'), '[REDACTED]')` in `upload-plates.js:112`. Apply the same redaction to `DROPBOX_TOKEN` in any error path.
- **DRY_RUN=1 prints first 5 URLs/items and exits:** see `upload-plates.js:67–75`. Replicate for `ingest-photos.js` (print first 5 list_folder entries).
- **Filenames with spaces, Django-style:** `data/images.csv` already carries `images.csv` filenames with spaces (urlencode filter handles it in templates); Dropbox TIFF filenames have spaces too (e.g., `Abagrotis apposita-A-D.tif`); no surprise here.
- **Flat-file ethos:** `.planning/PROJECT.md` Key Decisions table — flat files over headless CMS; LLM-editable. Manifest CSV fits.

### Integration Points
- **Phase 27 (next) reads the manifest and writes back synonym-resolved rows** — Phase 26 just needs to leave the file in a state Phase 27 can extend non-destructively. Sort order is "buckets-of-interest first, frequency-ordered" so Phase 27's curator workflow naturally targets the highest-impact rows.
- **Phase 28 reads `status: discovered` rows, downloads the Dropbox file via `content_hash`, advances to `status: tiled`** — Phase 26 must ensure `content_hash` is present and unique on every row.
- **Phase 30 (Eleventy build integration) reads `status: uploaded` rows** — Phase 26 doesn't write these but defines the schema they'll inhabit.
- **`_instructions/` directory** — existing pattern for LLM-actionable operator docs (`UPLOADING_IMAGES.md` from Phase 13). Phase 26 should add `_instructions/INGESTING_HIGH_RES_PHOTOS.md` covering: Dropbox app + token setup, running `ingest-photos.js` in tmux, what the manifest CSV columns mean, what to do when an `*custom/` decision is needed.

</code_context>

<specifics>
## Specific Ideas

- The spike audit's `outputs/classifications.json` already contains the top-N unmatched binomials and unknown genera. Phase 27 will seed `data/species-synonyms.csv` from this; Phase 26's investigation-queue sort order should match the same frequency ordering so the curator sees the same "Grammia → Apantesis", "Smerinthus ophthalmica", "Eupithecia" rows at the top of the CSV that the spike already flagged.
- The pre-existing `scripts/upload-plates.js` redacts `BUNNY_API_KEY` in error messages (line 112) — `ingest-photos.js` must do the same for `DROPBOX_TOKEN`. This is a hard rule, not a nice-to-have.
- `data/species.csv` slug joining uses `lower(genus || '-' || species)` (per the PROJECT.md key-decisions table, "DB genus+species slug for records.csv") — match cascade lookups should normalize the same way to avoid the v1.4-Phase-17 trap of image-derived vs. DB-derived slugs differing for ~326 reclassified species.

</specifics>

<deferred>
## Deferred Ideas

- **`*custom/` Dropbox subfolder handling** — Phase 26 leaves it untouched. A future task (post-v2.2, or a mid-milestone seed) should inspect its contents and decide whether it deserves its own ingest pass, a separate manifest, or a per-file curator import workflow.
- **Genus-batched / `--max-images` / `--genus X` runs** — rejected for v2.2 to keep the operator surface minimal. If a curator wants to prioritize Saturniidae over Geometridae, that's a future CLI addition.
- **Unifying `images.csv` + `species-photos-manifest.csv`** — explicitly deferred; revisit post-v2.2 if the two-file split causes friction in Phase 30 or in template logic.
- **External taxonomic API auto-resolution (GBIF/ITIS)** — already deferred at the milestone level; restating here so Phase 26 doesn't sneak it back in via "small helper to look up unknown binomials".
- **A dotenv-based secrets path** — env-vars-at-invocation is the chosen surface; a `.env` file or XDG config is a future ergonomic improvement, not a v2.2 requirement.

</deferred>

---

*Phase: 26-Dropbox Ingest, Filename Parser, and Manifest*
*Context gathered: 2026-05-21*
