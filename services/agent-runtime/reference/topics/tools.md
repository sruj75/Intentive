# Tools (parity)

**Role:** Parity reference — **do not implement tool loop in the shell**.

## Load when

- Understanding OpenClaw tool naming, exec approval, or invoke boundaries.

## Do not use for

- Registering LangChain tools in gateway (use DeepAgents).

## Invariants

- **DeepAgents** owns tool registration, invocation, and policy.
- Gateway may expose **HTTP/WS invoke** endpoints that delegate to the agent runtime.
- Learn patterns from OpenClaw; implement via DeepAgents in TypeScript.

## Dig deeper

| Source | Command |
|--------|---------|
| OpenClaw | `rg -n "SECTION:tools:index-doc" reference/openclaw/tools-llms.txt` |
| OpenClaw | `rg -n "SECTION:tools:exec-doc" reference/openclaw/tools-llms.txt` |

## Last resort

- `reference/openclaw/tools-llms.txt`

[← Reference map](../AGENTS.md)
