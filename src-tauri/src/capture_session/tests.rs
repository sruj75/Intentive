use std::io;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use async_trait::async_trait;
use tokio::sync::Notify;

use crate::capture_state::{CaptureState, StubAuthChecker};
use crate::menu_bar::state_holder::StateHolder;

use super::{CaptureSessionError, CaptureSessionManager, ChildHandle, RefreshTray, Spawner};

/// Shared control surface for a single fake child. The manager holds a
/// `FakeChild` (which references these controls); the test holds a clone via
/// `FakeSpawner::child(n)` to simulate kills and unexpected exits.
struct ChildControls {
    exit_signal: Notify,
    exit_fired: AtomicBool,
    kill_called: AtomicBool,
}

impl ChildControls {
    fn new() -> Self {
        Self {
            exit_signal: Notify::new(),
            exit_fired: AtomicBool::new(false),
            kill_called: AtomicBool::new(false),
        }
    }

    /// Mark the process as exited and wake any waiter. Idempotent — used both
    /// by `kill()` and by tests simulating an unexpected exit.
    fn fire_exit(&self) {
        self.exit_fired.store(true, Ordering::SeqCst);
        self.exit_signal.notify_waiters();
    }

    #[allow(dead_code)] // exercised in later TDD cycles
    fn kill_was_called(&self) -> bool {
        self.kill_called.load(Ordering::SeqCst)
    }
}

struct FakeChild {
    controls: Arc<ChildControls>,
}

#[async_trait]
impl ChildHandle for FakeChild {
    async fn wait(&mut self) -> io::Result<()> {
        if self.controls.exit_fired.load(Ordering::SeqCst) {
            return Ok(());
        }
        self.controls.exit_signal.notified().await;
        Ok(())
    }

    async fn kill(&mut self) -> io::Result<()> {
        self.controls.kill_called.store(true, Ordering::SeqCst);
        self.controls.fire_exit();
        Ok(())
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct SpawnCall {
    binary: PathBuf,
    port: u16,
}

struct FakeSpawner {
    spawn_calls: Mutex<Vec<SpawnCall>>,
    children: Mutex<Vec<Arc<ChildControls>>>,
    port_in_use: AtomicBool,
    spawn_blocked: AtomicBool,
    spawn_release: Notify,
    spawn_fails: AtomicBool,
}

impl FakeSpawner {
    fn new() -> Self {
        Self {
            spawn_calls: Mutex::new(Vec::new()),
            children: Mutex::new(Vec::new()),
            port_in_use: AtomicBool::new(false),
            spawn_blocked: AtomicBool::new(false),
            spawn_release: Notify::new(),
            spawn_fails: AtomicBool::new(false),
        }
    }

    fn spawn_calls(&self) -> Vec<SpawnCall> {
        self.spawn_calls.lock().unwrap().clone()
    }

    #[allow(dead_code)] // exercised in later TDD cycles
    fn child(&self, index: usize) -> Arc<ChildControls> {
        self.children.lock().unwrap()[index].clone()
    }

    fn set_port_in_use(&self, value: bool) {
        self.port_in_use.store(value, Ordering::SeqCst);
    }

    fn block_spawn(&self) {
        self.spawn_blocked.store(true, Ordering::SeqCst);
    }

    fn release_spawn(&self) {
        self.spawn_blocked.store(false, Ordering::SeqCst);
        self.spawn_release.notify_waiters();
    }

    fn fail_spawn(&self) {
        self.spawn_fails.store(true, Ordering::SeqCst);
    }
}

#[async_trait]
impl Spawner for FakeSpawner {
    async fn spawn(&self, binary: &Path, port: u16) -> io::Result<Box<dyn ChildHandle>> {
        self.spawn_calls.lock().unwrap().push(SpawnCall {
            binary: binary.to_path_buf(),
            port,
        });
        while self.spawn_blocked.load(Ordering::SeqCst) {
            self.spawn_release.notified().await;
        }
        if self.spawn_fails.load(Ordering::SeqCst) {
            return Err(io::Error::new(
                io::ErrorKind::NotFound,
                "fake spawn failure",
            ));
        }
        let controls = Arc::new(ChildControls::new());
        self.children.lock().unwrap().push(controls.clone());
        Ok(Box::new(FakeChild { controls }))
    }

    async fn port_in_use(&self, _port: u16) -> bool {
        self.port_in_use.load(Ordering::SeqCst)
    }
}

fn signed_in_holder() -> Arc<StateHolder> {
    let auth = Arc::new(StubAuthChecker::new(true));
    Arc::new(StateHolder::new(auth))
}

fn noop_refresh() -> RefreshTray {
    Arc::new(|| {})
}

fn counting_refresh() -> (Arc<AtomicUsize>, RefreshTray) {
    let counter = Arc::new(AtomicUsize::new(0));
    let c = counter.clone();
    (
        counter,
        Arc::new(move || {
            c.fetch_add(1, Ordering::SeqCst);
        }),
    )
}

/// Cooperative wait: yields until the spawner's recorded spawn count reaches
/// `target`. Works under `start_paused = true` because the watcher's
/// non-sleep awaits make progress as soon as we yield. Bounded so a buggy
/// test fails fast instead of hanging the suite.
async fn wait_for_spawn_count(spawner: &FakeSpawner, target: usize) {
    for _ in 0..2_000 {
        if spawner.spawn_calls().len() >= target {
            return;
        }
        tokio::task::yield_now().await;
    }
    panic!(
        "spawn count {} never reached target {target}",
        spawner.spawn_calls().len()
    );
}

#[tokio::test]
async fn start_spawns_child_and_keeps_capturing() {
    let holder = signed_in_holder();
    assert_eq!(
        holder.snapshot(),
        CaptureState::Capturing,
        "signed-in launch puts FSM in Capturing per ADR-0009",
    );

    let spawner = Arc::new(FakeSpawner::new());
    let binary = PathBuf::from("/fake/screenpipe");
    let manager = CaptureSessionManager::new(
        binary.clone(),
        spawner.clone(),
        holder.clone(),
        noop_refresh(),
    );

    manager.start().await.expect("start succeeds");

    let calls = spawner.spawn_calls();
    assert_eq!(calls.len(), 1, "exactly one spawn invocation");
    assert_eq!(calls[0].port, 44380, "spawn uses the ADR-0013 port");
    assert_eq!(calls[0].binary, binary, "spawn uses the configured binary");
    assert_eq!(
        holder.snapshot(),
        CaptureState::Capturing,
        "happy-path start leaves FSM untouched",
    );
}

#[tokio::test]
async fn stop_kills_child_and_marks_stopped() {
    let holder = signed_in_holder();
    let spawner = Arc::new(FakeSpawner::new());
    let manager = CaptureSessionManager::new(
        PathBuf::from("/fake/screenpipe"),
        spawner.clone(),
        holder.clone(),
        noop_refresh(),
    );

    manager.start().await.expect("start succeeds");
    manager.stop().await.expect("stop succeeds");

    assert_eq!(
        holder.snapshot(),
        CaptureState::Stopped,
        "controlled stop transitions FSM to Stopped",
    );
    assert!(
        spawner.child(0).kill_was_called(),
        "the running child was killed",
    );
}

#[tokio::test]
async fn duplicate_start_returns_already_running_and_spawns_once() {
    let holder = signed_in_holder();
    let spawner = Arc::new(FakeSpawner::new());
    let manager = CaptureSessionManager::new(
        PathBuf::from("/fake/screenpipe"),
        spawner.clone(),
        holder.clone(),
        noop_refresh(),
    );

    manager.start().await.expect("first start succeeds");
    let second = manager.start().await;

    assert!(
        matches!(second, Err(CaptureSessionError::AlreadyRunning)),
        "second start returns AlreadyRunning, got: {second:?}",
    );
    assert_eq!(
        spawner.spawn_calls().len(),
        1,
        "spawn invoked exactly once across both start attempts",
    );
}

#[tokio::test]
async fn start_with_port_in_use_transitions_to_capture_error_without_spawning() {
    let holder = signed_in_holder();
    let spawner = Arc::new(FakeSpawner::new());
    spawner.set_port_in_use(true);
    let (refresh_count, refresh) = counting_refresh();
    let manager = CaptureSessionManager::new(
        PathBuf::from("/fake/screenpipe"),
        spawner.clone(),
        holder.clone(),
        refresh,
    );

    manager
        .start()
        .await
        .expect("port conflict is reported via FSM, not Err");

    match holder.snapshot() {
        CaptureState::Error(reason) => {
            assert_eq!(reason.as_str(), "Can't start — port conflict");
        }
        other => panic!("expected Capture Error, got {other:?}"),
    }
    assert_eq!(
        spawner.spawn_calls().len(),
        0,
        "spawn is skipped when port probe finds the port in use",
    );
    assert!(
        refresh_count.load(Ordering::SeqCst) >= 1,
        "manager fires tray refresh after the Error transition",
    );
}

#[tokio::test]
async fn spawn_failure_transitions_to_capture_error() {
    let holder = signed_in_holder();
    let spawner = Arc::new(FakeSpawner::new());
    spawner.fail_spawn();
    let (refresh_count, refresh) = counting_refresh();
    let manager = CaptureSessionManager::new(
        PathBuf::from("/fake/screenpipe"),
        spawner.clone(),
        holder.clone(),
        refresh,
    );

    manager
        .start()
        .await
        .expect("spawn failure is reported via FSM, not Err");

    match holder.snapshot() {
        CaptureState::Error(reason) => {
            assert_eq!(reason.as_str(), "Something went wrong — relaunch");
        }
        other => panic!("expected Capture Error after spawn failure, got {other:?}"),
    }
    assert_eq!(
        spawner.spawn_calls().len(),
        1,
        "start attempted exactly one spawn",
    );
    assert!(
        refresh_count.load(Ordering::SeqCst) >= 1,
        "manager fires tray refresh after the Error transition",
    );
}

#[tokio::test]
async fn stop_during_in_flight_start_prevents_child_from_surviving() {
    let holder = signed_in_holder();
    let spawner = Arc::new(FakeSpawner::new());
    spawner.block_spawn();
    let manager = CaptureSessionManager::new(
        PathBuf::from("/fake/screenpipe"),
        spawner.clone(),
        holder.clone(),
        noop_refresh(),
    );

    let start_task = {
        let manager = manager.clone();
        tokio::spawn(async move { manager.start().await })
    };
    wait_for_spawn_count(&spawner, 1).await;

    manager.stop().await.expect("stop during start succeeds");
    spawner.release_spawn();
    start_task
        .await
        .expect("start task joins")
        .expect("start resolves cleanly");

    assert_eq!(
        holder.snapshot(),
        CaptureState::Stopped,
        "stop wins over the in-flight start",
    );
    assert!(
        spawner.child(0).kill_was_called(),
        "the child spawned after stop was immediately killed",
    );
}

#[tokio::test(start_paused = true)]
async fn unexpected_exit_triggers_silent_retry_and_stays_capturing() {
    let holder = signed_in_holder();
    let spawner = Arc::new(FakeSpawner::new());
    let manager = CaptureSessionManager::new(
        PathBuf::from("/fake/screenpipe"),
        spawner.clone(),
        holder.clone(),
        noop_refresh(),
    );

    manager.start().await.expect("start succeeds");
    wait_for_spawn_count(&spawner, 1).await;

    // Simulate an unexpected ScreenPipe exit (no `kill()` from manager).
    spawner.child(0).fire_exit();

    // Let the watcher react and queue its retry sleep.
    tokio::task::yield_now().await;
    // Step past the 2s retry delay.
    tokio::time::advance(Duration::from_secs(2)).await;
    wait_for_spawn_count(&spawner, 2).await;

    assert_eq!(
        spawner.spawn_calls().len(),
        2,
        "silent retry spawned a second child",
    );
    assert_eq!(
        holder.snapshot(),
        CaptureState::Capturing,
        "FSM stays Capturing across the silent retry",
    );
    assert!(
        !spawner.child(0).kill_was_called(),
        "manager did not kill the crashed child (it exited on its own)",
    );
}

#[tokio::test(start_paused = true)]
async fn second_unexpected_exit_transitions_to_capture_error() {
    let holder = signed_in_holder();
    let spawner = Arc::new(FakeSpawner::new());
    let (refresh_count, refresh) = counting_refresh();
    let manager = CaptureSessionManager::new(
        PathBuf::from("/fake/screenpipe"),
        spawner.clone(),
        holder.clone(),
        refresh,
    );

    manager.start().await.expect("start succeeds");
    wait_for_spawn_count(&spawner, 1).await;

    // First unexpected exit — consumes the retry budget.
    spawner.child(0).fire_exit();
    tokio::task::yield_now().await;
    tokio::time::advance(Duration::from_secs(2)).await;
    wait_for_spawn_count(&spawner, 2).await;

    // Second unexpected exit — retry already used, must surface Error.
    spawner.child(1).fire_exit();
    tokio::task::yield_now().await;

    // Watcher transitions FSM and exits; poll for the final state.
    for _ in 0..2_000 {
        if matches!(holder.snapshot(), CaptureState::Error(_)) {
            break;
        }
        tokio::task::yield_now().await;
    }

    match holder.snapshot() {
        CaptureState::Error(reason) => {
            assert_eq!(reason.as_str(), "Something went wrong — relaunch");
        }
        other => panic!("expected Capture Error after retry exhaustion, got {other:?}"),
    }
    assert_eq!(
        spawner.spawn_calls().len(),
        2,
        "no third spawn after retry budget is exhausted",
    );
    assert!(
        refresh_count.load(Ordering::SeqCst) >= 1,
        "manager fires tray refresh after the Error transition",
    );
}

#[tokio::test(start_paused = true)]
async fn stop_after_silent_retry_is_clean_and_resets_retry_budget() {
    let holder = signed_in_holder();
    let spawner = Arc::new(FakeSpawner::new());
    let manager = CaptureSessionManager::new(
        PathBuf::from("/fake/screenpipe"),
        spawner.clone(),
        holder.clone(),
        noop_refresh(),
    );

    // First session: start, crash, silent retry to child 1.
    manager.start().await.expect("first start");
    wait_for_spawn_count(&spawner, 1).await;
    spawner.child(0).fire_exit();
    tokio::task::yield_now().await;
    tokio::time::advance(Duration::from_secs(2)).await;
    wait_for_spawn_count(&spawner, 2).await;

    // Stop while child 1 is running — must produce a clean Stopped state and
    // leave the manager ready to start again without `AlreadyRunning`.
    manager.stop().await.expect("stop after retry succeeds");
    assert_eq!(holder.snapshot(), CaptureState::Stopped);

    // Mirror the menu toggle: Stopped -> Capturing before the next start.
    holder.toggle().expect("toggle to Capturing");

    // Second session: fresh retry budget should allow another silent retry.
    manager.start().await.expect("second start succeeds");
    wait_for_spawn_count(&spawner, 3).await;
    spawner.child(2).fire_exit();
    tokio::task::yield_now().await;
    tokio::time::advance(Duration::from_secs(2)).await;
    wait_for_spawn_count(&spawner, 4).await;

    assert_eq!(
        spawner.spawn_calls().len(),
        4,
        "four spawns total: initial + retry across two independent sessions",
    );
    assert_eq!(
        holder.snapshot(),
        CaptureState::Capturing,
        "second session's silent retry leaves FSM Capturing",
    );
}

#[tokio::test(start_paused = true)]
async fn controlled_stop_does_not_trigger_retry() {
    let holder = signed_in_holder();
    let spawner = Arc::new(FakeSpawner::new());
    let manager = CaptureSessionManager::new(
        PathBuf::from("/fake/screenpipe"),
        spawner.clone(),
        holder.clone(),
        noop_refresh(),
    );

    manager.start().await.expect("start");
    wait_for_spawn_count(&spawner, 1).await;

    manager.stop().await.expect("stop");

    // If the watcher had mistakenly entered the retry path (ADR-0012
    // ordering violation), advancing past the retry delay would expose a
    // second spawn. Intent must be set BEFORE kill so the watcher routes the
    // exit to Stopped, not to the retry branch.
    tokio::time::advance(Duration::from_secs(5)).await;
    tokio::task::yield_now().await;

    assert_eq!(
        spawner.spawn_calls().len(),
        1,
        "controlled stop must not trigger the silent retry path (ADR-0012)",
    );
    assert_eq!(holder.snapshot(), CaptureState::Stopped);
}
