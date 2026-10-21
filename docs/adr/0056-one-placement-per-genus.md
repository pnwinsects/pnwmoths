# 0056. The build fails when species of one genus disagree on family, subfamily or tribe

**Status:** Accepted · Refines [0016](0016-tribe-hierarchy-level.md) · Issue [#433](https://github.com/pnwinsects/pnwmoths/issues/433)

## Context

Family, subfamily and tribe are ranks above the genus, so every species of a genus has the same three. The repository has no table of genera, though: `data/species.csv` stores all three on each species row, so each species carries its own copy of its genus's placement, and nothing checked that the copies agree.

When they disagree, the site splits the genus. `src/_data/taxon.ts` builds the browse tree as family → subfamily → tribe → genus, and each tribe keeps its own list of genera, so a genus whose species carry two tribe values is filed twice, each entry listing only some of its species. The Checklist page reads the same tree. The browse component looks a genus up by its URL name and takes the first match, so a link to the genus opens only one of the two entries.

It nearly happened in [#432](https://github.com/pnwinsects/pnwmoths/pull/432). MPG places *"Perizoma" (Group 1) custodiata* in Euphyiini and our two other *Perizoma* in no tribe; entering MPG's tribe on the new row would have shown *Perizoma* twice. The maintainer put all three in Euphyiini instead ([C-043](../curation-log.md)). Until then the rule had only been assumed, in `scripts/backfill-tribe.ts` and in the adding-species runbook, which tells contributors to copy the subfamily from another species of the genus.

## Decision

1. **`build-data.ts` refuses the data** when the rows of one genus disagree on family, subfamily or tribe, alongside its other checks on the CSV files. The build stops before any page is made.
2. **A blank cell is a value.** A genus with one species in Euphyiini and one with no tribe fails, because the tree files the blank one under the subfamily directly, which is the same split.
3. **Genera are grouped as the tree groups them**, by `lower(replace(genus, ' ', '-'))`, so the check fails on exactly the cases that would split a genus on the site.
4. **The message names the genus, each value and the species holding it**, so a contributor editing the CSV in a browser can fix it without reading code.

## Consequences

- Moving a genus to another tribe means editing every row of it at once. `npm run species:rename` moves a species to another genus; if the new genus already sits elsewhere, the renamed row has to take that genus's placement in the same change.
- Withheld families are checked too, so a placement error in the Geometridae surfaces now, not when the family is released.
- When MPG places one of our genera's species in different tribes, as with *Perizoma*, the build cannot record both. Which placement the genus takes is a curation ruling, recorded in the curation log.

## Alternatives rejected

- **Put the check in the referential-integrity gate** ([ADR 0033](0033-referential-integrity-gate.md)). That gate checks that slugs in one file name a species in `species.csv`; this check is about values inside one file, which is what `build-data.ts` already validates.
- **A table of genera holding the placement once.** It removes the duplication instead of policing it, but it changes the file every contributor edits and every script that reads `species.csv`, for a defect that has not yet happened. It can still be done later; this check would then become redundant.
- **Let the tree merge a split genus under one of its tribes.** That hides a data error and picks a placement nobody chose.
