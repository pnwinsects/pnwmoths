# Spike Conventions

Patterns and stack choices established across spike sessions. New spikes follow these unless the question requires otherwise.

> **Confidence:** Low — only 1 spike has been wrapped up so far. Treat these as starting points, not load-bearing conventions. They will be revised as more spikes accumulate.

## Stack

- **Node.js** with native ESM (`.mjs`). The host project is already Node + Eleventy with Node 22-class capabilities (global `fetch`, top-level `await`); spike scripts inherit that.
- **No npm installs unless the question demands it.** Spike 001 ran entirely on Node built-ins (`node:fs/promises`, global `fetch`). Adding a dependency for a one-off listing script was deliberately rejected — direct HTTP requests are fewer moving parts and don't muddy `package.json`.
- **No bundlers, no transpilers, no Docker** for spikes. Scripts run directly via `node script.mjs`.

## Structure

```
.planning/spikes/
├── MANIFEST.md            # Overall idea + requirements + verdict table
├── CONVENTIONS.md         # This file
├── WRAP-UP-SUMMARY.md     # Most recent wrap-up summary
└── NNN-descriptive-name/
    ├── README.md          # YAML frontmatter, research, run instructions, investigation trail, results
    ├── REPORT.md          # Final analysis (for data-audit spikes; optional otherwise)
    ├── *.mjs              # One or more scripts implementing the spike
    └── outputs/
        ├── .gitignore     # gitignores large/sensitive outputs
        └── *.json         # small evidence files committed; large raw outputs gitignored
```

## Patterns

- **Two-script pattern for data-audit spikes.** One script fetches/produces raw evidence (gitignored), a second script analyzes it into a small committed summary (`classifications.json` in spike 001). Keeps git history clean while preserving full reproducibility.
- **Forensic evidence in JSON.** Use `JSON.stringify(_, null, 2)` so diffs are reviewable. Include `listed_at` / `produced_at` ISO timestamps in every output.
- **Auth via env vars only.** Never write tokens to a file or pass them on the command line. Document the env-var setup in the spike README.
- **Document the API surface used.** When a spike calls an external API, paste the relevant struct/method spec or doc URL into the README's Research section so future planners don't re-research the same thing.
- **Investigation trail beats conclusions.** README's Investigation Trail section documents what was tried, what worked, what surprised — much more useful for future build sessions than a bare verdict.

## Tools & Libraries

- **Dropbox HTTP API** for shared-link folder listing (no SDK). Endpoint `/2/files/list_folder` with `shared_link.url`; scope `files.metadata.read`. See `001-dropbox-photo-audit/list-dropbox.mjs`.
- **Project's existing `data/species.csv`** (1,348 records) is the canonical species data — match against it directly via in-script CSV parsing rather than reading derived JSON.

## Tools & libraries to avoid (so far)

- **Dropbox SDK** (`dropbox` npm package) — adds a dep for what is two HTTP calls and pagination via cursor. Use `fetch` directly.
- **rclone for listing-only tasks** — heavier setup (OAuth dance, adds folder to user's Dropbox namespace) than the API path. rclone may still earn its keep for bulk transfers; revisit during phase planning if needed.
