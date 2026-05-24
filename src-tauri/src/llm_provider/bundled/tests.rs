use super::*;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;
use url::Url;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

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
    async fn pull(
        &self,
        model: &str,
        progress: tokio::sync::mpsc::Sender<PullProgress>,
    ) -> Result<(), ProviderError> {
        self.pull_count.fetch_add(1, Ordering::SeqCst);
        *self.pulled_model.lock().unwrap() = Some(model.to_string());
        if self.pull_fails.load(Ordering::SeqCst) {
            return Err(ProviderError::Unavailable);
        }
        // Emit a final 100% event so `prepare_with` callers can observe pull
        // completion via the channel.
        let _ = progress
            .send(PullProgress {
                percent: 100,
                status: "success".to_string(),
            })
            .await;
        Ok(())
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

    let (tx, _rx) = tokio::sync::mpsc::channel(8);
    let result = prepare_with(&stub, tx)
        .await
        .expect("prepare should succeed");
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

    let (tx, _rx) = tokio::sync::mpsc::channel(8);
    prepare_with(&stub, tx)
        .await
        .expect("prepare should succeed");
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

    let (tx, _rx) = tokio::sync::mpsc::channel(8);
    prepare_with(&stub, tx)
        .await
        .expect("prepare should succeed");
    assert_eq!(spawn_count.load(Ordering::SeqCst), 1);
}

#[test]
fn parse_pull_line_manifest_step_has_zero_percent() {
    let progress =
        parse_pull_line(r#"{"status":"pulling manifest"}"#).expect("status-only line parses");
    assert_eq!(progress.percent, 0);
    assert_eq!(progress.status, "pulling manifest");
}

#[test]
fn parse_pull_line_layer_step_computes_percent_from_total_and_completed() {
    let progress =
        parse_pull_line(r#"{"status":"pulling 8eeb52dfb3bb","total":1000,"completed":250}"#)
            .expect("layer line parses");
    assert_eq!(progress.percent, 25);
}

#[test]
fn parse_pull_line_clamps_percent_to_100() {
    // Defensive: Ollama once shipped a release where completed briefly
    // exceeded total at the very end of a layer. Don't surface 101%.
    let progress =
        parse_pull_line(r#"{"status":"x","total":100,"completed":150}"#).expect("line parses");
    assert_eq!(progress.percent, 100);
}

#[test]
fn parse_pull_line_success_reports_100() {
    let progress = parse_pull_line(r#"{"status":"success"}"#).expect("success line parses");
    assert_eq!(progress.percent, 100);
    assert_eq!(progress.status, "success");
}

#[test]
fn parse_pull_line_rejects_non_json() {
    assert!(parse_pull_line("not json").is_none());
    assert!(parse_pull_line("").is_none());
}

#[test]
fn host_port_for_extracts_host_and_port() {
    assert_eq!(
        host_port_for(&url::Url::parse("http://localhost:44381").unwrap()).as_deref(),
        Some("localhost:44381"),
    );
    assert_eq!(
        host_port_for(&url::Url::parse("http://127.0.0.1:44383/").unwrap()).as_deref(),
        Some("127.0.0.1:44383"),
    );
}

#[tokio::test]
async fn system_ollama_has_model_true_when_model_in_api_tags() {
    let mock = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/api/tags"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "models": [
                { "name": "qwen3.5:0.8b", "size": 942_656_512u64 },
                { "name": "phi3:mini", "size": 2_000_000_000u64 }
            ]
        })))
        .mount(&mock)
        .await;
    let proc = SystemOllamaProcess::new(
        Url::parse(&mock.uri()).unwrap(),
        std::path::PathBuf::from("/nonexistent/ollama"),
        reqwest::Client::new(),
    );
    assert!(proc.has_model("qwen3.5:0.8b").await);
}

#[tokio::test]
async fn system_ollama_has_model_false_when_model_missing() {
    let mock = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/api/tags"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
            "models": [
                { "name": "phi3:mini", "size": 2_000_000_000u64 }
            ]
        })))
        .mount(&mock)
        .await;
    let proc = SystemOllamaProcess::new(
        Url::parse(&mock.uri()).unwrap(),
        std::path::PathBuf::from("/nonexistent/ollama"),
        reqwest::Client::new(),
    );
    assert!(!proc.has_model("qwen3.5:0.8b").await);
}

#[tokio::test]
async fn system_ollama_has_model_false_when_endpoint_unreachable() {
    let proc = SystemOllamaProcess::new(
        Url::parse("http://127.0.0.1:1").unwrap(),
        std::path::PathBuf::from("/nonexistent/ollama"),
        reqwest::Client::new(),
    );
    assert!(!proc.has_model("qwen3.5:0.8b").await);
}

#[tokio::test]
async fn system_ollama_is_running_true_when_api_tags_responds_ok() {
    let mock = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/api/tags"))
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({"models":[]})))
        .mount(&mock)
        .await;
    let proc = SystemOllamaProcess::new(
        Url::parse(&mock.uri()).unwrap(),
        std::path::PathBuf::from("/nonexistent/ollama"),
        reqwest::Client::new(),
    );
    assert!(proc.is_running().await);
}

#[tokio::test]
async fn system_ollama_is_running_false_when_endpoint_unreachable() {
    let proc = SystemOllamaProcess::new(
        Url::parse("http://127.0.0.1:1").unwrap(), // unreachable
        std::path::PathBuf::from("/nonexistent/ollama"),
        reqwest::Client::new(),
    );
    assert!(!proc.is_running().await);
}

#[tokio::test]
async fn system_ollama_is_running_false_when_api_tags_returns_500() {
    let mock = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/api/tags"))
        .respond_with(ResponseTemplate::new(500))
        .mount(&mock)
        .await;
    let proc = SystemOllamaProcess::new(
        Url::parse(&mock.uri()).unwrap(),
        std::path::PathBuf::from("/nonexistent/ollama"),
        reqwest::Client::new(),
    );
    assert!(!proc.is_running().await);
}

/// Exercises the real `SystemOllamaProcess` path end-to-end. Ignored because
/// it requires a working bundled Ollama binary (wired in a future slice) and
/// will download ~1GB of model weights on first run. Run with
/// `cargo test -- --ignored` on a developer machine.
#[tokio::test]
#[ignore = "requires bundled Ollama binary; pulls real model weights"]
async fn integration_real_bundled_ollama_prepares_qwen() {
    let (tx, _rx) = tokio::sync::mpsc::channel(64);
    let (model, _process) = prepare(
        Url::parse("http://localhost:44381").unwrap(),
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/ollama"),
        reqwest::Client::new(),
        tx,
    )
    .await
    .expect("real spawn+pull should succeed");
    assert_eq!(model, BUNDLED_MODEL);
}

#[tokio::test]
async fn pull_forwards_final_success_event_to_progress_channel() {
    let stub = StubProcess {
        initially_running: true,
        initially_has_model: false,
        ..Default::default()
    };
    let (tx, mut rx) = tokio::sync::mpsc::channel(8);
    prepare_with(&stub, tx)
        .await
        .expect("prepare should succeed");
    let event = rx.recv().await.expect("a progress event was sent");
    assert_eq!(event.percent, 100);
    assert_eq!(event.status, "success");
}

#[test]
fn model_is_present_on_disk_true_when_manifest_file_exists() {
    let dir = tempfile::TempDir::new().expect("tempdir");
    let manifest = dir
        .path()
        .join("manifests")
        .join("registry.ollama.ai")
        .join("library")
        .join("qwen3.5")
        .join("0.8b");
    std::fs::create_dir_all(manifest.parent().unwrap()).unwrap();
    std::fs::write(&manifest, b"{}").unwrap();
    assert!(model_is_present_on_disk(dir.path(), "qwen3.5:0.8b"));
}

#[test]
fn model_is_present_on_disk_false_when_manifest_missing() {
    let dir = tempfile::TempDir::new().expect("tempdir");
    assert!(!model_is_present_on_disk(dir.path(), "qwen3.5:0.8b"));
}

#[test]
fn model_is_present_on_disk_false_when_model_string_has_no_colon() {
    let dir = tempfile::TempDir::new().expect("tempdir");
    assert!(!model_is_present_on_disk(dir.path(), "qwen3.5"));
}

/// Composition behavior under `bundled_model_needs_install()`: when the
/// resolved models root is empty (no manifest for the bundled model), the
/// helper must report "needs install" so the onboarding gate opens. This
/// is what `lib.rs::setup` consumes — the failsafe direction is what the
/// helper deepens beyond the lower-level disk probe.
#[test]
fn bundled_model_needs_install_true_when_resolved_root_has_no_manifest() {
    let dir = tempfile::TempDir::new().expect("tempdir");
    // SAFETY: tests in this binary do not otherwise touch OLLAMA_MODELS
    // (grep-verified). Using `set_var` is acceptable for this isolated probe.
    unsafe {
        std::env::set_var("OLLAMA_MODELS", dir.path());
    }
    let result = bundled_model_needs_install();
    unsafe {
        std::env::remove_var("OLLAMA_MODELS");
    }
    assert!(result, "empty models root means onboarding must open");
}

#[tokio::test]
async fn tier_three_skips_pull_when_model_already_cached() {
    let stub = StubProcess {
        initially_running: true,
        initially_has_model: true,
        ..Default::default()
    };
    let pull_count = stub.pull_count.clone();

    let (tx, _rx) = tokio::sync::mpsc::channel(8);
    prepare_with(&stub, tx)
        .await
        .expect("prepare should succeed");
    assert_eq!(
        pull_count.load(Ordering::SeqCst),
        0,
        "should not pull when cached"
    );
}
