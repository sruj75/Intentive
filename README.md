# Intentive

A Mac app that runs in the background, watches what you’re doing (via ScreenPipe), writes short on-device summaries, and sends them to your OpenClaw agent. Nothing leaves your machine except those summaries—and only after sign-in.

Built with Tauri (Rust) and React. **macOS only.**

## Run it

```bash
npm install
npm run tauri dev
```

You’ll need Node 22+, Rust, and Xcode command line tools.

## Docs

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — how the pieces connect
- [`CONTEXT.md`](CONTEXT.md) — vocabulary (snapshots, heartbeat, etc.)
- [`SPEC.md`](SPEC.md) — what v1 should do
- [`AGENTS.md`](AGENTS.md) — dev commands and repo conventions

Still early: menu bar UI and full capture flow are specced but not finished yet.
