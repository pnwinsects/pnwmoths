# 0061. MPG's 2025 list is committed beside the 2023 list, and a report lists where the catalogue differs from it

**Status:** Accepted (2026-11-22)
Refines [0030](0030-checklist-order-from-mpg.md), whose rejection of "adopt MPG's genus, subfamily and tribe wholesale" the curator has since reversed ([C-046](../curation-log.md))

## Context

ADR 0030 took checklist order from MPG's taxon list, and kept names and placements separate: each rename was the curator's call, one at a time, because a rename was expensive. Two things have changed since:

- **The curator made MPG's 2025 update the default authority** for species names, checklist numbers, and genus, subfamily and tribe placement ([C-046](../curation-log.md), [#418](https://github.com/pnwinsects/pnwmoths/issues/418)). Where the catalogue and MPG differ, we change ours and bring him only the exceptions.
- **A rename is one command** ([ADR 0054](0054-cdn-folder-is-frozen-and-rename-is-one-command.md)), so the cost that made ADR 0030 keep sequence and names apart is mostly gone.

The copy we held, `data/mpg-taxa.csv`, is the March 2024 download of the 2023 checklist. The 2025 update ([`Pohl_&_Nanz_2026_APPEND1x-NA_checklist_2025_update.xlsx`](https://mothphotographersgroup.msstate.edu/Books/Pohl_&_Nanz_2026_APPEND1x-NA_checklist_2025_update.xlsx), last modified 21 July 2026) is a different spreadsheet, not a newer copy of the same one. It has 28 columns instead of 17, a title line above the header, synonyms, subspecies and higher taxa as rows of their own, and no tribe column: a species' tribe is the tribe row above it.

## Decision

1. **Commit the 2025 list as `data/mpg-taxa-2025.csv`, beside the 2023 list, not over it.** Everything that reads `data/mpg-taxa.csv` (checklist order, the genus and tribe backfills) depends on the 2023 columns. Moving them to the new file is a change of its own, so for now both files stay, and the 2023 file is removed once nothing reads it.
2. **The converter recognises the workbook by its header row** and writes each layout to its own file. It refuses a workbook it does not recognise, rather than write a third layout over one of these files with its columns shifted.
3. **`npm run report:mpg-2025` writes `data/mpg-2025-differences.csv`**, one row per difference between a species in `data/species.csv` and its row in the 2025 list. It is advisory, listed at `/curation/`, and nothing reads it back. Each change it prompts is made to the catalogue in a reviewed change of its own, grouped by kind: genus moves, spellings, placements, renumbering.
4. **A species is found in the 2025 list by its exact name first, then by the 2023 number** that `data/checklist-order.csv` already matched it to. The second step carries over every decision the 2023 matcher made (its gender, MONA, synonymy and crosswalk steps) instead of restating them for the new layout.

## Consequences

- **The report includes rulings already made.** *Catocala cleopatra*, which MPG calls *C. faustina* (C-025), and *Perizoma* in Euphyiini (C-043) appear as differences, because the report knows MPG and the catalogue but not the curation log. An exception to C-046 still has to be checked against the log before it is applied. A list that the report reads, so these stop appearing, is for the change that applies the differences.
- **Authorities are reported but not covered by the ruling.** C-046 names names, numbers and placements. The 176 authority rows are listed because many are typing errors in ours ("Geter" for Geyer, "(Grote. 1879)"), but whether MPG's authority replaces ours is not yet decided ([#465](https://github.com/pnwinsects/pnwmoths/issues/465)).
- **The repository holds two copies of MPG's list** (4.3 MB and 5.3 MB) until checklist order moves to the 2025 file.
- **Re-running after a later MPG update** is the same two commands: convert the workbook, then run the report. A later update with a third layout will fail the converter on purpose.

## Alternatives rejected

- **Replace `data/mpg-taxa.csv` with the 2025 list in one change.** It would change checklist order, every backfill and the report in one diff, and nothing could be reviewed against the list it replaced.
- **Read the 2025 workbook into the 2023 columns.** The new workbook has no tribe column and carries synonyms as rows; forcing it into the old shape would mean inventing values for columns MPG no longer fills, and losing the columns it added (`status`, `P-No. 2023`, the edit history).
- **Match species to the 2025 list by name alone.** 18 of our species that are under another genus in MPG would be reported as unmatched instead of as genus moves, which is the difference the ruling is about.
