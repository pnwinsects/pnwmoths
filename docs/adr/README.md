# Architecture Decision Records

Decisions with rationale and rejected alternatives. Add a numbered record when a decision is made;
mark superseded records rather than deleting them. Most were retro-recorded during the 2026-07
migration off the prior planning workflow.

For the domain vocabulary these records use, see [CONTEXT.md](../../CONTEXT.md); for what the
product is and who it's for, see [PRODUCT.md](../../PRODUCT.md).

| # | Decision | Status |
|---|----------|--------|
| [0001](0001-static-no-server.md) | Static files only — no server or database at runtime (the load-bearing constraint) | Accepted |
| [0002](0002-flat-files-over-cms.md) | Data as flat CSV + per-species Markdown instead of a headless CMS | Accepted |
| [0003](0003-eleventy-ssg.md) | Eleventy as the SSG (over Hugo/Astro) for ~700 data-driven species pages | Accepted |
| [0004](0004-duckdb-parquet.md) | DuckDB for build-time joins; per-species Parquet + hyparquet for async client loading | Accepted |
| [0005](0005-lit-light-dom.md) | Lit web components in light DOM so Pico CSS and Leaflet work; no-JS degradation mandatory | Accepted |
| [0006](0006-pagefind-search.md) | Pagefind for static full-text search; occurrence data excluded from the index | Accepted |
| [0007](0007-bunny-cdn-images.md) | Images served from the Bunny CDN; Git LFS purged; `CDN_BASE_URL` a public constant | Accepted |
| [0008](0008-deploy-bunny-additive.md) | Deploy = additive `_site` upload to Bunny on push to `main`; GitHub Pages is manual staging | Accepted |
| [0009](0009-bunny-cache-policy.md) | Bunny cache policy: fresh HTML/JSON/Parquet, long-TTL hashed assets, no manual purge | Accepted |
| [0010](0010-slug-foreign-key.md) | `species_slug` is the canonical, self-documenting foreign key and URL segment | Accepted |
| [0011](0011-typescript-pipeline.md) | Full TypeScript via Node native type-stripping; `tsc --noEmit` + TS-only guard as CI gates | Accepted |
| [0012](0012-identify-static-key.md) | `/identify/` reimplements the Lucid3 key as a static client-side bitset matrix | Accepted |
| [0013](0013-highres-osd-dzi.md) | High-res photos as OpenSeadragon DZI/WebP tiles on the CDN via a resumable local pipeline | Accepted |
| [0014](0014-districts-offline-writeback.md) | Administrative districts by additive-only offline write-back with a non-blocking QC report | Accepted |
| [0015](0015-data-driven-gating.md) | Public-visibility gating via data-driven deny-lists and a single `shown` predicate | Accepted |
| [0016](0016-tribe-hierarchy-level.md) | Tribe as a conditional level (family → subfamily → tribe? → genus → species), backfilled from the reference DB | Accepted |
| [0017](0017-reproducible-committed-artifacts.md) | Committed build artifacts carry no build timestamp and must be byte-reproducible | Accepted |
| [0018](0018-phenology-reared-exclusion.md) | Phenology graphs exclude reared/immature records via a notes keyword scan (no foodplant terms) | Accepted |
| [0019](0019-legacy-link-telemetry-from-logs.md) | Missed legacy redirects are recovered from CDN access logs via a shared resolver, not a client beacon | Accepted |
| [0020](0020-inert-modal-focus-containment.md) | Modal focus is contained with `inert` (through `<body>`'s children) rather than a keydown focus trap | Accepted |
| [0021](0021-sharing-metadata.md) | Share previews from derived factsheet prose + CDN photos, absolute URLs via `SITE_ORIGIN`, one committed fallback card | Accepted |
| [0022](0022-pregenerated-image-derivatives.md) | Image variants pre-generated offline under `derived/`, guarded by a committed manifest; Bunny Optimizer retired | Accepted |
| [0023](0023-runbook-schema-guard.md) | Runbook CSV schemas checked mechanically — complete tables, sample rows, and prose column names resolved per-document | Accepted |
| [0024](0024-html-validity-gate.md) | `build:check-html` fails the build on a malformed or unknown start tag in `_site/` | Accepted |
| [0025](0025-manifest-locks.md) | Pipeline manifests guarded by a pid lock taken before the read; the sequential build and one-shot migrations are not | Accepted |
| [0026](0026-inaturalist-project-sync.md) | iNaturalist records live in a separate, machine-owned `data/records-inat.csv`; reconciliation is destructive so it never touches the curator file | Accepted |
| [0027](0027-no-link-check-cache.md) | The link check keeps no result cache — it still checks every link, but only its 35 external URLs were ever cacheable (internal links are `file://`, CDN images are excluded and manifest-checked) | Accepted |
| [0028](0028-link-rot-reporting.md) | Broken external links reported to one self-closing GitHub issue, listed only after two consecutive weekly failures | Accepted |
| [0029](0029-removing-a-species.md) | Removing a species deletes its row and every record outright — not a move to the deny-list, and no tombstone redirect | Accepted |
| [0030](0030-checklist-order-from-mpg.md) | Checklist order comes from the MPG taxon list, superseding the legacy-CMS nested-set extraction | Accepted |
| [0031](0031-checklist-page.md) | The Checklist is its own server-rendered page, not a mode of Browse; its list is excluded from the search index | Accepted |
| [0032](0032-curation-log.md) | Curatorial decisions get their own append-only log (`docs/curation-log.md`), separate from ADRs | Accepted |
| [0033](0033-referential-integrity-gate.md) | Every species reference is declared in one table and checked before the build; known orphans held in a self-expiring ratchet | Accepted |
| [0034](0034-generated-artifacts-merge-curator-fields.md) | Generators merge into their committed artifact — curator fields and untouched entries survive a scoped run | Accepted |
| [0035](0035-browser-smoke-gate.md) | The built bundle is driven in a real headless browser before it ships; every other gate reads bytes | Accepted |
| [0036](0036-cdn-inventory-by-accountability.md) | The CDN is inventoried by accountability — every object joined to what explains it, findings reported both directions, advisory only | Accepted |
| [0037](0037-curation-reports-published-unlinked.md) | Every advisory report is listed at an unlinked, `noindex` `/curation/` index, driven by one manifest shared with the copy step | Accepted |
| [0038](0038-photo-identity-is-data-not-filename.md) | A photograph's species lives in `data/photo-determinations.csv`, not in its filename; filenames are permanent opaque identifiers | Accepted |
