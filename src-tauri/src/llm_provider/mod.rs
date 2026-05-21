//! LLM Provider — resolves and routes summarization requests to the best
//! available on-device backend.
//!
//! Callers see two operations: `resolve` (called once at startup) and
//! `summarize` (called per Context Heartbeat). Everything else — tier detection
//! sequence, model selection, subprocess management, prompt construction — is
//! hidden inside this module per ADR-0006 and SPEC.md.

use url::Url;

mod apple_intelligence;
mod bundled;
mod ollama;
mod prompt;

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
    pub ollama_url: Url,
}

impl Default for ProviderConfig {
    fn default() -> Self {
        Self {
            screenpipe_url: Url::parse("http://localhost:3030").unwrap(),
            ollama_url: Url::parse("http://localhost:11434").unwrap(),
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
}

impl LlmProvider {
    /// Probe Apple Intelligence → existing Ollama → bundled Ollama in order
    /// and return a provider bound to the first viable tier. See ADR-0006.
    pub async fn resolve(
        config: ProviderConfig,
        http: reqwest::Client,
    ) -> Result<Self, ProviderError> {
        if apple_intelligence::is_available(&config.screenpipe_url, &http).await? {
            return Ok(Self {
                tier: Tier::AppleIntelligence,
                model: None,
                config,
                http,
            });
        }
        if let Some(model) = ollama::select_model(&config.ollama_url, &http).await? {
            return Ok(Self {
                tier: Tier::ExistingOllama,
                model: Some(model),
                config,
                http,
            });
        }
        let model = bundled::prepare().await?;
        Ok(Self {
            tier: Tier::BundledOllama,
            model: Some(model),
            config,
            http,
        })
    }

    pub fn tier(&self) -> Tier {
        self.tier
    }

    /// Summarize a 60-second activity window. The privacy constraints in the
    /// prompt are applied regardless of which tier was resolved.
    pub async fn summarize(&self, activity: &str) -> Result<String, ProviderError> {
        match self.tier {
            Tier::AppleIntelligence => {
                apple_intelligence::summarize(&self.config.screenpipe_url, &self.http, activity)
                    .await
            }
            Tier::ExistingOllama | Tier::BundledOllama => {
                let model = self.model.as_deref().ok_or(ProviderError::Unavailable)?;
                ollama::summarize(&self.config.ollama_url, &self.http, model, activity).await
            }
        }
    }
}

#[cfg(test)]
mod tests;
