# Shared (packages/)

The cross-deployable shared kernel: the wire/HTTP contracts and cross-cutting clients every deployable imports from `packages/`. For the context map and cross-context narrative, read the root [`CONTEXT-MAP.md`](../CONTEXT-MAP.md). This file captures vocabulary owned by the shared packages.

## Language

**Protocol**:
The shared WebSocket message contract every client speaks and the Agent Runtime understands. Defined once in `packages/protocol/` (Zod schemas). Imported by Mobile Client, Desktop Client, future Android Client, and Agent Runtime. **This is where client unification lives** — not in network topology.
_Avoid_: client SDK, wire format, message format (those are implementation details under Protocol)

**Context Snapshot**:
A time-bounded, on-device-summarized record of what the user was doing during a 10-minute window. Produced by the Desktop Client. Delivered to the Agent Runtime as a `context_snapshot` event on the same WebSocket every client uses.
_Avoid_: webhook payload, HTTP POST body, activity dump

**Session End Marker**:
A `session_end_marker` event the Desktop Client sends when a Capture Session ends (user toggle, quit, or crash). Distinct event type from `context_snapshot`.
_Avoid_: final snapshot, end flag

**Internal API**:
The private HTTP surfaces the two services expose for server-to-server calls: the **Agent Runtime**'s (`POST /internal/sessions/start`, called by the Control Plane) and the **Control Plane**'s (`POST /internal/notifications/push`, called by the Agent Runtime). Bound only to a private network interface; not reachable from clients or the public internet. Each direction is protected by its **own** shared secret in `Authorization: Bearer` (two **Directional Secrets**, not one symmetric password) — so a leaked inbound secret on one service cannot be replayed against the other's door.
_Avoid_: admin API, public API, management API, one symmetric shared secret

