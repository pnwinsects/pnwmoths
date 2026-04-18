---
phase: 05-maintainability
verified: 2026-04-12T12:00:00Z
status: verified
score: 8/9 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 7/9
  gaps_closed:
    - "Docker Alternative sections in instruction files omit npm ci prerequisite (Gap 2) — closed by baking npm ci into the Dockerfile and using an anonymous volume guard, making the single-command Docker Alternative correct as written"
    - "CI workflows used setup-node@v4 with hardcoded node-version: '22' — closed by upgrading to setup-node@v6 with node-version-file: '.nvmrc' in both deploy.yml and pr-check.yml"
  gaps_remaining:
    - "ADDING_SPECIES.md step 4 git add unconditionally includes optional .md file"
  regressions: []
gaps:
  - truth: "Following only ADDING_SPECIES.md, a non-technical maintainer can add a new species and push changes that trigger a successful deploy"
    status: partial
    reason: "Step 4 git add command unconditionally includes content/species/xestia-dolosa.md even though step 2 marks this file as optional. A maintainer who correctly skips step 2 will get 'pathspec did not match any files' when running the step 4 commit command as written."
    artifacts:
      - path: "_instructions/ADDING_SPECIES.md"
        issue: "Line 47: 'git add data/species.csv content/species/xestia-dolosa.md' — unconditionally includes optional prose file"
    missing:
      - "Add a conditional note in step 4: omit 'content/species/xestia-dolosa.md' from git add unless step 2 was performed. E.g., note '(omit content/species/... if you skipped step 2)' or split the commit into two examples."
human_verification:
  - test: "Observe a GitHub Actions run duration in the Actions UI after pushing to main"
    expected: "Full build (data import, Eleventy, Pagefind, lychee external link check, page weight check) completes in under 5 minutes"
    why_human: "Cannot measure actual GHA runner timing programmatically; external link checking (lychee without --offline) introduces variable network latency that can only be measured in a live CI environment"
---

# Phase 5: Maintainability Verification Report (Re-verification)

**Phase Goal:** A non-technical maintainer can add species, records, or edit content by following plain-English instructions, and the CI pipeline builds and deploys the site automatically on every push.
**Verified:** 2026-04-12
**Status:** gaps_found
**Re-verification:** Yes — after gap closure by plans 05-02 and 05-03

## Re-verification Summary

Previous status: `human_needed` (7/9 verified, 2 partial gaps, 1 human verification item).

Plan 05-03 closed Gap 2 (Docker cold start) and the setup-node version issue by:
- Baking `npm ci` into the Dockerfile runtime stage (line 21: `RUN npm ci`)
- Replacing the named `node_modules` volume with an anonymous volume guard (`- /workspace/node_modules`) that prevents the `.:/workspace` bind mount from shadowing the image-baked node_modules
- Upgrading both workflows from `actions/setup-node@v4` / `node-version: '22'` to `actions/setup-node@v6` / `node-version-file: '.nvmrc'`

Gap 1 (ADDING_SPECIES.md step 4 git error for optional file) remains unresolved. No plan touched `_instructions/ADDING_SPECIES.md`.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Following only ADDING_SPECIES.md, a non-technical maintainer can add a new species and push changes that trigger a successful deploy | PARTIAL | File exists with correct schema — but step 4 `git add` unconditionally includes `content/species/xestia-dolosa.md`, which causes a git error if the optional step 2 was skipped |
| 2 | Following only ADDING_RECORDS.md, a maintainer can add occurrence records for an existing species | VERIFIED | File exists with correct 14-field records.csv schema, valid states, build verification step, Docker alternative |
| 3 | Following only EDITING_DESCRIPTION.md, a maintainer can create or edit a species prose description | VERIFIED | File exists with content/species/{slug}.md path, frontmatter format, slug-to-filename rules, build step |
| 4 | Following only ADDING_PHOTO.md, a maintainer can add a photo with proper Git LFS handling | VERIFIED | File exists with images.csv schema, git lfs install / git lfs status steps, .gitattributes patterns referenced |
| 5 | Each instruction file includes exact CSV schemas, file paths, and build verification commands | VERIFIED | All four files verified against actual CSV headers — schemas match exactly |
| 6 | A push to main triggers a GitHub Actions workflow that builds and deploys the site without manual intervention | VERIFIED | deploy.yml: push:branches:[main] trigger, two-job build+deploy pipeline, configure-pages, upload-pages-artifact, deploy-pages@v4 |
| 7 | A pull request triggers a build-only check workflow (no deploy) | VERIFIED | pr-check.yml: pull_request:branches:[main] trigger, no deploy-pages or upload-pages-artifact steps, permissions: contents: read |
| 8 | The CI workflow caches npm dependencies, LFS objects, and lychee binary between runs | VERIFIED | setup-node cache:'npm'; nschloe/action-cached-lfs-checkout@v1; .github/actions/install-lychee composite action with actions/cache keyed to lychee-0.23.0-linux-amd64; lychee URL results cached at .lycheecache |
| 9 | Running docker build followed by the build command produces output identical to the CI workflow; a maintainer can reproduce the production build locally using Docker without installing Node.js or DuckDB manually | VERIFIED | Dockerfile: node:22-bookworm-slim, git-lfs, lychee binary from builder stage with SHA-256 verification, `COPY package*.json ./` + `RUN npm ci` baked in. docker-compose.yml: anonymous volume guard at /workspace/node_modules. Docker Alternative command `docker compose run --rm dev npm run build` is now correct without a separate npm ci step. |

**Score:** 8/9 truths verified (1 partial)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.github/workflows/deploy.yml` | Build + deploy on push to main | VERIFIED | push:branches:[main], setup-node@v6 with node-version-file, npm ci, install-lychee composite action, configure-pages, npm run build, upload-pages-artifact, deploy-pages |
| `.github/workflows/pr-check.yml` | Build-only on pull requests | VERIFIED | pull_request:branches:[main], setup-node@v6 with node-version-file, npm ci, install-lychee composite action, npm run build — no deploy steps; permissions: contents: read |
| `.github/actions/install-lychee/action.yml` | Composite action for lychee install with checksum | VERIFIED | Caches binary at ~/.local/bin/lychee, downloads from GitHub Releases, verifies SHA-256 `1fcb6ccf10d04c22b8c5873c5b9cb7be32ee7423e12169d6f1a79a6f1962ef81`, extracts and chmod |
| `lychee.toml` | Lychee link checker configuration | VERIFIED | timeout=20, max_retries=3, cache=true, accept=["100..=103","200..=299","429"] |
| `Dockerfile` | Full dev/build environment | VERIFIED | Multi-stage: debian:bookworm-slim (lychee-builder with SHA-256 check) + node:22-bookworm-slim (runtime with git-lfs, lychee copy, WORKDIR, COPY package*.json, RUN npm ci) |
| `docker-compose.yml` | Convenience wrapper for Docker dev environment | VERIFIED | build: ., .:/workspace bind mount, anonymous volume guard /workspace/node_modules, no named node_modules volume |
| `_instructions/ADDING_SPECIES.md` | Recipe for adding a new species | PARTIAL | Exists with correct schema — step 4 git add issue unresolved |
| `_instructions/ADDING_RECORDS.md` | Recipe for adding occurrence records | VERIFIED | 14-field schema matching records.csv header, valid states, Docker alternative |
| `_instructions/EDITING_DESCRIPTION.md` | Recipe for editing species descriptions | VERIFIED | content/species/{slug}.md path, frontmatter format, slug rules |
| `_instructions/ADDING_PHOTO.md` | Recipe for adding a photo with Git LFS | VERIFIED | images.csv schema, git lfs install/status, .gitattributes patterns |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `.github/workflows/deploy.yml` | package.json build script | `npm run build` | VERIFIED | Line 35: `run: npm run build` |
| `.github/workflows/deploy.yml` | `.nvmrc` | `node-version-file: '.nvmrc'` | VERIFIED | Line 22: `node-version-file: '.nvmrc'` |
| `.github/workflows/pr-check.yml` | `.nvmrc` | `node-version-file: '.nvmrc'` | VERIFIED | Line 16: `node-version-file: '.nvmrc'` |
| `Dockerfile` | lychee binary | `COPY --from=lychee-builder` | VERIFIED | Line 18: `COPY --from=lychee-builder /usr/local/bin/lychee /usr/local/bin/lychee` |
| `Dockerfile` | `RUN npm ci` | `COPY package*.json ./` | VERIFIED | Lines 20-21: COPY package*.json, then RUN npm ci |
| `docker-compose.yml` | `/workspace/node_modules` | anonymous volume guard | VERIFIED | Line 6: `- /workspace/node_modules` — prevents bind mount from shadowing image layer |
| `package.json` | lychee.toml | `build:validate-links` | VERIFIED | `lychee --config lychee.toml --root-dir _site '_site/**/*.html'` — no --offline flag |
| `_instructions/ADDING_SPECIES.md` | data/species.csv | CSV row addition | VERIFIED | References data/species.csv with exact 8-field schema |
| `_instructions/ADDING_PHOTO.md` | .gitattributes | Git LFS tracking | VERIFIED | References .gitattributes patterns (images/**/*.jpg, images/**/*.jpeg, images/**/*.png) |

### Data-Flow Trace (Level 4)

Not applicable — this phase produces CI configuration and documentation, not components that render dynamic data.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| deploy.yml has valid YAML | `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy.yml'))"` | Valid | PASS |
| pr-check.yml has no deploy steps | `grep -c "deploy-pages\|upload-pages-artifact" .github/workflows/pr-check.yml` | 0 matches | PASS |
| deploy.yml uses setup-node@v6 | `grep "setup-node@v6" .github/workflows/deploy.yml` | Match found | PASS |
| pr-check.yml uses setup-node@v6 | `grep "setup-node@v6" .github/workflows/pr-check.yml` | Match found | PASS |
| deploy.yml reads .nvmrc | `grep "node-version-file" .github/workflows/deploy.yml` | `node-version-file: '.nvmrc'` | PASS |
| pr-check.yml reads .nvmrc | `grep "node-version-file" .github/workflows/pr-check.yml` | `node-version-file: '.nvmrc'` | PASS |
| Dockerfile has npm ci baked in | `grep "RUN npm ci" Dockerfile` | Line 21 | PASS |
| docker-compose.yml has no named node_modules volume | `grep "volumes:" docker-compose.yml` (top-level) | Only service-level volumes section | PASS |
| docker-compose.yml has anonymous volume guard | `grep "/workspace/node_modules" docker-compose.yml` | Line 6 | PASS |
| lychee composite action has SHA-256 verification | `grep "sha256sum" .github/actions/install-lychee/action.yml` | sha256sum -c - present | PASS |
| Dockerfile has SHA-256 verification | `grep "sha256sum" Dockerfile` | Line 8: sha256sum -c - | PASS |
| ADDING_SPECIES.md step 4 git add includes optional file | `grep "content/species/xestia-dolosa.md" _instructions/ADDING_SPECIES.md` | Line 47 — unconditional | FAIL |
| All 4 instruction files have Docker alternative | `grep -l "Docker Alternative" _instructions/*.md \| wc -l` | 4 files | PASS |
| Commits claimed in Plan 03 SUMMARY exist | `git log 4e819d7 06c9553` | Both found | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| MAINT-01 | 05-02 | Plain-English LLM instructions for four editing tasks | PARTIAL | All 4 files exist with correct schemas — ADDING_SPECIES.md step 4 has git add error for optional file |
| MAINT-02 | 05-01, 05-03 | GitHub Actions builds and deploys on push to main | VERIFIED | deploy.yml complete; setup-node@v6 with .nvmrc; lychee composite action with checksum |
| MAINT-03 | 05-01 | Full build completes in under 5 minutes on GHA runner | HUMAN NEEDED | Caching strategy verified in code (npm via setup-node, LFS via cached-lfs-checkout, lychee binary, lychee URL cache); actual timing requires human observation of live run |
| MAINT-04 | 05-01, 05-03 | Dockerfile defines build environment; local build identical to CI | VERIFIED | npm ci baked into Dockerfile; anonymous volume guard protects image node_modules from bind mount; Docker Alternative command is correct as written |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `_instructions/ADDING_SPECIES.md` | 47 | `git add` unconditionally includes optional `content/species/xestia-dolosa.md` | Blocker | Causes `pathspec did not match any files` git error if maintainer correctly skips optional step 2; MAINT-01 partial |
| `Dockerfile` | 7 | lychee binary URL hardcoded to x86_64 architecture | Warning | Docker build will silently download wrong binary on ARM hosts (Apple Silicon Macs); acceptable for Linux CI target but noted for awareness |

Previously flagged items now resolved:
- lychee binary download without SHA-256 checksum (CR-01/CR-02): FIXED — SHA-256 verification added to both Dockerfile and composite action
- Hardcoded `node-version: '22'` in workflows (WR-01 equivalent): FIXED — now reads from .nvmrc via node-version-file
- `actions/setup-node@v4` version: FIXED — upgraded to @v6 in both workflows
- `npx @11ty/eleventy` in build:eleventy: FIXED — changed to local `eleventy` binary

### Human Verification Required

#### 1. Build completes in under 5 minutes on GitHub Actions

**Test:** Push a change to main and observe the Actions run duration in the GitHub Actions UI.
**Expected:** The full build pipeline (build:data, build:eleventy, build:copy-parquet, build:pagefind, build:validate-links with external URL checking, build:check-weight) completes in under 5 minutes.
**Why human:** Cannot measure GHA runner timing programmatically. The external link check (lychee without --offline) adds variable network latency observable only in a real CI environment. Cache-warm runs are likely fast; first-run timing is the concern.

### Gaps Summary

One gap remains from the initial verification. Plan 03 successfully closed Gap 2 (Docker cold start) and the setup-node version issue using a different approach than originally prescribed — baking npm ci into the Dockerfile eliminates the need for maintainers to run a separate install step. The Docker Alternative sections in instruction files are now correct as written.

**Remaining Gap — ADDING_SPECIES.md step 4 git error (MAINT-01 partial):** A maintainer who correctly skips the optional step 2 (no prose description) will encounter a git error when running the step 4 commit command `git add data/species.csv content/species/xestia-dolosa.md`. This is the most visible failure mode for success criterion 1. The fix is a one-line clarification: make the `.md` file inclusion in `git add` conditional on having performed step 2.

---

_Verified: 2026-04-12_
_Verifier: Claude (gsd-verifier)_
