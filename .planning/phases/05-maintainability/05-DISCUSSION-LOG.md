# Phase 5: Maintainability - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-12
**Phase:** 05-maintainability
**Areas discussed:** Deployment target, Instructions audience, Docker scope, Build time strategy

---

## Deployment Target

| Option | Description | Selected |
|--------|-------------|----------|
| GitHub Pages | Free, no external services, fits PoC's 'no server' principle | ✓ |
| Netlify | More features but requires API token and external account | |
| You decide | Planner picks simplest option | |

**User's choice:** GitHub Pages with default github.io URL (no CNAME)

| Option | Description | Selected |
|--------|-------------|----------|
| Build on PRs, deploy on main only | Standard CI pattern with PR validation | ✓ |
| Only trigger on push to main | Simpler workflow, no PR feedback | |

**User's choice:** Build + validate on PRs, build + deploy on push to main

| Option | Description | Selected |
|--------|-------------|----------|
| Enable LFS in CI | Images tracked via Git LFS; CI must pull LFS objects | ✓ |
| Skip LFS in CI | Fine if build doesn't need actual image files | |
| You decide | Planner determines based on template requirements | |

**User's choice:** Enable LFS in CI

---

## Instructions Audience

| Option | Description | Selected |
|--------|-------------|----------|
| LLM acting as editing assistant | Structured prompt/recipe, terse, machine-actionable | ✓ |
| Human maintainer reading directly | Tutorial format, conversational tone | |
| Both | Human-readable tutorial + LLM-executable | |

**User's choice:** LLM acting as editing assistant

| Option | Description | Selected |
|--------|-------------|----------|
| File editing only | LLM edits files; CI handles build automatically | |
| File editing + build commands | Instructions include local build steps for verification | ✓ |
| You decide | Planner decides if local build instructions are redundant | |

**User's choice:** File editing + build commands (maintainers can verify locally)

| Option | Description | Selected |
|--------|-------------|----------|
| Separate files in _instructions/ | One file per task; maintainer drops relevant file into LLM session | ✓ |
| Single CONTRIBUTING.md | All four tasks in one document | |

**User's choice:** Separate files in `_instructions/`

| Option | Description | Selected |
|--------|-------------|----------|
| Include LFS steps in ADDING_PHOTO.md | Document non-obvious LFS requirement | ✓ |
| Keep instructions minimal, skip LFS | Assume LFS just works from .gitattributes | |
| You decide | Planner checks LFS config | |

**User's choice:** Include explicit Git LFS steps in ADDING_PHOTO.md

---

## Docker Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Build-only container | Runs npm run build, outputs _site/ | |
| Full dev environment | Includes editing, building, testing | ✓ |
| You decide | Planner interprets 'complete build and maintenance environment' | |

**User's choice:** Full dev environment (editing, building, testing)

| Option | Description | Selected |
|--------|-------------|----------|
| Functionally identical output | Same content, paths, data; timestamps can differ | ✓ |
| Truly byte-for-byte identical | Requires SOURCE_DATE_EPOCH everywhere; very hard | |
| You decide | Planner interprets 'byte-for-byte' reasonably | |

**User's choice:** Functionally identical — timestamps may differ

| Option | Description | Selected |
|--------|-------------|----------|
| Pin to .nvmrc version | FROM node:22-bookworm-slim consistent with project tooling | ✓ |
| Use node:lts | Always gets latest LTS, less pinned | |
| You decide | Planner picks most reproducible | |

**User's choice:** Pin to .nvmrc version (Node.js 22)

---

## Build Time Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Cache aggressively, then measure | Cache node_modules + binaries; standard approach | ✓ |
| Parallelize build steps | Concurrent lychee + pagefind; more complex YAML | |
| You decide | Planner picks strategy, notes bottleneck | |

**User's choice:** Cache aggressively then measure

| Option | Description | Selected |
|--------|-------------|----------|
| Internal links only | Fast, reliable CI; external checks slow/flaky | |
| Internal + external | Catches broken external links; accept slower runs | ✓ |

**User's choice:** Internal + external link checking

---
