> **Status: Superseded by monorepo [ADR-0001](../../../../docs/adr/0001-unified-monorepo-foundation.md).**
> The delivery mechanism (HTTPS POST to a per-user agent webhook) is replaced by `context_snapshot` events sent over the unified WebSocket Protocol. The principle of *push, not pull* still holds. The naming of "OpenClaw Agent" is retired in favor of **Agent Runtime** per the unified vocabulary.

# Push Context Snapshots to the OpenClaw Agent

The OpenClaw Agent is event-driven — it wakes up when a snapshot arrives rather than deciding on its own when to ask for context. Intentive therefore pushes each Context Snapshot to the agent as it is produced by the Context Heartbeat. Pull was rejected because it requires the agent to maintain its own polling cadence, which couples the agent's reasoning loop to a timer rather than to actual activity.

## Consequences

- Transport is HTTPS POST to an internally configured, Auth-resolved webhook URL — the OpenClaw Agent runs on a GCP VM, not locally
- Intentive must resolve the agent endpoint URL and auth credential internally from the signed-in user; those values are not user-facing Settings fields
- Retry and failure handling (agent down, network error) must be defined — see ADR-0005 once resolved
- The user's machine must have internet access for snapshots to be delivered during a Capture Session
