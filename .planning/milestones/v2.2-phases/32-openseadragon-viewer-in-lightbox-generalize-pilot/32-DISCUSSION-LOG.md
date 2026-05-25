# Phase 32: OpenSeadragon Viewer in Lightbox (generalize pilot) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-23
**Phase:** 32-openseadragon-viewer-in-lightbox-generalize-pilot
**Areas discussed:** Carousel thumbnails, Main slide before lightbox, Specimen switching in OSD, No-JS fallback

---

## Todo Review

| Todo | Score | Action |
|------|-------|--------|
| Fix close button on the lightbox | 0.9 | Folded into Phase 32 |
| Migrate Pagefind to Component UI | 0.9 | Left pending (unrelated) |

---

## Carousel thumbnails

| Option | Description | Selected |
|--------|-------------|----------|
| DZI level-0 tile from CDN | Actual specimen image at lowest resolution | ✓ |
| Gray placeholder with label | Colored box with specimen_id · view text | |
| You decide | Claude picks approach | |

**User's choice:** DZI level-0 tile from CDN

---

### Thumbnail labels

| Option | Description | Selected |
|--------|-------------|----------|
| specimen_id + view (e.g. 'A · D') | Small text below thumbnail | |
| View only (e.g. 'Dorsal' / 'Ventral') | Side label only | |
| No label | Just the image thumbnail | ✓ |

**User's choice:** No label — just the tile image, no text on thumbnail buttons.

---

## Main slide before lightbox

| Option | Description | Selected |
|--------|-------------|----------|
| DZI level-0 tile (same as thumbnail, larger) | Level-0 tile at full width; click opens OSD | ✓ |
| Placeholder with click-to-open prompt | Gray area with "Click to open high-res viewer" | |
| No main slide — thumbnail click opens OSD directly | Skip large image; clicking thumbnail opens OSD | |

**User's choice:** DZI level-0 tile at full width in the main slide area.

**Notes:** Combining this with the "render `<figure>` elements" decision for no-JS means the component's existing light DOM figure reading naturally drives both the thumbnail strip and main slide with the level-0 tile URLs — no new component rendering logic needed.

---

## Specimen switching in OSD

| Option | Description | Selected |
|--------|-------------|----------|
| Prev/next buttons inside the OSD lightbox | Arrow buttons cycle specimens; viewer.open() swaps | ✓ |
| Close and reopen from carousel | No in-lightbox nav; user closes to switch | |
| You decide | Claude picks UX | |

**User's choice:** Prev/next buttons inside the OSD lightbox.

---

### OSD swap mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| viewer.open(newTileSource) — swap in place | No destroy; zoom/pan resets to defaultZoomLevel | ✓ |
| Destroy + recreate OSD | Brief blank during creation; simpler code | |

**User's choice:** `viewer.open(newTileSource)` — swap without destroy/recreate.

---

## No-JS fallback

| Option | Description | Selected |
|--------|-------------|----------|
| Static `<figure>` with level-0 tile (no OSD) | Template renders actual specimen images for no-JS | ✓ |
| Message: photos require JS | `<noscript>` or slot message | |
| Accept degradation | No fallback | |

**User's choice:** Static `<figure>` with level-0 tile.

---

### Figcaption format

| Option | Description | Selected |
|--------|-------------|----------|
| Specimen A · Dorsal (id · side) | Matches OSD lightbox caption; useful for curators | ✓ |
| Dorsal / Ventral only | Side only; omits internal specimen_id | |
| You decide | Claude chooses | |

**User's choice:** "Specimen A · Dorsal" format — consistent with what JS users see in the OSD caption.

---

## Deferred Ideas

- Per-specimen keyboard navigation in OSD lightbox (arrow keys)
- Smooth OSD cross-fade transition between specimens
- "Migrate Pagefind to Component UI" — left in pending for a future UI phase
