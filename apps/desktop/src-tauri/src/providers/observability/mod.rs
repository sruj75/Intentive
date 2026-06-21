use std::borrow::Cow;
use std::collections::HashMap;
use std::error::Error;
use std::hash::Hash;
use std::sync::Arc;
use std::time::{Duration, Instant};

use sentry::protocol::{Breadcrumb, Event, Level, Map, Value};

const FILTERED: &str = "[Filtered]";

/// Shared primitive for long-lived loops that can observe the same failure
/// class repeatedly. Domains keep their own failure taxonomy; this type owns
/// only the cooldown bookkeeping.
pub struct CaptureRateLimiter<K> {
    cooldown: Duration,
    last_captured: HashMap<K, Instant>,
}

impl<K> CaptureRateLimiter<K>
where
    K: Copy + Eq + Hash,
{
    pub fn new(cooldown: Duration) -> Self {
        Self {
            cooldown,
            last_captured: HashMap::new(),
        }
    }

    pub fn should_capture(&mut self, key: K, now: Instant) -> bool {
        let should_capture = self
            .last_captured
            .get(&key)
            .map(|last| now.duration_since(*last) >= self.cooldown)
            .unwrap_or(true);
        if should_capture {
            self.last_captured.insert(key, now);
        }
        should_capture
    }
}

pub fn init() -> Option<sentry::ClientInitGuard> {
    let dsn = option_env!("SENTRY_DSN")
        .map(str::to_owned)
        .or_else(|| std::env::var("SENTRY_DSN").ok())
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())?;
    let dsn = dsn.parse().ok()?;

    Some(sentry::init(sentry::ClientOptions {
        dsn: Some(dsn),
        release: Some(Cow::Owned(release())),
        environment: Some(Cow::Owned(environment())),
        send_default_pii: false,
        traces_sample_rate: 0.0,
        before_send: Some(Arc::new(|event| Some(sanitize_event(event)))),
        before_breadcrumb: Some(Arc::new(|breadcrumb| Some(sanitize_breadcrumb(breadcrumb)))),
        ..Default::default()
    }))
}

pub fn capture_error(error: &(dyn Error + Send + Sync + 'static)) {
    sentry::capture_event(sanitize_event(sentry::event_from_error(error)));
}

pub fn capture_message(message: &str, level: Level) {
    sentry::capture_message(&sanitize_string(message), level);
}

pub fn breadcrumb(category: &str, message: &str, level: Level) {
    sentry::add_breadcrumb(Breadcrumb {
        category: Some(category.to_string()),
        message: Some(sanitize_string(message)),
        level,
        ..Default::default()
    });
}

fn release() -> String {
    option_env!("SENTRY_RELEASE")
        .map(str::to_owned)
        .or_else(|| std::env::var("SENTRY_RELEASE").ok())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| format!("desktop@{}", env!("CARGO_PKG_VERSION")))
}

fn environment() -> String {
    option_env!("SENTRY_ENVIRONMENT")
        .map(str::to_owned)
        .or_else(|| std::env::var("SENTRY_ENVIRONMENT").ok())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| {
            if cfg!(debug_assertions) {
                "development".to_string()
            } else {
                "production".to_string()
            }
        })
}

fn sanitize_event(mut event: Event<'static>) -> Event<'static> {
    if let Some(request) = event.request.as_mut() {
        if let Some(url) = request.url.as_mut() {
            url.set_query(None);
            url.set_fragment(None);
        }
        request.data = None;
        request.query_string = None;
        request.cookies = None;
        request.headers = sanitize_string_map(&request.headers);
        request.env = sanitize_string_map(&request.env);
    }
    sanitize_serialized_event(event)
}

fn sanitize_breadcrumb(mut breadcrumb: Breadcrumb) -> Breadcrumb {
    breadcrumb.message = breadcrumb.message.map(|message| sanitize_string(&message));
    breadcrumb.data = sanitize_value_map(&breadcrumb.data);
    breadcrumb
}

fn sanitize_string_map(map: &Map<String, String>) -> Map<String, String> {
    map.iter()
        .map(|(key, value)| {
            let next = if is_sensitive_key(key) {
                FILTERED.to_string()
            } else {
                sanitize_string(value)
            };
            (key.clone(), next)
        })
        .collect()
}

fn sanitize_value_map(map: &Map<String, Value>) -> Map<String, Value> {
    map.iter()
        .map(|(key, value)| (key.clone(), sanitize_value_for_key(key, value)))
        .collect()
}

fn sanitize_value_for_key(key: &str, value: &Value) -> Value {
    if is_sensitive_key(key) {
        return Value::String(FILTERED.to_string());
    }
    if key.eq_ignore_ascii_case("url") {
        if let Value::String(url) = value {
            return Value::String(sanitize_url_string(url));
        }
    }
    sanitize_value(value)
}

fn sanitize_value(value: &Value) -> Value {
    match value {
        Value::String(value) => Value::String(sanitize_string(value)),
        Value::Array(values) => Value::Array(values.iter().map(sanitize_value).collect()),
        Value::Object(values) => Value::Object(sanitize_json_map(values)),
        other => other.clone(),
    }
}

fn sanitize_json_map(map: &serde_json::Map<String, Value>) -> serde_json::Map<String, Value> {
    map.iter()
        .map(|(key, value)| (key.clone(), sanitize_value_for_key(key, value)))
        .collect()
}

fn sanitize_serialized_event(event: Event<'static>) -> Event<'static> {
    let fallback_level = event.level;
    let Ok(value) = serde_json::to_value(event) else {
        return sanitization_fallback_event(fallback_level);
    };
    let value = sanitize_value(&value);
    serde_json::from_value(value).unwrap_or_else(|_| sanitization_fallback_event(fallback_level))
}

fn sanitization_fallback_event(level: Level) -> Event<'static> {
    Event {
        message: Some("event sanitization failed".to_string()),
        level,
        ..Default::default()
    }
}

fn sanitize_string(value: &str) -> String {
    value
        .split_whitespace()
        .map(|part| {
            if looks_like_jwt(part) {
                FILTERED.to_string()
            } else if let Some((key, _)) = part.split_once('=') {
                if is_sensitive_key(key) {
                    format!("{key}={FILTERED}")
                } else {
                    part.to_string()
                }
            } else {
                part.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn sanitize_url_string(value: &str) -> String {
    match url::Url::parse(value) {
        Ok(mut url) => {
            url.set_query(None);
            url.set_fragment(None);
            url.to_string()
        }
        Err(_) => sanitize_string(value),
    }
}

fn looks_like_jwt(value: &str) -> bool {
    let trimmed = value.trim_matches(|c: char| c == '"' || c == '\'' || c == ',' || c == ';');
    let mut parts = trimmed.split('.');
    matches!((parts.next(), parts.next(), parts.next(), parts.next()), (Some(a), Some(b), Some(c), None)
        if a.starts_with("eyJ") && !b.is_empty() && !c.is_empty())
}

fn is_sensitive_key(key: &str) -> bool {
    let normalized = key.to_ascii_lowercase();
    [
        "authorization",
        "cookie",
        "jwt",
        "password",
        "raw",
        "screenpipe",
        "secret",
        "snapshot",
        "summary",
        "token",
    ]
    .iter()
    .any(|needle| normalized.contains(needle))
}

#[cfg(test)]
mod tests {
    use super::*;
    use sentry::protocol::Request;
    use url::Url;

    #[test]
    fn before_send_removes_request_query_body_cookies_and_secret_headers() {
        let mut event = Event::default();
        let mut headers = Map::new();
        headers.insert("authorization".to_string(), "Bearer secret".to_string());
        headers.insert("x-safe".to_string(), "ok".to_string());
        event.request = Some(Request {
            url: Some(Url::parse("https://example.com/agent?token=secret").unwrap()),
            data: Some("snapshot text".to_string()),
            query_string: Some("token=secret".to_string()),
            cookies: Some("session=secret".to_string()),
            headers,
            ..Default::default()
        });

        let event = sanitize_event(event);
        let request = event.request.expect("request");
        assert_eq!(request.url.unwrap().as_str(), "https://example.com/agent");
        assert_eq!(
            request.headers.get("authorization").map(String::as_str),
            Some(FILTERED)
        );
        assert_eq!(
            request.headers.get("x-safe").map(String::as_str),
            Some("ok")
        );
        assert!(request.data.is_none());
        assert!(request.query_string.is_none());
        assert!(request.cookies.is_none());
    }

    #[test]
    fn breadcrumb_scrubber_filters_snapshot_data_and_jwts() {
        let mut data = Map::new();
        data.insert(
            "state".to_string(),
            Value::String("routing_ready".to_string()),
        );
        data.insert("snapshot".to_string(), Value::String("private".to_string()));
        let breadcrumb = sanitize_breadcrumb(Breadcrumb {
            message: Some(
                "failed token=secret eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature".to_string(),
            ),
            data,
            ..Default::default()
        });

        assert_eq!(
            breadcrumb.message.as_deref(),
            Some("failed token=[Filtered] [Filtered]")
        );
        assert_eq!(
            breadcrumb.data.get("snapshot"),
            Some(&Value::String(FILTERED.to_string()))
        );
    }

    #[test]
    fn before_send_scrubs_exception_payloads_and_extra_values() {
        let jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature";
        let mut event = sentry::event_from_error(&std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            format!("malformed runtime frame token=secret {jwt}"),
        ));
        event.message = Some(format!("request failed jwt={jwt}"));
        event.extra.insert(
            "screenpipe_summary".to_string(),
            Value::String("private summary".to_string()),
        );

        let event = sanitize_event(event);
        let exception = event.exception.values.first().expect("exception");
        assert_eq!(
            exception.value.as_deref(),
            Some("malformed runtime frame token=[Filtered] [Filtered]")
        );
        assert_eq!(
            event.message.as_deref(),
            Some("request failed jwt=[Filtered]")
        );
        assert_eq!(
            event.extra.get("screenpipe_summary"),
            Some(&Value::String(FILTERED.to_string()))
        );
    }

    #[test]
    fn capture_rate_limiter_is_per_class_and_cooldown_bound() {
        #[derive(Clone, Copy, PartialEq, Eq, Hash)]
        enum FailureClass {
            Activity,
            Summarization,
        }

        let mut limiter = CaptureRateLimiter::new(Duration::from_secs(60));
        let now = Instant::now();

        assert!(limiter.should_capture(FailureClass::Activity, now));
        assert!(!limiter.should_capture(FailureClass::Activity, now + Duration::from_secs(30)));
        assert!(limiter.should_capture(FailureClass::Summarization, now + Duration::from_secs(30)));
        assert!(limiter.should_capture(FailureClass::Activity, now + Duration::from_secs(61)));
    }
}
