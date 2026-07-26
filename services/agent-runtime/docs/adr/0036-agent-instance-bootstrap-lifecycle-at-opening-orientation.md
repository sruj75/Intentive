# ADR-0036: Start Agent Instance bootstrap at Opening Orientation

**Status:** Accepted
**Date:** 2026-07-26

## Context

The Procedure Floor already contains one-time `BOOTSTRAP` instructions and Turn
Execution already supports `firstRun`, but no caller supplied it. The
`conversation_start` trigger existed only as a type: it had no producer,
durable fire-once identity, or delivery surface. Session Start only creates or
loads an Agent Instance and returns WebSocket Routing.

Calling DeepAgents from Session Start would mix infrastructure setup with a
user-visible interaction. It could create output before an eligible Desktop
surface exists, duplicate Opening Orientation, and make reconnect semantics
ambiguous.

Opening Orientation is the first point where all necessary conditions are
already true: one durable Desktop Coaching Window exists, a capable Desktop is
actively attested, a pinned Procedure Floor is available, and one stable visible
message identity has been claimed.

## Decision

The Agent Instance row owns a durable Bootstrap Lifecycle:

```text
pending → in_progress → completed
```

- Session Start remains model-free. New Agent Instances default to `pending`.
- Before generating a new Opening Orientation, the Runtime reads bootstrap
  status. Any unfinished state sets `firstRun: true`, injecting `BOOTSTRAP`
  beside the normal opening procedure.
- The successful opening transaction moves `pending` to `in_progress` together
  with the stable `opening:<window_id>` Conversation History row and ready
  marker.
- An Interactive Turn may resume bootstrap only when it comes from a
  `desktop_coaching_v1` session, carries the matching `window_id`, and that
  Coaching Window is both actively attested in the current Runtime process and
  durably active. It then reads bootstrap state before invoking DeepAgents.
  `in_progress` sets `firstRun: true`; its successful transaction moves the
  state to `completed` together with the Companion reply.
- Failed opening or Interactive Turns do not advance bootstrap state. Closing
  the Desktop before a response leaves it `in_progress`; a late Desktop message
  or any Mobile message remains an ordinary Interactive Turn and cannot complete
  Desktop bootstrap. Another eligible Coaching Window can resume it.
- `conversation_start` is removed. Conversation History, checkpoint contents,
  and `USER.md` existence are not first-run truth.

The Runtime exposes this through one narrow `BootstrapLifecycle` service. It
prepares an Opening Orientation or eligible Interactive Turn with the correct
`firstRun` value and a deferred transition query for the caller's successful
transaction. The underlying `BootstrapLifecycleRepo` and its Postgres schema
details stay hidden behind that policy interface.

## Consequences

- Users receive one natural first opening rather than a setup greeting followed
  by a second Opening Orientation.
- BOOTSTRAP remains lightweight: one opening question and one successful
  Interactive Turn establish the initial personalization; normal memory
  learning continues afterward.
- Bootstrap progress survives reconnects, Desktop close, and Runtime restart.
- The opening message, reply, Runtime Turn anchor, and corresponding bootstrap
  transition share their existing transactions.
- Session Start remains idempotent and cannot accidentally wake the model.
- Only an eligible, window-bound Desktop Interactive Turn performs the small
  bootstrap-status read. This keeps lifecycle truth explicit and avoids both
  Mobile coupling and derivation from model-managed memory.
