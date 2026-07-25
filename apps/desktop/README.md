# Desktop Client

macOS client for Intentive. The app captures local screen and optional passive-audio context, maintains private Screen Memory, joins the shared Companion conversation through the text-only Floating Bar, and presents desktop-local effects selected by the Agent Runtime.

## Current Code

The app currently lives under [`macos/`](macos/) as a Swift Package Manager project in renovation.

```bash
pnpm --dir apps/desktop build
pnpm --dir apps/desktop test
```

See [`AGENTS.md`](AGENTS.md), [`CONTEXT.md`](CONTEXT.md), and [`ARCHITECTURE.md`](ARCHITECTURE.md) before changing the Desktop Client.

Public release procedure: [`docs/RELEASE.md`](docs/RELEASE.md). Privacy contract: [`docs/PRIVACY.md`](docs/PRIVACY.md).
