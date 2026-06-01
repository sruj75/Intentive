//! Runtime layer of the capture domain: the operational services that own OS
//! resources and orchestrate the session.
//!
//! - `screenpipe_supervisor` — owns the ScreenPipe child process lifecycle.
//! - `coordinator`           — single owner of the shell-state FSM.

pub mod coordinator;
pub mod screenpipe_supervisor;
