# 0006. Pagefind for static full-text search

**Status:** Accepted

## Context

Users need full-text search across species pages, but there is no server to run a search backend
([0001](0001-static-no-server.md)). The original stack had server-side search; a static rebuild
needs an equivalent that indexes at build time and runs entirely in the browser, and that scales
to 700+ pages without a heavy client payload.

## Decision

Use **Pagefind**. It runs as a build step (`build:pagefind`) after Eleventy generates the HTML,
producing a static, chunked index the browser queries client-side. The Pagefind CSS `<link>` is
placed in `<head>` to avoid a flash of unstyled content on the search page.

## Consequences

- Full-text search with **no server**, indexed at build time; the fragmented index means the
  browser only downloads the chunks a query touches, so it scales past 700 pages fine.
- **Occurrence data is deliberately excluded from the index.** The index covers species prose and
  taxonomy, not the ~100k occurrence records — those are Parquet ([0004](0004-duckdb-parquet.md))
  and would bloat the index while adding no search value.
- Content that must stay out of search (e.g. glossary definitions) is kept in `data-*` attributes,
  not DOM text, so Pagefind never indexes it ([0015](0015-data-driven-gating.md) applies the same
  choke-point discipline to withheld taxa).

## Alternatives considered

- **Server-side search** — rejected by [0001](0001-static-no-server.md); no server exists.
- **A client-side index library (Lunr/Fuse) over one big JSON index** — rejected: would ship the
  entire index to every visitor; Pagefind's chunked fetch is far lighter at this page count.
