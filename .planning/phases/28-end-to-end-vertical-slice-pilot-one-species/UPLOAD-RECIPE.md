# Task: Upload pilot species tile pyramids to bunny.net Storage

Operator-side runbook for Phase 28 Plan 03 Task 2. Uploads the local DZI tile pyramids produced in Plan 01 to bunny.net Storage, verifies CDN reachability, and records the CORS header status that Plan 05 needs for PILOT-LESSONS.md.

## What This Changes

- **bunny.net Storage Zone** (`pnwmoths`): new files at `species-tiles/{slug}/{specimen_id}-{view}/...`
- **bunny.net Pull Zone** (`pnwmoths.b-cdn.net`): new CDN URLs immediately reachable after upload
- **No committed files.** No Eleventy build changes. No edits to `data/species-photos.json` (that's Plan 05).

## Prerequisites

- **`BUNNY_API_KEY` exported in your shell** — the Storage Zone password from bunny.net dashboard → Storage → pnwmoths → FTP & API Access. **Never commit it, never paste it into chat or log output, never echo it into a file.**
  ```sh
  export BUNNY_API_KEY="your-key-here"
  echo ${BUNNY_API_KEY:+set}   # prints "set" without revealing the key
  ```
- **Local tile pyramids on disk** from Plan 01: `{prefix}.dzi` and `{prefix}_files/` for each (specimen_id, view) pair of the pilot species.
- **Pilot species slug** (lowercase, hyphenated) — e.g. `abagrotis-apposita`.

## Steps

**1. Set environment variables.**

```sh
export BUNNY_STORAGE_HOST="la.storage.bunnycdn.com"
export BUNNY_ZONE="pnwmoths"
SLUG="abagrotis-apposita"   # replace with your pilot slug (lowercase)
LOCAL_TILES="/tmp/tiles"    # replace with wherever Plan 01 wrote the pyramids
```

**2. Upload each (specimen_id, view) pair.**

For each pair, upload the `.dzi` descriptor, then every file under `{prefix}_files/` recursively.

The storage path pattern is `species-tiles/{slug}/{specimen_id}-{view}/{file}` — **no leading slash, no `pnwmoths/` prefix** (the zone name is the zone root).

Single-pair example (specimen A, dorsal view):

```sh
PREFIX="${LOCAL_TILES}/${SLUG}/A-D"    # adjust case to match your local dir
REMOTE_PREFIX="species-tiles/${SLUG}/A-D"

# Upload the .dzi descriptor
curl -s -S -f \
  -X PUT \
  -H "AccessKey: ${BUNNY_API_KEY}" \
  -H "Content-Type: application/octet-stream" \
  --data-binary "@${PREFIX}.dzi" \
  "https://${BUNNY_STORAGE_HOST}/${BUNNY_ZONE}/${REMOTE_PREFIX}/A-D.dzi"

# Upload every tile file under _files/
find "${PREFIX}_files" -type f | while read -r localFile; do
  rel="${localFile#${PREFIX}_files/}"
  curl -s -S -f \
    -X PUT \
    -H "AccessKey: ${BUNNY_API_KEY}" \
    -H "Content-Type: application/octet-stream" \
    --data-binary "@${localFile}" \
    "https://${BUNNY_STORAGE_HOST}/${BUNNY_ZONE}/${REMOTE_PREFIX}/A-D_files/${rel}"
done
```

Loop over all pairs of the pilot species (adapt PAIR list to match your manifest rows):

```sh
for PAIR in A-D A-V; do
  SPECIMEN="${PAIR%-*}"   # A
  VIEW="${PAIR##*-}"      # D or V
  PREFIX="${LOCAL_TILES}/${SLUG}/${PAIR}"
  REMOTE_PREFIX="species-tiles/${SLUG}/${PAIR}"

  # .dzi descriptor
  curl -s -S -f \
    -X PUT \
    -H "AccessKey: ${BUNNY_API_KEY}" \
    -H "Content-Type: application/octet-stream" \
    --data-binary "@${PREFIX}.dzi" \
    "https://${BUNNY_STORAGE_HOST}/${BUNNY_ZONE}/${REMOTE_PREFIX}/${PAIR}.dzi"

  # tile pyramid
  find "${PREFIX}_files" -type f | while read -r localFile; do
    rel="${localFile#${PREFIX}_files/}"
    curl -s -S -f \
      -X PUT \
      -H "AccessKey: ${BUNNY_API_KEY}" \
      -H "Content-Type: application/octet-stream" \
      --data-binary "@${localFile}" \
      "https://${BUNNY_STORAGE_HOST}/${BUNNY_ZONE}/${REMOTE_PREFIX}/${PAIR}_files/${rel}"
  done

  echo "Uploaded ${PAIR}"
done
```

After the loop, count uploaded files for your report:

```sh
for PAIR in A-D A-V; do
  PREFIX="${LOCAL_TILES}/${SLUG}/${PAIR}"
  echo "${PAIR}: $(find "${PREFIX}_files" -type f | wc -l) tiles + 1 .dzi"
done
```

## Verify (CDN reachability)

For each pair, confirm three URLs return HTTP 200 via the Pull Zone (NOT the storage host directly):

```sh
SLUG="abagrotis-apposita"
for PAIR in A-D A-V; do
  BASE="https://pnwmoths.b-cdn.net/species-tiles/${SLUG}/${PAIR}"
  echo "--- ${PAIR} ---"
  curl -sI "${BASE}/${PAIR}.dzi" | head -1
  curl -sI "${BASE}/${PAIR}_files/0/0_0.webp" | head -1
done
```

Expected: `HTTP/2 200` for each URL. If you see 404 on the Pull Zone after a successful PUT, the storage path is wrong — see "When Things Go Wrong" below.

## Verify (CORS for .dzi XHR)

OSD fetches the `.dzi` descriptor via XHR (not a plain `<img>` tag), so CORS headers must be present on that URL. Check both the production origin and the dev-preview origin:

```sh
DZI_URL="https://pnwmoths.b-cdn.net/species-tiles/${SLUG}/A-D/A-D.dzi"

echo "--- Production origin ---"
curl -sI -H "Origin: https://pnwmoths.b-cdn.net" "${DZI_URL}" | grep -i "access-control"

echo "--- Dev preview origin ---"
curl -sI -H "Origin: http://localhost:8080" "${DZI_URL}" | grep -i "access-control"
```

**Record the exact value** of `access-control-allow-origin` in the response (or note "absent"). This drives the Plan 05 PILOT-LESSONS.md entry on CORS (RESEARCH.md Pitfall 3). Possible outcomes:

- `access-control-allow-origin: *` — OSD will work from any origin; no Pull Zone config change needed.
- `access-control-allow-origin: https://pnwmoths.b-cdn.net` — OSD works in production; localhost dev preview will fail (XHR blocked). Plan 05 must add a Pull Zone CORS rule before the browser test.
- Header absent — OSD XHR will be blocked by the browser from any origin. Add a CORS rule in bunny.net Pull Zone settings before Plan 05.

## When Things Go Wrong

- **`curl: (22)` or HTTP 403 on PUT** — wrong or missing `BUNNY_API_KEY`. Confirm `echo ${BUNNY_API_KEY:+set}` prints `set`, then re-export the correct key.
- **HTTP 404 on PUT** — wrong storage host or zone. Confirm `BUNNY_STORAGE_HOST=la.storage.bunnycdn.com` and `BUNNY_ZONE=pnwmoths` (check bunny.net dashboard → Storage → pnwmoths → FTP & API Access for the correct host).
- **Pull Zone returns 404 even though storage PUT returned 200** — the storage path is wrong. Most common causes:
  - Leading slash in the path (the zone name `pnwmoths` is the root; never add `/pnwmoths/` or a leading `/` to the cdn path argument).
  - File uploaded to the storage host path but Pull Zone maps to a different prefix — confirm the remote path matches `species-tiles/{slug}/{pair}/...` exactly.
  - CDN propagation delay — wait 30 seconds and retry.
- **CORS header absent on `.dzi` URL** — record this in your report; Plan 05 must configure a bunny.net Pull Zone CORS rule before the browser test (`Add CORS Header` in Pull Zone → Headers settings; value: `*` or the specific origin).
- **Tile file count looks wrong** — re-run `find "${PREFIX}_files" -type f | wc -l` locally and compare to the total uploaded. Resume by re-running the loop; bunny.net overwrites existing files silently.

**Security reminder:** `BUNNY_API_KEY` must never be committed, logged, or echoed to the terminal. If an error message from `curl` might contain the key (e.g. it appears in a URL), redact it before sharing — the same pattern as `scripts/ingest-photos.js`'s `redact()` call.

## After this step

Tile pyramids are live on `https://pnwmoths.b-cdn.net/species-tiles/{slug}/...`. Next:

- **Plan 04** (running in parallel): wires OpenSeadragon into `pnwm-image-slideshow` — may already be complete by the time you finish the upload.
- **Plan 05**: hand-edits `data/species-photos.json` with the real pilot entry, opens the species page in the browser to verify OSD loads against the live CDN tiles, and captures all lessons in `PILOT-LESSONS.md`.

Report back with: (a) total files uploaded per pair; (b) `curl -I` output showing HTTP 200 for both `.dzi` and `_files/0/0_0.webp`; (c) the exact `access-control-allow-origin` value (or "absent").
