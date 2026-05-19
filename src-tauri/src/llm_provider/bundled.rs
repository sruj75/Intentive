//! Tier 3 — Intentive's bundled Ollama binary. Spawns Ollama, pulls
//! `qwen3.5:0.8b` on first run, and reuses it on subsequent launches.
//! See ADR-0006.
//!
//! Subprocess interaction is mediated by the `OllamaProcess` trait so the
//! lifecycle logic (spawn-if-not-running, pull-if-not-cached) can be unit
//! tested without touching a real binary. The production implementation fails
//! closed until the real bundled-binary path is wired, so provider resolution
//! never reports Tier 3 as ready without an Ollama process and model.

use async_trait::async_trait;

use super::ProviderError;

/// The Tier 3 bundled model — confirmed in the Ollama registry, see ADR-0006.
pub(super) const BUNDLED_MODEL: &str = "qwen3.5:0.8b";

#[async_trait]
pub(super) trait OllamaProcess: Send + Sync {
    async fn is_running(&self) -> bool;
    async fn spawn(&self) -> Result<(), ProviderError>;
    async fn has_model(&self, model: &str) -> bool;
    async fn pull(&self, model: &str) -> Result<(), ProviderError>;
}

pub(super) async fn prepare() -> Result<String, ProviderError> {
    prepare_with(&SystemOllamaProcess).await
}

async fn prepare_with(process: &impl OllamaProcess) -> Result<String, ProviderError> {
    if !process.is_running().await {
        process.spawn().await?;
    }
    if !process.has_model(BUNDLED_MODEL).await {
        process.pull(BUNDLED_MODEL).await?;
    }
    Ok(BUNDLED_MODEL.to_string())
}

/// Production `OllamaProcess` — TODO wire to Tauri resource lookup,
/// `tokio::process::Command`, and the `localhost:11434` health probe.
struct SystemOllamaProcess;

#[async_trait]
impl OllamaProcess for SystemOllamaProcess {
    async fn is_running(&self) -> bool {
        false
    }
    async fn spawn(&self) -> Result<(), ProviderError> {
        Err(ProviderError::Unavailable)
    }
    async fn has_model(&self, _model: &str) -> bool {
        false
    }
    async fn pull(&self, _model: &str) -> Result<(), ProviderError> {
        Err(ProviderError::Unavailable)
    }
}

#[cfg(test)]
mod tests;
