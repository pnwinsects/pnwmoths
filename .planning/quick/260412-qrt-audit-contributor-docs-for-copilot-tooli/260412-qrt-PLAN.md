---
quick_task: 260412-qrt
title: Fix Copilot/AI assistant tooling gaps
type: execute
autonomous: true
files_modified:
  - _instructions/EDITING_DESCRIPTION.md
  - CONTRIBUTING.md
  - .devcontainer/devcontainer.json
  - .github/copilot-instructions.md
---

<objective>
Fix four concrete gaps that cause AI assistants (GitHub Copilot, Copilot Workspace,
Codespaces) to operate with wrong paths, missing environment, or insufficient project
context.

Output: corrected path references in one instruction file, a devcontainer config, a
Copilot instructions file, and a lychee note in CONTRIBUTING.md.
</objective>

<tasks>

<task type="auto">
  <name>Task 1: Fix wrong paths in _instructions/EDITING_DESCRIPTION.md</name>
  <files>_instructions/EDITING_DESCRIPTION.md</files>
  <action>
Replace every occurrence of `content/species/{slug}.md` with
`src/content/species/{slug}.md`. There are exactly three instances:

- Line 4: "What This Changes" bullet — `content/species/{slug}.md` → `src/content/species/{slug}.md`
- Line 9: "Location:" line — `content/species/{slug}.md` → `src/content/species/{slug}.md`
- Line 25: Step 2 sentence — `content/species/{slug}.md` → `src/content/species/{slug}.md`
- Line 37: `git add` command — `git add content/species/{slug}.md` → `git add src/content/species/{slug}.md`

No other changes. Preserve all whitespace, markdown structure, and the Docker
Alternative section exactly as-is.
  </action>
  <verify>
    <automated>grep -n 'content/species' /Users/rainhead/dev/pnwmoths/_instructions/EDITING_DESCRIPTION.md</automated>
  </verify>
  <done>
Every path reference in the file reads `src/content/species/{slug}.md`. No bare
`content/species/` prefix remains. The `git add` line also uses the `src/` prefix.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add lychee prerequisite note to CONTRIBUTING.md</name>
  <files>CONTRIBUTING.md</files>
  <action>
In the Prerequisites section, after the Git LFS bullet, add a note about lychee.
The note should explain that `npm run build:validate-links` requires lychee locally,
but that the Docker path handles it automatically. Keep it brief — one sentence or a
short bullet is enough.

Suggested text to insert after the Git LFS bullet:
```
- [lychee](https://lychee.cli.rs/) — required locally for `npm run build:validate-links` (the Docker path includes it automatically)
```

The "Or use Docker to skip local tooling" line already exists; the new bullet should
appear before it, keeping Docker as the escape hatch.

No other changes to CONTRIBUTING.md.
  </action>
  <verify>
    <automated>grep -n 'lychee' /Users/rainhead/dev/pnwmoths/CONTRIBUTING.md</automated>
  </verify>
  <done>
CONTRIBUTING.md Prerequisites section lists lychee with a note that Docker handles it
automatically. The existing "Or use Docker" line still follows.
  </done>
</task>

<task type="auto">
  <name>Task 3: Create .devcontainer/devcontainer.json</name>
  <files>.devcontainer/devcontainer.json</files>
  <action>
Create `.devcontainer/devcontainer.json` that provisions a working environment via the
existing docker-compose.yml. Use the `dockerComposeFile` approach so the image
definition stays in one place.

```json
{
  "name": "pnwmoths",
  "dockerComposeFile": "../docker-compose.yml",
  "service": "dev",
  "workspaceFolder": "/workspace",
  "remoteUser": "node",
  "onCreateCommand": "npm install",
  "customizations": {
    "vscode": {
      "extensions": [
        "GitHub.copilot",
        "dbaeumer.vscode-eslint"
      ]
    }
  }
}
```

The `node` user exists in the `node:22-bookworm-slim` base image used by the
Dockerfile. `onCreateCommand` runs `npm install` so the container is immediately
usable. No `forwardPorts` needed — there is no dev server.

Create the `.devcontainer/` directory if it does not exist.
  </action>
  <verify>
    <automated>node -e "JSON.parse(require('fs').readFileSync('/Users/rainhead/dev/pnwmoths/.devcontainer/devcontainer.json','utf8')); console.log('valid JSON')"</automated>
  </verify>
  <done>
`.devcontainer/devcontainer.json` exists, is valid JSON, references `../docker-compose.yml`
as `dockerComposeFile`, and sets `service: "dev"` and `workspaceFolder: "/workspace"`.
  </done>
</task>

<task type="auto">
  <name>Task 4: Create .github/copilot-instructions.md</name>
  <files>.github/copilot-instructions.md</files>
  <action>
Create `.github/copilot-instructions.md` (≤80 lines). Content must be factual and
concise — conventions and constraints, not philosophy. Cover:

1. **Slug convention** — `(genus + '-' + species).toLowerCase()`, alphanumeric and hyphens only
2. **Key data file locations** — `data/species.csv`, `data/records.csv`, `data/images.csv`
3. **Prose description path** — `src/content/species/{slug}.md` (optional per species)
4. **Build pipeline** — ordered steps matching the table in CONTRIBUTING.md
5. **Valid state/province codes** — WA, OR, ID, MT, BC
6. **Coordinate bounds** — records are Pacific Northwest; lat roughly 42–55 N, lon roughly −125 to −110 W
7. **Output directory** — `_site/` (gitignored build output)
8. **Node version** — 22 (see `.nvmrc`)
9. **Test command** — `npm test` covers data pipeline and Lit components

Do NOT include: philosophy, contribution workflow prose, anything already in
CONTRIBUTING.md at length. Cross-reference CONTRIBUTING.md for the full guide.

Target: under 80 lines, structured with level-2 headings and short bullet lists.
  </action>
  <verify>
    <automated>wc -l /Users/rainhead/dev/pnwmoths/.github/copilot-instructions.md</automated>
  </verify>
  <done>
`.github/copilot-instructions.md` exists, is under 80 lines, and contains all nine
points listed above with correct paths and values.
  </done>
</task>

</tasks>

<verification>
After all four tasks:

1. No bare `content/species/` path remains in `_instructions/EDITING_DESCRIPTION.md`:
   `grep -c 'content/species' _instructions/EDITING_DESCRIPTION.md` — all matches include `src/` prefix

2. `CONTRIBUTING.md` mentions lychee in Prerequisites:
   `grep 'lychee' CONTRIBUTING.md` returns at least one line

3. devcontainer config is valid JSON referencing docker-compose:
   `cat .devcontainer/devcontainer.json | python3 -m json.tool > /dev/null`

4. Copilot instructions file exists and is under 80 lines:
   `wc -l .github/copilot-instructions.md`
</verification>

<success_criteria>
- `_instructions/EDITING_DESCRIPTION.md` uses `src/content/species/` in all four relevant locations
- `CONTRIBUTING.md` Prerequisites section documents lychee requirement with Docker escape hatch
- `.devcontainer/devcontainer.json` exists and points to `docker-compose.yml`
- `.github/copilot-instructions.md` exists, ≤80 lines, covers slug convention / data paths / build pipeline / geographic constraints
</success_criteria>

<output>
Each task is independently committable. Suggested commit messages:
- Task 1: `fix(_instructions): correct prose path to src/content/species/ in EDITING_DESCRIPTION.md`
- Task 2: `docs(contributing): add lychee to prerequisites with Docker note`
- Task 3: `chore: add devcontainer config pointing to docker-compose.yml`
- Task 4: `chore: add .github/copilot-instructions.md with project conventions`
</output>
