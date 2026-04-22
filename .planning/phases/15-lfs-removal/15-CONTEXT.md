# Phase 15: LFS Removal - Context

**Gathered:** 2026-04-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Remove all Git LFS infrastructure from the repo: purge `images/` and `plates/` from git history, clean `.gitattributes`, add both to `.gitignore`, delete local placeholder directories, and switch both CI workflows from the LFS checkout action to plain `actions/checkout@v4`.

</domain>

<decisions>
## Implementation Decisions

### History Rewrite Scope
- **D-01:** Remove BOTH `images/` AND `plates/` from git history in this phase. `plates/` contains 16,170 of the ~16,191 LFS-tracked objects (99.9% of LFS payload). Leaving it would mean CI still depends on LFS checkout after "LFS Removal" — that defeats the phase goal.
- **D-02:** Confirm before executing: no build step reads `plates/`. The plates page feature is explicitly deferred to v2 (out of scope).

### Migration Approach
- **D-03:** Use `git filter-repo --invert-paths` to remove `images/` and `plates/` from all of git history. **Do NOT use `git lfs migrate export` first.** Rationale: `migrate export` would download ~16k images locally just to expand them as blobs before immediately deleting them — large network fetch, high failure risk, no benefit. `filter-repo` operating on the ~130-byte LFS pointer files achieves the identical end state without any download.
- **D-04:** After `git filter-repo`, manually clean `.gitattributes` (remove all 4 `filter=lfs` lines) and force-push to main. Update REQUIREMENTS.md (LFS-01) to note this simplification — not an oversight, an intentional improvement.

### Post-Cleanup
- **D-05:** Add both `images/` and `plates/` to `.gitignore` after removal. Prevents accidental re-addition.
- **D-06:** Delete the local `images/` directory (4 placeholder species: acronicta-americana, hyles-lineata, phyllodesma-americana, glossary). These are stale pre-CDN placeholder data; the build pipeline constructs all URLs from CDN — nothing reads `images/` at build time. Delete `plates/` locally if it exists.

### CI Workflows
- **D-07:** Replace `nschloe/action-cached-lfs-checkout@385a8ecc719e50b8c71af6ab01a624b486b7c3bc` with plain `actions/checkout@v4` (pinned to SHA for consistency) in both `deploy.yml` and `pr-check.yml`. No other LFS-related options or steps.

### Claude's Discretion
- SHA pinning for the replacement `actions/checkout@v4` — use the current pinned SHA from the existing workflow as a model for how to pin it; Claude can determine the appropriate SHA.
- Order of operations for the history rewrite (git lfs uninstall, filter-repo invocation flags) — planner determines the exact sequence.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — LFS-01 and LFS-02 requirements (note: LFS-01 specifies `migrate export + filter-repo`; D-03 above intentionally simplifies to `filter-repo` alone — planner should update LFS-01 text)

### Files to Modify
- `.gitattributes` — 4 LFS rules to remove: `images/**/*.jpg`, `images/**/*.jpeg`, `images/**/*.png`, `plates/**/*.jpg`
- `.github/workflows/deploy.yml` — replace `nschloe/action-cached-lfs-checkout` with `actions/checkout@v4`
- `.github/workflows/pr-check.yml` — same replacement
- `.gitignore` — add `images/` and `plates/` entries

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None applicable — this is a git infrastructure phase with no source code changes.

### Established Patterns
- Both CI workflows pin action SHAs (e.g., `nschloe/action-cached-lfs-checkout@385a8ecc...`, `actions/setup-node@53b83947...`). Follow the same pinning convention when replacing the LFS action.

### Integration Points
- `.gitattributes` current state: 4 `filter=lfs` lines covering `images/**/*.{jpg,jpeg,png}` and `plates/**/*.jpg`
- Both workflows (`deploy.yml`, `pr-check.yml`) use `nschloe/action-cached-lfs-checkout` as the first checkout step — replace in both places.
- `git lfs ls-files` currently returns ~16,191 tracked files; success criterion 1 requires this to return nothing.
- Local `images/` has 4 subdirectories (placeholder species); `plates/` does not appear to exist locally.

</code_context>

<specifics>
## Specific Ideas

- Run `git lfs ls-files` before and after to verify the rewrite worked.
- After force-push, verify with a fresh `git clone` that: (1) no `images/` directory exists, (2) `git lfs ls-files` returns nothing, (3) `git lfs status` shows no tracked files.
- The success criteria require all 3 CI success criterion checks — planner should include a verification step against those exact conditions.

</specifics>

<deferred>
## Deferred Ideas

- CDN strategy for plates/ tile data (Zoomify tiles) — relevant when plates page feature is implemented in v2.
- Uninstalling `git lfs` from the local dev environment — out of scope for this phase (project infrastructure, not repo state).

</deferred>

---

*Phase: 15-lfs-removal*
*Context gathered: 2026-04-22*
