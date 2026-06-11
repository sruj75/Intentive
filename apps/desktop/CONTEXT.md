# Desktop Client

The macOS Tauri application — capture-only in v1. For monorepo-wide vocabulary and the context map, read the root [`CONTEXT-MAP.md`](../../CONTEXT-MAP.md). This file captures vocabulary specific to the Desktop Client.

## Language

**Desktop Client**:
The macOS application, built with Tauri, at `apps/desktop/`. **Capture-only in v1** — runs ScreenPipe, produces Context Snapshots, manages capture state from the menu bar, and exposes Account/Settings via Neon Auth UI. **No chat UI in v1.** All conversation lives on the Mobile Client (and future Android Client).
_Avoid_: Tauri app, the desktop app, OpenClaw client, desktop chat surface

**Snapshot Store**:
The Desktop Client's local SQLite record of every Context Snapshot it produced and sent. **Local-truth, not a cache** — the snapshot originates on-device and the local copy is the audit trail. Different role from chat history; do not generalize the two.
_Avoid_: cache, mirror of server state, optional store

**Capture Permission Setup**:
The macOS Privacy Settings flow (Screen Recording, Microphone, Accessibility) required on the Mac before the Desktop Client can start a Capture Session. **Device-Local Gate**. Cannot be granted from the phone.

**Routing State**:
Whether the Desktop Client currently holds usable **Routing** (the `ws_url` + `runtime_jwt` + `agent_instance_id` issued by the Control Plane's `GET /agent`). One of `signed_out`, `signed_in` (have a login token, no Routing yet), `routing_ready`, `routing_error`. Owned and held in process memory by the Rust core; never surfaced in Settings. Answers "do we have credentials to connect?" — **not** "is the connection up?".
_Avoid_: connection state, socket state, online/offline

**Session State**:
Whether the Protocol WebSocket to the **Agent Runtime** is connected **right now**. One of `disconnected`, `connecting`, `connected`, `reconnecting`. A dropped line moves only this state; it does not invalidate **Routing State**. The Rust core emits Protocol events only when Routing State is `routing_ready` **and** Session State is `connected`.
_Avoid_: routing state, auth state, login state

## Relationships

- The webview owns **sign-in** and hands the resulting login token to the Rust core; the Rust core owns **Routing** end-to-end — it calls `GET /agent`, holds Routing in memory, and re-fetches it when the runtime rejects the badge.
- **Routing State** and **Session State** are independent. A WebSocket drop moves only Session State (`connected → reconnecting`); Routing State changes only when Routing is fetched, refreshed, or rejected (`auth_failed`).
- A snapshot is emitted only when **Routing State** is `routing_ready` **and** **Session State** is `connected`. Otherwise it stays in the **Snapshot Store** with `pushed_at = null`.
- **Capture** is gated by sign-in + **Desktop Capture Readiness**, not by Routing/Session State. A down connection never stops capture (at-most-once, local-truth).

## Flagged ambiguities

- "signed in" was used to mean both "has a login token" and "ready to emit snapshots" — resolved: these are distinct. **Routing State** answers "do we have credentials?"; **Session State** answers "is the line up?". Being signed in implies neither.
