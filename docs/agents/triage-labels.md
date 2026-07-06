# Triage labels

Triage state lives on GitHub Issue labels. Canonical triage roles map to labels as follows:

| Triage role       | In this repo                                                              |
| ----------------- | ------------------------------------------------------------------------- |
| `needs-triage`    | `needs-triage` label                                                       |
| `needs-info`      | `question` label                                                           |
| `ready-for-agent` | `ready-for-agent` label                                                    |
| `ready-for-human` | `ready-for-human` label                                                    |
| `wontfix`         | `gh issue close <n> --reason "not planned"`, plus `wontfix` label if it exists |

The repo already uses some labels in practice (`enhancement`, `documentation`, ...). Check
`gh label list` and reuse existing labels rather than inventing near-duplicates. If a label
in the table doesn't exist yet, create it once (`gh label create <name>`) rather than
substituting a lookalike.

With a team this small, most issues can skip formal triage: file with a clear title and the
right type label (`bug`, `enhancement`, `documentation`) and get on with it. Use the triage
labels only when an issue genuinely needs to wait for information or an owner.
