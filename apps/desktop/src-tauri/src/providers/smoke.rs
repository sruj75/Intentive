//! Dev-only structured smoke trace (#35). The signed-in Capture Session smoke
//! harness (`apps/desktop/smoke/`) greps these lines for ordering evidence —
//! most importantly that the Session End Marker leaves the process *before*
//! ScreenPipe exits.
//!
//! Compiled **only** under `debug_assertions`, so it cannot exist in the
//! notarized release. Each call appends one `SMOKE {json}` line to stderr (so
//! it shows up in the `tauri dev` console for the live demo) and, when
//! `INTENTIVE_SMOKE_LOG` names a file, also appends the same line there for the
//! `assert.mjs` correlator to read.

use std::fs::OpenOptions;
use std::io::Write;

use chrono::Utc;
use serde_json::Value;

/// Env var naming a file to append smoke events to. When unset, events go only
/// to stderr.
pub const SMOKE_LOG_ENV: &str = "INTENTIVE_SMOKE_LOG";

/// Override the 600s heartbeat cadence with a smaller integer (seconds) so the
/// smoke completes in ~2 short cycles instead of 20 minutes.
pub const HEARTBEAT_INTERVAL_ENV: &str = "INTENTIVE_HEARTBEAT_INTERVAL_SECS";

/// `=1` swaps the on-device LLM for a deterministic stub so ticks never skip.
pub const STUB_SUMMARIZER_ENV: &str = "INTENTIVE_SMOKE_STUB_SUMMARIZER";

/// A minted login JWT injected at startup so the AFK harness drives the real
/// `GET /agent` path without scripting the webview.
pub const LOGIN_TOKEN_ENV: &str = "INTENTIVE_SMOKE_LOGIN_TOKEN";

/// `=1` drives the capture FSM to signed-in at startup so the AFK harness can
/// auto-start a Capture Session without the menu-bar sign-in surface. This is
/// **independent of Routing** (the login token only moves Routing State): in
/// fixture fast-loop mode there is no login token at all, so the capture
/// sign-in must have its own dedicated trigger. See `lib.rs` and `docs/SMOKE.md`.
pub const CAPTURE_SIGNED_IN_ENV: &str = "INTENTIVE_SMOKE_CAPTURE_SIGNED_IN";

/// Read a dev-only smoke env var, treating an absent **or** empty/whitespace
/// value as unset. Centralizing this here is the single seam the smoke wiring
/// reads, and keeps the "an empty token must not trigger injection" rule
/// testable (release builds never compile any caller — see `lib.rs`).
pub fn dev_env(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

/// Append one smoke event. `event` is the grep key (e.g. `"screenpipe_exited"`,
/// `"marker_emit"`); `fields` carries any structured detail (a JSON object, or
/// `Value::Null` for none). A wall-clock `at` (RFC3339) is stamped on every
/// line so the correlator can order it against gateway receipts.
pub fn smoke_event(event: &str, fields: Value) {
    let mut line = serde_json::json!({
        "event": event,
        "at": Utc::now().to_rfc3339(),
    });
    if let Value::Object(extra) = fields {
        if let Value::Object(map) = &mut line {
            map.extend(extra);
        }
    }
    let rendered = format!("SMOKE {line}");
    eprintln!("{rendered}");

    if let Ok(path) = std::env::var(SMOKE_LOG_ENV) {
        if !path.trim().is_empty() {
            if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&path) {
                let _ = writeln!(file, "{rendered}");
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::dev_env;

    /// Locks the safety rule the login-token injection leans on: an empty or
    /// whitespace-only value reads as unset, so a blank `INTENTIVE_SMOKE_LOGIN_TOKEN`
    /// can never trip the dev-only injection. Uses a unique var name so the test
    /// is hermetic and doesn't collide with a real smoke run.
    #[test]
    fn dev_env_treats_empty_and_whitespace_as_unset() {
        let name = "INTENTIVE_SMOKE_DEV_ENV_TEST_VAR";

        std::env::remove_var(name);
        assert_eq!(dev_env(name), None, "absent var is unset");

        std::env::set_var(name, "   ");
        assert_eq!(dev_env(name), None, "whitespace-only var is unset");

        std::env::set_var(name, "  hunter2  ");
        assert_eq!(
            dev_env(name),
            Some("hunter2".to_string()),
            "a real value is trimmed and returned",
        );

        std::env::remove_var(name);
    }
}
