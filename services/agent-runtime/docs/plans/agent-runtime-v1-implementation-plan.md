# Agent Runtime V1 Implementation Plan

## Status

Draft plan, ready to slice into local issues.

## Goal

Build the always-alive, multi-tenant **Agent Runtime** that runs **Companion** behavior for every User. The Runtime uses **DeepAgents** for the agent harness and an Intentive-owned TypeScript shell for product boundaries: WebSocket Protocol, per-user event ordering, Neon-backed durable state, Cron, Heartbeat, Post-Message-Back, and Control Plane integration.

Implementation should use the local OpenClaw/Hermes reference library at `services/agent-runtime/reference/` as the first pattern source. Start from `services/agent-runtime/reference/AGENTS.md`, then load the relevant topic card under `services/agent-runtime/reference/topics/` before reading any raw `reference/openclaw/*-llms.txt` pack.

## Non-goals

- Do not build a standalone `channels` domain in v1. Mobile, Desktop, and future Android are Clients speaking the shared WebSocket **Protocol**, not external message channels.
- Do not put the Control Plane in the client message data path.
- Do not reimplement DeepAgents planning, tool execution, virtual filesystem, skills, memory, subagents, or compaction in shell code.
- Do not create per-user VMs, per-user processes, per-user schemas, `tenant_id`, or org/workspace tenancy in v1.
- Do not add Mobile on-device chat persistence in v1.

## Capability split

| Capability                 | Owner                                           | Notes                                                                                    |
| -------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Chat loop                  | DeepAgents                                      | Runtime shell invokes DeepAgents per ordered user/system event.                          |
| Tool execution             | DeepAgents                                      | Intentive registers product tools and policies; shell does not run a parallel tool loop. |
| Virtual filesystem         | DeepAgents backend contract + Intentive backend | Implement Neon-backed backend with bundle/default plus user overlay resolution.          |
| Skills                     | DeepAgents                                      | Runtime bundle provides product skills and prompt documents.                             |
| Memory                     | DeepAgents surface + Intentive storage policy   | Store durable user memory in Runtime-owned Neon schema.                                  |
| Compaction/context offload | DeepAgents                                      | Runtime owns retention and observability policy.                                         |
| WebSocket Protocol         | Intentive shell                                 | Public client ingress and shared client unification layer.                               |
| Event-driven processing    | Intentive shell                                 | Convert all triggers into durable per-user runtime events.                               |
| Cron                       | Intentive shell                                 | Durable scheduled trigger primitive; may invoke DeepAgents.                              |
| Heartbeat                  | Intentive shell                                 | Periodic/liveness trigger primitive; may invoke DeepAgents and may stay silent.          |
| Multi-layer prompts        | Intentive bundle + DeepAgents config            | Bundle documents, user overlays, skills, and dynamic prompt assembly.                    |
| Post-Message-Back          | Intentive shell                                 | Deliberate proactive message primitive and only push-notification origin.                |
| Neon Auth                  | Control Plane + Providers                       | Runtime verifies client JWTs locally via shared provider, but does not own auth state.   |

## Architecture shape

```text
Mobile Client                 Desktop Client
  user_message                  context_snapshot/session_end_marker
       \                              /
        \-------- WebSocket Protocol-/
                       |
                  gateway domain
          connect/auth/protocol validation
                       |
                  sessions domain
        user_id event queue, ordering, idempotency
                       |
                  protocol domain
         inbound event -> runtime command mapping
                       |
                  runtime domain
          DeepAgents invocation and turn lifecycle
                       |
          memory + bundles + Conversation History
             Neon Runtime schema, user_id scoped
                       |
          companion_message or Post-Message-Back
                       |
       WebSocket delivery or Control Plane push request
```

## Data model, first pass

Use a separate Agent Runtime schema and Postgres role from the Control Plane schema.

| Table family                    | Purpose                                                                                                         |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `agent_instances`               | One logical Agent Instance per `user_id`.                                                                       |
| `conversation_messages`         | Authoritative Conversation History.                                                                             |
| `runtime_events`                | Durable inbound/system event ledger with idempotency keys.                                                      |
| `runtime_turns`                 | DeepAgents invocation records, status, timing, and trace IDs.                                                   |
| `runtime_checkpoints`           | LangGraph/DeepAgents checkpoint persistence if not fully handled by a library storage adapter.                  |
| `runtime_bundle_versions`       | Immutable product behavior documents such as `AGENTS.md`, `SOUL.md`, `BOOTSTRAP.md`, and `HEARTBEAT.md`.        |
| `runtime_vfs_documents`         | User overlay documents keyed by `user_id` and path.                                                             |
| `cron_jobs` / `cron_runs`       | Scheduled trigger definitions, due-fire state, and fire outcome ledger (#39; main-thread flip ADR-0029 in #41). |
| `deliveries`                    | Unified Companion message delivery attempt ledger (`stream`/`push` paths; ADR-0028, #41).                       |
| _(deferred)_ `heartbeat_states` | Not built in v1 — Heartbeat due-ness is computed from `agent_instances` + `runtime_turns` (ADR-0027, #40).      |

All user-owned Runtime rows are scoped by `user_id`. The User is the tenant in v1.

## Phase 0: Resolve contracts before code

1. Accept monorepo ADR-0002: no standalone `channels` domain in v1.
2. Verify Agent Runtime ADR-0004 and `services/agent-runtime/CONTEXT.md` agree that overlays are scoped by `user_id` rather than `tenant_id`.
3. Confirm `packages/protocol` event names and handshake match the current `CONTEXT-MAP.md` and `packages/CONTEXT.md` vocabulary.
4. Decide whether the initial DeepAgents persistence adapter is direct Postgres, LangGraph store over Postgres, or a thin repo-owned adapter that can be swapped later.
5. Decide the first set of bundle documents for v1: likely `AGENTS.md`, `SOUL.md`, `BOOTSTRAP.md`, `HEARTBEAT.md`, `USER.md`, and `MEMORY.md`.

Exit criteria:

- Context, ADRs, and this plan agree on tenancy, protocol, and no standalone channels.
- The first implementation issues can be cut without reopening product boundaries.

## Phase 1: Runtime skeleton (lazy domains)

1. Add the shared Runtime config seam at `src/config/env.ts` (`loadConfig`) — ports, public WebSocket URL, internal API secret, Neon connection string, JWKS config. Do **not** pre-create empty domain layer trees; per ADR-0002, add `src/domains/<name>/…` only when a vertical slice implements real behavior.
2. Add config tests (`test/config-env.test.mjs`) and domain test harnesses / in-memory fakes before wiring Neon.
3. Keep `src/index.ts` as a thin workspace entry that re-exports service surfaces; add `src/main.ts` as the process composition root when the HTTP/WebSocket server lands.

Exit criteria:

- `pnpm --filter @intentive/agent-runtime typecheck` passes.
- Domain folders compile and obey layer direction.
- No domain imports from another deployable source tree.

## Phase 2: WebSocket gateway and internal session start

1. Implement `POST /internal/sessions/start` behind shared-secret auth.
2. Create or load the Agent Instance for `user_id` behind a repo interface; use an
   in-memory registry until the Neon-backed repo lands with durable Runtime state.
3. Implement WebSocket server with handshake-first behavior.
4. Verify JWT locally through `packages/providers`.
5. Accept only `connect` before handshake; reject malformed pre-handshake events and auth failures with structured errors. Protocol compatibility is enforced at build time by the monorepo's single shared `packages/protocol` version, not negotiated per connection.
6. Return `hello_ok` with the Session Snapshot shape. #29 fills the projection from `conversation.readSnapshot`; until then the snapshot is empty.

Exit criteria:

- Client cannot send `user_message`, `context_snapshot`, or `presence_update` before `connect`.
- Auth failure does not call Runtime or mutate state.
- Successful reconnect emits snapshot before live events.

## Phase 3: Sessions, ordering, and event ledger

1. Map every authenticated socket to `user_id`, `client_kind`, and Agent Instance.
2. Persist inbound events with idempotency keys.
3. Process events through one ordered queue per `user_id`.
4. Define event kinds for user message, context snapshot, session end, cron fire, heartbeat tick, and conversation start.
5. Make duplicate event handling idempotent.

Exit criteria:

- Concurrent Mobile and Desktop events for one User are serialized.
- Duplicate `message_id` or `snapshot_id` does not create duplicate Runtime turns.
- Multi-user events do not block each other.

## Phase 4: Conversation History and reconnect snapshot

1. Persist the **user-authored** half of the timeline in `conversation_messages` via the `conversation` domain (#29). `companion_message` persistence is one `conversation.append` call in #36; live outbound delivery landed in #41.
2. Define the reconnect snapshot shape in `packages/protocol` instead of leaving it as `unknown` (done in Phase 0 / ADR-0006).
3. Serve reconnect snapshot and `history_backfill_request` / `history_backfill_response` over the WebSocket (#29).
4. Stream new outbound messages to connected Mobile clients (#41, branch `issue-40and41`).
5. Return delivery acks/status only where useful for Desktop capture events.

Exit criteria:

- Mobile cold open can render the authoritative timeline from the reconnect snapshot.
- Runtime can recover after process restart without losing Conversation History.
- Desktop remains capture-only and receives no chat UI obligations.

## Phase 5: DeepAgents integration

1. Add `deepagents`, LangChain, LangGraph, and model provider dependencies.
2. Create a Runtime service that builds/invokes a DeepAgents instance for one ordered event turn.
3. Register the first minimal product tools.
4. Pass `user_id`, Agent Instance, bundle version, and VFS backend into each invocation.
5. Capture trace/run IDs for observability.
6. Treat DeepAgents output as candidate Runtime output; the shell decides whether it is a normal reply, silent result, or Post-Message-Back.

Exit criteria:

- A `user_message` produces a persisted `companion_message`.
- DeepAgents built-in planning/tool/memory behavior is used rather than duplicated.
- Runtime tests can fake DeepAgents to test shell behavior deterministically.

## Phase 6: Neon-backed VFS, bundles, and memory

1. Implement bundle document tables and seed the first immutable bundle version.
2. Implement `runtime_vfs_documents` for user overlays keyed by `user_id` and absolute path.
3. Implement overlay-first read resolution: user overlay first, pinned bundle default second.
4. Implement write/edit policy for user-writable paths.
5. Implement DeepAgents backend protocol for `ls`, `read`, `grep`, `glob`, `write`, and `edit`.
6. Keep host filesystem materialization out of v1 unless a specific backend/tool proves it is required.

Exit criteria:

- DeepAgents can read product bundle docs and user memory through the VFS.
- Writes to `USER.md` or memory paths persist as database rows.
- Writes to immutable bundle paths are rejected or routed to overlays according to policy.

## Phase 7: Context Snapshots and session end markers

1. Convert Desktop `context_snapshot` events into durable Runtime events.
2. Store Context Snapshots in Runtime-owned Neon tables or VFS projections as appropriate.
3. Feed relevant snapshot summaries into DeepAgents on the next turn or heartbeat.
4. Use `session_end_marker` to update heartbeat/liveness state.

Exit criteria:

- Desktop can send snapshots on the same WebSocket Protocol as Mobile.
- Snapshots affect Companion context without creating chat messages by default.
- Session end can stop or quiet heartbeat evaluation.

## Phase 8: Cron

_Shipped in #39 (branch `issue-39`); main-thread Per-User Channel enqueue and Post-Message-Back egress landed in #41 (ADR-0029)._

1. Add durable `cron_jobs` records with user scope, schedule, payload, status, and next-fire time.
2. Run a non-blocking scheduler loop in the always-alive Runtime process.
3. On fire, append a runtime event into that User's ordered queue.
4. Track execution records separately from schedule definitions.
5. Let the agent decide whether the cron event should produce a Post-Message-Back.

Exit criteria:

- Cron survives Runtime restart.
- Missed/late fires have documented behavior.
- Cron trigger does not equal notification.

## Phase 9: Heartbeat

_Shipped in #40 (branch `issue-40and41`, ADR-0027); zero stored heartbeat state — due-ness computed from existing rows._

1. Add per-user heartbeat state and policy.
2. Run interval ticks only when policy/liveness says they are allowed.
3. Enqueue heartbeat events rather than invoking DeepAgents directly from the timer.
4. Support silent heartbeat outcomes such as `HEARTBEAT_OK`.
5. Allow important system events to wake heartbeat early when appropriate.

Exit criteria:

- Heartbeat can evaluate active capture state without spamming the user.
- Silent heartbeat results do not create chat messages.
- Heartbeat trigger may produce Post-Message-Back only when the agent deliberately chooses it.

## Phase 10: Post-Message-Back and push handoff

_Shipped in #41 (branch `issue-40and41`, ADR-0028/0029)._

1. Model Post-Message-Back as a distinct Runtime primitive, not as "any assistant reply while offline."
2. Persist the message into Conversation History.
3. If the User has no connected Mobile client, call Control Plane `POST /internal/notifications/push`.
4. Record delivery attempts in the unified `deliveries` ledger (not a separate `post_message_back_requests` table).
5. Keep APNs credentials and device-token routing exclusively in the Control Plane.

Exit criteria:

- Normal replies do not push.
- Every push originates from a Post-Message-Back record.
- Offline Mobile receives Control Plane push request with `user_id`, `message_id`, and preview text.

## Phase 11: Observability, safety, and production readiness

1. Add structured logs around connection, event queue, DeepAgents turn, VFS access, cron, heartbeat, and push handoff.
2. Add metrics for queue latency, turn duration, token usage, scheduler lag, connected clients, and push handoff failures.
3. Add redaction for user memory, conversation bodies, auth tokens, and snapshot content.
4. Add integration tests for multi-user isolation and reconnect recovery.
5. Add deployment workflow for GCE VM container rollout.

Exit criteria:

- We can answer "what happened to this user's turn?" from logs/traces without exposing private content.
- Runtime can restart without losing durable state.
- GCE deployment keeps the always-alive invariant.

## Reference sources

- Intentive vocabulary: `CONTEXT-MAP.md`, `services/agent-runtime/CONTEXT.md`, `packages/CONTEXT.md`
- Intentive architecture: `ARCHITECTURE.md` (monorepo) + `services/agent-runtime/ARCHITECTURE.md` (deployable)
- OpenClaw pattern default: `docs/adr/0003-agent-runtime-openclaw-patterns-default.md`
- WebSocket Protocol: `docs/adr/0005-agent-runtime-websocket-protocol-contract-v1.md`
- DB-backed VFS: `docs/adr/0006-agent-runtime-db-backed-vfs-overlay-model-v1.md`
- Local OpenClaw reference map: `services/agent-runtime/reference/AGENTS.md`
- Local topic cards: `services/agent-runtime/reference/topics/`
- Local raw OpenClaw packs: `services/agent-runtime/reference/openclaw/`
- LangChain Deep Agents overview: [https://docs.langchain.com/oss/javascript/deepagents/overview](https://docs.langchain.com/oss/javascript/deepagents/overview)
- LangChain Deep Agents harness capabilities: [https://docs.langchain.com/oss/javascript/deepagents/harness](https://docs.langchain.com/oss/javascript/deepagents/harness)
- LangChain Deep Agents backends: [https://docs.langchain.com/oss/javascript/deepagents/backends](https://docs.langchain.com/oss/javascript/deepagents/backends)
- LangChain Deep Agents memory: [https://docs.langchain.com/oss/javascript/deepagents/memory](https://docs.langchain.com/oss/javascript/deepagents/memory)
- Build Your Own OpenClaw reference: [https://github.com/czl9707/build-your-own-openclaw/tree/main](https://github.com/czl9707/build-your-own-openclaw/tree/main)
