# 0032. Curatorial decisions get their own append-only log, separate from ADRs

**Status:** Accepted
**Date:** 2026-08-06
**Issues:** [#269](https://github.com/pnwinsects/pnwmoths/issues/269),
[#265](https://github.com/pnwinsects/pnwmoths/issues/265),
[#157](https://github.com/pnwinsects/pnwmoths/issues/157)

## Context

The product's memory had a place for engineering decisions (`docs/adr/`), for work in flight
(GitHub Issues), for vocabulary (`CONTEXT.md`) and for debt (`docs/concerns.md`) — but not for the
curator's calls about the catalogue itself. Those were recorded three ways, none of them durable:

- **A `reason` column in the data file the decision acted on.** `data/unpublished-species.csv`,
  `data/species-redirects.csv` and `data/cdn-retired-images.csv` all carry one. Precise, adjacent to
  the effect, and **deleted along with the row when the decision is reversed.**
- **An issue comment.** Authoritative and quotable, but closed issues are not somewhere anyone looks,
  and one decision is often spread across several threads: the six merges on #265 were confirmed
  across #218, #259 and two comments on #265.
- **Prose in a commit message or a code comment.** Which is where it drifts.

Three failures made the gap concrete:

1. **#157 → #269.** *Schizura ipomaeae* was hidden in July because "no species remains published
   under *Schizura*." In August the curator reversed it. Applying the reversal deleted the CSV row —
   and with it the only statement of the original reasoning outside git history. The reversal is
   correct, but nothing in the tree now explains why the species was ever hidden.
2. **Drift into a test comment.** The #84 legacy-CMS exclusion applied to *Schizura concinna*. A test
   comment had come to assert it applied to *Schizura ipomaeae* — a plausible-sounding claim that
   took root because the fact had no home.
3. **Softened decisions read as reversals.** "Drop these four species from the site" (#73) became
   "give them checklist positions but keep them out of Browse until they have accounts" (#218).
   Without both recorded, the second looks like someone ignoring the first.

An ADR is the wrong shape for these. ADRs are few, long, and argue a design with rejected
alternatives; curatorial calls are many, short, and are not arguments at all — they are rulings.
Filing twenty of them as ADRs would bury the architecture records they sit beside.

## Decision

**Curatorial decisions go in [`docs/curation-log.md`](../curation-log.md): one append-only,
numbered, newest-first log, whose entries are pointers plus the *why*.**

- **Scope is what the catalogue contains** — inclusions, exclusions, names, merges, synonymies,
  placements, photo attributions, record-admission policy. Engineering stays in ADRs; how gating is
  implemented is [ADR 0015](0015-data-driven-gating.md), while *which taxa are gated* is the log.
- **Entries are numbered `C-nnn` in chronological order and never renumbered or deleted.** A
  reversal is a new entry naming the one it supersedes, and the superseded entry gets a
  back-pointer — the same rule as superseded ADRs, for the same reason.
- **Quoted text is the curator's own words, linked to the source comment.** Where the only record is
  someone else's restatement, the entry says so. #157 was a restatement, and its *Schizura* item was
  the one that turned out to be wrong; the provenance distinction is load-bearing, not decorative.
- **The entry is added in the PR that acts on the decision**, next to the data change. A log
  maintained separately from the work is a log that stops being written.
- **The `reason` columns stay.** They are the decision at the point of use and they make a CSV
  self-explanatory; the log is what survives the row's deletion. Cheap duplication, different jobs.

## Consequences

- **A reversal now has something to cite.** C-020 names C-012 and explains what changed, so the next
  person to wonder why a species is hidden reads one file instead of reconstructing intent from
  `git log`.
- **The `curation` label gets a companion.** `gh issue list --label curation` is the queue of
  decisions *pending*; the log is the record of decisions *made*. Neither replaces the other.
- **It backfills to 20 entries** spanning 2026-06-27 to 2026-08-05, reconstructed from issue
  comments. Backfilling surfaced things nobody had written down: that the curator's stated
  preference for provisional morphospecies was outright deletion and hiding was the fallback (C-004,
  which reads against ADR 0029's framing of the deny-list); that the 2 km iNaturalist accuracy
  ceiling is a curator standard rather than a technical limit (C-015); and that *Macaria marmorata*
  and *Stamnodes marmorata* are similar names with opposite outcomes (C-017).
- **One more file to keep current**, and it will decay if entries are written after the fact rather
  than with the change. The mitigation is the size of an entry: a date, a link, a quote, and what
  changed in `data/`.
- **It is written for a non-technical reader.** The curator can check whether a decision was
  recorded as he meant it, which is a form of review no test provides.

## Alternatives rejected

- **One ADR per curatorial decision.** Correct in spirit, wrong in scale: twenty short rulings would
  dominate a directory of thirty-one architecture records, and "*Idia concisa* keeps its name" has no
  rejected alternatives to weigh.
- **A single ADR listing all curatorial decisions.** It would be edited in place, which loses the
  chronology and the supersession trail — the two things the *Schizura* reversal needed.
- **Rely on the `reason` columns alone.** They are the status quo, and they die with the row.
- **Rely on GitHub Issues alone.** Also the status quo. Issues are the right home for the
  conversation and the wrong home for the conclusion: they close, they scatter one decision across
  threads, and they are not in the repo when it changes hands.
- **A `data/curation-log.csv` instead of Markdown.** Machine-readable, but these entries are prose
  with quotes and cross-references, and nothing needs to query them. Markdown is also what the
  curator can read and correct without a build.
