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

## How to add an entry

This section is the one place the rules live; the runbooks in [`_instructions/`](../_instructions/)
point here rather than restating them.

Take the next `C-nnn` number, put the entry at the **top** of the log, and give it all of:

| Field | What it holds |
| --- | --- |
| **Number and date** | `C-nnn`, and the date the *decision* was made — not the date you wrote it up. |
| **Title** | The ruling in one line, as an outcome: "*Schizura ipomaeae* stays in *Schizura*." |
| **Source** | A link to where the call was made, as precise as the source allows: a **comment permalink** where there is one, otherwise the **issue body** or **PR**, labelled as such. For a decision made by email, quote it into an issue first and cite that — email is not a source anyone else can open. |
| **Provenance** | Whether the quoted words are the **curator's own** or **someone else's restatement**. Say which, always. |
| **Status** | See below. |
| **The ruling itself** | Quote it where you can. A curator's sentence outlives any paraphrase of it. |
| **Why it matters** | The consequence, the tension, or the thing that will otherwise be forgotten. This is the part worth writing. |
| **What changed** | Which files in `data/` or `src/content/`, and the PR or ADR that carried it. |
| **Cross-references** | `Supersedes` / `Superseded by` / `Refines` / `Refined by`, by `C-nnn`. |

**Write the entry when the decision is made, not when it ships.** If your change applies it, the
entry goes in that PR alongside the data change. If it cannot be applied yet, file the entry now as
*Pending* or *On hold* — the log records rulings, and a ruling nobody has acted on is exactly the one
that gets forgotten.

### Status vocabulary

- **Applied** — in `data/` today.
- **Pending** — accepted, not yet done. Name the issue tracking it.
- **On hold** — awaiting the curator or an outside authority.
- **Superseded** — reversed by a later entry, which the entry names.

An entry covering several items may carry **scoped statuses**, semicolon-separated with the scope in
parentheses: *Applied (renames); Pending (merges — #265)*. See C-014, C-017 and C-019. Splitting one
ruling into several entries to keep statuses simple is the wrong trade — the ruling is the unit.

### Append-only, with two exceptions

Entries are never renumbered, rewritten or deleted. Exactly two edits to an existing entry are
allowed: **updating its Status** as work lands, and **adding a back-pointer** to a later entry that
supersedes or refines it. A changed ruling is a new entry, never an edit to the old one — that is
what made C-020 possible to reconstruct.

---

## C-025 · 2026-08-10 · *Catocala allusa* and *C. faustina* stay two species; ours takes the name *cleopatra*

**Source** [#265 comment](https://github.com/pnwinsects/pnwmoths/issues/265#issuecomment-5243497181),
the curator relaying Lars Crabo · **Status** Pending (rename — #298) · **Refines** C-019 and C-021

> I heard back from Lars about the Catocala faustina/allusa issue. He says that we should continue to
> treat ours as two species (based on a conversation with a Catocala expert, Larry Gall, who has a
> forthcoming paper on the matter). However, we should be using the name cleopatra instead of allusa.
> Current taxonomy lists cleopatra as a subspecies of faustina, but the Gall paper will be elevating
> cleopatra to species level. For now, let's use the name cleopatra instead of allusa and once that
> paper comes out, we can add the formal citation (and hopefully a checklist number).

Why it matters: this closes the C-019 hold **against** the MPG synonymy — the site's "contrarian and
potentially incorrect view" (the *allusa* account's own words) turns out to anticipate Gall's
forthcoming elevation, on the authority of the *Catocala* specialist himself. The catalogue keeps two
species where MPG has one; the next crosswalk builder must not refile the #265 merge question. The
name changes: *cleopatra* Strecker, 1874 has priority over *allusa* Hulst, 1884 (both currently
*faustina* subspecies per MPG's own synonymy note, which already flags "active study … Lawrence Gall").
The shared `noc_id` `93-0801` (C-021) stays shared until the paper brings a checklist number; the
formal citation goes into both accounts when it exists. The accounts' argumentative paragraphs are
Lars's to rewrite then — the rename applies the name only.

What changed: nothing yet — the rename (species row, 50 records, photos + tiles, key synonym,
redirects, account file) is tracked as #298.

## C-024 · 2026-08-10 · The *americana* synonymy note loses its closing clause

**Source** [#265 comment](https://github.com/pnwinsects/pnwmoths/issues/265#issuecomment-5243418290),
the curator's own words · **Status** Applied · **Refines** C-023

> Yes, please drop "but Pohl & Nanz (2023) synonymize them." from the account for Phyllodesma americana.

The C-023 sentences cited Pohl & Nanz twice — the paragraph's pre-existing first sentence already
attributes the synonymy to them — and when the duplication was pointed out the curator chose this
trim. The second added sentence now ends "…has been read by some as suggesting two taxa."

What changed: `src/content/species/phyllodesma-americana.md`, one clause removed.

## C-023 · 2026-08-06 · The five confirmed merges apply; both retiring accounts drop

**Source** [#265 comment](https://github.com/pnwinsects/pnwmoths/issues/265#issuecomment-5208340221),
the curator's own words · **Status** Applied (repo data and CDN copy — #265 PR; 380 objects
copied 2026-08-10, six *Macaria* sources absent per the #232 gap, see #48) ·
**Refines** C-016, C-017 and C-019 · **Refined by** C-024

The merges themselves were ruled in C-016 and C-019; this entry records the prose disposition that
was still open on C-019, and their application. On *Drasteria*:

> No need to carry "Crescent Dunes near Denio" from Drasteria nubicola to D. maculosa. Let's just go
> with the current maculosa account and drop the nubicola account.

On *Phyllodesma*, choice (b) — drop the *coturnix* account, add detail to *americana* — with the
added sentences in the curator's own wording:

> Franclemont (1973) and Powell & Opler (2009) separated *coturnix* from *americana* only by its
> smaller size and male genitalia. Limited mtDNA barcode sequence divergence in California material
> has been read by some as suggesting two taxa, but Pohl & Nanz (2023) synonymize them.

Why it matters: the *nubicola* account's one unique fact — the "Crescent Dunes near Denio" type
locality that *maculosa*'s rewrite generalised to "southern Harney County" — is **knowingly
dropped**, not lost. The *coturnix* account's 652-word argument that the taxa might be distinct
survives only as the two sentences above; the sources it cited beyond them (Mustelin's southern
California material, Franclemont's rearing suggestion) now live only in git history. The curator
also confirmed re-lettering the incoming specimens where the survivor already uses the letter
("Yes - that's a good catch"), so photos keep their historical binomial filenames but take new
catalog letters: *andersoni* A→B under *occiduaria*; *unipunctaria* B→C and A→D and *submarmorata*
A→E under *signaria*; *coturnix* A→C under *americana*.

What changed (all in the #265 PR): five rows deleted from `data/species.csv` (with
`similar_species` repointed on *D. hudsonica* and cleared on *P. americana*); *nubicola*'s six
occurrence records re-keyed to *maculosa*; `data/images.csv`, `data/image-derivatives.csv`,
`data/species-photos.json` and the photo manifest re-keyed and re-lettered;
`data/species-redirects.csv` and `data/species-synonyms.csv` gained the five retired names;
28 objects recorded in `data/cdn-retired-images.csv`; `src/content/species/drasteria-nubicola.md`
and `phyllodesma-coturnix.md` deleted; the sentences above added to `phyllodesma-americana.md`;
`build-key.ts` now OR-merges key columns that resolve to one slug, adding *maculosa* to Identify
(1,191 → 1,192). *Catocala allusa* remains untouched and on hold (C-019). The C-017 *Macaria
marmorata* → *M. signaria* ruling is **not** part of this batch; it is tracked as #294.

## C-022 · 2026-08-06 · The *Lacinipolia vicina* complex is mid-revision — change nothing

**Source** [#285 comment](https://github.com/pnwinsects/pnwmoths/issues/285#issuecomment-5208475452),
the curator's own words · **Status** On hold (awaiting the curator and Lars Crabo — #285) ·
**Refines** C-009 and C-010

> The Lacinipolia vicina complex, which formerly included L. vicina, L. pensilis, and two other
> species not found in the PNW was revised and split into multiple species. Of these, the following
> occur in the PNW: L. acutipennis, L. dimocki, L. pensilis, and L. sareta.
>
> What you see on the site at present represents an incomplete effort to update the site to reflect
> the new taxonomy. Part of the challenge is knowing which names to apply to which records. For now,
> let's not do anything about these species. I'll consult with Lars and hopefully we can come up
> with a decent plan for how to proceed.

Neither option #285 offered was right. The issue asked whether *vicina* and *sareta* are two species
(so the account and photos move back to *vicina*) or one under a new name (so *sareta* is substituted
throughout and *vicina* becomes a synonym). Both assume a **rename or a mis-attribution between two
names**. What actually happened is a **split into four**, of which *vicina* is not one: under the
current taxonomy *L. vicina* does not occur in the PNW at all, so its account describes a moth this
catalogue no longer has a row for, and the material filed under it belongs to some distribution
across *acutipennis*, *dimocki*, *pensilis* and *sareta* that nobody has worked out yet.

**The blocker is at record level, not name level.** Every name is already in `data/species.csv`
(*pensilis* 2096, *acutipennis* 3314, *dimocki* 3315, *sareta* 3341) and in
`data/checklist-order.csv` at 93-3042, .1, .2 and .3. What is missing is the assignment: which of
*sareta*'s 84 records and *pensilis*'s 386 belong to which successor name. That is a determination
from specimens, and no amount of reading our own files produces it — which is why this is on hold
rather than pending.

This is the second time the pattern in C-009 has surfaced, and the general form is now clear: **a
split that post-dates our imaging leaves photos, prose and records all carrying the pre-split name,
and they do not move as a unit.** C-009 handled it for *Clostera* when the curator could name the
specimens. Here he cannot, yet.

### The half-finished state, so nobody re-derives it

- *pensilis* and *sareta* are published; *acutipennis* and *dimocki* are display-gated per C-006
  (#84), which predates this and is not disturbed.
- `src/content/species/lacinipolia-sareta.md` is byte-identical to `lacinipolia-vicina.md` and names
  the moth *vicina* seven times. *sareta* therefore has no account of its own, and *acutipennis* and
  *dimocki* have account files that no page renders.
- Four of *sareta*'s six `data/images.csv` rows are named `Lacinipolia vicina-A/B-D/V.jpg`; the other
  two are a genuine *sareta* specimen from Georgetown Cyn., ID.
- The four matching `Lacinipolia vicina-*.tif` high-res files sit in `data/species-photos-manifest.csv`
  as `genus-only`/`discovered` — unmatched and untiled, because no `lacinipolia-vicina` row exists.
- `lacinipolia-vicina` is otherwise absent from `data/`: no species row, no synonym, no redirect.
- *sareta* is absent from `data/key-matrix.json` while it sits on the C-010 add-to-key list; adding
  it now would key characters to an account written about a different moth, so that one item of C-010
  waits on this.

**No catalogue row, record, image or account changed, deliberately** — not one species, checklist,
`images.csv` or `src/content/species/` line. `src/content/species/lacinipolia-vicina.md` stays where
it is: it is the only copy of the pre-split account, and it will be the reference when the four names
are sorted out. The single edit under `data/` is prose: the reason on its
`data/referential-integrity-exceptions.csv` row, which keeps the build green and now points here.

## C-021 · 2026-08-06 · Seven shared `noc_id` values are transcription errors, not synonymies

**Source** [#286 comment](https://github.com/pnwinsects/pnwmoths/issues/286#issuecomment-5208555790),
the curator's own words · **Status** Applied ([PR #289](https://github.com/pnwinsects/pnwmoths/pull/289)) ·
**Refines** C-016 and C-019

> The NOC number for Fishia nigrescens is correct, but the NOC number for Lasionycta staudingeri
> should be 93-2992
> The NOC number for Apantesis quenseli is correct, but the NOC for A. nevadensis should be 93-0258
> The NOC number for Tarache augustipennis is correct, but the NOC for T. major should be 93-1371
> The NOC number for Homoglaea californica is correct, but the NOC for H. carbonaria should be 93-2529
> The NOC number for Euxoa hardwicki is correct, but the NOC for E. simona should be 93-3348
> The NOC number for Hypenodes fractilinea is correct, but the NOC for H. sombrus should be 93-0664
> The MONA number for Digrammia denticulata is correct, but the MONA number for D. sexpunctata
> should be 6387.1

Seven of the ten collisions were **bad numbers, not taxonomy** — in every case one row of the pair
carried a Hodges/MONA number belonging to the other moth. None of the three explanations the issue
offered (merge, split, data-entry error) applied to more than one pair each; the whole class was the
third. `93-2693.1` is the one worth remembering: *Fishia nigrescens* and *Lasionycta staudingeri*
are not close relatives, and that implausibility is what made the collision worth chasing.

Each correction is independently corroborated by MPG, which we had already scraped and never
compared against: for all six Poole numbers the corrected value equals MPG's own page number for
that species (`data/checklist-order.csv`, matched on genus + epithet, so the agreement is not
circular). `data/mpg-taxa.csv` also confirms `6387.1` for *Digrammia sexpunctata* and explains how
that collision arose — MPG records it as *"a synonym of 6373 Digrammia denticulata"* until it was
split out under its own number, which our data never followed.

Three collisions remain, and all three are known and accepted: `93-0907` (*Drasteria*, merging on
#265 / C-016), `93-0801` (*Catocala*, on hold pending Lars Crabo — #265 / C-019), and `93-0008`
(*Clostera*, the post-imaging split explained on #110 / C-009). That is the curator-approved
baseline [ADR 0033](adr/0033-referential-integrity-gate.md) said a future `noc_id` collision report
would need before it could be written; that report is now tracked on
[#290](https://github.com/pnwinsects/pnwmoths/issues/290), which also proposes checking `noc_id`
against MPG wholesale — a comparison that would have caught all seven of these without asking.

Changed seven `noc_id` cells in `data/species.csv`. Nothing on the site renders differently — the
field is displayed but not joined on — and `data/checklist-order.csv` regenerates byte-identical,
because all seven species already matched MPG on name rather than number.

## C-020 · 2026-08-05 · *Schizura ipomaeae* stays in *Schizura*

**Source** [#269 issue body](https://github.com/pnwinsects/pnwmoths/issues/269), the curator's own
words · **Status** Applied ([PR #282](https://github.com/pnwinsects/pnwmoths/pull/282)) ·
**Supersedes** part of C-012

> Currently, Schizura ipomaeae has a page on the site but the genus doesn't appear on the Browse
> page. I suspect this was from when we migrated two species (conspecta, unicornis) from Schizura
> to Coelodasys. Schizura ipomaeae should remain within Schizura, nested within Notodontidae:
> Heterocampinae.

Deleted its row from `data/unpublished-species.csv`; `data/species.csv` already had the placement
right. The genus is back on Browse with one species, and the factsheet, records, Checklist row and
search entry all returned. The stale page Merrill saw was an additive-deploy leftover
([ADR 0008](adr/0008-deploy-bunny-additive.md)) — published before C-012, never removed from the CDN.

## C-019 · 2026-08-05 · Two of three found-while-matching merges confirmed; *Catocala allusa* held

**Source** [#265 comment](https://github.com/pnwinsects/pnwmoths/issues/265#issuecomment-5195492377), the curator's own words ·
**Status** Applied (the two confirmed merges — C-023); the *Catocala allusa* hold is resolved by C-025 (two
species stand; renamed *cleopatra*) · **Refined by** C-025

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

**Source** [#268 comment](https://github.com/pnwinsects/pnwmoths/issues/268#issuecomment-5195457970), the curator's own words ·
**Status** Applied ([ADR 0029](adr/0029-removing-a-species.md))

> Go ahead and entirely delete Hemileuca nuteglan from the site, including any records associated
> with it. Having a query for the page redirect to a 404 is fine.

A hybrid population (*H. nuttalli* × *eglanterina*), not a described species — so neither the
deny-list nor a redirect fit. Species row and all 13 occurrence records deleted from every file.
This is the decision that established the third exit from the catalogue: a name that should never
have been in it, distinct from *provisional* (C-004) and *superseded* (C-016).

## C-017 · 2026-08-05 · Records and images follow the name; *marmorata* disambiguated

**Source** [#259 comment](https://github.com/pnwinsects/pnwmoths/issues/259#issuecomment-5195750440), the curator's own words ·
**Status** Applied (renames); Applied (merges — C-023); Applied (*Macaria marmorata* → *M. signaria* — #294; its
four CDN objects were part of the #232 never-landed batch, so only the name mapping is recorded, see #48)

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

**Source** [#259 comment](https://github.com/pnwinsects/pnwmoths/issues/259#issuecomment-5172589343), the curator's own words ·
**Status** Applied (renames); Applied (merges — C-023)

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

**Source** [#23 comment](https://github.com/pnwinsects/pnwmoths/issues/23#issuecomment-5169980381), the curator's own words ·
**Status** Applied ([ADR 0026](adr/0026-inaturalist-project-sync.md))

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

**Source** [#218 comment](https://github.com/pnwinsects/pnwmoths/issues/218#issuecomment-5160842499), the curator's own words ·
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

**Source** [#172 comment](https://github.com/pnwinsects/pnwmoths/issues/172#issuecomment-5038674149), the curator's own words ·
**Status** Applied ([ADR 0018](adr/0018-phenology-reared-exclusion.md)) · **Extends** C-002

> only records from iNat with life stage included and as "adult" would be eligible for having the
> date added to our date information. All records with life stage of egg, larva, or pupa would have
> the date moved to the notes field. All records without life stage information would have date
> moved to the notes field.

Unannotated is treated as non-adult — the conservative default, so a forgotten annotation cannot
silently pollute a phenology graph. The date is preserved in `notes`, never discarded, and the
record still plots on the map.

## C-012 · 2026-07-21 · Launch cleanup batch

**Source** [#157 issue body](https://github.com/pnwinsects/pnwmoths/issues/157) — a maintainer's
restatement of the curator's Browse review, not his words · **Status** Applied; the *Schizura* item
**superseded by C-020**

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

**Source** [#156 issue body](https://github.com/pnwinsects/pnwmoths/issues/156) — a maintainer's
restatement, echoed in the `reason` column of `data/unpublished-species.csv` · **Status** Applied

Not featured on the legacy site and with no completed species account, so it is deny-listed for now
— *"omitted for now — occurrence records retained."* Recorded as a restatement, in
`data/unpublished-species.csv`.

The companion call: `oedemasia-salicis` is the canonical current-genus target of the
`schizura-concinna` redirect and **must stay visible**; it does not inherit the hide that applied to
the name it replaced (C-005).

## C-010 · 2026-07-06 · Species to add to the Identify key

**Source** [#19 comment](https://github.com/pnwinsects/pnwmoths/issues/19#issuecomment-4896823722), the curator's own words ·
**Status** Pending

A 25-name list from Merrill's own earlier notes (*Catocala meskei*, *Admetovis icarus*,
*Tarache acerba*, … see the comment), plus a standing request: report which species have published
pages but no key row. The gap is tracked in `data/key-coverage-report.json`.

**Refined by C-022**, which puts the *Lacinipolia sareta* item of this list on hold.

## C-009 · 2026-07-03 · *Clostera brucei* photos are mostly *C. multnoma*

**Source** [#110 comment](https://github.com/pnwinsects/pnwmoths/pull/110#issuecomment-4879914499),
the curator's own words · **Status** Applied via [#156](https://github.com/pnwinsects/pnwmoths/issues/156)

> Regarding the Clostera brucei photos, only the Colorado specimen is brucei. The others (Scatter Cr,
> Tiffany Mdws) are Clostera multnoma and should be re-mapped to that species […] This was the result
> of a taxonomic split that post-dated when we imaged the specimens. There will likely be a few
> others like this, so we should be on the lookout for species accounts missing images.

The general warning is the durable part: a specimen photographed before a split carries the
pre-split name, so **an image filename is never evidence of identity.** This is the curatorial
counterpart of the invariant that join slugs are never derived from image filenames.

**Refined by C-022**, the same pattern in *Lacinipolia* — where, unlike here, the curator cannot yet
say which specimen is which.

## C-008 · 2026-07-03 · Content-free pages must not appear in Browse or Search

**Source** [#106 issue body](https://github.com/pnwinsects/pnwmoths/issues/106), the curator's own
words · **Status** Applied

> Species with pages devoid of content are appearing in Browse, such as Noctuidae: Noctuinae: Egira
> shows Egira aff. curialis, and the link to its page shows a page without images or other content.
> This species shouldn't be in Browse or Search and shouldn't have a species account.

A page with no prose, photos or records is not a species account, and an empty page is worse than an
absent one. Restated for provisional names in C-017.

## C-007 · 2026-07-03 · *Callopistria floridensis* and *Clostera brucei* added

**Source** [#84 comment](https://github.com/pnwinsects/pnwmoths/issues/84#issuecomment-4879058926), the curator's own words ·
**Status** Applied

> Callopistria floridensis should be added. Noctuidae: Eriopinae: Callopistria are the higher taxa
> for it. Clostera brucei should be added. Notodontidae: Pygaerinae: Clostera are its higher taxa.

Additions come with their higher taxa and their records/photos from the curator — the reciprocal of
the exclusions in C-005 and C-006.

## C-006 · 2026-07-03 · Twelve legacy drafts stay unpublished; images retained

**Source** [#84 comment](https://github.com/pnwinsects/pnwmoths/issues/84#issuecomment-4879087584), the curator's own words ·
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

**Source** [#84 comment](https://github.com/pnwinsects/pnwmoths/issues/84#issuecomment-4879116956), the curator's own words ·
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

**Source** [#80 comment](https://github.com/pnwinsects/pnwmoths/issues/80#issuecomment-4878597896), the curator's own words ·
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

**Source** [#73 comment](https://github.com/pnwinsects/pnwmoths/issues/73#issuecomment-4849743794), the curator's own words ·
**Status** Applied as hiding, not deletion · **Refined by** C-014

> For issue 73, Euthyatira lorata should be in Drepanidae: Thyatirinae. The other four species can
> all be dropped from the new site as they don't occur in the region.

The four — *Macrochilo bivittata*, *Xylophanes* nr. *libya*, *Holoarctia* sp., *Pseudeustrotia
carneola* — were later treated more finely in C-014: *Holoarctia* to be removed, the other three
given checklist positions but kept out of Browse until they have accounts. **"Drop from the site"
softened to "place but don't publish"** — a drift worth seeing, and the reason both entries
cross-reference. All four are deny-listed today; none was deleted.

## C-002 · 2026-06-29 · Reared and immature records excluded from phenology; foodplant terms not

**Source** [#59 comment](https://github.com/pnwinsects/pnwmoths/issues/59#issuecomment-4836009937), the curator's own words ·
**Status** Applied ([ADR 0018](adr/0018-phenology-reared-exclusion.md))

> we could have any dates for reared specimens moved to the notes field. That way, the data would
> continue to not be used for the graph, but would be viewable when clicking dots on maps.

And, on the inherited legacy keyword list:

> Also, let's remove the host plants from that list. Sometimes, the notes field will have plant
> genera for flowers visited by adults, and we wouldn't want those data excluded from the graphs.

So `Rubus`, `Taraxacum` and `broadleaf` are **not** rearing evidence: a plant name in `notes` may
record a nectar source for an adult. Extended to iNaturalist in C-013.

## C-001 · 2026-06-27 · Geometridae withheld until records and accounts exist

**Source** [#48 issue body](https://github.com/pnwinsects/pnwmoths/issues/48) — written by a
maintainer, not the curator · **Status** On hold; gate applied
([ADR 0015](adr/0015-data-driven-gating.md))

The family is held out of pages, Browse, Identify and search because its occurrence records were
never sourced and its species accounts were never written. **A hold, not a deletion** — the data
stays in place and the family switches back on by deleting one line from
`data/withheld-families.csv` once both are done. Recorded from the issue, not from the curator
directly.

The consequence that keeps surfacing: the four geometrid merges on #265 have no prose to compare and
no occurrence records to move, because nothing was ever written for them.
