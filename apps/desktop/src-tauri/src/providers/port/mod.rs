//! Local port resolution for Intentive's bundled binaries.
//!
//! ADR-0013 picked obscure ports (`44380` for ScreenPipe, `44381` for bundled
//! Ollama) to make conflicts vanishingly rare. The rare collision is almost
//! always a zombie process from a crashed prior Intentive session — falling to
//! a fallback port (skipping by 2 so the two binaries never claim each other's
//! fallback) is a better answer than asking the user to relaunch.
//!
//! The probe is a 200ms TCP connect (same shape as `capture_session::OsSpawner`).

use std::time::Duration;
use tokio::net::TcpStream;

const PROBE_TIMEOUT: Duration = Duration::from_millis(200);

#[derive(Debug, thiserror::Error)]
#[error("both ports {primary} and {fallback} are in use")]
pub struct BothPortsInUse {
    pub primary: u16,
    pub fallback: u16,
}

/// Try the primary port; if occupied, try the fallback; if both are occupied,
/// return [`BothPortsInUse`].
pub async fn resolve_port(primary: u16, fallback: u16) -> Result<u16, BothPortsInUse> {
    resolve_port_with(primary, fallback, |port| async move { is_in_use(port).await }).await
}

/// Generic variant for unit tests: the caller supplies the probe. Production
/// code uses [`resolve_port`].
pub async fn resolve_port_with<F, Fut>(
    primary: u16,
    fallback: u16,
    probe: F,
) -> Result<u16, BothPortsInUse>
where
    F: Fn(u16) -> Fut,
    Fut: std::future::Future<Output = bool>,
{
    if !probe(primary).await {
        return Ok(primary);
    }
    if !probe(fallback).await {
        return Ok(fallback);
    }
    Err(BothPortsInUse { primary, fallback })
}

async fn is_in_use(port: u16) -> bool {
    let addr = format!("127.0.0.1:{port}");
    matches!(
        tokio::time::timeout(PROBE_TIMEOUT, TcpStream::connect(&addr)).await,
        Ok(Ok(_))
    )
}

#[cfg(test)]
mod tests;
