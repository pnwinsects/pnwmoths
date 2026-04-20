# Phase 8: Schema Extension - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-20
**Phase:** 08-schema-extension
**Areas discussed:** navigational value format, families.js scope

---

## navigational value format

| Option | Description | Selected |
|--------|-------------|----------|
| true / (blank) | Non-empty = true, blank = false. DuckDB VARCHAR with nullstr. | ✓ |
| true / false strings | Explicit boolean strings in every row. DuckDB BOOLEAN type. | |
| 1 / 0 integers | Numeric flag, familiar for DB contributors. | |

**User's choice:** `true` or blank. Non-empty = navigational, blank = not navigational.
**Notes:** Consistent with existing nullable VARCHAR columns (specimen). Blank coerces to NULL via `nullstr = ''`; consuming code treats NULL as false.

---

## families.js scope

| Option | Description | Selected |
|--------|-------------|----------|
| Add to column map + return it | Phase 8 adds subfamily to schema and returns it from queries. | ✓ |
| Schema-only | Add to column map but don't change SELECT or return. | |
| Defer all to Phase 9 | No changes to families.js in Phase 8. | |

**User's choice:** Add `subfamily` to column map, SELECT it, and include in returned data.
**Notes:** families.js stays the authoritative browse data source until taxon.js replaces it in Phase 9. The existing browse template (browse/index.njk) only uses `family` and `genus` so adding subfamily to the return won't break anything.

---

## families.js ordering

| Option | Description | Selected |
|--------|-------------|----------|
| family, subfamily NULLS LAST, genus | Genera without subfamily sort after subfamilied genera. | ✓ |
| family, genus (unchanged) | Leave ordering for Phase 9/10 when accordion is built. | |

**User's choice:** `ORDER BY family, subfamily NULLS LAST, genus`
**Notes:** Matches the intended accordion hierarchy where ungrouped genera fall directly under family.

---

## Claude's Discretion

- Exact nullstr placement in read_csv calls
- Test fixture approach (synthetic temp files)
- DuckDB type for navigational (VARCHAR chosen for consistency)

## Deferred Ideas

None.
