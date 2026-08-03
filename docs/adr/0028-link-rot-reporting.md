# 0028. Broken external links are reported to a self-closing GitHub issue, on a two-strike rule

**Status:** Accepted

## Context

[ADR 0027](0027-no-link-check-cache.md) left external link checking in two places: blocking in
`pr-check.yml`, and advisory (`continue-on-error: true`) in `production.yml`. The advisory half does
not work, and there is direct evidence rather than a worry:

- Production run `30841873862` errored on `agriculture.canada.ca` and `geonames.nrcan.gc.ca`.
- Production run `30808703476` timed out on `www.lepsoc.org`.

Both went unnoticed. They surfaced only because someone grepped run logs while investigating a
different failure days later. A `continue-on-error` step reports to a place with no owner: the run is
green, the annotation is buried, and nobody is looking. The check was running, finding real problems,
and telling no one.

The blocking half does not solve this either, and cannot. A third-party host going down is not
something a contributor caused or can fix, so failing their PR is the wrong lever — that is
[#263](https://github.com/pnwinsects/pnwmoths/issues/263).

There is a second, harder problem that decides whether any report gets read. **CI cannot tell a dead
link from a host that refuses GitHub's runner network.** That distinction is not academic: it cost a
full PR cycle in #262, where two hosts that serve 200 in ~0.3s from a workstation hung completely
from the runner. A report that carries that noise gets closed unread — which is the same outcome as
having no report, arrived at more expensively.

Scope note: `data/species-links.csv` holds 2,263 reference links (1,330 MPG, 843 BugGuide, 90
BAMONA) that are excluded from every check because those hosts rate-limit. They stay unchecked. That
is a deliberate, separate decision, and it means this ADR covers the ~33 links in site prose and
templates, not the catalog's reference links.

## Decision

**A weekly `link-rot.yml` runs the external link check and maintains one GitHub issue, which closes
itself when the links recover. A URL is only listed as broken after failing two consecutive weekly
runs.**

Three parts, each answering one of the failures above:

1. **Destination is an issue, not a log.** Issues are this project's authoritative shared surface
   (CLAUDE.md), and the collaborator who does not use a terminal can see them. One issue, edited in
   place — not a new issue per run, which is its own way of becoming unreadable.

2. **The two-strike rule.** `scripts/report-link-rot.ts` records a failing URL but does not report it
   until it fails again the following week, likely from a different runner IP. Single-run flakes and
   transient outages never reach the actionable list; they sit in a collapsed "observed once" section
   marked as needing no action. Strikes must be *consecutive* — a recovery resets the count, so a
   link failing every third week never accumulates its way into the report.

3. **State lives in the issue body**, in an HTML comment. The report and the memory of the report
   cannot drift apart, there is no cache to poison (ADR 0027, learned the hard way), and no bot
   commit to a protected branch. A hand-edited or corrupt body costs one run's memory and never
   crashes the job.

The issue text tells the reader to open each link in a browser before editing anything, and says
that if it loads fine, the fix is an `exclude` entry with a note — not a link edit. That instruction
exists because the first person to read this report will otherwise repeat #262's mistake.

## Consequences

- Link rot in site prose gets found within two weeks and lands somewhere with an owner. Before this,
  it was found by accident or not at all.
- **Two weeks to first report** is the deliberate cost of the strike rule. For link rot — which is
  permanent and slow — latency is cheap and a false positive is expensive. For an outage that matters
  within hours, this is the wrong instrument, and nothing here claims otherwise.
- The weekly job runs a full `build:site` to have HTML to check. That is ~10 minutes of CI once a
  week, against reusing the exact build and config the blocking check uses. Worth it over
  maintaining a second, drifting notion of "the site's links".
- **A quiet failure mode remains**: if the workflow itself breaks, the issue simply stops updating,
  and silence looks identical to health. GitHub notifies on scheduled-workflow failure, which is the
  backstop, but it is the same shape of trap this ADR exists to fix. Worth revisiting if it bites.
- The 2,263 reference links stay unchecked. Nothing here changes that, and this ADR should not be
  cited as coverage of them.

## Alternatives considered

- **Make the production link check blocking.** Rejected in ADR 0027 and still wrong: a third party's
  downtime must not block a deploy of unrelated content.
- **Report on the first failure.** Rejected as the decision that determines whether the report is
  read at all. Given a runner network that some hosts refuse outright, first-failure reporting
  guarantees false positives in week one, and a tracking issue only gets one chance to earn trust.
- **Keep strike state in the Actions cache.** Rejected: ADR 0027 removed a cache for being shared
  mutable CI state with unclear ownership, and reintroducing one to support the fix would be a poor
  joke. The issue body is authoritative, human-readable and already the thing being updated.
- **Commit strike state to the repo.** Rejected: `main` is protected, so a bot writing state means a
  bot PR every week, which is noise with a changelog.
- **Post to the PR / run summary instead.** Rejected: it is only seen by someone already looking at
  that run, which is the exact failure being fixed.
