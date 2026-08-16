# PNW Moths — AI Context

A fully static rebuild of the Pacific Northwest Moths catalog ([pnwmoths.biol.wwu.edu](https://pnwmoths.biol.wwu.edu)). Eleventy + flat files (CSV/Markdown) → ~700+ species pages, with DuckDB/Parquet, Lit web components, and a Bunny CDN. No server or database at runtime.

## Product Memory

Durable knowledge lives in a few files — keep them current; this is the product's memory, and it must travel with the repo for the next maintainer or collaborator (who may not use these tools):

- **[PRODUCT.md](PRODUCT.md)** — what PNW Moths is, for whom, capabilities, scope, out-of-scope, constraints.
- **[CONTEXT.md](CONTEXT.md)** — the domain glossary. Use its terms exactly (species, slug, occurrence record, district, factsheet, Identify/key-matrix, withheld/unpublished gating…). Update when a term is coined or sharpened.
- **[docs/adr/](docs/adr/)** — numbered decision records with rationale and rejected alternatives. **When a decision is made, add an ADR before moving on.** Mark superseded records; don't delete them.
- **[docs/curation-log.md](docs/curation-log.md)** — the curator's rulings about the catalogue itself: what it contains, what a taxon is called, where it sits, and which data is admitted (the file states its own scope and the required fields). Append-only, numbered `C-nnn`, newest first. **Write the entry when the decision is made — in the PR that applies it, or immediately as `Pending` if it can't be applied yet** ([ADR 0032](docs/adr/0032-curation-log.md)). Engineering decisions go in `docs/adr/`; *which taxa are gated* goes here.
- **[docs/concerns.md](docs/concerns.md)** — live tech debt and known gaps (accepted vs actionable). **[docs/lessons-learned.md](docs/lessons-learned.md)** — reusable "if you touch X, know Y" engineering lessons.
- **[docs/reference/](docs/reference/)** — provenance of the legacy data (original WWU site, reference MySQL DB, Lucid3 key source, subfamily-in-CMS-paths).
- **[_instructions/](_instructions/)** — plain-English maintainer runbooks (adding species/records/photos, assigning districts, tiling, uploading).

## Work tracking

Work is tracked in **GitHub Issues** (`gh`) — the single, authoritative, shared source of truth for features, bugs, and tech debt. There is a collaborator who does not use these tools and the repo may change hands, so work visibility must live where anyone can see it. Do not use TodoWrite or markdown TODO lists for durable work items; file a GitHub issue. Decisions and their *why* go in `docs/adr/`; issues track work in flight and reference ADRs.

Label an issue **`curation`** when it is blocked on the curator's taxonomic or content judgement rather than on engineering — a merge to confirm, a species whose photos need a destination, a name we may or may not want to follow. `gh issue list --label curation` is the short list to put in front of him. See [docs/agents/triage-labels.md](docs/agents/triage-labels.md).

## Agent skills

Config that the engineering skills (`to-issues`, `to-prd`, `grill-with-docs`, `improve-codebase-architecture`, …) read from:

- **Issue tracker** — GitHub Issues via `gh`; no local/offline tracker. See [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md).
- **Triage labels** — canonical roles mapped to GitHub labels. See [docs/agents/triage-labels.md](docs/agents/triage-labels.md).
- **Domain docs** — single-context: CONTEXT.md + PRODUCT.md + docs/adr/ + docs/curation-log.md. See [docs/agents/domain-docs.md](docs/agents/domain-docs.md).

Implementation patterns, constraints, and gotchas from the high-res photo pipeline spike are in the project skill: `Skill("spike-findings-pnwmoths")`.

## Architecture invariants

- **Static only** — pure static files, no server or database at runtime, ever ([ADR 0001](docs/adr/0001-static-no-server.md)). All pipeline operations (upload, tiling, district assignment) are maintainer-run scripts on a local machine; there is no data/build server.
- **`species_slug` = `(genus+'-'+species).toLowerCase()`, then whitespace runs collapsed to hyphens** — is the foreign key across every CSV and the URL structure. The collapse is not optional: provisional epithets carry spaces (`Xylophanes` + `nr libya` → `xylophanes-nr-libya`), and lowercasing alone silently produces a key that joins to nothing. Use [`normalizeSlug`](src/_lib/unpublished-species.ts) rather than restating the rule. Never derive join slugs from image filenames. Every slug-bearing file is declared in `RELATIONS` in `scripts/check-referential-integrity.ts` and checked before the build — **strictly**, because consumers join on the raw cell, so `normalizeSlug` is how the *species* side is derived, not a licence to match loosely. **Adding a slug-bearing file means adding a line there** ([ADR 0033](docs/adr/0033-referential-integrity-gate.md)).
- **Graceful no-JS degradation is mandatory** — taxonomy, prose, and photos must render as static HTML; Lit components enhance, never gate, content.
- **Occurrence data loads async from per-species Parquet** (Snappy compression, read by hyparquet); it is never inlined and is excluded from the Pagefind index.
- **`pathPrefix` is conditional on `process.env.GITHUB_PAGES`** — `/` for production, `/pnwmoths/` for GitHub Pages staging. Never hardcode `/pnwmoths/`.
- **`CDN_BASE_URL` is a hard-coded public constant** in `eleventy.config.ts` — not a secret, not an env var.
- **Data mutations are additive-only and idempotent** — district write-back and CDN migrations never overwrite curator-entered values; disagreements go to advisory reports, never build failures.

See [docs/lessons-learned.md](docs/lessons-learned.md) for the full set of build-pipeline / DuckDB / Lit gotchas.

## Constraints

- Flat-file, contributor-editable data (CSV + per-species Markdown); non-technical maintainers must be able to edit without a local build.
- Node 24 (see `.nvmrc`); full TypeScript via native type-stripping, `tsc --noEmit` as a CI gate, `check-ts-only.sh` invariant guard (bans `.js`/`allowJs`/`@ts-ignore`/unguarded double-casts — even in comments).
- Images from the Bunny CDN; no image assets in the repo (Git LFS removed in v1.4).

## Running locally

```bash
npm install
npm run build       # build:data (CSV→DuckDB→Parquet) → eleventy → copy-parquet → pagefind → link check → weight check
npm test            # data pipeline + Lit component tests (node --test)
npm run typecheck   # tsc --noEmit (both tsconfigs)
npm run smoke:browser  # drives the built _site/ in headless Chrome (run after a build)
```

`npm test` reads the TypeScript *sources*; `smoke:browser` is the only gate that runs what the
bundler actually emitted, which is where a component can render once and then freeze with every
other check still green ([ADR 0035](docs/adr/0035-browser-smoke-gate.md)). It sits outside
`npm run build` on purpose, so the build stays offline and browser-free; CI runs it as its own step.

Full step ordering lives in `package.json`; `build:site` produces and verifies `_site/`, `build` adds a blocking link check. See [CONTRIBUTING.md](CONTRIBUTING.md) for the Docker path and the required `BUNNY_STORAGE_PASSWORD` deploy secret. Deployment: push to `main` → additive Bunny upload (production, moths.pnwinsects.org); GitHub Pages is manual staging ([ADR 0008](docs/adr/0008-deploy-bunny-additive.md)).
