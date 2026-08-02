# Task: Ingest High-Res Species Photos

## What This Changes

- `data/species-photos-manifest.csv` — new on first run; updated in place on every subsequent run
- Dropbox API — read-only metadata via `/2/files/list_folder` (and `/list_folder/continue` for pagination); no file bytes downloaded at this stage
- **No** bunny.net writes, **no** CDN cache changes, **no** Eleventy build changes. This step only writes down what exists in Dropbox; tiling, uploading and wiring the photos into the site come later ([TILING_HIGH_RES_PHOTOS.md](TILING_HIGH_RES_PHOTOS.md), [UPLOADING_TILES.md](UPLOADING_TILES.md))

## Before You Start

You will need:
- **Dropbox app access token** with the `files.metadata.read` scope — generate one yourself, see Step 1 below. Tokens start with `sl.` and are short-lived (~4 hours unless refreshed)
- **Node 24** — matches `.nvmrc`. Verify with `node --version`
- **tmux** (or `screen`) — the full run takes 5–15 minutes against the audit corpus, and tmux keeps it alive across laptop sleep and an accidentally closed terminal
- **No tiling or upload run in progress.** All three stages rewrite `data/species-photos-manifest.csv` in full, so the one started second refuses to run and names the process holding the lock — including the quick `RESORT_ONLY` re-sort in Step 7 ([ADR 0025](../docs/adr/0025-manifest-locks.md)). A lock left behind by a killed run is taken over automatically; never delete `var/species-photos-manifest.lock` by hand

No file is read from disk for the token. Pass it on the invocation line (see Step 3). The script redacts the token from every error message before logging.

## Steps

### 1. Create a Dropbox app and access token

Go to <https://www.dropbox.com/developers/apps> → **Create app**:

- API: Scoped access
- Access type: Full Dropbox (or App folder — either works for `shared_link` listing)
- Name: anything unique to your account

On the new app's page:

- **Permissions** tab → check `files.metadata.read` → **Submit**
- **Settings** tab → scroll to "OAuth 2" → **Generated access token** → click **Generate**

The token starts with `sl.`. Copy it. Never commit it, paste it into chat, or store it in a file.

### 2. Verify the script loads (dry-run)

```bash
DRY_RUN=1 DROPBOX_TOKEN=sl.your-token-here npm run photos:ingest
```

Expected: prints the first 5 entries from the v2.2 shared folder (path, size, content_hash) and exits 0 without writing the manifest. If you see `401 Unauthorized`, the token is wrong or expired; if you see `403`, the scope is missing.

### 3. Run the full ingest in tmux

```bash
tmux new -s ingest
DROPBOX_TOKEN=sl.your-token-here npm run photos:ingest
```

Detach with `Ctrl-b d`. Reattach with `tmux attach -t ingest`. The job runs for about 5–15 minutes against the ~5,000-file audit corpus (metadata only, so no bytes transferred). It runs on your own laptop — there is no build or data server ([ADR 0001](../docs/adr/0001-static-no-server.md)).

### 4. Read the log output

Per-stage lines look like:

```
2026-05-22T12:34:56.789Z abc123def456 classify         clean-match  abagrotis apposita
```

Format: `<ISO timestamp> <12-char content_hash prefix> <action> <outcome> [extra]`. Transient Dropbox errors emit `[ingest-photos] transient error on <label> (attempt N/5) — retrying in Ns` and the script retries with 2s / 4s / 8s / 16s / 32s backoff. The final summary line breaks down the row count per `match_bucket`.

### 5. Interpret the manifest columns

Open `data/species-photos-manifest.csv` in a spreadsheet. The 13-column schema is locked —
every later step in the photo pipeline reads these columns by name.

#### Schema: data/species-photos-manifest.csv

| Column | Meaning |
|---|---|
| `content_hash` | Dropbox's deterministic file hash; this is the row identity |
| `dropbox_path` | Full path inside the shared folder |
| `size_bytes` | File size in bytes |
| `server_modified` | ISO timestamp from Dropbox |
| `filename_raw` | The filename exactly as Dropbox returned it |
| `binomial_raw` | What the parser extracted (e.g. `abagrotis apposita`) |
| `specimen_id` | `A`/`B`/… or institutional accession like `OSAC_…` / `WWUC…` |
| `view` | `D` (dorsal) or `V` (ventral) |
| `binomial_resolved` | Matched species binomial (empty unless `clean-match`) |
| `species_slug` | Matched species slug (empty unless `clean-match`) |
| `match_bucket` | `clean-match` / `slug-match` / `resolved-via-synonym` / `genus-only` / `likely-synonym` / `provisional` / `unparseable`. The first three carry a resolved `species_slug` and are the only ones [TILING_HIGH_RES_PHOTOS.md](TILING_HIGH_RES_PHOTOS.md) will tile; the rest need [curation](CURATING_SPECIES_SYNONYMS.md) first. `resolved-via-synonym` is written by the synonym pre-pass, not by the first ingest |
| `status` | `discovered` from this stage; later phases advance it |
| `last_error` | Empty on success; populated only on retry-exhausted Dropbox errors |

### 6. Resume after interruption

Kill the tmux session, restart it with the same command. The script reads the existing manifest, builds a set of seen `content_hash` values, and skips any file already recorded. Each skipped file logs one line ending in `skip already-in-manifest`. The row count is unchanged after a re-run with no new Dropbox files.

### 7. Re-sort the manifest for curator review

```bash
npm run photos:investigate
```

This re-runs the script in re-sort-only mode — no Dropbox calls. It reads the manifest, moves all `genus-only` / `likely-synonym` / `provisional` / `unparseable` rows to the top (ordered by binomial frequency, most common first), and writes it back. Open the file in a spreadsheet and work top-down; [CURATING_SPECIES_SYNONYMS.md](CURATING_SPECIES_SYNONYMS.md) uses the surfaced rows to seed `data/species-synonyms.csv`.

### 8. The `*custom/` Dropbox subfolder

The non-recursive listing emits a single `folder` entry for `*custom/` and the script logs it as `folder-skip`. Nothing inside it has ever been ingested. Deciding what is in there and whether it belongs in the corpus is open work — file a GitHub issue rather than reaching for recursion here, which shared-link listing forbids in any case (see the `recursive: true` entry below).

## Verify

In the spreadsheet:

- Row count is around 5,000 (5,000 data rows + 1 header)
- Header line matches the 13 columns above exactly, in that order
- `match_bucket` distribution is roughly: `clean-match` ~77.5%, `genus-only` ~12.4%, `likely-synonym` ~9.7%, `provisional` ≥6 rows (from the parser's provisional bucket), `unparseable` ≤14 rows

Tail the log for the final summary line; the counts should add up to the total file count.

## When Things Go Wrong

- **`Manifest is locked by pid NNNN`** — a tiling or upload run is in progress and would have its status changes discarded by this one. Wait for that pid to finish, or stop it; a lock whose holder is already dead is taken over on the next run without any manual cleanup.
- **Dropbox 401 / 403** — token expired or wrong scope. Regenerate at <https://www.dropbox.com/developers/apps> with the `files.metadata.read` scope checked.
- **Dropbox 429** (rate limit) — the script retries up to 5 times with 2s / 4s / 8s / 16s / 32s backoff. If still failing, the page errors out and the partial manifest is preserved; rerun later.
- **`recursive: true` not allowed** — should never happen. The script hardcodes `recursive: false` because shared-link listing forbids recursion. If you see this, something has been edited.
- **Token substring (`sl.…`) visible in any log line or in the committed manifest** — should never happen. The script redacts the token from every error message before logging. If you see a literal token substring, file a bug; the redaction broke.
