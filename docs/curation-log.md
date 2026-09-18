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

## C-034 · 2026-09-18 · The legacy site illustrated *Notarctia arizoniensis* and *N. proxima* with the same two moths; which species they are is still open

**Source** the legacy media library at `dev.pnwmoths.biol.wwu.edu/media/moths/`, checksummed and
date-stamped; put to the curator on [#376](https://github.com/pnwinsects/pnwmoths/issues/376) ·
**Provenance** NOT the curator's words and not a ruling of any kind — a maintainer's reading of
legacy files · **Status** On hold — awaiting the curator (#376) · **Refines** C-033

C-033 left one question genuinely his: the *Apantesis arizoniensis* account publishes four
photographs named `Notarctia proxima-*.jpg`, and *A. proxima* is still a species (MONA 8181) we hold
no account for. This entry records what checking the legacy store did and did not establish, because
**the first reading of it was wrong and was briefly published** — on #376, in a comment telling the
curator he need not answer.

**What is true.** The legacy media library holds all four photographs a second time under
`Notarctia arizoniensis-*.jpg`, byte-identical (equal SHA-256 on every pair). They are two distinct
files, not one aliased: no redirect, and distinct `ETag`s. A fabricated filename 404s and a different
species returns different bytes, so the server is not answering everything with the same image. What
the site publishes today is a re-encode of those same images — RMSE ≈ 0.014, against 0.217 for a
genuinely different moth, the signature the #330 post-mortem describes.

**What is not true**, though it was written down first: that this shows a re-determination. It does
not. The two sets were stored **eighty seconds apart**, inside the single 2013-08-04 batch that
loaded the whole library:

| | as *N. arizoniensis* | as *N. proxima* |
| --- | --- | --- |
| A dorsal | 12:17:00 | 12:18:18 |
| A ventral | 12:17:10 | 12:18:44 |
| B dorsal | 12:17:41 | 12:19:06 |
| B ventral | 12:18:06 | 12:19:27 |

Nothing was renamed afterwards. **The legacy site carried both species and illustrated both with the
same two specimens** — which is a catalogue fact worth having on its own, and possibly not unique to
this pair; nobody has checked the rest of the legacy store for byte-identical cross-species sets.

**How the error happened**, since that is the reusable part. Byte-identity was read as a *sequence*
— old name, then corrected name — when the evidence only showed *coexistence*. The headers that
distinguish the two readings (`Last-Modified`, `ETag`) were never requested, because every fetch used
`curl -L`, which follows redirects silently and reports nothing about the response it followed. **A
checksum says two files match; it says nothing about which came first, or why.** The same care ADR
0038 demands about filenames applies to their timestamps.

Also corrected here: [`docs/reference/data-provenance.md`](reference/data-provenance.md) claimed the
legacy server normalises spaces and underscores in media filenames. It does not — `Grammia_doris-A-D.jpg`
and `Holoarctia_sordida-A-D.jpg` both 404 where the space-separated forms return 200.

**Nothing is recorded in `data/photo-determinations.csv`.** A row there governs; asserting one on an
inference this entry withdraws would be worse than the silence it was meant to fix. The determination
stays with the curator on #376, where the question is now posed plainly again.

**What changed** — this entry, and one sentence in `docs/reference/data-provenance.md`.

## C-033 · 2026-09-18 · The fourteenth retired-genus key name — *Notarctia arizoniensis* — was ours to answer, not the curator's

**Source** `data/mpg-taxa.csv` row P930277, transcribed · **Provenance** NOT the curator's words, and
not a new ruling: the Moths Photographers Group list committed to this repo states the combination
outright · **Status** Applied · **Refines** C-032 · **Refined by** C-034

C-032 put thirteen key binomials onto their current names and held one back, saying *Notarctia
arizoniensis* "needs Merrill, not a maintainer." **That was wrong, and the way it was wrong is the
[#330](https://github.com/pnwinsects/pnwmoths/issues/330) failure in miniature** — a question sent to
the curator that the repo already answers. [`docs/agents/asking-the-curator.md`](agents/asking-the-curator.md)
exists to catch exactly this, and running its first check catches it: `data/mpg-taxa.csv` P930277 reads

> *Apantesis arizoniensis* (Stretch, 1873), formerly in the genus *Notarctia*, Systematic Entomology:
> 41(4): 844-853, is elevated from synonymy of 8181 *N. proxima*.

So the key's *Notarctia arizoniensis* and our `apantesis-arizoniensis` are one species, on the same
authority that already governs checklist order ([ADR 0030](adr/0030-checklist-order-from-mpg.md)).
The row is a transcription. `meta.matchedSpecies` 1,207 → 1,208, and the account has an Identify card
for the first time.

**What was genuinely his, and still is.** The same MPG sentence says *arizoniensis* was *elevated from
synonymy of* *Apantesis proxima*, which still stands as MONA 8181 and which we hold no account for.
The four photographs that account publishes are named `Notarctia proxima-*.jpg`. Either they are
*arizoniensis* specimens carrying the name everything went under before the split — the ordinary
[ADR 0038](adr/0038-photo-identity-is-data-not-filename.md) case — or the account has been publishing
a different species. That is a determination, it is on
[#376](https://github.com/pnwinsects/pnwmoths/issues/376), and it is unaffected by this entry: the
name *Apantesis arizoniensis* is right for the species whatever the photographs turn out to be.

**The lesson, which is not about this moth.** C-032 sorted its candidates by evidence and then filed
the one case whose evidence was *ambiguous* as a curator question, without first asking whether a
different artifact settled it. Compound findings split into a name question and a specimen question,
and the name question is almost always ours. Answer our own half before writing anything down as his.

**What changed** — one row in `data/species-synonyms.csv`; `data/key-matrix.json` and
`data/key-coverage-report.json` rebuilt; four more high-resolution TIFFs promoted out of `genus-only`
in `data/species-photos-manifest.csv`. Nineteen key binomials remain unmatched.

## C-032 · 2026-09-18 · Thirteen key binomials name a published species under a genus we have already retired

**Source** this PR, extending the [#278 ruling](https://github.com/pnwinsects/pnwmoths/issues/278#issuecomment-5655356221) ·
**Provenance** NOT the curator's words. The identifications are read out of `data/images.csv` — see
below — and the extension was a maintainer's call, approved by the repo owner, not Merrill's ·
**Status** Applied · **Refines** C-031 · **Refined by** C-033

C-031 fixed one instance of a defect that turns out to be general. The Lucid key's binomials are the
names in use when the key was authored; the catalogue has moved on; `scripts/build-key.ts` joins the
two by binomial. Where the genus changed and nobody wrote a synonym row, **a species with a page,
photographs and records has no Identify card at all**, and nothing reports it — the species is simply
absent from a matrix of 1,228.

*Chelis sordida* was one of thirteen more:

| The key says | We publish it as | What our own data already says |
| --- | --- | --- |
| *Odontosia elegans* | `pheosidea-elegans` | holds `Odontosia elegans-A-D.jpg` |
| *Neoarctia beanii* | `chelis-beanii` | holds `Neoarctia beanii-A-D.jpg` |
| *Neoarctia brucei* | `chelis-brucei` | holds `Neoarctia brucei-A-D.jpg` |
| *Holarctia obliterata* | `apantesis-obliterata` | holds `Holarctia obliterata-A-D.jpg` |
| *Parasemia plantaginis* | `arctia-plantaginis` | holds `Parasemia plantaginis-A-D.jpg` |
| *Pararctia yarrowii* | `arctia-yarrowii` | holds `Pararctia yarrowii-A-D.jpg` |
| *Platarctia parthenos* | `arctia-parthenos` | holds `Platarctia parthenos-A-D.jpg` |
| *Platyprepia virginalis* | `arctia-virginalis` | holds `Platyprepia virginalis-A-D.jpg` |
| *Simyra insularis* | `acronicta-insularis` | holds `Simyra insularis-A-D.jpg` |
| *Heliothis virescens* | `chloridea-virescens` | holds `Heliothis virescens-B-D.jpg` |
| *Aseptis adnixa* | `paraseptis-adnixa` | same epithet, same family; genus segregation only |
| *Aseptis marina* | `viridiseptis-marina` | same epithet, same family; genus segregation only |
| *Protorthodes texana* | `nudorthodes-texana` | same epithet, same family; genus segregation only |

**The evidence, and its limit.** For the first ten, the species account already publishes a
photograph *whose filename is the key's binomial* — a previous maintainer moved that file onto that
slug, which is the catalogue asserting the two names are one taxon (ADR 0038). Reading it back out is
transcription, not a new ruling. The last three have no such file: they rest on same epithet, same
family, and a genus segregation the catalogue has already adopted (*Protorthodes* → *Trichopolia* is
the same move, curator-confirmed on #259). **If any of the three is wrong, the symptom is a wrong card
in Identify** — delete the row from `data/species-synonyms.csv` and rebuild.

**A same epithet is not enough on its own**, which is why this list is thirteen and not twenty. The
key's *Plagiomimicus tepperi* has a same-epithet twin in *Anicla tepperi* — and is nonetheless our
`plagiomimicus-yakama`, because that is where its photograph is filed. Coincidence of epithet within
a family is common; the filed photograph is what distinguishes it.

**Open, for the curator.** *Notarctia arizoniensis* is deliberately absent. It looks like the same
case — we publish *Apantesis arizoniensis* — but that account's photographs are named **`Notarctia
proxima-*.jpg`**, an epithet found nowhere in `data/species.csv`. Either *proxima* is a synonym of
*arizoniensis* and the row is safe, or the account is publishing a different species' photographs,
which is the #330 defect. It needs Merrill, not a maintainer.

**Left unmatched: 20 key binomials.** Eleven more are the same shape but with the *epithet* changed
too (*Pheosia rimosa* → `pheosia-californica`, *Lacinipolia vicina* → `lacinipolia-sareta`,
*Lithophane jefferyi* → `lithophane-jeffreyi`, and eight others). Each is a synonymy or a spelling
ruling, not a genus transcription, so each is a curator decision of the C-016/C-017 kind. The rest
are key species we do not hold, or hold under the deny-list (*Hemileuca juno*).

**What changed** — 13 rows in `data/species-synonyms.csv`; `data/key-matrix.json` and
`data/key-coverage-report.json` rebuilt (`meta.matchedSpecies` 1,194 → 1,207);
`data/species-photos-manifest.csv` promoted 30 more high-resolution TIFFs out of `genus-only`.

## C-031 · 2026-09-13 · *Holoarctia* sp. is *Chelis* sp. and stays unpublished; the key's *Holoarctia sordida* is *Chelis sordida*

**Source** [#278 comment](https://github.com/pnwinsects/pnwmoths/issues/278#issuecomment-5655356221),
the curator's own words · **Status** Applied (this PR; the CDN copy is a maintainer run of
[`scripts/migrate-holoarctia-chelis-photos.ts`](../scripts/migrate-holoarctia-chelis-photos.ts)) ·
**Refines** C-014 · **Refined by** C-032

> Holoarctia sp-A-* should be renamed to "Chelis sp-A-*" so we can retain the images. We do not have
> an account for this species, so the images should not be published.
>
> Holoarctia sordida-A-*, Holoarctia sordida-B-*, and Holoarctia sordida-C-* are all Chelis sordida.

Why it matters: C-014 said *Holoarctia* "can be removed", and #278 was open for six weeks on the
question of **which *Chelis* the two photographs belong to** — the assumption being that they had to
land on a species we already hold, because a genus with no account cannot be published. The answer
is that they do not land anywhere. **The species is renamed and keeps its own photographs, gated.**
A moth we cannot name to species is still a *Chelis*, and the ruling says to hold the pictures under
that name rather than force them onto a neighbour or throw them away. That makes the deny-list the
destination, not a holding pen — the thing #278 was waiting for.

"Renamed to Chelis sp-A-*" is a ruling about the **species**, not about the files. The two JPEGs
stay `Holoarctia sp-A-D.jpg` and `Holoarctia sp-A-V.jpg`: a filename is a permanent opaque
identifier and a photograph's species is data ([ADR 0038](adr/0038-photo-identity-is-data-not-filename.md)).
*Chelis sordida* has carried `Holoarctia sordida-*.jpg` on the same principle since the site was
built. What moves is the **CDN folder**, which is keyed by `species_slug`.

The second sentence answers a different question than it appears to. Our catalogue has said *Chelis
sordida* all along — the name that still said *Holoarctia* was the **Lucid key's**, and
`scripts/build-key.ts` joins the key to the site by binomial. So *Chelis sordida* had a species page
and no Identify card, in the same way *Schizura ipomaeae* did (C-029). One synonym row fixes it. The
same row also resolves the six high-resolution TIFFs the photo manifest had parked as `genus-only`;
they are tileable now, on a future tiling run.

**What changed** — `data/species.csv` (`Holoarctia sp` → `Chelis sp`, with *Chelis*'s subfamily and
tribe); `data/images.csv`, `data/image-derivatives.csv`, `data/unpublished-species.csv`,
`data/checklist-order.csv`, `src/_data/speciesSlugs.json` (`holoarctia-sp` → `chelis-sp`);
`data/species-synonyms.csv` and `data/species-photos-manifest.csv` (*Holoarctia sordida* →
`chelis-sordida`); `data/cdn-retired-images.csv` (six objects).

**Not done, on purpose** — no `data/species-redirects.csv` row. A redirect stub is a page linking to
`/species/chelis-sp/`, which is never emitted; `holoarctia-sp` has been deny-listed since the site
was built and has no URL anyone can have followed.

## C-030 · 2026-09-13 · The tiled "Macaria decorata" specimens are *Speranza decorata*; *Digrammia decorata*'s views were swapped

**Source** [#303 comment](https://github.com/pnwinsects/pnwmoths/issues/303#issuecomment-5655174353),
the curator's own words (quoted without the comment's two broken link brackets) · **Status** Applied
(this PR) · **Refines** C-026

> The the tiled specimen A and the legacy Speranza decorata specimen A are both _Speranza decorata_.
>
> The images of _Digrammia decorata_ on the dev site are indeed _Digrammia decorata_, but note that
> the D and V are reversed for both specimens (A and B).

Why it matters: C-026 held these tiles back because two readings disagreed. The name "Macaria
decorata" is MPG's combination for *Speranza decorata*, but to a non-expert eye the tiled moths
looked nothing like our legacy *Speranza decorata* photographs. **The name was the reliable
evidence; the resemblance test was not.** The question on #303 covered specimens A and B as one set,
and the curator's answer links A, so B moves with it.

The tiles take letters **C and D**, because the legacy *Speranza decorata* photographs already hold A
and B. That follows C-026's rule: the incoming photograph takes the next free letter. The filenames
do not change ([ADR 0038](adr/0038-photo-identity-is-data-not-filename.md)).

The four *Digrammia decorata* JPEGs recorded no view or specimen in `data/images.csv`, like the rest
of the #232 batch. Nothing contradicted their filenames, so the Browse card, which skips ventral
photographs, would have led with the underside. They now carry the curator's views, with weights
reordered so each dorsal photograph comes first. The species' four high-resolution TIFFs have the
same filenames and probably the same mistake. The pipeline cannot yet record a view correction for a
TIFF ([#373](https://github.com/pnwinsects/pnwmoths/issues/373)).

What changed (this PR): 4 rows in `data/photo-determinations.csv`;
`data/species-photos-manifest.csv` and `data/species-photos.json` regenerated, moving the tile sets
from `macaria-decorata` A and B to `speranza-decorata` C and D; 16 rows retargeted in
`data/image-derivatives.csv`; the `macaria-decorata` row removed from
`data/referential-integrity-exceptions.csv`; specimen and view filled in on 4 `data/images.csv` rows.

## C-029 · 2026-09-13 · The name stays *Schizura ipomaeae*; the key's *ipomoeae* is an older spelling of it

**Source** [#283 comment](https://github.com/pnwinsects/pnwmoths/issues/283#issuecomment-5655382075),
the curator's own words · **Status** Applied (this PR)

> ipomaeae is correct

The Lucid identification key names this species *Schizura ipomoeae*, so Identify never matched it
to the site's *Schizura ipomaeae* and the species had no Identify card. (C-020 brought it back to
Browse, which is a different problem.)

Why it matters: **the question in #283 leaned the wrong way.** It suggested *ipomoeae* was right,
since the name honours the morning-glory genus *Ipomoea*, and that the site had inherited a typo.
The MPG checklist (`data/mpg-taxa.csv`, Hodges 8005) records the opposite. Miller et al. (2021)
restored Doubleday's original spelling *ipomaeae*. Hodges et al. (1983) had corrected it to
*ipomoeae* and listed *ipomaeae* as an incorrect original spelling, and the key follows that older
checklist. That history is MPG's note, not the curator's words. It explains why the key disagrees,
and why renaming the species to match the key would have gone against the current checklist.

What changed: one row in `data/species-synonyms.csv` (`Schizura ipomoeae` → `schizura-ipomaeae`).
The regenerated `data/key-matrix.json` and `data/key-coverage-report.json` now match 1,193 key
species (was 1,192) and leave 34 unmatched (was 35). The species name, URL and photographs are
unchanged.

## C-028 · 2026-08-24 · Eleven species accounts published another species' photographs; the tiles move, the filenames do not

**Source** [#330 comment](https://github.com/pnwinsects/pnwmoths/issues/330#issuecomment-5400837287)
and [#336 comment](https://github.com/pnwinsects/pnwmoths/issues/336#issuecomment-5401307703),
the curator's own words · **Status** Applied (determinations, catalogue letters, tile re-key — this PR);
Pending (uploading the untiled *A. keiferi* and *N. frigidana* TIFFs — #342) · **Refines** C-026

Asked which of a set of apparently unregistered photographs to publish, the curator answered by
redetermining nine of them and crossing a tenth pair:

> 3: All images with filename Amphipoea senilis are actually Amphipoea keiferi. The images with
> filename Amphipoea keiferi are actually Resapamea innota.
> 4: Aseptis ethnica-A-D and Aseptis ethnica-A-V are actually Aseptis fanatica.
> 5: Enargia fausta-A-D and Enargia fausta-A-V are actually Enargia infumata.
> 6: Lacinipolia olivacea-D-D and Lacinopolia olivacia-D-V are actually Lacinipolia bucketti
> 7: Nycteola frigidana-A-D and Nycteola frigidana-A-V are actually Lacinipola cinereana
> 8: Proxenus miranda-B-D and Proxenus miranda-B-V are actually Amphipyra tragopoginis
> 9: Resapamea venosa-B-D and Resapamea venosa-B-V are actually Resapamea passer
> 10: Schinia intermontana-A-D and Schinia intermontana-A-D are actually Schinia honesta
> 11: Smerinthus cerisyi-A-D and Smerinthus cerisyi-A-V are actually Smerinthus ophthalmica

and, on #330 Q1, *"Filenames with ducta are actually tenera and vice versa"*; on #336 item 11,
*"Tarache areli-C-D and C-V are actually Tarache toddi."*

Why it matters: **`data/images.csv` already recorded every one of these determinations that it
carries a row for.** (Two do not have one: `Mniotype ducta-A-V` and `Resapamea venosa-B-V` exist
only as high-resolution TIFFs, with no catalogued JPEG — which is why check A in
`check-photo-determinations.ts` accepts a determination matched by the manifest alone.) The
question #330 asked — publish these or leave them? — rested on a false premise, and the objects it
listed are re-encoded copies of the same photographs left at their pre-redetermination paths
(identical dimensions, RMSE ≈ 0.014; ~15% smaller, which is why the checksum-based duplicate scan
in #331 did not pair them). Nothing needed publishing.

What the answers did surface is that the *tiles* never got the determinations. They are keyed by
the photo manifest's `species_slug`, derived from the TIFF's filename, and
`src/species/species.njk` renders a species' tiles **instead of** its catalogued photographs. So
eleven accounts published another species' photographs at full resolution while `data/images.csv`
was correct throughout — the *Amphipoea keiferi* page showed nothing but *Resapamea innota*.
Verified per tile against both candidate photographs before anything was moved. `tarache-areli`
was not in #330 at all; it has no leftover object in its CDN folder, so the inventory could not
see it.

Two of the curator's lines needed reading rather than transcribing, and both are recorded in
`data/photo-determinations.csv` rather than silently corrected. *"Lacinipola cinereana"* (7) is
not a species: the congener is ***Nycteola* cinereana**, which is what `data/images.csv` already
said. (10) names `Schinia intermontana-A-D` twice where the pair is the dorsal and its ventral.

The open question from (1) — *"I will need to see if we have a ventral for tenera"* — resolves
**yes**. No tenera ventral exists as a JPEG, but `Mniotype ducta-A-V.tif` is uploaded and tiled,
and by the curator's own crosswise rule that file is *tenera*. It was being shown on the *ducta*
account; the swap gives both species a complete dorsal-and-ventral pair.

Letters follow C-026 — the incoming photograph keeps its letter unless the destination already
uses it, in which case it takes the next free one, and the incumbent is never renumbered:
*innota* A→C, *fanatica* A→B, *infumata* A→D, *cinereana* A→C, *passer* B→D, *honesta* A→C,
*ophthalmica* A→B; *bucketti* D, *tragopoginis* B, *toddi* C and both *Mniotype* A were free and
kept. Filenames are **not** rewritten ([ADR 0038](adr/0038-photo-identity-is-data-not-filename.md)),
which reverses the C-023 practice of re-lettering them — that practice is why ten of the 83
photographs in #232 could not be found on the legacy host under their catalogued names.

What changed (this PR): `data/photo-determinations.csv` added, 28 rulings;
`data/images.csv` 13 specimen letters; `data/species-photos.json` regenerated through the new
determinations layer; 2,698 tile objects re-keyed on the CDN
(`scripts/migrate-determined-photo-tiles.ts`); 88 rows retargeted in
`data/image-derivatives.csv`; 163 rows added to `data/cdn-retired-images.csv` (110 vacated tile
thumbnails and variants, 23 legacy JPEGs at pre-redetermination paths — including #330 Q2's
`mniotype-species/` pair, confirmed *"Yes"*); `scripts/check-photo-determinations.ts` added to
`build:site`.

## C-027 · 2026-08-24 · The 83 Geometridae photographs still exist; they were never a curator question

**Source** [#330 comment](https://github.com/pnwinsects/pnwmoths/issues/330#issuecomment-5400837287),
the curator's own words · **Status** Applied (#232)

> 12: The specific example listed under issue 232 (Dasyfidonia avuncularia - A-D.jpg) does exist on
> the dev site (with the incorrect extra spaces before and after "A" in the filename). Based on
> this, I assume the others are there too, but I can't confirm without a list.

Why it matters: he was right, and he should never have been asked. **All 83 exist** on
`dev.pnwmoths.biol.wwu.edu` under `/media/moths/`, which serves them without authentication — so
this was answerable mechanically at any point in the year the question sat open. #330 asked "do
the originals still exist, and do we want these species illustrated?" when only the second half
was ever his to answer, and the second half is moot once the first is *yes*.

73 resolve under the filename `data/images.csv` carries. The other ten are the *Macaria signaria*
merge: C-023 re-lettered their **filenames** (*unipunctaria* B→C and A→D, *submarmorata* A→E,
*marmorata* A→F and B→G), so on the legacy host they exist only under the letters they carried
before it. Reversing that map found all ten. This is the concrete cost of rewriting a filename,
and the reason [ADR 0038](adr/0038-photo-identity-is-data-not-filename.md) forbids it.

The count in `docs/concerns.md` was also wrong: 24 species, not 27.

What changed: 83 originals recovered and uploaded to the CDN, derivatives generated and recorded
in `data/image-derivatives.csv`; `docs/concerns.md` corrected; #232 closed. The Geometridae
embargo (#48) no longer has a missing-photo blocker.

## C-026 · 2026-08-10 · The five stranded-photo species: three return to *Macaria*, two stay *Speranza*, *Digrammia decorata* stands apart

**Source** [#279 comment](https://github.com/pnwinsects/pnwmoths/issues/279#issuecomment-5245197930),
the curator's own words · **Status** Applied (*bitactata*, *colata*, *lorquinaria*, *plumosata* — #303 PR);
On hold (the `macaria-decorata` tile set — which species it depicts is the open question on #303),
resolved by C-030 · **Refines** C-014 · **Refined by** C-030

> For this set of species, we should follow what MPG does:
> Use Speranza bitactata, not Macaria bitactata
> Use Macaria colata, not Speranza colata
> Use Speranza decorata, not Macaria decorata
> Digrammia decorata is a species distinct from Speranza decorata
> Use Macaria lorquinaria, not Speranza lorquinaria
> Use Macaria plumosata, not Speranza plumosata
>
> Images should be renamed as needed (adding new letters A,B,C,D, etc. if necessary to avoid duplicate
> use of a letter)

Why it matters: this settles 5 of the 27 genus disagreements #279 tracks, and it is a per-species
ruling, not a blanket "follow MPG" — for *bitactata* and *decorata* the list keeps *Speranza* even
though our MPG snapshot (`data/mpg-taxa.csv`) titles both rows "Macaria …"; the explicit list is what
was applied. The letters instruction resolves every collision between the stranded high-res sets and
the legacy lettered photos: letters change only where they must (*bitactata* tiles A→D, B→E, C kept;
*colata* legacy A→D, B→E; *plumosata* legacy A→D; *lorquinaria* untouched). The tiled
"Macaria decorata" specimens are deliberately **not** moved: the name historically fits *Speranza
decorata* (Hulst, 1896 — MPG returns it to *Macaria* per Sihvonen & Skou 2015) but the specimens do
not resemble our legacy *Speranza decorata* photos, and a separate "Speranza decorata" TIFF set
exists in the inbox — so which species they depict is a genuine identification question, put to the
curator on #303. Their integrity exception stands until he answers. Side effect: with the catalog
names now matching the TIFF names, the parallel "Speranza …" sets in the #214 photo backlog become
resolvable on a future ingest run.

What changed (#303 PR): three `data/species.csv` rows re-genused in place; images, derivatives,
`species-photos.json`, and the photo manifest re-keyed and re-lettered per the map above; +3
redirects, +4 synonyms; 60 objects recorded in `data/cdn-retired-images.csv`; four of the five
`referential-integrity-exceptions.csv` rows retired; checklist and key artifacts regenerated.

## C-025 · 2026-08-10 · *Catocala allusa* and *C. faustina* stay two species; ours takes the name *cleopatra*

**Source** [#265 comment](https://github.com/pnwinsects/pnwmoths/issues/265#issuecomment-5243497181),
the curator relaying Lars Crabo · **Status** Applied (repo data and CDN copy — #298 PR; 267 objects
copied 2026-08-11; the accounts' argumentative paragraphs await Lars's rewrite once the Gall citation
exists) · **Refines** C-019 and C-021

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
[ADR 0030](adr/0030-checklist-order-from-mpg.md), [ADR 0031](adr/0031-checklist-page.md)); **Partly
applied** (the *Speranza* → *Macaria* question — C-026 ruled five species per-name, the other 22
genus disagreements stay open on [#279](https://github.com/pnwinsects/pnwmoths/issues/279));
**Applied** (the *Holoarctia* question — C-031 ruled a rename to *Chelis*, not a deletion,
[#278](https://github.com/pnwinsects/pnwmoths/issues/278)) ·
**Refines** C-003 · **Refined by** C-026, C-031

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
**Status** Applied — the sync reads the Life Stage annotation and withholds every non-adult date ([ADR 0042](adr/0042-inat-life-stage-gates-record-date.md); the hand-entered side is [ADR 0018](adr/0018-phenology-reared-exclusion.md)) · **Extends** C-002

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
