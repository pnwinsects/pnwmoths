# 0050. The retired legacy site is kept as a read-only Docker bundle the curator runs locally

**Status:** Accepted · Refs [pnwinsects/pnwinsects-app@`docker-local-dev`](https://github.com/pnwinsects/pnwinsects-app/tree/docker-local-dev)

## Context

`dev.pnwmoths.biol.wwu.edu` is the Django site this project replaced. It is still the curator's
working reference: he checks what the old factsheet said against what the new one says, and he
pulls occurrence records out of it. It is going away. Jim, the WWU sysadmin who ran it for eleven
years, has been reassigned, and WWU is retiring the hostnames over roughly the next year.

The curator asked for "a version of it that can be run locally but that isn't actually on the
web." He is the authority on the catalogue's content and is not a developer. Anything that asks
him to use a terminal, clone a repository, set an environment variable or write SQL does not
exist as far as this requirement is concerned.

Two needs sit behind the ask, and they are not the same shape:

- **Checking content.** Needs the old pages rendered — prose, taxonomy, photographs, the layout
  he remembers. Only the application can do this.
- **Pulling records.** Needs a filtered table and a CSV. Today this means hand-written SQL
  against MySQL 5.6 with no interface at all.

What already existed, undocumented and unpushed on one laptop: a working Dockerised build of the
app (Python 2.7, Django 1.3.5, MySQL 5.6) and a genuine `mysqldump` of the live database. The
Django admin in that app already has a record browser with filters, a search box, and CSV export
actions.

## Decision

Ship the legacy application itself, as a **pre-built, read-only, offline Docker bundle** the
curator unpacks and starts by double-clicking a file.

- **Pre-built.** The bundle carries an exported image, not a Dockerfile to build. Building the
  2013 stack needs `archive.debian.org` and PyPI to keep serving Python 2.7 files; that is a
  dependency on the internet being kind to a dead toolchain, taken on a machine with no compiler.
  The launcher loads the image instead.
- **Read-only, enforced on the request.** `local_overrides.py` removes the Add and Delete
  controls, and a `ReadOnlyGuard` middleware refuses every unsafe method outright, allowing only
  signing in and the CSV exports. An edit made here could never reach the live site, so the
  honest behaviour is to refuse it rather than appear to save it.
- **One extra export action.** The two legacy export actions each filter the selection
  (`speciesimage__isnull`), so one silently omits every record that has a photograph and the
  other omits every record that does not. Neither says so on screen. The bundle adds
  `export_all_records_as_csv`, which exports what was actually selected.
- **The overrides live outside the legacy packages.** They sit in a Docker-only module, so the
  `species/` code stays faithful evidence of what the server ran.

**This is a maintainer's local reference tool and is not part of the deployed site.** It does not
soften [ADR 0001](0001-static-no-server.md): nothing here runs in production, nothing here is
reachable from the internet, and the published site still has no server and no database.

## Consequences

- The curator keeps a working copy of the old site after WWU's hostnames go, without WWU.
- Both needs are met by one thing he starts once, rather than two tools with two mental models.
- The bundle is about 2.6 GB — an image export, a 37 MB dump, and 1.6 GB of photographs. It is
  delivered as a cloud-storage link, never a public registry or repository: the dump contains
  password hashes and unpublished taxa.
- The deep-zoom (Zoomify) viewer does not work locally. Its tiles are another ~3.6 GB and were
  excluded to keep the download tractable. Ordinary photographs do work, and must: a missing
  file is a hard 500, because the thumbnailer reads the cached thumbnail off disk.
- The data is a point-in-time copy. It does not track later edits on the live dev site, and the
  copy in hand came from a March server image rather than a fresh dump.

## Alternatives rejected

**A database plus a generic GUI (Adminer, phpMyAdmin, or a saved-query page).** Much smaller and
much simpler, and it would have served "pulling records" well. It cannot render a factsheet, so
it answers one of the two needs and leaves the more important one — checking content — unserved.
It also puts the curator in front of table and column names, which is the problem he reported,
restated.

**A static crawl of the dev site, saved as files.** Tempting: no Docker, no database, nothing to
run. But a crawl freezes the rendering and loses the record browser entirely; there is nothing to
filter and nothing to export. It also has to happen before the host disappears, with no second
chance if the crawl is wrong.

**Rebuilding the legacy app on a modern stack.** The new static site already is that. Spending
the effort twice to produce a reference copy nobody will develop further is work with no end
state.

**Hosting the legacy site somewhere else.** Rejected on the ask: the curator asked for something
not on the web, and keeping an unmaintained 2013 Django application reachable from the internet —
with real password hashes and unpublished taxa in it — is a liability with no owner now that Jim
has moved on.
