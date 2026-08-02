# 0023. Runbook CSV schemas are checked mechanically, per-document

**Status:** Accepted

## Context

`_instructions/` is written for a collaborator who does not use these tools, and for whoever the
repo changes hands to. Its runbooks name CSV columns constantly — that is most of what they are for.
Nothing compiles them.

Four runbooks spent months telling maintainers to key `data/images.csv` and `data/records.csv` by
`species_id`, a column that exists in neither file; both are keyed by `species_slug`
([0010](0010-slug-foreign-key.md), [#240](https://github.com/pnwinsects/pnwmoths/issues/240)). The
first fix ([#242](https://github.com/pnwinsects/pnwmoths/issues/242)) corrected the prose and added a
guard that checks column names against the real CSV header — but only inside a markdown table under a
`## Schema: data/<file>.csv` heading. That was three tables in three docs.
`ADDING_NEW_SPECIES_COMPLETE.md`, which names columns only in prose, had none, so **the guard would
not have caught the bug that motivated it in that file**
([#243](https://github.com/pnwinsects/pnwmoths/issues/243)).

Widening it to prose has a false-positive budget the table matcher does not. Backticked identifiers
in these docs include column names, but also file paths, npm scripts, env vars, CLI flags and slugs:
`species_slug` is a column, `build:site` is not, and `records.parquet` is neither. A guard that cries
wolf gets deleted.

One measurement decided the design. Resolving prose tokens against the union of every header in
`data/` looks stricter than resolving them per-document, and is in fact **weaker**: `species_id` —
the exact #240 bug — *is* a column of `data/records-bad-coords.csv`. A repo-wide union would have
waved it straight through.

## Decision

`scripts/instructions-schema.test.ts` runs four checks over `_instructions/`, in the order a runbook
meets them:

1. **Every `data/*.csv` path a runbook names exists on disk.**
2. **A `## Schema: data/<file>.csv` heading must be followed by a table naming every column of that
   file, in header order** — not a subset, and not reordered. Completeness matters as much as
   correctness: `ADDING_PHOTO.md` tells the reader to "count the commas — there are 18 columns",
   which is only safe advice if the table being counted against is the whole header in the real
   order. This closes the one-directional gap in the original guard, which caught invented columns
   but not omitted ones.
3. **A runbook that shows a literal CSV row in a ` ```csv ` fence must declare a schema for the file
   that row belongs to**, matched by field count. This is what makes check 2 apply *by construction*
   to any runbook that edits a CSV, rather than only to the ones that remembered a table. It also
   verifies the sample row itself: a missing trailing comma changes the field count and fails.
4. **Column names in prose are resolved against the CSVs that same runbook names.** Scoped
   per-document for the reason above. A backticked bare snake_case identifier — the underscore is
   what distinguishes a column reference from a path, script or slug — must be a column of some CSV
   the doc mentions, or appear in the `NOT_COLUMNS` allow-list with a stated reason.

The allow-list holds two entries repo-wide (`sight_field_notes`, a *value* of `record_type`;
`shared_link`, Dropbox API terminology). If it starts growing, the matcher is wrong, not the docs.

## Consequences

- The guard catches #240 in `ADDING_NEW_SPECIES_COMPLETE.md` — verified by reintroducing the bug and
  watching it go red, per the mutation-test rule in
  [lessons-learned](../lessons-learned.md).
- Adding a runbook that shows a CSV row now costs a schema table. That is the point: the convention
  is cheaper to satisfy than to remember.
- `ADDING_PLATE.md` and `FIXING_LEGACY_LINKS.md` gained schema tables for
  `data/species-plates.csv` and `data/species-redirects.csv`;
  `INGESTING_HIGH_RES_PHOTOS.md`'s existing manifest table gained the heading that puts it under the
  guard. Four checked tables became six.
- **Single-word column names are deliberately unguarded** — `status`, `view`, `filename`, `weight`
  read as ordinary English at least as often as they name a column, and matching them produces
  noise. A wrong single-word column name in prose still gets through.
- A doc that names no `data/*.csv` at all is not prose-checked, since there is nothing to resolve
  against. That is the correct answer for `EDITING_HOME_ANNOUNCEMENT.md` and a blind spot for any
  future doc that discusses columns without naming a file.

## Alternatives considered

- **Leave it and document the limit.** Rejected: the limit was that the guard missed the bug it was
  written for, in one of the four files that had it.
- **Opt-in prose marking**, a convention like `` `images.csv:species_slug` `` the guard resolves.
  Rejected: it only protects text someone remembered to mark, which is the same failure mode as
  writing it right in the first place.
- **Resolve prose against every CSV in `data/`.** Rejected on the measurement above — it would have
  passed `species_id`.
- **Match every backticked snake_case token, single words included.** Rejected: fires on values, API
  terms and prose, and the allow-list needed to quiet it would be longer than the set of real
  columns.
