# 0062. Checklist order and checklist numbers come from MPG's 2025 list, and the 2023 list stays

**Status:** Accepted (2026-11-22)
Supersedes decisions 1 and 4 of [0061](0061-mpg-2025-list-kept-beside-2023.md) · Refines [0030](0030-checklist-order-from-mpg.md)

## Context

[ADR 0061](0061-mpg-2025-list-kept-beside-2023.md) committed MPG's 2025 list beside the 2023 list and planned to delete the 2023 list once nothing read it. It also had the difference report find each species through the 2023 checklist number in `data/checklist-order.csv`. The curator's rulings since then ([C-046](../curation-log.md), [C-047](../curation-log.md)) make the 2025 list the authority for checklist order and checklist numbers, so `scripts/build-checklist-order.ts` now reads it ([#290](https://github.com/pnwinsects/pnwmoths/issues/290)).

Two facts found while porting the builder changed the plan:

- **The 2023 list holds data the 2025 list does not.** 518 of our 521 MONA numbers appear in the 2023 list's MONA column, but only 470 in the 2025 list's: MPG writes `[NEW]` there for many species, *Speranza boreata* and *S. helena* among them. The 2023 list has common names (2,983); the 2025 list has none. Four curation-log entries cite the 2023 list as their source.
- **The 2025 list carries a species' other names as rows of their own**, not as a free-text cell. A species we hold under an older name can be found through a species synonym (8.5), a subspecies (9.x: MPG holds *Catocala cleopatra*, which C-025 keeps, as a subspecies of *C. faustina*), the genus it was described in (*Protoperigea umbricata*, now *Caradrina*), or a synonym of its genus (6.5).

## Decision

1. **Checklist order reads `data/mpg-taxa-2025.csv`.** The builder indexes the valid species (rank 8.0 and 8.1) in file order, and that order is the sort key, as before (ADR 0030). The tiers keep their names. The synonymy tier collects every other name listed above, and still refuses a name that leads to more than one species. `mpg_p_no` is now MPG's 2025 number, written with the hyphen (`85-0003`).
2. **`data/mpg-taxa.csv` stays,** as the source of the MONA numbers and common names the 2025 list does not carry, and of the rulings that cite it. Nothing in the build reads it.
3. **The difference report uses the builder's matcher**, so the report and the checklist cannot disagree about which MPG species a species of ours is. It no longer reads `data/checklist-order.csv`.
4. **Checklist numbers are compared and applied by the report.** Where our `noc_id` is a P-number or blank, the report compares it with MPG's 2025 number, and `npm run report:mpg-2025 -- --apply-numbers` writes MPG's number in. MONA numbers in `noc_id` are a different series and are left alone. MPG's status letter after a number (E, X) is left off, because it describes the species, not its number.
5. **The report says where a number we hold belongs to another species** in any edition of MPG (`number-of-another-species`). This is the check the curator asked for on #290: after a split, one daughter species may keep the old number.
6. **Rulings that keep ours live in the report** (`RULINGS` in `scripts/report-mpg-2025.ts`), and its rows carry the ruling's `C-nnn`. A row with a blank `ruling` is work still to do.

## Consequences

- **Writing the numbers overwrote values entered by hand**, which the additive-only rule for data normally forbids. The curator's rulings permit it, and C-047 lists all 58 changes with the number each replaced.
- **Two crosswalk rows are temporary.** *Speranza helena* has no MONA number in the 2025 list and *Hypercompe permaculata* has moved to *Hypsocompe*, so neither matches mechanically until #279 renames them. The two *Protoperigea* rows are gone: the synonymy tier finds them now.
- **The repository keeps both copies of MPG's list** (4.3 MB and 5.3 MB).

## Alternatives rejected

- **Delete the 2023 list.** It would lose 48 MONA numbers, every common name MPG gave us, and the source that four rulings cite.
- **Keep bridging through the 2023 number.** Once checklist order reads the 2025 list, that bridge is a second matcher that can disagree with the first.
- **Keep MPG's status letters in `noc_id`.** The species page prints `noc_id` as it is stored, so *Euproctis similis* would show "93-0172E", which reads as a different number.
