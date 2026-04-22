---
phase: 13-cdn-provisioning
plan: "04"
subsystem: cdn-documentation
tags: [cdn, bunny-net, documentation, contributor-workflow]
dependency_graph:
  requires:
    - 13-03 (CDN provisioning and image upload)
  provides:
    - _instructions/UPLOADING_IMAGES.md (contributor-facing rclone upload guide)
  affects:
    - Phase 14 (CDN spot-check gate; CONTEXT.md decisions D-10, D-11, D-18)
key_files:
  created:
    - _instructions/UPLOADING_IMAGES.md
  modified: []
decisions:
  - Task 2 (CDN spot-check checkpoint) was superseded by Plan 13-05 — the spot-check was blocked by a 403 during Plan 03 execution, which was resolved by bunny.net support disabling Image Classes
metrics:
  completed: "2026-04-22"
  tasks_completed: 1/2
  tasks_superseded: 1
---

# Phase 13 Plan 04: Summary

**One-liner:** Contributor upload doc written; CDN spot-check deferred to Plan 05 (was blocked by Image Classes 403 that required bunny.net support intervention).

## Tasks Completed

| Task | Name | Status |
|------|------|--------|
| 1 | Write _instructions/UPLOADING_IMAGES.md | Done |
| 2 | Spot-check CDN delivery end-to-end | Superseded by Plan 13-05 |

## What Was Built

### _instructions/UPLOADING_IMAGES.md

Contributor-facing guide covering:
- How to request Storage Zone password and account API key from the project owner
- rclone FTP remote setup for bunny.net (LA region: `la.storage.bunnycdn.com`)
- `rclone copy --ignore-times` for new and replacement uploads (one file at a time — directory uploads cause 450 errors)
- Cache invalidation via `curl` to `api.bunny.net/purge`
- Prominent WARNING: never use `rclone sync`

## Deviations from Plan

### CDN spot-check deferred to Plan 13-05

The Task 2 checkpoint (CDN spot-check) was blocked by the same 403 that stopped Plan 03. bunny.net support resolved the issue by disabling Image Classes on the Optimizer. The spot-check runs in Plan 13-05 once the fix is confirmed. Plan 04 is considered complete with Task 1 done; Task 2 is superseded.

## Known Issues

None. The 403 blocker that caused Task 2 to be deferred was resolved by bunny.net support before Plan 13-05 was executed.
