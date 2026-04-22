---
phase: 13-cdn-provisioning
verified: 2026-04-22T20:30:00Z
status: human_needed
score: 3/4 must-haves verified
overrides_applied: 2
overrides:
  - must_have: "A browser request using an Image Class (glossary portrait crop, nav thumbnail) returns correct dimensions without width/height HTML attributes (SC-2)"
    reason: "D-18 (locked decision): bunny.net Image Classes are disabled on the Pull Zone Optimizer. Root cause was 403 for all requests when Image Classes were enabled. bunny.net support disabled them. Direct Optimizer query params (?width=188&height=225&crop_gravity=north, ?height=186) produce the same resize/crop result. CONTEXT.md D-10, D-11, D-18 are authoritative."
    accepted_by: "project owner (key_context)"
    accepted_at: "2026-04-22T00:00:00Z"
  - must_have: "CDN_BASE_URL is set as a secret in the GitHub Actions repository settings; the deploy workflow can read it as an environment variable (SC-3 / CDN-03)"
    reason: "D-01 (locked decision): CDN_BASE_URL is a public hard-coded constant in eleventy.config.js. No secret is needed because the URL is intentionally public. CONTEXT.md D-01, D-02, D-03 are authoritative. GitHub Actions workflows are correct as-is (no CDN secret configured)."
    accepted_by: "project owner (key_context)"
    accepted_at: "2026-04-22T00:00:00Z"
gaps:
  - truth: "A browser request to {CDN_BASE_URL}/{slug}/{filename} returns a 200 with Content-Type: image/webp (SC-1)"
    status: partial
    reason: "CDN delivers HTTP 200 and Optimizer resize/crop params work correctly, but Content-Type is image/jpeg not image/webp. WebP conversion is not currently active on the Optimizer. Confirmed by direct curl verification. Noted in 13-05-SUMMARY.md as a known deviation."
    artifacts:
      - path: "https://pnwmoths.b-cdn.net/"
        issue: "Optimizer returns image/jpeg instead of image/webp. WebP conversion needs to be enabled in bunny.net Pull Zone Optimizer settings."
    missing:
      - "Enable WebP conversion in bunny.net Optimizer settings (Pull Zone → Optimizer tab → WebP conversion toggle)"
human_verification:
  - test: "Confirm Optimizer resize produces correct pixel dimensions"
    expected: "A request to https://pnwmoths.b-cdn.net/acronicta-americana/Acronicta%20americana-A-D.jpg?height=186 returns an image that is 186 px tall (auto-width). Verify in browser Network tab: image element displays at correct dimensions."
    why_human: "curl -sI returns headers but cannot verify actual pixel dimensions of the response body. Dimension correctness requires image rendering in a browser or an image decode tool."
  - test: "Confirm Optimizer crop produces correct pixel dimensions for glossary portrait"
    expected: "A request to https://pnwmoths.b-cdn.net/acronicta-americana/Acronicta%20americana-A-D.jpg?width=188&height=225&crop_gravity=north returns a 188×225 px image cropped from the top."
    why_human: "Same reason — pixel dimensions require image decode, not just header inspection."
---

# Phase 13: CDN Provisioning Verification Report

**Phase Goal:** Images are served from bunny.net CDN with the Optimizer active; collaborators have a documented workflow to upload originals; GitHub Actions has the CDN secret
**Verified:** 2026-04-22T20:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC-1 | Browser request to CDN URL returns HTTP 200 with `Content-Type: image/webp` (Optimizer active) | PARTIAL | HTTP 200 confirmed via curl. Optimizer resize/crop params work (dimensions correct per 13-05-SUMMARY). Content-Type is `image/jpeg` not `image/webp` — WebP conversion not active. |
| SC-2 | Image Class request (glossary portrait, nav thumbnail) returns correct dimensions | PASSED (override) | D-18 locked decision: Image Classes disabled by bunny.net support. Direct query params `?width=188&height=225&crop_gravity=north` and `?height=186` replace Image Class names. HTTP 200 confirmed for both param variants. |
| SC-3 | `CDN_BASE_URL` set as GitHub Actions secret; deploy workflow reads it as env var | PASSED (override) | D-01 locked decision: CDN_BASE_URL is a hard-coded public constant in `eleventy.config.js` line 14. No secret needed. Workflows confirmed: no CDN secret wired (correct outcome). |
| SC-4 | `_instructions/` contains contributor upload doc covering rclone FTP, copy vs sync, --ignore-times, cache invalidation | VERIFIED | `_instructions/UPLOADING_IMAGES.md` exists (110 lines). Contains all required topics — see artifact detail below. |

**Score:** 3/4 truths verified (2 overrides applied, 1 partial gap, 1 awaiting human dimension check)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `eleventy.config.js` | CDN_BASE_URL hard-coded constant | VERIFIED | Line 14: `const CDN_BASE_URL = "https://pnwmoths.b-cdn.net";` — no process.env, no dotenv |
| `scripts/build-data.js` | Widened filename regex accepting spaces | VERIFIED | Lines 76, 82: `/^[a-zA-Z0-9 ._-]+$/` — both validation loops updated |
| `scripts/migrate-images.js` | One-time migration script (ESM, DRY_RUN, rclone copy, glossary handling) | VERIFIED | 345 lines. DRY_RUN=1 present (line 44). `import.meta.url` guard at line 340. Glossary handling at lines 215–235. No `rclone sync` found. |
| `data/images.csv` | Rebuilt image manifest with original Django filenames, 3880+ rows | VERIFIED | 3880 data rows + header (3881 lines). All rows have `CC BY-NC-SA 4.0` license. Sample filenames: `Abagrotis apposita-A-D.jpg` (spaces confirmed). |
| `_instructions/UPLOADING_IMAGES.md` | Contributor upload workflow doc | VERIFIED | 110 lines. Contains: rclone FTP setup, `rclone copy --ignore-times`, WARNING section for rclone sync, `api.bunny.net/purge` cache invalidation, credential request flow. |
| `.planning/phases/13-cdn-provisioning/13-CONTEXT.md` | D-18 documenting Image Classes disabled, direct query params mandated | VERIFIED | D-10, D-11, D-18 all present. D-18 includes "Do not re-enable Image Classes" warning and Phase 14 implications. |
| `~/.config/rclone/rclone.conf` | rclone FTP remote named 'bunny' | NOT VERIFIED | Developer-local file outside repo — cannot verify programmatically. 13-03-SUMMARY.md documents upload of 3880 images which requires rclone to have been configured. CDN delivery at HTTP 200 provides strong indirect evidence. |
| bunny.net CDN (live) | Storage Zone + Pull Zone + Optimizer active, images serving HTTP 200 | VERIFIED | curl confirms HTTP 200 for species photo. Optimizer resize (?height=186) and crop (?width=188&height=225&crop_gravity=north) both return HTTP 200. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `eleventy.config.js` | Phase 14 templates | `CDN_BASE_URL` constant exportable | WIRED | Constant defined at module scope (line 14). Phase 14 can import via `import { CDN_BASE_URL }` from eleventy.config.js or via `addGlobalData`. |
| `scripts/build-data.js` | `data/images.csv` | widened regex accepting spaces | WIRED | Regex at lines 76 and 82 accepts spaces. `npm test` passes (72/72). `npm run build:data` exits 0 (confirmed via 13-02-SUMMARY). |
| `scripts/migrate-images.js` | `data/images.csv` | `writeFile` at end of main() | WIRED | images.csv contains 3880 rows — evidence script ran successfully. |
| `_instructions/UPLOADING_IMAGES.md` | bunny.net FTP + Purge API | rclone config + curl commands | WIRED | Doc contains verbatim rclone copy command and curl purge API command with correct endpoint. |
| bunny.net Pull Zone | Optimizer | direct query params | WIRED | HTTP 200 confirmed for ?height=186 and ?width=188&height=225&crop_gravity=north. |

### Data-Flow Trace (Level 4)

Not applicable — this phase provisions infrastructure and documentation, not UI components that render dynamic data. `data/images.csv` is a data output (not a rendering component), and CDN delivery is verified via live HTTP spot-checks above.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| CDN delivers species photo HTTP 200 | `curl -sI "https://pnwmoths.b-cdn.net/acronicta-americana/Acronicta%20americana-A-D.jpg"` | HTTP/2 200, content-type: image/jpeg | PASS (HTTP 200; WebP gap noted separately) |
| Optimizer resize (?height=186) HTTP 200 | `curl -sI "...?height=186"` | HTTP/2 200, content-type: image/jpeg | PASS |
| Optimizer crop (?width=188&height=225) HTTP 200 | `curl -sI "...?width=188&height=225&crop_gravity=north"` | HTTP/2 200, content-type: image/jpeg | PASS |
| Build pipeline passes | `npm test` | 72/72 pass | PASS |
| Optimizer resize correct pixel dimensions | Browser Network tab inspection | Not verified programmatically | SKIP — human verification required |
| Optimizer crop correct pixel dimensions | Browser Network tab inspection | Not verified programmatically | SKIP — human verification required |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| CDN-01 | 13-01, 13-02, 13-03 | Storage Zone created; images uploaded; Pull Zone configured | SATISFIED | HTTP 200 from CDN. 3880 images in images.csv. Pull Zone at pnwmoths.b-cdn.net confirmed. |
| CDN-02 | 13-03, 13-05 | Bunny Optimizer enabled; Image Classes defined; verified in browser | PARTIALLY SATISFIED | Optimizer active (resize/crop HTTP 200). Image Classes disabled (D-18 override). WebP not active. Browser dimension verification still needed. |
| CDN-03 | 13-01 (via D-01/D-03) | CDN_BASE_URL wired into codebase / workflows | SATISFIED (superseded) | D-01 locked: CDN_BASE_URL is hard-coded constant in eleventy.config.js, not a GitHub secret. Requirement revised by D-03. No secret in workflows — correct. |
| CDN-04 | 13-04 | Contributor upload workflow documented | SATISFIED | `_instructions/UPLOADING_IMAGES.md` covers all five D-13 topics. |

### Anti-Patterns Found

No blocking anti-patterns detected in phase artifacts.

| File | Pattern | Severity | Assessment |
|------|---------|----------|-----------|
| `data/images.csv` — photographer column | Blank for all 4139 species rows (glossary rows too) | Warning | Intentional — documented in 13-02-SUMMARY.md as Deviation #3. Requires full species.csv with Django IDs to populate via primary join path. Not blocking for Phase 14. |
| `content-type: image/jpeg` | WebP conversion not active on CDN Optimizer | Warning | Noted in 13-05-SUMMARY.md. Resize/crop work correctly. WebP should be enabled before site goes live (Phase 15 gate). Not blocking for Phase 14 template wiring. |

### Human Verification Required

#### 1. Optimizer Resize — Pixel Dimensions

**Test:** Open `https://pnwmoths.b-cdn.net/acronicta-americana/Acronicta%20americana-A-D.jpg?height=186` in an incognito browser window. Open Network tab before loading.
**Expected:** Image loads (not broken), Network tab shows Status 200. Inspect the image element or use a browser image inspector to confirm the rendered height is 186 px (width proportional).
**Why human:** curl confirms HTTP 200 and image/jpeg content-type but cannot decode image pixel dimensions. Only a browser render or image decode tool can confirm the Optimizer applied the correct resize.

#### 2. Optimizer Crop — Pixel Dimensions (Glossary Portrait)

**Test:** Open `https://pnwmoths.b-cdn.net/acronicta-americana/Acronicta%20americana-A-D.jpg?width=188&height=225&crop_gravity=north` in an incognito browser window. Open Network tab before loading.
**Expected:** Image loads (not broken), Status 200. Image should appear portrait-shaped (taller than wide, approximately 188×225 px). The crop should cut from the top of the source image.
**Why human:** Same reason — pixel dimensions and crop behavior require visual confirmation.

### Gaps Summary

**One gap: WebP conversion not active.**

SC-1 requires `Content-Type: image/webp`. The CDN delivers HTTP 200 and the Optimizer resize/crop params work, but WebP conversion is inactive — all responses have `Content-Type: image/jpeg`. This was noted in 13-05-SUMMARY.md as a known deviation. The fix is to enable "WebP conversion" in the bunny.net Pull Zone Optimizer settings. This does not block Phase 14 (templates use the same URL patterns regardless of output format) but should be resolved before Phase 15 (LFS removal) when CDN becomes the sole image source.

**Two overrides applied (locked decisions):**

- SC-2 (Image Classes): Superseded by D-18. Image Classes disabled; direct Optimizer query params achieve the same result. CONTEXT.md is authoritative.
- SC-3 (GitHub Actions secret): Superseded by D-01. CDN_BASE_URL is a public constant, not a secret. No GitHub secret required or configured.

---

_Verified: 2026-04-22T20:30:00Z_
_Verifier: Claude (gsd-verifier)_
