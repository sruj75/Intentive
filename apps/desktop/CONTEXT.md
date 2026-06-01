# Desktop Client

The macOS Tauri application — capture-only in v1. For monorepo-wide vocabulary and the context map, read the root [`CONTEXT-MAP.md`](../../CONTEXT-MAP.md). This file captures vocabulary specific to the Desktop Client.

## Language

**Desktop Client**:
The macOS Tauri application at `apps/desktop/`. **Capture-only in v1** — runs ScreenPipe, produces Context Snapshots, manages capture state from the menu bar, and exposes Account/Settings via Neon Auth UI. **No chat UI in v1.** All conversation lives on the Mobile Client (and future Android Client).
_Avoid_: Tauri, the desktop app, OpenClaw client, desktop chat surface

**Snapshot Store**:
The Desktop Client's local SQLite record of every Context Snapshot it produced and sent. **Local-truth, not a cache** — the snapshot originates on-device and the local copy is the audit trail. Different role from chat history; do not generalize the two.
_Avoid_: cache, mirror of server state, optional store

**Capture Permission Setup**:
The macOS Privacy Settings flow (Screen Recording, Microphone, Accessibility) required on the Mac before the Desktop Client can start a Capture Session. **Device-Local Gate**. Cannot be granted from the phone.

