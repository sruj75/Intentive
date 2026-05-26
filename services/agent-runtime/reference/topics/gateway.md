# Gateway

**Role:** Shell — **implement** in TypeScript.

## Load when

- WebSocket server, connect/auth handshake, gateway protocol, config, HTTP APIs.

## Do not use for

- Agent tool loop or LLM turns (DeepAgents).

## Invariants

- Session must be established before agent methods run.
- Auth failures return structured errors, not opaque 500s.
- Protocol/schema is source of truth for wire format — do not invent RPC names.
- Extract **behavior** from OpenClaw; implement in TypeScript — do not copy upstream sources verbatim.

## Dig deeper

| Source | Command |
|--------|---------|
| OpenClaw | `rg -n "SECTION:gateway:protocol" reference/openclaw/gateway-llms.txt` |
| OpenClaw | `rg -n "SECTION:gateway:authentication" reference/openclaw/gateway-llms.txt` |
| OpenClaw | `rg -n "SECTION:gateway:configuration" reference/openclaw/gateway-llms.txt` |

## Last resort

- `reference/openclaw/gateway-llms.txt`

[← Reference map](../AGENTS.md)
