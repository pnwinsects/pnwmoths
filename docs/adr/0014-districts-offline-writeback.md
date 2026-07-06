# 0014. Administrative districts by additive-only offline write-back

**Status:** Accepted

## Context

Every occurrence record should carry its administrative district (**county** for US states,
**regional district** for BC). The original migration dropped the legacy assignments —
`records.csv` was only ~2.8% filled — and many records have coordinates but no stated district.
Two tensions: curator-entered county data is authoritative and must not be clobbered by automated
guesses; and near-boundary georeferencing noise means stated-vs-derived disagreements are common
and must not block deploys. There is no server, so any assignment runs locally
([0001](0001-static-no-server.md)).

## Decision

District assignment is **additive-only offline write-back**: local scripts mutate the committed
`records.csv`, filling only blank districts and **never overwriting a curator-entered county**.
Two additive passes: (1) re-join legacy names to stable IDs via a committed crosswalk
(`data/district-crosswalk.csv`, absorbing renames like *Skeena-Queen Charlotte → North Coast*);
(2) coordinate **point-in-polygon** (`ST_Contains`) against committed WGS84 boundary GeoJSON
(`data/boundaries/pnw-districts.geojson`) with a ~2 km **nearest-boundary fallback**. Disagreements
go to a **non-blocking, unlinked tiered QC report** (`_site/records-district-audit.csv`), never a
build failure. **`district_id` is a prefixed VARCHAR** (`US:<GEOID>` / `CA:<CDUID>`), never an
integer (v5.0).

## Consequences

- Re-join + coord-fill raised US-county fill from 2.79% to ~96.94% with **zero overwrites**; both
  passes are idempotent, so reruns are safe.
- The **crosswalk over raw name-matching** keeps joins deterministic and curator-reviewable as
  legacy names drift (same authoritative-source discipline as [0012](0012-identify-static-key.md)).
- `district_id` as a **string with a namespace prefix** preserves zero-padded GEOID/CDUID and
  disambiguates US vs CA; an integer type would drop leading zeros. It threads through all four
  DuckDB `read_csv` maps, the Zod schema, and the Parquet cache.
- The QC report is **advisory** — near-boundary noise would otherwise block every deploy — and
  mirrors the `species-audit.csv` pattern: unlinked, curator-facing, build never fails. Tier counts
  live in a JSON sidecar (a `#`-commented CSV preamble would break RFC-4180).
- Known gaps are accepted, not blocking: Alberta boundary geometry is only partially acquired
  (~57.9% overall fill vs 99.58% ex-AB), and the Browse filter already excludes AB
  ([0015](0015-data-driven-gating.md) / see [PROJECT context](../../PRODUCT.md)).

## Alternatives considered

- **Overwrite stated county with coordinate-derived district** — rejected: curator data is
  authoritative; disagreements are flagged, not silently replaced.
- **Build-blocking QC failure on mismatch** — rejected: legacy georeferencing noise near
  boundaries would block deploys constantly.
- **Integer `district_id`** — rejected: drops leading zeros and can't namespace US vs CA.
