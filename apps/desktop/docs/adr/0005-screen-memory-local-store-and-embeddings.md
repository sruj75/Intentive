# ADR 0005: Screen Memory owns local records and local embeddings

## Status

Accepted.

## Decision

Screen Memory is the local store for screen records, OCR, retention policy, and local embeddings. FTS search ships first; vector search is enabled once the local model and dimension are pinned. Conversation History remains server-owned in the Agent Runtime.
