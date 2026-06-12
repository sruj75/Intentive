//! Capture Permission Setup status emitter.
//!
//! macOS has no push API for permission changes, so the detection engine polls.
//! This mirrors ScreenPipe's detector-emits pattern (ADR-0021) and the
//! `capture::runtime::permission_monitor` shape: a Rust-side poller samples
//! [`CapturePermissions::snapshot`] on a short interval after the Capture
//! Permission Setup surface opens and emits the full [`PermissionSet`] under
//! `permissions:status` only on change. The webview is a pure subscriber — it
//! does not run its own granular poll.
//!
//! Lifecycle: [`PermissionEmitterSupervisor`] is re-ensured every time the setup
//! surface opens and keeps exactly one task alive. The task self-terminates once
//! every grant is live (grant completion). It is intentionally not tied to the
//! setup window hide event: Settings is hidden rather than destroyed, and the
//! single-instance guard plus self-termination bound the cost.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::Emitter;
use tokio::task::JoinHandle;
use tokio::time::{Instant, MissedTickBehavior};

use super::{CapturePermissions, PermissionSet, PERMISSIONS_STATUS_EVENT};

/// Granular setup poll cadence. Faster than the readiness `PermissionMonitor`
/// (5s) because the wizard wants near-immediate feedback as the user toggles
/// each grant in System Settings.
pub const POLL_INTERVAL: Duration = Duration::from_millis(1500);
pub const WAKE_GRACE: Duration = Duration::from_secs(10);

#[derive(Default)]
pub struct PermissionEmitterSupervisor {
    handle: Mutex<Option<JoinHandle<()>>>,
}

impl PermissionEmitterSupervisor {
    pub fn ensure_running(&self, spawn: impl FnOnce() -> JoinHandle<()>) {
        let mut handle = self.handle.lock().unwrap();
        if handle
            .as_ref()
            .is_some_and(|existing| !existing.is_finished())
        {
            return;
        }
        *handle = Some(spawn());
    }
}

/// Where an emitted snapshot goes. Production wraps the Tauri `AppHandle`; tests
/// record so the poller can be exercised without a Tauri runtime.
pub trait PermissionStatusSink: Send + Sync {
    fn emit(&self, status: PermissionSet);
}

/// Production sink: forwards each snapshot to the webview over the
/// `permissions:status` Tauri event.
pub struct TauriPermissionStatusSink {
    app: tauri::AppHandle,
}

impl TauriPermissionStatusSink {
    pub fn new(app: tauri::AppHandle) -> Self {
        Self { app }
    }
}

impl PermissionStatusSink for TauriPermissionStatusSink {
    fn emit(&self, status: PermissionSet) {
        let _ = self.app.emit(PERMISSIONS_STATUS_EVENT, status);
    }
}

pub struct PermissionStatusEmitter {
    permissions: Arc<dyn CapturePermissions>,
    sink: Arc<dyn PermissionStatusSink>,
    interval: Duration,
    wake_grace: Duration,
}

impl PermissionStatusEmitter {
    pub fn new(
        permissions: Arc<dyn CapturePermissions>,
        sink: Arc<dyn PermissionStatusSink>,
    ) -> Self {
        Self {
            permissions,
            sink,
            interval: POLL_INTERVAL,
            wake_grace: WAKE_GRACE,
        }
    }

    #[cfg(test)]
    fn with_timing(
        permissions: Arc<dyn CapturePermissions>,
        sink: Arc<dyn PermissionStatusSink>,
        interval: Duration,
        wake_grace: Duration,
    ) -> Self {
        Self {
            permissions,
            sink,
            interval,
            wake_grace,
        }
    }

    /// Spawn the emitter for the Tauri app after the Capture Permission Setup
    /// surface opens. The supervisor owns single-instance enforcement; the
    /// spawned task returns immediately when every grant is already live.
    pub fn spawn_for(
        app: tauri::AppHandle,
        permissions: Arc<dyn CapturePermissions>,
    ) -> JoinHandle<()> {
        let sink = Arc::new(TauriPermissionStatusSink::new(app));
        Self::new(permissions, sink).spawn()
    }

    pub fn spawn(self) -> JoinHandle<()> {
        tokio::spawn(async move { self.run().await })
    }

    pub async fn run(self) {
        let mut last = self.permissions.snapshot();
        // The wizard only opens while a grant is missing; if everything is
        // already live there is nothing to watch.
        if last.all_granted() {
            return;
        }
        let mut suppress_regression_until: Option<Instant> = None;
        let mut ticker = tokio::time::interval(self.interval);
        ticker.set_missed_tick_behavior(MissedTickBehavior::Skip);
        let mut last_tick = Instant::now();

        loop {
            ticker.tick().await;
            let now = Instant::now();
            if now.duration_since(last_tick) > self.interval + self.wake_grace {
                suppress_regression_until = Some(now + self.wake_grace);
            }
            last_tick = now;
            let current = self.permissions.snapshot();
            // After a sleep/wake gap the probes can briefly read a live grant as
            // missing; suppress surfacing that regression during the grace
            // window (mirrors `permission_monitor`'s false suppression).
            if !current.all_granted() && suppress_regression_until.is_some_and(|until| now < until)
            {
                continue;
            }
            suppress_regression_until = None;
            if current != last {
                last = current;
                self.sink.emit(current);
                // Grant completion: the wizard can now finish, so stop polling.
                if current.all_granted() {
                    return;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::future;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Mutex;

    use crate::providers::permissions::StubCapturePermissions;

    #[derive(Default)]
    struct RecordingSink {
        emitted: Mutex<Vec<PermissionSet>>,
    }

    impl RecordingSink {
        fn emitted(&self) -> Vec<PermissionSet> {
            self.emitted.lock().unwrap().clone()
        }
    }

    impl PermissionStatusSink for RecordingSink {
        fn emit(&self, status: PermissionSet) {
            self.emitted.lock().unwrap().push(status);
        }
    }

    fn set(screen_recording: bool, microphone: bool, accessibility: bool) -> PermissionSet {
        PermissionSet {
            screen_recording,
            microphone,
            accessibility,
        }
    }

    #[tokio::test(start_paused = true)]
    async fn supervisor_spawns_when_idle() {
        let supervisor = PermissionEmitterSupervisor::default();
        let spawned = Arc::new(AtomicUsize::new(0));
        let spawned_for_closure = spawned.clone();

        supervisor.ensure_running(move || {
            spawned_for_closure.fetch_add(1, Ordering::SeqCst);
            tokio::spawn(async {})
        });

        assert_eq!(spawned.load(Ordering::SeqCst), 1);
    }

    #[tokio::test(start_paused = true)]
    async fn supervisor_does_not_stack_while_running() {
        let supervisor = PermissionEmitterSupervisor::default();
        let spawned = Arc::new(AtomicUsize::new(0));

        for _ in 0..2 {
            let spawned_for_closure = spawned.clone();
            supervisor.ensure_running(move || {
                spawned_for_closure.fetch_add(1, Ordering::SeqCst);
                tokio::spawn(future::pending())
            });
        }

        assert_eq!(spawned.load(Ordering::SeqCst), 1);
    }

    #[tokio::test(start_paused = true)]
    async fn supervisor_respawns_after_completion() {
        let supervisor = PermissionEmitterSupervisor::default();
        let spawned = Arc::new(AtomicUsize::new(0));

        let first_spawned = spawned.clone();
        supervisor.ensure_running(move || {
            first_spawned.fetch_add(1, Ordering::SeqCst);
            tokio::spawn(async {})
        });
        tokio::task::yield_now().await;

        let second_spawned = spawned.clone();
        supervisor.ensure_running(move || {
            second_spawned.fetch_add(1, Ordering::SeqCst);
            tokio::spawn(async {})
        });

        assert_eq!(spawned.load(Ordering::SeqCst), 2);
    }

    #[tokio::test(start_paused = true)]
    async fn emits_only_on_snapshot_change() {
        let permissions = Arc::new(StubCapturePermissions::new(set(false, false, false)));
        let sink = Arc::new(RecordingSink::default());
        let emitter = PermissionStatusEmitter::with_timing(
            permissions.clone(),
            sink.clone(),
            Duration::from_secs(1),
            Duration::from_secs(10),
        );
        let handle = emitter.spawn();

        // No change yet → nothing emitted.
        tokio::time::advance(Duration::from_secs(1)).await;
        tokio::task::yield_now().await;
        assert!(sink.emitted().is_empty());

        // A grant flips → emit the new snapshot exactly once.
        permissions.set_snapshot(set(true, false, false));
        tokio::time::advance(Duration::from_secs(1)).await;
        tokio::task::yield_now().await;
        assert_eq!(sink.emitted(), vec![set(true, false, false)]);

        // Unchanged across the next tick → no further emit.
        tokio::time::advance(Duration::from_secs(1)).await;
        tokio::task::yield_now().await;
        assert_eq!(sink.emitted().len(), 1);
        handle.abort();
    }

    #[tokio::test(start_paused = true)]
    async fn stops_after_emitting_all_granted() {
        let permissions = Arc::new(StubCapturePermissions::new(set(true, true, false)));
        let sink = Arc::new(RecordingSink::default());
        let emitter = PermissionStatusEmitter::with_timing(
            permissions.clone(),
            sink.clone(),
            Duration::from_secs(1),
            Duration::from_secs(10),
        );
        let handle = emitter.spawn();

        // Establish the baseline before flipping the final grant.
        tokio::time::advance(Duration::from_secs(1)).await;
        tokio::task::yield_now().await;
        assert!(sink.emitted().is_empty());

        permissions.set_snapshot(set(true, true, true));
        tokio::time::advance(Duration::from_secs(1)).await;
        tokio::task::yield_now().await;
        assert_eq!(sink.emitted(), vec![set(true, true, true)]);
        // The run loop returns on completion; the task is finished.
        assert!(handle.is_finished());
    }

    #[tokio::test(start_paused = true)]
    async fn returns_immediately_when_already_fully_granted() {
        let permissions = Arc::new(StubCapturePermissions::new(set(true, true, true)));
        let sink = Arc::new(RecordingSink::default());
        let emitter = PermissionStatusEmitter::with_timing(
            permissions,
            sink.clone(),
            Duration::from_secs(1),
            Duration::from_secs(10),
        );
        let handle = emitter.spawn();
        tokio::task::yield_now().await;

        assert!(handle.is_finished());
        assert!(sink.emitted().is_empty());
    }

    #[tokio::test(start_paused = true)]
    async fn suppresses_regression_after_a_missed_tick_gap() {
        let permissions = Arc::new(StubCapturePermissions::new(set(true, true, false)));
        let sink = Arc::new(RecordingSink::default());
        let emitter = PermissionStatusEmitter::with_timing(
            permissions.clone(),
            sink.clone(),
            Duration::from_secs(1),
            Duration::from_secs(10),
        );
        let handle = emitter.spawn();

        tokio::time::advance(Duration::from_secs(1)).await;
        tokio::task::yield_now().await;
        // A wake gap with a momentarily-revoked grant must not emit during grace.
        permissions.set_snapshot(set(false, true, false));
        tokio::time::advance(Duration::from_secs(20)).await;
        tokio::task::yield_now().await;
        assert!(
            sink.emitted().is_empty(),
            "regression is suppressed during wake grace"
        );

        // After grace elapses, the (still-regressed) snapshot surfaces.
        tokio::time::advance(Duration::from_secs(10)).await;
        tokio::task::yield_now().await;
        assert_eq!(sink.emitted(), vec![set(false, true, false)]);
        handle.abort();
    }
}
