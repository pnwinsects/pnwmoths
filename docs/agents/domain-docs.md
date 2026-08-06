# Domain docs: what to read before exploring

Before exploring the codebase or planning work, read these in order. If any don't exist,
proceed silently — don't create placeholders or report the gap.

1. `CONTEXT.md` (repo root) — domain glossary: taxonomy terms, collection/record concepts,
   project-specific vocabulary.
2. `PRODUCT.md` (repo root) — what the site is, who it's for, what's in and out of scope.
3. `docs/adr/` — numbered decision records. Scan titles; read the ones touching your area.
4. `docs/curation-log.md` — the curator's rulings about the catalogue: what it contains, what a taxon
   is called, where it sits, which data is admitted. Read it before changing any of those — gating,
   names, merges, synonymies, placements, photo attributions, record admission. The file states its
   own scope; it is authoritative over any summary of it.
5. `docs/concerns.md` — live tech debt and known problem areas.
6. `docs/lessons-learned.md` — reusable engineering lessons from past work.
7. `_instructions/` — maintainer runbooks for operational tasks (pipelines, uploads, deploys).

## File layout

```
.
├── CLAUDE.md              # agent entry point
├── AGENTS.md              # symlink → CLAUDE.md
├── PRODUCT.md             # what / for whom / scope
├── CONTEXT.md             # domain glossary
├── README.md
├── CONTRIBUTING.md
└── docs/
    ├── adr/               # numbered decision records
    ├── agents/            # skill config docs (this file)
    ├── reference/         # stable reference material
    ├── curation-log.md    # the curator's rulings about the catalogue
    ├── concerns.md        # live tech debt
    ├── lessons-learned.md # reusable lessons
    └── history/           # archived material
```

## Recording decisions

- When a decision is made during a task — architecture, data model, tooling, naming — add a
  record to `docs/adr/` before moving on. A short record beats a perfect one.
- **Curatorial** decisions are the exception: any ruling in the scope that `docs/curation-log.md`
  defines for itself goes there as a numbered `C-nnn` entry — written when the decision is made, in
  the PR that applies it, or immediately as `Pending` when it cannot be applied yet. Follow the
  log's own ["How to add an entry"](../curation-log.md#how-to-add-an-entry) rather than a summary
  ([ADR 0032](../adr/0032-curation-log.md)).
- Never silently override an existing ADR. If new work conflicts with a recorded decision,
  flag the conflict to the user and either write a superseding ADR or change course.
