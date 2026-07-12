# Desktop Client

macOS client for Intentive. The target app captures local screen context, maintains Screen Memory, joins the shared Companion conversation through the Runtime Bridge, supports floating-bar chat and push-to-talk, and runs desktop-local effects selected by the Agent Runtime.

## Current Code

The app currently lives under [`macos/`](macos/) as a Swift Package Manager project in renovation.

```bash
pnpm --dir apps/desktop build
pnpm --dir apps/desktop test
```

See [`AGENTS.md`](AGENTS.md), [`CONTEXT.md`](CONTEXT.md), and [`ARCHITECTURE.md`](ARCHITECTURE.md) before changing the Desktop Client.
