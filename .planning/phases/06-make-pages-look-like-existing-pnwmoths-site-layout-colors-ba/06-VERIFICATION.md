---
phase: 06-make-pages-look-like-existing-pnwmoths-site-layout-colors-ba
verified: 2026-04-15T20:00:00Z
status: passed
score: 13/13
overrides_applied: 1
overrides:
  - must_have: "All asset paths use the Eleventy | url filter for pathPrefix compatibility"
    reason: "Vite processes base paths and applies pathPrefix itself. Using | url on theme.css, header.png, and pagefind CSS caused double-prefix (/pnwmoths/pnwmoths/styles/theme.css). Hardcoded absolute paths are intentional post-Vite-fix (commit 430eb3d). Nav links still use | url correctly. Visual checkpoint approved by user."
    accepted_by: "rainhead"
    accepted_at: "2026-04-15T20:00:00Z"
---

# Phase 06: Make Pages Look Like Existing pnwmoths Site — Verification Report

**Phase Goal:** Apply the visual identity of pnwmoths.biol.wwu.edu to every page: cream background, black header/footer, moth-strip banner image, Google Fonts (Open Sans + Spinnaker), white content wrapper with box-shadow, and updated homepage content.
**Verified:** 2026-04-15T20:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

#### Plan 01: CSS Theme and Asset Pipeline

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Eleventy build copies src/styles/theme.css to _site/styles/theme.css | VERIFIED | `_site/styles/theme.css` exists (via scripts/copy-images.js post-Vite pattern) |
| 2 | Eleventy build copies src/images/header.png to _site/images/header.png | VERIFIED | `_site/images/header.png` exists (36KB PNG, 1153x78) |
| 3 | theme.css sets page background to cream (#f3e8ba) | VERIFIED | `--pico-background-color: #f3e8ba` at line 9 of src/styles/theme.css |
| 4 | theme.css sets content wrapper to white (#ffffff) with box-shadow | VERIFIED | `.content-wrapper { background-color: #ffffff; box-shadow: 0 0 15px 5px rgba(50,50,50,0.25); }` at lines 90-96 |
| 5 | theme.css sets header/footer to full-width black (#000000) | VERIFIED | `body > header, body > footer { background-color: #000000; max-width: 100%; width: 100%; }` at lines 30-38 |
| 6 | theme.css sets body font to Open Sans and heading font to Spinnaker | VERIFIED | `--pico-font-family-sans-serif: 'Open Sans', Verdana, sans-serif` (line 16) and `h1..h6 { font-family: 'Spinnaker', 'Open Sans', sans-serif; }` (line 23) |

#### Plan 02: Layout and Homepage Update

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 7 | Every page has the moth-strip banner image visible at the top | VERIFIED | `<img src="/images/header.png">` inside `<header>` in base.njk line 16 |
| 8 | Every page has a black header containing banner + nav | VERIFIED | `<header>` wraps banner `<img>` and `<nav data-pagefind-ignore>` in base.njk lines 15-26 |
| 9 | Every page has a black footer with licensing text | VERIFIED | `<footer>` with Creative Commons Attribution-NonCommercial-ShareAlike 4.0 text at base.njk lines 32-34 |
| 10 | Every page has cream background with white content wrapper | VERIFIED | theme.css provides `--pico-background-color: #f3e8ba` and `.content-wrapper { background-color: #ffffff; }`; base.njk wraps all content in `<div class="content-wrapper">` |
| 11 | Every page loads Open Sans and Spinnaker from Google Fonts | VERIFIED | Three Google Fonts link tags (2 preconnect + 1 stylesheet) at base.njk lines 7-9 |
| 12 | Homepage shows welcome paragraph and single Browse CTA link | VERIFIED | src/index.njk contains `<h1>PNW Moths</h1>`, welcome `<p>`, and standalone `<a href="{{ '/browse/' | url }}">Browse all species</a>` — no `<ul>` or `<li>` |
| 13 | All asset paths use the Eleventy `\| url` filter for pathPrefix compatibility | PASSED (override) | Override: Vite applies pathPrefix to static assets automatically. Using `\| url` caused double-prefix on theme.css, header.png, and pagefind CSS. Fixed in commit 430eb3d. Nav links correctly use `\| url`. Visual checkpoint approved by user. |

**Score:** 13/13 truths verified (1 override applied)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `eleventy.config.js` | Passthrough copy rules for src/styles and src/images | VERIFIED | Lines 30-31: `addPassthroughCopy({ "src/styles": "styles" })` and `addPassthroughCopy({ "src/images": "images" })` |
| `src/styles/theme.css` | Pico CSS custom property overrides and layout rules | VERIFIED | 97 lines; contains all design tokens, layout rules, content-wrapper, header/footer overrides |
| `src/images/header.png` | Banner image asset | VERIFIED | 36KB PNG, 1153x78 pixels, downloaded from pnwmoths.biol.wwu.edu |
| `src/_includes/base.njk` | Site-wide layout with header, banner, nav, content wrapper, footer, Google Fonts, theme.css | VERIFIED | 37-line file with all required elements |
| `src/index.njk` | Homepage with welcome text and Browse CTA | VERIFIED | 8-line file with h1, welcome paragraph, standalone Browse CTA link |
| `scripts/copy-images.js` | Copies styles and images post-Vite | VERIFIED | Extended to copy src/images/ and src/styles/ to _site/ after Vite build |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| eleventy.config.js | _site/styles/theme.css | addPassthroughCopy + copy-images.js | VERIFIED | Rule at line 30; post-Vite copy at scripts/copy-images.js lines 28-31; confirmed _site/styles/theme.css exists |
| eleventy.config.js | _site/images/header.png | addPassthroughCopy + copy-images.js | VERIFIED | Rule at line 31; post-Vite copy at scripts/copy-images.js lines 23-26; confirmed _site/images/header.png exists |
| src/_includes/base.njk | src/styles/theme.css | link rel=stylesheet href="/styles/theme.css" | VERIFIED (override) | Hardcoded path (not `\| url`) — intentional Vite fix; asset resolves correctly in dev server and build |
| src/_includes/base.njk | src/images/header.png | img src="/images/header.png" | VERIFIED (override) | Hardcoded path (not `\| url`) — intentional Vite fix; asset resolves correctly |
| src/_includes/base.njk | fonts.googleapis.com | link href in head | VERIFIED | Three Google Fonts link tags at lines 7-9 |
| src/index.njk | /browse/ | anchor href with `\| url` filter | VERIFIED | `<a href="{{ '/browse/' | url }}">Browse all species</a>` at line 8 |

### Data-Flow Trace (Level 4)

Not applicable — this phase delivers CSS, static image assets, and template markup. There is no dynamic data flow to trace.

### Behavioral Spot-Checks

| Behavior | Artifact | Result | Status |
|----------|----------|--------|--------|
| _site/styles/theme.css exists and contains Pico overrides | _site/styles/theme.css | File exists; `--pico-background-color` present | PASS |
| _site/images/header.png exists and is valid PNG | _site/images/header.png | 36KB, 1153x78 PNG | PASS |
| Generated index.html contains Google Fonts, banner, theme.css, content-wrapper, footer | _site/index.html | All five present at lines 7-9, 11, 16, 28, 35-37 | PASS |
| Generated index.html has welcome text + single Browse CTA (no ul in body) | _site/index.html | Browse CTA at line 31; no body `<ul>` | PASS |

### Requirements Coverage

No REQUIREMENTS.md entries mapped to Phase 06 (requirements: [] in both plan frontmatter blocks). Phase goal was defined directly in ROADMAP.md. All ROADMAP success criteria verified above.

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| _site/index.html | `/styles/theme.css` and `/images/header.png` lack pathPrefix | Info | Intentional — Vite applies base path to static assets. Known deviation documented in commit 430eb3d. User-approved visual checkpoint confirms correct rendering. |

No placeholder content, TODOs, stubs, or empty implementations found.

### Human Verification Required

Visual checkpoint (Plan 02 Task 3) was completed and approved by the user prior to this verification. The user ran `npx @11ty/eleventy --serve`, compared the rendered site against pnwmoths.biol.wwu.edu, and confirmed:

- Cream/tan page background
- Moth-strip banner image at top
- Black navigation bar with white link text
- White content area with subtle box-shadow
- Black footer with licensing text
- Open Sans body font, Spinnaker heading font
- Homepage welcome paragraph + single "Browse all species" link (no bullet list)

No further human verification required.

### Gaps Summary

No gaps. All 13 must-haves are either directly verified in the codebase or covered by an accepted override (the `| url` filter deviation, which is an intentional Vite-compatibility fix approved by the user via visual checkpoint).

Two preexisting issues noted in the summary (pagefind double-prefix path, similar species showing slugs) are explicitly out of scope for Phase 06 and not counted as gaps.

---

_Verified: 2026-04-15T20:00:00Z_
_Verifier: Claude (gsd-verifier)_
