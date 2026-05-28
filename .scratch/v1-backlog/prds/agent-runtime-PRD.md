# Agent Runtime V1

Status: ready-for-agent
Labels: ready-for-agent
Opened: 2026-05-28T04:11:44Z
Updated: 2026-05-28T04:11:44Z

## Description

## Problem Statement

Intentive needs one always-alive **Agent Runtime** that runs **Companion** behavior for every User. The current monorepo has the vocabulary, architecture, shared contracts, and implementation plan, but the Runtime itself is still a scaffold. Without the Runtime, the **Mobile Client** cannot reach a real Companion, the **Desktop Client** cannot deliver **Context Snapshots** into the same behavioral loop, **Conversation History** has no server-truth owner, and proactive behavior such as **Cron**, **Heartbeat**, and **Post-Message-Back** remains only a product contract.

The User-facing problem is continuity. A User should experience one Companion across clients: the phone is where conversation happens, the Mac is where capture context enters, and the Companion should remember, follow up, and deliberately interrupt only when it decides the interruption is worth it.

## Solution

Build the Agent Runtime as a Node/TypeScript service deployed to an always-alive GCE VM. The Runtime uses **DeepAgents** for the agent harness: chat loop, tool execution, virtual filesystem, skills, memory surface, subagents, and compaction/context offload. Around that harness, Intentive owns a TypeScript shell for product boundaries: WebSocket **Protocol**, per-User event ordering, Neon-backed durable state, **Conversation History**, runtime bundle documents, user overlays, **Cron**, **Heartbeat**, and **Post-Message-Back**.

The Runtime will expose public WebSocket ingress for first-party Clients and a private **Internal API** for the **Control Plane**. It will verify client JWTs locally, accept only schema-valid Protocol events, serialize all runtime work per `user_id`, and persist durable state in a Runtime-owned Neon schema separate from Control Plane account truth.

## User Stories

1. As a User, I want one Companion across my phone and Mac, so that my relationship with Intentive feels continuous.
2. As a User, I want my Mobile Client to connect to the Companion after sign-in, so that I can start chatting without configuring endpoints.
3. As a User, I want my Desktop Client to send Context Snapshots to the same Companion, so that the Companion can understand what I was doing.
4. As a User, I want my Conversation History to survive reinstalling or reopening the Mobile Client, so that I do not lose context.
5. As a User, I want my Companion to remember durable preferences and context, so that it improves over time.
6. As a User, I want the Companion to follow up at useful times, so that it can help without waiting for me to open the app.
7. As a User, I want the Companion to avoid buzzing me for ordinary replies, so that notifications stay meaningful.
8. As a User, I want every push notification to represent a deliberate Post-Message-Back, so that interruptions feel intentional.
9. As a User, I want the Companion to stay quiet when a Heartbeat finds nothing worth saying, so that background evaluation does not become spam.
10. As a User, I want scheduled follow-ups to survive Runtime restarts, so that reminders are reliable.
11. As a User, I want my Mac capture session ending to be understood by the Companion, so that silence is not confused with continued activity.
12. As a Mobile Client, I want a WebSocket handshake with protocol negotiation, so that I know whether I can speak to this Runtime.
13. As a Mobile Client, I want reconnect to return an authoritative snapshot before live events, so that I can render a consistent timeline.
14. As a Desktop Client, I want to send `context_snapshot` events over the shared Protocol, so that I do not need a separate webhook path.
15. As a Desktop Client, I want to send `session_end_marker` events over the shared Protocol, so that capture liveness is explicit.
16. As a future Android Client, I want to reuse the same Protocol, so that adding Android does not require new Runtime routing code.
17. As the Control Plane, I want a private Session Start call, so that first chat entry creates or loads the User's Agent Instance.
18. As the Control Plane, I want to issue Routing and then step out of the data path, so that account truth and message traffic stay separate.
19. As the Control Plane, I want the Runtime to call me only for push handoff, so that APNs credentials and device tokens remain in one authority.
20. As the Agent Runtime, I want to verify JWTs locally through shared Providers, so that message authentication does not depend on a Control Plane proxy.
21. As the Agent Runtime, I want one ordered queue per User, so that concurrent Mobile and Desktop events cannot corrupt Companion state.
22. As the Agent Runtime, I want durable idempotency keys for inbound events, so that reconnects and retries do not duplicate turns.
23. As the Agent Runtime, I want Conversation History in Neon, so that chat history is server-truth.
24. As the Agent Runtime, I want runtime events in Neon, so that trigger processing can recover after restart.
25. As the Agent Runtime, I want runtime turns recorded with status and trace identifiers, so that operators can debug behavior.
26. As the Agent Runtime, I want immutable runtime bundle versions, so that product behavior can be pinned per session.
27. As the Agent Runtime, I want user overlay documents scoped by `user_id`, so that each User has isolated memory and personalization.
28. As the Agent Runtime, I want overlay-first VFS resolution, so that user-specific documents override bundle defaults without cloning full file trees.
29. As the Agent Runtime, I want DeepAgents to own the inner tool loop, so that Intentive does not reimplement agent harness behavior.
30. As the Agent Runtime, I want product tools registered through DeepAgents, so that tool execution remains inside one harness.
31. As the Agent Runtime, I want DeepAgents compaction/context offload available, so that long-running conversations remain usable.
32. As the Agent Runtime, I want skills available through bundle documents, so that product behavior can be progressively disclosed.
33. As the Agent Runtime, I want Cron to enqueue events rather than directly notify Users, so that the Companion decides whether to speak.
34. As the Agent Runtime, I want Heartbeat to enqueue constrained evaluation events, so that liveness checks stay controlled and observable.
35. As the Agent Runtime, I want silent Heartbeat outcomes, so that `HEARTBEAT_OK`-style results do not become chat messages.
36. As the Agent Runtime, I want Post-Message-Back to persist before push handoff, so that the notification always points to real Conversation History.
37. As an engineer, I want first-party Clients to use Protocol instead of channel adapters, so that Mobile and Desktop behavior stays unified.
38. As an engineer, I want external channels deferred, so that v1 does not carry a Discord/SMS/email abstraction before it needs one.
39. As an engineer, I want a narrow DeepAgents adapter that is easy to fake in tests, so that shell behavior can be tested deterministically.
40. As an engineer, I want VFS storage behind a small repo/service interface, so that Postgres details do not leak into Runtime orchestration.
41. As an engineer, I want scheduler behavior behind testable Cron and Heartbeat services, so that time-driven behavior can be tested without sleeping.
42. As an engineer, I want structured logs and metrics around each Runtime boundary, so that production incidents can be diagnosed.
43. As an engineer, I want sensitive content redacted from logs, so that memory, auth tokens, snapshots, and conversation bodies are protected.
44. As an engineer, I want multi-user isolation tests, so that one User's runtime state cannot leak into another User's session.
45. As an operator, I want the Runtime to restart safely, so that durable state, scheduled work, and conversation history survive deployment.

## Implementation Decisions

- The Agent Runtime is a long-running Node/TypeScript service deployed to GCE VM, not Cloud Run or another stateless platform.
- The User is the tenant in v1. Durable Runtime state is scoped by `user_id`; `tenant_id`, org, workspace, per-user VM, per-user process, and per-user schema are out of scope.
- The public client data path is WebSocket **Protocol**. The Control Plane issues Routing and JWTs, then exits the message path.
- The Runtime exposes an **Internal API** for `POST /internal/sessions/start`, protected by shared-secret auth on the private service path.
- The Runtime verifies client JWTs locally through the shared Providers auth interface.
- The `gateway` module owns WebSocket connection, handshake, authentication, protocol negotiation, and structured pre-handshake errors.
- The `sessions` module owns per-User ordering, idempotency, connection state, and event queue coordination.
- The `protocol` module owns mapping valid Protocol events into Runtime commands and mapping Runtime outputs back into Protocol events.
- The `runtime` module owns DeepAgents invocation, Agent Instance lifecycle, turn status, and interpretation of DeepAgents results.
- The `memory` module owns durable memory policy and the Neon-backed virtual document store.
- The `bundles` module owns immutable runtime bundle versions, pinned bundle resolution, and product prompt documents.
- The `cron` module owns scheduled-trigger definitions, next-fire state, scheduler loop, and trigger event enqueueing.
- The `heartbeat` module owns liveness/interval policy, constrained evaluation trigger enqueueing, and silent outcome handling.
- The `internal` module owns server-to-server HTTP surfaces used by the Control Plane.
- There is no standalone `channels` domain in v1. First-party Mobile, Desktop, and future Android behavior belongs in `gateway`, `protocol`, and `sessions`.
- A future `channels` domain is reserved for non-Protocol external surfaces such as Discord, SMS, email, WhatsApp, CLI, or partner integrations.
- Conversation History is stored in the Runtime-owned Neon schema and is authoritative for reconnect snapshots.
- Inbound/system events are stored as a durable event ledger with idempotency keys before they are processed.
- Runtime turns are recorded with status, timing, and trace/run identifiers.
- DeepAgents is the only agent brain. The shell does not reimplement planning, tool execution, virtual filesystem, skills, memory, subagents, or compaction.
- The VFS backend uses overlay-first resolution: user overlay document first, pinned bundle default second.
- Bundle documents are immutable and versioned. User overlays are mutable and scoped by `user_id` and path.
- Host filesystem materialization is out of scope unless a specific DeepAgents backend/tool requirement proves it is necessary.
- Cron and Heartbeat are triggers, not notifications. They may invoke the agent, and the agent may decide to Post-Message-Back.
- Post-Message-Back is the only Runtime primitive that can request push notification delivery through the Control Plane.

## Testing Decisions

- Tests should assert external behavior and module contracts rather than private implementation details.
- Gateway tests should cover handshake-first behavior, protocol negotiation, auth failures, invalid pre-handshake frames, and reconnect snapshot ordering.
- Internal API tests should cover shared-secret auth, idempotent Session Start, Agent Instance creation, and no client-message side effects.
- Session tests should cover per-User event serialization, duplicate event idempotency, and multi-User non-blocking behavior.
- Protocol tests should cover every inbound event type and structured rejection of unknown or invalid events.
- Runtime tests should fake DeepAgents behind a small interface and verify persisted outputs, silent outcomes, and Post-Message-Back decisions.
- Conversation History tests should verify cold-open snapshot shape and persistence across Runtime restart.
- VFS tests should verify overlay-first reads, pinned bundle fallback, writable path policy, immutable bundle protection, `ls`, `read`, `grep`, `glob`, `write`, and `edit`.
- Cron tests should use fake clocks and verify durable schedule state, missed/late-fire behavior, and event enqueueing rather than direct notification.
- Heartbeat tests should use fake clocks and verify liveness gating, silent outcomes, and no user-visible message unless Post-Message-Back is selected.
- Post-Message-Back tests should verify Conversation History persistence before push handoff and no push for ordinary replies.
- Isolation tests should create at least two Users and prove their Conversation History, VFS overlays, event queues, and scheduled triggers do not cross.
- Observability tests should verify structured log fields exist without leaking auth tokens, conversation bodies, user memory, or snapshot content.

## Out of Scope

- Standalone `channels` domain for v1 first-party Clients.
- External messaging adapters such as Discord, SMS, email, WhatsApp, CLI, or partner channels.
- Control Plane proxying of client messages.
- Mobile on-device chat persistence.
- Desktop chat UI.
- Per-user VM, per-user process, per-user schema, org/workspace tenancy, or `tenant_id`.
- APNs/FCM credential ownership inside the Agent Runtime.
- Reimplementing DeepAgents internals in shell code.
- Full replay/ack delivery semantics beyond snapshot-first reconnect and v1 idempotency.

## Further Notes

- ADR-0034 records the no-standalone-channels decision.
- The implementation plan lives in `docs/plans/agent-runtime-v1-implementation-plan.md`.
- The Runtime should continue to use OpenClaw as a behavioral shell reference, but only where the pattern fits Intentive's product boundary.
- The first implementation issues should be thin tracer-bullet slices, not horizontal layer-only tasks.

## Comments
