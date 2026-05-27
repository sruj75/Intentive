# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- `docs/CONTEXT.md` for domain vocabulary and canonical terms
- `docs/adr/` for architecture decisions relevant to the area being changed
- Deployable-specific `AGENTS.md` files when working inside a specific app or service subtree

If any of these files are missing in a future refactor, proceed silently and continue with the best available context.

## File structure

Single-context repo (this repo's current layout):

```
/
├── AGENTS.md
├── docs/
│   ├── CONTEXT.md
│   └── adr/
├── apps/
├── services/
└── packages/
```

## Use the glossary's vocabulary

When your output names a domain concept (issue titles, implementation notes, refactor proposals, tests), use terms as defined in `docs/CONTEXT.md`. Avoid synonyms that conflict with the glossary.

If a needed concept is missing from the glossary, flag it explicitly rather than inventing new terminology.

## Flag ADR conflicts

If proposed work contradicts an existing ADR, surface it explicitly rather than silently overriding:

> Contradicts ADR-XXXX — worth reopening because...
