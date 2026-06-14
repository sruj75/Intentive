# ADR 0021: v1 Agent VFS Is the Native DeepAgents CompositeBackend — Procedure Floor Is Injected (Structural Immutability), Per-User Memory Is a Postgres StoreBackend Namespace

## Status

Accepted — refines ADR-0005; amends ADR-0012; renders the ADR-0004 overlay-merge inert in v1. Supersedes the "v1 Bundle Path Set is locked to six paths" and "VFS write policy" decisions in CONTEXT.md.

## Date

2026-06-15

## Context

Issue #37 ("Neon-Backed VFS, Bundles, and Memory") was scoped as: build a **custom Neon `BackendProtocolV2`** backend (rows keyed by path), a locked **six-path VFS**, **overlay-first** read resolution, and a **write-rejection** guard for the immutable procedure files. Grilling that scope against the DeepAgents docs (LangChain's [DeepAgents memory doc](https://docs.langchain.com/oss/python/deepagents/memory) and the [Agent Builder memory blog](https://www.langchain.com/blog/how-we-built-agent-builders-memory-system)) showed most of it is either a hand-rolled re-implementation of a native pattern, or machinery for a case v1 does not have.

The native pattern is a `CompositeBackend` that routes paths to built-in backends:

```python
backend = CompositeBackend(
    default = StateBackend(),                                       # thread-scoped working memory
    routes  = { "/memories/": StoreBackend(namespace=lambda rt: (user_id,)) },  # long-term, per-user
)
```

LangChain's own product stores these files in Postgres and exposes them to the agent "in the shape of a filesystem… natively supported by DeepAgents — completely pluggable so you could bring any storage layer you want." That is exactly the Intentive intent, and it is configuration over a provided `StoreBackend`, not a from-scratch backend.

## Decision

1. **The agent's VFS is the native `CompositeBackend`.** Default `StateBackend` (thread working memory, already persisted by the Neon checkpointer wired in #36) plus a **`StoreBackend` route for long-term memory, namespaced by `(user_id,)`, backed by a Postgres store on Neon.** Files are Postgres rows exposed as a filesystem — native and pluggable, **not** a hand-rolled `BackendProtocolV2`.

2. **Memory is a per-user namespace (a folder), not a single locked `MEMORY.md`.** The agent manages multiple files under its memory namespace (e.g. daily traces, the watch-list). This makes `ls`/`grep`/`glob` and read-on-demand genuinely useful and lets memory grow without bloating every turn. `USER.md` remains a single compact profile file in the same store.

   **Injection policy (two different rules over one store):** `USER.md` is the OpenClaw-style **user profile** — the shell **reads it and injects it every turn**, kept compact by instruction (not a shell cap). The `/memories/` folder is **DeepAgents-native**: the agent reads/writes it **on demand** via VFS tools; the **shell never auto-loads memory** (honoring the reference invariant "do not implement LTM in the shell — DeepAgents owns it"). OpenClaw's shell-side memory auto-load, distillation, and decay are **not** ported — that shape, if desired, is agent behavior driven by the procedure floor, not shell machinery. v1 retrieval is literal `grep`/`glob`/`read`; semantic search is deferred.

3. **The procedure floor is injected, not routed into the VFS.** `SOUL.md`, `AGENTS.md`, `BOOTSTRAP.md`, `HEARTBEAT.md` are versioned product content composed into the per-turn system prompt by the trigger-aware prompt-assembly middleware. They are **not** files the agent can `ls`/`read`/`write`. Their immutability is therefore **structural** (the agent cannot write what it cannot see) — the ADR-0005 write-rejection guard is unnecessary and is dropped.

4. **No overlay-first merge in v1.** With the procedure floor injected (store-absent) and memory store-only (default-absent), no path ever has both a Bundle Default and a User Overlay. The overlay-merge contract (ADR-0004 §3) has no live read path in v1; the general merge engine stays deferred to the future self-personalization ADR (ADR-0005's deferral), to be built when the agent is allowed to augment its own procedure files.

5. **Procedure-floor versioning is unchanged in shape; its store is resolved by ADR-0022.** The injected content is still versioned, pinned per WebSocket connection (the Pinned Bundle Version), and stamped on each `runtime_turns` row — only its _delivery_ (injected prompt content) differs from "a file in the VFS." **ADR-0022** resolves _where_ it is versioned: **Langfuse Prompt Management** (registry-first), not files-in-deploy and not a Neon bundle table.

## Considered Options

- **Hand-rolled custom Neon `BackendProtocolV2` (rejected for v1).** Re-implements what `StoreBackend` + a Postgres store provide natively; more code, fights the library.
- **Files-in-state only, no store (rejected).** Free durability via the checkpointer, but memory would live inside the opaque per-user checkpoint blob — not queryable as Postgres rows, not cross-thread. The native `StoreBackend` route gives inspectable per-user rows for the same effort.
- **Procedure files exposed read-only and write-rejected (rejected).** Expose-then-forbid is strictly more machinery than never-expose, for the same guarantee.

## Consequences

- Deletes the largest hand-built chunk of #37 (custom backend, overlay resolver, write-rejection guard) in favor of native configuration.
- Aligns with the LangChain-blessed pattern; per-user isolation is the `StoreBackend` namespace tuple, not bespoke `(user_id, path)` SQL.
- Structural immutability is simpler and harder to get wrong than an enforced guard.
- Memory-as-namespace fits an always-on companion accumulating memory over months.
- **TS verification (confirmed 2026-06-15):** the installed `deepagents@1.10.2` exports `StateBackend`, `StoreBackend`, `CompositeBackend`, `FilesystemBackend` as classes implementing `BackendProtocolV2`; `@langchain/langgraph-checkpoint-postgres@1.0.3` exports `PostgresStore extends BaseStore` (with native vector/embeddings search, so semantic `memory_search` is a later config-flip). No hand-rolled backend and no thin adapter are needed — the native `CompositeBackend` + `StoreBackend`/`PostgresStore` pattern is buildable as-is.
- **Domain structure (decided 2026-06-15):** `bundles` is no longer a Neon document store with overlay resolution — it becomes the Langfuse-fetch + prompt-assembly concern (and may fold into the prompt-assembly middleware rather than remain a standalone domain). `memory` is the `CompositeBackend`/`StoreBackend` wiring + the `(user_id,)` namespace, not a "virtual filesystem overlay." The `CLAUDE.md` domain descriptions are updated when those (currently lazy/unbuilt) domains are implemented.
- **Compaction (decided 2026-06-15):** v1 relies on DeepAgents' **native summarization** middleware; OpenClaw's pre-compaction "write durable memory" silent-turn flush is **not** ported in v1.
- **Vocabulary follow-up:** CONTEXT.md's "Bundle Path Set" / "Bundle Default" / "User Overlay" / "overlay-first" terms are superseded by "injected procedure floor" + "per-user memory namespace" and need a vocabulary pass.
