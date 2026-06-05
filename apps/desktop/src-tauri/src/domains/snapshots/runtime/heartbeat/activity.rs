//! Activity Client — the boundary between the heartbeat and ScreenPipe's
//! local HTTP API. Hidden behind the `ActivityClient` trait so the heartbeat
//! has no compile-time dependency on `reqwest`, the `/activity-summary`
//! response shape, or the ADR-0013 port indirection.
//!
//! ScreenPipe is a niche local tool (base URL http://localhost:3030) an agent is
//! unlikely to know. Its endpoints, query params, and JSON response shapes:
//! https://docs.screenpi.pe/api-recipes — `/activity-summary` is the recipe
//! "Summarize Activity"; the raw OCR/audio/window feed it distils is `/search`.

use async_trait::async_trait;
use url::Url;

#[derive(Debug, thiserror::Error)]
pub enum ActivityError {
    #[error("activity query failed: {0}")]
    Http(String),
}

/// Asks ScreenPipe for the preceding 10-minute activity window and returns it
/// as the raw string the on-device LLM consumes. The string format is opaque
/// to the heartbeat — keeping the LLM and ScreenPipe coupled together on the
/// far side of this trait.
#[async_trait]
pub trait ActivityClient: Send + Sync + 'static {
    async fn query_last_10_minutes(&self, screenpipe_url: &Url) -> Result<String, ActivityError>;
}

/// Production implementation backed by `reqwest`. Calls ScreenPipe's
/// `/activity-summary` endpoint with a `10m ago → now` window — the
/// highest-signal "what was the user doing?" endpoint per ScreenPipe's own
/// progressive-disclosure guidance. `start_time`/`end_time` accept ISO 8601 UTC
/// or relative strings like "10m ago" (see the module-level docs link).
pub struct ReqwestActivityClient {
    http: reqwest::Client,
}

impl ReqwestActivityClient {
    pub fn new(http: reqwest::Client) -> Self {
        Self { http }
    }
}

#[async_trait]
impl ActivityClient for ReqwestActivityClient {
    async fn query_last_10_minutes(&self, screenpipe_url: &Url) -> Result<String, ActivityError> {
        let url = screenpipe_url
            .join("/activity-summary?start_time=10m%20ago&end_time=now")
            .map_err(|e| ActivityError::Http(e.to_string()))?;
        let response = self
            .http
            .get(url)
            .send()
            .await
            .map_err(|e| ActivityError::Http(e.to_string()))?;
        if !response.status().is_success() {
            return Err(ActivityError::Http(format!(
                "non-2xx response: {}",
                response.status()
            )));
        }
        response
            .text()
            .await
            .map_err(|e| ActivityError::Http(e.to_string()))
    }
}
