//! Runtime layer of the capture domain: the operational services that own OS
//! resources and orchestrate the session.
//!
//! - `screenpipe_supervisor` — owns the ScreenPipe child process lifecycle.
//! - `coordinator`           — single owner of the shell-state FSM.
//! - `permission_monitor`    — polls Desktop Capture Readiness.

pub mod coordinator;
pub mod permission_monitor;
pub mod screenpipe_supervisor;
