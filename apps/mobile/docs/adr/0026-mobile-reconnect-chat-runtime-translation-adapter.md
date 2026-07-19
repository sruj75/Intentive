# Reconnect the Chat Runtime seam through a translation adapter

Status: accepted; third seam of the approved Mobile integration plan (relaxes ADR 0022 / 0023's fully-unmounted boundary for the chat runtime only; realizes the translation layer ADR 0022 anticipated)

Date: 2026-07-19

## Context

The mounted chat UI renders a `ConversationSession`: `getSnapshot() → { timeline: ConversationTimelineItem[], phase: ChatPhase }`, `subscribe`, `send(text)`, `dispose`. Today the live `(main)` route feeds it `createLocalConversationSession`, a deterministic local stand-in with scripted thinking/composing/reply timers.

The dormant production stack is shaped differently. `createRuntimeAdapter` (the ADR-0009 chat engine) exposes `getState() → { messages: ConversationMessage[], connectionState, agentState, error }`, `connect`, `sendUserMessage`, `retryUserMessage`, `close`, and speaks Protocol frames over a real Agent Runtime WebSocket (routing via `POST {baseUrl}/agent`, `hello_ok` snapshot, `companion_message`, delivery acks, backoff/retry). Its messages are the camelCase domain `ConversationMessage`, not the UI `ConversationTimelineItem`. The two interfaces do not line up — this seam is not a drop-in swap, it needs the translation layer the integration plan flagged (cross-check #2) and ADR 0022 anticipated.

## Decision

**Add a translation adapter, leave `ConversationScene` untouched.** `chat/runtime/runtime-conversation-session.ts` wraps `createRuntimeAdapter` and projects its state onto the `ConversationSession` contract:

- **Timeline** (`projectTimeline`): keep the ready scaffold (`createReadyTimeline()` — capability card + suggestions) as the opening rows so the runtime-backed ready state matches the local one, then map each `ConversationMessage` to a `user_message` / `companion_message` row by author. A live `thinking` Agent State appends the existing `activity` indicator.
- **Phase** (`projectPhase`): the adapter's only in-flight signal is Agent State `thinking` → `"thinking"`; otherwise the phase follows the latest message (`companion → "replied"`, `user → "user_sent"`, empty → `"idle"`). `phase` is not read by `ConversationScene` today, so this is an honest projection, not a load-bearing mapping.

The snapshot is recomputed on every adapter notification and cached, so `getSnapshot` returns a stable reference between changes — the contract `useSyncExternalStore` (in `ConversationScene`) depends on. The session opens the connection eagerly on creation and `close`s the adapter on `dispose`, mirroring the local session's lifecycle (which cancels its timers on disposal).

**Compose at the route, keep the entrypoint default offline.** Following the Seam 1 / Seam 2 pattern, `ChatEntry`'s `createSession` default stays `createLocalConversationSession` (capability-free). The composition root (`platform.ts`) grows `createRuntimeSession()` — a factory that builds a fresh runtime-backed session per call with the real platform capabilities (`baseUrl`, `getUserJwt`, `fetch`, `new WebSocket(url)`, `clientVersion`, a per-client idempotency-key generator, `setTimeout`-backed `schedule`, and the shared `telemetry`). The `(main)/chat.tsx` route injects it through a module-level reference so `ChatEntry`'s session memo stays stable across renders — a fresh Runtime connection opens only on mount (and on education replay, which bumps the session generation).

## Consequences

- `ConversationScene`, its snapshots, and the composer stay byte-for-byte unchanged; all 19 RN snapshots and the `experience-journey` / `router-boundaries` invariant tests (which drive local sessions through the entrypoints, never the `app/` route) stay green.
- The translation is unit-tested on the pure node:test path: `projectTimeline` / `projectPhase` as pure functions, plus a socket-harness test that drives `createRuntimeConversationSession` end-to-end (connect → `hello_ok` → send → dispose) reusing the Runtime Adapter's fake-socket style. The adapter's own 30+ tests are unchanged.
- **Connection errors are not surfaced in v1.** The `ConversationSession` contract and the mounted scene have no error affordance (no error timeline item, no error `phase`), and adding one would change the preserved visuals. The Runtime Adapter still captures terminal errors through the injected telemetry; the UI simply does not yet render `reauth-required` / `gate-required` / `network` states. A later design task can extend the contract and lift these through the projection.
- Delivery status (`pending` / `failed`) and `retryUserMessage` exist on the adapter but have no UI surface yet, so the translation drops them — outbound messages render as plain user rows. Same deferral, same later-design path.
- The `apps/mobile/CLAUDE.md` "zero WebSocket / Agent Runtime calls" invariant line is relaxed for the live `(main)` route composition only; the `ChatEntry` entrypoint default remains capability-free, which is what the invariant test drives.
