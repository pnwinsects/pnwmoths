---
status: complete
phase: 30-bunny-net-upload-of-tile-pyramids-bulk
source: [30-01-SUMMARY.md, 30-02-SUMMARY.md]
started: 2026-05-23T19:00:00.000Z
updated: 2026-05-23T19:00:00.000Z
---

## Current Test

[testing complete]

## Tests

### 1. DRY_RUN preview — no API key required, shows CDN URLs with lowercase slugs
expected: |
  Run `DRY_RUN=1 npm run photos:upload` (no BUNNY_API_KEY needed).
  You should see:
    [upload-tiles] manifest: NNNN rows total; NNNN eligible (status=tiled)
    [upload-tiles] DRY_RUN=1 — printing first 5 upload plans, not uploading
      slug: <lowercase-slug>  pair: <specimen_id>-<view>
        CDN URL: https://pnwmoths.b-cdn.net/species-tiles/<slug>/<pair>/
        Files to upload: N (N-1 tiles + 1 .dzi)
    ...
  The command exits 0. No manifest changes, no tile deletions, no BUNNY_API_KEY prompt.
result: pass

### 2. Missing API key guard — exits 1 with helpful error
expected: |
  Run `npm run photos:upload` with no DRY_RUN and no BUNNY_API_KEY set.
  You should see this on stderr:
    [upload-tiles] BUNNY_API_KEY is required. Set it to your bunny.net Storage Zone password.
  Exit code is 1 (non-zero). No manifest writes, no uploads attempted.
result: pass

### 3. Full test suite — 191 tests pass, 0 failures
expected: |
  Run `npm test`.
  Final output should include:
    ℹ pass 191
    ℹ fail 0
  The new upload-tiles.test.js contributes 9 tests across 3 describe blocks
  (tileUploadPath, tilePullZoneUrl, isUploadable).
result: pass

### 4. Operator runbook completeness — 9 sections, accurate CLI strings
expected: |
  Open `_instructions/UPLOADING_TILES.md`.
  It should have these 9 ## sections in order:
    What This Changes, Prerequisites, Configuration, Run the Dry-Run Preview,
    Run the Full Pipeline, Resume After Interruption, When Things Go Wrong,
    Verification, Next Phase Handoff
  The DRY_RUN output block in section 4 should match what you actually see from test 1.
  The pre-flight footprint format is in section 5.
  Section 8 (Verification) includes `curl -I https://pnwmoths.b-cdn.net/species-tiles/...`
  as the SC-4 spot-check. No references to maderas or /var/lib/pnwmoths anywhere.
result: pass

## Summary

total: 4
passed: 4
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
