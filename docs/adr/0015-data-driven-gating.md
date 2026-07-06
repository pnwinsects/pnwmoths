# 0015. Public-visibility gating via data-driven deny-lists

**Status:** Accepted

## Context

Some content must be hidden from the public site without being deleted: an entire family can be
under embargo pending curator content (the **Geometridae** embargo, GitHub issue #48), and
provisional/undescribed **morphospecies** aren't ready to publish. The underlying records, images,
and key data must be preserved (a curator may release them later), and hiding must be applied
*consistently* — a species hidden from its page but still surfacing in Browse, Identify, or search
is a leak. Scattering `if` checks across every surface guarantees an eventual gap.

## Decision

Gate visibility with **data-driven deny-lists**: `data/withheld-families.csv` holds whole families
(the Geometridae embargo), and `data/unpublished-species.csv` holds provisional morphospecies.
Enforcement flows through a **single `shown` predicate** (`stats.ts`) applied at **every choke
point** — species pages, Browse, Identify, and the Pagefind index — with a **build-time leak gate**
that fails the build if a withheld taxon escapes. Each deny-list entry is **reversible by deleting
one line**.

## Consequences

- One predicate, one behavior: because every surface asks the same `shown` function, there is no
  drift between pages, Browse, Identify, and search.
- The **build-time leak gate** turns "did we hide it everywhere?" into an automated check rather
  than a manual audit — a withheld family appearing anywhere public fails the build.
- Content is **suppressed, not destroyed**: records/images/key data stay in the repo, so releasing
  a family or species is deleting one line from a CSV and rebuilding.
- The deny-lists are plain CSV, so a non-technical curator can embargo or release taxa the same way
  they edit any other data ([0002](0002-flat-files-over-cms.md)).

## Alternatives considered

- **Delete withheld data from source** — rejected: not reversible; the curator loses the data and
  can't easily republish.
- **Per-surface inline visibility checks** — rejected: guarantees an eventual leak when a new
  surface forgets one; a single predicate at every choke point plus a leak gate is the durable
  design.
