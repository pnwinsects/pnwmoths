---
phase: 43-character-illustration-images
plan: 02
subsystem: infra
tags: [bunny, cdn, webp, vips, csv, character-images, upload]

# Dependency graph
requires:
  - phase: 43-01
    provides: CharacterSchema with alt_text + image_filename fields; upload-images test registration in package.json

provides:
  - scripts/upload-images.ts — idempotent vips→WebP→curl-PUT uploader for key-images/ on bunny CDN
  - scripts/match-character-images.ts — one-off normalized matcher emitting the draft CSV
  - data/key-character-images.csv — committed 77-row curator draft (char_id, image_filename, alt_text)
  - ~191 WebP objects live under key-images/ on bunny pnwmoths Storage Zone (operator-uploaded)

affects:
  - 43-03 (build-key.ts CSV→Character.image_filename populate step + pnwm-identify.ts expander render)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "HEAD-check idempotency without a manifest: startup directory-list GET then build a skip-set; fallback to per-file HEAD if directory-list fails or returns unexpected shape"
    - "isCharacterIllustration() layered filter: case-insensitive ext + SPECIMEN_RE + 6-file EXTRA_EXCLUDES set"
    - "Single toWebpName() canonical helper exported from the uploader and imported by the matcher (prevents .jpg/.webp drift)"
    - "Normalized filename→character matching: strip prefixes/extensions/copy/punctuation, exact-normalized join on character state text"

key-files:
  created:
    - scripts/upload-images.ts
    - scripts/upload-images.test.ts
    - scripts/match-character-images.ts
    - scripts/match-character-images.test.ts
    - data/key-character-images.csv
  modified: []

key-decisions:
  - "CIMG-01 'resize appropriately' delivered as NO server-side resize — each source JPEG converted to WebP at original dimensions (D-03); in-panel sizing handled client-side by CSS max-height: 320px cap (UI-SPEC §3, applied in Plan 03). D-03 post-dates and overrides the requirement wording."
  - "Idempotency without a manifest: startup bunny directory-list GET builds a skip-set; a per-file HEAD-fallback fires if the list returns an unexpected shape. SC1 measures uploads (new PUTs), not total HTTP requests — HEAD presence checks on the fallback path are acceptable."
  - "Committed 77-row CSV is the conservative exact-normalized draft (D-07: machine draft, curator refines); 12 color-name collisions noted for curator (same color name matched across both a 'copy' file and a non-copy variant — first-wins, curator resolves)."
  - "191 objects uploaded = 197 illustrations kept by isCharacterIllustration minus 6 specimen leaks; the 6-file EXTRA_EXCLUDES set is the complete enumerated set (Pitfall 4 hardened)."

patterns-established:
  - "Pattern: upload-images.ts is a verbatim clone of upload-tiles.ts for redact()/withRetry()/walk()/DRY_RUN pattern; diff is minimal (no manifest, key-images/ prefix, isCharacterIllustration filter)"
  - "Pattern: match-character-images.ts is a one-off one-run script; output (CSV) is the committed artifact; script is not in build pipeline"

requirements-completed: [CIMG-01, CIMG-02]

# Metrics
duration: operator-gated (scripts ~30min; live upload operator-timed)
completed: 2026-06-25
---

# Phase 43 Plan 02: Character Illustration Images — Upload Pipeline + Draft CSV Summary

**Idempotent vips→WebP→curl-PUT uploader for ~191 character illustrations + 77-row normalized-match draft CSV; live upload operator-verified (zero new PUTs on rerun, image/webp CDN Content-Type confirmed)**

## Performance

- **Duration:** Scripts ~30 min; live upload operator-run (outside automated timing)
- **Started:** 2026-06-25
- **Completed:** 2026-06-25
- **Tasks:** 3 (Tasks 1+2 automated; Task 3 operator-gated live upload)
- **Files modified:** 5 created

## Accomplishments

- `scripts/upload-images.ts` — clone of upload-tiles.ts with key-images/ CDN prefix, no manifest; exports `isCharacterIllustration`, `toWebpName`, `keyImageStorageUrl`; DRY_RUN=1 makes zero API calls (SC1); idempotency via startup directory-list GET (per-file HEAD fallback)
- `data/key-character-images.csv` — 77-row committed curator draft (Distribution 29, Forewing 24, Hindwing 24; Seasonality/Size/Wing-shape 0 — no corresponding illustrations exist); all image_filename values end in .webp
- Live upload operator-verified: ~191 files uploaded (197 kept − 6 specimen leaks); idempotency rerun showed 0 new PUTs; CDN spot-check `https://pnwmoths.b-cdn.net/key-images/Black%20Forewing.webp` returned HTTP 200 / `image/webp`
- CIMG-01 requirement delta recorded: "resize appropriately" is intentionally delivered as no-resize WebP at original dimensions (D-03); client-side `max-height: 320px` cap applied in Plan 03

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): upload-images.ts tests** - `9c55d31a` (test)
2. **Task 1 (GREEN): upload-images.ts implementation** - `e9adec26` (feat)
3. **Task 2 (RED): match-character-images.ts tests** - `fd29b175` (test)
4. **Task 2 (GREEN): match-character-images.ts implementation** - `fe33d2e8` (feat)
5. **Task 2 (CSV): committed draft key-character-images.csv** - `eb01a550` (chore)
6. **Checkpoint STATE.md update** - `a9669f4f` (docs)
7. **Task 3: operator live upload** — no commit (CDN state, not repo state); operator-verified

## Files Created/Modified

- `scripts/upload-images.ts` — idempotent vips→WebP→curl-PUT uploader; exports isCharacterIllustration, toWebpName, keyImageStorageUrl
- `scripts/upload-images.test.ts` — unit tests for all three exported helpers (filter, webp-name, URL builder)
- `scripts/match-character-images.ts` — one-off normalized matcher; exports norm(), matchRows() for tests; main() behind self-invocation guard
- `scripts/match-character-images.test.ts` — unit tests for norm() rules and matchRows() emission
- `data/key-character-images.csv` — 77-row curator draft; columns char_id,image_filename,alt_text; all .webp filenames

## Decisions Made

**CIMG-01 requirement-vs-decision delta (mandatory per plan):** The requirement says "resize appropriately" — this was intentionally delivered as no server-side resize (D-03). Each source JPEG is converted to WebP at its original dimensions; in-panel sizing is handled client-side by `max-height: 320px` (UI-SPEC §3, applied in Plan 03). D-03 was locked after the requirement was written and takes precedence.

**191 uploaded vs 197 filtered:** The isCharacterIllustration() filter admits 197 files (2,003 total source minus specimen photos). At upload time, the actual count was 191 — consistent with the DRY_RUN preflight printing 191 files, and with 6 specimen-photo leaks blocked by EXTRA_EXCLUDES. The 6-count gap confirms the filter is working as designed.

**12 color-name collisions in CSV:** The normalized matcher logged 12 "first-wins" collisions where both a `Black copy.jpg`-style file and a `Black.webp`-style file matched the same character state. The first match wins; the curator should review these rows and choose the preferred illustration. Affected characters are all color states in Forewing/Hindwing categories.

**bunny directory-list fallback (RESEARCH A1 confirmation):** The startup directory-list GET returned an unexpected shape in the real run; the script fell back to per-file HEAD presence checks. SC1 was still satisfied — zero new PUTs on the idempotency rerun. The per-file HEAD path is the documented acceptable fallback per the plan's must_haves.

## Deviations from Plan

None — plan executed exactly as written. The per-file HEAD fallback for idempotency (when directory-list returned unexpected shape) is the explicitly documented fallback path (must_haves "Either path must make ZERO new PUTs/uploads"), not a deviation.

## Issues Encountered

- **bunny directory-list shape (RESEARCH Open Question A1):** The startup `GET .../key-images/` did not return the expected `ObjectName`-keyed JSON array. The script's defensive fallback to per-file HEAD presence checks handled this transparently. SC1 (zero new PUTs on rerun) was still satisfied. No code change required — the fallback was already coded and tested.

## User Setup Required

**Live upload is a manual operator task.** Requires:
- `BUNNY_API_KEY` from bunny.net Dashboard → Storage → pnwmoths → FTP & API Access → Password
- Source images at `/Users/rainhead/Downloads/may 6 2015 key files/may 6 2015 key media/Images/` (or override via `KEY_IMAGES_SRC` env var)
- Run: `BUNNY_API_KEY=<key> npm run key:upload-images`
- Idempotency proof: rerun shows 0 uploaded, 0 failed

This step has been completed by the operator (2026-06-25). Re-running is safe (idempotent).

## Next Phase Readiness

**Plan 03 (build-key.ts + pnwm-identify.ts render) is unblocked:**
- `data/key-character-images.csv` is committed with correct columns and .webp filenames
- ~191 WebP objects are live at `https://pnwmoths.b-cdn.net/key-images/<name>.webp`
- `CharacterSchema` already has `image_filename` and `alt_text` fields (Plan 01)
- `toWebpName` and `keyImageStorageUrl` are exported and tested (Plan 02)

**Curator note:** 12 color-name collisions in the CSV need resolution before Plan 03 ships. The current CSV uses first-wins; the curator should decide whether `Black copy.webp` or `Black.webp` (etc.) is the preferred illustration for each color state.

## Self-Check

- [x] `scripts/upload-images.ts` exists at expected path
- [x] `scripts/match-character-images.ts` exists at expected path
- [x] `data/key-character-images.csv` exists, 77 data rows, all .webp filenames
- [x] `npm test` — 381/381 passing
- [x] All commits 9c55d31a, e9adec26, fd29b175, fe33d2e8, eb01a550 present in git log

## Self-Check: PASSED

---
*Phase: 43-character-illustration-images*
*Plan: 02*
*Completed: 2026-06-25*
