# Domain docs: what to read before exploring

Before exploring the codebase or planning work, read these in order. If any don't exist,
proceed silently — don't create placeholders or report the gap.

1. `CONTEXT.md` (repo root) — domain glossary: taxonomy terms, collection/record concepts,
   project-specific vocabulary.
2. `PRODUCT.md` (repo root) — what the site is, who it's for, what's in and out of scope.
3. `docs/adr/` — numbered decision records. Scan titles; read the ones touching your area.
4. `docs/curation-log.md` — the curator's rulings about the catalogue (what is included, what it is
   called, where it sits). Read before changing which taxa are published, named, or merged.
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
- **Curatorial** decisions are the exception: a ruling about what the catalogue contains, what a
  taxon is called, or which data is admitted goes in `docs/curation-log.md` as a numbered `C-nnn`
  entry, added in the same PR that acts on it ([ADR 0032](../adr/0032-curation-log.md)).
- Never silently override an existing ADR. If new work conflicts with a recorded decision,
  flag the conflict to the user and either write a superseding ADR or change course.
