//! Config layer of the summarization domain — the `ProviderConfig` the
//! composition root resolves at startup and hands to the `LlmProvider`.

use url::Url;

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
