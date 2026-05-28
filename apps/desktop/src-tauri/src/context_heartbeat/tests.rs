use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use async_trait::async_trait;
use tokio::time::sleep;
use url::Url;

use crate::agent_interface::AgentSink;
use crate::screenpipe_supervisor::ScreenpipeEndpoint;
use crate::snapshot::{ContextSnapshot, SessionEndMarker, SessionEndReason};
use crate::snapshot_store::SnapshotStore;

use super::activity::{ActivityClient, ActivityError};
use super::{ContextHeartbeat, Summarizer, SummarizerError};

/// Short cadence used by every test. 50 ms gives the spawned tick task time
/// to run a full pass without making suites slow.
const TEST_INTERVAL: Duration = Duration::from_millis(50);

/// Returns a canned activity string. Captures the `screenpipe_url` it was
/// asked for so window-construction tests can inspect call shape.
struct FakeActivityClient {
    response: String,
    calls: Mutex<Vec<Url>>,
}

impl FakeActivityClient {
    fn new(response: &str) -> Arc<Self> {
        Arc::new(Self {
            response: response.to_string(),
            calls: Mutex::new(Vec::new()),
        })
    }

    fn call_count(&self) -> usize {
        self.calls.lock().unwrap().len()
    }
}

#[async_trait]
impl ActivityClient for FakeActivityClient {
    async fn query_last_10_minutes(&self, screenpipe_url: &Url) -> Result<String, ActivityError> {
        self.calls.lock().unwrap().push(screenpipe_url.clone());
        Ok(self.response.clone())
    }
}

/// Returns a canned summary, or one of the typed errors when configured.
struct FakeSummarizer {
    mode: SummarizerMode,
}

enum SummarizerMode {
    Ok(String),
    Unresolved,
}

struct PrepareRequiredSummarizer {
    prepared: AtomicBool,
}

impl PrepareRequiredSummarizer {
    fn new() -> Arc<Self> {
        Arc::new(Self {
            prepared: AtomicBool::new(false),
        })
    }
}

#[async_trait]
impl Summarizer for PrepareRequiredSummarizer {
    async fn prepare(&self) {
        self.prepared.store(true, Ordering::SeqCst);
    }

    async fn summarize(&self, _activity: &str) -> Result<String, SummarizerError> {
        if self.prepared.load(Ordering::SeqCst) {
            Ok("prepared provider summary".to_string())
        } else {
            Err(SummarizerError::Unresolved)
        }
    }
}

impl FakeSummarizer {
    fn ok(summary: &str) -> Arc<Self> {
        Arc::new(Self {
            mode: SummarizerMode::Ok(summary.to_string()),
        })
    }

    fn unresolved() -> Arc<Self> {
        Arc::new(Self {
            mode: SummarizerMode::Unresolved,
        })
    }
}

#[async_trait]
impl Summarizer for FakeSummarizer {
    async fn summarize(&self, _activity: &str) -> Result<String, SummarizerError> {
        match &self.mode {
            SummarizerMode::Ok(s) => Ok(s.clone()),
            SummarizerMode::Unresolved => Err(SummarizerError::Unresolved),
        }
    }
}

/// Records every snapshot pushed and every Session End Marker emitted so
/// tests can assert ordering and counts without a real HTTP transport.
struct RecordingSink {
    snapshots: Mutex<Vec<ContextSnapshot>>,
    markers: Mutex<Vec<SessionEndMarker>>,
}

impl RecordingSink {
    fn new() -> Arc<Self> {
        Arc::new(Self {
            snapshots: Mutex::new(Vec::new()),
            markers: Mutex::new(Vec::new()),
        })
    }

    fn snapshot_count(&self) -> usize {
        self.snapshots.lock().unwrap().len()
    }

    fn marker_count(&self) -> usize {
        self.markers.lock().unwrap().len()
    }

    fn latest_marker(&self) -> Option<SessionEndMarker> {
        self.markers.lock().unwrap().last().cloned()
    }
}

#[async_trait]
impl AgentSink for RecordingSink {
    async fn emit_context_snapshot(
        &self,
        snapshot: &ContextSnapshot,
    ) -> Result<(), crate::agent_interface::PushError> {
        self.snapshots.lock().unwrap().push(snapshot.clone());
        Ok(())
    }

    async fn emit_session_end_marker(&self, marker: &SessionEndMarker) {
        self.markers.lock().unwrap().push(marker.clone());
    }
}

async fn in_memory_store() -> Arc<SnapshotStore> {
    Arc::new(
        SnapshotStore::new(&PathBuf::from(":memory:"))
            .await
            .expect("in-memory store should initialise"),
    )
}

fn fixed_endpoint() -> ScreenpipeEndpoint {
    ScreenpipeEndpoint::fixed(Url::parse("http://127.0.0.1:44380").unwrap())
}

fn heartbeat_with(
    summarizer: Arc<dyn Summarizer>,
    activity: Arc<dyn ActivityClient>,
    store: Arc<SnapshotStore>,
    sink: Arc<dyn AgentSink>,
) -> Arc<ContextHeartbeat> {
    ContextHeartbeat::with_interval(
        summarizer,
        activity,
        fixed_endpoint(),
        store,
        sink,
        TEST_INTERVAL,
    )
}

/// Tracer bullet: starting the heartbeat and waiting one interval produces
/// exactly one persisted Context Snapshot with the summary the on-device LLM
/// returned and pushes it to the sink.
#[tokio::test]
async fn one_tick_produces_one_stored_snapshot() {
    let store = in_memory_store().await;
    let sink = RecordingSink::new();
    let heartbeat = heartbeat_with(
        FakeSummarizer::ok("user reviewed a PR"),
        FakeActivityClient::new("activity-summary payload"),
        store.clone(),
        sink.clone(),
    );

    heartbeat
        .clone()
        .start()
        .await
        .expect("start should succeed");
    sleep(TEST_INTERVAL * 2).await;
    heartbeat.stop(SessionEndReason::UserToggle).await;

    let rows = store.list_recent(10).await.expect("list should succeed");
    assert!(!rows.is_empty(), "at least one snapshot row after a tick");
    assert_eq!(rows[0].summary, "user reviewed a PR");
    assert!(sink.snapshot_count() >= 1, "snapshot should also be pushed");
}

/// A sink that, on every `emit_context_snapshot` call, checks whether the snapshot
/// already exists in the store. Used to assert write-before-push ordering
/// without relying on real HTTP failures.
struct OrderCheckingSink {
    store: Arc<SnapshotStore>,
    findings: Mutex<Vec<bool>>,
}

impl OrderCheckingSink {
    fn new(store: Arc<SnapshotStore>) -> Arc<Self> {
        Arc::new(Self {
            store,
            findings: Mutex::new(Vec::new()),
        })
    }

    fn all_found_in_store(&self) -> bool {
        let f = self.findings.lock().unwrap();
        !f.is_empty() && f.iter().all(|x| *x)
    }
}

#[async_trait]
impl AgentSink for OrderCheckingSink {
    async fn emit_context_snapshot(
        &self,
        snapshot: &ContextSnapshot,
    ) -> Result<(), crate::agent_interface::PushError> {
        let rows = self.store.list_recent(10).await.unwrap();
        let present = rows.iter().any(|r| r.snapshot_id == snapshot.snapshot_id);
        self.findings.lock().unwrap().push(present);
        Ok(())
    }

    async fn emit_session_end_marker(&self, _marker: &SessionEndMarker) {}
}

struct FailingSink;

#[async_trait]
impl AgentSink for FailingSink {
    async fn emit_context_snapshot(
        &self,
        _snapshot: &ContextSnapshot,
    ) -> Result<(), crate::agent_interface::PushError> {
        Err(crate::agent_interface::PushError::Network(
            "offline".to_string(),
        ))
    }

    async fn emit_session_end_marker(&self, _marker: &SessionEndMarker) {}
}

/// Stopping the heartbeat emits exactly one Session End Marker via the sink
/// before `stop` returns.
#[tokio::test]
async fn stop_emits_one_session_end_marker() {
    let store = in_memory_store().await;
    let sink = RecordingSink::new();
    let heartbeat = heartbeat_with(
        FakeSummarizer::ok("summary"),
        FakeActivityClient::new("activity"),
        store.clone(),
        sink.clone(),
    );

    heartbeat
        .clone()
        .start()
        .await
        .expect("start should succeed");
    sleep(TEST_INTERVAL * 2).await;
    heartbeat.stop(SessionEndReason::UserToggle).await;

    assert_eq!(
        sink.marker_count(),
        1,
        "exactly one Session End Marker should be emitted on stop"
    );
    let marker = sink.latest_marker().expect("marker should be recorded");
    assert!(matches!(marker.reason, SessionEndReason::UserToggle));
}

/// Stopping the heartbeat before any tick has fired still emits one marker —
/// the marker is a session lifecycle signal, not a tick artifact.
#[tokio::test]
async fn stop_emits_marker_even_with_zero_ticks() {
    let store = in_memory_store().await;
    let sink = RecordingSink::new();
    let heartbeat = heartbeat_with(
        FakeSummarizer::ok("summary"),
        FakeActivityClient::new("activity"),
        store.clone(),
        sink.clone(),
    );

    heartbeat
        .clone()
        .start()
        .await
        .expect("start should succeed");
    // Stop immediately, before the first interval elapses.
    heartbeat.stop(SessionEndReason::UserToggle).await;

    assert_eq!(sink.snapshot_count(), 0, "no snapshot should be pushed");
    assert_eq!(
        sink.marker_count(),
        1,
        "marker still emitted with zero ticks"
    );
}

/// Coordinator shutdown can be observed once from the initiating command and
/// again when ScreenPipe publishes its terminal event. Repeated stop handling
/// must still describe one Capture Session end to the runtime boundary.
#[tokio::test]
async fn repeated_stop_emits_only_one_session_end_marker() {
    let store = in_memory_store().await;
    let sink = RecordingSink::new();
    let heartbeat = heartbeat_with(
        FakeSummarizer::ok("summary"),
        FakeActivityClient::new("activity"),
        store,
        sink.clone(),
    );

    heartbeat
        .clone()
        .start()
        .await
        .expect("start should succeed");
    heartbeat.clone().stop(SessionEndReason::UserToggle).await;
    heartbeat.stop(SessionEndReason::UserToggle).await;

    assert_eq!(
        sink.marker_count(),
        1,
        "duplicate shutdown observations must not emit duplicate markers"
    );
}

/// The first tick fires after one full interval, not immediately on start.
/// Verified by checking the store is empty before the interval elapses, then
/// non-empty after.
#[tokio::test]
async fn first_tick_fires_after_one_full_interval() {
    let store = in_memory_store().await;
    let sink = RecordingSink::new();
    let heartbeat = heartbeat_with(
        FakeSummarizer::ok("summary"),
        FakeActivityClient::new("activity"),
        store.clone(),
        sink.clone(),
    );

    heartbeat
        .clone()
        .start()
        .await
        .expect("start should succeed");
    sleep(TEST_INTERVAL / 2).await;
    let mid = store.list_recent(10).await.expect("list should succeed");
    assert!(
        mid.is_empty(),
        "no snapshot should exist before the first interval elapses"
    );

    sleep(TEST_INTERVAL).await;
    let after = store.list_recent(10).await.expect("list should succeed");
    assert!(
        !after.is_empty(),
        "a snapshot should exist after the first interval elapses"
    );

    heartbeat.stop(SessionEndReason::UserToggle).await;
}

#[tokio::test]
async fn start_prepares_summarizer_before_first_tick() {
    let store = in_memory_store().await;
    let heartbeat = heartbeat_with(
        PrepareRequiredSummarizer::new(),
        FakeActivityClient::new("activity"),
        store.clone(),
        RecordingSink::new(),
    );

    heartbeat
        .clone()
        .start()
        .await
        .expect("start should succeed");
    sleep(TEST_INTERVAL * 2).await;
    heartbeat.stop(SessionEndReason::UserToggle).await;

    let rows = store.list_recent(10).await.expect("list should succeed");
    assert!(
        rows.iter()
            .any(|row| row.summary == "prepared provider summary"),
        "start should prepare a ready provider before the first tick"
    );
}

/// Each persisted snapshot covers exactly one interval — `period_end -
/// period_start == interval`. Asserted against `TEST_INTERVAL` here; the
/// production value is `HEARTBEAT_INTERVAL` (10 minutes) per ADR-0008.
#[tokio::test]
async fn snapshot_period_spans_one_full_interval() {
    let store = in_memory_store().await;
    let sink = RecordingSink::new();
    let activity = FakeActivityClient::new("activity");
    let heartbeat = heartbeat_with(
        FakeSummarizer::ok("summary"),
        activity.clone(),
        store.clone(),
        sink.clone(),
    );

    heartbeat
        .clone()
        .start()
        .await
        .expect("start should succeed");
    sleep(TEST_INTERVAL * 2).await;
    heartbeat.stop(SessionEndReason::UserToggle).await;

    let rows = store.list_recent(10).await.expect("list should succeed");
    assert!(!rows.is_empty());
    for row in &rows {
        let span = (row.period_end - row.period_start)
            .to_std()
            .expect("non-negative span");
        assert_eq!(
            span, TEST_INTERVAL,
            "every snapshot's period must span one interval exactly"
        );
    }
    assert!(
        activity.call_count() >= 1,
        "activity client must be queried"
    );
}

/// When the on-device LLM provider has not been resolved yet (the slot is
/// still empty), the heartbeat skips the tick entirely — no row is written,
/// no push is attempted. Logging the skip is observed manually via stderr;
/// the behavioral assertion lives here.
#[tokio::test]
async fn unresolved_summarizer_skips_tick_without_writing_or_pushing() {
    let store = in_memory_store().await;
    let sink = RecordingSink::new();
    let heartbeat = heartbeat_with(
        FakeSummarizer::unresolved(),
        FakeActivityClient::new("activity"),
        store.clone(),
        sink.clone(),
    );

    heartbeat
        .clone()
        .start()
        .await
        .expect("start should succeed");
    sleep(TEST_INTERVAL * 2).await;
    heartbeat.stop(SessionEndReason::UserToggle).await;

    let rows = store.list_recent(10).await.expect("list should succeed");
    assert!(
        rows.is_empty(),
        "no snapshot row when summarizer is unresolved"
    );
    assert_eq!(sink.snapshot_count(), 0, "no snapshot pushed");
}

/// The snapshot is persisted to the local store before the agent push is
/// invoked. Verified by observing the store from inside `emit_context_snapshot` —
/// the snapshot's row is already there.
#[tokio::test]
async fn snapshot_is_in_store_before_push() {
    let store = in_memory_store().await;
    let sink = OrderCheckingSink::new(store.clone());
    let heartbeat = heartbeat_with(
        FakeSummarizer::ok("summary"),
        FakeActivityClient::new("activity"),
        store.clone(),
        sink.clone(),
    );

    heartbeat
        .clone()
        .start()
        .await
        .expect("start should succeed");
    sleep(TEST_INTERVAL * 2).await;
    heartbeat.stop(SessionEndReason::UserToggle).await;

    assert!(
        sink.all_found_in_store(),
        "every emit_context_snapshot call must see the snapshot already in the store"
    );
}

/// A successful Agent Interface delivery is part of the Snapshot Store audit
/// record: once push completes, the persisted row must carry `pushed_at`.
#[tokio::test]
async fn successful_push_marks_snapshot_as_pushed() {
    let store = in_memory_store().await;
    let sink = RecordingSink::new();
    let heartbeat = heartbeat_with(
        FakeSummarizer::ok("summary"),
        FakeActivityClient::new("activity"),
        store.clone(),
        sink,
    );

    heartbeat
        .clone()
        .start()
        .await
        .expect("start should succeed");
    sleep(TEST_INTERVAL * 2).await;
    heartbeat.stop(SessionEndReason::UserToggle).await;

    let rows = store.list_recent(10).await.expect("list should succeed");
    assert!(!rows.is_empty(), "a successful tick should create a row");
    assert!(
        rows.iter().all(|row| row.pushed_at.is_some()),
        "successfully pushed snapshots must be stamped as delivered"
    );
}

#[tokio::test]
async fn failed_push_leaves_snapshot_unmarked() {
    let store = in_memory_store().await;
    let heartbeat = heartbeat_with(
        FakeSummarizer::ok("summary"),
        FakeActivityClient::new("activity"),
        store.clone(),
        Arc::new(FailingSink),
    );

    heartbeat
        .clone()
        .start()
        .await
        .expect("start should succeed");
    sleep(TEST_INTERVAL * 2).await;
    heartbeat.stop(SessionEndReason::UserToggle).await;

    let rows = store.list_recent(10).await.expect("list should succeed");
    assert!(!rows.is_empty(), "a failed delivery still retains the row");
    assert!(
        rows.iter().all(|row| row.pushed_at.is_none()),
        "failed pushes must remain unconfirmed in the local record"
    );
}
