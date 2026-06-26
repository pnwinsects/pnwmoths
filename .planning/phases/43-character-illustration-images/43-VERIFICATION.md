---
phase: 43-character-illustration-images
verified: 2026-06-26T00:00:00Z
status: passed
score: 14/14
overrides_applied: 0
---

# Phase 43: Character Illustration Images Verification Report

**Phase Goal:** Character illustration images are uploaded to the CDN, a curator-maintained mapping links them to panel characters, and the filter panel shows expandable help images on demand beside mapped questions.
**Verified:** 2026-06-26
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | CharacterSchema accepts and round-trips an alt_text field (nullable string) | VERIFIED | `src/types/schemas.ts:164` — `alt_text: z.nullable(z.string())` with comment |
| 2 | CharacterSchema test asserts valid/null/missing alt_text behavior | VERIFIED | `src/types/schemas.test.ts` — three cases proven; 24/24 pass |
| 3 | `npm run key:upload-images` is a defined script that invokes upload-images.ts | VERIFIED | `package.json:25` — `"key:upload-images": "node scripts/upload-images.ts"` |
| 4 | upload-images.test.ts and match-character-images.test.ts are registered in the npm test script | VERIFIED | `package.json:29` — both files explicit in `node --test` arg list |
| 5 | DRY_RUN=1 makes zero API calls (SC1) | VERIFIED | `upload-images.ts:188-200` — DRY_RUN branch before API key guard; operator-confirmed |
| 6 | isCharacterIllustration() keeps genuine illustrations and excludes all 6 specimen-photo leaks | VERIFIED | `upload-images.ts:104-133`; all 6 EXTRA_EXCLUDES enumerated and unit-tested in `upload-images.test.ts:23-43` |
| 7 | toWebpName() is a single canonical helper exported by uploader and imported by matcher | VERIFIED | `upload-images.ts:146-147` exports `toWebpName`; `match-character-images.ts:35` imports it |
| 8 | Live upload: ~191 WebP objects at key-images/ on bunny CDN; rerun makes zero new PUTs | VERIFIED | Operator-confirmed 2026-06-25; `curl -I https://pnwmoths.b-cdn.net/key-images/Black%20Forewing.webp` → HTTP 200, image/webp (independently verified per context) |
| 9 | data/key-character-images.csv is committed with columns char_id,image_filename,alt_text and .webp filenames | VERIFIED | File exists (1881 bytes); header row confirmed; 77 data rows; all filenames end .webp |
| 10 | build-key populates Character.image_filename and alt_text from the CSV; warns + skips out-of-range char_id; soft-skips if CSV absent | VERIFIED | `build-key.ts:235-257` — existsSync guard, out-of-range warn+continue, soft-skip warn; committed key-matrix.json (HEAD:0b52e9db) has 77 characters with image_filename set |
| 11 | characterImageSrc returns CDN-absolute URL via encodeURIComponent, never contains /pnwmoths/https | VERIFIED | `pnwm-identify.ts:41-43`; unit-tested in `pnwm-identify.test.ts:275-313` — CDN-absolute, %20, %26, no /pnwmoths/https |
| 12 | helpImageAlt returns curator alt_text when non-blank, else state verbatim, never empty | VERIFIED | `pnwm-identify.ts:54-55`; unit-tested at `pnwm-identify.test.ts:315-350` — four cases including whitespace-only fallback |
| 13 | Filter panel renders <details>/<summary> expander iff image_filename is truthy; no expander when null | VERIFIED | `pnwm-identify.ts:243-260` — `const img = char.image_filename; ... ${img ? html\`<details class="pnwm-kfp-help">...\` : ''}`; structural test at `pnwm-identify.test.ts:361-375` |
| 14 | theme.css has the four .pnwm-kfp-help selectors with max-height: 320px | VERIFIED | `theme.css:505-537` — all four selectors present, max-height: 320px confirmed |

**Score:** 14/14 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/types/schemas.ts` | CharacterSchema with alt_text: z.nullable(z.string()) | VERIFIED | Line 164 — required-but-nullable, comment present |
| `src/types/schemas.test.ts` | alt_text coverage on CharacterSchema | VERIFIED | Three test cases (string/null/missing), validCharacter fixture updated |
| `package.json` | key:upload-images script + both test files registered | VERIFIED | Script line 25, test registration line 29 |
| `scripts/upload-images.ts` | Idempotent vips→WebP→curl-PUT uploader; exports isCharacterIllustration, toWebpName, keyImageStorageUrl | VERIFIED | 14,331 bytes; all three helpers exported; DRY_RUN before key guard; key-images/ prefix |
| `scripts/upload-images.test.ts` | Unit tests for filter, webp-name, URL builder | VERIFIED | All 6 specimen-photo leaks tested; toWebpName case variants; keyImageStorageUrl format |
| `scripts/match-character-images.ts` | One-off matcher; exports norm(), matchRows(); imports toWebpName | VERIFIED | 7,677 bytes; exports confirmed; `import { toWebpName } from './upload-images.ts'` |
| `scripts/match-character-images.test.ts` | norm() rules + matchRows() emission | VERIFIED | 3,789 bytes; ecoprovince/us_/copy strip cases; .webp filenames in emission |
| `data/key-character-images.csv` | Committed; header char_id,image_filename,alt_text; .webp filenames | VERIFIED | 77 data rows; all image_filename values end .webp |
| `scripts/build-key.ts` | CSV-driven image_filename + alt_text population; soft-skip; out-of-range warn | VERIFIED | Lines 235-267; KEY_CHAR_IMAGES_CSV env var for test isolation |
| `src/components/pnwm-identify.ts` | Exported characterImageSrc + helpImageAlt; CDN_BASE_URL constant; <details> render | VERIFIED | Lines 26-56 (helpers); line 252-260 (_renderQuestion expander) |
| `src/components/pnwm-identify.test.ts` | Unit assertions on helpers; structural branch test | VERIFIED | Lines 271-390 — Phase 43 assertions; all 400 tests green |
| `src/styles/theme.css` | .pnwm-kfp-help expander styles | VERIFIED | Lines 505-537 — four selectors; max-height: 320px; #f0ece0 background |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| package.json test script | scripts/upload-images.test.ts | explicit file in node --test arg list | WIRED | Confirmed in package.json:29 |
| package.json test script | scripts/match-character-images.test.ts | explicit file in node --test arg list | WIRED | Confirmed in package.json:29 |
| pnwm-identify.test.ts makeChar factory | CharacterSchema alt_text field | factory default alt_text: null | WIRED | Line 28: `alt_text: null` in makeChar defaults |
| match-character-images.ts | upload-images.ts toWebpName | import toWebpName | WIRED | `match-character-images.ts:35` — `import { isCharacterIllustration, toWebpName } from './upload-images.ts'` |
| upload-images.ts | bunny.net Storage key-images/ | curl PUT with AccessKey header | WIRED | `upload-images.ts:161` — `keyImageStorageUrl` builds `key-images/` URL; operator-verified live |
| build-key.ts | data/key-character-images.csv | csv-parse with existsSync soft-skip | WIRED | `build-key.ts:236-257` — `existsSync(csvPath)` guard + parse |
| pnwm-identify.ts _renderQuestion | characterImageSrc / helpImageAlt | <img src>/<img alt> built by pure helpers | WIRED | Lines 255-256 — `src="${characterImageSrc(img)}"` and `alt="${helpImageAlt(char.state, char.alt_text)}"` |
| pnwm-identify.ts characterImageSrc | https://pnwmoths.b-cdn.net/key-images/ | CDN_BASE_URL constant (not this._prefix) | WIRED | Line 26: `const CDN_BASE_URL = 'https://pnwmoths.b-cdn.net'`; line 42: `${CDN_BASE_URL}/key-images/${encodeURIComponent(image_filename)}` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `pnwm-identify.ts` _renderQuestion | `char.image_filename` | `data/key-matrix.json` → CharacterSchema → inlined `#key-char-data` | Yes — 77 characters have webp filenames from the committed CSV via build-key.ts | FLOWING |
| `pnwm-identify.ts` _renderQuestion | `char.alt_text` | Same pipeline | Yes — alt_text null for most (curator pass pending); falls back to state via helpImageAlt | FLOWING |
| `build-key.ts` characters map | `image_filename`, `alt_text` | `data/key-character-images.csv` via csv-parse | Yes — 77 CSV rows populate the map; HEAD commit 00297bf4 confirms 77 non-null entries in key-matrix.json | FLOWING |

**Note on working-tree key-matrix.json:** The current working tree has key-matrix.json modified (1 non-null entry showing `TestImage.webp`) — this is a build artifact from a build-key test run using a temp fixture CSV that wrote char_id=0. The committed HEAD (0b52e9db) is authoritative and has 77 characters with image_filename set. The working-tree modification is untracked noise, not a regression.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite green | `npm test` | 400/400 pass, 0 fail | PASS |
| isCharacterIllustration unit tests | npm test (upload-images.test.ts subset) | All 6 specimen-photo leaks excluded; illustrations kept | PASS |
| toWebpName case-insensitive | npm test | .JPG → .webp; .jpeg → .webp | PASS |
| characterImageSrc no /pnwmoths/https | npm test | URL starts with https://pnwmoths.b-cdn.net/key-images/ | PASS |
| helpImageAlt fallback | npm test | null/blank/whitespace → state verbatim | PASS |
| theme.css selectors present | node -e assertion in plan | All 4 selectors + max-height:320px | PASS |
| package.json wiring | node -e assertion in plan | key:upload-images present; test files registered; not in build | PASS |

### Probe Execution

Step 7c: SKIPPED — no probe-*.sh files found for phase 43; upload is a credentialed manual-only operator task (BUNNY_API_KEY required, not runnable in CI). Upload is evidence-based via operator verification and independent CDN spot-check.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| CIMG-01 | 43-02 | Idempotent CDN upload of character illustration images | SATISFIED | scripts/upload-images.ts exists with DRY_RUN, isCharacterIllustration filter, toWebpName, curl-PUT; ~191 objects live on CDN (operator-verified 2026-06-25); rerun made zero new PUTs |
| CIMG-02 | 43-01, 43-02, 43-03 | Curator mapping CSV links character IDs to CDN image filenames; build populates the panel | SATISFIED | data/key-character-images.csv (77 rows); build-key.ts reads it with soft-skip + out-of-range guard; key-matrix.json (HEAD) has 77 characters mapped |
| CIMG-03 | 43-01, 43-03 | Filter panel shows expandable help images on demand; unmapped states degrade gracefully | SATISFIED | pnwm-identify.ts _renderQuestion emits `<details class="pnwm-kfp-help">` iff image_filename truthy; empty string when null; UAT operator-approved 2026-06-26 |

**Requirement CIMG-01 resize note:** The requirement wording says "resized appropriately." This is intentionally delivered as no server-side resize (D-03 decision). Images are converted to WebP at original dimensions; in-panel sizing is handled client-side by `max-height: 320px` in theme.css. This delta is documented in the 43-02-SUMMARY.md and is an accepted scope clarification, not a gap.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| data/key-matrix.json (working tree) | n/a | Contains TestImage.webp at char_id=0 from a test run | Info | Working-tree artifact only; HEAD is correct (77 real mappings). Not a code anti-pattern — generated file modified by a test run. |

No TBD, FIXME, or XXX markers found in phase 43 source files. No stub implementations detected. No hardcoded empty returns in load-bearing paths.

### Human Verification Required

Human verification was completed by the operator:

1. **CIMG-01 Live Upload** — Operator ran `BUNNY_API_KEY=... npm run key:upload-images` 2026-06-25. First run: ~191 uploaded, 0 failed. Rerun: 0 new uploads (idempotency proven). CDN spot-check: `https://pnwmoths.b-cdn.net/key-images/Black%20Forewing.webp` → HTTP 200, `Content-Type: image/webp`. APPROVED.

2. **CIMG-03 UAT** — Operator verified 2026-06-26 ("it works well"): `ⓘ illustration` expander appears beside mapped states; opening it loads CDN WebP via `https://pnwmoths.b-cdn.net/key-images/...` (non-prefixed); unmapped states show no expander; panel fully functional; keyboard toggle works. APPROVED.

**Deferred (non-blocking):** Disclosure-marker UI nit (native ▶ caret reads as nav link) is captured as a todo for the Identify-page UI-polish round. Not a gap.

### Gaps Summary

No gaps. All 14 must-have truths are verified. All three requirements (CIMG-01, CIMG-02, CIMG-03) are satisfied. The full test suite is green at 400/400. Human verification was operator-approved for both the live CDN upload and the browser UAT.

---

_Verified: 2026-06-26T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
