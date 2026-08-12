# Triage labels

Triage state lives on GitHub Issue labels. Canonical triage roles map to labels as follows:

| Triage role       | In this repo                                                              |
| ----------------- | ------------------------------------------------------------------------- |
| `needs-triage`    | `needs-triage` label                                                       |
| `needs-info`      | `question` label                                                           |
| `ready-for-agent` | `ready-for-agent` label                                                    |
| `ready-for-human` | `ready-for-human` label                                                    |
| `wontfix`         | `gh issue close <n> --reason "not planned"`, plus `wontfix` label if it exists |

## `curation` — waiting on the curator, not on engineering

`curation` marks an issue that cannot move until the curator (@MerrillPeterson) makes a
taxonomic or content decision. It is not a triage state and does not stack with the roles
above: the work is understood and specified, and no amount of engineering effort progresses it.

Use it when the open question is *which moth*, *which name*, *which photo*, or *what the
account should say* — a merge that needs confirming, a species slated for deletion whose photos
need a destination, a rename that follows an external authority we may or may not want to
follow. Do not use it for questions a maintainer can answer by reading the data.

It exists because this repo has exactly one curator, who does not use these tools, and the
failure mode is silent: a question asked inside a long issue thread gets read once and then
buried under the engineering that continues around it. `gh issue list --label curation` is the
short list to put in front of him.

When filing one, state the question as a decision with options, not as background — and say
plainly what happens if it is left unanswered, since "nothing is broken today" is usually the
honest answer and it changes how it gets prioritised.

The repo already uses some labels in practice (`enhancement`, `documentation`, ...). Check
`gh label list` and reuse existing labels rather than inventing near-duplicates. If a label
in the table doesn't exist yet, create it once (`gh label create <name>`) rather than
substituting a lookalike.

With a team this small, most issues can skip formal triage: file with a clear title and the
right type label (`bug`, `enhancement`, `documentation`) and get on with it. Use the triage
labels only when an issue genuinely needs to wait for information or an owner.
