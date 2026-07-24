use std::time::Duration;

pub const CONTROL_PLANE_BASE_URL_ENV: &str = "INTENTIVE_CONTROL_PLANE_URL";
pub const FIXTURE_ROUTING_ENV: &str = "INTENTIVE_DESKTOP_ROUTING_FIXTURE";
pub const GET_AGENT_PATH: &str = "/agent";
pub const CLIENT_KIND: &str = "desktop";
pub const CLIENT_VERSION: &str = env!("CARGO_PKG_VERSION");
pub const BACKOFF_BASE: Duration = Duration::from_secs(1);
pub const BACKOFF_CAP: Duration = Duration::from_secs(30);

pub fn default_control_plane_base_url() -> Option<String> {
    std::env::var(CONTROL_PLANE_BASE_URL_ENV)
        .ok()
        .filter(|value| !value.trim().is_empty())
}
