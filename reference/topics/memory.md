# Memory (parity)

**Role:** Parity reference — **do not implement LTM in the shell**.

## Load when

- Comparing OpenClaw memory **API shape** while configuring DeepAgents memory.

## Do not use for

- Building a parallel memory store in gateway code.

## Invariants

- **DeepAgents** owns long-term memory and virtual filesystem semantics.
- Shell may pass session/user ids into DeepAgents memory config — no duplicate index.
- Read packs for naming and config keys only.

## Dig deeper

| Source | Command |
|--------|---------|
| OpenClaw | `rg -n "SECTION:memory:config-doc" reference/openclaw/memory-llms.txt` |

## Last resort

- `reference/openclaw/memory-llms.txt`

[← Reference map](../AGENTS.md)
