# Phase 15: LFS Removal - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-22
**Phase:** 15-lfs-removal
**Areas discussed:** plates/ fate, Migration approach, images/ post-removal

---

## plates/ fate

| Option | Description | Selected |
|--------|-------------|----------|
| Remove plates/ in Phase 15 alongside images/ | Single filter-repo pass; eliminates all LFS at once; plates/ is 99.9% of LFS payload; prerequisite: confirm no build step reads plates/ | ✓ |
| Leave plates/ for v2 | Defer; but CI still needs LFS checkout just for plates/ — negates phase goal | |

**User's choice:** Remove plates/ alongside images/ in Phase 15
**Notes:** Advisor research revealed plates/ holds 16,170 of ~16,191 LFS objects — leaving it would mean the project stays effectively LFS-dependent after "LFS Removal."

---

## Migration approach

| Option | Description | Selected |
|--------|-------------|----------|
| `git filter-repo --invert-paths` alone | No image download needed; operates on ~130-byte pointer files; single pass; identical end result; REQUIREMENTS.md to be updated | ✓ |
| `migrate export` + `filter-repo` (per spec) | Follows REQUIREMENTS.md literally; but downloads gigabytes of images just to delete them | |

**User's choice:** `git filter-repo` alone — skip `git lfs migrate export`
**Notes:** Advisor research found that 150MB of LFS cache exists locally vs 16,191 tracked files. `migrate export` would trigger a massive network fetch of image data we don't need. REQUIREMENTS.md LFS-01 should be updated to reflect this as an intentional simplification.

---

## images/ post-removal

| Option | Description | Selected |
|--------|-------------|----------|
| Add to .gitignore + delete local placeholder dirs | Clean state; no misleading dead-weight; fresh clone matches local env | ✓ |
| Add to .gitignore only, keep local dirs | Lower risk but stale pre-CDN data remains; discrepancy between original env and fresh clone | |

**User's choice:** Add images/ and plates/ to .gitignore AND delete local placeholder directories
**Notes:** The 4 placeholder species (acronicta-americana, hyles-lineata, phyllodesma-americana, glossary) are pre-CDN legacy data — the build pipeline reads nothing from images/.

---

## Claude's Discretion

- SHA pinning strategy for `actions/checkout@v4` replacement
- Exact `git filter-repo` invocation flags and order of operations

## Deferred Ideas

- CDN delivery strategy for plates/ Zoomify tile data (v2 plates feature)
- Uninstalling git-lfs from local dev environment
