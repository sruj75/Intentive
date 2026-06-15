# Reference harness

Progressive-disclosure context for coding agents building an OpenClaw-like **shell** on **LangChain DeepAgents (TypeScript)**.

## Three layers

| Layer      | Path                       | Purpose                                                   |
| ---------- | -------------------------- | --------------------------------------------------------- |
| Map        | [AGENTS.md](AGENTS.md)     | How to read; topic index (~50 lines)                      |
| Cards      | [topics/](topics/)         | Per-topic invariants + `rg SECTION:` breadcrumbs          |
| DeepAgents | [deepagents/](deepagents/) | Upstream production guides (memory, backends, guardrails) |
| Depth      | `openclaw/*-llms.txt`      | Repomix packs with `SECTION:` markers                     |
| Index      | [ANCHORS.md](ANCHORS.md)   | Generated section id → line (after regen)                 |

**Start at [AGENTS.md](AGENTS.md) → a topic card.** Do not load full `*-llms.txt` files into context.

## Regenerate packs

```bash
git clone --depth 1 https://github.com/openclaw/openclaw.git /tmp/openclaw-ref
node scripts/generate-reference-llms.mjs
```

Custom clone path:

```bash
OPENCLAW_REPO=~/src/openclaw node scripts/generate-reference-llms.mjs
```

Config: [`scripts/reference-config.mjs`](../scripts/reference-config.mjs) (includes, `SECTION_ALIASES`, topic list).

**Maintainers:** use the personal Cursor skill **reference-txt-manager** (`~/.cursor/skills/reference-txt-manager/`).

## Source

- [OpenClaw](https://github.com/openclaw/openclaw)
