use super::*;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;

#[derive(Default)]
struct StubProcess {
    initially_running: bool,
    initially_has_model: bool,
    spawn_count: Arc<AtomicUsize>,
    pull_count: Arc<AtomicUsize>,
    pulled_model: Arc<std::sync::Mutex<Option<String>>>,
    pull_fails: Arc<AtomicBool>,
}

#[async_trait]
impl OllamaProcess for StubProcess {
    async fn is_running(&self) -> bool {
        self.initially_running
    }
    async fn spawn(&self) -> Result<(), ProviderError> {
        self.spawn_count.fetch_add(1, Ordering::SeqCst);
        Ok(())
    }
    async fn has_model(&self, _model: &str) -> bool {
        self.initially_has_model
    }
    async fn pull(&self, model: &str) -> Result<(), ProviderError> {
        self.pull_count.fetch_add(1, Ordering::SeqCst);
        *self.pulled_model.lock().unwrap() = Some(model.to_string());
        if self.pull_fails.load(Ordering::SeqCst) {
            Err(ProviderError::Unavailable)
        } else {
            Ok(())
        }
    }
}

#[tokio::test]
async fn tier_three_pulls_bundled_model_on_first_run() {
    let stub = StubProcess {
        initially_running: true,
        initially_has_model: false,
        ..Default::default()
    };
    let pull_count = stub.pull_count.clone();
    let pulled_model = stub.pulled_model.clone();

    let result = prepare_with(&stub).await.expect("prepare should succeed");
    assert_eq!(result, BUNDLED_MODEL);
    assert_eq!(pull_count.load(Ordering::SeqCst), 1);
    assert_eq!(pulled_model.lock().unwrap().as_deref(), Some(BUNDLED_MODEL));
}

#[tokio::test]
async fn tier_three_skips_spawn_when_process_already_running() {
    let stub = StubProcess {
        initially_running: true,
        initially_has_model: true,
        ..Default::default()
    };
    let spawn_count = stub.spawn_count.clone();

    prepare_with(&stub).await.expect("prepare should succeed");
    assert_eq!(
        spawn_count.load(Ordering::SeqCst),
        0,
        "should not spawn when running"
    );
}

#[tokio::test]
async fn tier_three_spawns_when_process_not_running() {
    let stub = StubProcess {
        initially_running: false,
        initially_has_model: true,
        ..Default::default()
    };
    let spawn_count = stub.spawn_count.clone();

    prepare_with(&stub).await.expect("prepare should succeed");
    assert_eq!(spawn_count.load(Ordering::SeqCst), 1);
}

/// Exercises the real `SystemOllamaProcess` path end-to-end. Ignored because
/// it requires a working bundled Ollama binary (wired in a future slice) and
/// will download ~1GB of model weights on first run. Run with
/// `cargo test -- --ignored` on a developer machine.
#[tokio::test]
#[ignore = "requires bundled Ollama binary; pulls real model weights"]
async fn integration_real_bundled_ollama_prepares_qwen() {
    let model = prepare().await.expect("real spawn+pull should succeed");
    assert_eq!(model, BUNDLED_MODEL);
}

#[tokio::test]
async fn tier_three_skips_pull_when_model_already_cached() {
    let stub = StubProcess {
        initially_running: true,
        initially_has_model: true,
        ..Default::default()
    };
    let pull_count = stub.pull_count.clone();

    prepare_with(&stub).await.expect("prepare should succeed");
    assert_eq!(
        pull_count.load(Ordering::SeqCst),
        0,
        "should not pull when cached"
    );
}
