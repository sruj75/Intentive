//! Capture domain — owns the Capture Session lifecycle: the shell-state FSM,
//! the ScreenPipe child-process supervisor, and the coordinator that ties them
//! together.
//!
//! - `types`   — shell-state shapes + coordinator command/observer vocabulary.
//! - `config`  — ports and user-facing error copy (ADR-0013/0011).
//! - `service` — the pure `CaptureStateMachine` and the auth seam.
//! - `runtime` — the ScreenPipe supervisor and the session coordinator.

pub mod config;
pub mod runtime;
pub mod service;
pub mod types;
