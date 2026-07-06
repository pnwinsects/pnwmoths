# 0004. DuckDB for build-time queries, Parquet for client-side occurrence data

**Status:** Accepted

## Context

The catalog holds ~86k–100k occurrence records (`data/records.csv`). Two problems follow: the
build must join and validate that many rows against species/images efficiently, and each
factsheet's map and phenology chart must load *its* species' records in the browser without a
server ([0001](0001-static-no-server.md)). Inlining occurrence JSON into HTML would bloat every
page; loading one giant JSON blob per visit is wasteful.

## Decision

Use **DuckDB** at build time to join the CSVs, run integrity checks, and export **one Parquet
file per species** alongside its HTML page. In the browser, the Lit components load that Parquet
asynchronously via **hyparquet**. Small aggregate data that isn't worth Parquet overhead (e.g.
`species-states.json` at ~700 species × ~6 states) stays plain JSON.

## Consequences

- Columnar Parquet is compact and each page fetches only its own species' records — no large
  inline payloads, no client-side database.
- DuckDB's analytical engine handles the 100k-row joins comfortably; `build:data` runs in ~3s.
- **Gotchas that are load-bearing** (regressions here are silent):
  - Parquet export **must use Snappy compression** (`COMPRESSION snappy`), not ZSTD — hyparquet
    does not read the ZSTD output this pipeline would otherwise produce.
  - Use `.getRowObjectsJS()` to read rows and **`closeSync()`** the connection, or the build
    leaks a DuckDB resource.
  - `nullstr = ''` on `read_csv` where a blank must become `null` (e.g. `subfamily`), so grouping
    doesn't silently split on empty strings.

## Alternatives considered

- **SQLite for build-time queries** — rejected: weaker analytical performance on 100k-row joins;
  DuckDB's columnar engine and native Parquet export were a better fit.
- **Inline JSON per page / one big JSON file** — rejected: page-weight bloat and no columnar
  compression; Parquet + async fetch is smaller and lazier.
