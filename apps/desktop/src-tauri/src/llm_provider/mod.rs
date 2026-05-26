//! LLM Provider — resolves and routes summarization requests to the best
//! available on-device backend.
//!
//! Callers see two operations: `resolve` (called once at startup) and
//! `summarize` (called per Context Heartbeat). Everything else — tier detection
//! sequence, model selection, subprocess management, prompt construction — is
//! hidden inside this module per ADR-0006 and SPEC.md.

use url::Url;

mod apple_intelligence;
pub(crate) mod bundled;
pub mod commands;
mod ollama;
mod prompt;

pub use bundled::PullProgress;

/// Which on-device provider tier was selected at resolve time. Exposed for
/// startup logging only — callers should not branch on this.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Tier {
    AppleIntelligence,
    ExistingOllama,
    BundledOllama,
}

#[derive(Debug, thiserror::Error)]
pub enum ProviderError {
    #[error("no on-device provider available")]
    Unavailable,
    #[error("http error: {0}")]
    Http(String),
}

#[derive(Debug, Clone)]
pub struct ProviderConfig {
    pub screenpipe_url: Url,
    /// Tier 2 — the user's own Ollama installation (default port 11434).
    /// Intentive reads this; it does not configure it.
    pub existing_ollama_url: Url,
    /// Tier 3 — Intentive's bundled Ollama on its unique port (default 44381,
    /// with a 44383 fallback at spawn time). See ADR-0013.
    pub bundled_ollama_url: Url,
    /// Absolute path to the bundled Ollama executable shipped in Tauri
    /// resources. Resolved by `lib.rs` via `BaseDirectory::Resource`.
    pub bundled_ollama_binary: std::path::PathBuf,
}

impl Default for ProviderConfig {
    fn default() -> Self {
        Self {
            screenpipe_url: Url::parse("http://localhost:3030").unwrap(),
            existing_ollama_url: Url::parse("http://localhost:11434").unwrap(),
            bundled_ollama_url: Url::parse("http://localhost:44381").unwrap(),
            bundled_ollama_binary: std::path::PathBuf::from("ollama"),
        }
    }
}

pub struct LlmProvider {
    tier: Tier,
    /// Set for `ExistingOllama` and `BundledOllama` tiers — names the model
    /// passed in `/api/generate` requests. `None` for Apple Intelligence,
    /// which has no notion of a selectable model.
    model: Option<String>,
    config: ProviderConfig,
    http: reqwest::Client,
    /// Retains the bundled child process after onboarding resolves. Without
    /// this owner, `kill_on_drop` stops Ollama before the first heartbeat can
    /// send a summary request.
    _bundled_process: Option<bundled::SystemOllamaProcess>,
}

impl LlmProvider {
    /// Probe Apple Intelligence → existing Ollama → bundled Ollama in order
    /// and return a provider bound to the first viable tier. See ADR-0006.
    /// Progress for the Tier 3 model pull is discarded; use
    /// [`Self::resolve_with_progress`] from the onboarding command path.
    pub async fn resolve(
        config: ProviderConfig,
        http: reqwest::Client,
    ) -> Result<Self, ProviderError> {
        let (tx, _rx) = tokio::sync::mpsc::channel(8);
        Self::resolve_with_progress(config, http, tx).await
    }

    /// Resolve only an already-usable provider for a newly started Capture
    /// Session. Tier 3 is eligible only when onboarding already installed its
    /// bundled model; this path never initiates a download (ADR-0018).
    pub async fn resolve_ready(
        config: ProviderConfig,
        http: reqwest::Client,
    ) -> Result<Self, ProviderError> {
        if apple_intelligence::is_available(&config.screenpipe_url, &http).await? {
            return Ok(Self {
                tier: Tier::AppleIntelligence,
                model: None,
                config,
                http,
                _bundled_process: None,
            });
        }
        if let Some(model) = ollama::select_model(&config.existing_ollama_url, &http).await? {
            return Ok(Self {
                tier: Tier::ExistingOllama,
                model: Some(model),
                config,
                http,
                _bundled_process: None,
            });
        }
        let (model, bundled_process) = bundled::prepare_cached(
            config.bundled_ollama_url.clone(),
            config.bundled_ollama_binary.clone(),
            http.clone(),
        )
        .await?;
        let mut config = config;
        config.bundled_ollama_url = bundled_process.url();
        Ok(Self {
            tier: Tier::BundledOllama,
            model: Some(model),
            config,
            http,
            _bundled_process: Some(bundled_process),
        })
    }

    /// Same as [`Self::resolve`] but forwards Tier 3 pull progress to
    /// `progress`. Tier 1 and Tier 2 send nothing on the channel.
    pub async fn resolve_with_progress(
        config: ProviderConfig,
        http: reqwest::Client,
        progress: tokio::sync::mpsc::Sender<PullProgress>,
    ) -> Result<Self, ProviderError> {
        if apple_intelligence::is_available(&config.screenpipe_url, &http).await? {
            return Ok(Self {
                tier: Tier::AppleIntelligence,
                model: None,
                config,
                http,
                _bundled_process: None,
            });
        }
        if let Some(model) = ollama::select_model(&config.existing_ollama_url, &http).await? {
            return Ok(Self {
                tier: Tier::ExistingOllama,
                model: Some(model),
                config,
                http,
                _bundled_process: None,
            });
        }
        let (model, bundled_process) = bundled::prepare(
            config.bundled_ollama_url.clone(),
            config.bundled_ollama_binary.clone(),
            http.clone(),
            progress,
        )
        .await?;
        let mut config = config;
        config.bundled_ollama_url = bundled_process.url();
        Ok(Self {
            tier: Tier::BundledOllama,
            model: Some(model),
            config,
            http,
            _bundled_process: Some(bundled_process),
        })
    }

    pub fn tier(&self) -> Tier {
        self.tier
    }

    /// Summarize a 10-minute activity window. The privacy constraints in the
    /// prompt are applied regardless of which tier was resolved.
    pub async fn summarize(&self, activity: &str) -> Result<String, ProviderError> {
        match self.tier {
            Tier::AppleIntelligence => {
                apple_intelligence::summarize(&self.config.screenpipe_url, &self.http, activity)
                    .await
            }
            Tier::ExistingOllama => {
                let model = self.model.as_deref().ok_or(ProviderError::Unavailable)?;
                ollama::summarize(
                    &self.config.existing_ollama_url,
                    &self.http,
                    model,
                    activity,
                )
                .await
            }
            Tier::BundledOllama => {
                let model = self.model.as_deref().ok_or(ProviderError::Unavailable)?;
                ollama::summarize(&self.config.bundled_ollama_url, &self.http, model, activity)
                    .await
            }
        }
    }
}

#[cfg(test)]
mod tests;
