//! Capture Session — owns the ScreenPipe child process lifecycle behind a
//! small interface. Callers (the menu bar event handler) ask the manager to
//! `start()` or `stop()`. Everything else — pre-spawn port probe, child
//! spawning, exit watching, silent retry, controlled-stop intent flag, and
//! Capture Error transitions — is hidden inside this module.
//!
//! Decisions:
//! - One silent retry then Capture Error (ADR-0011)
//! - Shutdown intent flag distinguishes stop from crash (ADR-0012)
//! - Bundled ScreenPipe on port 44380 with pre-spawn TCP probe (ADR-0013)

use std::io;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use async_trait::async_trait;
use tokio::sync::{oneshot, Mutex};
use tokio::task::JoinHandle;

use crate::capture_state::ErrorReason;
use crate::menu_bar::state_holder::StateHolder;

mod config;
mod spawner;

pub use spawner::OsSpawner;

use config::{CRASH_COPY, PORT, PORT_CONFLICT_COPY, RETRY_DELAY};

/// Callback that asks the menu bar shell to re-render the tray icon and menu
/// after the manager has mutated the FSM from inside an internal task. The
/// callback is wired in `lib.rs::setup` and is a no-op in tests that don't
/// care about refresh accounting. Kept as a plain `Fn()` so the manager
/// stays Tauri-free.
pub type RefreshTray = Arc<dyn Fn() + Send + Sync>;

#[derive(Debug, thiserror::Error)]
pub enum CaptureSessionError {
    #[error("capture session already running")]
    AlreadyRunning,
    #[error("spawn failed: {0}")]
    Spawn(String),
}

/// Boundary trait for spawning the ScreenPipe child. The production
/// implementation lives in `spawner::OsSpawner` (added when the integration
/// layer needs it); tests inject a fake.
#[async_trait]
pub trait Spawner: Send + Sync + 'static {
    async fn spawn(&self, binary: &Path, port: u16) -> io::Result<Box<dyn ChildHandle>>;
    /// Returns true if some other process already owns the port. Used as the
    /// pre-spawn probe in ADR-0013 so a port conflict never consumes the
    /// crash retry budget.
    async fn port_in_use(&self, port: u16) -> bool;
}

/// Boundary trait for an alive ScreenPipe child. Implementations wrap a real
/// `tokio::process::Child` in production and a controllable fake in tests.
/// `wait()` returns `()` because the FSM decision uses the manager's intent
/// flag (ADR-0012), not the OS exit status.
#[async_trait]
pub trait ChildHandle: Send {
    async fn wait(&mut self) -> io::Result<()>;
    async fn kill(&mut self) -> io::Result<()>;
}

struct Inner {
    /// True while `start()` is past its duplicate-start guard but has not yet
    /// either installed a watcher or resolved as a visible failure. This lets
    /// `stop()` record user intent during slow spawn/probe awaits.
    starting: bool,
    /// Fired by `stop()` to wake the watcher's kill branch. `None` while no
    /// session is running. Replaced by the watcher on each successful retry
    /// so `stop()` always targets the *current* child.
    kill_tx: Option<oneshot::Sender<()>>,
    /// Watcher task. `stop()` awaits this to guarantee the FSM is in its
    /// final state when `stop()` returns.
    watcher_handle: Option<JoinHandle<()>>,
    /// ADR-0012: set true before kill so the watcher routes the exit to
    /// `Stopped` rather than triggering the crash retry path.
    shutdown_intended: bool,
    /// ADR-0011: one silent retry per session. Reset to false on every
    /// successful `start()`; flipped to true on the first unexpected exit.
    retry_used: bool,
}

impl Inner {
    fn new() -> Self {
        Self {
            starting: false,
            kill_tx: None,
            watcher_handle: None,
            shutdown_intended: false,
            retry_used: false,
        }
    }
}

pub struct CaptureSessionManager {
    binary_path: PathBuf,
    spawner: Arc<dyn Spawner>,
    state: Arc<StateHolder>,
    refresh_tray: RefreshTray,
    inner: Mutex<Inner>,
}

impl CaptureSessionManager {
    pub fn new(
        binary_path: PathBuf,
        spawner: Arc<dyn Spawner>,
        state: Arc<StateHolder>,
        refresh_tray: RefreshTray,
    ) -> Arc<Self> {
        Arc::new(Self {
            binary_path,
            spawner,
            state,
            refresh_tray,
            inner: Mutex::new(Inner::new()),
        })
    }

    fn enter_error(&self, copy: &str) {
        let reason = ErrorReason::new(copy.to_string()).expect("static error copy is non-empty");
        self.state.to_error(reason);
        (self.refresh_tray)();
    }

    /// Spawn the ScreenPipe child on the configured port and start watching
    /// for its exit. The FSM stays in Capturing on the happy path — the
    /// caller (menu bar toggle) is the authority that moved the FSM to
    /// Capturing.
    pub async fn start(self: &Arc<Self>) -> Result<(), CaptureSessionError> {
        {
            let mut inner = self.inner.lock().await;
            if inner.starting
                || inner
                    .watcher_handle
                    .as_ref()
                    .is_some_and(|h| !h.is_finished())
            {
                return Err(CaptureSessionError::AlreadyRunning);
            }
            inner.starting = true;
            inner.shutdown_intended = false;
            inner.retry_used = false;
        }

        if self.spawner.port_in_use(PORT).await {
            if self.finish_start_without_child().await {
                self.state.recover_to_stopped();
                (self.refresh_tray)();
            } else {
                self.enter_error(PORT_CONFLICT_COPY);
            }
            return Ok(());
        }

        let child = match self.spawner.spawn(&self.binary_path, PORT).await {
            Ok(child) => child,
            Err(_) => {
                if self.finish_start_without_child().await {
                    self.state.recover_to_stopped();
                    (self.refresh_tray)();
                } else {
                    self.enter_error(CRASH_COPY);
                }
                return Ok(());
            }
        };

        let (kill_tx, kill_rx) = oneshot::channel();
        let watcher = {
            let this = self.clone();
            tokio::spawn(async move { this.watch(child, kill_rx).await })
        };

        let mut inner = self.inner.lock().await;
        inner.starting = false;
        if inner.shutdown_intended {
            let _ = kill_tx.send(());
            drop(inner);
            let _ = watcher.await;
            return Ok(());
        }
        inner.kill_tx = Some(kill_tx);
        inner.watcher_handle = Some(watcher);
        Ok(())
    }

    /// Complete a failed start attempt before a watcher exists. Returns
    /// whether a concurrent `stop()` had already claimed user intent, in which
    /// case Stopped beats Error.
    async fn finish_start_without_child(&self) -> bool {
        let mut inner = self.inner.lock().await;
        inner.starting = false;
        inner.shutdown_intended
    }

    /// Stop the running session. Sets the shutdown-intent flag *before*
    /// signalling the watcher to kill the child (ADR-0012 ordering invariant)
    /// and awaits the watcher so the FSM is guaranteed to be `Stopped` when
    /// this returns.
    pub async fn stop(self: &Arc<Self>) -> Result<(), CaptureSessionError> {
        let (kill_tx, watcher) = {
            let mut inner = self.inner.lock().await;
            inner.shutdown_intended = true;
            (inner.kill_tx.take(), inner.watcher_handle.take())
        };
        if let Some(tx) = kill_tx {
            let _ = tx.send(());
        }
        if let Some(handle) = watcher {
            let _ = handle.await;
        }
        Ok(())
    }

    async fn watch(
        self: Arc<Self>,
        mut child: Box<dyn ChildHandle>,
        mut kill_rx: oneshot::Receiver<()>,
    ) {
        loop {
            tokio::select! {
                _ = child.wait() => {}
                _ = &mut kill_rx => {
                    let _ = child.kill().await;
                    let _ = child.wait().await;
                }
            }

            let intended = self.inner.lock().await.shutdown_intended;
            if intended {
                self.state.recover_to_stopped();
                (self.refresh_tray)();
                return;
            }

            // Unexpected exit — try the one silent retry (ADR-0011).
            let may_retry = {
                let mut inner = self.inner.lock().await;
                if inner.retry_used {
                    false
                } else {
                    inner.retry_used = true;
                    true
                }
            };
            if !may_retry {
                self.enter_error(CRASH_COPY);
                return;
            }

            tokio::time::sleep(RETRY_DELAY).await;

            let new_child = match self.spawner.spawn(&self.binary_path, PORT).await {
                Ok(c) => c,
                Err(_) => {
                    self.enter_error(CRASH_COPY);
                    return;
                }
            };
            let (new_kill_tx, new_kill_rx) = oneshot::channel();
            {
                let mut inner = self.inner.lock().await;
                inner.kill_tx = Some(new_kill_tx);
            }
            child = new_child;
            kill_rx = new_kill_rx;
        }
    }
}

#[cfg(test)]
mod tests;
