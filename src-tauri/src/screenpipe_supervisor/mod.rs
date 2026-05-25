//! ScreenPipe Supervisor — owns the ScreenPipe child process lifecycle behind
//! a small interface. The Capture Session coordinator asks the supervisor to
//! `start()` or `stop()`. Everything else — pre-spawn port probe, child
//! spawning, exit watching, silent retry, controlled-stop intent flag, and
//! Capture Error transitions — is hidden inside this module.
//!
//! Outcomes are published as `SupervisorEvent`s on an unbounded channel
//! supplied by the coordinator at construction. The supervisor does not
//! mutate any FSM directly — the coordinator owns that decision.
//!
//! Decisions:
//! - One silent retry then Capture Error (ADR-0011)
//! - Shutdown intent flag distinguishes stop from crash (ADR-0012)
//! - Bundled ScreenPipe on port 44380 with pre-spawn TCP probe (ADR-0013)

use std::io;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};

use async_trait::async_trait;
use tokio::sync::{mpsc, oneshot, Mutex};
use tokio::task::JoinHandle;
use url::Url;

mod config;
mod spawner;

pub use spawner::OsSpawner;

use crate::port::resolve_port_with;
use config::{CRASH_COPY, PORT, PORT_CONFLICT_COPY, PORT_FALLBACK, RETRY_DELAY};

/// Outcomes the supervisor publishes when a Capture Session changes shape.
/// The coordinator subscribes to this channel and translates events into
/// FSM transitions. Happy-path `start()` produces no event — the coordinator
/// already moved the FSM to Capturing before calling `start()`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SupervisorEvent {
    /// A user-initiated stop completed cleanly. Includes the case where a
    /// `stop()` raced an in-flight `start()` and won (ADR-0012).
    Stopped,
    /// Pre-spawn probe found the port occupied, spawn errored, or the silent
    /// retry budget was exhausted. The carried copy is surfaced verbatim in
    /// the menu bar's Capture Error item.
    Crashed { user_facing_copy: &'static str },
}

#[derive(Debug, thiserror::Error)]
pub enum SupervisorError {
    #[error("capture session already running")]
    AlreadyRunning,
    #[error("spawn failed: {0}")]
    Spawn(String),
}

/// Coordinator-facing seam. Today there is one production adapter
/// (`ScreenpipeSupervisor`); coordinator tests substitute a fake.
#[async_trait]
pub trait Supervisor: Send + Sync + 'static {
    async fn start(&self) -> Result<(), SupervisorError>;
    async fn stop(&self) -> Result<(), SupervisorError>;
}

/// Boundary trait for spawning the ScreenPipe child. The production
/// implementation lives in `spawner::OsSpawner`; tests inject a fake.
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
/// `wait()` returns `()` because the FSM decision uses the supervisor's
/// intent flag (ADR-0012), not the OS exit status.
#[async_trait]
pub trait ChildHandle: Send {
    async fn wait(&mut self) -> io::Result<()>;
    async fn kill(&mut self) -> io::Result<()>;
}

struct State {
    starting: bool,
    kill_tx: Option<oneshot::Sender<()>>,
    watcher_handle: Option<JoinHandle<()>>,
    shutdown_intended: bool,
    retry_used: bool,
}

impl State {
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

struct Inner {
    binary_path: PathBuf,
    spawner: Arc<dyn Spawner>,
    events_tx: mpsc::UnboundedSender<SupervisorEvent>,
    state: Mutex<State>,
    endpoint: ScreenpipeEndpoint,
}

pub struct ScreenpipeSupervisor {
    inner: Arc<Inner>,
}

/// Shared record of the ScreenPipe HTTP endpoint selected at spawn time.
/// Consumers read this instead of guessing which ADR-0013 port won.
#[derive(Clone, Debug)]
pub struct ScreenpipeEndpoint {
    active_url: Arc<RwLock<Option<Url>>>,
}

impl ScreenpipeEndpoint {
    fn new() -> Self {
        Self {
            active_url: Arc::new(RwLock::new(None)),
        }
    }

    pub fn primary_url() -> Url {
        Url::parse(&format!("http://127.0.0.1:{PORT}")).expect("valid ScreenPipe primary URL")
    }

    pub fn active_url(&self) -> Option<Url> {
        self.active_url
            .read()
            .expect("screenpipe endpoint lock poisoned")
            .clone()
    }

    pub fn current_or_primary_url(&self) -> Url {
        self.active_url().unwrap_or_else(Self::primary_url)
    }

    fn record_port(&self, port: u16) {
        let url =
            Url::parse(&format!("http://127.0.0.1:{port}")).expect("valid ScreenPipe URL port");
        *self
            .active_url
            .write()
            .expect("screenpipe endpoint lock poisoned") = Some(url);
    }

    /// Build an endpoint pre-bound to a fixed URL. Test-only — production
    /// supervisors construct an empty endpoint and call `record_port` after
    /// ScreenPipe spawns.
    #[cfg(test)]
    pub fn fixed(url: Url) -> Self {
        Self {
            active_url: Arc::new(RwLock::new(Some(url))),
        }
    }
}

impl ScreenpipeSupervisor {
    pub fn new(
        binary_path: PathBuf,
        spawner: Arc<dyn Spawner>,
        events_tx: mpsc::UnboundedSender<SupervisorEvent>,
    ) -> Arc<Self> {
        Arc::new(Self {
            inner: Arc::new(Inner {
                binary_path,
                spawner,
                events_tx,
                state: Mutex::new(State::new()),
                endpoint: ScreenpipeEndpoint::new(),
            }),
        })
    }

    pub fn endpoint(&self) -> ScreenpipeEndpoint {
        self.inner.endpoint.clone()
    }

    pub fn active_url(&self) -> Option<String> {
        self.inner.endpoint.active_url().map(|url| url.to_string())
    }
}

#[async_trait]
impl Supervisor for ScreenpipeSupervisor {
    async fn start(&self) -> Result<(), SupervisorError> {
        Inner::start(self.inner.clone()).await
    }

    async fn stop(&self) -> Result<(), SupervisorError> {
        Inner::stop(self.inner.clone()).await
    }
}

impl Inner {
    fn emit(&self, event: SupervisorEvent) {
        // Receiver gone is benign — the coordinator may have shut down
        // already.
        let _ = self.events_tx.send(event);
    }

    /// Spawn the ScreenPipe child on the configured port and start watching
    /// for its exit. The coordinator stays in Capturing on the happy path —
    /// it moved the FSM to Capturing before calling start.
    async fn start(self: Arc<Self>) -> Result<(), SupervisorError> {
        {
            let mut state = self.state.lock().await;
            if state.starting
                || state
                    .watcher_handle
                    .as_ref()
                    .is_some_and(|h| !h.is_finished())
            {
                return Err(SupervisorError::AlreadyRunning);
            }
            state.starting = true;
            state.shutdown_intended = false;
            state.retry_used = false;
        }

        // ADR-0013: probe primary, fall back to PORT_FALLBACK if occupied,
        // crash with PORT_CONFLICT_COPY only when both are taken. The closure
        // borrows the spawner via the shared Arc inside `self`.
        let spawner = self.spawner.clone();
        let port = match resolve_port_with(PORT, PORT_FALLBACK, |p| {
            let s = spawner.clone();
            async move { s.port_in_use(p).await }
        })
        .await
        {
            Ok(p) => p,
            Err(_) => {
                if self.finish_start_without_child().await {
                    self.emit(SupervisorEvent::Stopped);
                } else {
                    self.emit(SupervisorEvent::Crashed {
                        user_facing_copy: PORT_CONFLICT_COPY,
                    });
                }
                return Ok(());
            }
        };

        let child = match self.spawner.spawn(&self.binary_path, port).await {
            Ok(child) => child,
            Err(_) => {
                if self.finish_start_without_child().await {
                    self.emit(SupervisorEvent::Stopped);
                } else {
                    self.emit(SupervisorEvent::Crashed {
                        user_facing_copy: CRASH_COPY,
                    });
                }
                return Ok(());
            }
        };
        self.endpoint.record_port(port);

        let (kill_tx, kill_rx) = oneshot::channel();
        let watcher = {
            let this = self.clone();
            tokio::spawn(async move { this.watch(child, kill_rx, port).await })
        };

        let mut state = self.state.lock().await;
        state.starting = false;
        if state.shutdown_intended {
            let _ = kill_tx.send(());
            drop(state);
            let _ = watcher.await;
            return Ok(());
        }
        state.kill_tx = Some(kill_tx);
        state.watcher_handle = Some(watcher);
        Ok(())
    }

    /// Complete a failed start attempt before a watcher exists. Returns
    /// whether a concurrent `stop()` had already claimed user intent, in which
    /// case Stopped beats Crashed.
    async fn finish_start_without_child(&self) -> bool {
        let mut state = self.state.lock().await;
        state.starting = false;
        state.shutdown_intended
    }

    /// Stop the running session. Sets the shutdown-intent flag *before*
    /// signalling the watcher to kill the child (ADR-0012 ordering invariant)
    /// and awaits the watcher so the supervisor has emitted its terminal
    /// event by the time `stop()` returns.
    async fn stop(self: Arc<Self>) -> Result<(), SupervisorError> {
        let (kill_tx, watcher) = {
            let mut state = self.state.lock().await;
            state.shutdown_intended = true;
            (state.kill_tx.take(), state.watcher_handle.take())
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
        port: u16,
    ) {
        loop {
            tokio::select! {
                _ = child.wait() => {}
                _ = &mut kill_rx => {
                    let _ = child.kill().await;
                    let _ = child.wait().await;
                }
            }

            let intended = self.state.lock().await.shutdown_intended;
            if intended {
                self.emit(SupervisorEvent::Stopped);
                return;
            }

            // Unexpected exit — try the one silent retry (ADR-0011).
            let may_retry = {
                let mut state = self.state.lock().await;
                if state.retry_used {
                    false
                } else {
                    state.retry_used = true;
                    true
                }
            };
            if !may_retry {
                self.emit(SupervisorEvent::Crashed {
                    user_facing_copy: CRASH_COPY,
                });
                return;
            }

            tokio::time::sleep(RETRY_DELAY).await;

            let new_child = match self.spawner.spawn(&self.binary_path, port).await {
                Ok(c) => c,
                Err(_) => {
                    self.emit(SupervisorEvent::Crashed {
                        user_facing_copy: CRASH_COPY,
                    });
                    return;
                }
            };
            let (new_kill_tx, new_kill_rx) = oneshot::channel();
            {
                let mut state = self.state.lock().await;
                state.kill_tx = Some(new_kill_tx);
            }
            child = new_child;
            kill_rx = new_kill_rx;
        }
    }
}

#[cfg(test)]
mod tests;
