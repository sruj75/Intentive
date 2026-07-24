//! Update domain data contracts — the vocabulary the coordinator and its
//! tests speak, free of any Tauri dependency. See ADR-0024 (in-app silent
//! auto-update on launch + wake).

use async_trait::async_trait;

/// Observable lifecycle of a single update pass. Deliberately small: the
/// download/install boundary is collapsed inside [`UpdateChannel`], so the
/// coordinator never observes a distinct "installing" phase. There is no
/// "update available" variant — that absence is the structural guarantee of
/// ADR-0024's no-nag decision.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum UpdateState {
    /// No update pass running; also the resting state after an up-to-date
    /// check or a recovered failure.
    Idle,
    /// A check (and, if needed, a silent download+install) is in flight.
    Checking,
    /// A newer build was fetched and installed; it takes effect next launch.
    Installed { version: String },
}

/// Result of one `check_and_install` pass — what the channel found and did.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum UpdateOutcome {
    /// Already on the latest build; nothing was downloaded.
    UpToDate,
    /// A newer build was downloaded and installed.
    Installed { version: String },
}

#[derive(Clone, Debug, PartialEq, Eq, thiserror::Error)]
pub enum UpdateError {
    #[error("update check failed: {0}")]
    Check(String),
    #[error("update install failed: {0}")]
    Install(String),
}

/// The single seam over `tauri-plugin-updater`. Small interface, deep impl:
/// the plugin's check → download → install collapses into one call so the
/// coordinator (and its tests) never touch Tauri or the network.
#[async_trait]
pub trait UpdateChannel: Send + Sync + 'static {
    async fn check_and_install(&self) -> Result<UpdateOutcome, UpdateError>;
}

/// Optional sink for update state transitions. The production app leaves this
/// unset (silent, per ADR-0024); tests attach one to assert the emitted
/// sequence.
pub trait UpdateObserver: Send + Sync + 'static {
    fn on_update_state(&self, state: &UpdateState);
}
