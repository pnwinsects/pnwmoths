# Quick Task 260412-qrt: Audit Contributor Docs for Copilot Tooling — SUMMARY

Status: COMPLETE

## What was done

- **Fixed wrong paths in `_instructions/EDITING_DESCRIPTION.md`:** All four occurrences of `content/species/` were updated to `src/content/species/` to match the actual file layout under `src/`.
- **Added lychee to CONTRIBUTING.md prerequisites:** Inserted a bullet after Git LFS noting that lychee is required locally for `npm run build:validate-links`, with a callout that the Docker path includes it automatically.
- **Created `.devcontainer/devcontainer.json`:** Points to the existing `docker-compose.yml` and `dev` service, sets workspace folder and user, runs `npm install` on container create, and installs the GitHub Copilot and ESLint VS Code extensions.
- **Created `.github/copilot-instructions.md`:** 61-line file covering slug convention, key data files, prose description path, build pipeline steps, valid state/province codes, coordinate bounds, output directory, Node version, and test command — with a cross-reference to CONTRIBUTING.md to avoid duplication.

## Gaps identified and fixed

- `_instructions/EDITING_DESCRIPTION.md` had stale paths (`content/species/`) that didn't match the actual location (`src/content/species/`). This would have caused confusion for contributors and AI tools following the guide literally.
- CONTRIBUTING.md listed lychee as a requirement in the build table but not in the Prerequisites section, making it easy to miss for contributors setting up locally.
- No devcontainer configuration existed, leaving Copilot/Codespaces users without an automated environment setup.
- No machine-readable conventions file existed for Copilot or other AI coding assistants to reference project-specific constraints (slug format, coordinate bounds, valid codes, etc.).
