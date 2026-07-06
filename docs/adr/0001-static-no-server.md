# 0001. Static files only — no server or database at runtime

**Status:** Accepted

## Context

The project rebuilds [pnwmoths.biol.wwu.edu](https://pnwmoths.biol.wwu.edu), originally a
Django/CMS stack with a live database. That architecture demands a running server, a DBA, and
ongoing operational attention. The catalog is read-only for the public and updated in slow,
curated batches — nothing about it is inherently dynamic. The site may also change ownership
and sit unmaintained for stretches (see [PRODUCT.md](../../PRODUCT.md)), so operational surface
is a liability, not a convenience.

## Decision

The site is **pure static files**: HTML, CSS, JS, JSON, and Parquet, generated entirely at
build time and served from a CDN. There is no server process and no database answering requests
at runtime. All querying and joining happens during the build; the browser only fetches
pre-computed files. All pipeline operations (data materialization, image upload, tiling,
district assignment) are maintainer-run scripts on a local machine — there is no build/data server.

## Consequences

- This is **the load-bearing constraint**: nearly every other decision here follows from it.
  Search is static ([0006](0006-pagefind-search.md)), occurrence data is columnar files the
  client loads directly ([0004](0004-duckdb-parquet.md)), interactivity is client-side only
  ([0005](0005-lit-light-dom.md)), and data edits are Git commits ([0002](0002-flat-files-over-cms.md)).
- Hosting is trivially cheap and durable; a static bucket behind a CDN has near-zero maintenance.
- The cost is that anything genuinely dynamic (user submissions, live feeds, server-side search)
  is out of scope by construction — see the Scope table in [PRODUCT.md](../../PRODUCT.md).
- No-JS degradation is mandatory: core content must render as static HTML with scripting off.
