# Known Concerns & Tech Debt

The live register of known gaps, accepted trade-offs, and things a maintainer
should know are imperfect right now. Each item is tagged:

- **ACCEPTED** — a deliberate trade-off we are living with; no action expected unless priorities change.
- **ACTIONABLE** — a real gap that should be fixed when someone has the time.

---

## Data coverage gaps

| Item | What / why it matters | Pointer | Status |
|------|-----------------------|---------|--------|
| Alberta boundary geometry incomplete | Only 1 of ~19 AB census divisions was acquired, so coordinate→district fill is **57.90% overall** vs **99.58% ex-Alberta**. The Browse filter already excludes Alberta, so no user-facing feature is blocked — this is purely a data-completeness gap. Fixing it means acquiring the remaining AB boundaries. | `data/boundaries/pnw-districts.geojson`, `scripts/build-boundaries.ts` | ACCEPTED (widening AB coverage deferred) |
| 2,660 BC rows missing `district_id` | These pre-existing BC rows carry a county name but no stable `district_id`; the additive-only re-join skipped them. Fix is a crosswalk name-lookup pass. | `scripts/backfill-legacy-county.ts`, `data/district-crosswalk.csv` | ACTIONABLE |
| Stale StatCan district names | Two regional-district names are carried verbatim from StatCan and are known to be out of date. A Browse display override to show current names is deferred. | `data/boundaries/pnw-districts.geojson` | ACCEPTED (display override deferred) |
| Synonym curation pass not yet run | Curation tooling shipped, but the first curator pass over ~30–80 unresolved binomials has not been performed. | `data/species-synonyms.csv` | ACTIONABLE |
| 1,018 ingested photos blocked on taxonomy, not tooling | After #214 cleared everything mechanically processable, the manifest still holds `status: discovered` rows that no script can advance: **670 genus-only** (filename names a genus the catalog has, with an epithet it does not), **326 likely-synonym** (binomial absent from `species.csv` and from `species-synonyms.csv`), **14 unparseable**, **8 provisional** (`sp`, `n sp`, `nr <species>` — deliberately never coerced into a clean match). Each needs a human to decide what species it is; `match_bucket` records why each is held. The route for most is adding a row to `species-synonyms.csv` and re-running `npm run photos:investigate`, which promotes and tiles them — that pass alone moved 86 rows. | `data/species-photos-manifest.csv`, [CURATING_SPECIES_SYNONYMS.md](../_instructions/CURATING_SPECIES_SYNONYMS.md) | ACTIONABLE (needs a curator, not a maintainer) |
| 166 derivative rows in a `failed` state | `var/derivatives-manifest.csv` carries 166 rows at `status: failed` from an earlier run, predating #214 and untouched by it. They are excluded from `data/image-derivatives.csv`, so the source gate is honest about them, but no one has established whether the sources are broken or the failures were transient. | `var/derivatives-manifest.csv`, `scripts/generate-derivatives.ts` | ACTIONABLE |

## Build / CI limits

| Item | What / why it matters | Pointer | Status |
|------|-----------------------|---------|--------|
| Build-time budget not asserted in CI | `build:data` runs ~3s locally, but the "<5 min on CI" target (MAINT-03) is not enforced by any CI timeout or assertion. | CI workflows | ACCEPTED (empirically met, unenforced) |
| Byte-identical `_site/` proof is local-only | The proof that `_site/` output is byte-identical to baseline is a one-shot local check, deliberately not wired into CI. CI catches type/test failures but **not** byte-level data regressions. | `compare-sites.sh` | ACCEPTED (D-01) |
| Production deploy runs only typecheck | The `deploy`/production workflow runs `tsc --noEmit` only — not the full test / TS-guard / parquet gate. It relies on the PR-check gate + branch protection to have already run those. | `.github/workflows/` (production workflow) | ACCEPTED (relies on PR gate) |
| Single-word column names in runbooks are unguarded | The runbook column guard resolves backticked *snake_case* names against the real CSV headers; single words (`status`, `view`, `filename`, `weight`) are skipped because they read as ordinary English as often as they name a column, and matching them produces noise. A wrong single-word column name in prose still ships. Schema tables and sample rows are fully checked either way. | `scripts/instructions-schema.test.ts`, [ADR 0023](adr/0023-runbook-schema-guard.md) | ACCEPTED (false-positive budget) |
| No visual-regression tests | There are no automated visual-regression tests guarding the site's visual identity; visual breakage would only be caught by eye. | — | ACCEPTED |
| No check measures image weight | `check-page-weight.ts` weighs HTML only, so a page can ship megabytes of images and pass. This is how the `/plates/` regression (1,283 KB → 5,327 KB of thumbnails with the Optimizer off) stayed invisible until it was measured by hand during the #227 cutover — the derivative guard proves images *exist*, not that they are the right size. | `scripts/check-page-weight.ts`, [ADR 0022](adr/0022-pregenerated-image-derivatives.md) | ACTIONABLE |
| Browse page over the weight threshold | `/browse/` inlines the entire taxon tree as JSON (D-10), so it exceeds the advisory 500KB `check-page-weight` threshold (~768KB; was ~725KB before the tribe level was added). The check only warns, and no-JS/first-paint still work, but the payload grows with the catalog. A fix would fetch the tree as a separate cached JSON instead of inlining it. | `src/browse/index.njk`, `scripts/check-page-weight.ts` | ACCEPTED (advisory; inlining per D-10) |
| WebP not enabled on Bunny Optimizer | The Optimizer is serving JPEG; WebP conversion (~30% smaller) is not yet toggled on. One-click dashboard change: Pull Zone → Optimizer → WebP conversion. | Bunny dashboard | ACTIONABLE |
| Link check never verifies an image URL | `exclude` drops every `.jpg/.png/.webp/…` URL, so no image has ever been checked by CI — which is why 83 rows referencing files absent from the CDN went unnoticed ([#232](https://github.com/pnwinsects/pnwmoths/issues/232)). `check-derivatives.ts` now closes most of this offline: it proves every image reachable from a built page has its derivatives on the CDN. What remains unverified is the handful of non-derivative image URLs — plates, site images, the 1500w hero slot. | `lychee.toml:26`, `scripts/check-derivatives.ts` | ACCEPTED (residual gap is small; a network check would fail builds on a blip) |
| 6 known referential-integrity exceptions | Five `species-photos.json` keys (`macaria-bitactata`, `-colata`, `-decorata`, `-lorquinaria`, `-plumosata`) are tiled high-res photo sets keyed to the MPG genus while `species.csv` still says *Speranza*, so 24 specimen views can never render; and `src/content/species/lacinipolia-vicina.md` is an account whose species has no row. Both are held in the ratchet with the issue that resolves them; the gate fails if either is fixed and its line is left behind. | `data/referential-integrity-exceptions.csv`, [ADR 0033](adr/0033-referential-integrity-gate.md), [#279](https://github.com/pnwinsects/pnwmoths/issues/279), [#285](https://github.com/pnwinsects/pnwmoths/issues/285) | ACTIONABLE (curator decision) |
| 83 orphan rows in `data/images.csv` | Rows for 27 Geometridae whose files are not on the CDN. Inert today — the family is withheld, so no page renders them — but the derivative guard is scoped to buildable species partly to tolerate them. Lifting the embargo fails the build until they are re-uploaded or removed; that is a curator call. | [#232](https://github.com/pnwinsects/pnwmoths/issues/232), `data/images.csv` | ACTIONABLE (curator decision) |

## Code debt

| Item | What / why it matters | Pointer | Status |
|------|-----------------------|---------|--------|
| WR-01: dropped similar_species links | `similar_species` links are silently dropped for record-only species due to a slug-resolution gap. | one-time migration script (removed; see git history) | ACTIONABLE |
| WR-02: duplicated sanitization | `safeSpecies` sanitization logic is duplicated across two loops — a maintenance hazard (fix one, forget the other). | one-time migration script (removed; see git history) | ACTIONABLE |
| MIG-04: inline structural type in `filterRecords` | `filterRecords` uses an inline structural type instead of importing `FilterChangeDetail`. If that interface gains a field, there is no compile-time link to catch the drift. | `parquet-cache.ts` | ACTIONABLE |

## Deferred features

Accepted as out-of-scope for now; revisit in a future feature milestone.

| Item | What | Pointer | Status |
|------|------|---------|--------|
| Geometridae public embargo | Family withheld from public pages/Browse/Identify/search pending Merrill's content (~a year out). Release = delete one line in the withhold list. | issue #48, `data/withheld-families.csv` | ACCEPTED (parked) |
| Identify polish | Removable "characters used" chip strip (IDENT-07), URL query-param state persistence (IDENT-08), ecoregion→state hint (IDENT-09), approximate/precise size coupling (SIZE-01). | — | ACCEPTED (deferred to v4.x) |
| QC report extensions | QCX-01, QCX-02 — additional QC-mismatch report capabilities. | — | ACCEPTED (deferred to v5.x) |
| Browse filter extensions | BFILT-06, BFILT-07 — additional Browse district-filter capabilities. | — | ACCEPTED (deferred to v5.x) |
| Glossary morphological matching | GLOS-07 — plural / morphological variant matching for glossary terms; needs stemming or synonym entries. | — | ACCEPTED (deferred) |
| Django URL redirects | SEO-01 — legacy Django URL redirects; requires Netlify/Cloudflare edge rules to route old paths into `/redirect.html`. Until they exist, old links 404 rather than reaching the handler — visible now as the Top 404s table on `/analytics/` ([0019](adr/0019-legacy-link-telemetry-from-logs.md)). | issue #181, `src/_lib/legacy-redirects.ts` | ACCEPTED (deferred) |
| Photographic plates page | PLAT-01, PLAT-02 — a photographic plates page. | — | ACCEPTED (deferred) |
| No way to pin a checklist position | Checklist order is derived wholly from the MPG taxon list, so a curator instruction of the form *"place X immediately after Y"* cannot be expressed. The one live case, `idia-concisa` after `idia-aemula`, is **already correct** — MPG's own sequence puts it there (930471, 930472) — so nothing is wrong today and nothing is asserted either. If a future MPG release moves it, the order silently changes and no check notices. Designing the anchor mechanism (sort semantics, what happens when the anchor is renamed or deleted, whether it also serves the 21 provisional names) is the deferred work. | issue #259, `scripts/build-checklist-order.ts` | ACCEPTED (deferred) |
