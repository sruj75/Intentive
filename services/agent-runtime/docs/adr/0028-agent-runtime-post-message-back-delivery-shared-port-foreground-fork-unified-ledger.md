# ADR 0028: Post-Message-Back Delivery — Shared Delivery Port, Chat-Capable Foreground Fork, Persist-Then-Deliver, Unified Delivery Ledger

## Status

Accepted

## Date

2026-06-16

## Context

ADR-0027 ships #40 (Heartbeat) together with #41 (Post-Message-Back), because a
Monitoring Turn's only output is `post_message_back` and a heartbeat that cannot
deliver poisons the checkpoint with phantom nudges. This ADR resolves the egress
_delivery_ side that #41 owns: how a Companion message actually reaches the user,
and how delivery is recorded.

Bedrock facts surfaced while grilling #41 against the OpenClaw gateway pattern and
the existing code:

- **The wire surface already exists.** `packages/protocol` already defines
  `companion_message` with `via_post_message_back: boolean`, `delivery_ack
{ message_id }` (client → runtime receipt), and `presence_update { foreground }`
  (client → runtime). The transcript already models distinctness:
  `conversation_messages.via_post_message_back` (migration 0002) and the
  `session_message` projection (ADR-0037) carry the flag. So #41's "modeled
  distinctly" AC is a **flag on the shared transcript**, not a separate table.
- **There is no server-initiated send today.** The gateway is pure
  request/response (`ws-handler.ts` returns one event per inbound event); there is
  no per-user socket registry and nothing pushes without an inbound trigger. #41
  introduces both: a live-connection registry and outbound-without-trigger.
- **OpenClaw's battle-tested shape** is a live-connection registry + a
  `broadcast`/`send` path for connected clients, with APNs `push` as a separate
  fallback method, and a **client-kind capability predicate** (`isWebchatClient`)
  deciding what counts as a chat surface — not a hardcoded client enum value.
- **The product is bidirectional over time.** v1: chat on Mobile, Context
  Snapshots from Desktop. Planned: chat on Desktop too, and Context Snapshots from
  Mobile. So "Mobile = the chat surface" must not be hardcoded into the delivery
  fork.
- **Post-Message-Back is proactive.** The whole point is to reach a user who is
  _not_ looking. Live-streaming into a backgrounded app surfaces nothing and fires
  no notification — it defeats `phone → user`.
- **#41 ACs.** PMB modeled distinctly; persists to Conversation History _before_
  push handoff; push only when the user is not reachable; push outcomes recorded in
  a **delivery ledger**; normal replies never push; every push traceable to a PMB
  record; APNs credentials + device-token routing stay Control-Plane-owned.

## Decision

**One shared delivery port; reachability is a chat-capable client-kind predicate;
Post-Message-Back keys on _foreground_ while interactive replies key on
_connection_; always persist before deliver; record every delivery attempt in one
unified append-only `deliveries` ledger. `post_message_back({ body })` is content
only — all transport is the shell's deterministic decision.**

1. **Shared delivery port (gateway-owned).** The gateway owns sockets, so it owns
   a process-local per-user live-connection registry (`user_id → live sockets`,
   each tagged with `client_kind` and last-reported `foreground` from
   `presence_update`). It exposes one delivery port consumed by **both** the
   Interactive Turn reply and Post-Message-Back — we build shared transport and PMB
   rides it; we do **not** build a PMB-only path. Process-local is authoritative in
   v1 (one always-alive VM, one process); a shared presence store is deferred to
   if/when the runtime scales horizontally.

2. **Reachability is a chat-capable client-kind predicate, not a hardcoded kind.**
   Following OpenClaw's `isWebchatClient` precedent, delivery asks "is a
   **chat-capable** client connected?" In v1 the chat-capable set is `{mobile}`.
   When Desktop gains a chat surface (and Mobile starts sending snapshots), flip the
   capability set — the delivery fork does not change. Same principle in reverse for
   snapshot-capable ingress kinds.

3. **Trigger-specific reachability.** The predicate differs by trigger:
   - **Interactive Turn reply** (user just spoke): reachable = a **connected**
     chat-capable client. Live-stream; **never push** (AC). If the client vanished
     mid-turn, the reply is still persisted and replays on reconnect via the Session
     Snapshot — it is not pushed.
   - **Post-Message-Back** (proactive): reachable = a **foreground** chat-capable
     client. Foreground ⇒ live-stream (they're looking). Backgrounded, non-chat-only,
     or disconnected ⇒ **push** via Control Plane. This deliberately _tightens_
     #41's "if no connected Mobile client" AC: a connected-but-backgrounded phone
     still gets a push, because a silent nudge into an unseen app violates
     `phone → user`.

4. **Persist-then-deliver.** Every Companion message is written to Conversation
   History first (`conversation_messages`, server-minted `message_id`, server-stamped
   `at`), _then_ delivered. A delivery failure never loses the message; reconnect
   replays it and `delivery_ack` closes the loop. (Satisfies "persists before push
   handoff.")

5. **`post_message_back({ body })` — content only.** The single locked egress tool
   (ADR-0013), fired identically from all proactive triggers (heartbeat Monitoring
   Turn, Context-Snapshot Monitoring Turn, Cron). `body` is the only argument. The
   tool mints `message_id`, stamps `emitted_at`, and forces `via_post_message_back =
true` — the tool **is** the "modeled distinctly" boundary; the agent cannot post
   an ordinary reply through it or forge the flag. **No `urgency`/`channel`/
   `target_device`/`push` arguments**: per ADR-0014 the agent owns content, timing,
   and whether to speak; _transport_ (stream-vs-push, which device) is the shell's
   deterministic, testable fork (point 3). No agent-supplied dedup key — each call is
   one row (`UNIQUE(user_id, message_id)`); avoiding re-posting the same nudge is the
   agent's own judgment from its history.

6. **One unified `deliveries` ledger (strategic, not push-only).** Rather than the
   push-only ledger the AC literally asks for, "delivery" is modeled as one concept
   with one record: an append-only `deliveries` table mirroring `cron_runs`'
   one-row-per-attempt discipline.

   ```sql
   CREATE TABLE agent_runtime.deliveries (
     id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id      uuid        NOT NULL,
     message_id   text        NOT NULL,   -- the companion_messages row delivered
     path         text        NOT NULL CHECK (path IN ('stream','push')),
     client_kind  text,                   -- target kind for 'stream'; NULL for 'push'
     status       text        NOT NULL CHECK (status IN ('ok','failed')),
     error        text,
     attempted_at timestamptz NOT NULL,
     created_at   timestamptz NOT NULL DEFAULT now()
   );
   CREATE INDEX deliveries_user_created_at ON agent_runtime.deliveries (user_id, created_at DESC);
   CREATE INDEX deliveries_message        ON agent_runtime.deliveries (user_id, message_id);
   ```

   - Covers **both triggers and both paths**: interactive replies and foreground
     PMBs log `stream` rows; backgrounded/disconnected PMBs log `push` rows. The
     `(user_id, message_id)` index gives the AC's "every push traceable to a PMB
     record" **and** full reply observability for free.
   - `client_kind` on `stream` rows makes per-surface delivery observable the day
     multi-device chat lands (one row per target). `push` rows leave it `NULL`
     because Control Plane owns device-token fan-out.
   - The "interactive reply but client vanished mid-turn" edge becomes **observable,
     not silent**: a `stream`/`failed` row, no push, message still persisted.

7. **Append-only outcome ledger; `delivery_ack` stays separate.** The ledger records
   the runtime's _send-attempt outcome_ — its responsibility boundary. `delivery_ack`
   is mutable receipt state arriving later over the wire; folding it in would force
   row updates and break the append-only model `cron_runs` set. Ack-correlation is a
   clean future addition, not a v1 column. For `push`, "outcome" = whether the CP
   `POST /internal/notifications/push` handoff succeeded; what APNs does downstream and
   whether the user opens is Control-Plane-owned (AC).

## Considered Options

- **PMB-only delivery path / push-only ledger** (the literal AC shape). Rejected as
  shallow: it would need a second path and a second table the moment Desktop chat or
  full delivery observability lands. The unified port + unified ledger is the deep
  module — strategic programming over tactical.
- **Hardcode "Mobile = chat surface"** in the delivery fork. Rejected: the product
  is bidirectional; a client-kind capability predicate (OpenClaw `isWebchatClient`)
  generalizes to Desktop chat with no fork change.
- **PMB reachable = merely connected** (not foreground). Rejected: a connected
  backgrounded phone shows the user nothing; proactive nudges must surface, so
  background ⇒ push.
- **Expose `urgency`/`push` on the tool.** Rejected: that hands a transport/saliency
  decision to the model that the shell already makes deterministically and testably
  (ADR-0014).
- **Fold `delivery_ack` into the ledger.** Rejected for v1: it converts an
  append-only outcome log into mutable receipt state; kept as a separate signal.

## Consequences

### Positive

- One delivery concept, one port, one ledger — adding Desktop chat costs zero new
  tables and no fork rewrite.
- Full delivery observability (replies + PMBs, stream + push, per client kind),
  including the previously-invisible vanished-client edge.
- ADR-0013/0014 consistent: agent says _what/whether_; shell decides _how/where_.
- AC-complete: distinct modeling (flag), persist-before-push, push-when-unreachable,
  ledger, normal-replies-never-push, push→PMB traceability, APNs stays in CP.

### Negative

- A backgrounded-phone push is stricter than the literal AC ("no connected Mobile
  client"); intentional, recorded here so AC and design don't read as contradictory.
- Process-local registry is not horizontally scalable; acceptable for the
  single-VM v1, flagged for a future shared presence store.

### Neutral / Follow-up

- `delivery_ack` correlation (did the user actually receive/open) is a deferred,
  clean extension of the ledger.
- The exact `presence_update` debounce / staleness window for "foreground" is
  tunable; only the _predicate_ is fixed here.

## Related

- ADR-0013 (egress via tools; `post_message_back` is the one egress, no output
  classification)
- ADR-0014 (single brain; shell is senses/hands — transport is the shell's call)
- ADR-0015 (Monitoring Turn — the proactive trigger that calls `post_message_back`)
- ADR-0027 (#40 ships with #41; the cron→main-session flip lands here)
- ADR-0037 (`session_message` projection carries `via_post_message_back`)
- Migrations 0002 (`conversation_messages.via_post_message_back`), 0007 (`cron_runs`
  — the ledger precedent)
- Issue #41 (Post-Message-Back + push handoff)
