# 0063. MPG's placements are applied a genus at a time, and the crosswalk may be empty

**Status:** Accepted (2026-11-22)
Refines [0056](0056-one-placement-per-genus.md) and [0062](0062-checklist-order-reads-mpg-2025.md)

## Context

The curator made MPG's 2025 checklist the default authority for genus, subfamily and tribe placement ([C-046](../curation-log.md), [#279](https://github.com/pnwinsects/pnwmoths/issues/279)). After the 18 genus moves, `data/mpg-2025-differences.csv` listed 38 subfamily and 123 tribe differences.

Placement is a property of the genus on this site. The Browse tree and the Checklist page each show a genus once, so the build fails when the species of one genus disagree on family, subfamily or tribe ([ADR 0056](0056-one-placement-per-genus.md)). Applying the report row by row would break that rule for any genus where a provisional name (*Pseudanarta sp*), which MPG does not list, sits beside a species MPG places.

Once the genus moves made every species a name match, `data/mpg-crosswalk.csv` had no rows left. The referential-integrity gate treats a declared file with no references as its worst failure (a renamed column, a truncated file, a BOM), so it failed the build on the empty crosswalk.

## Decision

1. **`npm run report:mpg-2025 -- --apply-placements` writes MPG's family, subfamily and tribe a whole genus at a time.** A genus is changed only when every species of ours that MPG holds is in the same MPG placement. The genus's other species, the ones MPG does not hold, take that placement too.
2. **A genus is left alone, and listed, when MPG itself splits it, or when the curator has ruled on one of its species** (`RULINGS` in `scripts/report-mpg-2025.ts`: *Perizoma* by C-043, *Lampropteryx* by C-041).
3. **MPG's bracketed placeholders count as no name.** "[Ennominae – unplaced to tribe]" becomes a blank tribe, and "[Noctuidae – group 1 unplaced to subfamily]" a blank subfamily (*Tyta luctuosa*).
4. **A relation can be declared `mayBeEmpty`.** No references is then accepted, but the file must still have the column in its header, so the renamed-column case still fails. Only `mpg-crosswalk.csv` is declared this way: it is empty whenever every species matches MPG by name, and rows come back when a new species does not.

## Consequences

- **75 genus placements changed** on #279. Most fill a tribe that was blank, such as *Sphinx* (Sphingini). Some move a genus to another subfamily, such as *Annaphila* from Amphipyrinae to Stiriinae, and six genera lose a tribe that MPG does not give them (*Axenus*, *Condica*, *Neogrotella*, *Properigea*, *Pseudobryomima*, *Tristyla*). *Tyta* loses its subfamily.
- **Subfamily and tribe have no URLs.** Only anchors within `/browse/` and `/checklist/` change.
- **The report now holds only the authorities** (#465), the differences the curator kept, and the provisional names.

## Alternatives rejected

- **Apply the report row by row.** It would leave a provisional name in the old tribe beside its genus in the new one, which ADR 0056 refuses.
- **Delete the crosswalk file when it is empty.** Then the next species that needs it means re-adding both the file and its relation, and the gate would no longer guard it in the meantime.
- **Keep a dummy crosswalk row.** A row is a curator decision with its source; a placeholder would be a false one.
