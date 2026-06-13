# ADR 0012: DeepAgents-Native Two-Tier Memory; conversation_messages Is the Client/Eval Record, Not the Model's Memory

## Status

Accepted (supersedes ADR-0010)

## Date

2026-06-13

## Context

ADR-0010 made `conversation_messages` the model's authoritative memory and
rebuilt the model context from it every turn, treating the LangGraph checkpointer
as mid-turn-only — an OpenClaw-transcript port. Per ADR-0001 we default to
OpenClaw patterns, but the governing rule is sharper: **OpenClaw and DeepAgents
are both battle-tested; pick whichever is simpler and does not fight the tool we
already committed to.** We committed to DeepAgents as the brain, so the default
leans DeepAgents-native unless a product requirement forces OpenClaw's way.

The DeepAgents JS docs (harness, memory, backends) confirm a native two-tier
model:

- **Short-term:** LangGraph **thread checkpoints** carry the running conversation
  across turns within a `thread_id`; built-in **summarization + context
  offloading** middleware keeps it within the window automatically.
- **Long-term:** a **`StoreBackend`** (cross-thread) namespaced by `user_id`, or
  a **custom `BackendProtocolV2`** backend. Postgres is the docs' explicit
  example (`files(path, content, mime_type, …)`, `WHERE path LIKE`, namespace
  `(user_id)`) — i.e. exactly our USER.md/MEMORY.md overlay model.

ADR-0010 fought both the thread carrying and the compaction middleware, and it
contradicted the pre-existing **Persistence Adapter** (which wraps LangGraph's
Postgres checkpoint store for the `runtime`/`memory` domains — only coherent if
the checkpointer _is_ the working memory). The code shipped in #29 already treats
`conversation_messages` as the read projection behind the Session Snapshot, never
a model input. ADR-0010 was the outlier.

## Decision

| Concern                                  | Owner                                  | Mechanism                                                                                                                                |
| ---------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Model working memory (cross-turn)        | DeepAgents                             | LangGraph thread checkpoint, `thread_id` per user/Agent Instance                                                                         |
| Compaction                               | DeepAgents                             | native summarization/offloading middleware; compacted state persists _in the checkpoint_ — the shell does **not** hand-persist summaries |
| Client-readable transcript + eval anchor | Intentive                              | `conversation_messages`, dual-written per turn (built in #29); feeds Session Snapshot / history backfill — **not** the model's memory    |
| Long-term curated memory                 | Intentive backend / DeepAgents surface | USER.md/MEMORY.md via a custom Neon `BackendProtocolV2` backend, namespaced by `user_id`                                                 |
| "What did the model see on turn N?"      | Langfuse traces                        | the trace captures the actual per-turn model input                                                                                       |

We keep `conversation_messages` because clients need a queryable transcript and
the checkpoint is opaque — but it is a **parallel product record**, not the
model's brain. The only piece we own and build is the custom Neon VFS backend,
which uses DeepAgents' own extension point rather than fighting it. This is
strictly less code than ADR-0010.

## Consequences

### Positive

- Uses DeepAgents/LangGraph native thread + compaction — less code, no fighting.
- Consistent with the pre-existing Persistence Adapter and shipped #29 code.
- Eval/replay served by Langfuse traces (the real model input), not by replaying
  a transcript.
- Long-term memory uses the documented Postgres backend pattern.

### Negative

- Two durable stores for the conversation (thread checkpoint + `conversation_messages`),
  dual-written; they must stay content-consistent per turn.
- "What the model saw" lives in opaque checkpoint state — mitigated by Langfuse.

### Neutral / Follow-up

- With one eternal thread per user (ADR-0011), the single thread is summarized
  indefinitely; summary-of-summary drift over long horizons is a Phase 11
  retention concern, deferred.
- Exact `thread_id` choice (`user_id` vs `agent_instance_id`) and the dual-write
  ordering are an implementation detail for the runtime slice.
