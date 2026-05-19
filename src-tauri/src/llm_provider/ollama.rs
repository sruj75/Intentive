//! Tier 2 / Tier 3 client for Ollama's HTTP API.
//!
//! In Tier 2 the user already has Ollama running at `localhost:11434` and
//! Intentive selects the best available model ≤ 5GB. In Tier 3 Intentive
//! spawns its own Ollama and pulls `qwen3.5:0.8b`. The API surface — model
//! listing, loaded-model inspection, generation — is shared between the two.

use serde::Deserialize;
use serde_json::json;
use url::Url;

use super::{prompt, ProviderError};

/// 5GB cap on the disk size of an Ollama model Intentive will use in Tier 2.
/// Above this, summarization reliably misses the < 5s latency target on
/// M-series hardware — see ADR-0006.
const TIER2_SIZE_LIMIT_BYTES: u64 = 5 * 1024 * 1024 * 1024;

#[derive(Deserialize)]
struct ModelList {
    models: Vec<Model>,
}

#[derive(Deserialize)]
struct Model {
    name: String,
    size: u64,
}

pub(super) async fn select_model(
    ollama_url: &Url,
    http: &reqwest::Client,
) -> Result<Option<String>, ProviderError> {
    if let Some(name) = loaded_model(ollama_url, http).await? {
        return Ok(Some(name));
    }
    first_small_installed_model(ollama_url, http).await
}

async fn first_small_installed_model(
    ollama_url: &Url,
    http: &reqwest::Client,
) -> Result<Option<String>, ProviderError> {
    let url = ollama_url
        .join("/api/tags")
        .map_err(|e| ProviderError::Http(e.to_string()))?;
    let response = match http.get(url).send().await {
        Ok(r) => r,
        Err(_) => return Ok(None),
    };
    if !response.status().is_success() {
        return Ok(None);
    }
    let body: ModelList = response
        .json()
        .await
        .map_err(|e| ProviderError::Http(e.to_string()))?;
    Ok(body
        .models
        .into_iter()
        .find(|m| m.size <= TIER2_SIZE_LIMIT_BYTES)
        .map(|m| m.name))
}

async fn loaded_model(
    ollama_url: &Url,
    http: &reqwest::Client,
) -> Result<Option<String>, ProviderError> {
    let url = ollama_url
        .join("/api/ps")
        .map_err(|e| ProviderError::Http(e.to_string()))?;
    let response = match http.get(url).send().await {
        Ok(r) => r,
        Err(_) => return Ok(None),
    };
    if !response.status().is_success() {
        return Ok(None);
    }
    let body: ModelList = response
        .json()
        .await
        .map_err(|e| ProviderError::Http(e.to_string()))?;
    Ok(body
        .models
        .into_iter()
        .find(|m| m.size <= TIER2_SIZE_LIMIT_BYTES)
        .map(|m| m.name))
}

#[derive(Deserialize)]
struct GenerateResponse {
    response: String,
}

pub(super) async fn summarize(
    ollama_url: &Url,
    http: &reqwest::Client,
    model: &str,
    activity: &str,
) -> Result<String, ProviderError> {
    let url = ollama_url
        .join("/api/generate")
        .map_err(|e| ProviderError::Http(e.to_string()))?;
    let body = json!({
        "model": model,
        "system": prompt::system_instructions(),
        "prompt": prompt::user_message(activity),
        "stream": false,
    });
    let response = http
        .post(url)
        .json(&body)
        .send()
        .await
        .map_err(|e| ProviderError::Http(e.to_string()))?;
    let parsed: GenerateResponse = response
        .json()
        .await
        .map_err(|e| ProviderError::Http(e.to_string()))?;
    Ok(parsed.response)
}
