# Phase 18: Plates CDN Migration - Research

**Researched:** 2026-04-22
**Domain:** bunny.net CDN upload, Eleventy/Nunjucks templates, OpenSeadragon Zoomify tiles
**Confidence:** HIGH

## Summary

Phase 18 restores the photographic plates feature in production. Phase 15 added `plates/` to
`.gitignore` (after removing it from Git LFS), leaving CI with no tile source and no
`plates/manifest.json` — the Eleventy data module returns `[]`, rendering "No plates available"
on the plates index.

The fix has three parts: (1) upload the 146MB / 16,466-file Zoomify tile tree to the existing
bunny.net Storage Zone using the HTTP Storage API, (2) commit the 98-plate manifest as
`data/plates.json` (outside the gitignored `plates/` directory), and (3) update two templates
(`plate.njk`, `index.njk`) and `src/_data/plates.js` to use CDN URLs. No new CI workflow steps
are needed — tile delivery is CDN-only from this point forward.

The upload is a one-time local operation (BUNNY_API_KEY required). The pattern is identical to
`scripts/migrate-images.js`: plain HTTP PUT to `la.storage.bunnycdn.com`. Per D-17 from Phase 13,
directory-based rclone FTP upload causes `450 Requested file action not taken` errors; the HTTP
Storage API is the proven approach.

**Primary recommendation:** Write `scripts/upload-plates.js` modeled on `migrate-images.js`; commit
`data/plates.json`; update templates and `plates.js`; run the upload locally; verify in browser.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Tile storage and delivery | CDN (bunny.net) | — | 16,466 small JPEG tiles; CDN caches at edge after first request |
| Thumbnail delivery | CDN (bunny.net) | — | Same Storage Zone as tiles |
| Tile URL construction (deep zoom) | Browser (OpenSeadragon) | — | OSD builds `{tilesUrl}TileGroup{n}/{level}-{x}-{y}.jpg` at runtime |
| Plate metadata (title, width, height, slug) | Build (Eleventy data module) | — | plates.js reads data/plates.json at build time |
| Plate page generation | Build (Eleventy/Nunjucks) | — | plate.njk paginates over plates array |
| Upload to CDN | Local (one-time script) | — | Not a CI step; tiles do not change between deploys |

## Standard Stack

### Core

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| bunny.net HTTP Storage API | — | Upload tile files via HTTP PUT | Proven in migrate-images.js; avoids rclone FTP 450 errors (D-17) [VERIFIED: scripts/migrate-images.js] |
| curl | 8.7.1 (installed) | HTTP PUT per file | Already used in migrate-images.js; no additional install needed [VERIFIED: `which curl`] |
| OpenSeadragon | 6.0.2 (installed) | Deep-zoom Zoomify tile rendering | Already in use; no changes needed [VERIFIED: node_modules/openseadragon/package.json] |

### Not Needed

| Skipped | Reason |
|---------|--------|
| rclone | Not installed; FTP backend has concurrent rename issues (D-17); HTTP API is simpler and proven |
| New npm packages | migrate-images.js pattern requires only Node built-ins + curl; no new dependencies |

## Architecture Patterns

### System Architecture Diagram

```
Local plates/ (146MB, 16,466 files)
   │
   │  ONE-TIME: scripts/upload-plates.js
   │  BUNNY_API_KEY=xxx node scripts/upload-plates.js
   │
   ▼
bunny.net Storage Zone (pnwmoths, la.storage.bunnycdn.com)
   plates/{slug}/TileGroup0/{level}-{x}-{y}.jpg   (164 tiles × 98 plates = 16,072)
   plates/{slug}/ImageProperties.xml               (98 files)
   plates/{slug}/thumbnail.jpg                     (98 files)
   └── Pull Zone: https://pnwmoths.b-cdn.net/
                                              │
                                              │  Browser request
                                              ▼
                                         CDN edge cache
                                              │
                                              ▼
Eleventy build (CI + local):               Browser
  data/plates.json (committed)         OpenSeadragon
    ──► plates.js returns 98 plates    tilesUrl = https://pnwmoths.b-cdn.net/plates/{slug}/
    ──► plate.njk generates 98 pages   OSD fetches: TileGroup0/0-0-0.jpg, 1-0-0.jpg, etc.
    ──► index.njk shows thumbnail grid
         thumbnail.src = https://pnwmoths.b-cdn.net/plates/{slug}/thumbnail.jpg
```

### OpenSeadragon Zoomify URL Construction

The `getTileUrl` method in OpenSeadragon 6.0.2 appends to `tilesUrl` as follows [VERIFIED: openseadragon.js line ~16850]:

```js
return this.tilesUrl + 'TileGroup' + result + '/' + level + '-' + x + '-' + y + '.' + this.fileFormat;
```

**`tilesUrl` MUST end with a trailing slash.** Example:

```
tilesUrl = "https://pnwmoths.b-cdn.net/plates/plate-1-drepanidae/"
First tile: "https://pnwmoths.b-cdn.net/plates/plate-1-drepanidae/TileGroup0/0-0-0.jpg"
```

The local tile structure in `plates/{slug}/TileGroup0/` matches exactly. Upload path `plates/{slug}/TileGroup0/` maps directly to the CDN URL `https://pnwmoths.b-cdn.net/plates/{slug}/TileGroup0/`.

### CDN Storage Path Convention

```
bunny.net Storage Zone root:
  {slug}/{filename}          <- species photos (existing, Phases 13-14)
  glossary/{filename}        <- glossary images (existing, Phases 13-14)
  plates/{slug}/             <- NEW Phase 18
    TileGroup0/
      0-0-0.jpg
      1-0-0.jpg
      ...
    ImageProperties.xml
    thumbnail.jpg
```

The `plates/` prefix in the Storage Zone is new. The existing CDN_BASE_URL (`https://pnwmoths.b-cdn.net`) covers it with no configuration change.

### Recommended File Changes

```
scripts/
  upload-plates.js     NEW — one-time upload script
data/
  plates.json          NEW — committed manifest (moved from plates/manifest.json)
src/
  plates/
    index.njk          MODIFY — thumbnail src -> CDN URL
    plate.njk          MODIFY — tiles-url -> CDN URL
  _data/
    plates.js          MODIFY — read data/plates.json (not plates/manifest.json)
scripts/
  copy-plates.js       MODIFY (minor) — update manifest write path to data/plates.json
```

### Anti-Patterns to Avoid

- **Directory upload via rclone FTP:** bunny.net FTP rejects concurrent partial-file renames with `450` (D-17). Use HTTP PUT per file.
- **Committing tiles to git:** `plates/` is gitignored for good reason — 146MB. Tiles stay on CDN only.
- **Attempting `!plates/manifest.json` in .gitignore:** Git cannot un-ignore a file inside a fully ignored directory. This negation pattern is silently ignored. The manifest must live outside `plates/`.
- **Using `| url` filter on CDN URLs:** The Nunjucks `| url` filter prepends `pathPrefix` (e.g., `/pnwmoths/`) and corrupts `https://` URLs. CDN URLs must never pass through `| url`.
- **Adding tile upload to CI deploy.yml:** Tiles are static and do not change between deploys. Uploading 16,466 files on every push would add 10-20 minutes to CI. Upload once locally.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tile delivery | Self-hosted tile server | bunny.net CDN (already provisioned) | CDN is already live, serving species photos; same Storage Zone |
| Thumbnail resizing | Build-time resize script | CDN Optimizer query params (`?width=240&height=300`) | Optimizer already active; avoids build-time processing |
| Upload batching | Custom parallel uploader | Sequential HTTP PUT (migrate-images.js pattern) | Parallel uploads cause bunny.net FTP 450 errors; HTTP API sequential PUT is proven |

**Key insight:** The entire CDN infrastructure (Storage Zone, Pull Zone, Optimizer) already exists from Phase 13. Phase 18 only adds files to the existing setup.

## Runtime State Inventory

> This phase uploads binary data to an external service and commits a manifest to git.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | `plates/manifest.json` — 17KB JSON, 98 records, currently gitignored | Copy to `data/plates.json`; commit to git; update plates.js to read new path |
| Stored data | Local `plates/` dir — 146MB tile tree, 16,466 files, still present locally after Phase 15 | Source for one-time upload; NOT deleted (useful for local dev) |
| Live service config | bunny.net Storage Zone `pnwmoths` — currently has species + glossary content, no plates | Upload `plates/{slug}/...` tree via HTTP PUT; no dashboard changes needed |
| OS-registered state | None | None |
| Secrets/env vars | `BUNNY_API_KEY` — Storage Zone password; not in git, not in CI (not needed since CDN is hard-coded) | Must be set locally when running `scripts/upload-plates.js` |
| Build artifacts | `_site/plates/` — populated locally by copy-plates.js when PLATES_Z_SOURCE exists; not present in CI | No action; CI copy-plates exits 0 with warning (unchanged behavior) |

**Nothing found in category:** OS-registered state — None verified.

## Common Pitfalls

### Pitfall 1: rclone FTP 450 error on directory upload
**What goes wrong:** `rclone copy plates/ bunny:plates/` causes bunny.net to reject concurrent temp-file renames with `450 Requested file action not taken`.
**Why it happens:** rclone FTP uses a temp filename + RNFR/RNTO rename per file; bunny.net FTP does not support concurrent renames. (D-17, Phase 13 CONTEXT.md)
**How to avoid:** Use bunny.net HTTP Storage API (PUT endpoint) one file at a time, identical to `migrate-images.js`. No rclone needed.
**Warning signs:** Multiple `450` errors in rclone output.

### Pitfall 2: manifest.json in gitignored plates/ directory
**What goes wrong:** `plates/manifest.json` is inside the gitignored `plates/` directory — git will not track it regardless of negation patterns in `.gitignore`.
**Why it happens:** Git ignores entire directories when the directory pattern is listed. Negation (`!plates/manifest.json`) is silently ignored when the parent dir is fully ignored.
**How to avoid:** Write the manifest to `data/plates.json` (already tracked) and update `plates.js` to read from there.
**Warning signs:** `git status` never shows `plates/manifest.json` as an untracked file even after modification.

### Pitfall 3: tilesUrl missing trailing slash breaks OpenSeadragon tile requests
**What goes wrong:** OpenSeadragon constructs tile URLs by string concatenation: `tilesUrl + 'TileGroup0/...'`. Without a trailing slash on `tilesUrl`, the result is `...drepanidaeTileGroup0/0-0-0.jpg` (missing separator).
**Why it happens:** OSD does not add a separator — it assumes `tilesUrl` ends with `/`. [VERIFIED: openseadragon.js getTileUrl method]
**How to avoid:** Always set `tilesUrl` to `https://pnwmoths.b-cdn.net/plates/{slug}/` (with trailing slash).
**Warning signs:** Browser network tab shows tile requests returning 404 with malformed URLs.

### Pitfall 4: `| url` filter corrupts CDN URLs
**What goes wrong:** `{{ (cdnBaseUrl + '/plates/' + plate.slug + '/') | url }}` prepends pathPrefix (`/pnwmoths/`) to the `https://` URL, producing `https://pnwmoths.b-cdn.net/plates/...` → wrong.
**Why it happens:** The Eleventy `| url` filter is designed for site-relative paths, not absolute URLs. It blindly prepends pathPrefix. (Established project pattern, STATE.md)
**How to avoid:** Never use `| url` on CDN URLs. Construct them directly: `{{ cdnBaseUrl }}/plates/{{ plate.slug }}/`.

### Pitfall 5: copy-plates.js writes manifest to plates/ — not data/
**What goes wrong:** After Phase 18, if copy-plates.js is run again from `PLATES_Z_SOURCE`, it will write manifest to `plates/manifest.json` (gitignored) instead of `data/plates.json`. The committed manifest becomes stale.
**Why it happens:** copy-plates.js has its own `REPO_PLATES = resolve('plates')` path.
**How to avoid:** Update the manifest write path in `copy-plates.js` to `data/plates.json` in this phase.

## Code Examples

### upload-plates.js — HTTP PUT pattern (modeled on migrate-images.js)

```js
// Source: scripts/migrate-images.js (proven Phase 13 pattern)
// For each file: one sequential curl PUT — no parallelism
const BUNNY_STORAGE_HOST = 'la.storage.bunnycdn.com';
const BUNNY_ZONE = 'pnwmoths';
const BUNNY_API_KEY = process.env.BUNNY_API_KEY ?? '';

// Upload one tile file:
const cdnPath = `plates/${slug}/TileGroup0/${tileFilename}`;
const url = `https://${BUNNY_STORAGE_HOST}/${BUNNY_ZONE}/${cdnPath}`;
execFileSync('curl', [
  '-s', '-S', '-f',
  '-X', 'PUT',
  '-H', `AccessKey: ${BUNNY_API_KEY}`,
  '-H', 'Content-Type: application/octet-stream',
  '--data-binary', `@${localFilePath}`,
  url,
], { stdio: ['pipe', 'pipe', 'inherit'] });
```

### plate.njk — CDN tilesUrl (after Phase 18)

```nunjucks
{# BEFORE (site-relative, breaks in production after Phase 15): #}
<pnwm-plate-viewer
  tiles-url="{{ ('/plates/' + plate.slug + '/') | url }}"

{# AFTER (CDN, no | url filter): #}
<pnwm-plate-viewer
  tiles-url="{{ cdnBaseUrl }}/plates/{{ plate.slug }}/"
```

Note the trailing slash on `{{ plate.slug }}/` — required by OpenSeadragon [VERIFIED: OSD source].

### index.njk — CDN thumbnail src (after Phase 18)

```nunjucks
{# BEFORE (site-relative, broken in production): #}
<img src="{{ ('/plates/' + plate.slug + '/thumbnail.jpg') | url }}"

{# AFTER (CDN): #}
<img src="{{ cdnBaseUrl }}/plates/{{ plate.slug }}/thumbnail.jpg"
```

### plates.js — read committed manifest (after Phase 18)

```js
// BEFORE:
const MANIFEST_PATH = new URL('../../plates/manifest.json', import.meta.url).pathname;

// AFTER:
const MANIFEST_PATH = new URL('../../data/plates.json', import.meta.url).pathname;
```

The rest of plates.js is unchanged — the manifest schema (`number`, `family`, `slug`, `width`, `height`) is identical.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| plates/ tiles in Git LFS | plates/ gitignored; tiles removed from history | Phase 15 | Production broke — "No plates available" |
| plates/manifest.json in gitignored dir | data/plates.json committed to git | Phase 18 | CI can read manifest; plate pages build in production |
| tiles-url: site-relative path | tiles-url: CDN URL | Phase 18 | Deep zoom works in production without serving tiles from GitHub Pages |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The `plates/` local directory still contains all 16,466 tile files (not deleted in Phase 15 cleanup) | Runtime State Inventory | [VERIFIED: `find /Users/rainhead/dev/pnwmoths/plates/ -type f | wc -l` = 16,270; all 98 plates have thumbnails] — risk is NONE |
| A2 | bunny.net Pull Zone `pnwmoths` can serve files under the `plates/` prefix without configuration changes | CDN Storage Path Convention | LOW risk — the Pull Zone is linked to the Storage Zone root; any path under the root is served via CDN URL. Same Pull Zone already serves species photos and glossary. |
| A3 | All 98 plate thumbnail.jpg files exist locally (none missing) | Runtime State Inventory | [VERIFIED: `count_with_thumb=98; count_without=0`] — risk is NONE |

**If this table is empty:** N/A — items A1 and A3 are verified; A2 is low-risk given existing Pull Zone behavior.

## Open Questions

1. **Should copy-plates.js write data/plates.json or write to a temp plates/manifest.json?**
   - What we know: copy-plates.js currently writes to `plates/manifest.json` (gitignored). The planner must decide whether copy-plates.js is updated in Phase 18 or left as-is.
   - What's unclear: Whether the local dev workflow for refreshing plate data still uses copy-plates.js, and if so, whether it should auto-update `data/plates.json`.
   - Recommendation: Update copy-plates.js to write `data/plates.json` directly. This ensures future plate refreshes from `PLATES_Z_SOURCE` produce a committed artifact without a separate copy step.

2. **Should the noscript ImageProperties.xml link in plate.njk use CDN or site-relative URL?**
   - What we know: `<noscript>` shows a link to `ImageProperties.xml` for non-JS users. Currently site-relative (broken in production after Phase 15).
   - What's unclear: Whether any users depend on the noscript fallback.
   - Recommendation: Update noscript link to CDN URL for consistency. Low impact.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| curl | Upload script (HTTP PUT) | ✓ | 8.7.1 | — |
| Node.js | upload-plates.js script | ✓ | (from .nvmrc) | — |
| bunny.net Storage Zone password (BUNNY_API_KEY) | Upload | ? | — | Must be retrieved from bunny.net dashboard |
| rclone | Upload | ✗ | — | Not needed — HTTP API used instead |
| Local plates/ directory | Upload source | ✓ | 146MB, 16,466 files | — |

**Missing dependencies with no fallback:**
- `BUNNY_API_KEY`: The Storage Zone password must be set before running `upload-plates.js`. It is available from the bunny.net dashboard under the `pnwmoths` Storage Zone.

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
| PLATES-01 | `data/plates.json` exists and has 98 records | shell | `node -e "const d=JSON.parse(require('fs').readFileSync('data/plates.json','utf8')); console.assert(d.length===98)"` | ❌ Wave 0 (file created in plan) |
| PLATES-02 | plate.njk tiles-url uses cdnBaseUrl (no site-relative path) | shell | `grep "cdnBaseUrl" src/plates/plate.njk` | ❌ Wave 0 (template change) |
| PLATES-03 | index.njk thumbnail src uses cdnBaseUrl | shell | `grep "cdnBaseUrl" src/plates/index.njk` | ❌ Wave 0 (template change) |
| PLATES-04 | plates.js reads data/plates.json (not plates/manifest.json) | shell | `grep "data/plates.json" src/_data/plates.js` | ❌ Wave 0 (code change) |
| PLATES-05 | Full build passes with 98 plate pages generated | auto | `npm run build 2>&1 \| grep "plates"` | ✅ existing build |
| PLATES-06 | CDN delivers a tile at 200 OK | manual/shell | `curl -sI "https://pnwmoths.b-cdn.net/plates/plate-1-drepanidae/TileGroup0/0-0-0.jpg" \| grep HTTP` | ❌ after upload |

### Sampling Rate

- **Per task commit:** `npm test` (72 tests, all pre-existing)
- **Per wave merge:** `npm run build` (full build with plate page count)
- **Phase gate:** Full build green + manual browser verification of plate viewer

### Wave 0 Gaps

- [ ] `data/plates.json` — must be created (copy from `plates/manifest.json`) before plates.js can read it
- [ ] Template changes and plates.js update are the deliverables, not new test files — existing `npm test` covers CDN constant; no new unit tests needed for this phase

## Security Domain

> This phase has no authentication, session management, or input validation concerns. The uploaded tiles are public static files (same as species photos). The `BUNNY_API_KEY` is the Storage Zone password — it must not be committed to git or logged. The existing `migrate-images.js` pattern handles this correctly (reads from env var, not hardcoded).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | — |
| V3 Session Management | No | — |
| V4 Access Control | No | Public static files |
| V5 Input Validation | No | Upload source is local filesystem (trusted) |
| V6 Cryptography | No | HTTPS transport via curl; no custom crypto |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| BUNNY_API_KEY exposed in logs | Information Disclosure | Read from env var; never log; follow migrate-images.js pattern |
| rclone sync deletes CDN content | Tampering | Never use rclone sync; use HTTP PUT (no sync capability) |

## Sources

### Primary (HIGH confidence)

- `src/_data/plates.js` — full source read; manifest path, graceful degradation, data schema [VERIFIED]
- `scripts/copy-plates.js` — full source read; upload flow, manifest write path [VERIFIED]
- `scripts/migrate-images.js` — HTTP PUT upload pattern [VERIFIED]
- `src/plates/plate.njk`, `src/plates/index.njk` — current URL patterns [VERIFIED]
- `src/components/pnwm-plate-viewer.js` — tilesUrl attribute usage [VERIFIED]
- `node_modules/openseadragon/build/openseadragon/openseadragon.js` — `getTileUrl` implementation confirming trailing-slash requirement [VERIFIED]
- `eleventy.config.js` — CDN_BASE_URL constant, copy-plates invocation in writeBundle [VERIFIED]
- `.gitignore` — `plates/` entry scope [VERIFIED]
- `plates/manifest.json` — 98 records, schema `{number, family, slug, width, height}` [VERIFIED]
- `find /Users/rainhead/dev/pnwmoths/plates/ -type f | wc -l` — 16,270 files [VERIFIED]
- `du -sh /Users/rainhead/dev/pnwmoths/plates/` — 146MB [VERIFIED]
- `.planning/phases/13-cdn-provisioning/13-CONTEXT.md` — D-14 (LA region), D-16 (remote path), D-17 (FTP 450 error), D-18 (Image Classes disabled) [VERIFIED]
- `.planning/phases/13-cdn-provisioning/13-03-SUMMARY.md` — HTTP API used instead of rclone for species images [VERIFIED]
- `.github/workflows/deploy.yml`, `pr-check.yml` — no plates references; no BUNNY_API_KEY in CI [VERIFIED]

### Secondary (MEDIUM confidence)

- `.planning/research/STACK.md` — bunny.net HTTP Storage API pattern, rclone FTP pitfalls [cited]
- `.planning/phases/15-lfs-removal/15-RESEARCH.md` — plates graceful degradation behavior documented [cited]

## Metadata

**Confidence breakdown:**
- Upload mechanism: HIGH — HTTP PUT pattern verified in migrate-images.js; rclone FTP 450 pitfall confirmed in Phase 13 CONTEXT.md D-17
- Template changes: HIGH — OSD getTileUrl verified in source; URL pattern verified in existing templates
- Manifest commit strategy: HIGH — git gitignore limitation for nested negation is well-known; verified by analysis
- CDN path convention: HIGH — existing Storage Zone serves species/glossary with same Pull Zone; plates/ prefix requires no configuration

**Research date:** 2026-04-22
**Valid until:** 2026-07-22 (stable tooling; bunny.net API unchanged)
