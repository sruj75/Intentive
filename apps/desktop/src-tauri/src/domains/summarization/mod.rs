//! Summarization domain — resolves and routes on-device LLM summarization.
//!
//! - `types` — provider tier + error vocabulary.
//! - `config` — the `ProviderConfig` resolved at startup.
//! - `service` — the `LlmProvider` tier-selection + summarization logic and its
//!   backend adapters (Apple Intelligence, Ollama, bundled Ollama).
//! - `runtime` — the Tauri command surface for the bundled-model download.

pub mod config;
pub mod runtime;
pub mod service;
pub mod types;
