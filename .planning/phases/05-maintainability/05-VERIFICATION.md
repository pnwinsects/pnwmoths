---
phase: 05-maintainability
verified: 2026-04-12T00:00:00Z
status: human_needed
score: 7/9 must-haves verified
overrides_applied: 0
gaps:
  - truth: "Following only ADDING_SPECIES.md, a non-technical maintainer can add a new species and push changes that trigger a successful deploy"
    status: partial
    reason: "Step 4 git add command unconditionally includes content/species/xestia-dolosa.md even though step 2 marks this file as optional. A maintainer who skips step 2 (as permitted) will get a 'pathspec did not match' git error when running the commit command as written."
    artifacts:
      - path: "_instructions/ADDING_SPECIES.md"
        issue: "git add in step 4 includes optional .md file unconditionally — will error if step 2 was skipped"
    missing:
      - "Add a conditional note in step 4: include 'git add content/species/xestia-dolosa.md' only if step 2 was performed"
  - truth: "Running docker build followed by the build command produces output identical to the CI workflow; a maintainer can reproduce the production build locally using Docker without installing Node.js or DuckDB manually"
    status: partial
    reason: "The Docker Alternative sections in all four instruction files show only 'docker compose run --rm dev npm run build' without the prerequisite 'docker compose run --rm dev npm ci'. A first-time user following only the instruction file would get build failures because the node_modules volume is empty. The correct two-step usage is documented in the PLAN but not surfaced to maintainers."
    artifacts:
      - path: "_instructions/ADDING_SPECIES.md"
        issue: "Docker Alternative section omits 'docker compose run --rm dev npm ci' prerequisite"
      - path: "_instructions/ADDING_RECORDS.md"
        issue: "Docker Alternative section omits 'docker compose run --rm dev npm ci' prerequisite"
      - path: "_instructions/EDITING_DESCRIPTION.md"
        issue: "Docker Alternative section omits 'docker compose run --rm dev npm ci' prerequisite"
      - path: "_instructions/ADDING_PHOTO.md"
        issue: "Docker Alternative section omits 'docker compose run --rm dev npm ci' prerequisite"
    missing:
      - "Update Docker Alternative sections in all four instruction files to show both steps: 'docker compose run --rm dev npm ci' (first time only) then 'docker compose run --rm dev npm run build'"
human_verification:
  - test: "Observe a GitHub Actions run duration in the Actions UI after pushing to main"
    expected: "Full build (data import, Eleventy, Pagefind, lychee external link check, page weight check) completes in under 5 minutes"
    why_human: "Cannot measure actual GHA runner timing programmatically; external link checking (lychee without --offline) introduces variable network latency that could push the build past 5 minutes on first run before caches warm"
---

# Phase 5: Maintainability Verification Report

**Phase Goal:** A non-technical maintainer can add species, records, or edit content by following plain-English instructions, and the CI pipeline builds and deploys the site automatically on every push.
**Verified:** 2026-04-12
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Following only ADDING_SPECIES.md, a non-technical maintainer can add a new species and push changes that trigger a successful deploy | PARTIAL | File exists, schema accurate, steps complete — but step 4 unconditionally stages optional .md file causing potential git error |
| 2 | Following only ADDING_RECORDS.md, a maintainer can add occurrence records for an existing species | VERIFIED | File exists with correct 14-field schema matching actual records.csv header; steps, verification, and Docker alternative all present |
| 3 | Following only EDITING_DESCRIPTION.md, a maintainer can create or edit a species prose description | VERIFIED | File exists with correct content/species/{slug}.md path, frontmatter format, and step-by-step instructions |
| 4 | Following only ADDING_PHOTO.md, a maintainer can add a photo with proper Git LFS handling | VERIFIED | File exists with images.csv schema, explicit git lfs install / git lfs status steps, .gitattributes patterns referenced |
| 5 | Each instruction file includes exact CSV schemas, file paths, and build verification commands | VERIFIED | All four files verified against actual CSV headers — schemas match exactly |
| 6 | A push to main triggers a GitHub Actions workflow that builds and deploys the site without manual intervention | VERIFIED | deploy.yml exists with push:branches:[main] trigger, two-job build+deploy pipeline, permissions block, configure-pages, upload-pages-artifact, deploy-pages steps |
| 7 | A pull request triggers a build-only check workflow (no deploy) | VERIFIED | pr-check.yml exists with pull_request:branches:[main] trigger; no deploy-pages or upload-pages-artifact steps |
| 8 | The CI workflow caches npm dependencies, LFS objects, and lychee binary between runs | VERIFIED | setup-node cache:'npm', nschloe/action-cached-lfs-checkout@v1, actions/cache for lychee binary (key: lychee-0.23.0-linux-amd64), actions/cache for lychee URL results (.lycheecache) |
| 9 | Running docker build followed by the build command produces output identical to the CI workflow | PARTIAL | Dockerfile has Node 22, lychee 0.23.0, git-lfs — but Docker Alternative sections in instruction files omit required 'npm ci' step; hardcoded x86_64 binary also fails on ARM hosts |

**Score:** 7/9 truths verified (2 partial)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.github/workflows/deploy.yml` | Build + deploy on push to main | VERIFIED | Contains all required steps: nschloe/action-cached-lfs-checkout, setup-node, npm ci, lychee cache, configure-pages, npm run build, upload-pages-artifact, deploy-pages |
| `.github/workflows/pr-check.yml` | Build-only on pull requests | VERIFIED | Contains pull_request trigger, same build steps as deploy.yml, no deploy steps |
| `lychee.toml` | Lychee link checker configuration | VERIFIED | Contains timeout=20, max_retries=3, cache=true, accept=["100..=103","200..=299","429"] |
| `Dockerfile` | Full dev/build environment | VERIFIED | Multi-stage: debian:bookworm-slim (lychee-builder) + node:22-bookworm-slim (runtime), git-lfs installed, lychee copied from builder stage, WORKDIR /workspace |
| `docker-compose.yml` | Convenience wrapper for Docker dev environment | VERIFIED | Contains build:., .:/workspace volume mount, named node_modules volume |
| `_instructions/ADDING_SPECIES.md` | Recipe for adding a new species | PARTIAL | Exists with species.csv schema (8 fields matching actual header), slug convention, npm run build step — but step 4 git add issue |
| `_instructions/ADDING_RECORDS.md` | Recipe for adding occurrence records | VERIFIED | Exists with records.csv schema (14 fields matching actual header), valid states WA/OR/ID/MT/BC, record types matching actual data |
| `_instructions/EDITING_DESCRIPTION.md` | Recipe for editing species descriptions | VERIFIED | Exists with content/species/ path, frontmatter format, slug-to-filename rules |
| `_instructions/ADDING_PHOTO.md` | Recipe for adding a photo with Git LFS | VERIFIED | Exists with images.csv schema (5 fields), git lfs install, git lfs status, .gitattributes patterns |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `.github/workflows/deploy.yml` | package.json build script | `npm run build` | VERIFIED | Line 47: `run: npm run build` |
| `Dockerfile` | lychee binary | `COPY --from=lychee-builder` | VERIFIED | Line 17: `COPY --from=lychee-builder /usr/local/bin/lychee /usr/local/bin/lychee` |
| `package.json` | lychee.toml | `build:validate-links` | VERIFIED | `"build:validate-links": "lychee --config lychee.toml --root-dir _site '_site/**/*.html'"` — no --offline flag |
| `_instructions/ADDING_SPECIES.md` | data/species.csv | CSV row addition | VERIFIED | References data/species.csv with exact schema |
| `_instructions/ADDING_PHOTO.md` | .gitattributes | Git LFS tracking | VERIFIED | References .gitattributes patterns (images/**/*.jpg, images/**/*.jpeg, images/**/*.png) |

### Data-Flow Trace (Level 4)

Not applicable — this phase produces CI configuration and documentation, not components that render dynamic data.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| deploy.yml has valid YAML structure | `python3 -c "import yaml; yaml.safe_load(open('/Users/rainhead/dev/pnwmoths/.github/workflows/deploy.yml'))"` | Valid | PASS |
| pr-check.yml has no deploy steps | `grep -c "deploy-pages\|upload-pages-artifact" .github/workflows/pr-check.yml` | 0 matches | PASS |
| lychee.toml has required settings | `grep -c "timeout\|max_retries\|cache" lychee.toml` | 3 matches | PASS |
| package.json build:validate-links has no --offline | `grep "offline" package.json` | No matches | PASS |
| .gitignore contains .lycheecache | `grep ".lycheecache" .gitignore` | Match found | PASS |
| All 4 instruction files exist | `ls _instructions/` | All 4 present | PASS |
| CSV schemas in instructions match actual headers | Manual comparison species.csv, records.csv, images.csv | All match | PASS |
| Commits claimed in SUMMARYs exist | `git log 7356522 3e580d2 3d897df` | All 3 found | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| MAINT-01 | 05-02-PLAN | Plain-English LLM instructions for four editing tasks | PARTIAL | All 4 files exist with correct schemas — ADDING_SPECIES.md step 4 has git add error for optional file |
| MAINT-02 | 05-01-PLAN | GitHub Actions builds and deploys on push to main | VERIFIED | deploy.yml complete with all required steps |
| MAINT-03 | 05-01-PLAN | Build under 5 minutes on GHA runner | HUMAN NEEDED | Caching strategy implemented (npm, LFS, lychee binary, lychee URL cache); actual timing requires human observation of live GHA run |
| MAINT-04 | 05-01-PLAN | Dockerfile defines build environment; local build identical to CI | PARTIAL | Dockerfile correct for x86_64 Linux; Docker Alternative sections in instruction files omit npm ci prerequisite; ARM hosts will get wrong lychee binary |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `.github/workflows/deploy.yml` | 34-37 | lychee binary downloaded via wget with no SHA-256 checksum | Warning | Supply-chain risk: a compromised release artifact could inject malicious code into CI; noted in 05-REVIEW.md as CR-01 — not fixed |
| `.github/workflows/pr-check.yml` | (entire file) | No `permissions:` block; inherits broader repository default | Warning | Token scope broader than necessary for a build-only job; noted in 05-REVIEW.md as WR-01 — not fixed |
| `Dockerfile` | 7 | lychee binary hardcoded to x86_64 URL | Warning | Silent failure when building on ARM hosts (Apple Silicon); noted in 05-REVIEW.md as IN-03 — not fixed |
| `_instructions/ADDING_SPECIES.md` | 46-49 | git add unconditionally includes optional .md file | Blocker | Causes 'pathspec did not match' error if maintainer correctly skips optional step 2; noted in 05-REVIEW.md as IN-01 — not fixed |
| All 4 instruction files | Docker Alternative | Missing npm ci prerequisite in Docker Alternative sections | Blocker | First-time Docker users will get build failure because node_modules volume is empty |
| `package.json` | 9 | `npx @11ty/eleventy` instead of local binary | Info | Implicit network dependency; noted in 05-REVIEW.md as WR-04 — not fixed |

### Human Verification Required

#### 1. Build completes in under 5 minutes on GitHub Actions

**Test:** Push a change to main and observe the Actions run duration in the GitHub Actions UI.
**Expected:** The full build pipeline (build:data, build:eleventy, build:copy-parquet, build:pagefind, build:validate-links with external URL checking, build:check-weight) completes in under 5 minutes. On cache-warm runs this is likely achievable; on first run (cold cache) the lychee external link check could be the bottleneck.
**Why human:** Cannot measure GHA runner timing programmatically. The external link check (lychee without --offline) adds variable network latency that is only observable in a real CI environment.

### Gaps Summary

Two gaps block full goal achievement:

**Gap 1 — ADDING_SPECIES.md step 4 git error (MAINT-01 partial):** A maintainer who follows the instructions exactly but correctly skips the optional step 2 (no description file) will encounter a git error when running the step 4 commit command. The fix is a one-line clarification in the instruction file. This is the most visible failure mode for success criterion 1.

**Gap 2 — Docker Alternative sections missing npm ci (MAINT-04 partial):** All four instruction files show `docker compose run --rm dev npm run build` as the Docker alternative but omit the prerequisite `docker compose run --rm dev npm ci`. The node_modules named volume starts empty on a fresh Docker setup. The PLAN correctly documents the two-step flow, but it was not propagated into the instruction files. A maintainer following the Docker Alternative would get `Error: Cannot find module '@11ty/eleventy'` or similar.

The code review findings (CR-01, CR-02, WR-01 through WR-05, IN-01 through IN-03) from `05-REVIEW.md` were logged but not acted on. CR-01/CR-02 (missing SHA-256 verification for lychee binary downloads) are security concerns. In-01 and the Docker Alternative gap are functional issues that would cause maintainer confusion.

---

_Verified: 2026-04-12_
_Verifier: Claude (gsd-verifier)_
