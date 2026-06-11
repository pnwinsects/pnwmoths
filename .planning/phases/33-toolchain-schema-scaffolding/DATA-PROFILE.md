# Data Null-Distribution Profile

**Dataset snapshot:** 2026-06-09  
**Purpose:** D-08 discretion — committed maintainer note for `src/types/schemas.ts`

---

## What This File Is

These tables record which CSV columns are allowed to be blank in the production data.
The Zod schema in `src/types/schemas.ts` marks each of these columns `.nullable()` so
a blank value never blocks the build. If you add a new always-required column to a CSV,
update both the CSV AND `src/types/schemas.ts` — otherwise the build will silently accept
rows that are missing the new field.

**Important:** `records.county` is 100% blank **by design** — county enrichment has not yet
been performed on the dataset. A non-nullable county field would reject all 92,554 records.

The acceptance harness at `scripts/profile-data.ts` re-checks every schema against the full
production dataset. Run `node scripts/profile-data.ts` after editing any schema or CSV.

---

## records.csv — 92,554 rows

Read **without** `nullstr=''` (blank cells are treated as SQL NULL by DuckDB's default behavior).

| Column | Type | Null count | Null % | Schema rule |
|--------|------|-----------|--------|-------------|
| species_slug | VARCHAR | 0 | 0.0% | required `z.string()` |
| record_type | VARCHAR | 0 | 0.0% | required `z.string()` |
| latitude | DOUBLE | 0 | 0.0% | required `z.number()` |
| longitude | DOUBLE | 0 | 0.0% | required `z.number()` |
| state | VARCHAR | 0 | 0.0% | required `z.string()` |
| county | VARCHAR | 92,554 | **100.0%** | ALL NULL — `z.string().nullable()` |
| locality | VARCHAR | 757 | 0.8% | `z.string().nullable()` |
| elevation_ft | INTEGER | 3,471 | 3.8% | `z.number().int().nullable()` |
| year | INTEGER | 4,822 | 5.2% | `z.number().int().nullable()` |
| month | INTEGER | 4,442 | 4.8% | `z.number().int().nullable()` |
| day | INTEGER | 5,082 | 5.5% | `z.number().int().nullable()` |
| collector | VARCHAR | 8,219 | 8.9% | `z.string().nullable()` |
| collection | VARCHAR | 4,472 | 4.8% | `z.string().nullable()` |
| notes | VARCHAR | 70,887 | 76.6% | `z.string().nullable()` |

Distinct `record_type` values: `specimen` (86,182), `photograph` (4,268), `literature` (2,091), `sight_field_notes` (13).  
Distinct `state` values: `WA` (32,435), `OR` (28,734), `BC` (18,780), `ID` (9,313), `AB` (2,369), `MT` (923).

---

## species.csv — 1,433 rows

Read **with** `nullstr=''` (empty strings become SQL NULL).

| Column | Type | Null count | Null % | Schema rule |
|--------|------|-----------|--------|-------------|
| id | INTEGER | 0 | 0.0% | required `z.number().int()` |
| genus | VARCHAR | 0 | 0.0% | required `z.string()` |
| species | VARCHAR | 0 | 0.0% | required `z.string()` |
| common_name | VARCHAR | 975 | 68.0% | `z.string().nullable()` |
| noc_id | VARCHAR | 26 | 1.8% | `z.string().nullable()` |
| authority | VARCHAR | 50 | 3.5% | `z.string().nullable()` |
| family | VARCHAR | 40 | 2.8% | `z.string().nullable()` |
| similar_species | VARCHAR | 385 | 26.9% | `z.string().nullable()` |
| subfamily | VARCHAR | 178 | 12.4% | `z.string().nullable()` |

Note: `family` is logically required but has 40 null rows (2.8%) in production. The schema accepts
nulls here to avoid rejecting real rows; the build-data.js integrity SQL separately validates
referential integrity.

---

## images.csv — 4,035 rows

Read **with** `nullstr=''` and all columns as VARCHAR (no type coercion at read time; `weight`
is coerced separately via `TRY_CAST(weight AS INTEGER)` in the taxon query).

| Column | Type | Empty/Null % | Schema rule |
|--------|------|-------------|-------------|
| species_slug | VARCHAR | 0% | required `z.string()` |
| filename | VARCHAR | 0% | required `z.string()` |
| photographer | VARCHAR | 0% | required `z.string()` |
| weight | VARCHAR | 0% | required `z.string()` |
| license | VARCHAR | 0% | required `z.string()` |
| view | VARCHAR | 2.2% | `z.string().nullable()` |
| specimen | VARCHAR | 2.2% | `z.string().nullable()` |
| navigational | VARCHAR | **100.0%** | ALL EMPTY — `z.string().nullable()` |
| locality | VARCHAR | 15.4% | `z.string().nullable()` |
| state | VARCHAR | 16.1% | `z.string().nullable()` |
| latitude | VARCHAR | 18.0% | `z.string().nullable()` |
| longitude | VARCHAR | 18.0% | `z.string().nullable()` |
| elevation_ft | VARCHAR | 19.8% | `z.string().nullable()` |
| year | VARCHAR | 16.5% | `z.string().nullable()` |
| month | VARCHAR | 16.8% | `z.string().nullable()` |
| day | VARCHAR | 16.8% | `z.string().nullable()` |
| collector | VARCHAR | 16.1% | `z.string().nullable()` |
| subspecies | VARCHAR | **100.0%** | ALL EMPTY — `z.string().nullable()` |

---

## glossary.csv — 149 rows

| Column | Type | Empty/Null % | Schema rule |
|--------|------|-------------|-------------|
| term | VARCHAR | 0% | required `z.string()` |
| definition | VARCHAR | 0% | required `z.string()` |
| image_filename | VARCHAR | 69.1% | `z.string().nullable()` |
| photographer | VARCHAR | **100.0%** | ALL EMPTY — `z.string().nullable()` |
