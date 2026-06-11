# Phase 34 — Pre-Migration Baseline

## Snapshot

| Property | Value |
|----------|-------|
| Snapshot path | `_site_baseline/` (working-tree only — gitignored; not committed) |
| Species pages | **1,433** |
| Snapshot date | 2026-06-09 |
| Build command | `npm run build:data && npm run build:eleventy && npm run build:copy-parquet && npm run build:copy-images && npm run build:species-states` |

The species-page count is data-determined (derived from `data/species.csv`) and may grow as new records are added. The SC-4 byte-identity gate tests "unchanged vs this snapshot", not a fixed literal.

## Byte-Identity Gate Command (SC-4)

After completing each conversion plan in Phase 34, run:

```sh
diff -r _site/ _site_baseline/
```

Expected output: no differences. Phase 34 changes no templates, data, or output — only renames source files from `.js` to `.ts` and adds type annotations. The generated `_site/` must be byte-identical to this snapshot.

## Notes

- `_site_baseline/` must be regenerated if it predates an unrelated data change (e.g., new species added to `data/species.csv`). In that case, re-run the build command above and re-copy `_site/` to `_site_baseline/`.
- `_site_baseline/` is listed in `.gitignore`. It is a working-tree artifact for the duration of Phase 34 only.
- The `build:validate-links` (lychee) and `build:pagefind` steps were omitted from the baseline build command; they are network-dependent and do not affect the byte-identity of species pages.
