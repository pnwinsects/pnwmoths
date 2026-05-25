# Phase 26: Dropbox Ingest, Filename Parser, and Manifest - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-21
**Phase:** 26-Dropbox Ingest, Filename Parser, and Manifest
**Areas discussed:** Manifest format & location, Cache lifecycle, `*custom/` folder + investigation queue surface

---

## Manifest format & location

### Q1 — Where should the manifest physically live?

| Option | Description | Selected |
|--------|-------------|----------|
| In-repo, committed | Flat file under `data/`, alongside `species.csv` and `images.csv`. Eleventy build sees it directly; curator PR-edits visible in git history. | ✓ |
| Server-only (gitignored) | Lives only on processing server; Phase 30 derives a JSON export. Keeps git clean but adds a server-export step. | |
| Both — server authoritative, repo carries export | SQLite on server + CSV export in repo. Most flexible but "which is canonical?" friction. | |

**User's choice:** In-repo, committed.
**Notes:** Aligns with project flat-file ethos. PR-reviewable curation decisions over time was the deciding factor.

### Q2 — Given in-repo commitment, what format?

| Option | Description | Selected |
|--------|-------------|----------|
| JSON | Single file, full rewrite per update. Diffable, ~1.5 MB at 5,000 rows. | |
| NDJSON | Append-only, mirrors `.upload-plates-progress`. Status updates require compaction. | |
| CSV | Same pattern as existing `data/*.csv` files. Spreadsheet-editable; csv-parse/csv-stringify already in deps. | ✓ |
| SQLite | Binary blob in PRs (unreviewable). Adds DB dep just for the manifest. | |

**User's choice:** CSV.
**Notes:** Recommended option — matches project ethos and existing tooling. No discussion needed.

### Q3 — Should this manifest also represent existing low-res photos?

| Option | Description | Selected |
|--------|-------------|----------|
| High-res only | Manifest is new high-res rows only. `images.csv` untouched. Phase 30 merges both at build time. | ✓ |
| Unified — manifest replaces images.csv | Migrate `images.csv` rows; add `source:` column. Bigger blast radius this phase. | |
| High-res only now; revisit post-v2.2 | Same as option 1, with explicit future-seed deferral. | |

**User's choice:** High-res only.
**Notes:** Avoids breaking glossary photo build and similar-species rendering (Phase 25 just shipped). Unification deferred.

### Q4 — Manifest row identity — what's the unique key?

| Option | Description | Selected |
|--------|-------------|----------|
| `content_hash` alone | Dropbox's deterministic hash. Path moves don't create orphans; identical re-uploads dedupe. | ✓ |
| `dropbox_path` alone | Human-readable key. File moves create orphans; re-uploads silently mutate identity. | |
| Composite (path, hash) | Most pedantic. Doubles lookup work. | |

**User's choice:** `content_hash` alone.

---

## Cache lifecycle

### Q1 — How should the processing server handle the 204 GB of source TIFFs?

| Option | Description | Selected |
|--------|-------------|----------|
| Stream: download → tile → upload → delete | ~50 MB working set per image. Fits a small box. Re-tiling requires re-download. | ✓ |
| Stage all originals first, tile second, upload third | Clean batch per phase; needs 250 GB+ disk. | |
| Stream but retain originals until end-of-run | Lets curator re-tile without re-download; still needs 250 GB+ disk. | |

**User's choice:** Stream mode.
**Notes:** Forced choice once server constraints surfaced (48 GB free disk).

### Q2 — What does Phase 26 actually download?

| Option | Description | Selected |
|--------|-------------|----------|
| Metadata only — no TIFF downloads in Phase 26 | `list_folder` only. Manifest rows at `status: discovered`. Phase 28 downloads bytes. | ✓ |
| Download + tile + upload happen here | Collapses Phases 26–29. Spike argues against. | |
| Metadata + sample download for parser validation | Pulls 5–10 TIFFs to prove auth scopes for download too. | |

**User's choice:** Metadata only.
**Notes:** Cleanly separates listing/classification from byte-level processing. Phase 26 is fast (minutes); Phase 28 handles the multi-day work.

### Q3 — Target datacenter server?

| Option | Description | Selected |
|--------|-------------|----------|
| Produce a hardware spec; operator picks | Generic `_instructions/` doc; operator provisions. | |
| Specific server already; bake constraints in | Tell me the box; thread its limits into manifest/retry/log format. | ✓ |
| Run it on my laptop instead | Revisits the exploration baseline. | |

**User's choice:** Specific server.
**Notes:** "This server" = this machine (`maderas.amandrai.net`). Ubuntu, 79 GB disk / 48 GB free, 3.8 GiB RAM, 2 cores, Node v24.12.0, libvips NOT installed. This is a meaningful constraint shift from the exploration note's "datacenter server" framing — codified in CONTEXT.md D-08.

### Q4 — Multi-day run shape?

| Option | Description | Selected |
|--------|-------------|----------|
| Multi-day continuous in tmux | Kick off once; let it grind. | ✓ |
| Chunked nightly runs (--max-images N) | More operator touches; predictable footprint. | |
| Genus-batched runs | Useful for early UX validation; more CLI complexity. | |

**User's choice:** Multi-day continuous in tmux. ("yes, that's why you're running in tmux")
**Notes:** No `--max-images` or `--genus X` flags for v2.2. Tmux + manifest-as-recovery-state is the operability story.

### Q5 — Where should secrets come from at runtime?

| Option | Description | Selected |
|--------|-------------|----------|
| Env vars at invocation | `DROPBOX_TOKEN=... npm run ingest-photos`. Matches existing `BUNNY_API_KEY=... node scripts/upload-plates.js`. | ✓ |
| Gitignored `.env` file | One-time setup; adds dotenv dep. | |
| `~/.config/pnwmoths/secrets.json` | XDG config; less discoverable. | |

**User's choice:** Env vars at invocation.
**Notes:** Mirrors Phase 18's pattern. Mandatory: redact tokens in error messages (same as `upload-plates.js:112`).

---

## `*custom/` folder + investigation queue surface

### Q1 — How should Phase 26 treat the `*custom/` subfolder?

| Option | Description | Selected |
|--------|-------------|----------|
| Don't list it; surface as deferred item | Phase 26 lists only flat root (5,000 files). `*custom/` gets a deferred-ideas entry. | ✓ |
| List into manifest with `match_bucket: skipped-custom-folder` | Recurse one level; mark rows skipped. Visible but inert. | |
| Inspect manually now and decide together | I list contents and report back. | |

**User's choice:** Don't list; defer.
**Notes:** Keeps Phase 26 scope tight. `*custom/` becomes a post-v2.2 decision point.

### Q2 — How should the curator read the "needs investigation" queue?

| Option | Description | Selected |
|--------|-------------|----------|
| Sort the CSV by bucket + frequency; curator opens it in a spreadsheet | The file IS the queue. Zero new surface. | ✓ |
| Generate a markdown report in `.planning/notes/` | Easy to share/discuss; derived artifact that can go stale. | |
| Simple CLI: `npm run photos:investigate -- --bucket X --top N` | Flexible filtering; another surface to design and document. | |

**User's choice:** Sort the CSV.
**Notes:** Matches the project ethos — flat files are the source of truth; tooling is light.

---

## Claude's Discretion

- **Operator CLI shape** (D-13 in CONTEXT.md) — user deferred during initial gray-area selection. Decided: per-stage script convention matching `scripts/migrate-images.js` / `upload-plates.js`. One script per stage (`ingest-photos.js`, `download-and-tile.js`, `upload-tiles.js`), invoked via `npm run`, env-var driven, `DRY_RUN=1` supported. Rejected: subcommands inside one mega-script — not the project pattern.
- **Filename-parser internals** (D-14) — port the spike's `parse-classify.mjs` into `scripts/lib/parse-photo-filename.js`, apply the three known fixes (drop ≥3-char epithet rule, allow hyphenated epithets, route provisional IDs separately), add unit tests for every spike audit edge case.
- **Logging / operability harness** (D-15) — reuse `upload-plates.js`'s append-only progress pattern conceptually, but with the manifest's `status` + `last_error` columns replacing the standalone progress file. Exponential backoff 2s→32s on Dropbox 429/5xx. Never crash on failure; mark `status: failed` and continue.

## Deferred Ideas

- `*custom/` subfolder handling — post-v2.2 inspection task.
- Genus-batched / `--max-images` flag — rejected for v2.2; future ergonomic addition.
- Unifying `images.csv` + `species-photos-manifest.csv` — explicitly deferred; revisit if Phase 30 friction warrants.
- External taxonomic API auto-resolution (GBIF/ITIS) — already deferred at milestone level; not sneaking back in.
- Dotenv / XDG secrets path — env-vars-at-invocation suffices for v2.2.
