# Going to production (DeepAgents upstream)

**Role:** Upstream production ground truth — **read before** changing memory backends, checkpointer wiring, guardrails, or deployment shape.

## Load when

- Scoping memory across users, threads, or assistants
- Choosing backends (`StateBackend`, `StoreBackend`, `CompositeBackend`) or sandboxes
- Adding rate limits, retry middleware, permissions, or PII handling
- Deciding whether a production concern belongs in DeepAgents vs the Intentive shell

## Do not use for

- OpenClaw shell patterns (use the OpenClaw topic cards instead)
- LangSmith Managed Deep Agents deploy steps (we self-host on GCE)
- Copying Python snippets verbatim into TypeScript without checking `deepagentsjs` API

## Invariants

- **User-scoped memory `(user_id)` is the recommended default** — Intentive uses `["memories", user_id]` (see `#user-recommended` in upstream docs).
- Memory is **files in a VFS**; cross-thread LTM routes through `StoreBackend` inside `CompositeBackend`.
- **`FilesystemBackend` / `LocalShellBackend` are not for production.**
- **`thread_id` and `user_id` are independent** — pass both on every invoke.
- Shell owns ingress, auth, transcript projection, and procedure floor injection; **DeepAgents owns** the brain loop, checkpoints, compaction, and `/memories/` VFS.

## Dig deeper

| Source                 | Path                                                                                                             |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Full distilled guide   | [`../deepagents/going-to-production.md`](../deepagents/going-to-production.md)                                   |
| Upstream (Python)      | [docs.langchain.com — Going to production](https://docs.langchain.com/oss/python/deepagents/going-to-production) |
| Intentive memory ADRs  | `docs/adr/0012-*`, `docs/adr/0021-*`                                                                             |
| Shipped memory backend | `src/domains/memory/repo/memory-backend.ts`                                                                      |
| Shipped adapter        | `src/domains/runtime/repo/deep-agents-adapter.ts`                                                                |

## Last resort

- Fetch live upstream: `https://docs.langchain.com/oss/python/deepagents/going-to-production#user-recommended`

[← Reference map](../AGENTS.md)
