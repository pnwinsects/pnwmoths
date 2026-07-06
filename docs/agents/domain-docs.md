# Domain docs: what to read before exploring

Before exploring the codebase or planning work, read these in order. If any don't exist,
proceed silently — don't create placeholders or report the gap.

1. `CONTEXT.md` (repo root) — domain glossary: taxonomy terms, collection/record concepts,
   project-specific vocabulary.
2. `PRODUCT.md` (repo root) — what the site is, who it's for, what's in and out of scope.
3. `docs/adr/` — numbered decision records. Scan titles; read the ones touching your area.
4. `docs/concerns.md` — live tech debt and known problem areas.
5. `docs/lessons-learned.md` — reusable engineering lessons from past work.
6. `_instructions/` — maintainer runbooks for operational tasks (pipelines, uploads, deploys).

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
    ├── concerns.md        # live tech debt
    ├── lessons-learned.md # reusable lessons
    └── history/           # archived material
```

## Recording decisions

- When a decision is made during a task — architecture, data model, tooling, naming — add a
  record to `docs/adr/` before moving on. A short record beats a perfect one.
- Never silently override an existing ADR. If new work conflicts with a recorded decision,
  flag the conflict to the user and either write a superseding ADR or change course.
