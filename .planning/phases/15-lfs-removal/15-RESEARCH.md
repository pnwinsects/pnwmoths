# Phase 15: LFS Removal - Research

**Researched:** 2026-04-22
**Domain:** Git history rewriting, Git LFS removal, GitHub Actions CI
**Confidence:** HIGH

## Summary

This phase removes all Git LFS infrastructure from the pnwmoths repository. The primary work is
a destructive history rewrite using `git filter-repo --invert-paths` to excise `images/` and
`plates/` directories from all commits, followed by `.gitattributes` cleanup, `.gitignore` update,
local directory deletion, and CI workflow replacement.

The approach is well-understood and safe given the single-maintainer context (no collaborators to
coordinate with beyond forcing the remote). All decisions in CONTEXT.md are locked and technically
sound. D-03 (skip `git lfs migrate export`) is correct: filter-repo operates on 130-byte pointer
files without downloading LFS objects, achieving the same end state in seconds rather than
potentially hours. D-02 is verified: `build:copy-plates` is not invoked from the main `build`
script, so removing `plates/` does not break the CI build. The `plates.js` data module gracefully
returns `[]` when `plates/manifest.json` is absent, so the plates page renders "No plates available"
rather than erroring.

**Primary recommendation:** `brew install git-filter-repo` (not installed locally), then follow the
fresh-clone + force-push procedure with explicit verification steps at each stage.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Remove BOTH `images/` AND `plates/` from git history in this phase.
- **D-02:** Confirm before executing: no build step reads `plates/`. (VERIFIED — `build:copy-plates`
  is not in the `build` script; `plates.js` gracefully returns `[]` when manifest absent.)
- **D-03:** Use `git filter-repo --invert-paths` ONLY — do NOT use `git lfs migrate export` first.
- **D-04:** After filter-repo, manually clean `.gitattributes` (remove all 4 `filter=lfs` lines)
  and force-push to main. Update REQUIREMENTS.md (LFS-01) to reflect this simplification.
- **D-05:** Add both `images/` and `plates/` to `.gitignore`.
- **D-06:** Delete local `images/` directory (4 placeholder species: acronicta-americana,
  hyles-lineata, phyllodesma-americana, glossary). Delete `plates/` locally if it exists.
- **D-07:** Replace `nschloe/action-cached-lfs-checkout@385a8ecc...` with plain
  `actions/checkout@v4` (pinned to SHA) in both `deploy.yml` and `pr-check.yml`.

### Claude's Discretion

- SHA pinning for the replacement `actions/checkout@v4` — use the current pinned SHA from the
  existing workflow as a model; Claude can determine the appropriate SHA.
- Order of operations for the history rewrite (git lfs uninstall timing, filter-repo invocation
  flags) — planner determines the exact sequence.

### Deferred Ideas (OUT OF SCOPE)

- CDN strategy for plates/ tile data (Zoomify tiles) — relevant when plates page is implemented in v2.
- Uninstalling `git lfs` from the local dev environment — out of scope for this phase.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LFS-01 | `git filter-repo` run to purge `images/` (and `plates/`) from history; `.gitattributes` cleaned; force-pushed | D-03 approach verified correct; exact command syntax documented in Architecture Patterns |
| LFS-02 | GitHub Actions LFS checkout action replaced with plain `actions/checkout@v4` in both deploy and PR check workflows | SHA for v4.3.1 verified; exact replacement documented |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| History rewrite | Local git | — | filter-repo runs locally; output is pushed to remote |
| Remote cleanup | GitHub (remote) | — | Force-push overwrites main branch history |
| CI workflow update | GitHub Actions | — | Workflow YAML files define checkout behavior |
| Local directory cleanup | Working tree | — | `images/` and `plates/` are local filesystem concerns |

## Standard Stack

### Core

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| git-filter-repo | 2.47.0 | History rewrite — remove paths from all commits | Official git project recommendation; replaces deprecated filter-branch; runs automatically gc after rewrite [CITED: github.com/newren/git-filter-repo] |
| git lfs | 3.7.1 (installed) | Currently tracking 16,191 objects; to be uninstalled from repo config after rewrite | — |
| actions/checkout | v4.3.1 | Plain repository checkout in CI | Replaces nschloe/action-cached-lfs-checkout |

### Installation

`git-filter-repo` is NOT currently installed. Install via Homebrew:

```bash
brew install git-filter-repo
```

This installs version 2.47.0. [VERIFIED: brew info git-filter-repo]

## Architecture Patterns

### System Architecture Diagram

```
Local working copy (current)                Remote (GitHub)
────────────────────────────                ────────────────────
.git/lfs/objects/ (~150MB)                  LFS storage (accept billing; out of scope)
images/ (4 placeholder species)
plates/ (96 subdirs + manifest.json)
.gitattributes (4 filter=lfs lines)
                │
                │  1. brew install git-filter-repo
                │  2. git clone --no-local (fresh clone)
                │  3. git filter-repo --invert-paths (rewrite)
                │  4. Edit .gitattributes (remove lfs lines)
                │  5. Edit .gitignore (add images/ plates/)
                │  6. git push --force origin main
                ▼
Local working copy (after)                  Remote (after)
────────────────────────────                ────────────────────
images/         → deleted                   history: no images/ or plates/ blobs
plates/         → deleted                   .gitattributes: no filter=lfs lines
.gitattributes  → cleaned                   .gitignore: images/ plates/ added
.git/ (smaller)
                                            CI workflows: actions/checkout@v4
                                            (no LFS download on checkout)
```

### Recommended Execution Order

**Step 1: Install tool**
```bash
brew install git-filter-repo
```

**Step 2: Create fresh clone (required by filter-repo)**

filter-repo requires a "fresh clone" (no remote other than origin, clean reflog, single packfile)
or the use of `--force`. The current working copy has 352 commits and is NOT a fresh clone.
The correct approach is a temporary fresh clone using `--no-local` to prevent hardlink sharing:

```bash
# --no-local prevents filesystem hardlinks (which would fool fresh-clone detection AND
# corrupt the original repo if filter-repo prunes objects)
cd /tmp
git clone --no-local https://github.com/pnwinsects/pnwmoths.git pnwmoths-lfs-rewrite
cd pnwmoths-lfs-rewrite
```

**Step 3: Run filter-repo — remove both paths in one pass**

```bash
# Source: github.com/newren/git-filter-repo documentation
git filter-repo --invert-paths --path images/ --path plates/
```

Multiple `--path` arguments with `--invert-paths` produce a UNION — i.e., remove any file
matching ANY of the listed paths. This is a single-pass operation over all 352 commits.
[CITED: manpages.debian.org/testing/git-filter-repo/git-filter-repo.1.en.html]

filter-repo automatically prunes reflogs and runs gc after the rewrite — no manual gc step
needed in the fresh clone. [CITED: github.com/newren/git-filter-repo README, gc note]

**Step 4: Edit files in the rewritten clone**

```bash
# Remove all 4 filter=lfs lines from .gitattributes (entire file will be empty after removal)
# (or remove the file if .gitattributes has no other rules)
# Current .gitattributes contents (all 4 lines to remove):
#   images/**/*.jpg filter=lfs diff=lfs merge=lfs -text
#   images/**/*.jpeg filter=lfs diff=lfs merge=lfs -text
#   images/**/*.png filter=lfs diff=lfs merge=lfs -text
#   plates/**/*.jpg filter=lfs diff=lfs merge=lfs -text

# Add to .gitignore:
#   images/
#   plates/

# Update REQUIREMENTS.md: LFS-01 checkbox text to reflect filter-repo-only approach (drop
# reference to "git lfs migrate export")
```

**Step 5: Commit the file edits**

```bash
git add .gitattributes .gitignore .planning/REQUIREMENTS.md
git commit -m "chore(lfs): clean up LFS tracking rules and update .gitignore"
```

**Step 6: Run git lfs uninstall --local**

After the rewrite, LFS hooks/smudge filters are still registered in the fresh clone's
`.git/config`. Remove them:

```bash
git lfs uninstall --local
```

`--local` modifies only `.git/config` (not `~/.gitconfig`). This removes the LFS smudge/clean
filters from the cloned repo's config.
[CITED: git-lfs uninstall man page — --local flag removes filters from local repo config only]

**Step 7: Force-push to main**

Branch protection on `pnwinsects/pnwmoths` main is DISABLED (verified). Single maintainer —
force-push is safe.

```bash
git push --force origin main
```

**Step 8: Delete local `images/` and `plates/` in working copy**

Back in the original working copy (`/Users/rainhead/dev/pnwmoths`):

```bash
rm -rf images/ plates/
```

Local state confirmed:
- `images/` exists with 4 subdirs (acronicta-americana, glossary, hyles-lineata, phyllodesma-americana)
- `plates/` exists with 96+ subdirs + manifest.json [VERIFIED: ls output]

**Step 9: Update the original working copy**

After force-push, the original working copy's `origin/main` history has been rewritten. Options:
- `git fetch origin && git reset --hard origin/main` — discards local commits since rewrite
- Or simply: use the fresh clone as the new working copy going forward

The working copy has no unmerged local commits (all work is on main), so reset is safe.

**Step 10: Update CI workflows**

In both `.github/workflows/deploy.yml` and `.github/workflows/pr-check.yml`:

Replace:
```yaml
- uses: nschloe/action-cached-lfs-checkout@385a8ecc719e50b8c71af6ab01a624b486b7c3bc # v1
```

With:
```yaml
- uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4.3.1
```

**SHA verified:** `34e114876b0b11c390a56381ad16ebd13914f8d5` is the commit SHA for tag `v4.3.1`
of `actions/checkout`. [VERIFIED: gh api repos/actions/checkout/git/refs/tags/v4.3.1]

Note: `actions/checkout` has since released v5 and v6 (latest is v6.0.2 as of 2026-01-09).
CONTEXT.md D-07 locks the replacement as "actions/checkout@v4" — use v4.3.1 per the decision.
If upgrading to v6 is desired, that is a separate decision outside this phase.

### Anti-Patterns to Avoid

- **Running filter-repo in the actual working copy with --force:** Risk of corrupting the
  working copy if something goes wrong. Use a separate `--no-local` clone instead.
- **Using `git clone` without `--no-local` for local clones:** Git uses hardlinks for local
  clones by default. filter-repo will then consider the clone non-fresh (objects shared with
  original), AND pruning objects in the clone could corrupt the original. Always use `--no-local`.
- **Running filter-repo in the GitHub Actions repo clone:** Not applicable here — this is a
  local operation, not a CI step.
- **Forgetting to update .gitattributes:** After filter-repo removes the blobs, LFS rules in
  `.gitattributes` would cause git to try to track new additions as LFS objects. Clean this
  first.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| History rewrite to remove paths | Custom git-filter-branch scripts | git-filter-repo | filter-branch is deprecated; filter-repo handles refs, reflogs, gc automatically |
| Multi-path removal | Two separate filter-repo passes | Single pass with multiple `--path` flags | One pass is faster and avoids intermediate states |

## Runtime State Inventory

> This is a rename/refactor/migration phase — runtime state audit required.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | `images/` (4 species dirs) and `plates/` (96 subdirs + manifest.json) exist in working copy | `rm -rf images/ plates/` in original working copy after force-push |
| Stored data | `.git/lfs/objects/` (~150MB) exists locally | No action required — this is the local LFS cache; it will not be pushed; can be manually deleted later if disk space needed (out of scope) |
| Live service config | GitHub LFS storage (remote objects) | Accept billing; out of scope per REQUIREMENTS.md. No repo deletion required. |
| OS-registered state | None — no OS-level LFS registrations exist | None |
| Secrets/env vars | None — no env vars reference images/ or plates/ | None |
| Build artifacts | `_site/` (if present, may contain linked plates/) | Clean `_site/` with `npm run build` after rewrite; or simply delete `_site/` before rebuild |

**plates.js graceful degradation:** `src/_data/plates.js` reads `plates/manifest.json` only when
`PLATES_Z_SOURCE` env var is absent (the CI code path). When `manifest.json` does not exist, it
logs a warning and returns `[]`. The plates page renders "No plates available." This is correct
behavior post-deletion — the plates feature is deferred to v2. [VERIFIED: src/_data/plates.js lines 149-166]

**copy-plates.js not in build:** `build:copy-plates` is defined in package.json but is NOT
included in the main `build` script. The `build` script is:
```
npm run build:data && npm run build:eleventy && npm run build:copy-parquet &&
npm run build:copy-images && npm run build:species-states && npm run build:pagefind &&
npm run build:validate-links && npm run build:check-weight
```
No `build:copy-plates` call. D-02 is confirmed. [VERIFIED: package.json]

## Common Pitfalls

### Pitfall 1: Local clone hardlink corruption
**What goes wrong:** Running `git clone /local/path` creates hardlinks. filter-repo pruning
objects in the clone deletes them from the original repository's packfiles.
**Why it happens:** Git uses `--local` by default for same-filesystem clones to save disk space.
**How to avoid:** Always `git clone --no-local <url>` or `git clone --no-local <local-path>`.
**Warning signs:** `.git/objects/pack/` pack files in the original become missing objects.

### Pitfall 2: Forgetting .gitattributes cleanup causes future LFS tracking
**What goes wrong:** After filter-repo removes the blobs, remaining `filter=lfs` rules in
`.gitattributes` would cause any future `images/` or `plates/` file additions to be LFS-tracked.
**Why it happens:** filter-repo rewrites history but does not modify `.gitattributes` automatically.
**How to avoid:** Remove all 4 `filter=lfs` lines from `.gitattributes` as part of the commit
immediately after the rewrite.

### Pitfall 3: Original working copy diverged after force-push
**What goes wrong:** After force-pushing the rewritten history, `git pull` on the original
working copy will fail ("would diverge"). Normal `git pull` cannot fast-forward to rewritten history.
**Why it happens:** Force-push creates a new ancestry for main.
**How to avoid:** Use `git fetch origin && git reset --hard origin/main` in the original working
copy (safe since there are no local-only commits to preserve).

### Pitfall 4: build:copy-plates writes to plates/ before deletion
**What goes wrong:** If `plates/` is deleted but `build:copy-plates` is run locally with
`PLATES_Z_SOURCE` set, it will recreate `plates/` as non-LFS files.
**Why it happens:** `copy-plates.js` writes to both `REPO_PLATES` and `SITE_DEST`.
**How to avoid:** Ensure `.gitignore` entry for `plates/` exists before any local build runs.
The `.gitignore` update happens in the same commit as `.gitattributes` cleanup.

## Code Examples

### filter-repo invocation (verified syntax)
```bash
# Source: github.com/newren/git-filter-repo documentation
# Run from inside the fresh clone directory
git filter-repo --invert-paths --path images/ --path plates/
```

### .gitattributes after cleanup (file should be empty or deleted)
```
# All 4 lines below must be REMOVED:
# images/**/*.jpg filter=lfs diff=lfs merge=lfs -text
# images/**/*.jpeg filter=lfs diff=lfs merge=lfs -text
# images/**/*.png filter=lfs diff=lfs merge=lfs -text
# plates/**/*.jpg filter=lfs diff=lfs merge=lfs -text
```

### .gitignore additions
```
images/
plates/
```

### CI workflow replacement (both deploy.yml and pr-check.yml)
```yaml
# BEFORE:
- uses: nschloe/action-cached-lfs-checkout@385a8ecc719e50b8c71af6ab01a624b486b7c3bc # v1

# AFTER:
- uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4.3.1
```

### Verification commands
```bash
# After force-push, from original working copy (after reset --hard):
git lfs ls-files                    # must return nothing
grep "filter=lfs" .gitattributes    # must return nothing (or file not found)

# Fresh clone verification:
cd /tmp
git clone https://github.com/pnwinsects/pnwmoths.git pnwmoths-verify
ls pnwmoths-verify/images/ 2>/dev/null || echo "PASS: no images/"
cd pnwmoths-verify && git lfs ls-files   # must return nothing
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| git filter-branch | git filter-repo | ~2019+ | filter-branch deprecated in git 2.36 |
| git lfs migrate export (expand + delete) | git filter-repo --invert-paths on pointer files | D-03 in CONTEXT.md | No LFS download needed (~16k files = 0 bytes to download) |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | filter-repo automatically runs gc/prune after rewrite (no manual gc needed in fresh clone) | Architecture Patterns Step 3 | If wrong: repo on disk stays large; fix by running `git gc --prune=now` manually — low risk, easily corrected |
| A2 | GitHub does not require special steps (LFS lock cleanup, repo settings) after force-push removes LFS history | Architecture Patterns | If wrong: CI might still attempt LFS fetch; mitigated by removing `nschloe/action-cached-lfs-checkout` from workflows |

## Open Questions

1. **Should .gitattributes be emptied or deleted?**
   - What we know: All 4 lines in `.gitattributes` are LFS rules; no other rules exist in the file.
   - What's unclear: Whether an empty `.gitattributes` is preferable to no file at all.
   - Recommendation: Delete the file (it has no remaining content). A missing `.gitattributes`
     is identical in behavior to an empty one for this repo.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| git | History rewrite | ✓ | 2.53.0 | — |
| git lfs | Currently tracking (to be removed) | ✓ | 3.7.1 | — |
| git-filter-repo | History rewrite | ✗ | — | Must install: `brew install git-filter-repo` |
| gh CLI | Branch protection check / verification | ✓ | (installed) | — |

**Missing dependencies with no fallback:**
- `git-filter-repo` — blocking for the rewrite step. Install: `brew install git-filter-repo`

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner |
| Config file | none (test files passed explicitly) |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LFS-01 | `git lfs ls-files` returns nothing after rewrite | manual/shell | `git lfs ls-files \| wc -l` (expect 0) | n/a — shell check |
| LFS-01 | `.gitattributes` contains no `filter=lfs` lines | manual/shell | `grep "filter=lfs" .gitattributes` (expect no match) | n/a — shell check |
| LFS-01 | Fresh clone produces no `images/` directory | manual | `git clone ...; ls images/ 2>/dev/null` | n/a — manual |
| LFS-02 | Both workflow files use `actions/checkout@v4` | manual/shell | `grep "actions/checkout" .github/workflows/*.yml` | n/a — shell check |

All verification steps for this phase are shell-level git/filesystem checks. No new unit test
files are needed — existing `npm test` suite must remain green post-rewrite.

### Wave 0 Gaps
None — no new test infrastructure required. Existing test suite must pass after the rewrite
to confirm build pipeline integrity.

## Security Domain

> Not applicable for this phase. The work is pure git infrastructure (history rewrite, CI workflow
> update). No authentication, session management, input validation, or cryptography concerns apply.
> No user-facing code changes.

## Sources

### Primary (HIGH confidence)
- `github.com/newren/git-filter-repo` — `--invert-paths` with multiple `--path` flags syntax
- `manpages.debian.org/testing/git-filter-repo/git-filter-repo.1.en.html` — `--invert-paths` docs
- `gh api repos/actions/checkout/git/refs/tags/v4.3.1` — SHA `34e114876b0b11c390a56381ad16ebd13914f8d5` verified
- `brew info git-filter-repo` — version 2.47.0, not installed
- `git lfs uninstall --help` — `--local` flag scope documented
- Codebase: `package.json`, `src/_data/plates.js`, `scripts/copy-plates.js`, `.gitattributes`,
  `.github/workflows/deploy.yml`, `.github/workflows/pr-check.yml` — all read directly

### Secondary (MEDIUM confidence)
- `docs.github.com/en/repositories/working-with-files/managing-large-files/removing-files-from-git-large-file-storage` — GitHub does not require special cleanup steps post-force-push; LFS objects remain on remote storage (out of scope per REQUIREMENTS.md)
- WebSearch: `--no-local` requirement for local filesystem clones verified across multiple sources

### Tertiary (LOW confidence — see Assumptions Log)
- filter-repo auto-gc claim: cited from FAQ fetch but documentation was incomplete on this point

## Metadata

**Confidence breakdown:**
- filter-repo command syntax: HIGH — cited from official documentation
- actions/checkout SHA: HIGH — verified via GitHub API
- plates/ graceful degradation: HIGH — read source code directly
- tool installation (brew): HIGH — verified locally
- filter-repo auto-gc behavior: MEDIUM — found in search results, consistent with `--force` flag description

**Research date:** 2026-04-22
**Valid until:** 2026-07-22 (stable tooling; SHAs are immutable)
