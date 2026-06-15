# DeepAgents: Going to production

Upstream ground truth for productionizing a Deep Agent. Distilled from LangChain's guide so coding agents can load it without fetching the web.

**Source:** [Going to production](https://docs.langchain.com/oss/python/deepagents/going-to-production) (Python docs; patterns apply to `deepagentsjs` / TypeScript).

**Intentive mapping:** see [Intentive production choices](#intentive-production-choices) at the bottom.

---

## Overview

Agents use **memory** and their **execution environment** to accomplish tasks. In production, three primitives determine how information is shared:

| Primitive     | What it is                         | Default scope                                                                                         |
| ------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Thread**    | A single conversation              | Message history and scratch files stay in the thread; do not carry over by default                    |
| **User**      | Someone interacting with the agent | Memory and files can be private to a user or shared across users; identity comes from your auth layer |
| **Assistant** | A configured agent instance        | Memory and files can be tied to one assistant or shared across all of them                            |

Every production deployment should provision: **threads**, **runs**, a **store**, and a **checkpointer**. LangSmith Deployments / Managed Deep Agents do this for you. Intentive self-hosts on GCE with Postgres checkpointer + store (see mapping below).

---

## Production considerations

### Invoking the agent

Every invocation should carry two run-level parameters:

1. **`thread_id`** — stable conversation id. The checkpointer uses it to persist and resume message history. Reuse for follow-ups; generate a new one for a fresh conversation.
2. **`context` / `configurable`** — per-run data tools and middleware read at invocation time (`user_id`, feature flags, session metadata).

These are independent and almost always passed together:

```typescript
await agent.invoke(
  { messages: [{ role: "user", content: "Plan a 3-day trip to Tokyo" }] },
  {
    configurable: {
      thread_id: threadId, // stable per user/conversation
      user_id: userId, // scopes memory + auth
    },
  },
);
```

### Multi-tenancy and auth

When serving multiple users, handle three concerns:

- **User identity and access control** — establish who the user is; tag resources with ownership; filter so users only see their own threads/store namespaces.
- **Team RBAC** — who on your team can deploy, configure, and monitor (separate from end-user auth).
- **End-user credentials** — when the agent calls external APIs on behalf of a user, pass credentials via OAuth / Agent Auth or credential injection; never hardcode user tokens.

**Memory scoping and execution environment scoping determine what data is shared between users.** See [Memory scoping](#memory-scoping).

### Async and durability

- Use **async** for external resource lifecycle (sandbox creation, MCP connections). Graph factories that provision these resources should be async.
- Deep Agents run on LangGraph, which provides **durable execution**: checkpoints at each step so interrupted runs resume without reprocessing completed work.

---

## Memory

Without memory, every conversation starts from scratch. Memory lets the agent retain preferences, learned instructions, and past experiences across conversations.

### Memory scoping

Memory is always persistent across conversations. The main question is how it is scoped across user and assistant boundaries:

| Scope                              | Namespace        | Use case                                        | Example                           |
| ---------------------------------- | ---------------- | ----------------------------------------------- | --------------------------------- |
| **User** (**recommended default**) | `(user_id)`      | Per-user preferences and context                | "I prefer concise responses"      |
| **Assistant**                      | `(assistant_id)` | Shared instructions for one assistant           | "Cap posts at 280 characters"     |
| **Global**                         | `(org_id)`       | Read-only policies for all users and assistants | "Never disclose internal pricing" |

> **User-recommended (default):** namespace by `user_id` alone. Each user gets private memory. This is the recommended default since most applications deploy a single assistant.

**Security:** Shared memory (assistant, user, or org scope) is a vector for **prompt injection**. If one user can write to memory another user's conversation reads, a malicious user could inject instructions into shared state. Enforce read-only access where appropriate (e.g. org-wide policies writable only through application code, not by the agent). Use [permissions](https://docs.langchain.com/oss/python/deepagents/permissions) or [backend policy hooks](https://docs.langchain.com/oss/python/deepagents/backends#add-policy-hooks).

### Configuration

In Deep Agents, memory is stored as **files in a virtual filesystem**. By default, files are scoped to a single thread and not shared across threads.

To share memory across threads, route a path like `/memories/` to a **`StoreBackend`** that writes to the LangGraph **Store**. Use a **`CompositeBackend`** to give the agent both thread-scoped scratch space and cross-thread long-term memory:

- **`StateBackend`** (default route): thread-scoped scratch; persists across turns within a thread via checkpointer; not shared across threads. Avoid writing large files (checkpointed every step).
- **`StoreBackend`** (routed path, e.g. `/memories/`): cross-thread storage; scope with a namespace factory (`user_id`, `assistant_id`, etc.).
- **`CompositeBackend`**: mix both — scratch by default, durable routes for specific paths.

**Do not use in production:** `FilesystemBackend` and `LocalShellBackend` access the host directly.

#### User-scoped memory (recommended)

Python (upstream):

```python
from deepagents import create_deep_agent
from deepagents.backends import CompositeBackend, StateBackend, StoreBackend

agent = create_deep_agent(
    backend=CompositeBackend(
        default=StateBackend(),
        routes={
            "/memories/": StoreBackend(
                namespace=lambda rt: (rt.server_info.user.identity,),
            ),
        },
    ),
    system_prompt="""You have persistent memory at /memories/.
    Read accumulated preferences at the start of each conversation.
    When you learn something that should persist, update /memories/.""",
)
```

TypeScript (Intentive shape — see `memory/repo/memory-backend.ts`):

```typescript
import { CompositeBackend, StateBackend, StoreBackend } from "deepagents";

const backend = new CompositeBackend(new StateBackend(), {
  "/memories/": new StoreBackend({
    store,
    namespace: ({ config }) => ["memories", config?.configurable?.user_id],
  }),
});
```

Other scoping patterns (when needed):

| Pattern          | Namespace                 | When to use                                        |
| ---------------- | ------------------------- | -------------------------------------------------- |
| Assistant-scoped | `(assistant_id)`          | Shared instructions for all users of one assistant |
| User + assistant | `(assistant_id, user_id)` | Per-user memory within one assistant               |
| Org-scoped       | `(org_id)`                | Read-only org policies; restrict agent writes      |

Application code can also read/write the store via the [Store API](https://docs.langchain.com/langsmith/custom-store).

---

## Execution environment

Locally, agents can read/write files on disk and run shell commands directly. In production, choose based on whether the agent needs to **execute code**:

| Need                                                  | Choice                                                                       |
| ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| File read/write only                                  | **Filesystem backends** (`StateBackend`, `StoreBackend`, `CompositeBackend`) |
| Run shell commands, install packages, beyond file I/O | **Sandboxes** — isolated container with `execute` tool                       |

### Sandboxes (when code execution is required)

Sandboxes provide filesystem + `execute` inside an isolated container. If agent code exhausts memory or crashes, only the sandbox is affected.

| Scope                | Lifecycle                           | Example                                            |
| -------------------- | ----------------------------------- | -------------------------------------------------- |
| **Thread-scoped**    | Fresh per conversation, TTL cleanup | Data analysis bot — each conversation starts clean |
| **Assistant-scoped** | Shared across all conversations     | Coding assistant with cloned repo across sessions  |

Use async **graph factories** (not static graphs) when sandbox creation needs `thread_id` or `assistant_id` from run config.

**File transfers:** use `upload_files()` / `download_files()` to seed sandboxes (skills, user files, memories) and retrieve artifacts. Consider custom middleware with `before_agent` / `after_agent` hooks to sync skills and memories across the sandbox boundary.

**Secrets:** prefer the **sandbox auth proxy** (credentials injected into outbound requests; keys never in sandbox env/files). Avoid passing secrets via environment variables or file uploads inside sandboxes.

---

## Guardrails

Agents in production run autonomously. Two protection layers:

1. **[Permissions](https://docs.langchain.com/oss/python/deepagents/permissions)** — declarative allow/deny rules for file read/write; isolate working directory; protect sensitive files; enforce read-only memory paths.
2. **[Middleware](https://docs.langchain.com/oss/python/langchain/middleware/built-in)** — wrap model and tool calls for rate limiting, error handling, and data privacy.

### Rate limiting

Cap the agent's own LLM and tool usage **within a run** (not API gateway rate limiting):

```python
from langchain.agents.middleware import ModelCallLimitMiddleware, ToolCallLimitMiddleware

middleware=[
    ModelCallLimitMiddleware(run_limit=50),
    ToolCallLimitMiddleware(run_limit=200),
]
```

- `run_limit` — caps per invocation (resets each turn)
- `thread_limit` — caps across entire conversation (requires checkpointer)

### Error handling

- **Transient failures** (timeouts, rate limits) → retry automatically (`ModelRetryMiddleware`, `ToolRetryMiddleware`)
- **Recoverable LLM errors** (bad tool output) → feed back to model
- **Human-input errors** → pause agent (interrupts)
- **Primary model down** → `ModelFallbackMiddleware` to alternative model

Scope `ToolRetryMiddleware` to specific external-API tools, not all tools.

### Data privacy

Use `PIIMiddleware` to detect/redact emails, credit cards, etc. before they reach the model or logs. Strategies: `redact`, `mask`, `hash`, `block`.

---

## Frontend

For LangSmith-hosted agents, use [`useStream`](https://docs.langchain.com/oss/python/langchain/frontend/overview) to connect UI to the agent backend. In production, point at your deployment URL and enable reconnection so users don't lose progress on disconnect.

Intentive v1 does **not** use `useStream` — Mobile/Desktop speak the shared WebSocket Protocol in `packages/protocol/`.

---

## Deployment options (LangChain)

| Path                                                                                                           | When                                                                          |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **[Managed Deep Agents](https://docs.langchain.com/langsmith/managed-deep-agents-overview)** (private preview) | Recommended hosted path — durable runs, thread state, managed file tree, MCP  |
| **[LangSmith Deployment](https://docs.langchain.com/langsmith/deployment)**                                    | Custom application code, custom routes, advanced auth, full Agent Server APIs |
| **Self-hosted**                                                                                                | Full control; you provision checkpointer, store, auth, observability          |

LangSmith Cloud deployments auto-send traces. Also consider [LangSmith Engine](https://docs.langchain.com/langsmith/engine) for trace monitoring and issue detection.

---

## Intentive production choices

How this repo maps upstream guidance (Agent Runtime on GCE, always-alive, multi-tenant):

| Upstream concern                             | Intentive choice                                                                                      | Where                                               |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| **User-scoped memory (recommended default)** | `StoreBackend` namespace `["memories", user_id]`; one Companion per user                              | `memory/repo/memory-backend.ts`, ADR-0012, ADR-0021 |
| **`thread_id`**                              | Stable per user (`thread_id` = user's eternal conversation)                                           | `runtime/repo/deep-agents-adapter.ts`, ADR-0011     |
| **`user_id` in configurable**                | Passed on every invoke; required for memory namespace                                                 | `deep-agents-adapter.ts`                            |
| **CompositeBackend**                         | `StateBackend` default + `/memories/` → `StoreBackend`                                                | `memory-backend.ts`                                 |
| **Procedure floor vs memory**                | Floor injected via prompt assembly (Langfuse); not in VFS. `USER.md` injected; `/memories/` on demand | ADR-0021, ADR-0022                                  |
| **Client transcript**                        | `conversation_messages` is client/eval record, **not** model memory                                   | ADR-0012                                            |
| **Checkpointer**                             | Postgres via `PostgresSaver`                                                                          | `deep-agents-adapter.ts`                            |
| **Sandboxes / code execution**               | **Not in v1** — file I/O only via backends                                                            | —                                                   |
| **Deployment**                               | Self-hosted always-alive GCE VM, not LangSmith Deployment                                             | `AGENTS.md`                                         |
| **Frontend**                                 | WebSocket Protocol, not `useStream`                                                                   | `packages/protocol/`                                |
| **Multi-tenant**                             | Shared compute; isolate by `user_id` (no `tenant_id` in v1)                                           | ADR-0016                                            |
| **Guardrails**                               | Follow upstream middleware/permissions patterns when adding; not all wired in v1 yet                  | —                                                   |

When extending memory, backends, or guardrails, **start from this doc and the upstream link**, then align with Intentive ADRs — do not reimplement DeepAgents primitives in the shell.
