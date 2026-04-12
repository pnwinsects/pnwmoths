# Phase 5: Maintainability - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 5 delivers two things:
1. **Maintainer instructions** — LLM-actionable recipe files in `_instructions/` covering the four common editing tasks (add species, add records, edit description, add photo).
2. **CI/CD pipeline** — GitHub Actions workflow that builds and deploys to GitHub Pages on push to main; also runs build validation on pull requests. A Dockerfile defines the full build and maintenance environment so local builds are reproducible.

This phase does NOT add new site features or modify the data pipeline behavior.

</domain>

<decisions>
## Implementation Decisions

### Deployment Target
- **D-01:** Deploy to **GitHub Pages** using the default `github.io` URL. No custom CNAME for now.
- **D-02:** GitHub Actions triggers: **build + validate on PRs** (no deploy), **build + deploy on push to main**.
- **D-03:** Git LFS must be explicitly enabled in CI — `git lfs install` + `git lfs pull` in the workflow before any build steps.

### Maintainer Instructions
- **D-04:** Primary audience is an **LLM acting as an editing assistant** — a maintainer opens Claude or Copilot, drops in the relevant instruction file, and asks it to help with the task. Format: structured, terse, step-by-step, machine-actionable. Not a tutorial.
- **D-05:** Instructions include **file editing + build commands** — maintainers can verify locally using Docker or `npm run build` before pushing.
- **D-06:** **Separate files in `_instructions/`**: `ADDING_SPECIES.md`, `ADDING_RECORDS.md`, `EDITING_DESCRIPTION.md`, `ADDING_PHOTO.md`. One file per task. (MAINT-01 explicitly names `ADDING_SPECIES.md` in success criteria.)
- **D-07:** `ADDING_PHOTO.md` must include explicit **Git LFS steps** — LFS is a non-obvious requirement and the instructions should walk through it (images in `images/{slug}/` are tracked via LFS per the `.gitattributes`).

### Docker Environment
- **D-08:** Docker container scope is a **full dev environment** — editing, building, and testing. Not just a build-only container. Maintainers with no local tooling can use Docker for everything.
- **D-09:** **"Identical output"** means **functionally identical** — same pages generated, same links, same data content. Timestamps in meta tags or build comments may differ. True byte-for-byte reproducibility (SOURCE_DATE_EPOCH, etc.) is not required for this PoC.
- **D-10:** Dockerfile **pins to Node.js 22** (from `.nvmrc`): `FROM node:22-bookworm-slim` or equivalent. Must also include lychee (Rust binary), pagefind (binary), and Git LFS.

### Build Time Strategy
- **D-11:** Strategy: **cache aggressively, then measure**. Cache `node_modules`, DuckDB binary, lychee, and pagefind binaries between GitHub Actions runs. Do not prematurely parallelize.
- **D-12:** Lychee validates **internal + external links**. External URL checking is enabled (not `--offline` only). Accept that external checks may be slower or occasionally flaky; flag in docs if needed.

### Claude's Discretion
- Exact GitHub Actions YAML structure and step ordering — planner decides.
- How Docker mounts the repo (volume mount vs COPY) for the dev environment use case.
- Whether a `Makefile` or `docker-compose.yml` wrapper is helpful for the dev environment.
- lychee configuration details (timeout, retry count for external URLs).
- Whether to add a `build:docker` npm script or document the `docker run` command directly in instructions.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — MAINT-01 through MAINT-04 (full specs)
- `.planning/ROADMAP.md` — Phase 5 goal, success criteria (including explicit ADDING_SPECIES.md reference)

### Project Context
- `.planning/PROJECT.md` — PoC scope, flat-file pattern, Docker decision (pending), Git LFS decision (pending)
- `.planning/STATE.md` — Accumulated decisions from Phases 1–4

### Existing Build System
- `package.json` — Current `build` script chain: `build:data → build:eleventy → build:copy-parquet → build:pagefind → build:validate-links → build:check-weight`
- `scripts/build-data.js` — Existing pipeline script (ESM pattern to follow)
- `scripts/check-page-weight.js` — Existing validator script pattern
- `.nvmrc` — Node.js version (22) for Dockerfile pinning

No external ADRs or specs beyond the above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `package.json` `build` script: Full pipeline already defined — CI workflow runs `npm run build` as a single command.
- `scripts/` directory: Node.js ESM scripts pattern established; any new scripts follow this convention.

### Established Patterns
- Flat-file editing: `data/species.csv`, `data/records.csv`, `data/images.csv`, `data/glossary.csv` — instruction files should document this explicitly.
- Per-species Markdown: `content/species/{slug}.md` — another editable file type.
- Image storage: `images/{slug}/` — tracked via Git LFS (`.gitattributes` handles tracking patterns).

### Integration Points
- `eleventy.config.js`: CI must have all Eleventy dependencies installed before running.
- `@duckdb/node-api`: Native binary — must be compatible with the Docker base image architecture (linux/amd64).
- `lychee`: Currently invoked with `--offline` flag in `build:validate-links` npm script; Phase 5 may need to update this to enable external URL checking per D-12.

</code_context>

<specifics>
## Specific Ideas

- Success criteria from ROADMAP.md calls out `_instructions/ADDING_SPECIES.md` by name — this file must exist and be complete enough for a non-technical maintainer to follow using only that file + an LLM assistant.
- DuckDB `@duckdb/node-api` includes pre-built native binaries for Linux/amd64 via npm install — Docker should handle this automatically if `npm ci` is run inside the container.
- lychee is a Rust binary; install via apt or a pre-built GitHub release binary in the Dockerfile (not via npm).
- pagefind is a binary distributed as an npm package (`pagefind`) — already in `devDependencies`, will be available after `npm ci`.

</specifics>

<deferred>
## Deferred Ideas

None surfaced during discussion.

</deferred>

---

*Phase: 05-maintainability*
*Context gathered: 2026-04-12*
