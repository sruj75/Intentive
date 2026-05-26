# @intentive/protocol

The shared WebSocket message contract. See [`docs/CONTEXT.md`](../../docs/CONTEXT.md) → **Protocol**.

**Rule:** every event a client sends or the Agent Runtime emits is defined here as a Zod schema. Mobile, Desktop, future Android, and the Runtime all import from this package. Changes here cascade through the monorepo via typecheck.
