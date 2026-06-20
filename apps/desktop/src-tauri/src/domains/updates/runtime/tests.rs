//! Coordinator tests mirror `capture/runtime/coordinator/tests.rs`: a fake
//! [`UpdateChannel`] stands in for `tauri-plugin-updater`, a recording
//! observer captures the emitted state sequence, and every case runs as a
//! `#[tokio::test]` with no Tauri and no network. The five slices pin the
//! load-bearing behavior of ADR-0024's silent updater.

use std::collections::VecDeque;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use async_trait::async_trait;
use tokio::sync::Notify;

use crate::domains::updates::types::{
    UpdateChannel, UpdateError, UpdateObserver, UpdateOutcome, UpdateState,
};

use super::UpdateCoordinator;

/// Scripted channel: returns queued results in order, counting invocations.
/// An empty queue defaults to `UpToDate` so tests only script what they assert.
struct FakeChannel {
    results: Mutex<VecDeque<Result<UpdateOutcome, UpdateError>>>,
    calls: AtomicUsize,
}

impl FakeChannel {
    fn new(results: Vec<Result<UpdateOutcome, UpdateError>>) -> Arc<Self> {
        Arc::new(Self {
            results: Mutex::new(results.into()),
            calls: AtomicUsize::new(0),
        })
    }

    fn call_count(&self) -> usize {
        self.calls.load(Ordering::SeqCst)
    }
}

#[async_trait]
impl UpdateChannel for FakeChannel {
    async fn check_and_install(&self) -> Result<UpdateOutcome, UpdateError> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        self.results
            .lock()
            .unwrap()
            .pop_front()
            .unwrap_or(Ok(UpdateOutcome::UpToDate))
    }
}

/// Channel that blocks its first call on a barrier so a test can prove a
/// second, concurrent trigger never reaches `check_and_install`.
struct BlockingChannel {
    calls: AtomicUsize,
    /// Fired by the channel once it is inside the call (guard provably held).
    entered: Notify,
    /// Awaited by the channel; the test fires it to let the call complete.
    gate: Notify,
}

impl BlockingChannel {
    fn new() -> Arc<Self> {
        Arc::new(Self {
            calls: AtomicUsize::new(0),
            entered: Notify::new(),
            gate: Notify::new(),
        })
    }

    fn call_count(&self) -> usize {
        self.calls.load(Ordering::SeqCst)
    }
}

#[async_trait]
impl UpdateChannel for BlockingChannel {
    async fn check_and_install(&self) -> Result<UpdateOutcome, UpdateError> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        self.entered.notify_one();
        self.gate.notified().await;
        Ok(UpdateOutcome::UpToDate)
    }
}

#[derive(Default)]
struct RecordingObserver {
    history: Mutex<Vec<UpdateState>>,
}

impl RecordingObserver {
    fn history(&self) -> Vec<UpdateState> {
        self.history.lock().unwrap().clone()
    }

    fn last(&self) -> Option<UpdateState> {
        self.history.lock().unwrap().last().cloned()
    }
}

impl UpdateObserver for RecordingObserver {
    fn on_update_state(&self, state: &UpdateState) {
        self.history.lock().unwrap().push(state.clone());
    }
}

fn coordinator(
    channel: Arc<dyn UpdateChannel>,
    observer: Arc<RecordingObserver>,
) -> UpdateCoordinator {
    UpdateCoordinator::new(channel).with_observer(observer)
}

// Slice 1 — tracer bullet: an available update is installed end to end.
#[tokio::test]
async fn trigger_installs_an_available_update() {
    let channel = FakeChannel::new(vec![Ok(UpdateOutcome::Installed {
        version: "0.2.0".into(),
    })]);
    let observer = Arc::new(RecordingObserver::default());
    let coord = coordinator(channel.clone(), observer.clone());

    coord.trigger().await;

    assert_eq!(
        observer.last(),
        Some(UpdateState::Installed {
            version: "0.2.0".into()
        })
    );
    assert_eq!(channel.call_count(), 1);
}

// Slice 2 — no update is a quiet no-op (settles Idle).
#[tokio::test]
async fn trigger_with_no_update_settles_idle() {
    let channel = FakeChannel::new(vec![Ok(UpdateOutcome::UpToDate)]);
    let observer = Arc::new(RecordingObserver::default());
    let coord = coordinator(channel.clone(), observer.clone());

    coord.trigger().await;

    assert_eq!(observer.last(), Some(UpdateState::Idle));
}

// Slice 3 — a failing check is recoverable: it settles Idle (no panic) and a
// subsequent trigger still works.
#[tokio::test]
async fn failing_check_is_recoverable() {
    let channel = FakeChannel::new(vec![
        Err(UpdateError::Check("network down".into())),
        Ok(UpdateOutcome::UpToDate),
    ]);
    let observer = Arc::new(RecordingObserver::default());
    let coord = coordinator(channel.clone(), observer.clone());

    coord.trigger().await; // errors, settles Idle
    assert_eq!(observer.last(), Some(UpdateState::Idle));

    coord.trigger().await; // the seam is not poisoned; retry runs
    assert_eq!(observer.last(), Some(UpdateState::Idle));
    assert_eq!(channel.call_count(), 2);
}

// Slice 4 — concurrent triggers (launch racing wake) dedupe: the channel is
// invoked exactly once while a pass is in flight.
#[tokio::test]
async fn concurrent_triggers_dedupe() {
    let channel = BlockingChannel::new();
    let observer = Arc::new(RecordingObserver::default());
    let coord = Arc::new(coordinator(channel.clone(), observer.clone()));

    // First trigger acquires the guard and blocks inside the channel.
    let first = {
        let coord = coord.clone();
        tokio::spawn(async move { coord.trigger().await })
    };
    channel.entered.notified().await; // guard provably held now

    // Second trigger finds the guard held and returns without calling.
    coord.trigger().await;
    assert_eq!(channel.call_count(), 1, "the in-flight pass must not be re-run");

    channel.gate.notify_one(); // release the first pass
    first.await.unwrap();

    assert_eq!(channel.call_count(), 1);
    // Dedupe is silent: only the holding pass emitted (one Checking).
    assert_eq!(
        observer
            .history()
            .iter()
            .filter(|s| **s == UpdateState::Checking)
            .count(),
        1,
    );
}

// Slice 5 — silent: the emitted sequence is only state transitions, with no
// "update available" prompt. The coordinator exposes no prompt API at all
// (structural guarantee of ADR-0024's no-nag decision).
#[tokio::test]
async fn update_pass_is_silent_state_transitions_only() {
    let channel = FakeChannel::new(vec![Ok(UpdateOutcome::Installed {
        version: "0.2.0".into(),
    })]);
    let observer = Arc::new(RecordingObserver::default());
    let coord = coordinator(channel.clone(), observer.clone());

    coord.trigger().await;

    assert_eq!(
        observer.history(),
        vec![
            UpdateState::Checking,
            UpdateState::Installed {
                version: "0.2.0".into()
            },
        ],
        "silent pass emits Checking then the terminal state — no prompt in between",
    );
}
