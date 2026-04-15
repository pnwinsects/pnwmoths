---
phase: 06-make-pages-look-like-existing-pnwmoths-site-layout-colors-ba
plan: "01"
subsystem: styling
tags: [css, eleventy, theme, pico-css, assets]
dependency_graph:
  requires: []
  provides: [src/styles/theme.css, src/images/header.png, eleventy passthrough rules for styles+images]
  affects: [scripts/copy-images.js, eleventy.config.js]
tech_stack:
  added: []
  patterns: [post-vite asset copy via scripts/copy-images.js]
key_files:
  created:
    - src/styles/theme.css
    - src/images/header.png
  modified:
    - eleventy.config.js
    - scripts/copy-images.js
decisions:
  - "Extended copy-images.js to handle src/styles and src/images post-Vite (Rule 3 fix: passthrough copies don't survive eleventy-plugin-vite's rename-to-temp-then-empty-outdir pattern)"
metrics:
  duration: "3m"
  completed: "2026-04-15T19:00:41Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 2
---

# Phase 06 Plan 01: CSS Theme and Asset Pipeline Summary

**One-liner:** Pico CSS overrides (cream background, olive accent, Open Sans/Spinnaker fonts) plus banner image asset pipeline using post-Vite copy script pattern.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add passthrough rules and download banner image | ccf9857 | eleventy.config.js, scripts/copy-images.js, src/images/header.png |
| 2 | Create theme.css with Pico CSS overrides and layout rules | 43e1f4c | src/styles/theme.css |

## Outcome

- `src/styles/theme.css` created with all Pico CSS design token overrides
- `src/images/header.png` downloaded from pnwmoths.biol.wwu.edu (36KB PNG, 1153x78)
- `eleventy.config.js` has `addPassthroughCopy` rules for `src/styles` and `src/images`
- After `npx @11ty/eleventy && node scripts/copy-images.js`, both `_site/styles/theme.css` and `_site/images/header.png` exist

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Passthrough copies do not survive eleventy-plugin-vite build**

- **Found during:** Task 1 verification
- **Issue:** The `eleventy-plugin-vite` plugin renames `_site/` to `.11ty-vite/`, runs Vite with `emptyOutDir: true` into a fresh `_site/`, then removes the temp folder. Files placed by Eleventy's `addPassthroughCopy` (like `_site/images/header.png`) are present in the renamed temp folder but not re-emitted by Vite (since they aren't referenced in HTML). The project already acknowledged this in `scripts/copy-images.js` comments for species photos.
- **Fix:** Extended `scripts/copy-images.js` to also copy `src/images/ -> _site/images/` (banner) and `src/styles/ -> _site/styles/` (theme CSS) after the Vite build. This follows the existing pattern — the `build:copy-images` npm script already runs post-Vite in the full build pipeline.
- **Files modified:** `scripts/copy-images.js`
- **Commit:** ccf9857

The `addPassthroughCopy` rules in `eleventy.config.js` are still correct and useful for Eleventy dev server mode; the post-Vite copy handles production builds.

## Known Stubs

None — `src/styles/theme.css` contains all specified design tokens and layout rules. `src/images/header.png` is the real banner image from the live site. No placeholder content.

## Threat Flags

None. The banner image download (T-06-01) is a one-time curl to a publicly available static asset, committed to repo. No runtime download.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| src/styles/theme.css exists | FOUND |
| src/images/header.png exists | FOUND |
| _site/styles/theme.css exists | FOUND |
| _site/images/header.png exists | FOUND |
| commit ccf9857 exists | FOUND |
| commit 43e1f4c exists | FOUND |
