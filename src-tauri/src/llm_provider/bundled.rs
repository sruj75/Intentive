//! Tier 3 — Intentive's bundled Ollama binary. Spawns Ollama, pulls
//! `qwen3.5:0.8b` on first run, and reuses it on subsequent launches.
//! See ADR-0006.
//!
//! Subprocess interaction is mediated by the `OllamaProcess` trait so the
//! lifecycle logic (spawn-if-not-running, pull-if-not-cached) can be unit
//! tested without touching a real binary. The production implementation fails
//! closed until the real bundled-binary path is wired, so provider resolution
//! never reports Tier 3 as ready without an Ollama process and model.

use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use async_trait::async_trait;
use serde::Deserialize;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;
use url::Url;

use super::ProviderError;

#[derive(Deserialize)]
struct TagsResponse {
    models: Vec<TagsEntry>,
}

#[derive(Deserialize)]
struct TagsEntry {
    name: String,
}

/// The Tier 3 bundled model — confirmed in the Ollama registry, see ADR-0006.
pub(crate) const BUNDLED_MODEL: &str = "qwen3.5:0.8b";

/// Where Ollama stores its model manifests. Honors `OLLAMA_MODELS` if set
/// (matching Ollama's own behavior), otherwise falls back to
/// `$HOME/.ollama/models`. Returns `None` if `$HOME` is not set, which on
/// macOS only happens in extremely unusual launch environments — callers
/// should treat that as "model absent" and proceed with onboarding.
pub(crate) fn default_models_root() -> Option<PathBuf> {
    if let Ok(custom) = std::env::var("OLLAMA_MODELS") {
        return Some(PathBuf::from(custom));
    }
    let home = std::env::var("HOME").ok()?;
    Some(PathBuf::from(home).join(".ollama").join("models"))
}

/// One progress event emitted while the bundled model is being downloaded.
/// `percent` is `0` for status-only steps (manifest, verification) and the
/// computed fraction for layer-download steps; `100` for the final `success`.
#[derive(Debug, Clone, serde::Serialize)]
pub struct PullProgress {
    pub percent: u8,
    pub status: String,
}

/// Parse one streaming JSON line from Ollama's `/api/pull` endpoint into a
/// [`PullProgress`]. The streaming protocol mixes status-only frames
/// (`{"status":"pulling manifest"}`) with layer-progress frames that include
/// `total` and `completed` byte counts. Percent is clamped to `100` for
/// robustness against off-by-one final frames.
pub(super) fn parse_pull_line(line: &str) -> Option<PullProgress> {
    let v: serde_json::Value = serde_json::from_str(line).ok()?;
    let status = v.get("status")?.as_str()?.to_string();
    let percent = if status == "success" {
        100
    } else if let (Some(total), Some(completed)) = (
        v.get("total").and_then(|x| x.as_u64()),
        v.get("completed").and_then(|x| x.as_u64()),
    ) {
        completed
            .saturating_mul(100)
            .checked_div(total)
            .map(|p| p.min(100) as u8)
            .unwrap_or(0)
    } else {
        0
    };
    Some(PullProgress { percent, status })
}

/// Returns true if `line` looks like Ollama's "ready" log line. Match the
/// substring `Listening on` rather than the full structured format — Ollama
/// emits the line via Go's structured logger and the surrounding fields
/// (timestamp, source file, version) drift between releases.
pub(super) fn parse_ready_line(line: &str) -> bool {
    line.contains("Listening on")
}

/// Returns `true` if the Ollama manifest file for `model` exists under
/// `models_root`. Ollama lays its model store out as
/// `<root>/manifests/registry.ollama.ai/library/<name>/<tag>` — checking the
/// manifest file is the cheapest reliable presence test that doesn't require
/// Ollama itself to be running. Used by startup to decide whether to open
/// the onboarding window (ADR-0018).
pub(crate) fn model_is_present_on_disk(models_root: &Path, model: &str) -> bool {
    let Some((name, tag)) = model.split_once(':') else {
        return false;
    };
    models_root
        .join("manifests")
        .join("registry.ollama.ai")
        .join("library")
        .join(name)
        .join(tag)
        .is_file()
}

/// Extract the `host:port` value Ollama expects via `OLLAMA_HOST` from the
/// configured URL. Returns `None` if the URL has no host or port.
pub(super) fn host_port_for(url: &Url) -> Option<String> {
    let host = url.host_str()?;
    let port = url.port_or_known_default()?;
    Some(format!("{host}:{port}"))
}

#[async_trait]
pub(super) trait OllamaProcess: Send + Sync {
    async fn is_running(&self) -> bool;
    async fn spawn(&self) -> Result<(), ProviderError>;
    async fn has_model(&self, model: &str) -> bool;
    /// Pull `model` and stream progress events into `progress`. Implementations
    /// must send at least one event with `percent == 100` on successful
    /// completion. Send errors (receiver dropped) are non-fatal — the pull
    /// continues silently.
    async fn pull(
        &self,
        model: &str,
        progress: tokio::sync::mpsc::Sender<PullProgress>,
    ) -> Result<(), ProviderError>;
}

pub(super) async fn prepare(
    url: Url,
    binary_path: PathBuf,
    http: reqwest::Client,
    progress: tokio::sync::mpsc::Sender<PullProgress>,
) -> Result<String, ProviderError> {
    prepare_with(&SystemOllamaProcess::new(url, binary_path, http), progress).await
}

async fn prepare_with(
    process: &impl OllamaProcess,
    progress: tokio::sync::mpsc::Sender<PullProgress>,
) -> Result<String, ProviderError> {
    if !process.is_running().await {
        process.spawn().await?;
    }
    if !process.has_model(BUNDLED_MODEL).await {
        process.pull(BUNDLED_MODEL, progress).await?;
    }
    Ok(BUNDLED_MODEL.to_string())
}

/// Production `OllamaProcess`. Owns the bundled Ollama child process for the
/// lifetime of Intentive — `kill_on_drop` ensures the OS process never
/// outlives us. The `url` is the configured `bundled_ollama_url` (default
/// `localhost:44381`, with fallback port resolution at spawn time).
pub(crate) struct SystemOllamaProcess {
    url: Url,
    binary_path: PathBuf,
    http: reqwest::Client,
    child: Mutex<Option<Child>>,
}

impl SystemOllamaProcess {
    pub(crate) fn new(url: Url, binary_path: PathBuf, http: reqwest::Client) -> Self {
        Self {
            url,
            binary_path,
            http,
            child: Mutex::new(None),
        }
    }
}

/// HTTP probe timeout for `is_running` — short enough that startup probes
/// never block visibly, long enough to tolerate a busy local TCP stack.
const PROBE_TIMEOUT: Duration = Duration::from_millis(500);

/// Hard ceiling for the post-spawn readiness wait. ADR / grilling session
/// agreed: 10s is generous enough for Apple Silicon under memory pressure.
const READY_TIMEOUT: Duration = Duration::from_secs(10);

#[async_trait]
impl OllamaProcess for SystemOllamaProcess {
    async fn is_running(&self) -> bool {
        let Ok(endpoint) = self.url.join("/api/tags") else {
            return false;
        };
        let Ok(Ok(response)) = tokio::time::timeout(
            PROBE_TIMEOUT,
            self.http.get(endpoint).send(),
        )
        .await
        else {
            return false;
        };
        response.status().is_success()
    }
    async fn spawn(&self) -> Result<(), ProviderError> {
        let host = host_port_for(&self.url).ok_or(ProviderError::Unavailable)?;
        let mut cmd = Command::new(&self.binary_path);
        cmd.arg("serve")
            .env("OLLAMA_HOST", &host)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        // Any subprocess failure is reported as Unavailable — the caller
        // distinguishes tier outcomes by variant, not by specific error
        // strings.
        let mut child = cmd.spawn().map_err(|_| ProviderError::Unavailable)?;

        // Ollama logs the ready line to stderr in most builds; read both
        // streams so we don't miss it.
        let stdout = child.stdout.take().ok_or(ProviderError::Unavailable)?;
        let stderr = child.stderr.take().ok_or(ProviderError::Unavailable)?;
        let mut stdout_lines = BufReader::new(stdout).lines();
        let mut stderr_lines = BufReader::new(stderr).lines();

        let ready = tokio::time::timeout(READY_TIMEOUT, async {
            loop {
                tokio::select! {
                    line = stdout_lines.next_line() => {
                        match line {
                            Ok(Some(l)) if parse_ready_line(&l) => return Ok(()),
                            Ok(Some(_)) => continue,
                            Ok(None) => return Err(ProviderError::Unavailable), // EOF → process exited early
                            Err(_) => return Err(ProviderError::Unavailable),
                        }
                    }
                    line = stderr_lines.next_line() => {
                        match line {
                            Ok(Some(l)) if parse_ready_line(&l) => return Ok(()),
                            Ok(Some(_)) => continue,
                            Ok(None) => return Err(ProviderError::Unavailable),
                            Err(_) => return Err(ProviderError::Unavailable),
                        }
                    }
                }
            }
        })
        .await;

        match ready {
            Ok(Ok(())) => {
                // Store the child so it lives as long as `self`. kill_on_drop
                // ensures it dies when Intentive quits.
                *self.child.lock().await = Some(child);
                Ok(())
            }
            Ok(Err(e)) => {
                let _ = child.kill().await;
                Err(e)
            }
            Err(_elapsed) => {
                let _ = child.kill().await;
                Err(ProviderError::Unavailable)
            }
        }
    }
    async fn has_model(&self, model: &str) -> bool {
        let Ok(endpoint) = self.url.join("/api/tags") else {
            return false;
        };
        let Ok(Ok(response)) =
            tokio::time::timeout(PROBE_TIMEOUT, self.http.get(endpoint).send()).await
        else {
            return false;
        };
        if !response.status().is_success() {
            return false;
        }
        let Ok(body) = response.json::<TagsResponse>().await else {
            return false;
        };
        body.models.iter().any(|m| m.name == model)
    }
    async fn pull(
        &self,
        model: &str,
        progress: tokio::sync::mpsc::Sender<PullProgress>,
    ) -> Result<(), ProviderError> {
        let endpoint = self
            .url
            .join("/api/pull")
            .map_err(|e| ProviderError::Http(e.to_string()))?;
        let mut response = self
            .http
            .post(endpoint)
            .json(&serde_json::json!({ "name": model, "stream": true }))
            .send()
            .await
            .map_err(|e| ProviderError::Http(e.to_string()))?;
        if !response.status().is_success() {
            return Err(ProviderError::Http(format!(
                "pull returned {}",
                response.status()
            )));
        }

        // Ollama streams newline-delimited JSON. Buffer until we have whole
        // lines, then parse each.
        let mut buffer: Vec<u8> = Vec::new();
        let mut saw_success = false;
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|e| ProviderError::Http(e.to_string()))?
        {
            buffer.extend_from_slice(&chunk);
            while let Some(newline) = buffer.iter().position(|b| *b == b'\n') {
                let line_bytes: Vec<u8> = buffer.drain(..=newline).collect();
                let line = std::str::from_utf8(&line_bytes[..line_bytes.len() - 1]).unwrap_or("");
                if let Some(event) = parse_pull_line(line) {
                    if event.status == "success" {
                        saw_success = true;
                    }
                    // Receiver may have been dropped — that's fine, the pull
                    // continues to completion regardless.
                    let _ = progress.send(event).await;
                }
            }
        }
        if !saw_success {
            return Err(ProviderError::Unavailable);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests;
