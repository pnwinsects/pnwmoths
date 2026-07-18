# 0016. Tribe as a conditional level in the taxonomy hierarchy

**Status:** Accepted

## Context

The taxonomy tree was four levels: family → subfamily → genus → species. Several subfamilies are
further divided into **tribes** (e.g. Noctuidae: Noctuinae: Acontiini), and the original WWU site
exposed that rank in its browse hierarchy. Issue [#103](https://github.com/pnwinsects/pnwmoths/issues/103)
asked to surface tribe both in Browse and at the top of species accounts.

Tribe is not stored in the legacy `species` data. Like subfamily, it is encoded only in the
reference DB's CMS browse-URL paths (`cms_title.path`) as a `tribe-<name>` segment. Tribe is a
**genus-level** property — every species of a genus shares one tribe — and the paths map each genus
to exactly one tribe with no conflicts. Not every genus has a tribe: a subfamily may have no tribal
subdivision, and a few genera added after the 2021 migration are absent from the legacy hierarchy
entirely. On the reference site, tribe appears in the browse hierarchy only where present.

## Decision

Add tribe as a **conditional level** between subfamily and genus: family → subfamily → **tribe?** →
genus → species. Model it after the existing "no subfamily grouping" convention — a subfamily with
no tribal subdivision holds a single tribe node with `name === null`, whose genera render directly
under the subfamily (no extra heading, no extra expand control). Genera keep their existing display
when there is no tribe; a named tribe adds one level of nesting.

The data is a new `tribe` column in `data/species.csv`, backfilled once from the reference DB by
[`scripts/backfill-tribe.ts`](../../scripts/backfill-tribe.ts) — additive-only and idempotent, the
same pattern as the district/county backfills ([0014](0014-districts-offline-writeback.md)): a row
that already carries a non-blank tribe is never overwritten, and genera the legacy paths do not
classify are left blank, never guessed. Tribe surfaces in the `<pnwm-taxon-browser>` tree, its
`<noscript>` fallback, and the species-account breadcrumb.

## Consequences

- The taxon tree (`src/_data/taxon.ts`) and its schema (`TaxonTribe`, `TaxonSubfamily.tribes`) gain a
  level; `collectSlugs`, the expand-state keys, and the deep-link walk in the browse component all
  thread through the tribe tier. NavImages aggregate genus → tribe → subfamily → family.
- "Tribe where present" falls out of the `name === null` node: mixed-depth subfamilies (only
  Arctiinae and Noctuinae, each with one post-migration genus outside the legacy hierarchy) render
  tribed and untribed genera side by side without special-casing.
- Re-deriving tribe requires the `pnwmoths-mysql` reference container, matching how subfamily was
  recovered (see [data-provenance](../reference/data-provenance.md)). The committed `tribe` column is
  the runtime source of truth; the DB is only needed to regenerate it.
- The Browse page inlines the whole taxon tree (D-10), so the added tribe nodes grow that payload
  modestly; the page was already over the advisory 500KB weight threshold before this change.
