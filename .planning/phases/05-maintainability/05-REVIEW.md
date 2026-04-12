---
phase: 05-maintainability
reviewed: 2026-04-12T00:00:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - .github/workflows/deploy.yml
  - .github/workflows/pr-check.yml
  - lychee.toml
  - Dockerfile
  - docker-compose.yml
  - package.json
  - .gitignore
  - _instructions/ADDING_SPECIES.md
  - _instructions/ADDING_RECORDS.md
  - _instructions/EDITING_DESCRIPTION.md
  - _instructions/ADDING_PHOTO.md
findings:
  critical: 2
  warning: 5
  info: 3
  total: 10
status: issues_found
---

# Phase 05: Code Review Report

**Reviewed:** 2026-04-12
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

This phase covers CI/CD workflows, the Docker dev environment, package manifest, and contributor instruction documents. The workflows are functional and the instructions are clear. The main concerns are two supply-chain security issues (unverified binary downloads in CI and Docker), five maintainability warnings (duplicated workflow blocks, hardcoded version strings, a pre-release dependency, and a missing permissions declaration), and three minor instruction accuracy issues.

## Critical Issues

### CR-01: Lychee binary downloaded without checksum verification (CI)

**File:** `.github/workflows/deploy.yml:34-37`, `.github/workflows/pr-check.yml:25-28`

**Issue:** The lychee binary is fetched from GitHub Releases via `wget` and extracted directly with no integrity check. A compromised release artifact or a MITM attack would silently inject a malicious binary into the build environment that has full access to the repository secrets and the GitHub Pages deployment token.

**Fix:** Pin the download to a known SHA-256 and verify before extracting:
```yaml
- name: Install lychee if not cached
  run: |
    if [ ! -f ~/.local/bin/lychee ]; then
      mkdir -p ~/.local/bin
      wget -qO /tmp/lychee.tar.gz \
        https://github.com/lycheeverse/lychee/releases/download/lychee-v0.23.0/lychee-x86_64-unknown-linux-gnu.tar.gz
      echo "EXPECTED_SHA256  /tmp/lychee.tar.gz" | sha256sum -c -
      tar -xzf /tmp/lychee.tar.gz -C ~/.local/bin
      chmod +x ~/.local/bin/lychee
    fi
    echo "$HOME/.local/bin" >> $GITHUB_PATH
```
Replace `EXPECTED_SHA256` with the value from the official release checksums file. Alternatively, use the `lycheeverse/lychee-action` GitHub Action which handles this automatically.

### CR-02: Lychee binary downloaded without checksum verification (Dockerfile)

**File:** `Dockerfile:6-9`

**Issue:** Same problem as CR-01 but in the Docker build stage. The `wget` download has no integrity check. Any image built from this Dockerfile (including local developer builds) silently trusts the downloaded binary.

**Fix:** Add a `RUN` layer that verifies the SHA-256 before extraction:
```dockerfile
RUN wget -qO /tmp/lychee.tar.gz \
    "https://github.com/lycheeverse/lychee/releases/download/lychee-v${LYCHEE_VERSION}/lychee-x86_64-unknown-linux-gnu.tar.gz" \
    && echo "EXPECTED_SHA256  /tmp/lychee.tar.gz" | sha256sum -c - \
    && tar -xzf /tmp/lychee.tar.gz -C /usr/local/bin \
    && chmod +x /usr/local/bin/lychee
```

## Warnings

### WR-01: `pr-check.yml` missing `permissions` declaration

**File:** `.github/workflows/pr-check.yml:1-37`

**Issue:** `deploy.yml` explicitly declares minimal permissions (`contents: read`, `pages: write`, `id-token: write`). `pr-check.yml` has no `permissions:` block at all, so it inherits the repository default — which is typically `contents: write` for public repositories or whatever the org default is. For a build-only workflow that needs only `contents: read`, this grants broader token scope than necessary.

**Fix:** Add a minimal permissions block after the `on:` section:
```yaml
permissions:
  contents: read
```

### WR-02: Lychee install block duplicated verbatim across two workflows

**File:** `.github/workflows/deploy.yml:25-39`, `.github/workflows/pr-check.yml:16-30`

**Issue:** The 12-line lychee install block (cache + conditional install + PATH update) is copy-pasted identically into both workflows. When the version is bumped or the install logic changes, both files must be updated in sync — a drift-prone pattern that has already required writing the same code twice.

**Fix:** Extract the lychee install into a reusable composite action at `.github/actions/install-lychee/action.yml`, then call it from both workflows:
```yaml
- uses: ./.github/actions/install-lychee
  with:
    version: '0.23.0'
```
This makes version bumps a single-location change and prevents future drift.

### WR-03: Lychee version hardcoded in three separate places

**File:** `.github/workflows/deploy.yml:29,35`, `.github/workflows/pr-check.yml:20,26`, `Dockerfile:5`

**Issue:** The version string `0.23.0` appears in five locations across three files (two cache keys and two download URLs in workflows, one `ARG` in Dockerfile). The Dockerfile already uses `ARG LYCHEE_VERSION=0.23.0` correctly for the download URL but the cache key in the workflow (`lychee-0.23.0-linux-amd64`) is a plain string — if you bump `LYCHEE_VERSION` in the Dockerfile, the workflow cache keys must be manually updated too.

**Fix:** As part of the composite action (WR-02), accept `version` as an input and derive both the cache key and the download URL from it. This makes the version a single declaration.

### WR-04: `build:eleventy` uses `npx` instead of the local binary

**File:** `package.json:9`

**Issue:** `"build:eleventy": "npx @11ty/eleventy"` runs `npx`, which will attempt to resolve the package from the network if it is not locally installed. All other `build:*` scripts use `node scripts/...` or direct binaries. The `eleventy` binary is available as `./node_modules/.bin/eleventy` after `npm ci`.

**Fix:**
```json
"build:eleventy": "eleventy"
```
npm scripts automatically add `node_modules/.bin` to PATH, so bare `eleventy` resolves correctly after `npm ci`. This removes the implicit network dependency and makes the script consistent with the others.

### WR-05: `@duckdb/node-api` pinned to a pre-release version

**File:** `package.json:22`

**Issue:** `"@duckdb/node-api": "^1.5.1-r.2"` uses a pre-release suffix (`-r.2`). npm's semver range `^` does NOT automatically upgrade from a pre-release to a stable release of the same major version — it will only pick up `1.5.1-r.3`, `1.5.1-r.4`, etc., not `1.5.2` or `1.6.0` stable releases. If `1.5.1` stable ships, this dependency will remain pinned to the pre-release.

**Fix:** Once a stable release is available, update to the stable version:
```json
"@duckdb/node-api": "^1.5.1"
```
Track the [duckdb/node-neo releases](https://github.com/duckdb/node-neo/releases) for when the stable version ships.

## Info

### IN-01: `ADDING_SPECIES.md` step 4 unconditionally stages the optional description file

**File:** `_instructions/ADDING_SPECIES.md:46-49`

**Issue:** Step 2 clearly marks the description file as optional, but the `git add` command in step 4 includes `content/species/xestia-dolosa.md` unconditionally. If a contributor skips step 2 (as they are permitted to), running the commit command as written will produce a `pathspec did not match` error from git.

**Fix:** Add a note that the `.md` path should be included only when the file was created:
```markdown
4. If build passes, commit and push:
   ```bash
   git add data/species.csv
   # Include the next line only if you created a description file in step 2:
   git add content/species/xestia-dolosa.md
   git commit -m "Add species: Xestia dolosa"
   git push
   ```
```

### IN-02: `ADDING_PHOTO.md` stages the image file twice

**File:** `_instructions/ADDING_PHOTO.md:32-34,42-43`

**Issue:** Step 4 says "Stage the image: `git add images/{slug}/{filename}`", and then step 6's commit command includes `git add data/images.csv images/{slug}/{filename}`. The image file ends up in `git add` twice. This is harmless but could confuse contributors who follow the steps literally.

**Fix:** Step 6 should only add the CSV (since the image was already staged in step 4):
```bash
git add data/images.csv
git commit -m "Add photo for [species name]"
git push
```

### IN-03: Dockerfile lychee stage downloads x86_64 binary unconditionally

**File:** `Dockerfile:7`

**Issue:** The URL hardcodes `lychee-x86_64-unknown-linux-gnu.tar.gz`. The Docker image will fail to produce a working lychee binary when built on an arm64 host (Apple Silicon Mac with Docker Desktop in native ARM mode). This is not a bug in the common CI case (GitHub-hosted runners are x86_64) but will silently fail or produce the wrong binary if local ARM builds are attempted.

**Fix:** Use a `TARGETARCH` build arg to select the correct binary:
```dockerfile
ARG TARGETARCH
RUN ARCH=$([ "$TARGETARCH" = "arm64" ] && echo "aarch64" || echo "x86_64") && \
    wget -qO /tmp/lychee.tar.gz \
    "https://github.com/lycheeverse/lychee/releases/download/lychee-v${LYCHEE_VERSION}/lychee-${ARCH}-unknown-linux-gnu.tar.gz" \
    ...
```

---

_Reviewed: 2026-04-12_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
