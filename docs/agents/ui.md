# UI work

Read when changing React surfaces under `src/` or macOS chrome (menu bar, settings).

## Design system

- `DESIGN.md` — Intentive brand and UX design system.
- `.claude/commands/macos-design.md` — native macOS UI patterns; companion refs in `.claude/commands/references/` as that command directs.

## Boundary

Rust owns capture, summarization, persistence, and delivery. Keep the frontend thin: invoke Rust, render state, and handle Auth — do not move orchestration into `src/`.
