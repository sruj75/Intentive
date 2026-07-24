//! Runtime layer of the summarization domain.
//!
//! Owns the lazy, resolve-once-and-cache wiring that used to live in the
//! `lib.rs` composition root (`LlmProviderSlotSummarizer::resolve_ready_if_needed`)
//! — that was LLM Provider *behavior*, not assembly. `lib.rs` keeps only the
//! thin cross-domain bridge that implements the snapshots `Summarizer` trait
//! and delegates here.
//!
//! Also exposes the Tauri command surface for the bundled-model download.

pub mod commands;

use std::sync::{Arc, Mutex as StdMutex};
use std::time::{Duration, Instant};

use async_trait::async_trait;
use tokio::sync::Mutex;
use url::Url;

use crate::domains::summarization::config::ProviderConfig;
use crate::domains::summarization::service::LlmProvider;
use crate::domains::summarization::types::ProviderError;
use crate::providers::observability;

const SUMMARIZATION_FAILURE_CAPTURE_COOLDOWN: Duration = Duration::from_secs(30 * 60);

/// Tauri-managed state for the resolved on-device LLM Provider. Starts `None`;
/// the Context Heartbeat prepares any already-available tier when a Capture
/// Session starts (via [`LazyLlmProvider`]), while `start_model_download`
/// supplies Tier 3 after explicit onboarding consent. Both writers share this
/// one cell, so a tier installed through onboarding is reused at tick time.
pub struct LlmProviderSlot(pub Mutex<Option<Arc<dyn ReadyProvider>>>);

impl LlmProviderSlot {
    pub fn empty() -> Self {
        Self(Mutex::new(None))
    }
}

impl Default for LlmProviderSlot {
    fn default() -> Self {
        Self::empty()
    }
}

/// A resolved, ready-to-use provider behind the slot. Production is
/// [`LlmProvider`]; the seam lets the lazy-resolution wiring be tested without
/// standing up a real tier (subprocess / network).
#[async_trait]
pub trait ReadyProvider: Send + Sync {
    async fn summarize(&self, activity: &str) -> Result<String, ProviderError>;
}

#[async_trait]
impl ReadyProvider for LlmProvider {
    async fn summarize(&self, activity: &str) -> Result<String, ProviderError> {
        LlmProvider::summarize(self, activity).await
    }
}

/// Produces a ready provider for the slot on first use. Injected so the
/// resolve-once-and-cache orchestration can be driven by a counting fake.
#[async_trait]
pub trait ProviderResolver: Send + Sync {
    async fn resolve(&self) -> Result<Arc<dyn ReadyProvider>, ProviderError>;
}

/// Production resolver: rebuilds `ProviderConfig` with the live ScreenPipe URL
/// (the bundled port can change at spawn time) and probes the tiers via
/// [`LlmProvider::resolve_ready`] — never initiating a download (ADR-0018).
///
/// The ScreenPipe URL arrives as a boxed closure rather than the snapshots
/// `ScreenpipeUrlSource` seam: depending on that snapshots *runtime* type here
/// would be a disallowed cross-domain reference. `lib.rs` supplies the closure
/// capturing the capture domain's `ScreenpipeEndpoint`.
pub struct LiveProviderResolver {
    config: ProviderConfig,
    http: reqwest::Client,
    screenpipe_url: Arc<dyn Fn() -> Url + Send + Sync>,
}

impl LiveProviderResolver {
    pub fn new(
        config: ProviderConfig,
        http: reqwest::Client,
        screenpipe_url: Arc<dyn Fn() -> Url + Send + Sync>,
    ) -> Self {
        Self {
            config,
            http,
            screenpipe_url,
        }
    }
}

#[async_trait]
impl ProviderResolver for LiveProviderResolver {
    async fn resolve(&self) -> Result<Arc<dyn ReadyProvider>, ProviderError> {
        let mut config = self.config.clone();
        config.screenpipe_url = (self.screenpipe_url)();
        let provider = LlmProvider::resolve_ready(config, self.http.clone()).await?;
        observability::breadcrumb(
            "desktop.summarization",
            &format!("llm tier resolved: {:?}", provider.tier()),
            sentry::Level::Info,
        );
        Ok(Arc::new(provider))
    }
}

/// The two failure modes of lazy summarization, kept distinct so the `lib.rs`
/// `Summarizer` bridge can map them to the matching `SummarizerError` arm
/// (skip-tick log vs. failure log) exactly as the old in-`lib.rs` logic did.
#[derive(Debug, thiserror::Error)]
pub enum SummarizeError {
    /// No tier could be resolved yet (or resolution failed); the heartbeat
    /// skips the tick.
    #[error("no on-device LLM provider resolved yet")]
    Unresolved,
    /// A resolved provider failed to produce a summary.
    #[error(transparent)]
    Provider(#[from] ProviderError),
}

/// Resolve-once-and-cache the on-device LLM Provider behind the shared slot.
/// The first `prepare`/`summarize` that finds the slot empty resolves a tier
/// and stores it; subsequent calls reuse the cached provider. A provider the
/// onboarding command path already stored is used as-is.
pub struct LazyLlmProvider {
    slot: Arc<LlmProviderSlot>,
    resolver: Arc<dyn ProviderResolver>,
    failure_reporter: StdMutex<SummarizationFailureReporter>,
}

impl LazyLlmProvider {
    pub fn new(slot: Arc<LlmProviderSlot>, resolver: Arc<dyn ProviderResolver>) -> Self {
        Self {
            slot,
            resolver,
            failure_reporter: StdMutex::new(SummarizationFailureReporter::default()),
        }
    }

    /// Resolve a tier ahead of the first summarize, if the slot is still empty.
    pub async fn prepare(&self) {
        self.resolve_if_needed().await;
    }

    pub async fn summarize(&self, activity: &str) -> Result<String, SummarizeError> {
        self.resolve_if_needed().await;
        let provider = self.slot.0.lock().await.clone();
        let provider = provider.ok_or(SummarizeError::Unresolved)?;
        Ok(provider.summarize(activity).await?)
    }

    async fn resolve_if_needed(&self) {
        // Double-checked against the shared cell: skip resolution when either
        // this path or `start_model_download` already populated it.
        if self.slot.0.lock().await.is_some() {
            return;
        }
        match self.resolver.resolve().await {
            Ok(provider) => {
                *self.slot.0.lock().await = Some(provider);
            }
            Err(err) => {
                self.failure_reporter
                    .lock()
                    .expect("summarization failure reporter mutex poisoned")
                    .record_error(&err);
            }
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum SummarizationFailureKind {
    ResolveProvider,
}

impl SummarizationFailureKind {
    fn message(self) -> &'static str {
        match self {
            Self::ResolveProvider => "llm provider resolution failed",
        }
    }
}

struct SummarizationFailureReporter {
    limiter: observability::CaptureRateLimiter<SummarizationFailureKind>,
}

impl Default for SummarizationFailureReporter {
    fn default() -> Self {
        Self {
            limiter: observability::CaptureRateLimiter::new(SUMMARIZATION_FAILURE_CAPTURE_COOLDOWN),
        }
    }
}

impl SummarizationFailureReporter {
    fn record_error(&mut self, error: &(dyn std::error::Error + Send + Sync + 'static)) {
        let kind = SummarizationFailureKind::ResolveProvider;
        observability::breadcrumb(
            "desktop.summarization",
            kind.message(),
            sentry::Level::Warning,
        );
        if self.should_capture(kind, Instant::now()) {
            observability::capture_error(error);
        }
    }

    fn should_capture(&mut self, kind: SummarizationFailureKind, now: Instant) -> bool {
        self.limiter.should_capture(kind, now)
    }
}

#[cfg(test)]
mod tests;
