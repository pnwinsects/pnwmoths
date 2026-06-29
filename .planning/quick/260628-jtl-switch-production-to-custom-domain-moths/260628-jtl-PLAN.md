---
phase: quick-260628-jtl
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - eleventy.config.ts
  - eleventy.config.test.ts
  - src/components/key-results-grid.ts
  - src/components/key-results-grid.test.ts
  - src/components/pnwm-identify.ts
  - src/components/pnwm-identify.test.ts
  - src/components/pnwm-taxon-browser.ts
  - src/components/pnwm-image-slideshow.test.ts
  - scripts/upload-images.ts
  - scripts/upload-tiles.ts
  - scripts/upload-tiles.test.ts
  - scripts/migrate-legacy-photos.ts
  - scripts/migrate-legacy-photos.test.ts
  - scripts/build-key.ts
  - .github/scripts/check-cdn-urls.py
  - _instructions/ADDING_PLATE.md
  - _instructions/UPLOADING_TILES.md
  - _instructions/UPLOADING_IMAGES.md
  - scripts/upload-site.ts
  - scripts/upload-site.test.ts
  - package.json
  - .github/workflows/production.yml
  - .github/workflows/staging.yml
  - README.md
  - CONTRIBUTING.md
autonomous: true
requirements: [QUICK-260628-jtl]

user_setup:
  - service: github-actions
    why: "Production deploy uploads the built site to the Bunny Storage Zone; CI needs the zone password as a repo secret. The user must add this — Claude cannot set GitHub secrets."
    env_vars:
      - name: BUNNY_STORAGE_PASSWORD
        source: "bunny.net dashboard → Storage → pnwmoths zone → FTP & API Access → Password. Add at GitHub repo → Settings → Secrets and variables → Actions → New repository secret. Same value as the local BUNNY_API_KEY used by the image uploaders."

must_haves:
  truths:
    - "Pushing to main builds the site at root \"/\" (GITHUB_PAGES unset) and uploads it additively to the Bunny Storage Zone — no file deletions, no mirror, no purge."
    - "The site and every image reference resolve under https://moths.pnwinsects.org/."
    - "GitHub Pages staging deploys only on manual workflow_dispatch, building under /pnwmoths/ (GITHUB_PAGES=true)."
    - "The pathPrefix conditional process.env.GITHUB_PAGES ? \"/pnwmoths/\" : \"/\" remains intact and its eleventy.config.test.ts assertion still passes."
    - "No source, test, script, doc, or CI check references the old host pnwmoths.b-cdn.net."
    - "scripts/upload-site.ts contains no DELETE / mirror logic (additive-only invariant locked by a source-introspection test)."
    - "No CNAME file exists in the repo."
  artifacts:
    - path: "scripts/upload-site.ts"
      provides: "Additive (per-file PUT, no delete) Bunny Storage uploader for the built _site, reusing upload-images.ts auth/HTTP pattern"
      exports: ["siteObjectStorageUrl", "contentTypeFor", "listSiteFiles"]
    - path: "scripts/upload-site.test.ts"
      provides: "Unit tests for the uploader's pure helpers + the additive-only (no DELETE) source invariant"
    - path: ".github/workflows/production.yml"
      provides: "Push-to-main → build (no GITHUB_PAGES) → upload _site to Bunny; no Pages steps, no purge"
      contains: "site:upload"
    - path: ".github/workflows/staging.yml"
      provides: "workflow_dispatch → build with GITHUB_PAGES=true → deploy to GitHub Pages"
      contains: "workflow_dispatch"
    - path: "eleventy.config.ts"
      provides: "CDN_BASE_URL = custom domain; pathPrefix conditional intact"
      contains: "https://moths.pnwinsects.org"
  key_links:
    - from: ".github/workflows/production.yml"
      to: "scripts/upload-site.ts"
      via: "npm run site:upload"
      pattern: "site:upload"
    - from: "scripts/upload-site.ts"
      to: "Bunny Storage Zone root"
      via: "per-file curl PUT to https://{BUNNY_STORAGE_HOST}/{BUNNY_ZONE}/{relPath}"
      pattern: "PUT"
    - from: "eleventy.config.ts"
      to: "image CDN"
      via: "CDN_BASE_URL const"
      pattern: "moths\\.pnwinsects\\.org"
---

<objective>
Switch the production deployment from GitHub Pages to the custom domain
https://moths.pnwinsects.org/ (served by the existing Bunny CDN + storage zone),
and demote GitHub Pages to a manual staging site.

Three things change together:
1. The image CDN host moves from `pnwmoths.b-cdn.net` to `moths.pnwinsects.org`
   everywhere it is hardcoded, including the tests/checks that enforce the literal (D-03).
2. `main` becomes the production trigger: it builds the site at root `/` and uploads
   `_site` additively into the same Bunny zone that holds the images, via a new
   `scripts/upload-site.ts` modeled on `scripts/upload-images.ts` (D-01, D-02).
3. GitHub Pages becomes a manual (`workflow_dispatch`) staging target that still
   builds under `/pnwmoths/` (D-01).

Purpose: Serve the real site from the project's own domain off the CDN that already
caches its images, with a single bucket and a safe additive deploy.
Output: Updated CDN literal across the codebase, a new additive site uploader + test,
two reworked GitHub Actions workflows, and updated docs.

Decision coverage (locked decisions from planning context):
- D-01 = "main → production; GitHub Pages → manual staging"
- D-02 = "Bunny upload via Storage HTTP API, additive per-file PUT to zone root, NO mirror-delete, NO purge"
- D-03 = "switch image CDN URL to the custom domain everywhere + update enforcing tests/checks"
- C-01 = hard constraint: KEEP `process.env.GITHUB_PAGES ? "/pnwmoths/" : "/"` (do not hardcode prefix)
- C-02 = hard constraint: do NOT create a CNAME file
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@eleventy.config.ts
@eleventy.config.test.ts
@scripts/upload-images.ts
@.github/workflows/deploy.yml
@.github/workflows/pr-check.yml
@.github/scripts/check-cdn-urls.py
@lychee.toml
@package.json
@README.md
@CONTRIBUTING.md

# Project skill (read before implementing — routes spike findings/patterns):
# Skill("spike-findings-pnwmoths")

# Project memory (standing rules that constrain this work):
# - pathPrefix must stay conditional on GITHUB_PAGES (never hardcode "/pnwmoths/")
# - No datacenter server — all deploy steps run in CI or locally
# - Project not live yet — operational hardening is low priority
</context>

<tasks>

<task type="auto">
  <name>Task 1: Switch the image CDN host from pnwmoths.b-cdn.net to moths.pnwinsects.org everywhere (D-03)</name>
  <files>eleventy.config.ts, eleventy.config.test.ts, src/components/key-results-grid.ts, src/components/key-results-grid.test.ts, src/components/pnwm-identify.ts, src/components/pnwm-identify.test.ts, src/components/pnwm-taxon-browser.ts, src/components/pnwm-image-slideshow.test.ts, scripts/upload-images.ts, scripts/upload-tiles.ts, scripts/upload-tiles.test.ts, scripts/migrate-legacy-photos.ts, scripts/migrate-legacy-photos.test.ts, scripts/build-key.ts, .github/scripts/check-cdn-urls.py, _instructions/ADDING_PLATE.md, _instructions/UPLOADING_TILES.md, _instructions/UPLOADING_IMAGES.md</files>
  <action>
Replace every hardcoded occurrence of the literal `https://pnwmoths.b-cdn.net` with
`https://moths.pnwinsects.org` across the repo, per D-03. This is a single-literal
substitution; do it precisely, then verify nothing is left behind.

CRITICAL — do NOT touch these distinct strings (they are the WRITE/storage side, not the read CDN):
- `la.storage.bunnycdn.com` and the `BUNNY_STORAGE_HOST` default — the Storage Zone host stays the same.
- `BUNNY_ZONE` (`pnwmoths`), `BUNNY_API_KEY`, `api.bunny.net` — unchanged.
Only the read CDN pull-zone host changes.

Canonical code locations (the const declarations):
- eleventy.config.ts: the `CDN_BASE_URL` const.
- src/components/key-results-grid.ts, src/components/pnwm-identify.ts (also fix the JSDoc
  example URL in its key-image-url doc comment), src/components/pnwm-taxon-browser.ts.
- scripts/upload-images.ts, scripts/upload-tiles.ts, scripts/migrate-legacy-photos.ts
  (each has a module-level `CDN_BASE_URL` used only to PRINT read/verification URLs — the
  PUT target uses BUNNY_STORAGE_HOST and is unaffected).
- scripts/build-key.ts: two JSDoc comments referencing the resolve URL.
- .github/scripts/check-cdn-urls.py: the `CDN_BASE` constant.

Tests/checks that enforce the literal (these MUST move to the new value or they will fail, per D-03):
- eleventy.config.test.ts: the assertion checking `const CDN_BASE_URL = "https://pnwmoths.b-cdn.net"`
  and its message string — update both to the custom-domain literal. Do NOT touch the separate
  GITHUB_PAGES pathPrefix assertion (C-01) — it must keep passing unchanged.
- scripts/upload-tiles.test.ts, scripts/migrate-legacy-photos.test.ts,
  src/components/key-results-grid.test.ts, src/components/pnwm-identify.test.ts: update the
  expected CDN-absolute URL literals/prefixes.
- src/components/pnwm-image-slideshow.test.ts: update the `cdnBaseUrl` fixture values
  (the component reads cdnBaseUrl from eleventy global data; these are test fixtures).

Docs (read/verification example URLs): _instructions/ADDING_PLATE.md, UPLOADING_TILES.md,
UPLOADING_IMAGES.md. Replace the read-host occurrences. After replacing, re-read the two
sentences in UPLOADING_TILES.md/UPLOADING_IMAGES.md that describe "the Pull Zone host ...
(read-only)" and confirm the prose still reads correctly with the new hostname (it should —
the custom domain IS the pull-zone hostname now). Leave the storage-host sentences
(`la.storage.bunnycdn.com`, "accepts writes") untouched.

Path-collision note (D-03 verification): the custom domain serves the SAME bucket. Site
routes are `/`, `/species/{slug}/`, `/plates/`, `/plates/{slug}/`, `/glossary/`, `/identify/`,
`/browse/`, `/search/`, plus static asset dirs. Image objects live at bucket root
`/{species-slug}/...`, `/key-images/...`, `/species-tiles/...`, `/plates/{slug}/...`,
`/glossary/...`. The only shared directories are `/plates/{slug}/` and `/glossary/`, where the
site emits `index.html` and images are differently-named files — they coexist. Species nav
images at root `/{slug}/` do not collide with the site's `/species/{slug}/`. No destructive
collision exists as long as the deploy is additive (enforced in Task 2). No action needed here
beyond confirming the analysis holds.
  </action>
  <verify>
    <automated>cd /Users/rainhead/dev/pnwmoths && ! git grep -n "pnwmoths\.b-cdn\.net" -- ':!.planning' && git grep -q "moths\.pnwinsects\.org" -- eleventy.config.ts && git grep -q "moths\.pnwinsects\.org" -- .github/scripts/check-cdn-urls.py && npm run typecheck && npm test</automated>
  </verify>
  <done>git grep finds zero `pnwmoths.b-cdn.net` occurrences outside .planning/; the custom domain is present in eleventy.config.ts and check-cdn-urls.py; typecheck passes; full test suite passes (including the updated eleventy.config.test.ts CDN assertion and the unchanged GITHUB_PAGES pathPrefix assertion).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add scripts/upload-site.ts — additive Bunny Storage uploader for _site (D-02) + npm script</name>
  <files>scripts/upload-site.ts, scripts/upload-site.test.ts, package.json</files>
  <behavior>
    - siteObjectStorageUrl("index.html") → "https://la.storage.bunnycdn.com/pnwmoths/index.html" (zone ROOT, no key-images/ prefix).
    - siteObjectStorageUrl("species/acronicta-americana/records.parquet") → encodes each path segment but preserves "/" separators.
    - siteObjectStorageUrl("plates/some plate/thumb.html") → spaces in a segment become %20; slashes are NOT encoded.
    - contentTypeFor("page.html") → "text/html; charset=utf-8"; "app.js" → a JavaScript type; "data.json" → "application/json"; "x.webp" → "image/webp"; "x.parquet" → "application/octet-stream" (or a parquet type); unknown ext → "application/octet-stream".
    - listSiteFiles(tmpFixtureDir) returns POSIX-relative paths for every file recursively, with no leading "./" and no directories.
    - Additive-only invariant: the source of scripts/upload-site.ts contains no "DELETE" token and no mirror/sync-delete logic (source-introspection test, mirroring how eleventy.config.test.ts asserts on source text).
    - DRY_RUN=1 over a fixture SITE_DIR prints the PUT plan and makes zero curl/network calls.
  </behavior>
  <action>
Create scripts/upload-site.ts modeled directly on scripts/upload-images.ts (reuse its exact
auth + HTTP + retry + redaction pattern, per D-02). Keep it self-contained (node builtins +
the `curl` CLI only — NO new npm packages, NO vips; the site files upload as-is).

Module-level env constants (mirror upload-images.ts):
- BUNNY_STORAGE_HOST = process.env.BUNNY_STORAGE_HOST ?? "la.storage.bunnycdn.com"
- BUNNY_ZONE = process.env.BUNNY_ZONE ?? "pnwmoths"
- BUNNY_STORAGE_PASSWORD = process.env.BUNNY_STORAGE_PASSWORD ?? process.env.BUNNY_API_KEY ?? ""
  (Primary name is BUNNY_STORAGE_PASSWORD — the new CI secret; fall back to BUNNY_API_KEY so
  local runs that already export the image-uploader key keep working. Same zone password value.)
- SITE_DIR = process.env.SITE_DIR ?? "_site"
- DRY_RUN = process.env.DRY_RUN === "1"

Copy verbatim from upload-images.ts: the `sleep`, `redact` (redacts the storage password from
error text), and `withRetry` helpers — but redact against BUNNY_STORAGE_PASSWORD.

Exported pure helpers (each exercised by upload-site.test.ts):
- siteObjectStorageUrl(relPath): returns
  `https://${BUNNY_STORAGE_HOST}/${BUNNY_ZONE}/` + relPath split on "/" with each segment
  passed through encodeURIComponent and re-joined with "/". This targets the zone ROOT — there
  is NO `key-images/` (or any) prefix; the site lives at the bucket root alongside the images'
  own subpaths (D-02).
- contentTypeFor(filename): extension → MIME map. Cover at minimum: html→"text/html; charset=utf-8",
  css→"text/css; charset=utf-8", js/mjs→"text/javascript; charset=utf-8", json→"application/json",
  xml→"application/xml", svg→"image/svg+xml", webp→"image/webp", png→"image/png",
  jpg/jpeg→"image/jpeg", txt→"text/plain; charset=utf-8", wasm→"application/wasm",
  woff2→"font/woff2", map→"application/json", parquet→"application/octet-stream"; default
  "application/octet-stream". (Bunny serves the stored Content-Type; setting it keeps HTML/CSS/JS/wasm
  rendering correctly through the pull zone.)
- listSiteFiles(dir): synchronous recursive walk (readdirSync withFileTypes) returning POSIX
  relative file paths (no dirs, no leading "./").

main():
1. If SITE_DIR is missing → error + exit 1 (tell the user to run the build first).
2. Compute files = listSiteFiles(SITE_DIR).
3. If DRY_RUN: print each relPath → siteObjectStorageUrl(relPath) and the resolved Content-Type,
   then a summary; make ZERO curl calls; return. (Place this BEFORE the missing-password guard so
   DRY_RUN works without a secret — same ordering as upload-images.ts.)
4. If BUNNY_STORAGE_PASSWORD is empty → error (point to the bunny dashboard + the GitHub secret) + exit 1.
5. For each file: run a single curl PUT wrapped in withRetry:
   curl -s -S -f -X PUT -H "AccessKey: <password>" -H "Content-Type: <contentTypeFor(file)>"
   --data-binary @<absolute local path> <siteObjectStorageUrl(relPath)>
   Use the execFileSync argv-array form (paths/segments may contain spaces).
6. Track uploaded/failed counts; print a tail-friendly summary; exit 1 if any upload failed.

ADDITIVE-ONLY (D-02, the single most important safety property): the script does ONE PUT per
local file and NOTHING else against the zone. It MUST NOT list the remote zone to diff/delete,
MUST NOT issue any DELETE, and MUST NOT mirror/sync. The images live in this same bucket; a
mirror-delete would wipe them. Do not even import/define a delete helper. There is no purge step.

Self-invocation guard: copy the `import.meta.url === file://${process.argv[1]}` guard from
upload-images.ts so the test file can import the exports without running main().

Create scripts/upload-site.test.ts using node:test + node:assert/strict (project convention),
covering the behaviors above. Use a tmp fixture dir (mkdtempSync + a couple of nested files) for
listSiteFiles and for a DRY_RUN smoke check via SITE_DIR. Include the source-introspection test:
read scripts/upload-site.ts and assert it contains neither `"DELETE"` nor `'DELETE'` nor a
`-X DELETE` substring (locks the additive invariant permanently).

package.json: add script `"site:upload": "node scripts/upload-site.ts"` (noun:verb style, matching
`key:upload-images` / `photos:upload`). Append `scripts/upload-site.test.ts` to the `test` script's
explicit file list so CI runs it.
  </action>
  <verify>
    <automated>cd /Users/rainhead/dev/pnwmoths && ! grep -nE "DELETE|mirror|--delete" scripts/upload-site.ts && node --test scripts/upload-site.test.ts && SITE_DIR=$(mktemp -d) && : > "$SITE_DIR/index.html" && DRY_RUN=1 SITE_DIR="$SITE_DIR" node scripts/upload-site.ts | grep -q "la.storage.bunnycdn.com/pnwmoths/index.html" && npm run typecheck
</automated>
  </verify>
  <done>upload-site.ts has no DELETE/mirror tokens; its unit test passes; a DRY_RUN over a one-file fixture prints a zone-root PUT URL and makes zero network calls; typecheck passes; `npm run site:upload` exists in package.json and the new test file is in the `test` script list.</done>
</task>

</tasks>

<additional_tasks>

<task type="auto">
  <name>Task 3: Rework GitHub Actions — production.yml (main → Bunny) + staging.yml (Pages, manual) (D-01)</name>
  <files>.github/workflows/production.yml, .github/workflows/staging.yml, .github/workflows/deploy.yml</files>
  <action>
Split the single Pages deploy into a production (Bunny) workflow and a manual staging (Pages)
workflow, per D-01. Rename the existing file to preserve history, then add the staging file.

Step A — rename deploy.yml to production.yml: run `git mv .github/workflows/deploy.yml
.github/workflows/production.yml`, then rewrite it as the PRODUCTION (Bunny) workflow:
- name: "Deploy to Production (Bunny)".
- on: push: branches: [main]  (unchanged trigger).
- permissions: contents: read  (REMOVE `pages: write` and `id-token: write` — no Pages deploy).
- concurrency: group: production-deploy, cancel-in-progress: false  (serialize uploads).
- Single job `deploy` (drop the separate Pages `deploy` job entirely). Steps, in order:
  checkout → setup-node (node-version-file .nvmrc, cache npm) → npm ci → typecheck → test →
  TS-only invariant guard (bash scripts/check-ts-only.sh) → install-lychee (./.github/actions/install-lychee, version 0.23.0)
  → lychee cache step → THEN the build chain → verify:parquet → link check (non-blocking) → upload.
  - REMOVE the `actions/configure-pages` step (it is what sets GITHUB_PAGES=true; removing it means
    GITHUB_PAGES is unset → pathPrefix "/" → site builds at root, per C-01). Do NOT set GITHUB_PAGES.
  - Keep the build chain EXACTLY as the current deploy.yml has it (do not add/remove build steps):
    `npm run build:data && npm run build:key && npm run build:eleventy && npm run build:copy-parquet && npm run build:copy-key-matrix && npm run build:check-key-weight && npm run build:copy-images && npm run build:species-states && npm run build:pagefind && npm run build:check-weight`.
  - Keep `npm run verify:parquet` and the non-blocking `npm run build:validate-links`
    (continue-on-error: true). The lychee.toml `/pnwmoths/` remap is inert at root "/", so it
    needs no change (see Task 4 note); leave lychee.toml untouched.
  - REMOVE `actions/upload-pages-artifact` and the entire `deploy` job using `actions/deploy-pages`.
  - ADD a final step "Upload _site to Bunny" that runs `npm run site:upload` with
    env: BUNNY_STORAGE_PASSWORD: ${{ secrets.BUNNY_STORAGE_PASSWORD }}. No purge step (D-02).

Step B — create .github/workflows/staging.yml as the manual GitHub Pages workflow:
- name: "Deploy to Staging (GitHub Pages)".
- on: workflow_dispatch  (manual only — NOT on push).
- permissions: contents: read, pages: write, id-token: write.
- concurrency: group: pages, cancel-in-progress: false.
- This is essentially the ORIGINAL deploy.yml (build job + Pages deploy job), with two differences:
  (1) trigger is workflow_dispatch, and (2) the build step sets `env: GITHUB_PAGES: "true"` explicitly
  so the prefix is "/pnwmoths/" (C-01). Keep `actions/configure-pages`, `actions/upload-pages-artifact`,
  and the `deploy` job with `actions/deploy-pages` exactly as the original. Do NOT create a CNAME file (C-02).

Pin all actions to the same commit SHAs already used in the original deploy.yml/pr-check.yml.
After Step A the file deploy.yml must no longer exist (it became production.yml).
  </action>
  <verify>
    <automated>cd /Users/rainhead/dev/pnwmoths && test ! -f .github/workflows/deploy.yml && test ! -f CNAME && grep -q "branches: \[main\]" .github/workflows/production.yml && grep -q "site:upload" .github/workflows/production.yml && grep -q "secrets.BUNNY_STORAGE_PASSWORD" .github/workflows/production.yml && ! grep -qE "upload-pages-artifact|deploy-pages|configure-pages|GITHUB_PAGES" .github/workflows/production.yml && grep -q "workflow_dispatch" .github/workflows/staging.yml && grep -q "GITHUB_PAGES" .github/workflows/staging.yml && grep -qE "upload-pages-artifact|deploy-pages" .github/workflows/staging.yml && python3 -c "import sys,yaml" 2>/dev/null && python3 -c "import yaml; yaml.safe_load(open('.github/workflows/production.yml')); yaml.safe_load(open('.github/workflows/staging.yml'))" || echo "yaml lint skipped (PyYAML absent) — structural greps passed"</automated>
  </verify>
  <done>deploy.yml is gone; production.yml triggers on push to main, has no Pages/configure-pages/GITHUB_PAGES references, and uploads via `npm run site:upload` using the BUNNY_STORAGE_PASSWORD secret with no purge; staging.yml triggers only on workflow_dispatch, sets GITHUB_PAGES=true, and keeps the Pages artifact/deploy steps; no CNAME file exists (C-02).</done>
</task>

<task type="auto">
  <name>Task 4: Update README.md and CONTRIBUTING.md for the new production/staging model + secret follow-up</name>
  <files>README.md, CONTRIBUTING.md</files>
  <action>
Update the docs to describe the new deployment model. Keep them concise and link to the workflow
files rather than duplicating their contents (per the project's README guidance).

README.md "Deployment" section: replace the "deploy to GitHub Pages" description with: a push to
`main` runs CI (typecheck, tests, build at root "/") and then uploads the built `_site` additively
to the Bunny Storage Zone, serving production at https://moths.pnwinsects.org/ (the same CDN/zone
that holds the images; the upload is additive — no purge, no deletes). GitHub Pages remains as a
manual staging target (run the "Deploy to Staging" workflow via workflow_dispatch), served at the
default *.github.io/pnwmoths/ URL. Link to `.github/workflows/production.yml`,
`.github/workflows/staging.yml`, and CONTRIBUTING.md. Do not duplicate secret names/values in README.

CONTRIBUTING.md "CI" section: update the workflow list to the three current workflows:
- `production.yml` — build + additive upload to Bunny (production, https://moths.pnwinsects.org/) on push to main.
- `staging.yml` — GitHub Pages staging, manual (workflow_dispatch), builds under /pnwmoths/.
- `pr-check.yml` — full build + link check on pull requests.
Drop the inaccurate "Both use the same Docker image" claim for CI (the workflows use setup-node, not
Docker; Docker remains the local-build option documented above). Add a short "Required secret"
note: production deploy needs the repo secret `BUNNY_STORAGE_PASSWORD` (the Bunny `pnwmoths` Storage
Zone password), set at GitHub → Settings → Secrets and variables → Actions. This is the manual
follow-up the maintainer must do for production deploys to succeed.

Do not touch the build-steps table beyond what is needed (pre-existing drift is out of scope).
  </action>
  <verify>
    <automated>cd /Users/rainhead/dev/pnwmoths && grep -q "moths.pnwinsects.org" README.md && grep -qiE "staging|workflow_dispatch" README.md && grep -q "production.yml" CONTRIBUTING.md && grep -q "staging.yml" CONTRIBUTING.md && grep -q "BUNNY_STORAGE_PASSWORD" CONTRIBUTING.md && ! grep -qi "deploy.yml" CONTRIBUTING.md</automated>
  </verify>
  <done>README Deployment section describes production=custom domain via additive Bunny upload on main and staging=manual GitHub Pages; CONTRIBUTING CI section lists production.yml/staging.yml/pr-check.yml, drops the stale deploy.yml reference, and documents the required BUNNY_STORAGE_PASSWORD secret as the manual follow-up.</done>
</task>

</additional_tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| CI runner → Bunny Storage Zone | GitHub Actions authenticates with the storage password and writes site files into the bucket that also holds all images |
| public → custom domain (moths.pnwinsects.org) | Bunny pull zone serves both site files (zone root) and images (subpaths) from one bucket |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-jtl-01 | Tampering/Denial | scripts/upload-site.ts ↔ Bunny zone | mitigate | Additive per-file PUT ONLY; no remote listing, no DELETE, no mirror/sync — prevents wiping the co-located images. Locked by a source-introspection test asserting the source contains no DELETE token (D-02). |
| T-jtl-02 | Information disclosure | BUNNY_STORAGE_PASSWORD in CI logs / error text | mitigate | Password supplied only via the masked GitHub secret + env; reuse upload-images.ts `redact()` to scrub it from any error message; never echoed by the script. |
| T-jtl-03 | Spoofing/Elevation | unintended production deploys | accept | Production is push-to-main; repo access already gates who can push. Project not yet live (low value); no branch protection by prior decision. |
| T-jtl-04 | Tampering | path collision overwriting an image object | mitigate | Verified no site-emitted object key equals an image object key (site emits index.html/assets; shared /plates/{slug}/ and /glossary/ dirs hold differently-named files). Additive upload (T-jtl-01) makes coexistence safe (D-03). |
| T-jtl-SC | Tampering | npm/pip/cargo installs | accept | No new packages introduced; upload-site.ts uses node builtins + the `curl` CLI only. No package-legitimacy gate required. |
</threat_model>

<verification>
Phase-level checks (run after all tasks):
- `git grep -n "pnwmoths\.b-cdn\.net" -- ':!.planning'` returns nothing.
- `npm run typecheck` and `npm test` both pass (CDN literal moved; new uploader test green).
- `DRY_RUN=1 SITE_DIR=<fixture> node scripts/upload-site.ts` prints zone-root PUT targets and makes zero network calls.
- `.github/workflows/`: production.yml (push→main, Bunny upload, no Pages, no purge) and staging.yml (workflow_dispatch, Pages, GITHUB_PAGES=true) present; deploy.yml absent; no CNAME file.
- eleventy.config.test.ts still asserts the GITHUB_PAGES pathPrefix conditional (C-01) and now asserts the custom-domain CDN literal.
</verification>

<success_criteria>
- Image CDN host is https://moths.pnwinsects.org everywhere it was hardcoded, with all enforcing tests/checks updated and passing (D-03).
- scripts/upload-site.ts performs additive-only uploads to the Bunny zone root and provably contains no delete/mirror logic (D-02).
- Push to main builds at root "/" and uploads to Bunny; GitHub Pages is manual staging building under /pnwmoths/ (D-01).
- pathPrefix stays conditional on GITHUB_PAGES; no CNAME file is created (C-01, C-02).
- Docs reflect the new model and the required BUNNY_STORAGE_PASSWORD secret.

## Manual follow-up (cannot be automated by Claude)
The maintainer must add the GitHub Actions repository secret **BUNNY_STORAGE_PASSWORD**
(value = the Bunny `pnwmoths` Storage Zone password; same value as the local BUNNY_API_KEY)
at GitHub → Settings → Secrets and variables → Actions. Until this exists, the production
workflow's upload step will fail with a missing-password error (the rest of CI still runs).
</success_criteria>

<output>
Create `.planning/quick/260628-jtl-switch-production-to-custom-domain-moths/260628-jtl-SUMMARY.md` when done.
</output>
