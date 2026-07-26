# @intentive/protocol

The shared WebSocket message contract. See [`packages/CONTEXT.md`](../CONTEXT.md) → **Protocol**.

**Rule:** every event a client sends or the Agent Runtime emits is defined here as a Zod schema. Mobile, Desktop, future Android, and the Runtime all import from this package. Changes here cascade through the monorepo via typecheck.

Desktop Performance Coach clients advertise `desktop_coaching_v1` in the optional
`connect.capabilities` array, then use the strict Coaching Window lifecycle events
defined by this package. While a Coaching Window is active, Desktop correlates
Floating Bar `user_message` events with its UUID `window_id`; the Runtime uses
that correlation to keep Desktop bootstrap work inside the active window.
Legacy clients and ordinary Mobile messages may omit capabilities and Coaching
Window correlation fields.
