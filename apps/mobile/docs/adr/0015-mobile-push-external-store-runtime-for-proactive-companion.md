# Mobile uses a push / external-store runtime for the proactive Companion

Status: accepted

The **Companion** is proactive: it authors the first opening (Conversation Start
Trigger) before any user message exists, and can emit `companion_message` events
unprompted via Heartbeat, Cron, and Post-Message-Back. A turn-based "pull"
runtime — the vendor `useLocalRuntime` + `ChatModelAdapter.run` the #22 spike used
— models every assistant message as the _reply to a user turn_ and has no slot for
a message nobody asked for. We therefore drive **Companion Chat** with a push /
external-store runtime (`useExternalStoreRuntime`): the **Runtime Adapter** owns a
normalized in-memory message store that the Protocol WebSocket pushes into as
events arrive, and assistant-ui renders that store.

This is the battle-tested architecture for proactive, server-truth conversation —
the same shape as Slack/WhatsApp/iMessage and thread-based agent protocols
(AG-UI, OpenAI threads): server owns the conversation, the client is a thin
subscriber that renders server truth and holds only ephemeral send state. It is
also forward-compatible with the Protocol's extensible `discriminatedUnion`: an
event stream can carry new runtime→client event types; a `run`-returns-a-reply
function cannot.

## Considered Options

- **Pull (`useLocalRuntime`, the #22 spike default).** Right pattern for
  stateless one-shot completions (a ChatGPT-style chatbot). Rejected: it cannot
  represent the runtime-authored opening or any proactive message without faking
  phantom user turns, which fights the grain of the system's own design.
- **Push (`useExternalStoreRuntime`).** Chosen.

## Consequences

- The #22 claim that "#33 needs no UI changes" is dropped: `companion-chat.tsx`
  switches its runtime binding from `useLocalRuntime` to
  `useExternalStoreRuntime`. Message **visuals** remain #45's; only the plumbing
  changes here.
- assistant-ui's external store is a thin binding over the **Runtime Adapter**'s
  own store, not the architecture itself — preserving the ADR-0009 ejectability of
  the vendor Chat Primitive Engine.
- The client stays deliberately thin: render server truth, hold ephemeral send
  state, dedupe by `message_id`, re-sync on reconnect. No local message database,
  no offline-first sync engine (consistent with the no-local-persistence rule).
