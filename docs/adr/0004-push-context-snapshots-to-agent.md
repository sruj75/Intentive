# Push Context Snapshots to the OpenClaw Agent

The OpenClaw Agent is event-driven — it wakes up when a snapshot arrives rather than deciding on its own when to ask for context. Intentive therefore pushes each Context Snapshot to the agent as it is produced by the Context Heartbeat. Pull was rejected because it requires the agent to maintain its own polling cadence, which couples the agent's reasoning loop to a timer rather than to actual activity.

## Consequences

- Transport is HTTPS POST to a configured webhook URL — the OpenClaw Agent runs on a GCP VM, not locally
- Intentive must be configured with the agent's endpoint URL and an auth credential (API key)
- Retry and failure handling (agent down, network error) must be defined — see ADR-0005 once resolved
- The user's machine must have internet access for snapshots to be delivered during a Capture Session
