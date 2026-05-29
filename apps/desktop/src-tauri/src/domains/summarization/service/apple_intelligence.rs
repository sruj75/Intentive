//! Tier 1: Apple Intelligence, accessed via ScreenPipe's `/ai/*` endpoints.
//! Zero dependencies, zero download — requires Apple Silicon + macOS 15.1+
//! with Apple Intelligence enabled. See ADR-0006.

use serde::Deserialize;
use serde_json::json;
use url::Url;

use super::{prompt, ProviderError};

#[derive(Deserialize)]
struct AiStatus {
    available: bool,
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Deserialize)]
struct ChatChoice {
    message: ChatMessage,
}

#[derive(Deserialize)]
struct ChatMessage {
    content: String,
}

/// Returns true if ScreenPipe reports Apple Intelligence is available.
/// Any network or parse error is treated as "not available" so resolution
/// proceeds to Tier 2 — Apple Intelligence is optional.
pub(super) async fn is_available(
    screenpipe_url: &Url,
    http: &reqwest::Client,
) -> Result<bool, ProviderError> {
    let url = screenpipe_url
        .join("/ai/status")
        .map_err(|e| ProviderError::Http(e.to_string()))?;
    let response = match http.get(url).send().await {
        Ok(r) => r,
        Err(_) => return Ok(false),
    };
    if !response.status().is_success() {
        return Ok(false);
    }
    let body: AiStatus = match response.json().await {
        Ok(b) => b,
        Err(_) => return Ok(false),
    };
    Ok(body.available)
}

pub(super) async fn summarize(
    screenpipe_url: &Url,
    http: &reqwest::Client,
    activity: &str,
) -> Result<String, ProviderError> {
    let url = screenpipe_url
        .join("/ai/chat/completions")
        .map_err(|e| ProviderError::Http(e.to_string()))?;
    let body = json!({
        "messages": [
            { "role": "system", "content": prompt::system_instructions() },
            { "role": "user", "content": prompt::user_message(activity) },
        ]
    });
    let response = http
        .post(url)
        .json(&body)
        .send()
        .await
        .map_err(|e| ProviderError::Http(e.to_string()))?;
    let parsed: ChatResponse = response
        .json()
        .await
        .map_err(|e| ProviderError::Http(e.to_string()))?;
    parsed
        .choices
        .into_iter()
        .next()
        .map(|c| c.message.content)
        .ok_or(ProviderError::Unavailable)
}
