//! Context Heartbeat — the service that turns a running Capture Session into
//! a stream of Context Snapshots. Ticks every 10 minutes, queries ScreenPipe
//! for the preceding window, summarizes on-device, writes the snapshot to the
//! local store, pushes it to the agent, and emits a Session End Marker when
//! the session ends for any reason. See ADR-0008.
//!
//! Callers see three operations: `new`, `start`, `stop`. Everything else —
//! timer cadence, ScreenPipe query construction, LLM invocation, store
//! ordering, push fan-out, marker emission, skip-and-log when the LLM
//! provider isn't resolved — is hidden inside this module.

use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use tokio::sync::{oneshot, Mutex as AsyncMutex};
use tokio::task::JoinHandle;
use uuid::Uuid;

use url::Url;

use crate::domains::snapshots::repo::SnapshotStore;
use crate::domains::snapshots::runtime::agent_interface::{AgentSink, PushError};
use crate::domains::snapshots::types::{ContextSnapshot, SessionEndMarker, SessionEndReason};
use crate::providers::observability;

/// Source of the live ScreenPipe HTTP endpoint the heartbeat queries each
/// tick. A trait seam so the snapshots domain does not depend on the capture
/// domain's `ScreenpipeEndpoint` — `lib.rs` injects the concrete value (ADR-0013
/// port resolution stays hidden behind it).
pub trait ScreenpipeUrlSource: Send + Sync + 'static {
    fn current_or_primary_url(&self) -> Url;
}

pub mod activity;

pub use activity::{ActivityClient, ActivityError, ReqwestActivityClient};

/// Fixed cadence per ADR-0008. The first tick fires after a full window, not
/// at t=0 — see `tokio::time::interval_at` in the tick loop.
pub const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(600);

#[derive(Debug, thiserror::Error)]
pub enum HeartbeatError {
    #[error("heartbeat already running")]
    AlreadyRunning,
}

/// On-device summarization seam. Hides the "LlmProvider may not be resolved
/// yet" detail behind a typed error so the heartbeat's tick loop has one
/// uniform skip path. The production adapter wraps `LlmProviderSlot`; tests
/// inject a fake that can return either branch deterministically.
#[async_trait]
pub trait Summarizer: Send + Sync + 'static {
    /// Resolve any provider already available for this Capture Session.
    /// Implementations must not initiate user-visible setup such as a model
    /// download from this background lifecycle hook.
    async fn prepare(&self) {}

    async fn summarize(&self, activity: &str) -> Result<String, SummarizerError>;
}

#[derive(Debug, thiserror::Error)]
pub enum SummarizerError {
    #[error("no on-device LLM provider resolved yet")]
    Unresolved,
    #[error("summarization failed: {0}")]
    Failed(String),
}

/// All collaborators the heartbeat reads at tick or stop time. Grouped so the
/// tick loop's signature stays small and the production constructor in
/// `lib.rs` can hand over one bundle.
struct Deps {
    summarizer: Arc<dyn Summarizer>,
    activity_client: Arc<dyn ActivityClient>,
    screenpipe_endpoint: Arc<dyn ScreenpipeUrlSource>,
    snapshot_store: Arc<SnapshotStore>,
    sink: Arc<dyn AgentSink>,
}

pub struct ContextHeartbeat {
    deps: Arc<Deps>,
    interval: Duration,
    state: AsyncMutex<RunState>,
}

struct RunState {
    kill_tx: Option<oneshot::Sender<()>>,
    task: Option<JoinHandle<()>>,
    session_active: bool,
}

impl ContextHeartbeat {
    pub fn new(
        summarizer: Arc<dyn Summarizer>,
        activity_client: Arc<dyn ActivityClient>,
        screenpipe_endpoint: Arc<dyn ScreenpipeUrlSource>,
        snapshot_store: Arc<SnapshotStore>,
        sink: Arc<dyn AgentSink>,
    ) -> Arc<Self> {
        Self::with_interval(
            summarizer,
            activity_client,
            screenpipe_endpoint,
            snapshot_store,
            sink,
            HEARTBEAT_INTERVAL,
        )
    }

    /// Internal constructor that lets tests override the fixed cadence so
    /// behavior tests don't have to wait 10 wall-clock minutes per tick.
    /// Production callers always use `new`.
    pub(crate) fn with_interval(
        summarizer: Arc<dyn Summarizer>,
        activity_client: Arc<dyn ActivityClient>,
        screenpipe_endpoint: Arc<dyn ScreenpipeUrlSource>,
        snapshot_store: Arc<SnapshotStore>,
        sink: Arc<dyn AgentSink>,
        interval: Duration,
    ) -> Arc<Self> {
        Arc::new(Self {
            deps: Arc::new(Deps {
                summarizer,
                activity_client,
                screenpipe_endpoint,
                snapshot_store,
                sink,
            }),
            interval,
            state: AsyncMutex::new(RunState {
                kill_tx: None,
                task: None,
                session_active: false,
            }),
        })
    }

    /// Spawn the tick loop. Returns immediately; the loop runs until `stop`.
    /// Re-calling without a stop in between is a programming error and returns
    /// `AlreadyRunning`.
    pub async fn start(self: Arc<Self>) -> Result<(), HeartbeatError> {
        let mut state = self.state.lock().await;
        if state.task.as_ref().is_some_and(|h| !h.is_finished()) {
            return Err(HeartbeatError::AlreadyRunning);
        }
        self.deps.summarizer.prepare().await;
        let (kill_tx, kill_rx) = oneshot::channel();
        let deps = self.deps.clone();
        let interval = self.interval;
        let task = tokio::spawn(async move { run_loop(deps, kill_rx, interval).await });
        state.kill_tx = Some(kill_tx);
        state.task = Some(task);
        state.session_active = true;
        Ok(())
    }

    /// Signal the active tick loop to exit, await its completion, and emit
    /// exactly one Session End Marker via the sink. An active session emits a
    /// marker even if it produced zero ticks; repeated stop calls are no-ops.
    pub async fn stop(self: Arc<Self>, reason: SessionEndReason) {
        let (kill_tx, task) = {
            let mut state = self.state.lock().await;
            if !state.session_active {
                return;
            }
            state.session_active = false;
            (state.kill_tx.take(), state.task.take())
        };
        if let Some(kill_tx) = kill_tx {
            let _ = kill_tx.send(());
        }
        if let Some(task) = task {
            let _ = task.await;
        }
        let marker = SessionEndMarker {
            ended_at: Utc::now(),
            reason,
        };
        observability::breadcrumb(
            "desktop.heartbeat",
            &format!("session end marker: {:?}", marker.reason),
            sentry::Level::Info,
        );
        self.deps.sink.emit_session_end_marker(&marker).await;
    }
}

async fn run_loop(deps: Arc<Deps>, mut kill_rx: oneshot::Receiver<()>, interval: Duration) {
    // `interval_at` (not `interval`) so the first tick fires at +interval,
    // not immediately on creation. Without this, every Capture Session would
    // produce one near-empty snapshot right at start.
    let mut ticker = tokio::time::interval_at(tokio::time::Instant::now() + interval, interval);
    loop {
        tokio::select! {
            _ = &mut kill_rx => return,
            _ = ticker.tick() => tick_once(&deps, interval).await,
        }
    }
}

async fn tick_once(deps: &Deps, interval: Duration) {
    observability::breadcrumb("desktop.heartbeat", "tick", sentry::Level::Info);
    let period_end: DateTime<Utc> = Utc::now();
    let period_start = period_end - chrono::Duration::from_std(interval).unwrap();
    let screenpipe_url = deps.screenpipe_endpoint.current_or_primary_url();

    let activity = match deps
        .activity_client
        .query_last_10_minutes(&screenpipe_url)
        .await
    {
        Ok(a) => a,
        Err(e) => {
            observability::capture_error(&e);
            return warn(&format!("activity query failed: {e}"));
        }
    };

    let summary = match deps.summarizer.summarize(&activity).await {
        Ok(s) => s,
        Err(SummarizerError::Unresolved) => {
            observability::breadcrumb(
                "desktop.heartbeat",
                "skipping tick: llm provider unresolved",
                sentry::Level::Warning,
            );
            return warn("skipping tick — on-device LLM provider not resolved yet");
        }
        Err(SummarizerError::Failed(msg)) => {
            observability::capture_message("summarization failed", sentry::Level::Error);
            return warn(&format!("summarization failed: {msg}"));
        }
    };

    let snapshot = ContextSnapshot {
        snapshot_id: Uuid::new_v4(),
        captured_at: period_end,
        period_start,
        period_end,
        summary,
    };

    if let Err(e) = deps.snapshot_store.insert(&snapshot).await {
        observability::capture_message("snapshot store insert failed", sentry::Level::Error);
        return warn(&format!("snapshot store insert failed: {e}"));
    }

    // Write-before-push (ADR-0007): the row exists locally regardless of
    // delivery outcome. Failed pushes stay unmarked per ADR-0005.
    match deps.sink.emit_context_snapshot(&snapshot).await {
        Ok(()) => {
            if let Err(e) = deps.snapshot_store.mark_pushed(snapshot.snapshot_id).await {
                observability::capture_message(
                    "snapshot delivery status update failed",
                    sentry::Level::Error,
                );
                warn(&format!("snapshot delivery status update failed: {e}"));
            }
        }
        Err(e) => {
            if should_capture_push_error(&e) {
                observability::capture_error(&e);
            }
        }
    }
}

fn should_capture_push_error(error: &PushError) -> bool {
    !matches!(error, PushError::NotConnected)
}

fn warn(msg: &str) {
    // The repo has no logging facade yet; `eprintln!` is the lightest touch.
    // Swap for a `tracing` macro when one is introduced project-wide.
    eprintln!("context_heartbeat: {msg}");
}

#[cfg(test)]
mod tests;
