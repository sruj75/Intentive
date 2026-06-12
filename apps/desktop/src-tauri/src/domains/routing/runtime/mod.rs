use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use tokio::sync::{mpsc, Mutex};
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
use crate::providers::permissions::CapturePermissions;

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
    permissions: Option<Arc<dyn CapturePermissions>>,
}

impl RoutingFetcher {
    pub fn new(base_url: Url, http: reqwest::Client) -> Self {
        Self {
            base_url,
            http,
            permissions: None,
        }
    }

    pub fn with_permissions(
        base_url: Url,
        http: reqwest::Client,
        permissions: Arc<dyn CapturePermissions>,
    ) -> Self {
        Self {
            base_url,
            http,
            permissions: Some(permissions),
        }
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
            .header(
                "x-capture-permission-granted",
                self.permissions
                    .as_ref()
                    .map(|permissions| permissions.snapshot().screen_recording)
                    .unwrap_or(false)
                    .to_string(),
            )
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

/// Outcome of an outbound [`WsSession::try_emit`]. Routing owns this rather than
/// reusing the snapshots `PushError` (a cross-domain runtime type the layer rule
/// forbids referencing here); the `lib.rs` `AgentSink` bridge maps it.
#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum TryEmitError {
    #[error("protocol websocket session is not connected")]
    NotConnected,
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
    // Outbound seam for Protocol event emission (#34). `Some` only while a
    // connection is live; the connection loop drains the matching receiver via
    // `tokio::select!`. Dormant in #31 — `lib.rs` installs `NoopAgentSink`, so
    // nothing pushes here yet; #34 flips to the live `AgentSink` bridge.
    outbound: Mutex<Option<mpsc::UnboundedSender<String>>>,
    // Last observed `(RoutingState, SessionState)`, kept so the webview can
    // replay current status on mount. The Settings window reloads when opened,
    // so a UI that only listened for future `routing:status` events would miss
    // every transition that already happened. A `std::sync` mutex (not the
    // async one) so the synchronous `apply` transition path can record without
    // awaiting; the critical section is a single `Copy` write.
    last_status: std::sync::Mutex<(RoutingState, SessionState)>,
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
            outbound: Mutex::new(None),
            last_status: std::sync::Mutex::new((
                RoutingState::SignedOut,
                SessionState::Disconnected,
            )),
        })
    }

    /// Push a pre-serialized Protocol frame over the live connection. Returns
    /// [`TryEmitError::NotConnected`] when no connection is up. The frame is
    /// handed to the connection loop, which sends it on the socket; on send
    /// failure that loop drops to the existing reconnect path. This is the
    /// dormant join for #34 — nothing calls it while `NoopAgentSink` is
    /// installed.
    pub async fn try_emit(&self, frame: String) -> Result<(), TryEmitError> {
        let guard = self.outbound.lock().await;
        let Some(sender) = guard.as_ref() else {
            return Err(TryEmitError::NotConnected);
        };
        sender.send(frame).map_err(|_| TryEmitError::NotConnected)
    }

    /// Test-only seam: install a live outbound channel without standing up a
    /// real connection, returning the receiver. Lets the cross-domain
    /// `WsSessionAgentSink` bridge test (in `lib.rs`) assert that framed events
    /// reach the socket. Production code only ever populates `outbound` from the
    /// connection loop in `run`.
    #[cfg(test)]
    pub(crate) async fn install_test_outbound(&self) -> mpsc::UnboundedReceiver<String> {
        let (tx, rx) = mpsc::unbounded_channel();
        *self.outbound.lock().await = Some(tx);
        rx
    }

    /// Current plain-English status, replayed on demand (e.g. when the Settings
    /// window mounts). Reflects the most recent observed transition.
    pub fn current_status(&self) -> ConnectionStatus {
        let (routing_state, session_state) =
            *self.last_status.lock().expect("status mutex poisoned");
        status_for(routing_state, session_state)
    }

    /// Record a transition as the latest status and forward it to the observer.
    /// Single sink for both so `last_status` can never drift from what the UI
    /// was told.
    fn note(&self, routing_state: RoutingState, session_state: SessionState) {
        *self.last_status.lock().expect("status mutex poisoned") = (routing_state, session_state);
        self.observer.observe(routing_state, session_state);
    }

    pub async fn set_login_token(self: &Arc<Self>, token: String) {
        // The webview re-syncs the same token on mount, on focus, and every few
        // seconds. Restarting on an unchanged token would tear down a live
        // session and revive one that stopped on a fatal handshake error
        // (`protocol_unsupported`/`invalid_connect`). Only a genuinely new token
        // restarts the loop; an unchanged token is a no-op.
        {
            let current = self.login_token.lock().await;
            if current.as_deref() == Some(token.as_str()) {
                return;
            }
        }
        self.stop_task().await;
        *self.login_token.lock().await = Some(token.clone());
        self.note(RoutingState::SignedIn, SessionState::Disconnected);
        let session = self.clone();
        let task = tokio::spawn(async move { session.run(token).await });
        *self.task.lock().await = Some(task);
    }

    pub async fn clear_login_token(self: &Arc<Self>) {
        *self.login_token.lock().await = None;
        self.stop_task().await;
        self.note(RoutingState::SignedOut, SessionState::Disconnected);
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

            // Register the outbound seam for the lifetime of this connection so
            // `try_emit` has somewhere to push; clear it the moment the
            // connection drops.
            let (outbound_tx, outbound_rx) = mpsc::unbounded_channel();
            *self.outbound.lock().await = Some(outbound_tx);
            let exit = drive_connection(
                &active_routing,
                self.transport.as_ref(),
                outbound_rx,
                |event| {
                    (routing_state, session_state) =
                        self.apply(routing_state, session_state, event);
                },
            )
            .await;
            *self.outbound.lock().await = None;

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
        self.note(next.0, next.1);
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
    mut outbound_rx: mpsc::UnboundedReceiver<String>,
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

    // Once the channel's sole sender (held in `WsSession.outbound`) is cleared
    // the receiver closes; stop selecting on it to avoid a busy loop, while the
    // inbound read keeps driving the connection.
    let mut outbound_open = true;
    loop {
        let next = tokio::select! {
            inbound = connection.next_text() => match inbound {
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
            },
            outbound = outbound_rx.recv(), if outbound_open => {
                match outbound {
                    Some(frame) => {
                        if let Err(e) = connection.send_text(frame).await {
                            eprintln!("routing: outbound send failed: {e}");
                            observe_event(RoutingEvent::TransportDropped);
                            return ConnectionExit {
                                cause: ReconnectCause::TransportDropped,
                            };
                        }
                        continue;
                    }
                    None => {
                        outbound_open = false;
                        continue;
                    }
                }
            },
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
    async fn routing_fetcher_sends_capture_permission_header() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/agent"))
            .and(header("x-capture-permission-granted", "true"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "agent_instance_id": "agent_1",
                "ws_url": "wss://runtime.example/ws",
                "runtime_jwt": "runtime-token"
            })))
            .mount(&server)
            .await;

        let permissions = Arc::new(crate::providers::permissions::StubCapturePermissions::new(
            crate::providers::permissions::PermissionSet {
                screen_recording: true,
                microphone: true,
                accessibility: true,
            },
        ));
        let fetcher = RoutingFetcher::with_permissions(
            Url::parse(&server.uri()).unwrap(),
            reqwest::Client::new(),
            permissions,
        );

        fetcher.fetch("login-token").await.expect("routing");
    }

    #[tokio::test]
    async fn routing_fetcher_reports_screen_recording_grant_even_when_other_capture_grants_are_missing(
    ) {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/agent"))
            .and(header("x-capture-permission-granted", "true"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "agent_instance_id": "agent_1",
                "ws_url": "wss://runtime.example/ws",
                "runtime_jwt": "runtime-token"
            })))
            .mount(&server)
            .await;

        let permissions = Arc::new(crate::providers::permissions::StubCapturePermissions::new(
            crate::providers::permissions::PermissionSet {
                screen_recording: true,
                microphone: false,
                accessibility: false,
            },
        ));
        let fetcher = RoutingFetcher::with_permissions(
            Url::parse(&server.uri()).unwrap(),
            reqwest::Client::new(),
            permissions,
        );

        fetcher.fetch("login-token").await.expect("routing");
    }

    #[tokio::test]
    async fn routing_fetcher_reports_missing_screen_recording_even_when_other_capture_grants_exist()
    {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/agent"))
            .and(header("x-capture-permission-granted", "false"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "agent_instance_id": "agent_1",
                "ws_url": "wss://runtime.example/ws",
                "runtime_jwt": "runtime-token"
            })))
            .mount(&server)
            .await;

        let permissions = Arc::new(crate::providers::permissions::StubCapturePermissions::new(
            crate::providers::permissions::PermissionSet {
                screen_recording: false,
                microphone: true,
                accessibility: true,
            },
        ));
        let fetcher = RoutingFetcher::with_permissions(
            Url::parse(&server.uri()).unwrap(),
            reqwest::Client::new(),
            permissions,
        );

        fetcher.fetch("login-token").await.expect("routing");
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

        let (_outbound_tx, outbound_rx) = mpsc::unbounded_channel();
        let exit = drive_connection(&sample_routing(), &transport, outbound_rx, |event| {
            events.push(event)
        })
        .await;

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

        let (_outbound_tx, outbound_rx) = mpsc::unbounded_channel();
        let exit = drive_connection(&sample_routing(), &transport, outbound_rx, |event| {
            events.push(event)
        })
        .await;

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

    struct CountingObserver {
        states: std::sync::Mutex<Vec<(RoutingState, SessionState)>>,
    }

    impl CountingObserver {
        fn new() -> Self {
            Self {
                states: std::sync::Mutex::new(Vec::new()),
            }
        }

        fn count(&self, target: (RoutingState, SessionState)) -> usize {
            self.states
                .lock()
                .unwrap()
                .iter()
                .filter(|state| **state == target)
                .count()
        }
    }

    impl RoutingObserver for CountingObserver {
        fn observe(&self, routing_state: RoutingState, session_state: SessionState) {
            self.states
                .lock()
                .unwrap()
                .push((routing_state, session_state));
        }
    }

    /// Counts fetches, then parks forever so the session stays "alive" at the
    /// fetch step — letting the test observe whether a second `set_login_token`
    /// restarted the loop.
    struct ParkingRoutingSource {
        calls: Arc<std::sync::atomic::AtomicUsize>,
        reached: Arc<tokio::sync::Notify>,
    }

    #[async_trait]
    impl RoutingSource for ParkingRoutingSource {
        async fn fetch(&self, _login_token: &str) -> Result<Routing, RoutingFetchError> {
            self.calls.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            self.reached.notify_one();
            std::future::pending::<()>().await;
            unreachable!("parked fetch never resolves")
        }
    }

    #[tokio::test]
    async fn set_login_token_ignores_an_unchanged_token() {
        use std::sync::atomic::Ordering;

        let calls = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let reached = Arc::new(tokio::sync::Notify::new());
        let observer = Arc::new(CountingObserver::new());
        let session = WsSession::new(
            Arc::new(ParkingRoutingSource {
                calls: calls.clone(),
                reached: reached.clone(),
            }),
            Arc::new(FakeTransport::default()),
            observer.clone(),
            Arc::new(StaticJitter),
        );

        session.set_login_token("token".to_string()).await;
        reached.notified().await; // first run loop has reached the parked fetch
        assert_eq!(calls.load(Ordering::SeqCst), 1);

        // Re-syncing the identical token must not abort and respawn the loop.
        session.set_login_token("token".to_string()).await;
        tokio::task::yield_now().await;

        assert_eq!(
            calls.load(Ordering::SeqCst),
            1,
            "unchanged token triggered a second fetch (session was restarted)"
        );
        assert_eq!(
            observer.count((RoutingState::SignedIn, SessionState::Disconnected)),
            1,
            "unchanged token re-emitted the signed-in/disconnected transition"
        );
    }

    #[tokio::test]
    async fn current_status_replays_the_last_observed_mood() {
        use crate::domains::routing::types::ConnectionMood;

        let session = WsSession::new(
            Arc::new(ParkingRoutingSource {
                calls: Arc::new(std::sync::atomic::AtomicUsize::new(0)),
                reached: Arc::new(tokio::sync::Notify::new()),
            }),
            Arc::new(FakeTransport::default()),
            Arc::new(NoopRoutingObserver),
            Arc::new(StaticJitter),
        );

        // Before any sign-in, the replayed status is the signed-out default.
        assert_eq!(session.current_status().mood, ConnectionMood::SignedOut);

        // Signing in records signed-in/disconnected (→ "Connecting") before the
        // parked fetch can transition further.
        session.set_login_token("token".to_string()).await;
        assert_eq!(session.current_status().mood, ConnectionMood::Connecting);

        // Signing out returns to the signed-out mood.
        session.clear_login_token().await;
        assert_eq!(session.current_status().mood, ConnectionMood::SignedOut);
    }

    struct StaticRoutingSource;

    #[async_trait]
    impl RoutingSource for StaticRoutingSource {
        async fn fetch(&self, _login_token: &str) -> Result<Routing, RoutingFetchError> {
            Ok(sample_routing())
        }
    }

    /// A connection whose inbound read parks until signalled, so the outbound
    /// `select!` arm fires deterministically. Records everything sent.
    struct OutboundProbeConnection {
        sent: Arc<AsyncMutex<Vec<String>>>,
        drop_signal: Arc<tokio::sync::Notify>,
    }

    #[async_trait]
    impl WsConnection for OutboundProbeConnection {
        async fn send_text(&mut self, text: String) -> Result<(), WsTransportError> {
            self.sent.lock().await.push(text);
            Ok(())
        }

        async fn next_text(&mut self) -> Result<Option<String>, WsTransportError> {
            self.drop_signal.notified().await;
            Ok(None)
        }
    }

    struct OutboundProbeTransport {
        sent: Arc<AsyncMutex<Vec<String>>>,
        drop_signal: Arc<tokio::sync::Notify>,
    }

    #[async_trait]
    impl WsTransport for OutboundProbeTransport {
        async fn connect(&self, _url: &Url) -> Result<Box<dyn WsConnection>, WsTransportError> {
            Ok(Box::new(OutboundProbeConnection {
                sent: self.sent.clone(),
                drop_signal: self.drop_signal.clone(),
            }))
        }
    }

    /// Spin (yielding) until `predicate` holds or a generous bound elapses.
    async fn wait_until(predicate: impl Fn() -> bool) {
        for _ in 0..2_000 {
            if predicate() {
                return;
            }
            tokio::task::yield_now().await;
        }
        panic!("condition never held");
    }

    #[tokio::test]
    async fn try_emit_pushes_a_frame_through_the_live_connection() {
        let sent = Arc::new(AsyncMutex::new(Vec::new()));
        let drop_signal = Arc::new(tokio::sync::Notify::new());
        let session = WsSession::new(
            Arc::new(StaticRoutingSource),
            Arc::new(OutboundProbeTransport {
                sent: sent.clone(),
                drop_signal: drop_signal.clone(),
            }),
            Arc::new(NoopRoutingObserver),
            Arc::new(StaticJitter),
        );

        // No live connection yet → the seam reports NotConnected.
        assert_eq!(
            session.try_emit("early".to_string()).await,
            Err(TryEmitError::NotConnected)
        );

        session.set_login_token("token".to_string()).await;
        // The connect frame lands once the connection is live and the outbound
        // sender is registered.
        let sent_for_wait = sent.clone();
        wait_until(|| sent_for_wait.try_lock().map(|s| !s.is_empty()).unwrap_or(false)).await;

        let frame = r#"{"type":"context_snapshot"}"#.to_string();
        session
            .try_emit(frame.clone())
            .await
            .expect("a live connection accepts the frame");

        let sent_for_wait = sent.clone();
        wait_until(|| sent_for_wait.try_lock().map(|s| s.len() >= 2).unwrap_or(false)).await;
        assert_eq!(sent.lock().await[1], frame, "the frame was sent on the socket");

        // Dropping the inbound read drives the existing reconnect path, which
        // clears the outbound seam — a fresh try_emit reports NotConnected
        // until the connection comes back. `notify_one` stores a permit so the
        // wake can't be lost to a scheduling race.
        drop_signal.notify_one();
        let mut cleared = false;
        for _ in 0..2_000 {
            if session.try_emit("probe".to_string()).await == Err(TryEmitError::NotConnected) {
                cleared = true;
                break;
            }
            tokio::task::yield_now().await;
        }
        assert!(cleared, "the outbound seam clears when the connection drops");
    }
}
