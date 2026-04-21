# Phase 12: Validation - Pattern Map

**Mapped:** 2026-04-20
**Files analyzed:** 3 (planning docs modified) + 4 (source files committed as-is)
**Analogs found:** 3 / 3

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `.planning/REQUIREMENTS.md` | documentation | transform | `.planning/REQUIREMENTS.md` as modified by `07-01-PLAN.md` Task 2 | exact |
| `.planning/ROADMAP.md` | documentation | transform | `.planning/ROADMAP.md` as modified by previous milestone close-outs (v1.0–v1.2 entries) | exact |
| `.planning/STATE.md` | documentation | transform | `.planning/STATE.md` frontmatter pattern (gsd_state_version, progress block) | exact |
| `src/components/pnwm-taxon-browser.js` | component | event-driven | itself (existing — commit only, no edit) | n/a — commit |
| `src/styles/theme.css` | config | — | itself (existing — commit only, no edit) | n/a — commit |
| `src/species/species.njk` | template | — | itself (existing — commit only, no edit) | n/a — commit |
| `.planning/config.json` | config | — | itself (existing — commit only, no edit) | n/a — commit |

---

## Pattern Assignments

### `.planning/REQUIREMENTS.md` (documentation, transform)

**Analog:** `.planning/REQUIREMENTS.md` as updated in `07-01-PLAN.md` Task 2 (lines 165–205)

**Checkbox pattern** — change `- [ ]` to `- [x]` for each completed requirement:
```markdown
- [x] **TAXON-01**: `subfamily` column added to `species.csv`...
- [x] **BROWSE-07**: Show/hide images toggle on by default...
```

**Traceability table pattern** — change `Pending` / `Partial` to `Complete` for all v1.3 requirements:
```markdown
| Requirement | Phase | Status |
|-------------|-------|--------|
| TAXON-01 | Phase 8 | Complete |
| BROWSE-07 | Phase 10 | Complete |
| SFILT-01 | Phase 9 | Complete |
```

**File:** `/Users/rainhead/dev/pnwmoths/.planning/REQUIREMENTS.md` lines 53–67 (Traceability table)

Change the 12 Traceability rows that currently read `Pending` or `Partial` to `Complete`. Every v1.3 requirement maps to a completed phase:
- TAXON-01, TAXON-02, TAXON-03 → Phase 8 Complete
- BROWSE-01 → Phase 10 Complete (already marked Complete)
- BROWSE-02 through BROWSE-06 → Phase 11 Complete
- BROWSE-07 → Phase 10 Complete (noscript) + Phase 11 Complete (toggle) — mark Complete per RESEARCH.md open question resolution
- SFILT-01 → Phase 9 Complete
- SFILT-02 → Phase 11 Complete

---

### `.planning/ROADMAP.md` (documentation, transform)

**Analog:** ROADMAP.md prior milestone close-out pattern (lines 8–10, v1.0–v1.2 entries)

**Milestone status line pattern** (lines 11–11):
```markdown
- ✅ **v1.3 Visual Browse** — Phases 8–12 (shipped 2026-04-20)
```
Change `🚧` to `✅` and add shipped date.

**Phase checkbox pattern** (lines 44–48):
```markdown
- [x] **Phase 12: Validation** - Full build verification; confirm all outputs correct and tests passing
```
Change `- [ ]` to `- [x]`.

**Plans list pattern** — replace `- [ ] TBD` with actual plan entry:
```markdown
Plans:
- [x] 12-01-PLAN.md — Commit UAT polish, run verification checklist, update planning docs
```

**Progress table pattern** (lines 129–142): Update Phase 12 row:
```markdown
| 12. Validation | v1.3 | 1/1 | Complete | 2026-04-20 |
```

**Wrap v1.3 in `<details>` block** — match the same folded pattern used for v1.0–v1.2 (lines 15–37):
```markdown
<details>
<summary>✅ v1.3 Visual Browse (Phases 8–12) — SHIPPED 2026-04-20</summary>
...phase list...
</details>
```

---

### `.planning/STATE.md` (documentation, transform)

**Analog:** STATE.md frontmatter block (lines 1–15) and Progress section (line 32)

**Frontmatter pattern** — update status, progress, last_updated:
```yaml
---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: Visual Browse
status: Complete
stopped_at: ~
last_updated: "2026-04-20T00:00:00Z"
last_activity: 2026-04-20
progress:
  total_phases: 5
  completed_phases: 5
  total_plans: 11
  completed_plans: 11
  percent: 100
---
```

**Progress bar pattern** (line 32):
```markdown
Progress: [██████████] 100%
```

**Current Position pattern** (lines 29–31):
```markdown
Phase: 12 of 12 (Validation)
Plan: complete
Status: Phase 12 complete — all v1.3 success criteria verified
Last activity: 2026-04-20 — v1.3 milestone closed
```

---

## Shared Patterns

### Git commit pattern
**Source:** `07-01-PLAN.md` and `11-03-PLAN.md`
**Apply to:** The single commit task for the four unstaged files

Stage specific files by name (never `git add .`):
```bash
git add src/components/pnwm-taxon-browser.js src/styles/theme.css src/species/species.njk .planning/config.json
git commit -m "fix(11): commit UAT toolbar polish — baseline alignment and button styles"
```

### Build verification pattern
**Source:** `11-03-PLAN.md` Task 2 (lines 119–175)
**Apply to:** The verification task

```bash
npm run build                                    # exit 0
ls _site/species-states.json                    # SC-1b
npm run build:validate-links                     # "0 Errors" in output
node --test scripts/build-data.test.js scripts/check-page-weight.test.js src/components/*.test.js  # "fail 0"
grep "data-pagefind-ignore" _site/browse/index.html  # SC-4
```

### Automated verify block pattern
**Source:** `11-03-PLAN.md` `<verify>` elements
**Apply to:** All auto tasks

```xml
<verify>
  <automated>npm run build &amp;&amp; echo "BUILD OK"</automated>
</verify>
```

### SUMMARY.md output pattern
**Source:** `07-01-PLAN.md` `<output>` element (line 258); `11-03-PLAN.md` `<output>` element (lines 267–276)
**Apply to:** End of plan

```xml
<output>
After completion, create `.planning/phases/12-validation/12-01-SUMMARY.md`

Include:
- Commit hash(es)
- Build output summary (exit code, any warnings)
- Test run output (pass/fail count)
- Verification grep results for SC-4
- Confirmation that all four SC items are met
</output>
```

---

## No Analog Found

No files in Phase 12 lack a codebase analog. Phase 12 creates no new source files.

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| (none) | — | — | — |

---

## Metadata

**Analog search scope:** `.planning/phases/07-*`, `.planning/phases/11-*`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md`
**Files scanned:** 7
**Pattern extraction date:** 2026-04-20

**Key observation:** Phase 12 is a pure close-out phase. No source code is written — only a git commit of already-correct unstaged files, shell command verification, and planning doc string replacements. All patterns are from the project's own prior close-out work (Phase 7 Task 2, Phase 11 Task 2).
