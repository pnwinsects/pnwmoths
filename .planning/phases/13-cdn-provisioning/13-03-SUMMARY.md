---
phase: 13-cdn-provisioning
plan: "03"
subsystem: cdn-infrastructure
tags: [cdn, bunny-net, storage-zone, pull-zone, optimizer, image-classes, upload]
dependency_graph:
  requires:
    - 13-01 (CDN_BASE_URL constant in eleventy.config.js)
    - 13-02 (migrate-images.js script + data/images.csv rebuilt)
  provides:
    - bunny.net Storage Zone pnwmoths with 3880 images uploaded
    - bunny.net Pull Zone pnwmoths (403 issue pending support ticket)
    - Bunny Optimizer enabled with WebP conversion
    - Image Classes glossaryportrait and navthumb defined
  affects:
    - Phase 13 Plan 04 (CDN delivery spot-check blocked on 403)
    - Phase 14 (template migration requires CDN delivering images)
    - Phase 15 (LFS removal requires CDN live)
key_files:
  created: []
  modified: []
decisions:
  - Upload used bunny.net HTTP Storage API (not rclone FTP) — rclone FTP had concurrent rename issues (D-17)
  - Image Class names are glossaryportrait and navthumb — bunny.net rejects hyphens in class names (D-10, D-11)
  - FTP hostname is la.storage.bunnycdn.com (LA region) not ny (D-14)
metrics:
  completed: "2026-04-22"
  tasks_completed: 2/3
  files_uploaded: 3880
---

# Phase 13 Plan 03: CDN Provisioning Summary

**One-liner:** Storage Zone provisioned and 3880 images uploaded via HTTP API; Pull Zone exists but returns 403 (bunny.net support ticket filed); Optimizer and Image Classes configured.

## Tasks Completed

| Task | Name | Status |
|------|------|--------|
| 1 | Create Storage Zone and Pull Zone | Done |
| 2 | Enable Optimizer and define Image Classes | Done |
| 3 | Upload images and verify CDN delivery | Partial — upload done, CDN delivery blocked |

## What Was Built

### Storage Zone + Pull Zone

- Storage Zone `pnwmoths` created on LA region (`la.storage.bunnycdn.com`)
- Pull Zone `pnwmoths` created, linked to Storage Zone, serving at `https://pnwmoths.b-cdn.net`
- 3880 species and glossary images uploaded via bunny.net HTTP Storage API (migrate-images.js)

### Optimizer + Image Classes

- Bunny Optimizer enabled with WebP conversion on
- Image Class `glossaryportrait`: 188×225px, north crop (name without hyphen — bunny.net rejects hyphens)
- Image Class `navthumb`: height=186px, auto width (name without hyphen)

### CDN Delivery — BLOCKED

`https://pnwmoths.b-cdn.net/{slug}/{filename}` returns 403. Diagnosis ruled out:
- Token Authentication (not enabled)
- Edge Rules (none configured)
- Origin Type (correctly set to Storage Zone)
- Geo-blocking / IP restrictions (none configured)

bunny.net support ticket filed 2026-04-22. Phase 14 and Phase 15 are blocked until resolved.

## Deviations from Plan

### Upload method changed: HTTP API instead of rclone FTP

Plan specified rclone FTP. Switched to bunny.net HTTP Storage API because:
- bunny.net FTP rejects concurrent partial-file renames (`450` error) when uploading directories (D-17)
- Per-file `rclone copy` workaround was viable but slow
- HTTP API PUT is simpler, reliable, and already used in migrate-images.js

### Image Class names use no hyphens

Plan specified `glossary-portrait` and `nav-thumb`. bunny.net rejected hyphens; final names are `glossaryportrait` and `navthumb`. Phase 14 templates must use these exact names.

## Known Blockers

**CDN 403**: Pull Zone returns 403 for all file requests despite correct Storage Zone linkage and no access restrictions configured. bunny.net support ticket open. Until resolved:
- Phase 13 Plan 04 CDN spot-check cannot be completed
- Phase 14 template migration cannot be verified
- Phase 15 LFS removal must not start

## Threat Flags

- T-13-03-01 (rclone sync danger): N/A — rclone not used for upload; HTTP API used instead
- T-13-03-04 (Optimizer not active — resize params silently ignored): Cannot verify until 403 resolved
