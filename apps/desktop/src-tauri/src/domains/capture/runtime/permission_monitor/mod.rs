//! Desktop Capture Readiness monitor.
//!
//! Polls the readiness seam and submits a single coordinator command when the
//! boolean flips. The monitor deliberately does not know which permission
//! changed; that detail belongs to the provider and setup UI.
//!
//! #32 ships poll-only monitoring for v1. The eager capture-stream-error signal
//! is tracked with the #43 reliability harness.

use std::sync::Arc;
use std::time::Duration;

use tokio::task::JoinHandle;
use tokio::time::{Instant, MissedTickBehavior};

use crate::domains::capture::service::ReadinessChecker;
use crate::domains::capture::types::session::{CaptureSessionControl, CoordinatorCommand};

pub const POLL_INTERVAL: Duration = Duration::from_secs(5);
pub const WAKE_GRACE: Duration = Duration::from_secs(10);

pub struct PermissionMonitor {
    readiness: Arc<dyn ReadinessChecker>,
    coordinator: Arc<dyn CaptureSessionControl>,
    interval: Duration,
    wake_grace: Duration,
}

impl PermissionMonitor {
    pub fn new(
        readiness: Arc<dyn ReadinessChecker>,
        coordinator: Arc<dyn CaptureSessionControl>,
    ) -> Self {
        Self {
            readiness,
            coordinator,
            interval: POLL_INTERVAL,
            wake_grace: WAKE_GRACE,
        }
    }

    #[cfg(test)]
    fn with_timing(
        readiness: Arc<dyn ReadinessChecker>,
        coordinator: Arc<dyn CaptureSessionControl>,
        interval: Duration,
        wake_grace: Duration,
    ) -> Self {
        Self {
            readiness,
            coordinator,
            interval,
            wake_grace,
        }
    }

    pub fn spawn(self) -> JoinHandle<()> {
        tokio::spawn(async move { self.run().await })
    }

    pub async fn run(self) {
        let mut last = self.readiness.is_capture_ready();
        let mut suppress_false_until: Option<Instant> = None;
        let mut ticker = tokio::time::interval(self.interval);
        ticker.set_missed_tick_behavior(MissedTickBehavior::Skip);
        let mut last_tick = Instant::now();

        loop {
            ticker.tick().await;
            let now = Instant::now();
            if now.duration_since(last_tick) > self.interval + self.wake_grace {
                suppress_false_until = Some(now + self.wake_grace);
            }
            last_tick = now;
            let current = self.readiness.is_capture_ready();
            if !current && suppress_false_until.is_some_and(|until| now < until) {
                continue;
            }
            suppress_false_until = None;
            if current != last {
                last = current;
                self.coordinator
                    .submit(CoordinatorCommand::ReadinessChanged(current));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    use crate::domains::capture::service::StubReadinessChecker;
    use crate::domains::capture::types::state::CaptureState;

    #[derive(Default)]
    struct RecordingControl {
        commands: Mutex<Vec<CoordinatorCommand>>,
    }

    impl RecordingControl {
        fn commands(&self) -> Vec<CoordinatorCommand> {
            self.commands.lock().unwrap().clone()
        }
    }

    impl CaptureSessionControl for RecordingControl {
        fn submit(&self, command: CoordinatorCommand) {
            self.commands.lock().unwrap().push(command);
        }

        fn subscribe(
            &self,
            observer: Arc<dyn crate::domains::capture::types::session::StateObserver>,
        ) {
            let _ = observer;
        }

        fn snapshot(&self) -> CaptureState {
            CaptureState::SetupRequired
        }
    }

    #[tokio::test(start_paused = true)]
    async fn emits_readiness_changed_only_on_flips() {
        let readiness = Arc::new(StubReadinessChecker::new(false));
        let control = Arc::new(RecordingControl::default());
        let monitor = PermissionMonitor::with_timing(
            readiness.clone(),
            control.clone(),
            Duration::from_secs(1),
            Duration::from_secs(10),
        );
        let handle = monitor.spawn();

        tokio::time::advance(Duration::from_secs(1)).await;
        tokio::task::yield_now().await;
        assert!(control.commands().is_empty());

        readiness.set_ready(true);
        tokio::time::advance(Duration::from_secs(1)).await;
        tokio::task::yield_now().await;
        assert!(matches!(
            control.commands().as_slice(),
            [CoordinatorCommand::ReadinessChanged(true)]
        ));

        tokio::time::advance(Duration::from_secs(1)).await;
        tokio::task::yield_now().await;
        assert_eq!(control.commands().len(), 1);
        handle.abort();
    }

    #[tokio::test(start_paused = true)]
    async fn suppresses_false_readiness_after_a_missed_tick_gap() {
        let readiness = Arc::new(StubReadinessChecker::new(true));
        let control = Arc::new(RecordingControl::default());
        let monitor = PermissionMonitor::with_timing(
            readiness.clone(),
            control.clone(),
            Duration::from_secs(1),
            Duration::from_secs(10),
        );
        let handle = monitor.spawn();

        tokio::time::advance(Duration::from_secs(1)).await;
        tokio::task::yield_now().await;
        readiness.set_ready(false);
        tokio::time::advance(Duration::from_secs(20)).await;
        tokio::task::yield_now().await;
        assert!(
            control.commands().is_empty(),
            "false readiness is suppressed during wake grace"
        );

        tokio::time::advance(Duration::from_secs(10)).await;
        tokio::task::yield_now().await;
        assert!(matches!(
            control.commands().as_slice(),
            [CoordinatorCommand::ReadinessChanged(false)]
        ));
        handle.abort();
    }
}
