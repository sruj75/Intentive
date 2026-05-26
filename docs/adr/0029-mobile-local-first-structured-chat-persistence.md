> **Status: Superseded by [ADR-0001](0001-unified-monorepo-foundation.md).**
> On-device chat persistence was scaffolding for building the Mobile UI before the Agent Runtime existed. With the unified monorepo and the Runtime in scope, Conversation History is server-truth and the Mobile Client renders the authoritative timeline from the WebSocket reconnect snapshot. No on-device message store, not even as a cache, until measured latency requires one.

# Local-First Structured Chat Persistence

MVP 1 will persist chat history locally on-device rather than requiring backend persistence from the start. Messages still need stable IDs, roles, timestamps, delivery status, and runtime metadata so the storage boundary can later be replaced or synced by a backend without changing the product model.

**Consequences**

- The first implementation can focus on the feel of the companion chat instead of backend infrastructure.
- Conversation history must not be stored as a loose transcript blob.
- Backend persistence and sync should be treated as a later Conversation Store implementation, not a rewrite of the chat domain.
