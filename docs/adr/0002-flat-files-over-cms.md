# 0002. Flat files over a headless CMS

**Status:** Accepted

## Context

Species data, occurrence records, glossary terms, and prose all need a source of truth that
non-technical curators can edit (see [PRODUCT.md](../../PRODUCT.md) — "non-technical maintainers
can keep it running"). The obvious modern default is a headless CMS. But a CMS is an external
service with accounts, an API, uptime, and a bill — exactly the operational surface
[0001](0001-static-no-server.md) exists to avoid. It also puts content behind a proprietary UI
instead of in the repository.

## Decision

Store all catalog data as **flat files in the repo**: tabular data as CSV (`data/species.csv`,
`data/records.csv`, `data/images.csv`, `data/glossary.csv`), and per-species prose as Markdown
(`src/content/species/{slug}.md`, body only, no frontmatter). No headless CMS, no external
content service.

## Consequences

- Data is **Git-native**: every change is a reviewable diff with authorship and history; reverting
  is `git revert`. Content and code version together.
- It is **cheap and dependency-free** — no accounts, no API keys, no service to go down.
- It is **LLM- and contributor-editable**: an AI tool or a curator can open a CSV and change a row.
  The plain-English guides in [`_instructions/`](../../_instructions/) validated this pattern —
  a maintainer follows `ADDING_SPECIES.md` / `ADDING_RECORDS.md` without touching the build.
- The tradeoff is no built-in editing UI or validation-on-input; correctness is enforced at build
  time by DuckDB pre-flight checks and Zod schemas instead ([0011](0011-typescript-pipeline.md)).
- CSV scales fine for ~1,430 species and glossary rows; the ~86k–100k occurrence records get
  columnar treatment at build time ([0004](0004-duckdb-parquet.md)).

## Alternatives considered

- **Headless CMS (Contentful, Sanity, etc.)** — rejected: external service, cost, opaque to Git,
  contradicts the zero-server constraint.
- **A checked-in SQLite database** — rejected: a binary blob is not diff-able or hand-editable,
  defeating the contributor-editability goal.
