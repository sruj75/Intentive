use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use tokio::sync::Mutex;
use tokio::task::JoinHandle;
use tokio_tungstenite::tungstenite::Message;
use url::Url;

use crate::domains::routing::config::{
    CLIENT_KIND, CLIENT_VERSION, FIXTURE_ROUTING_ENV, GET_AGENT_PATH,
};
use crate::domains::routing::service::{
    backoff_delay, reconnect_decision, transition, ReconnectCause, ReconnectDecision, RoutingEvent,
};
use crate::domains::routing::types::{
    connection_mood, ConnectionStatus, Routing, RoutingState, RuntimeHandshakeFrame, SessionState,
};

pub mod commands;

#[async_trait]
pub trait RoutingSource: Send + Sync + 'static {
    async fn fetch(&self, login_token: &str) -> Result<Routing, RoutingFetchError>;
}

#[derive(Debug, thiserror::Error)]
pub enum RoutingFetchError {
    #[error("routing source is not configured")]
    NotConfigured,
    #[error("routing request failed: {0}")]
    Network(String),
    #[error("routing request returned HTTP {0}")]
    Status(u16),
    #[error("routing response was malformed: {0}")]
    Malformed(String),
}

pub struct RoutingFetcher {
    base_url: Url,
    http: reqwest::Client,
}

impl RoutingFetcher {
    pub fn new(base_url: Url, http: reqwest::Client) -> Self {
        Self { base_url, http }
    }
}

#[derive(Deserialize)]
struct GetAgentResponse {
    agent_instance_id: String,
    ws_url: Url,
    runtime_jwt: String,
}

#[async_trait]
impl RoutingSource for RoutingFetcher {
    async fn fetch(&self, login_token: &str) -> Result<Routing, RoutingFetchError> {
        let endpoint = self
            .base_url
            .join(GET_AGENT_PATH)
            .map_err(|e| RoutingFetchError::Malformed(e.to_string()))?;
        let response = self
            .http
            .get(endpoint)
            .bearer_auth(login_token)
            .header("x-client-kind", CLIENT_KIND)
            .send()
            .await
            .map_err(|e| RoutingFetchError::Network(e.to_string()))?;

        if !response.status().is_success() {
            return Err(RoutingFetchError::Status(response.status().as_u16()));
        }

        let body = response
            .json::<GetAgentResponse>()
            .await
            .map_err(|e| RoutingFetchError::Malformed(e.to_string()))?;
        Ok(Routing {
            ws_url: body.ws_url,
            runtime_jwt: body.runtime_jwt,
            agent_instance_id: body.agent_instance_id,
        })
    }
}

pub struct FixtureRoutingSource {
    routing: Routing,
}

impl FixtureRoutingSource {
    pub fn from_env() -> Result<Option<Self>, RoutingFetchError> {
        let Some(raw) = std::env::var(FIXTURE_ROUTING_ENV)
            .ok()
            .filter(|value| !value.trim().is_empty())
        else {
            return Ok(None);
        };
        let body = serde_json::from_str::<GetAgentResponse>(&raw)
            .map_err(|e| RoutingFetchError::Malformed(e.to_string()))?;
        Ok(Some(Self {
            routing: Routing {
                ws_url: body.ws_url,
                runtime_jwt: body.runtime_jwt,
                agent_instance_id: body.agent_instance_id,
            },
        }))
    }
}

#[async_trait]
impl RoutingSource for FixtureRoutingSource {
    async fn fetch(&self, login_token: &str) -> Result<Routing, RoutingFetchError> {
        let _ = login_token;
        Ok(self.routing.clone())
    }
}

pub struct DisabledRoutingSource;

#[async_trait]
impl RoutingSource for DisabledRoutingSource {
    async fn fetch(&self, login_token: &str) -> Result<Routing, RoutingFetchError> {
        let _ = login_token;
        Err(RoutingFetchError::NotConfigured)
    }
}

#[async_trait]
pub trait WsTransport: Send + Sync + 'static {
    async fn connect(&self, url: &Url) -> Result<Box<dyn WsConnection>, WsTransportError>;
}

#[async_trait]
pub trait WsConnection: Send + 'static {
    async fn send_text(&mut self, text: String) -> Result<(), WsTransportError>;
    async fn next_text(&mut self) -> Result<Option<String>, WsTransportError>;
}

#[derive(Debug, thiserror::Error)]
pub enum WsTransportError {
    #[error("websocket transport failed: {0}")]
    Failed(String),
}

#[derive(Default)]
pub struct TungsteniteTransport;

#[async_trait]
impl WsTransport for TungsteniteTransport {
    async fn connect(&self, url: &Url) -> Result<Box<dyn WsConnection>, WsTransportError> {
        let (stream, _) = tokio_tungstenite::connect_async(url.as_str())
            .await
            .map_err(|e| WsTransportError::Failed(e.to_string()))?;
        Ok(Box::new(TungsteniteConnection { stream }))
    }
}

struct TungsteniteConnection {
    stream: tokio_tungstenite::WebSocketStream<
        tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
    >,
}

#[async_trait]
impl WsConnection for TungsteniteConnection {
    async fn send_text(&mut self, text: String) -> Result<(), WsTransportError> {
        self.stream
            .send(Message::Text(text.into()))
            .await
            .map_err(|e| WsTransportError::Failed(e.to_string()))
    }

    async fn next_text(&mut self) -> Result<Option<String>, WsTransportError> {
        loop {
            let Some(message) = self.stream.next().await else {
                return Ok(None);
            };
            match message.map_err(|e| WsTransportError::Failed(e.to_string()))? {
                Message::Text(text) => return Ok(Some(text.to_string())),
                Message::Close(_) => return Ok(None),
                Message::Ping(_) | Message::Pong(_) | Message::Binary(_) | Message::Frame(_) => {}
            }
        }
    }
}

pub trait RoutingObserver: Send + Sync + 'static {
    fn observe(&self, routing_state: RoutingState, session_state: SessionState);
}

#[derive(Default)]
pub struct NoopRoutingObserver;

impl RoutingObserver for NoopRoutingObserver {
    fn observe(&self, routing_state: RoutingState, session_state: SessionState) {
        let _ = (routing_state, session_state);
    }
}

pub trait JitterSource: Send + Sync + 'static {
    fn jitter(&self, base: Duration) -> Duration;
}

#[derive(Default)]
pub struct FastrandJitter;

impl JitterSource for FastrandJitter {
    fn jitter(&self, base: Duration) -> Duration {
        let max_ms = (base.as_millis() / 2).min(u64::MAX as u128) as u64;
        if max_ms == 0 {
            Duration::ZERO
        } else {
            Duration::from_millis(fastrand::u64(0..=max_ms))
        }
    }
}

pub struct WsSession {
    routing_source: Arc<dyn RoutingSource>,
    transport: Arc<dyn WsTransport>,
    observer: Arc<dyn RoutingObserver>,
    jitter: Arc<dyn JitterSource>,
    task: Mutex<Option<JoinHandle<()>>>,
    login_token: Mutex<Option<String>>,
}

impl WsSession {
    pub fn new(
        routing_source: Arc<dyn RoutingSource>,
        transport: Arc<dyn WsTransport>,
        observer: Arc<dyn RoutingObserver>,
        jitter: Arc<dyn JitterSource>,
    ) -> Arc<Self> {
        Arc::new(Self {
            routing_source,
            transport,
            observer,
            jitter,
            task: Mutex::new(None),
            login_token: Mutex::new(None),
        })
    }

    pub async fn set_login_token(self: &Arc<Self>, token: String) {
        self.stop_task().await;
        *self.login_token.lock().await = Some(token.clone());
        self.observer
            .observe(RoutingState::SignedIn, SessionState::Disconnected);
        let session = self.clone();
        let task = tokio::spawn(async move { session.run(token).await });
        *self.task.lock().await = Some(task);
    }

    pub async fn clear_login_token(self: &Arc<Self>) {
        *self.login_token.lock().await = None;
        self.stop_task().await;
        self.observer
            .observe(RoutingState::SignedOut, SessionState::Disconnected);
    }

    async fn stop_task(&self) {
        if let Some(task) = self.task.lock().await.take() {
            task.abort();
        }
    }

    async fn run(self: Arc<Self>, token: String) {
        let mut routing_state = RoutingState::SignedIn;
        let mut session_state = SessionState::Disconnected;
        let mut routing: Option<Routing> = None;
        let mut attempt = 0;

        loop {
            if self.login_token.lock().await.as_deref() != Some(token.as_str()) {
                return;
            }

            if routing.is_none() {
                match self.routing_source.fetch(&token).await {
                    Ok(fetched) => {
                        routing = Some(fetched);
                        attempt = 0;
                        (routing_state, session_state) =
                            self.apply(routing_state, session_state, RoutingEvent::RoutingFetched);
                    }
                    Err(e) => {
                        eprintln!("routing: fetch failed: {e}");
                        (routing_state, session_state) = self.apply(
                            routing_state,
                            session_state,
                            RoutingEvent::RoutingFetchFailed,
                        );
                        self.sleep_for_attempt(attempt).await;
                        attempt += 1;
                        continue;
                    }
                }
            }

            let active_routing = routing.clone().expect("routing exists");
            (routing_state, session_state) =
                self.apply(routing_state, session_state, RoutingEvent::ConnectStarted);

            let exit = drive_connection(&active_routing, self.transport.as_ref(), |event| {
                (routing_state, session_state) = self.apply(routing_state, session_state, event);
            })
            .await;

            let decision = reconnect_decision(exit.cause);
            if decision == ReconnectDecision::Stop {
                let _ = self.apply(
                    routing_state,
                    session_state,
                    RoutingEvent::RoutingFetchFailed,
                );
                return;
            }
            if decision == ReconnectDecision::RefreshRouting {
                routing = None;
            }
            self.sleep_for_attempt(attempt).await;
            attempt += 1;
        }
    }

    fn apply(
        &self,
        routing_state: RoutingState,
        session_state: SessionState,
        event: RoutingEvent,
    ) -> (RoutingState, SessionState) {
        let next = transition(routing_state, session_state, event);
        self.observer.observe(next.0, next.1);
        next
    }

    async fn sleep_for_attempt(&self, attempt: u32) {
        let base = backoff_delay(attempt);
        tokio::time::sleep(base + self.jitter.jitter(base)).await;
    }
}

struct ConnectionExit {
    cause: ReconnectCause,
}

async fn drive_connection(
    routing: &Routing,
    transport: &dyn WsTransport,
    mut observe_event: impl FnMut(RoutingEvent),
) -> ConnectionExit {
    let mut connection = match transport.connect(&routing.ws_url).await {
        Ok(connection) => connection,
        Err(e) => {
            eprintln!("routing: websocket connect failed: {e}");
            observe_event(RoutingEvent::TransportDropped);
            return ConnectionExit {
                cause: ReconnectCause::TransportDropped,
            };
        }
    };

    let connect = serde_json::json!({
        "type": "connect",
        "auth_token": routing.runtime_jwt,
        "client_kind": CLIENT_KIND,
        "client_version": CLIENT_VERSION,
    });
    if let Err(e) = connection.send_text(connect.to_string()).await {
        eprintln!("routing: websocket connect frame failed: {e}");
        observe_event(RoutingEvent::TransportDropped);
        return ConnectionExit {
            cause: ReconnectCause::TransportDropped,
        };
    }

    loop {
        let next = match connection.next_text().await {
            Ok(Some(text)) => text,
            Ok(None) => {
                observe_event(RoutingEvent::TransportDropped);
                return ConnectionExit {
                    cause: ReconnectCause::TransportDropped,
                };
            }
            Err(e) => {
                eprintln!("routing: websocket read failed: {e}");
                observe_event(RoutingEvent::TransportDropped);
                return ConnectionExit {
                    cause: ReconnectCause::TransportDropped,
                };
            }
        };

        match serde_json::from_str::<RuntimeHandshakeFrame>(&next) {
            Ok(RuntimeHandshakeFrame::HelloOk { .. }) => {
                observe_event(RoutingEvent::HandshakeAccepted);
            }
            Ok(RuntimeHandshakeFrame::RuntimeError { code, .. }) => {
                observe_event(RoutingEvent::RuntimeRejected(code));
                return ConnectionExit {
                    cause: ReconnectCause::RuntimeError(code),
                };
            }
            Err(e) => {
                eprintln!("routing: ignored malformed runtime frame: {e}");
            }
        }
    }
}

pub fn status_for(routing_state: RoutingState, session_state: SessionState) -> ConnectionStatus {
    ConnectionStatus {
        mood: connection_mood(routing_state, session_state),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::VecDeque;
    use tokio::sync::Mutex as AsyncMutex;
    use wiremock::matchers::{header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    struct StaticJitter;

    impl JitterSource for StaticJitter {
        fn jitter(&self, base: Duration) -> Duration {
            let _ = base;
            Duration::ZERO
        }
    }

    #[tokio::test]
    async fn routing_fetcher_parses_get_agent_response() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/agent"))
            .and(header("authorization", "Bearer login-token"))
            .and(header("x-client-kind", "desktop"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "agent_instance_id": "agent_1",
                "ws_url": "wss://runtime.example/ws",
                "runtime_jwt": "runtime-token"
            })))
            .mount(&server)
            .await;

        let fetcher =
            RoutingFetcher::new(Url::parse(&server.uri()).unwrap(), reqwest::Client::new());
        let routing = fetcher.fetch("login-token").await.expect("routing");

        assert_eq!(routing.agent_instance_id, "agent_1");
        assert_eq!(routing.ws_url.as_str(), "wss://runtime.example/ws");
        assert_eq!(routing.runtime_jwt, "runtime-token");
    }

    #[tokio::test]
    async fn routing_fetcher_surfaces_unauthorized_as_typed_status() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/agent"))
            .respond_with(ResponseTemplate::new(401))
            .mount(&server)
            .await;
        let fetcher =
            RoutingFetcher::new(Url::parse(&server.uri()).unwrap(), reqwest::Client::new());

        let err = fetcher.fetch("bad-token").await.expect_err("401");
        assert!(matches!(err, RoutingFetchError::Status(401)), "{err:?}");
    }

    #[tokio::test]
    async fn routing_fetcher_rejects_malformed_body() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/agent"))
            .respond_with(ResponseTemplate::new(200).set_body_string("{}"))
            .mount(&server)
            .await;
        let fetcher =
            RoutingFetcher::new(Url::parse(&server.uri()).unwrap(), reqwest::Client::new());

        let err = fetcher.fetch("token").await.expect_err("malformed");
        assert!(matches!(err, RoutingFetchError::Malformed(_)), "{err:?}");
    }

    #[derive(Default)]
    struct FakeTransport {
        connections: AsyncMutex<VecDeque<FakeConnection>>,
        sent: Arc<AsyncMutex<Vec<String>>>,
    }

    impl FakeTransport {
        fn with_connection(connection: FakeConnection) -> Self {
            let mut connections = VecDeque::new();
            connections.push_back(connection);
            Self {
                connections: AsyncMutex::new(connections),
                sent: Arc::new(AsyncMutex::new(Vec::new())),
            }
        }
    }

    #[async_trait]
    impl WsTransport for FakeTransport {
        async fn connect(&self, url: &Url) -> Result<Box<dyn WsConnection>, WsTransportError> {
            let _ = url;
            let mut connection = self
                .connections
                .lock()
                .await
                .pop_front()
                .expect("fake connection");
            connection.sent = self.sent.clone();
            Ok(Box::new(connection))
        }
    }

    struct FakeConnection {
        frames: VecDeque<String>,
        sent: Arc<AsyncMutex<Vec<String>>>,
    }

    impl FakeConnection {
        fn with_frames(frames: impl IntoIterator<Item = serde_json::Value>) -> Self {
            Self {
                frames: frames.into_iter().map(|frame| frame.to_string()).collect(),
                sent: Arc::new(AsyncMutex::new(Vec::new())),
            }
        }
    }

    #[async_trait]
    impl WsConnection for FakeConnection {
        async fn send_text(&mut self, text: String) -> Result<(), WsTransportError> {
            self.sent.lock().await.push(text);
            Ok(())
        }

        async fn next_text(&mut self) -> Result<Option<String>, WsTransportError> {
            Ok(self.frames.pop_front())
        }
    }

    fn sample_routing() -> Routing {
        Routing {
            ws_url: Url::parse("wss://runtime.example/ws").unwrap(),
            runtime_jwt: "runtime-token".to_string(),
            agent_instance_id: "agent_1".to_string(),
        }
    }

    #[tokio::test]
    async fn websocket_connect_sends_protocol_connect_frame() {
        let transport =
            FakeTransport::with_connection(FakeConnection::with_frames([serde_json::json!({
                "type": "hello_ok",
                "session_snapshot": { "messages": [], "before_cursor": null }
            })]));
        let mut events = Vec::new();

        let exit =
            drive_connection(&sample_routing(), &transport, |event| events.push(event)).await;

        let sent = transport.sent.lock().await;
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&sent[0]).unwrap(),
            serde_json::json!({
                "type": "connect",
                "auth_token": "runtime-token",
                "client_kind": "desktop",
                "client_version": CLIENT_VERSION
            })
        );
        assert!(events.contains(&RoutingEvent::HandshakeAccepted));
        assert_eq!(exit.cause, ReconnectCause::TransportDropped);
    }

    #[tokio::test]
    async fn runtime_auth_failure_requests_routing_refresh() {
        let transport =
            FakeTransport::with_connection(FakeConnection::with_frames([serde_json::json!({
                "type": "runtime_error",
                "code": "auth_failed",
                "message": "expired"
            })]));
        let mut events = Vec::new();

        let exit =
            drive_connection(&sample_routing(), &transport, |event| events.push(event)).await;

        assert_eq!(
            events,
            vec![RoutingEvent::RuntimeRejected(
                crate::domains::routing::types::RuntimeErrorCode::AuthFailed,
            )]
        );
        assert_eq!(
            reconnect_decision(exit.cause),
            ReconnectDecision::RefreshRouting
        );
    }

    #[test]
    fn status_projects_plain_english_mood() {
        assert_eq!(
            status_for(RoutingState::RoutingReady, SessionState::Connected).mood,
            crate::domains::routing::types::ConnectionMood::Connected
        );
        assert_eq!(
            status_for(RoutingState::RoutingError, SessionState::Disconnected).mood,
            crate::domains::routing::types::ConnectionMood::NeedsAttention
        );
    }

    #[test]
    fn static_jitter_is_available_for_paused_time_tests() {
        assert_eq!(StaticJitter.jitter(Duration::from_secs(1)), Duration::ZERO);
    }
}
