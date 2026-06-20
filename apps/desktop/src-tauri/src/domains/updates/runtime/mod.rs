//! Update orchestration — the single owner of the silent auto-update pass
//! (ADR-0024). Both the launch hook and the macOS wake-from-sleep observer
//! call the same `trigger`; all the logic (state emission, concurrency
//! dedupe, error recovery) lives here behind the [`UpdateChannel`] seam, so
//! the launch/wake call sites in `lib.rs` stay thin and the orchestration is
//! unit-testable without Tauri.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use async_trait::async_trait;
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

use crate::domains::updates::types::{
    UpdateChannel, UpdateError, UpdateObserver, UpdateOutcome, UpdateState,
};

#[cfg(target_os = "macos")]
mod wake;
#[cfg(target_os = "macos")]
pub use wake::register_wake_trigger;

pub struct UpdateCoordinator {
    channel: Arc<dyn UpdateChannel>,
    /// Guards against a launch check racing a wake check: only the first
    /// caller runs `check_and_install`; concurrent triggers are silent no-ops.
    in_flight: AtomicBool,
    observer: Option<Arc<dyn UpdateObserver>>,
}

impl UpdateCoordinator {
    pub fn new(channel: Arc<dyn UpdateChannel>) -> Self {
        Self {
            channel,
            in_flight: AtomicBool::new(false),
            observer: None,
        }
    }

    /// Attach a state observer. Production wiring omits this — updates are
    /// silent (ADR-0024); tests use it to assert the emitted sequence.
    pub fn with_observer(mut self, observer: Arc<dyn UpdateObserver>) -> Self {
        self.observer = Some(observer);
        self
    }

    /// The single entry point both launch and wake call. Checks for a newer
    /// build and, if found, silently downloads + installs it. Concurrent
    /// triggers dedupe to one in-flight pass; a failed pass is logged and
    /// settles back to `Idle` so the next trigger can retry.
    pub async fn trigger(&self) {
        // Dedupe: claim the in-flight guard; if it's already held, this
        // trigger is a quiet no-op (the other pass covers it).
        if self
            .in_flight
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_err()
        {
            return;
        }

        self.emit(UpdateState::Checking);
        match self.channel.check_and_install().await {
            Ok(UpdateOutcome::Installed { version }) => {
                self.emit(UpdateState::Installed { version });
            }
            Ok(UpdateOutcome::UpToDate) => {
                self.emit(UpdateState::Idle);
            }
            Err(err) => {
                // Recoverable: a check/install failure must never crash the
                // app or strand the updater — log and settle Idle so a later
                // launch/wake trigger tries again.
                eprintln!("[updates] auto-update pass failed: {err}");
                self.emit(UpdateState::Idle);
            }
        }

        self.in_flight.store(false, Ordering::Release);
    }

    fn emit(&self, state: UpdateState) {
        if let Some(observer) = &self.observer {
            observer.on_update_state(&state);
        }
    }
}

/// Production [`UpdateChannel`] over `tauri-plugin-updater`. Runtime layer: it
/// may name Tauri and is never imported by the coordinator tests. Collapses the
/// plugin's check → download → install into the single seam call so the
/// coordinator stays Tauri-free.
pub struct TauriUpdateChannel {
    app: AppHandle,
}

impl TauriUpdateChannel {
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }
}

#[async_trait]
impl UpdateChannel for TauriUpdateChannel {
    async fn check_and_install(&self) -> Result<UpdateOutcome, UpdateError> {
        let updater = self
            .app
            .updater()
            .map_err(|err| UpdateError::Check(err.to_string()))?;
        match updater.check().await {
            Ok(Some(update)) => {
                let version = update.version.clone();
                // Silent: no progress UI, no relaunch prompt. The installed
                // build takes effect on the next launch (ADR-0024).
                update
                    .download_and_install(|_chunk, _total| {}, || {})
                    .await
                    .map_err(|err| UpdateError::Install(err.to_string()))?;
                Ok(UpdateOutcome::Installed { version })
            }
            Ok(None) => Ok(UpdateOutcome::UpToDate),
            Err(err) => Err(UpdateError::Check(err.to_string())),
        }
    }
}

#[cfg(test)]
mod tests;
