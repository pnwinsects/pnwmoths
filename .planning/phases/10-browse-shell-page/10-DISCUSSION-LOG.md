# Phase 10: Browse Shell Page - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-20
**Phase:** 10-browse-shell-page
**Areas discussed:** Noscript fallback, JSON serialization

---

## Noscript fallback

| Option | Description | Selected |
|--------|-------------|----------|
| Full 4-level | Family → Subfamily → Genus → Species, matching accordion hierarchy | ✓ |
| 3-level (skip subfamily) | Family → Genus → Species, simpler but loses subfamily grouping | |

**User's choice:** Full 4-level hierarchy

| Option | Description | Selected |
|--------|-------------|----------|
| Species factsheet links | Each species links to /species/{slug}/ | ✓ |
| Names only, no links | Plain text species names | |

**User's choice:** Species factsheet links

---

## JSON serialization

| Option | Description | Selected |
|--------|-------------|----------|
| data-taxonomy attribute | Inline JSON in HTML attribute; needs escaping filter | |
| `<script type="application/json">` | Sibling script tag read via getElementById; avoids escaping complexity | ✓ |

**User's choice:** `<script type="application/json" id="taxon-data">`

| Option | Description | Selected |
|--------|-------------|----------|
| Include image data | Full tree including navImages as returned by taxon.js | ✓ |
| Taxonomy only | Strip navImages; component fetches images separately | |

**User's choice:** Include full image data

**Notes:** The `data-taxonomy` attribute approach in ROADMAP.md success criteria SC-1 is overridden by this decision. Success criteria should be updated during planning to reference the script tag approach.

---

## Claude's Discretion

- Component placeholder: no stub Lit file needed; `<pnwm-taxon-browser>` is an unregistered unknown element in Phase 10 output — correct behavior, noscript covers JS-off users
- `families.js` retirement: delete it (Phase 9 explicitly deferred this to Phase 10)
- Noscript handling of null-subfamily genera: flatten directly under the family heading (no empty subfamily heading)
