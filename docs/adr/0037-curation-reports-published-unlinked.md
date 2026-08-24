# 0037. Advisory reports are published at an unlinked `/curation/` index

**Status:** Accepted

## Context

This project produces a lot of advisory reports and almost nobody can read them.

Ten of them exist. Two are written into `_site/` by build steps — `species-audit.csv` and
`records-district-audit.csv` — and both scripts describe themselves in a header comment as
emitting an "UNLINKED diagnostic CSV … referenced by nothing — reachable only by direct URL."
That was accurate and it was the whole problem: a URL nobody has been told is a URL nobody
visits. The other eight live only in `data/`, so reaching them requires a git checkout.

The curator does not have a checkout, and will not. He is the only person who can answer most of
what these reports ask — which species a photograph belongs to, whether two names are the same
animal, whether a coordinate or the county typed beside it is the one to believe. The reports
that most need him are the ones he had no way to see.

The workaround has been to hand-write a GitHub issue for each batch of findings, with numbered
questions and a live link per row ([#330](https://github.com/pnwinsects/pnwmoths/issues/330) is
the pattern). That is the right shape for *asking* — it is answerable in one sitting and the
answers land where decisions are recorded — and it stays. But it is a per-batch, hand-built
artifact. It does not tell anyone what reports exist, what each one is for, or when it was last
regenerated, and a question that has not yet been turned into an issue is invisible.

## Decision

Every advisory report is listed at **`/curation/`**, an unlinked page on the built site.

**One manifest drives both the page and the build step.**
[`src/_data/curationReports.ts`](../../src/_data/curationReports.ts) holds one entry per report:
its question, what a row is, what regenerates it, its files, and its background reading.
[`src/curation/index.njk`](../../src/curation/index.njk) renders that array and hand-lists
nothing; [`scripts/copy-curation-reports.ts`](../../scripts/copy-curation-reports.ts)
(`build:copy-curation-reports`, after `build:eleventy`) copies into `_site/curation/` exactly the
files the same array names. Each file's link `href` is *derived* from its source path rather than
restated, so the copy destination and the link are the same string by construction. A report
listed but not copied is a 404; a report copied but not listed is a file nobody knows exists.
Neither is reachable from this shape.

**It is an index, not a viewer.** The page links raw CSV and JSON. Rendering 95,000 rows of
`legacy-rejoin-report.csv` as HTML would be a worse spreadsheet than a spreadsheet, and the
static-site constraint ([0001](0001-static-no-server.md)) means no filtering or sorting without
shipping the whole file to the client anyway. What the page adds is the part a CSV cannot carry:
what question this file answers, and who is expected to answer it.

**Unlinked, `noindex`, and out of the search index.** The page is absent from the nav and the
footer, sets `robots: noindex, nofollow` through a new opt-in hook in `base.njk`, and carries
`data-pagefind-ignore`, so it contributes nothing to site search. It is reached by bookmark, by
the people maintaining the catalogue — the same shape `/analytics/` already has. The reports are
not secret (this is a public catalogue built from public data in a public repo), so there is
nothing to protect; they are simply not what a visitor came for, and a nav slot spent on internal
QC is a nav slot taken from the moths.

**Curator-facing reports come first.** The manifest is ordered, the page renders that order, and
a test enforces that no `curation` report appears after an `engineering` one. The distinction is
the same one [0032](0032-curation-log.md) draws: a curatorial question needs someone who knows
the moths; a data-quality question needs whoever maintains the data.

**A missing source file fails the build.** The reports are advisory and can never fail a build on
their *findings* — that is what makes them advisory. But a manifest naming a file that is not on
disk is a different thing: it is a broken build, and the copy step exits non-zero listing every
missing path. It writes nothing at all in that case, so a half-populated `/curation/` cannot
ship. The blocking link check would catch it eventually, several minutes later, with a much worse
message.

## Consequences

- The site ships about 7.5 MB more than it did, nearly all of it `legacy-rejoin-report.csv`.
  Uploads are content-hash incremental ([0008](0008-deploy-bunny-additive.md)), so a report that
  does not change is uploaded once and skipped thereafter.
- Adding a report means adding a manifest entry — not a template edit, not a copy-script edit.
  Forgetting the entry is the failure mode this cannot prevent: the report simply stays invisible,
  which is the status quo it was written to fix.
- `/curation/` links to files, not to rows, so it cannot ask a numbered, answerable question about
  a specific photograph. It does not replace the per-batch curation issue; it tells the reader
  which reports those issues are drawn from.
- `npm run dev` does not run the copy step, so report links 404 under `eleventy --serve`. The
  page's own content is correct there; only the downloads are absent.

## Alternatives considered

- **Render each report as an HTML table.** Better for the small reports, unusable for the large
  ones, and it puts a second presentation of every column in a template where it can drift from
  the CSV. Rejected for now; a specific report can still get a rendered page later if its
  question needs one — an image report showing thumbnails is the obvious candidate.
- **Link `/curation/` from the footer.** Honest about what the project checks, but it offers a
  visitor a menu of internal QC artifacts that will read as a list of the site's defects. The
  reports stay public and unprotected; they are just not advertised.
- **Leave the reports in the repo and keep writing issues.** This is what was already happening.
  It works for findings someone has already triaged and fails completely for the ones nobody has
  looked at yet.
- **Compute row counts and file sizes for the page.** Useful, and cheap for the eight reports
  sourced from `data/`, but impossible at Eleventy time for the two the build emits into `_site/`
  afterwards — a page that showed counts for eight of ten reports would read as a bug. Rows are
  described in words instead.
