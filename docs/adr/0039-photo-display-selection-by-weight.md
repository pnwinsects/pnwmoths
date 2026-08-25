# 0039. Photo display selection is `weight`; the `navigational` flag is dropped

**Status:** Accepted

## Context

`data/images.csv` carried a `navigational` column, and `CONTEXT.md` defined it as the mechanism
that chooses browse-tree thumbnails:

> The **navigational** flag marks images used as browse-tree thumbnails.

It has never marked anything. The column was empty in all 4,034 rows, and it was empty by
construction, not by neglect:

- It was added in `b548a09b` (2026-04-20) to the eight scaffolding rows that stood in for the
  catalogue at the time — speculative, before there was any real photo data.
- The migration that actually populated the file, `scripts/migrate-images.js` (`c3e9931a`),
  wrote `navigational: ''` for every row unconditionally. There was no source column in the
  legacy CMS to read it from. **No curator data was ever lost to the blank.**

Meanwhile two consumers — `pickNavImages()`/the species-card sort in `src/_data/taxon.ts` and
the Identify query in `scripts/build-key.ts` — *sorted* by it rather than filtering on it:

```sql
ORDER BY species_slug, CASE WHEN navigational = 'true' THEN 0 ELSE 1 END, weight
```

With the column empty, that leading term is a constant and `weight` decides everything. Setting
the flag on a row today would have changed one tiebreak and nothing else.

The cost was not runtime, it was comprehension. `CONTEXT.md` is the glossary CLAUDE.md points
the next maintainer at as authoritative vocabulary, and it described a promotion mechanism that
does not exist, while the rule that *does* pick a thumbnail — lowest `weight` — was written down
nowhere. Three successive attempts to model the display rules from source while building the
hidden-images report ([#299](https://github.com/pnwinsects/pnwmoths/issues/299)) were each
wrong, and this entry was part of why
([#337](https://github.com/pnwinsects/pnwmoths/issues/337)).

## Decision

**`weight` is the selector. The `navigational` column is removed** from `data/images.csv`, from
the two sort expressions, from the schemas, from `build-data.ts`'s required-column list, and
from the runbooks.

The reasoning for removing rather than documenting it as a reserved override:

1. **`weight` already expresses everything the flag could.** A curator who wants a particular
   photograph to be the browse or Identify thumbnail gives it the lowest `weight` for that
   species. The one thing the flag could express that `weight` cannot is *a different photograph
   in the tree than at the head of the account carousel* — a need nobody has stated in the life
   of the project, and one the empty column proves was never exercised.
2. **An unused knob in the runbooks costs the maintainer attention.** Both
   `_instructions/ADDING_PHOTO.md` and `UPLOADING_IMAGES.md` told the reader to "leave blank
   unless this is the curated navigation image" — a decision offered on every photograph added,
   which resolves to "leave blank" every time.
3. **Re-adding is cheap** if a real need appears: one column, two sorts, one glossary line.

The **term** "navigation image" survives the flag, because the concept is real — it is what
`NavImage`, `pickNavImages()` and `navImages` in the browse tree all name. It now means *the
photograph a surface picks to stand for a species*, derived from `weight`, not a property a row
can carry.

## Consequences

`data/images.csv` loses one always-blank field per row: a 4,035-line diff that changes nothing
but the column count. Anything holding an uncommitted edit against that file will conflict on
every line.

Readers of `data/images.csv` join by column *name* (`csv-parse` with `columns: true`, or an
explicit DuckDB column map), so the removal is mechanical; the two files that named the column
in a `read_csv` map are updated with it. `scripts/instructions-schema.test.ts` enforces that the
runbook schema tables still match the header exactly, so a missed runbook fails `npm test`
rather than misleading a maintainer.

The rules that *do* select photographs are now written down, in
[docs/reference/photo-display-rules.md](../reference/photo-display-rules.md) — six surfaces,
five different rules, which is the actual debt. This ADR does not fix that; it removes a
fictional mechanism from the description of it.
[#338](https://github.com/pnwinsects/pnwmoths/issues/338) is where the missing seam is tracked,
and when a module owns the selection, that reference doc becomes its docstring rather than a
hand-maintained inventory.
