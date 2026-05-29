//! Tauri command surface for the bundled Ollama model download (Issue #7,
//! ADR-0018). The onboarding window invokes `start_model_download` and
//! listens for `bundled-ollama:progress` / `bundled-ollama:complete` /
//! `bundled-ollama:failed` events to drive the UI.
//!
//! The event-forwarding loop is extracted into [`forward_progress`] so it can
//! be unit-tested without spinning up a real Tauri runtime.

use std::sync::Arc;

use tauri::{AppHandle, Emitter, State};
use tokio::sync::mpsc;

use crate::domains::summarization::service::{LlmProvider, PullProgress};
use crate::{LlmProviderSlot, ProviderConfigState};

/// Event name emitted for each progress tick while the bundled model pulls.
pub const EVENT_PROGRESS: &str = "bundled-ollama:progress";
/// Event name emitted once `LlmProvider::resolve_with_progress` returns Ok.
pub const EVENT_COMPLETE: &str = "bundled-ollama:complete";
/// Event name emitted on any failure (spawn, pull, or LLM Provider error).
pub const EVENT_FAILED: &str = "bundled-ollama:failed";

/// Drain `rx` until it closes, calling `emit` for each event. The helper does
/// not know about Tauri; the production path wires `emit` to
/// `AppHandle::emit`. Returns once the sender is dropped.
pub async fn forward_progress<F>(mut rx: mpsc::Receiver<PullProgress>, emit: F)
where
    F: Fn(PullProgress),
{
    while let Some(event) = rx.recv().await {
        emit(event);
    }
}

/// Start the bundled-Ollama model download. Spawns a forwarding task that
/// emits Tauri events to the frontend; awaits the LLM Provider resolve;
/// stores the resolved provider in the slot; emits the terminal event.
#[tauri::command]
pub async fn start_model_download(
    app: AppHandle,
    slot: State<'_, Arc<LlmProviderSlot>>,
    config: State<'_, ProviderConfigState>,
) -> Result<(), String> {
    let (tx, rx) = mpsc::channel::<PullProgress>(64);
    let emit_app = app.clone();
    let forwarder = tokio::spawn(async move {
        forward_progress(rx, move |event| {
            let _ = emit_app.emit(EVENT_PROGRESS, event);
        })
        .await;
    });

    let mut cfg = config.config.clone();
    cfg.screenpipe_url = config.screenpipe_endpoint.current_or_primary_url();
    let http = reqwest::Client::new();
    let result = LlmProvider::resolve_with_progress(cfg, http, tx).await;
    // Wait for the forwarder to drain whatever's still in flight before
    // emitting the terminal event so the frontend never sees `complete`
    // arrive ahead of the final progress tick.
    let _ = forwarder.await;

    match result {
        Ok(provider) => {
            *slot.0.lock().await = Some(Arc::new(provider));
            let _ = app.emit(EVENT_COMPLETE, ());
            Ok(())
        }
        Err(e) => {
            let message = e.to_string();
            let _ = app.emit(EVENT_FAILED, message.clone());
            Err(message)
        }
    }
}

#[cfg(test)]
mod tests;
