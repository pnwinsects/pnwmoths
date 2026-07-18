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

## Build / CI limits

| Item | What / why it matters | Pointer | Status |
|------|-----------------------|---------|--------|
| Build-time budget not asserted in CI | `build:data` runs ~3s locally, but the "<5 min on CI" target (MAINT-03) is not enforced by any CI timeout or assertion. | CI workflows | ACCEPTED (empirically met, unenforced) |
| Byte-identical `_site/` proof is local-only | The proof that `_site/` output is byte-identical to baseline is a one-shot local check, deliberately not wired into CI. CI catches type/test failures but **not** byte-level data regressions. | `compare-sites.sh` | ACCEPTED (D-01) |
| Production deploy runs only typecheck | The `deploy`/production workflow runs `tsc --noEmit` only — not the full test / TS-guard / parquet gate. It relies on the PR-check gate + branch protection to have already run those. | `.github/workflows/` (production workflow) | ACCEPTED (relies on PR gate) |
| No visual-regression tests | There are no automated visual-regression tests guarding the site's visual identity; visual breakage would only be caught by eye. | — | ACCEPTED |
| Browse page over the weight threshold | `/browse/` inlines the entire taxon tree as JSON (D-10), so it exceeds the advisory 500KB `check-page-weight` threshold (~768KB; was ~725KB before the tribe level was added). The check only warns, and no-JS/first-paint still work, but the payload grows with the catalog. A fix would fetch the tree as a separate cached JSON instead of inlining it. | `src/browse/index.njk`, `scripts/check-page-weight.ts` | ACCEPTED (advisory; inlining per D-10) |
| WebP not enabled on Bunny Optimizer | The Optimizer is serving JPEG; WebP conversion (~30% smaller) is not yet toggled on. One-click dashboard change: Pull Zone → Optimizer → WebP conversion. | Bunny dashboard | ACTIONABLE |

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
| Django URL redirects | SEO-01 — legacy Django URL redirects; requires Netlify/Cloudflare edge rules. | — | ACCEPTED (deferred) |
| Photographic plates page | PLAT-01, PLAT-02 — a photographic plates page. | — | ACCEPTED (deferred) |
