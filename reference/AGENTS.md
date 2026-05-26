# Reference library map

Upstream pattern ground truth for building an **OpenClaw-like shell** on **LangChain DeepAgents (TypeScript)**. This folder is not our app code — it is read-only context for coding agents.

## How to read (progressive disclosure)

1. Open the **topic card** for your task: [`topics/`](topics/).
2. Run the card’s `rg -n "SECTION:…"` commands against the listed pack — **do not load full `*-llms.txt` files**.
3. `Read` only ~200–400 lines around each hit (use line numbers from `rg` or [`ANCHORS.md`](ANCHORS.md)).
4. Implement in **our** TypeScript shell; use **DeepAgents** for brain/tools/memory/subagents.

## Brain vs shell

| Topic card | We implement in shell? |
|------------|-------------------------|
| architecture, gateway, channels, sessions, cron, heartbeat, workspace, routing, hooks | **Yes** (TypeScript control plane) |
| memory, tools, subagents, agent-runtime | **No** — parity reference only; use DeepAgents |

## Global invariants

- Do not port upstream OpenClaw sources verbatim into our repo — adapt patterns in TypeScript.
- Do not reimplement planning, tool loop, vfs, or subagents in the shell.
- Packs are **read-only**; change upstream or our `src/`, not `*-llms.txt`.
- Prefer `SECTION:` aliases from topic cards over guessing APIs.

## Topic index (1:1 with `*-llms.txt`)

| Card | Load when |
|------|-----------|
| [architecture](topics/architecture.md) | Brain vs shell, product shape |
| [gateway](topics/gateway.md) | WS, protocol, auth, HTTP APIs |
| [channels](topics/channels.md) | Channel adapters, delivery |
| [sessions](topics/sessions.md) | Session keys, store, compaction |
| [cron](topics/cron.md) | Scheduler, task ledger |
| [heartbeat](topics/heartbeat.md) | Periodic wake, HEARTBEAT_OK |
| [workspace](topics/workspace.md) | SOUL, AGENTS, SKILL layout |
| [routing](topics/routing.md) | Multi-tenant routing |
| [hooks](topics/hooks.md) | Hooks, event bus |
| [memory](topics/memory.md) | Parity only — DeepAgents LTM |
| [tools](topics/tools.md) | Parity only — DeepAgents tools |
| [subagents](topics/subagents.md) | Parity only — DeepAgents subagents |
| [agent-runtime](topics/agent-runtime.md) | Parity only — inner loop |

Regenerate packs: `node scripts/generate-reference-llms.mjs` — see [README.md](README.md).
