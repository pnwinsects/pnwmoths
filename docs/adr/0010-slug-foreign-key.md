# 0010. `species_slug` is the canonical foreign key

**Status:** Accepted

## Context

Multiple flat files reference a species — `images.csv`, `records.csv`, prose Markdown filenames,
the URL structure. Flat-file data ([0002](0002-flat-files-over-cms.md)) must be joinable at build
time and editable by non-technical contributors. A numeric database ID would join reliably but is
opaque: a curator looking at a records row can't tell which species `id=4173` is, and can't
hand-author a filename. The legacy dataset also *has* a stable numeric identifier (the NOC ID),
which tempts reuse as the key.

## Decision

The **slug** — `(genus + '-' + species).toLowerCase()`, alphanumeric and hyphens only — is the
canonical foreign key across `images.csv`, `records.csv`, and prose filenames, and it is also the
URL segment `/species/{slug}/`. The NOC ID is carried as data but is **not** a foreign key. For
occurrence joins, the slug is derived from the **DB genus+species** (`lower(genus||'-'||species)`),
not from image filenames.

## Consequences

- Slugs are **self-documenting**: `acronicta-americana` is legible in a diff, a URL, and a
  filename; a contributor can author the right filename by hand.
- One key spans data joins and URLs, so there is no separate mapping table to maintain.
- **DB-derived, not image-filename-derived, for record joins**: ~326 species were reclassified,
  so image-era slugs drift from current DB slugs. Records must join on the DB-computed slug
  (`build-data.ts`) or ~326 species' records would fail to link. This is a real gotcha, not a nicety.
- The slug is **display-independent**: quoted epithets (e.g. *Clostera "apicalis"*) are rendered
  from a separate flag and never appear in the slug (see [CONTEXT.md](../../CONTEXT.md)).

## Alternatives considered

- **Numeric DB id / NOC ID as the foreign key** — rejected: opaque in diffs, URLs, and filenames;
  defeats the contributor-editability goal. The slug is stable enough and far more legible.
- **Image-filename-derived slug for records** — rejected: drifts from DB slugs for reclassified
  species, silently dropping their record joins.
