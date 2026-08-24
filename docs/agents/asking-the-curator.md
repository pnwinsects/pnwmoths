# Asking the curator

The curator is the only person who can say what a moth is. He has no checkout, no build, and no
way to see anything we do not put in front of him. His attention is the scarcest resource this
project has, and every question we send costs some of it — including the wrong ones.

This is the checklist a report must pass before it asks him anything. It exists because
[#330](https://github.com/pnwinsects/pnwmoths/issues/330) asked twelve numbered questions and
**all twelve were answerable without him.**

## What #330 cost

He answered every question. Nine of them (Q3–11) asked whether to publish photographs that
`data/images.csv` had **already** filed under their redetermined species — so he re-made nine
determinations that were sitting in the repo, correctly, the whole time. Q1 was the same thing
again. Q2 asked about two objects the duplicates report already showed as byte-identical to a
published pair. Q12 asked whether 83 files still existed; they were on a public URL that a HEAD
request answers in 40ms.

Then he did it a second time on [#336](https://github.com/pnwinsects/pnwmoths/issues/336),
which asked about the same eleven species from the other side.

Meanwhile the real defect — **eleven species accounts were publishing photographs of a different
species**, at full resolution — was never asked about, because no report looked at what a page
displays. It surfaced only as a side effect of checking his answers against the repo.

That is the failure to avoid: *spending his time on what we could have derived, while the thing
only he could confirm went unasked.*

## The checklist

Before a finding becomes a numbered question, it must survive all five.

### 1. Is it already answered in the repo?

Join the finding against every artifact that could account for it — not just the obvious one.
#330 matched CDN objects to `data/images.csv` **by path** (`<slug>/<filename>`). But the
catalogue registers a photograph by *(slug, filename)*, where the slug is the determination and
the filename is what the moth was called when it was photographed. Those diverge on every
redetermination ([ADR 0038](../adr/0038-photo-identity-is-data-not-filename.md)), so an object at
`<old-species>/<filename>` looks unregistered under a path join and is fully accounted for under
a filename join.

Check `data/images.csv` (by filename as well as by path), `data/photo-determinations.csv`,
`data/cdn-retired-images.csv`, and `docs/curation-log.md`. `emit-cdn-inventory.ts` now emits
`photo-refiled` for exactly this case, and `emit-hidden-images.ts` carries a `determined_by`
column so a settled disagreement stops reading as an open one.

### 2. Is it answered by a cheap external fact?

Q12 asked whether the 83 Geometridae originals still exist. They are served, without
authentication, from `https://dev.pnwmoths.biol.wwu.edu/media/moths/<filename>`. The question sat
open for a year.

If a question can be resolved by an HTTP request, a checksum, or an image comparison, resolve it.
The #330 objects that read as "distinct photographs (distinct checksums)" were the *same*
photographs re-encoded ~15% smaller — identical dimensions, RMSE ≈ 0.014. Two downloads and an
`magick compare` would have said so. Checksum equality is a sufficient test for "same", never a
necessary one.

### 3. Does the difference reach a reader?

Both #330 and #336 report on *storage* and *data*. Neither asked what a species page actually
shows. `src/species/species.njk` renders a species' tiles **instead of** its catalogued
photographs, so for a tiled species `data/images.csv` describes something nobody sees — and the
tiles, keyed off filenames, described something wrong.

State the finding in terms of the rendered page. "The *Amphipoea keiferi* account displays two
photographs, and both are *Resapamea innota*" is worth his time. "18 objects have no row in
`data/images.csv`" is not, and it is the same defect.

### 4. Would any answer change what we do?

If both "publish it" and "leave it" lead to the same work, there is no question. Several #330
items resolved to a row in `data/cdn-retired-images.csv` whichever way he answered.

### 5. Is it his question, or ours?

His: what species is this, is this name correct, are these two the same animal, should this
specimen be shown. Ours: whether a file exists, whether a row joins, which specimen letter avoids
a collision (C-026 already settles that), whether two images are the same image.

Q12 mixed the two — "do the originals still exist, **and** do we want these species illustrated?"
Only the second half was ever his, and it was moot once the first was *yes*. Split compound
questions and answer our own half first; often the remainder disappears.

## When you do ask

The format #330 used is right and should be kept — numbered questions, a live link per file, all
answerable in one sitting, so "3, 7: publish. 5: leave it" is a sufficient reply
([ADR 0037](../adr/0037-curation-reports-published-unlinked.md)). The problem was never the
presentation.

Two additions:

- **Say what the repo already believes**, and ask him to confirm or correct it, rather than
  asking cold. "`data/images.csv` files this under *Resapamea innota*; the filename says
  *Amphipoea keiferi*. Confirm?" is a five-second answer. "Which species is this?" is a
  determination he has already made once.
- **Transcribe his answers verbatim into `data/photo-determinations.csv` or
  `docs/curation-log.md`**, with the quote and a link to the comment. Q1 and Q3–11 were re-asked
  because the previous answers lived only in a `species_slug` cell, which states the conclusion
  and loses that a human ever decided it. That is precisely what
  [ADR 0032](../adr/0032-curation-log.md) exists to prevent, applied to photographs.

## Read his answers carefully

He is writing prose about moths, not filling in a form. In #330 he wrote *"Lacinipola
cinereana"*, which is not a species — the congener is ***Nycteola* cinereana**, and
`data/images.csv` already said so. He also named `Schinia intermontana-A-D` twice where he meant
the dorsal and its ventral.

Both are obvious in context and neither should become a follow-up question. Record the reading
you took, and why, next to the quote — do not silently "fix" him, and do not go back to ask.
