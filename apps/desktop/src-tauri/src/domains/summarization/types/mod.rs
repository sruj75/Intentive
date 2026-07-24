//! Types layer of the summarization domain — the provider tier and error
//! vocabulary shared by every provider adapter and the resolve/summarize logic.

/// Which on-device provider tier was selected at resolve time. Exposed for
/// startup logging only — callers should not branch on this.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Tier {
    AppleIntelligence,
    ExistingOllama,
    BundledOllama,
}

#[derive(Debug, Clone, thiserror::Error)]
pub enum ProviderError {
    #[error("no on-device provider available")]
    Unavailable,
    #[error("http error: {0}")]
    Http(String),
}
