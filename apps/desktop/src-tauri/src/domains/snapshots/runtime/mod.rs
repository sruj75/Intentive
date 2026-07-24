//! Runtime layer of the snapshots domain: the operational services that run a
//! Capture Session's snapshot lifecycle.
//!
//! - `agent_interface` — outbound Protocol event transport (the `AgentSink` seam).
//! - `heartbeat`       — the 10-minute Context Heartbeat tick loop.

pub mod agent_interface;
pub mod heartbeat;
