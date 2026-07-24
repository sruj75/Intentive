//! Routing owns the Desktop Client's Control Plane lookup and Protocol
//! WebSocket session lifecycle.
//!
//! Rust holds Routing in process memory, opens the Agent Runtime WebSocket, and
//! refreshes Routing when the runtime rejects the badge. Snapshot emission is
//! intentionally outside this domain until #34 wires events through the live
//! session.

pub mod config;
pub mod runtime;
pub mod service;
pub mod types;
