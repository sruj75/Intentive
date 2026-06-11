use std::sync::Arc;

use crate::domains::routing::runtime::WsSession;
use crate::domains::routing::types::ConnectionStatus;

#[tauri::command]
pub async fn set_login_token(
    session: tauri::State<'_, Arc<WsSession>>,
    token: String,
) -> Result<(), String> {
    let token = token.trim().to_string();
    if token.is_empty() {
        return Err("login token must not be empty".to_string());
    }
    session.inner().set_login_token(token).await;
    Ok(())
}

#[tauri::command]
pub async fn clear_login_token(session: tauri::State<'_, Arc<WsSession>>) -> Result<(), String> {
    session.inner().clear_login_token().await;
    Ok(())
}

/// Replays the current connection mood so a freshly-mounted surface (the
/// Settings window reloads when opened) reflects transitions that already
/// happened, rather than only future `routing:status` events.
#[tauri::command]
pub async fn get_connection_status(
    session: tauri::State<'_, Arc<WsSession>>,
) -> Result<ConnectionStatus, String> {
    Ok(session.inner().current_status())
}
