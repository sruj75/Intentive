use std::sync::Arc;

use crate::domains::routing::runtime::WsSession;

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
