//! Production `Spawner`: launches the bundled ScreenPipe binary as a
//! `tokio::process::Child` and probes port availability with a short TCP
//! connect (ADR-0013). The trait stays in `mod.rs` so tests can inject a
//! fake without touching the OS.

use std::io;
use std::path::Path;
use std::time::Duration;

use async_trait::async_trait;
use tokio::net::TcpStream;
use tokio::process::Command;

use super::{ChildHandle, Spawner};

/// Short enough to keep `start()` responsive on the menu-toggle path. A
/// refused TCP connect returns immediately; a hang only happens on a stuck
/// host, which we treat as "port free" so a probe failure can't block
/// startup indefinitely.
const PROBE_TIMEOUT: Duration = Duration::from_millis(200);

pub struct OsSpawner;

#[async_trait]
impl Spawner for OsSpawner {
    async fn spawn(&self, binary: &Path, port: u16) -> io::Result<Box<dyn ChildHandle>> {
        let mut cmd = Command::new(binary);
        cmd.arg("record").arg("--port").arg(port.to_string());
        // SIGKILL the child if the wrapper is ever dropped — ensures
        // ScreenPipe doesn't outlive Intentive (e.g. on app quit / panic).
        cmd.kill_on_drop(true);
        let child = cmd.spawn()?;
        Ok(Box::new(OsChild { child }))
    }

    async fn port_in_use(&self, port: u16) -> bool {
        let addr = format!("127.0.0.1:{port}");
        match tokio::time::timeout(PROBE_TIMEOUT, TcpStream::connect(addr)).await {
            Ok(Ok(_)) => true,
            Ok(Err(_)) => false,
            Err(_) => false,
        }
    }
}

struct OsChild {
    child: tokio::process::Child,
}

#[async_trait]
impl ChildHandle for OsChild {
    async fn wait(&mut self) -> io::Result<()> {
        self.child.wait().await.map(|_| ())
    }

    async fn kill(&mut self) -> io::Result<()> {
        self.child.kill().await
    }
}
