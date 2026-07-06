# 0011. Full TypeScript pipeline via Node native type-stripping

**Status:** Accepted

## Context

The build pipeline, Eleventy data/config, and Lit components started as plain JavaScript. As the
data flow grew — DuckDB joins, Parquet export, key matrices, district assignment — untyped code
made silent data-shape regressions easy and refactoring risky. A codebase that may sit
unmaintained and is edited by AI tools benefits from types as executable documentation. But a
transpile step (Babel/ts-node/tsc-emit) adds build complexity and a source-map layer this
otherwise-lean project didn't want.

## Decision

Migrate everything to **TypeScript** and run it directly on **Node 24's native type-stripping** —
no transpiler, no emitted JS. Type-*checking* is a separate CI gate (`tsc --noEmit`). Structure:
**three tsconfigs** (browser / node / base) and **Zod schemas** for all data entities in a shared
`src/types/`. A permanent invariant guard, **`scripts/check-ts-only.sh`**, bans `.js` sources,
`allowJs`, `@ts-ignore`, and unguarded double-casts (`as unknown as`, even in comments). The v3.0
migration was bounded by a **one-shot byte-identical `_site/` baseline proof** (`compare-sites.sh`).

## Consequences

- Types run as-authored — no build-time transpile, no source maps to reconcile — while `tsc
  --noEmit` still catches type errors in CI on every PR and deploy.
- Zod schemas validate data at build time *and* at the client's dynamic-fetch boundaries, so a
  malformed CSV or Parquet column fails loudly instead of corrupting a page.
- `check-ts-only.sh` is a **standing invariant**: it keeps the codebase from sliding back to JS or
  silencing the type checker; a change tripping it fails CI. (Note it bans `as unknown as` even in
  comments — see the CI gates.)
- The byte-identical proof gave confidence the migration changed *no output*; it is a deliberate
  one-shot local check, not wired into CI, so byte-level data regressions aren't caught
  automatically thereafter.
- Every explicit DuckDB `read_csv` column map must list each column it reads, or a new column is
  silently dropped — a recurring gotcha the schemas help surface.

## Alternatives considered

- **Stay in JavaScript** — rejected: no compile-time safety for a data-shape-heavy pipeline that
  AI tools edit.
- **TypeScript with a transpiler (ts-node / tsc emit / Babel)** — rejected: adds a build step and
  source maps; Node native type-stripping gives the types without the machinery.
