# Curation log

Every curatorial decision about the catalogue, in one place, newest first.

A curatorial decision answers **what is in the catalogue, what it is called, where it sits, and
what data we admit** — inclusions, exclusions, names, merges, synonymies, placements, photo
attributions, and record-admission policy. These are the curator's calls, not engineering's.

## Why this file exists

The decisions were already written down — scattered across issue comments, `reason` columns in
`data/*.csv`, and commit messages. Three things went wrong with that:

- **A reason that lives in a CSV cell dies when the row does.** *Schizura ipomaeae* was hidden in
  July because "no species remains published under *Schizura*." When that call was reversed in
  August the row was deleted, and with it the only statement of the original reasoning outside
  git history.
- **A closed issue is not a place anyone looks.** Reversing a decision means finding the one that
  came before it, and issue search does not surface "why is this species hidden."
- **Unhoused facts drift.** The #84 legacy-CMS exclusion applied to *Schizura concinna*; a test
  comment had come to assert it was *Schizura ipomaeae*. Nobody was careless — the fact had no home.

## What does *not* belong here

- **Engineering decisions** → [`docs/adr/`](adr/). How gating is implemented is an ADR
  ([0015](adr/0015-data-driven-gating.md)); *which taxa are gated* is this file.
- **Work in flight** → GitHub Issues. This log records decisions already made, with a pointer to
  the issue they came from.
- **UI and presentation preferences** → their issues. Menu order and map zoom are not catalogue facts.
- **Bug reports.** "Italics aren't rendering" is a bug, not a decision.

## Conventions

- **Entries are append-only and numbered `C-nnn`** in chronological order. Never renumber, never
  delete. A reversal is a *new* entry that names the one it supersedes; the superseded entry gets a
  back-pointer.
- **Quoted text is the curator's own words**, linked to the comment it came from. Where the only
  record is someone else's restatement, the entry says so — that distinction is the reason a
  reversal like C-020 was possible to reconstruct at all.
- **Status** is one of *Applied* (in `data/`), *Pending* (accepted, not yet done), *On hold*
  (awaiting the curator or an outside authority), *Superseded*.
- **Add the entry in the PR that acts on the decision**, alongside the data change. Not later.

---

## C-020 · 2026-08-05 · *Schizura ipomaeae* stays in *Schizura*

**Issue** [#269](https://github.com/pnwinsects/pnwmoths/issues/269) · **Applied**
[PR #282](https://github.com/pnwinsects/pnwmoths/pull/282) · **Supersedes** part of C-012

> Currently, Schizura ipomaeae has a page on the site but the genus doesn't appear on the Browse
> page. I suspect this was from when we migrated two species (conspecta, unicornis) from Schizura
> to Coelodasys. Schizura ipomaeae should remain within Schizura, nested within Notodontidae:
> Heterocampinae.

Deleted its row from `data/unpublished-species.csv`; `data/species.csv` already had the placement
right. The genus is back on Browse with one species, and the factsheet, records, Checklist row and
search entry all returned. The stale page Merrill saw was an additive-deploy leftover
([ADR 0008](adr/0008-deploy-bunny-additive.md)) — published before C-012, never removed from the CDN.

## C-019 · 2026-08-05 · Two of three found-while-matching merges confirmed; *Catocala allusa* held

**Issue** [#265](https://github.com/pnwinsects/pnwmoths/issues/265#issuecomment-5195492377) ·
**Status** Pending (merges), On hold (*Catocala*)

> It's fine to: 1) treat Macaria submarmorata as a synonym subsumed within M. signaria. 2) treat
> Phyllodesma coturnix as a synonym subsumed within P. americana. For now, hold off on making any
> change to Catocala allusa. My collaborator (Lars Crabo) is checking on this.

Five of six merges on #265 are now confirmed (with C-016). *Catocala allusa* is a different case
from the rest: both species accounts argue against the merge in the site's own voice — *allusa*
calls treating them separately "a contrarian and potentially incorrect view" — and Lars Crabo is
principal author of those accounts, so the merge asks him to retract a position he took
deliberately. Still open on #265: whether each retiring account's prose folds into the survivor or
is dropped.

## C-018 · 2026-08-05 · *Hemileuca nuteglan* deleted outright

**Issue** [#268](https://github.com/pnwinsects/pnwmoths/issues/268#issuecomment-5195457970) ·
**Applied** [ADR 0029](adr/0029-removing-a-species.md)

> Go ahead and entirely delete Hemileuca nuteglan from the site, including any records associated
> with it. Having a query for the page redirect to a 404 is fine.

A hybrid population (*H. nuttalli* × *eglanterina*), not a described species — so neither the
deny-list nor a redirect fit. Species row and all 13 occurrence records deleted from every file.
This is the decision that established the third exit from the catalogue: a name that should never
have been in it, distinct from *provisional* (C-004) and *superseded* (C-016).

## C-017 · 2026-08-05 · Records and images follow the name; *marmorata* disambiguated

**Issue** [#259](https://github.com/pnwinsects/pnwmoths/issues/259#issuecomment-5195750440) ·
**Status** Applied (renames), Pending (merges — see C-019)

> All records and images under the old names should be migrated to the new names. Currently, the
> page for Drasteria maculosa has prose and photos but no dots on the map.

Also settled in the same comment:

- All six *Protorthodes* move to *Trichopolia*, not just the two named in C-016.
- *Macaria marmorata* is a synonym to be subsumed within *M. signaria*; ***Stamnodes marmorata* is
  a legitimate species that stays on the site.** Two similar names, opposite outcomes.
- Provisional names such as "Egira aff curialis" stay out of Browse (restates C-008).
- The *Speranza occiduaria* authority year stays **1874** for now: *"BugGuide also lists 1874. We'll
  have to dig into the literature to figure out what's correct."*

## C-016 · 2026-08-03 · Eight names resolved against the MPG master list

**Issue** [#259](https://github.com/pnwinsects/pnwmoths/issues/259#issuecomment-5172589343) ·
**Status** Applied (renames), Pending (merges — see C-019, #265)

| Ours | Becomes | Kind |
| --- | --- | --- |
| *Protorthodes rufula*, *P. eureka* (and all other *Protorthodes* per C-017) | *Trichopolia* | rename |
| *Furcula furcula* | *Furcula gigans* (McDunnough, 1922) | rename + authority |
| *Drasteria nubicola* | *Drasteria maculosa* (Behr, 1870) | **merge** |
| *Sympistis chionanti* | *Sympistis chionanthi* | spelling |
| *Speranza andersoni* | synonym of *Macaria occiduaria* (Packard, 1874) | **merge** |
| *Macaria unipunctaria* | synonym of *Macaria signaria* (Hübner, [1809]) | **merge** |
| *Hemileuca nuteglan* | removed from the site | see C-018 |
| *Idia concisa* | **no change** — MPG has "*Idia concisa* of authors" | placement only |

> The only place where this will need to be done manually is on the plates.

*Idia concisa* is the useful precedent: MPG's treatment does not automatically become ours.
*"I don't think we need to change what we're calling this species, so all we need to do is place it
immediately after aemula."*

## C-015 · 2026-08-03 · iNaturalist record admission policy

**Issue** [#23](https://github.com/pnwinsects/pnwmoths/issues/23#issuecomment-5169980381) ·
**Applied** [ADR 0026](adr/0026-inaturalist-project-sync.md)

Only research-grade observations from the [pnwmoths iNat project](https://www.inaturalist.org/projects/pnwmoths),
and:

- **Obscured coordinates are skipped**, not approximated — *"Going with iNat's 'within 27km of here'
  point compromises the integrity of the data, and if someone has chosen to obscure their locations
  I'd rather respect that choice."*
- **No positional accuracy → skipped.** *"let's only import records with location accuracy no larger
  than 2km. That will help keep the data clean."*
- Accuracy metadata is imported with the record; the iNat URL goes in `notes` and is the identity
  key for re-sync.

The 2 km ceiling is a curator standard, not a technical limit — worth knowing before anyone
"improves" the importer by relaxing it.

## C-014 · 2026-08-02 · Geometrid genera placed; *Speranza* retired; second list named "Checklist"

**Issue** [#218](https://github.com/pnwinsects/pnwmoths/issues/218#issuecomment-5160842499) ·
**Status** Applied (checklist order and the Checklist page —
[ADR 0030](adr/0030-checklist-order-from-mpg.md), [ADR 0031](adr/0031-checklist-page.md)); **Pending**
(the *Speranza* → *Macaria* rename, [#279](https://github.com/pnwinsects/pnwmoths/issues/279); the
*Holoarctia* deletion, [#278](https://github.com/pnwinsects/pnwmoths/issues/278)) ·
**Refines** C-003

> The geometrid genera Macaria and Speranza have been used inconsistently over the years. […]
> Speranza is no longer in use for N American species and anything we have under Speranza should be
> under Macaria.

- ***Holoarctia* can be removed** — *"It was once used for the species we now have (correctly) in
  Chelis on the site."* `holoarctia-sp` is deny-listed rather than deleted, because it holds two of
  the curator's photos that need a destination first (#278); *Chelis sordida* is on the site.
- **Sixteen `Speranza` rows are still `Speranza`.** They are Geometridae, so the C-001 embargo hides
  them and nothing is user-facing, but the rename itself is unapplied — one of the 27 genus
  disagreements in #279. C-016's *Speranza andersoni* merge target is likewise still
  `speranza-occiduaria` in our data, not `macaria-occiduaria`.
- ***Pseudeustrotia*** sorts immediately before *Spodoptera*.
- ***Macrochilo bivittata*** follows *Chytolita morbidalis*, but **stays out of Browse until it has a
  written account**.
- ***Xylophanes*** in principle follows *Darapsa*, but is kept out of the list until it has a photo
  and an account.
- The names-only list is called **"Checklist"** and is a peer page of Browse, not a toggle on it;
  state/province and county filters are wanted, including multi-select — *"if one wanted a list of
  all of the species from the Georgia Basin, they could combine WA and BC."*

## C-013 · 2026-07-21 · iNaturalist life stage governs whether a date is used

**Issue** [#172](https://github.com/pnwinsects/pnwmoths/issues/172#issuecomment-5038674149) ·
**Applied** [ADR 0018](adr/0018-phenology-reared-exclusion.md) · **Extends** C-002

> only records from iNat with life stage included and as "adult" would be eligible for having the
> date added to our date information. All records with life stage of egg, larva, or pupa would have
> the date moved to the notes field. All records without life stage information would have date
> moved to the notes field.

Unannotated is treated as non-adult — the conservative default, so a forgotten annotation cannot
silently pollute a phenology graph. The date is preserved in `notes`, never discarded, and the
record still plots on the map.

## C-012 · 2026-07-21 · Launch cleanup batch

**Issue** [#157](https://github.com/pnwinsects/pnwmoths/issues/157) · **Status** Applied; the
*Schizura* item superseded by C-020

Recorded as a restatement of Merrill's Browse review, not in his words — the *Schizura* item is why
that distinction is now a convention here.

- All three *Globia* species assigned to tribe **Apameini**.
- *Lymantria dispar* common name → **"Spongy Moth."** "Satin Moth" was considered and rejected: that
  name belongs to *Leucoma salicis*.
- `lycomorpha-grotei` hidden; **`lycomorpha-pholus` retained** as the published species.
- `schizura-ipomaeae` hidden, on the reading that no species should remain published under
  *Schizura* and no replacement combination had been confirmed. **Reversed by C-020.**
- Four live-moth image rows removed from `hecatera-dysodea`, keeping its A dorsal/ventral pair;
  the CDN objects recorded in `data/cdn-retired-images.csv` rather than deleted.
- Legacy backslashes stripped from ~30 `common_name` values, so *Ridings' Forester Moth* renders.

## C-011 · 2026-07-21 · *Euxoa aurantiaca* omitted, records retained

**Issue** [#156](https://github.com/pnwinsects/pnwmoths/issues/156) · **Status** Applied

Not featured on the legacy site and with no completed species account, so it is deny-listed for now
— *"omitted for now — occurrence records retained."* Recorded as a restatement, in
`data/unpublished-species.csv`.

The companion call: `oedemasia-salicis` is the canonical current-genus target of the
`schizura-concinna` redirect and **must stay visible**; it does not inherit the hide that applied to
the name it replaced (C-005).

## C-010 · 2026-07-06 · Species to add to the Identify key

**Issue** [#19](https://github.com/pnwinsects/pnwmoths/issues/19#issuecomment-4896823722) ·
**Status** Pending

A 25-name list from Merrill's own earlier notes (*Catocala meskei*, *Admetovis icarus*,
*Tarache acerba*, … see the comment), plus a standing request: report which species have published
pages but no key row. The gap is tracked in `data/key-coverage-report.json`.

## C-009 · 2026-07-03 · *Clostera brucei* photos are mostly *C. multnoma*

**PR** [#110](https://github.com/pnwinsects/pnwmoths/pull/110#issuecomment-4879914499) ·
**Applied** via [#156](https://github.com/pnwinsects/pnwmoths/issues/156)

> Regarding the Clostera brucei photos, only the Colorado specimen is brucei. The others (Scatter Cr,
> Tiffany Mdws) are Clostera multnoma and should be re-mapped to that species […] This was the result
> of a taxonomic split that post-dated when we imaged the specimens. There will likely be a few
> others like this, so we should be on the lookout for species accounts missing images.

The general warning is the durable part: a specimen photographed before a split carries the
pre-split name, so **an image filename is never evidence of identity.** This is the curatorial
counterpart of the invariant that join slugs are never derived from image filenames.

## C-008 · 2026-07-03 · Content-free pages must not appear in Browse or Search

**Issue** [#106](https://github.com/pnwinsects/pnwmoths/issues/106) · **Status** Applied

> Species with pages devoid of content are appearing in Browse, such as Noctuidae: Noctuinae: Egira
> shows Egira aff. curialis, and the link to its page shows a page without images or other content.
> This species shouldn't be in Browse or Search and shouldn't have a species account.

A page with no prose, photos or records is not a species account, and an empty page is worse than an
absent one. Restated for provisional names in C-017.

## C-007 · 2026-07-03 · *Callopistria floridensis* and *Clostera brucei* added

**Issue** [#84](https://github.com/pnwinsects/pnwmoths/issues/84#issuecomment-4879058926) ·
**Status** Applied

> Callopistria floridensis should be added. Noctuidae: Eriopinae: Callopistria are the higher taxa
> for it. Clostera brucei should be added. Notodontidae: Pygaerinae: Clostera are its higher taxa.

Additions come with their higher taxa and their records/photos from the curator — the reciprocal of
the exclusions in C-005 and C-006.

## C-006 · 2026-07-03 · Twelve legacy drafts stay unpublished; images retained

**Issue** [#84](https://github.com/pnwinsects/pnwmoths/issues/84#issuecomment-4879087584) ·
**Status** Applied

`arctia-brachyptera`, `euxoa-pimensis`, `hemileuca-juno`, `lacinipolia-acutipennis`,
`lacinipolia-dimocki`, `meganola-fuscula`, `notodonta-ochreata`, `papaipema-unimoda`,
`phyllodesma-coturnix`, `protolampra-brunneicollis`, `sympistis-saundersiana`,
`sympistis-viriditincta`.

> No pages needed for these. We might write and publish some of them in the future, but for now
> there are various reasons for not having any of these pages finished and published on the old site.
> If there are any images for these, it would be good to retain these files in the background (not
> associated with any content on the website) so that they will be available if needed.

"Retain in the background" is the origin of the rule that the deny-list is a *display* gate:
records, images and Parquet survive intact for every listed name.

## C-005 · 2026-07-03 · Ten names absent from the legacy CMS stay hidden; data retained

**Issue** [#84](https://github.com/pnwinsects/pnwmoths/issues/84#issuecomment-4879116956) ·
**Status** Applied

`anarta-obesula`, `copablepharon-longipenne`, `drasteria-nubicola`, `euxoa-scandens`,
`hadena-circumvadis`, `hemileuca-nuteglan`, `lacinipolia-naevia`, `leucania-phragmitidicola`,
`schizura-concinna`, `sideridis-artesta`.

> These should not be on the new site so that they do not show up in Browse or Search and they do not
> have account pages. Edit: we should, however, retain any records and/or images for any of these
> species. Some of these will be useful for accounts published in the future.

Two of these ten moved on: `hemileuca-nuteglan` was deleted outright (C-018) and `schizura-concinna`
became `oedemasia-salicis`, which is published (C-011). **This exclusion never applied to
*Schizura ipomaeae*** — the confusion that C-020 had to unpick.

## C-004 · 2026-07-03 · Provisional morphospecies and the "judgement" list

**Issue** [#80](https://github.com/pnwinsects/pnwmoths/issues/80#issuecomment-4878597896) ·
**Status** Applied as hiding, not removal

> For the 20 species in the "Provisional morphospecies" bucket, there are two solutions: hide them or
> remove them altogether. My preference would be to remove them altogether (pages, ID key, images,
> occurrence data, etc.). […] If removing them completely will be complicated, then hiding them also
> works. […] For the 13 species on the "judgement" list, we should remove them altogether.

**The stated preference was deletion; what shipped was hiding.** Anyone revisiting
`data/unpublished-species.csv` should know the curator would not object to these being removed
outright — and that ADR 0029's framing of the deny-list as "names expected to become valid" is a
narrower reading than this comment.

Also settled here: species published under superseded genera move to the current genus — *"I agree
that updating to the new genera (= reference taxon) is the way to go"* — which at the time meant the
27 disagreeing with the legacy reference site, not the 27 now measured against MPG in
[#279](https://github.com/pnwinsects/pnwmoths/issues/279). Two different lists of the same size; the
principle is what carries. The *Speranza* (Geometridae) names are hidden. And — a terminology call —

> since Lucid was the proprietary software, we should probably avoid using "Lucid" in relation to the
> key except for historical context

so the user-facing feature is **Identify**, and "Lucid" appears only when describing where the key
came from.

## C-003 · 2026-07-01 · *Euthyatira lorata* placed; four out-of-region taxa dropped

**Issue** [#73](https://github.com/pnwinsects/pnwmoths/issues/73#issuecomment-4849743794) ·
**Status** Applied as hiding, not deletion · **Refined by** C-014

> For issue 73, Euthyatira lorata should be in Drepanidae: Thyatirinae. The other four species can
> all be dropped from the new site as they don't occur in the region.

The four — *Macrochilo bivittata*, *Xylophanes* nr. *libya*, *Holoarctia* sp., *Pseudeustrotia
carneola* — were later treated more finely in C-014: *Holoarctia* to be removed, the other three
given checklist positions but kept out of Browse until they have accounts. **"Drop from the site"
softened to "place but don't publish"** — a drift worth seeing, and the reason both entries
cross-reference. All four are deny-listed today; none was deleted.

## C-002 · 2026-06-29 · Reared and immature records excluded from phenology; foodplant terms not

**Issue** [#59](https://github.com/pnwinsects/pnwmoths/issues/59#issuecomment-4836009937) ·
**Applied** [ADR 0018](adr/0018-phenology-reared-exclusion.md)

> we could have any dates for reared specimens moved to the notes field. That way, the data would
> continue to not be used for the graph, but would be viewable when clicking dots on maps.

And, on the inherited legacy keyword list:

> Also, let's remove the host plants from that list. Sometimes, the notes field will have plant
> genera for flowers visited by adults, and we wouldn't want those data excluded from the graphs.

So `Rubus`, `Taraxacum` and `broadleaf` are **not** rearing evidence: a plant name in `notes` may
record a nectar source for an adult. Extended to iNaturalist in C-013.

## C-001 · 2026-06-27 · Geometridae withheld until records and accounts exist

**Issue** [#48](https://github.com/pnwinsects/pnwmoths/issues/48) · **Status** On hold ·
**Applied** [ADR 0015](adr/0015-data-driven-gating.md)

The family is held out of pages, Browse, Identify and search because its occurrence records were
never sourced and its species accounts were never written. **A hold, not a deletion** — the data
stays in place and the family switches back on by deleting one line from
`data/withheld-families.csv` once both are done. Recorded from the issue, not from the curator
directly.

The consequence that keeps surfacing: the four geometrid merges on #265 have no prose to compare and
no occurrence records to move, because nothing was ever written for them.
