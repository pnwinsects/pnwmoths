# Issue tracker: GitHub Issues

Work on this repo is tracked in **GitHub Issues**, operated via the `gh` CLI. Issues are the
authoritative, shared source of truth for features, bugs, and tech debt. There is no
local/offline tracker (this project does **not** use beads). A collaborator who doesn't use
AI tooling reads this tracker, and the repo may change ownership — so all work in flight must
be visible on GitHub, not on one person's machine.

## `gh` cheatsheet

```sh
gh issue list                                  # open issues
gh issue list --label enhancement              # filter by label
gh issue view <n>                              # read an issue (add --comments for discussion)
gh issue create --title "..." --body "..." --label enhancement
gh issue comment <n> --body "..."              # add a progress note or finding
gh issue close <n> --reason completed          # done (use --reason "not planned" for wontfix)
gh issue edit <n> --add-label ready-for-agent  # adjust labels
gh label list                                  # see which labels already exist
```

PR basics — link PRs to the issues they resolve:

```sh
gh pr create --title "..." --body "Closes #<n>"   # auto-closes the issue on merge
gh pr view <n> / gh pr list / gh pr checks <n>
```

## Rules for skills

- "Publish to the issue tracker" → `gh issue create`.
- "Fetch the relevant ticket" → `gh issue view <n>` (with `--comments` if context matters).
- A PRD or broken-down plan becomes a **parent tracking issue plus linked child issues**.
  GitHub has no first-class epics: put a task-list checklist in the parent issue body that
  references the child issue numbers, e.g.

  ```markdown
  ## Tasks
  - [ ] #101 Extract map layer config
  - [ ] #102 Add district boundaries to tiles
  - [ ] #103 Wire district filter into species pages
  ```

  GitHub auto-checks items as the referenced issues close.
- Progress updates and findings go in issue comments, so the non-AI collaborator can follow along.

## Decisions live in ADRs, not issue comments

The *why* behind a decision belongs in `docs/adr/` — durable and searchable — not buried in
an issue thread. Issues track work in flight; when an issue involves a decision, record it as
an ADR and reference the ADR by filename from the issue.
