# Task: Run the retired legacy site locally

The old Django site at `dev.pnwmoths.biol.wwu.edu` is the reference copy of everything this
project replaced. WWU is retiring the hostname, so we keep it as a **read-only Docker bundle the
curator runs on his own machine, offline**.

This runbook has two halves. The first is what the curator does, and it is short on purpose. The
second is how you assemble or refresh the bundle he receives.

**This is a local reference tool. It is not part of the deployed site**, and it does not change
the rule that the published site has no server and no database
([ADR 0001](../docs/adr/0001-static-no-server.md)). Nothing here is reachable from the internet.

Background and rationale: [ADR 0052](../docs/adr/0052-legacy-site-local-docker.md).

## What This Changes

- **Nothing in this repository, and nothing on the live site.** The bundle runs beside them.
- **Nothing on the legacy server.** The bundle is a copy; the real database is untouched.
- **Nothing the curator does in it survives.** The admin is locked read-only, and the guard
  refuses writes rather than hiding the buttons, because an edit made here would never reach the
  live site.

## Before You Start

- **Docker Desktop**, running. Everything below is two containers.
- **About 2.6 GB of bundle**, and roughly 7 GB of disk once Docker has unpacked it.
- **The app checkout** — `pnwinsects/pnwinsects-app`, branch `docker-local-dev`. It is a separate
  repository from this one; clone it somewhere outside this worktree.
- **The media tree and the database dump.** Both come from the March server image at
  `pnwmoths_https/`. Neither is in any repository: the dump holds password hashes and
  unpublished taxa, so it goes to the curator by private cloud-storage link and nowhere else.

## Steps

### 1. What the curator does

These are the only instructions he needs, and they ship inside the bundle as `READ ME FIRST.txt`:

1. Unzip the download first, and work only in the folder that appears. Double-clicking
   **inside** the zip extracts that one file to a temp folder and leaves the site behind;
   both launchers detect that and say so rather than failing obscurely.
2. Install Docker Desktop and open it. Wait for the whale icon to settle.
3. Double-click **Start PNW Moths**. Windows may ask once whether to run a file that came
   from the internet — "Run", or "More info" → "Run anyway". Measured on a reasonably quick
   machine, the first run takes about two minutes (allow longer on a slow one, since the
   whole database is imported); afterwards it comes up in about twelve seconds.
4. Sign in when the browser opens — user name `merrill`, password `pnwmoths`.
5. Double-click **Stop PNW Moths** when finished. It takes about ten seconds and deletes
   nothing.

The site is at `http://localhost:8000`, and the record browser at
`http://localhost:8000/admin/species/speciesrecord/`.

Signing in is not optional: the legacy homepage is flagged login-required in the database, and we
left that as it was. Individual factsheets render without signing in; the homepage and the record
browser do not.

### 2. Pulling records

In the record browser, narrow the list with the filters down the right-hand side or the search
box, tick the rows wanted, then choose **Export ALL Records as CSV** and press Go.

Tell him to use that one and not the two beside it. `export_records_as_csv` filters the selection
down to records with no photograph, `export_labels_as_csv` filters it down to records that have
one, and neither says so on screen. On a hundred selected rows they return ninety-six and six.
`export_all_records_as_csv` exists because of that, and returns all of them.

### 3. Assemble the bundle

From the app checkout, with the media tree in `media/` and the dump in `data/`:

```bash
docker compose build web
docker tag pnwinsects-app-web:latest pnwmoths-local-web:1.0
docker save pnwmoths-local-web:1.0 mysql:5.6 -o images/pnwmoths-local-images.tar
```

Then copy into an empty folder, which is what the curator receives:

- `docker-compose.offline.yml` — names the pre-built image instead of building one
- `Start PNW Moths.cmd`, `Stop PNW Moths.cmd`, and `launcher/`
- `READ ME FIRST.txt`
- `data/pnwmoths-local.sql` — loaded automatically on first start
- `images/pnwmoths-local-images.tar`
- `media/` — about 1.6 GB

The media tree excludes `moths_z` and `plates_z`, the Zoomify tiles, which are another ~3.7 GB.
Deep zoom therefore does not work in the bundle. Do **not** also exclude `moths/cache`: a missing
thumbnail is a hard 500, not a blank image, because the thumbnailer reads the cached file off
disk.

### 4. Check it before sending

Start it from the assembled folder, not from the app checkout, and confirm all five:

- the homepage renders after signing in
- a factsheet renders **with its photographs**
- the record browser lists records and offers **Export ALL Records as CSV**
- that export returns as many rows as were ticked
- a save on a change form is refused with a plain-English page, not a traceback

If overrides seem to have no effect, rebuild before debugging the Python: a stale build layer has
twice served old code through an apparently successful build. The container logs a
`[local_overrides]` line at startup listing the admins it patched. No line, no overrides.

The launcher's readiness check is a plain `GET /`, and that is deliberately enough: with the
database stopped the same request returns 500, not 200, so a 200 proves the import has finished
and the app can reach MySQL. Do not "improve" it into a check that bypasses the database.

## If It Goes Wrong

- **"Docker Desktop does not seem to be running."** It isn't. Open it, wait for the whale.
- **The browser shows a sign-in page.** Expected. See step 1.
- **A factsheet 500s** with `IOError` on a file under `cache/`. The media tree is incomplete;
  re-copy it including `moths/cache`.
- **The first start times out.** The import is slower on some machines, so first try stopping and
  starting again. If it still times out, the database volume holds a half-finished import, and
  MySQL only runs its import script against an *empty* data directory — so starting again cannot
  fix it on its own. Clear it and start over, from the bundle folder:

  ```bash
  docker compose -f docker-compose.offline.yml down -v
  ```

## Notes

- The curator's copy is a point-in-time snapshot taken from a March server image. If a fresh
  export is wanted, Jim has offered to help while he is still reachable — a current `mysqldump`
  of the live dev database is the one thing only he can provide.
- The reference database container is also what several extraction scripts in this repository
  talk to; see [`docs/reference/data-provenance.md`](../docs/reference/data-provenance.md) for
  the container name and port. Compose names the containers after the directory it is run in, so
  the same database is `pnwinsects-app-db-1` from the app checkout and `pnwmoths-local-site-db-1`
  from the curator's unpacked bundle. Check `docker ps` rather than assuming a name.
