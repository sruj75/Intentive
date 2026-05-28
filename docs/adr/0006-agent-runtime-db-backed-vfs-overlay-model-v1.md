# ADR 0004: Database-Backed VFS Overlay Model for Multi-Tenant Intentive Runtime (v1)

## Status
Accepted

## Date
2026-05-25

## Context

`v1-deepagent` is the Intentive runtime product, not only an execution shell.
It must support multi-tenant isolation, deterministic behavior across sessions, and safe runtime upgrades without mutating user behavior mid-session.

DeepAgents exposes a filesystem interface to the model, but that interface can be backed by non-filesystem persistence (for example store-backed or custom backends).

OpenClaw-inspired patterns are useful defaults, but full per-user file tree cloning is not required for DeepAgents and creates avoidable storage, migration, and consistency overhead in a multi-tenant system.

## Decision

Adopt a database-backed virtual document model with versioned bundle + per-user overlays.

### 1) Runtime bundle as immutable versioned documents

Intentive base behavior documents (for example `AGENTS.md`, `SOUL.md`, `BOOTSTRAP.md`, `HEARTBEAT.md`) are stored as versioned runtime bundle records.

### 2) Overlay model for personalization and mutable state

User-specific writable content is stored as overlays, scoped by `(user_id, path)`.
Examples:
- `USER.md`
- day-level memory traces
- follow-up state projections

### 3) Read resolution contract

Runtime read resolution order:
1. overlay document
2. otherwise pinned bundle default document

### 4) Session pinning and migration

Each session is pinned to one bundle version.
Bundle migration occurs only at controlled boundaries (for example reconnect or new session), not mid-turn.

### 5) Materialization policy

Do not materialize full per-user host files by default.
Materialize to host filesystem only when a specific tool/backend requires OS-level files.

### 6) Storage split

- Thread-scoped scratch artifacts may use thread/state backends.
- Cross-thread runtime memory and personalization must use durable store-backed persistence.

## Consequences

### Positive

- Strong per-user isolation with explicit namespace keys.
- Deterministic behavior per session via bundle pinning.
- Lower operational overhead versus cloning full user file trees.
- Safer runtime upgrades with controlled migration boundaries.
- DeepAgents-native architecture that preserves agent filesystem ergonomics while using database reliability.

### Negative

- Requires explicit backend logic for overlay resolution and write policies.
- Additional migration logic is needed when moving users to newer bundle versions.
- Debugging can be harder than plain local files without good tooling/inspection views.

### Neutral / Follow-up

- Protocol ADR (`0003`) remains unchanged.
- Future ADR should define exact bundle migration modes (lazy-on-reconnect vs explicit migration jobs).
- Future ADR should define retention/compaction policy for daily memory traces.
