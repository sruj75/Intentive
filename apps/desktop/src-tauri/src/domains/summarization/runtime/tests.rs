//! Unit tests for the lazy resolve-once-and-cache wiring, driven entirely
//! through the `ProviderResolver` / `ReadyProvider` seams so no real tier
//! (subprocess / network / Tauri bootstrap) is needed.

use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::{Duration, Instant};

use super::*;

/// A resolved provider whose summarize is canned, so tests assert the slot
/// plumbing rather than any real tier behaviour.
struct StubProvider {
    result: Result<String, ProviderError>,
}

#[async_trait]
impl ReadyProvider for StubProvider {
    async fn summarize(&self, _activity: &str) -> Result<String, ProviderError> {
        self.result.clone()
    }
}

/// Counts resolve calls so the cache (resolve-at-most-once) can be asserted.
struct CountingResolver {
    calls: AtomicUsize,
    outcome: Box<dyn Fn() -> Result<Arc<dyn ReadyProvider>, ProviderError> + Send + Sync>,
}

impl CountingResolver {
    fn new(
        outcome: impl Fn() -> Result<Arc<dyn ReadyProvider>, ProviderError> + Send + Sync + 'static,
    ) -> Arc<Self> {
        Arc::new(Self {
            calls: AtomicUsize::new(0),
            outcome: Box::new(outcome),
        })
    }

    fn call_count(&self) -> usize {
        self.calls.load(Ordering::SeqCst)
    }
}

#[async_trait]
impl ProviderResolver for CountingResolver {
    async fn resolve(&self) -> Result<Arc<dyn ReadyProvider>, ProviderError> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        (self.outcome)()
    }
}

fn ok_provider(
    summary: &'static str,
) -> impl Fn() -> Result<Arc<dyn ReadyProvider>, ProviderError> {
    move || {
        Ok(Arc::new(StubProvider {
            result: Ok(summary.to_string()),
        }) as Arc<dyn ReadyProvider>)
    }
}

#[tokio::test]
async fn first_summarize_resolves_caches_and_returns() {
    let slot = Arc::new(LlmProviderSlot::empty());
    let resolver = CountingResolver::new(ok_provider("a summary"));
    let lazy = LazyLlmProvider::new(slot.clone(), resolver.clone());

    let summary = lazy
        .summarize("activity")
        .await
        .expect("resolves and summarizes");

    assert_eq!(summary, "a summary");
    assert_eq!(resolver.call_count(), 1);
    assert!(
        slot.0.lock().await.is_some(),
        "resolution caches into the slot"
    );
}

#[tokio::test]
async fn second_call_reuses_cache_without_re_resolving() {
    let slot = Arc::new(LlmProviderSlot::empty());
    let resolver = CountingResolver::new(ok_provider("cached"));
    let lazy = LazyLlmProvider::new(slot, resolver.clone());

    lazy.prepare().await;
    let _ = lazy.summarize("first").await.expect("ok");
    let _ = lazy.summarize("second").await.expect("ok");

    assert_eq!(
        resolver.call_count(),
        1,
        "resolve runs at most once across prepare + repeated summarize",
    );
}

#[tokio::test]
async fn slot_populated_by_command_path_is_used_as_is() {
    // Simulates `start_model_download` having stored a Tier-3 provider: the
    // lazy path must reuse it and never resolve.
    let slot = Arc::new(LlmProviderSlot::empty());
    *slot.0.lock().await = Some(Arc::new(StubProvider {
        result: Ok("from onboarding".to_string()),
    }) as Arc<dyn ReadyProvider>);
    let resolver = CountingResolver::new(|| panic!("must not resolve when slot is pre-populated"));
    let lazy = LazyLlmProvider::new(slot, resolver.clone());

    let summary = lazy
        .summarize("activity")
        .await
        .expect("uses pre-populated provider");

    assert_eq!(summary, "from onboarding");
    assert_eq!(resolver.call_count(), 0);
}

#[tokio::test]
async fn failed_resolution_reports_unresolved_and_retries_next_time() {
    let slot = Arc::new(LlmProviderSlot::empty());
    let resolver = CountingResolver::new(|| Err(ProviderError::Unavailable));
    let lazy = LazyLlmProvider::new(slot.clone(), resolver.clone());

    let err = lazy
        .summarize("activity")
        .await
        .expect_err("nothing resolved");
    assert!(matches!(err, SummarizeError::Unresolved));
    assert!(
        slot.0.lock().await.is_none(),
        "a failed resolve caches nothing"
    );

    // The slot stays empty, so the next tick tries to resolve again.
    let _ = lazy.summarize("activity").await;
    assert_eq!(resolver.call_count(), 2);
}

#[tokio::test]
async fn resolved_provider_summarize_error_surfaces_as_provider_error() {
    // A resolved provider that fails to summarize must map to Provider(_), not
    // Unresolved, preserving the lib.rs Failed-vs-Unresolved distinction.
    let slot = Arc::new(LlmProviderSlot::empty());
    let resolver = CountingResolver::new(|| {
        Ok(Arc::new(StubProvider {
            result: Err(ProviderError::Http("boom".to_string())),
        }) as Arc<dyn ReadyProvider>)
    });
    let lazy = LazyLlmProvider::new(slot, resolver);

    let err = lazy
        .summarize("activity")
        .await
        .expect_err("provider failed");
    assert!(matches!(err, SummarizeError::Provider(ProviderError::Http(msg)) if msg == "boom"),);
}

#[test]
fn summarization_failure_reporting_is_rate_limited_by_failure_class() {
    let mut reporter = SummarizationFailureReporter::default();
    let now = Instant::now();

    assert!(reporter.should_capture(SummarizationFailureKind::ResolveProvider, now));
    assert!(!reporter.should_capture(
        SummarizationFailureKind::ResolveProvider,
        now + Duration::from_secs(30),
    ));
    assert!(reporter.should_capture(
        SummarizationFailureKind::ResolveProvider,
        now + SUMMARIZATION_FAILURE_CAPTURE_COOLDOWN + Duration::from_secs(1),
    ));
}
