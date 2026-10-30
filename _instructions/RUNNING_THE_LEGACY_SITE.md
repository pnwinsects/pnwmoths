# Task: Run a retired PNW legacy site locally

The retired PNW Moths, PNW Butterflies, and PNW Sawflies Django sites are preserved as
**read-only Docker bundles the curator runs on his own machine, offline**. They share one legacy
application image but carry separate databases, media trees, site names, and launcher files.

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
- **Enough disk space for the chosen bundle and Docker's unpacked images.** The verified zip
  sizes are about 2.8 GB for moths, 1.1 GB for butterflies, and 0.6 GB for sawflies.
- **The app checkout** — `pnwinsects/pnwinsects-app`, branch `master`. It is a separate
  repository from this one; clone it somewhere outside this worktree.
- **The media tree and database dump for each site.** Media comes from the whole-server
  `pnwmoths_https/` image. Moths uses the database recovered from that image; butterflies and
  sawflies use their separately supplied MySQL 5.6 dumps. None belongs in a repository: the
  dumps hold password hashes and unpublished catalogue data, so bundles go by private
  cloud-storage link and nowhere else.

## Steps

### 1. What the curator does

These are the only instructions he needs, and they ship inside the bundle as `READ ME FIRST.txt`:

1. Unzip the download first, and work only in the folder that appears. Double-clicking
   **inside** the zip extracts that one file to a temp folder and leaves the site behind;
   both launchers detect that and say so rather than failing obscurely.
2. Install Docker Desktop and open it. On current Docker Desktop for Mac, **Engine running**
   means it is ready; Resource Saver is normal before a bundle starts. Apple-silicon Macs run
   the legacy `linux/amd64` images through Docker's emulation.
3. Start the chosen site. On Windows, double-click **Start PNW Moths**, **Start PNW
   Butterflies**, or **Start PNW Sawflies**. On a Mac, control-click the matching `.command`
   file, choose **Open**, then confirm **Open** once. Windows may similarly ask once whether to
   run a downloaded file.
4. Sign in when the browser opens using the details sent with the private bundle. Passwords and
   other credentials do not belong in either public source repository.
5. Open the matching **Stop** file when finished. It deletes nothing.

The site is at `http://localhost:8000`, and the record browser at
`http://localhost:8000/admin/species/speciesrecord/`.

Only one bundle can run at a time because all three deliberately use the same easy-to-remember
address. Stop one before starting another.

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

Build the shared image once from the app checkout:

```bash
docker compose build web
docker tag pnwinsects-app-web:latest pnwinsects-local-web:1.1
docker save pnwinsects-local-web:1.1 mysql:5.6 -o pnwinsects-local-images.tar
```

For each site, copy into a separate empty folder:

- `docker-compose.offline.yml`
- the site-named Windows and Mac Start/Stop files, plus `launcher/`
- `READ ME FIRST.txt`
- `bundle.env` — private, gitignored site identity and credentials, created from
  `bundle.env.example`; replace every placeholder before packaging and never commit the populated
  file
- the site's dump as `data/site.sql`
- the shared image archive as `images/pnwinsects-local-images.tar`
- the site's merged `media/` tree

Build `media/` in two overlays: first copy `<site>/app/static/media/` for shared CSS, JavaScript,
icons, and template assets; then overlay `<site>/static/media/` for that site's photographs and
branding. Copying only the second tree produces a page that loads but returns 404 for its CSS and
favicon. Exclude `moths_z` and `plates_z`, the Zoomify tiles. Do **not** exclude `moths/cache`: a
missing thumbnail is a hard 500, not a blank image.

The current site settings are:

| Bundle | `DB_NAME` | Singular | Plural |
|---|---|---|---|
| PNW Moths | `pnwmoths` | `moth` | `moths` |
| PNW Butterflies | `pnwbutterflies` | `butterfly` | `butterflies` |
| PNW Sawflies | `pnwsawflies` | `sawfly` | `sawflies` |

Mac `.command` and `.sh` files must be stored with Unix LF endings and executable mode `0755`.
The app repository's `.gitattributes` enforces LF; the zip creator must preserve Unix mode bits.
If it does not, macOS fails before Docker with `/bin/bash^M: bad interpreter` or refuses to open
the launcher.

### 4. Check it before sending

Start it from the assembled folder, not from the app checkout, and confirm all five:

- the homepage renders after signing in
- a species factsheet renders; where the source database links photographs, they all return 200
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
- **Mac says `/bin/bash^M: bad interpreter`.** The archive contains Windows CRLF endings.
  Rebuild it from LF-normalized scripts; asking the curator to repair it in Terminal is not an
  acceptable workaround.
- **The browser shows a sign-in page.** Expected. See step 1.
- **A factsheet 500s** with `IOError` on a file under `cache/`. The media tree is incomplete;
  re-copy it including `moths/cache`.
- **The first start times out.** The import is slower on some machines, so first try stopping and
  starting again. If it still times out, the database volume holds a half-finished import, and
  MySQL only runs its import script against an *empty* data directory — so starting again cannot
  fix it on its own. Clear it and start over, from the bundle folder:

  ```bash
  docker compose --env-file bundle.env -f docker-compose.offline.yml down -v
  ```

## Notes

- The moth database is the March server snapshot; it was confirmed in October 2026 that no moth
  data had been added since that snapshot. Butterflies and sawflies use separate MySQL dumps
  retained with the private bundle assets.
- The sawfly dump has five `species_speciesimage` rows, but every one has a null `species_id`.
  Their files are present and readable, but no species factsheet can display them without a
  curatorial determination. Preserve that source-data condition rather than silently attaching
  them.
- The reference database container is also what several extraction scripts in this repository
  talk to; see [`docs/reference/data-provenance.md`](../docs/reference/data-provenance.md) for
  the container name and port. Compose names the containers after the directory it is run in, so
  the same service may be named `pnwinsects-app-db-1`, `pnwmoths-local-site-db-1`,
  `pnwbutterflies-local-site-db-1`, or `pnwsawflies-local-site-db-1`. Check `docker ps` rather
  than assuming a name.
