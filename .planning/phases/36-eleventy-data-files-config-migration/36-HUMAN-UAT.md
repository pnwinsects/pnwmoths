---
status: complete
phase: 36-eleventy-data-files-config-migration
source: [36-VERIFICATION.md]
started: 2026-06-09
updated: 2026-06-10
---

# Phase 36 — Human UAT

All automated success criteria (SC-1, SC-2, SC-4, and the build-output portion of SC-3)
are VERIFIED. The one remaining item is a live dev-server smoke test that cannot run headless.

## Current Test

[awaiting human testing]

## Tests

### 1. SC-3 — Local dev server (`npm run dev`) pathPrefix `/`

expected: Run `npm run dev`, open `http://localhost:8080/species/abagrotis-apposita/`
(or any species page) in a browser. First-party asset URLs (JS/CSS/images) resolve under
`/` with no `/pnwmoths/` double-prefix and no first-party 404s. The page renders normally.

Note: the **built output** of this branch is already verified — a local `npm run build`
(no `GITHUB_PAGES`) emits assets under `/` with zero `/pnwmoths/` occurrences, and `_site/`
is byte-identical to the local-built `_site_baseline/`. This UAT item covers only the live
`eleventy --serve` runtime path (the `eleventy.after` serve-mode `execFile` hook), which the
static build gate does not exercise.

result: pass (verified via /gsd-verify-work 2026-06-10 — npm run dev serves species pages with `/` pathPrefix, no double-prefix, no first-party 404s)

## Summary

total: 1
passed: 1
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
