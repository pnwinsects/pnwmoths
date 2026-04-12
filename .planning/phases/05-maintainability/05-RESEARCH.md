# Phase 5: Maintainability - Research

**Researched:** 2026-04-12
**Domain:** GitHub Actions CI/CD, Docker build environments, Git LFS in CI, LLM-oriented documentation
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Deploy to GitHub Pages using the default `github.io` URL. No custom CNAME for now.
- **D-02:** GitHub Actions triggers: build + validate on PRs (no deploy); build + deploy on push to main.
- **D-03:** Git LFS must be explicitly enabled in CI — `git lfs install` + `git lfs pull` in the workflow before any build steps.
- **D-04:** Primary audience for `_instructions/` files is an LLM acting as an editing assistant. Format: structured, terse, step-by-step, machine-actionable.
- **D-05:** Instructions include file editing + build commands — maintainers verify locally using Docker or `npm run build` before pushing.
- **D-06:** Separate files in `_instructions/`: `ADDING_SPECIES.md`, `ADDING_RECORDS.md`, `EDITING_DESCRIPTION.md`, `ADDING_PHOTO.md`.
- **D-07:** `ADDING_PHOTO.md` must include explicit Git LFS steps (images tracked via LFS per `.gitattributes`).
- **D-08:** Docker container scope is a full dev environment — editing, building, and testing.
- **D-09:** "Identical output" means functionally identical (same pages, same links, same data). Byte-for-byte reproducibility not required.
- **D-10:** Dockerfile pins to Node.js 22 (`FROM node:22-bookworm-slim`). Must also include lychee (Rust binary), pagefind (via npm), and Git LFS.
- **D-11:** Cache aggressively then measure: cache `node_modules`, DuckDB binary, lychee, and pagefind binaries between runs. Do not prematurely parallelize.
- **D-12:** Lychee validates internal + external links. External URL checking is enabled (not `--offline` only). Accept that external checks may be occasionally flaky.

### Claude's Discretion

- Exact GitHub Actions YAML structure and step ordering.
- How Docker mounts the repo (volume mount vs COPY) for the dev environment use case.
- Whether a `Makefile` or `docker-compose.yml` wrapper is helpful.
- Lychee configuration details (timeout, retry count for external URLs).
- Whether to add a `build:docker` npm script or document the `docker run` command in instructions.

### Deferred Ideas (OUT OF SCOPE)

None surfaced during discussion.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MAINT-01 | `_instructions/` directory with plain-English LLM instructions for: adding a species, adding records, editing a description, adding a photo | Instruction file format and content patterns documented in Architecture Patterns section |
| MAINT-02 | GitHub Actions workflow builds and deploys the site on push to main | Full workflow pattern documented; official actions identified |
| MAINT-03 | Build runs in under 5 minutes on standard GitHub Actions runner | Caching strategy documented; bottlenecks identified |
| MAINT-04 | Dockerfile defines complete build and maintenance environment; local build is functionally identical to CI | Dockerfile pattern documented; lychee binary install method resolved |
</phase_requirements>

---

## Summary

Phase 5 delivers two concrete artifacts: a set of LLM-readable instruction files and a CI/CD pipeline. Both are well-understood engineering tasks with clear, established patterns on the GitHub Actions + GitHub Pages stack.

The GitHub Actions side is straightforward: the modern official approach uses `actions/configure-pages`, `actions/upload-pages-artifact`, and `actions/deploy-pages` — no third-party deploy action needed. The critical complication is Git LFS: every CI run that naively uses `actions/checkout lfs: true` consumes LFS bandwidth quota (GitHub free tier: 1 GB/month). For this project's small image set the risk is manageable, but the workflow should cache LFS objects to avoid runaway quota consumption. A verified third-party action (`nschloe/action-cached-lfs-checkout`) handles this transparently.

The Dockerfile is straightforward except for one non-obvious dependency: lychee (the link checker) is a Rust binary not available in Debian apt. The official lychee CI Dockerfile demonstrates the correct pattern: download the pre-built `lychee-x86_64-unknown-linux-gnu.tar.gz` from GitHub Releases in a builder stage and copy the binary to the final image. The `build:validate-links` npm script currently runs lychee with `--offline`; that flag must be removed in Phase 5 to enable external URL checking per D-12.

The `_instructions/` files are documentation, not code. Their structure should mirror how an LLM reads context: schema first, then exact file paths, then numbered commands, then expected output. No prose tutorials.

**Primary recommendation:** Use the official GitHub Pages deployment action trio (configure-pages / upload-pages-artifact / deploy-pages), cache LFS objects via `nschloe/action-cached-lfs-checkout`, and install lychee in the Dockerfile via pre-built GitHub Release binary.

---

## Standard Stack

### Core

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| `actions/checkout` | v4 | Repo checkout in CI | Official GitHub action |
| `actions/setup-node` | v4 | Node.js setup + npm cache | Official; has built-in `cache: 'npm'` input |
| `actions/configure-pages` | v5 | GitHub Pages setup, base URL injection | Official GitHub Pages deploy stack |
| `actions/upload-pages-artifact` | v3 | Package `_site/` as Pages artifact | Required by deploy-pages |
| `actions/deploy-pages` | v4 | Deploy artifact to GitHub Pages | Official; replaces peaceiris/actions-gh-pages |
| `node:22-bookworm-slim` | Node 22 LTS | Docker base image | Matches `.nvmrc` (Node 22); bookworm-slim is minimal Debian |

### Supporting

| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| `nschloe/action-cached-lfs-checkout` | latest | Checkout + LFS with caching | Drop-in for actions/checkout when LFS bandwidth is a concern |
| `actions/cache` | v4 | Cache arbitrary directories | Used for lychee binary between runs |
| lychee binary | 0.23.0 (current) | External link checking | Installed from GitHub Releases in Dockerfile; in CI via apt or cache |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Official deploy-pages | peaceiris/actions-gh-pages | peaceiris is community-maintained; official stack needs no third-party trust |
| Cached LFS checkout | `actions/checkout lfs: true` | Simpler YAML but burns LFS bandwidth every run — risky on free tier |
| Downloading lychee in Dockerfile | Building lychee from source | From-source build adds ~5 minutes to `docker build`; binary download takes seconds |

**Installation (CI):**
```bash
# No npm install needed — tools come from GitHub Actions marketplace and Docker
```

**Version verification (lychee):**
```bash
lychee --version
# lychee 0.23.0  [VERIFIED: local install]
```

---

## Architecture Patterns

### Recommended Project Structure

```
.github/
└── workflows/
    ├── deploy.yml          # push to main: build + deploy to Pages
    └── pr-check.yml        # pull_request: build + validate only (no deploy)
_instructions/
├── ADDING_SPECIES.md
├── ADDING_RECORDS.md
├── EDITING_DESCRIPTION.md
└── ADDING_PHOTO.md
Dockerfile                  # full dev environment: Node 22 + lychee + git-lfs
docker-compose.yml          # (optional) convenience wrapper for volume-mount dev use
lychee.toml                 # lychee config: timeout, retries, exclude patterns
```

### Pattern 1: GitHub Pages Deployment Workflow

**What:** Two-job workflow — `build` produces a Pages artifact; `deploy` consumes it.
**When to use:** Required by GitHub Pages "custom workflow" mode.

Minimum `permissions` needed on the deployment job:
```yaml
permissions:
  contents: read
  pages: write
  id-token: write
```

The environment block is required for the deployment URL output:
```yaml
environment:
  name: github-pages
  url: ${{ steps.deployment.outputs.page_url }}
```

Full deploy workflow skeleton:
```yaml
# Source: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: nschloe/action-cached-lfs-checkout@v1
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - uses: actions/configure-pages@v5
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: _site

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/deploy-pages@v4
        id: deployment
```

### Pattern 2: PR Check Workflow (No Deploy)

**What:** Build + validate only on pull requests. No `actions/upload-pages-artifact` — artifact upload is not needed.
**When to use:** Catches broken builds before merge without consuming Pages quota.

```yaml
name: PR Check
on:
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: nschloe/action-cached-lfs-checkout@v1
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
```

### Pattern 3: Lychee Config File

**What:** `lychee.toml` at project root controls timeout and retry behavior for external checks.
**When to use:** External URL checks can be slow or flaky; config file prevents command-line flag sprawl.

```toml
# lychee.toml
# Source: https://lychee.cli.rs/guides/config/
timeout = 30          # seconds per request (default: 20)
max_retries = 3       # per URL (default: 3)
cache = true          # disk cache at .lycheecache — reuse between runs
accept = ["100..=103", "200..=299", "429"]  # 429 = rate limit, treat as OK

# Exclude internal-only anchors or known-flaky external hosts
exclude = [
  # add patterns as needed, e.g.:
  # "^https://example\\.com"
]
```

The `build:validate-links` npm script must be updated to remove `--offline` and point at the config file:
```json
"build:validate-links": "lychee --config lychee.toml --root-dir _site '_site/**/*.html'"
```

### Pattern 4: Dockerfile (Full Dev Environment)

**What:** Multi-stage Dockerfile. Stage 1 downloads the lychee binary. Stage 2 is the runtime image from `node:22-bookworm-slim`.
**When to use:** Enables maintainers without local Node.js/lychee to run `docker build` + `docker run` to reproduce the CI environment.

```dockerfile
# Stage 1: download lychee binary
FROM debian:bookworm-slim AS lychee-builder
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates wget \
    && rm -rf /var/lib/apt/lists/*
ARG LYCHEE_VERSION=0.23.0
RUN wget -qO /tmp/lychee.tar.gz \
    "https://github.com/lycheeverse/lychee/releases/download/lychee-v${LYCHEE_VERSION}/lychee-x86_64-unknown-linux-gnu.tar.gz" \
    && tar -xzf /tmp/lychee.tar.gz -C /usr/local/bin \
    && chmod +x /usr/local/bin/lychee

# Stage 2: runtime image
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    git git-lfs ca-certificates \
    && git lfs install \
    && rm -rf /var/lib/apt/lists/*
COPY --from=lychee-builder /usr/local/bin/lychee /usr/local/bin/lychee
WORKDIR /workspace
# For CI: COPY . . && RUN npm ci && RUN npm run build
# For dev: volume-mount the repo: docker run -v $(pwd):/workspace ...
```

Key notes:
- `git-lfs` is available via apt on bookworm — no manual binary download needed [VERIFIED: Dockerfile-CI.Dockerfile from lycheeverse/lychee repo]
- `@duckdb/node-api` ships pre-built native binaries for `linux/amd64` via npm — `npm ci` inside the container handles this automatically [ASSUMED: DuckDB npm package behavior on bookworm-slim]
- `pagefind` is in `devDependencies` and resolves its own binary via npm — no separate install needed [VERIFIED: package.json]

### Pattern 5: LLM Instruction File Format

**What:** Each `_instructions/*.md` file is a self-contained recipe for a single task. Target reader is an LLM serving as editing assistant.
**When to use:** All four instruction files follow this structure.

Recommended structure per file:
```markdown
# Task: [Action] — [Subject]

## What This Changes
- File A: [what changes]
- File B: [what changes]

## Required Fields / Schema
| Field | Type | Example |
|-------|------|---------|

## Steps
1. Open `[file]`. Add a row:
   ```csv
   [example row]
   ```
2. [Next step with exact command or file edit]
3. Run `npm run build` (or `docker run ...`) to verify.
4. If build passes, commit and push.

## Verify
- Expected: [what should be true after success]
- Failure modes: [common errors and how to resolve]
```

For `ADDING_PHOTO.md` specifically, Git LFS steps belong between the "edit images.csv" step and the commit step:
```markdown
## Git LFS Steps (required for images)
1. Ensure Git LFS is installed: `git lfs install`
2. Copy image to `images/{slug}/` — LFS tracking is automatic via `.gitattributes`
3. Verify: `git lfs status` should show the image as an LFS object
4. `git add images/{slug}/{filename}` — this stages the LFS pointer, not the raw binary
```

### Anti-Patterns to Avoid

- **Storing `_site/` in git:** The built site is a CI artifact, not a source file. GitHub Pages deploys from the artifact produced by `upload-pages-artifact`.
- **Using `lfs: true` on `actions/checkout` without caching:** Every run pulls all LFS objects fresh, consuming bandwidth quota on every commit.
- **Removing `--offline` from lychee without a timeout:** External URL checks with default 20s timeout and many external links can stall builds past the 5-minute target. Use `lychee.toml` to cap timeout.
- **COPY-only Docker for dev use:** If Docker is meant for editing + building, volume-mounting the repo (`-v $(pwd):/workspace`) avoids rebuild-on-every-change friction.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| GitHub Pages deployment | Custom git-push-to-gh-pages scripts | `actions/deploy-pages@v4` | Official action handles artifact signing, environment protection, deployment URLs |
| LFS bandwidth caching | Manual LFS cache steps | `nschloe/action-cached-lfs-checkout` | Cache key tied to LFS object hashes; handles invalidation correctly |
| npm dependency caching | Manual `~/.npm` cache steps | `actions/setup-node cache: 'npm'` input | Built-in; handles key generation from `package-lock.json` hash automatically |

**Key insight:** GitHub Pages deployment is a protected environment requiring id-token OIDC auth; the official action handles this; rolling it manually is fragile.

---

## Common Pitfalls

### Pitfall 1: lychee External Checks Cause Build Timeout

**What goes wrong:** External URL checking is enabled (D-12). With hundreds of HTML pages each containing external links, a 20-second default timeout and slow/flaky domains can push build time past 5 minutes.
**Why it happens:** lychee checks all external URLs sequentially by default per domain; rate-limited or slow domains block the queue.
**How to avoid:** Set `timeout = 15` or `timeout = 20` in `lychee.toml`. Set `accept = [..., "429"]` so rate-limit responses don't count as errors. Enable `cache = true` so repeat CI runs reuse previous results.
**Warning signs:** Build hangs at `build:validate-links` step. Use `--verbose` flag to see which URLs are slow.

### Pitfall 2: LFS Bandwidth Quota Exhaustion

**What goes wrong:** GitHub free tier provides 1 GB/month LFS bandwidth. `actions/checkout lfs: true` re-downloads all LFS objects on every CI run.
**Why it happens:** No caching by default for LFS objects in `actions/checkout`.
**How to avoid:** Use `nschloe/action-cached-lfs-checkout` which caches LFS objects in Actions cache, keyed by `.gitattributes` hash. Only downloads on changes.
**Warning signs:** GitHub emails about LFS bandwidth overage; subsequent checkouts silently serve LFS pointers without resolving them.

### Pitfall 3: GitHub Pages Source Not Set to "GitHub Actions"

**What goes wrong:** GitHub Pages defaults to deploy from a branch (`gh-pages` or `main`). The `actions/deploy-pages` action requires Pages source to be set to "GitHub Actions" in repository settings.
**Why it happens:** Repository settings default is not "GitHub Actions"; must be changed once manually.
**How to avoid:** Document in instructions: "Before first deploy, go to Settings → Pages → Source → GitHub Actions."
**Warning signs:** Workflow succeeds but site is not updated, or deployment step returns permissions error.

### Pitfall 4: DuckDB Native Binary Architecture Mismatch

**What goes wrong:** `@duckdb/node-api` ships architecture-specific native binaries. If the Docker image is built for `linux/arm64` on an M-series Mac and then run on `linux/amd64` in CI, the native module fails to load.
**Why it happens:** `npm ci` inside `docker build` uses the host architecture by default.
**How to avoid:** Dockerfile should either explicitly target `--platform linux/amd64` or the CI build should match the local build platform. For most maintainers, building for `linux/amd64` and volume-mounting is sufficient.
**Warning signs:** `Error: Cannot find module '...duckdb...'` or SIGILL crash inside Docker on M-series Mac.

### Pitfall 5: `_site/` Contains LFS Pointer Files Instead of Images

**What goes wrong:** Images appear in `_site/images/` as plain text LFS pointer files (`.version https://git-lfs.github.com/spec/v1...`) instead of actual image binaries.
**Why it happens:** Eleventy copies `images/` passthrough, but if Git LFS was not pulled before build, the files on disk are pointers.
**How to avoid:** The CI workflow must run `git lfs pull` (or use `action-cached-lfs-checkout`) before `npm run build`.
**Warning signs:** Images show as broken on deployed site; `file _site/images/{slug}/*.jpg` reports "ASCII text" instead of "JPEG image data".

---

## Code Examples

### actions/setup-node with built-in npm cache

```yaml
# Source: https://github.com/actions/setup-node
- uses: actions/setup-node@v4
  with:
    node-version: '22'
    cache: 'npm'
# This caches ~/.npm keyed on package-lock.json hash.
# No separate actions/cache step needed for npm.
```

### Caching lychee binary between CI runs

```yaml
# Cache lychee binary to avoid re-downloading on every run
- name: Cache lychee binary
  uses: actions/cache@v4
  with:
    path: ~/.local/bin/lychee
    key: lychee-0.23.0-linux-amd64
- name: Install lychee if not cached
  run: |
    if [ ! -f ~/.local/bin/lychee ]; then
      mkdir -p ~/.local/bin
      wget -qO /tmp/lychee.tar.gz \
        https://github.com/lycheeverse/lychee/releases/download/lychee-v0.23.0/lychee-x86_64-unknown-linux-gnu.tar.gz
      tar -xzf /tmp/lychee.tar.gz -C ~/.local/bin
      chmod +x ~/.local/bin/lychee
    fi
    echo "$HOME/.local/bin" >> $GITHUB_PATH
```

### Enabling Git LFS Pages repository setting (documentation note)

GitHub Pages source must be set to "GitHub Actions" in:
`Settings → Pages → Build and deployment → Source → GitHub Actions`

This is a one-time manual step; no YAML can automate it. [CITED: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site]

---

## Runtime State Inventory

Step 2.5 SKIPPED — this phase is not a rename/refactor/migration phase. No stored data or OS-registered state is being renamed.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js 22 | npm run build locally | ✓ | v22.20.0 | — |
| npm | npm ci | ✓ | 10.9.3 | — |
| lychee | build:validate-links | ✓ | 0.23.0 | Install from GitHub Releases |
| Docker | MAINT-04 Dockerfile | ✓ | 29.3.1 | — |
| git-lfs | Image management | [ASSUMED: installed locally] | — | `brew install git-lfs` |
| GitHub Actions runner | MAINT-02, MAINT-03 | ✓ (cloud) | ubuntu-latest | — |

**Missing dependencies with no fallback:** None identified.

**Missing dependencies with fallback:** git-lfs local install not verified (irrelevant for CI; relevant only for `ADDING_PHOTO.md` instructions to maintainers).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner (`node --test`) |
| Config file | none — invoked directly in `package.json test` script |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MAINT-01 | `_instructions/ADDING_SPECIES.md` exists and is complete | manual | N/A — verified by reviewing file content | ❌ Wave 0 (manual review) |
| MAINT-02 | GitHub Actions workflow triggers and deploys on push to main | smoke/integration | Manual: push a commit, observe GitHub Actions UI | ❌ Wave 0 (manual trigger) |
| MAINT-03 | Build completes in < 5 minutes on GitHub Actions runner | integration | Observed in GitHub Actions run logs | ❌ Wave 0 (measure after first CI run) |
| MAINT-04 | `docker build` + `docker run npm run build` produces functionally identical output | smoke | `docker build -t pnwmoths . && docker run --rm -v $(pwd):/workspace pnwmoths npm run build` | ❌ Wave 0 (requires Dockerfile to exist) |

### Sampling Rate

- **Per task commit:** `npm test` (existing unit tests only)
- **Per wave merge:** `npm test` + manual spot-check of CI run logs
- **Phase gate:** All 4 MAINT success criteria verified before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `Dockerfile` — does not yet exist; required for MAINT-04
- [ ] `.github/workflows/deploy.yml` — does not yet exist; required for MAINT-02
- [ ] `.github/workflows/pr-check.yml` — does not yet exist; required for MAINT-02
- [ ] `lychee.toml` — does not yet exist; required for external link checking (D-12)
- [ ] `_instructions/ADDING_SPECIES.md` — does not yet exist; required for MAINT-01
- [ ] `_instructions/ADDING_RECORDS.md` — does not yet exist; required for MAINT-01
- [ ] `_instructions/EDITING_DESCRIPTION.md` — does not yet exist; required for MAINT-01
- [ ] `_instructions/ADDING_PHOTO.md` — does not yet exist; required for MAINT-01

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | GitHub handles repo auth |
| V3 Session Management | no | No sessions in static site |
| V4 Access Control | yes (partial) | GitHub branch protection on `main`; Pages deploy requires `id-token: write` OIDC |
| V5 Input Validation | no | No user inputs in CI/CD or documentation |
| V6 Cryptography | no | No secrets or encryption in this phase |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Supply chain: third-party Actions | Tampering | Pin all third-party actions to a commit SHA rather than a floating tag in production; acceptable to use version tags for PoC |
| Workflow secret exposure | Information Disclosure | No secrets in this phase; GitHub OIDC token for Pages deploy is short-lived and scoped |
| LFS pointer files deployed to Pages | Tampering/Spoofing | `git lfs pull` before build (D-03); Pitfall 5 documented above |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `peaceiris/actions-gh-pages` push to `gh-pages` branch | `actions/deploy-pages` + artifact upload | 2023 (GitHub official) | No branch pollution; OIDC-secured; no PAT needed |
| `actions/checkout lfs: true` (naively) | Cached LFS checkout | Ongoing community pattern | Saves LFS bandwidth quota on free tier |
| lychee `--offline` only | lychee with external checks + `lychee.toml` | Phase 5 (this phase) | Catches real broken external links; adds build time |

**Deprecated/outdated:**
- `peaceiris/actions-gh-pages`: Not deprecated, but the official `actions/deploy-pages` trio is now the GitHub-recommended path and requires no personal access token.
- `--offline` flag on `build:validate-links`: Currently used to avoid CI flakiness (Phase 4 decision); Phase 5 removes it per D-12.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `@duckdb/node-api` pre-built binaries install correctly via `npm ci` inside `node:22-bookworm-slim` | Architecture Patterns (Dockerfile) | Docker build fails; would need to pin a specific duckdb binary or add a build step |
| A2 | git-lfs is available via `apt-get install git-lfs` on bookworm | Architecture Patterns (Dockerfile) | Would need to install from GitHub Releases in the Dockerfile builder stage |
| A3 | The current data set (2 image directories, ~12KB images) will not exhaust LFS bandwidth quota in initial CI runs | Common Pitfalls | Quota exhaustion is still possible at scale; cached checkout is still recommended |

---

## Open Questions

1. **Should `docker-compose.yml` be created?**
   - What we know: D-08 says Docker is for editing + building; volume-mount pattern suits dev use
   - What's unclear: Whether maintainers will use Docker interactively or only for build verification
   - Recommendation: Create a minimal `docker-compose.yml` with a volume-mount service; it's trivial overhead and substantially improves maintainer UX

2. **Should a `build:docker` npm script be added?**
   - What we know: Claude's Discretion area; either document the `docker run` command in `_instructions/` or add a convenience script
   - What's unclear: Whether maintainers will look in `package.json` or `_instructions/`
   - Recommendation: Document the `docker run` command directly in `_instructions/` files; avoids dual-maintenance

3. **How should lychee cache (`~/.lycheecache`) be handled in CI?**
   - What we know: lychee supports disk caching; this would avoid re-checking external URLs that haven't changed
   - What's unclear: Cache invalidation strategy for external URLs that go stale
   - Recommendation: Enable `cache = true` in `lychee.toml` and add `.lycheecache` to a `actions/cache` step with a weekly TTL key; add `.lycheecache` to `.gitignore`

---

## Sources

### Primary (HIGH confidence)

- GitHub Actions official docs — `actions/configure-pages`, `actions/upload-pages-artifact`, `actions/deploy-pages` patterns [CITED: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages]
- lychee configuration docs [CITED: https://lychee.cli.rs/guides/config/]
- lychee official Dockerfile — lychee install via GitHub Releases binary, git-lfs via apt [CITED: https://github.com/lycheeverse/lychee/blob/master/Dockerfile-CI.Dockerfile]
- Node.js Docker official image for bookworm-slim base [CITED: https://github.com/nodejs/docker-node/blob/main/22/bookworm-slim/Dockerfile]
- `actions/setup-node` built-in npm cache [CITED: https://github.com/actions/setup-node]
- Project `package.json`, `.nvmrc`, `.gitattributes`, `eleventy.config.js` [VERIFIED: local codebase]
- lychee version 0.23.0 [VERIFIED: `lychee --version` on local machine]
- Docker version 29.3.1 [VERIFIED: `docker --version` on local machine]

### Secondary (MEDIUM confidence)

- `nschloe/action-cached-lfs-checkout` for LFS bandwidth management [CITED: https://github.com/nschloe/action-cached-lfs-checkout, verified via GitHub community discussion]
- GitHub LFS bandwidth limits (1 GB/month free tier) [CITED: https://github.com/orgs/community/discussions/26775]

### Tertiary (LOW confidence)

- Typical GitHub Actions build time for Eleventy 700-page site — no authoritative benchmark found; 5-minute target from MAINT-03 is a project constraint, not a measured baseline [ASSUMED]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all actions verified via official docs; lychee version verified locally
- Architecture: HIGH — patterns derived from official GitHub docs and verified lychee Dockerfile
- Pitfalls: MEDIUM — LFS bandwidth and Docker arch issues are known-documented community problems; build time estimate is LOW (no benchmark data)

**Research date:** 2026-04-12
**Valid until:** 2026-07-12 (90 days — GitHub Actions actions are stable; lychee 0.23.0 is current as of research date)
