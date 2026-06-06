# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- `CONTEXT-MAP.md` (root) for the context map and shared product language, plus the owning deployable's own `CONTEXT.md` and `ARCHITECTURE.md` for context-specific vocabulary and structure
- `docs/adr/` (system-wide) and the owning deployable's `docs/adr/` for architecture decisions relevant to the area being changed
- Deployable-specific `AGENTS.md` files when working inside a specific app or service subtree

If any of these files are missing in a future refactor, proceed silently and continue with the best available context.

## File structure

Multi-context repo (this repo's current layout):

```
/
├── AGENTS.md
├── ARCHITECTURE.md             ← monorepo structure
├── CONTEXT-MAP.md              ← context map + shared product language
├── docs/
│   └── adr/                    ← system-wide decisions
├── apps/
│   ├── mobile/{CONTEXT.md, ARCHITECTURE.md, docs/adr/}
│   └── desktop/{CONTEXT.md, ARCHITECTURE.md, docs/adr/}
├── services/
│   ├── control-plane/{CONTEXT.md, ARCHITECTURE.md, docs/adr/}
│   └── agent-runtime/{CONTEXT.md, ARCHITECTURE.md, docs/adr/}
└── packages/CONTEXT.md
```

## Use the glossary's vocabulary

When your output names a domain concept (issue titles, implementation notes, refactor proposals, tests), use terms as defined in the owning context's `CONTEXT.md` (see `CONTEXT-MAP.md` for which context owns what). Avoid synonyms that conflict with the glossary.

If a needed concept is missing from the glossary, flag it explicitly rather than inventing new terminology.

## Flag ADR conflicts

If proposed work contradicts an existing ADR, surface it explicitly rather than silently overriding:

> Contradicts ADR-XXXX — worth reopening because...
