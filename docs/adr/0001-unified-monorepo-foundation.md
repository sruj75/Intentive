# ADR-0001 — Unified monorepo foundation

**Status:** accepted

## Context

Until May 2026, Intentive lived as four separate repositories — `v1-expo`, `v1-tauri`, `v1-controlplane`, `v1-deepagent`. Each was developed in isolation. Each accumulated its own `CONTEXT.md` and its own `docs/adr/`. The result was competing narratives: the same concept ("the agent", "the runtime", "the device", "snapshot delivery") was named and bounded differently in each repo. Contracts between deployables were implicit at best and inconsistent at worst.

## Decision

Collapse the four repositories into one monorepo at this root. Adopt one ubiquitous language ([`CONTEXT-MAP.md`](../../CONTEXT-MAP.md) plus per-deployable and `packages/CONTEXT.md` files; vocabulary is no longer a single `docs/CONTEXT.md`) and one architectural rule ([`docs/ARCHITECTURE.md`](../ARCHITECTURE.md)). All future ADRs live in this single `docs/adr/` directory and are numbered globally.

Key boundary decisions established by this ADR (full vocabulary in CONTEXT.md):

- **One Agent Runtime** — multi-tenant, shared compute, per-user logical Agent Instance. No per-user VM. No `tenant_id` — the User is the tenant.
- **One Protocol** — `packages/protocol/` is the single source of truth for the WebSocket message contract. Every client (Mobile, Desktop, future Android) imports it. The Agent Runtime imports it. Client unification lives in the protocol layer, not in network topology.
- **Control Plane sits beside the data path, never on it.** It issues Routing (URL + JWT) and steps out.
- **Single internal call CP→Runtime:** `POST /internal/sessions/start` — synchronous, idempotent per User, bundles Agent Instance creation with the Conversation Start Trigger. Shared-secret auth on a private interface.
- **Conversation History is server-truth.** No on-device cache in the Mobile Client until measured latency requires one.
- **Post-Message-Back is the only notification trigger.** Replies do not auto-push. The Control Plane owns APNs credentials.
- **Pre-Chat Gates** are Control-Plane-owned, with two kinds: Cross-Client (Identity, Consent, Sibling Invitation skip) and Device-Local (Capture Permission Setup).
- **Desktop is capture-only in v1.** No chat UI. Chat lives on Mobile (and future Android).
- **GCP Provisioner is removed** from v1 vocabulary. The Runtime is one always-on GCE VM deployed by CI/CD.
- **Layered domain architecture:** within each business domain, code depends forward through `types → config → repo → service → runtime → ui`. Cross-cutting concerns enter via `providers/`. Enforced mechanically via custom lints. See [ARCHITECTURE.md](../ARCHITECTURE.md).

## Consequences

- All ADRs from the four origin repos are retained in this directory, renumbered globally, prefixed with their origin deployable. See [README.md](README.md) for the mapping and supersedence status.
- Several origin ADRs are **superseded** by this decision (snapshot HTTPS-webhook delivery; on-device chat persistence; per-deployable Pre-Chat Gate ownership). They remain in this directory for history; the superseded status is captured both in their frontmatter and in the README index.
- Future decisions are recorded as new ADRs in this directory, numbered sequentially from the highest existing number.

## Considered alternatives

- **Keep four repos, write a shared-types package.** Rejected: contract drift was the original problem; a shared types package across four repos with four CI configs and four lint configs doesn't enforce anything mechanically.
- **Monorepo but per-deployable `docs/adr/`.** Rejected: the same logical decision (e.g., "the data path is WebSocket") would still need to be recorded in three places. Single global numbering is the simpler invariant.
- **Squash all history into one commit.** Rejected: the user explicitly requested history preservation via `git subtree`. All 32 origin ADRs and the commits that produced them remain reachable via `git log --all`.
