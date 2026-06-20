//! Updates domain — owns the in-app silent auto-update pass (ADR-0024): a
//! coordinator that checks for, downloads, and installs newer notarized builds
//! on launch and on macOS wake-from-sleep, with no prompt.
//!
//! - `types`   — update state/outcome/error vocab + the `UpdateChannel` seam.
//! - `runtime` — the `UpdateCoordinator` and (behind the Tauri dep) the real
//!   `TauriUpdateChannel`.

pub mod runtime;
pub mod types;
