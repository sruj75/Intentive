use super::*;
use tokio::net::TcpListener;

#[tokio::test]
async fn returns_primary_when_probe_reports_both_free() {
    let port = resolve_port_with(44380, 44382, |_| async { false })
        .await
        .expect("both free → primary");
    assert_eq!(port, 44380);
}

#[tokio::test]
async fn returns_fallback_when_primary_reports_in_use() {
    let port = resolve_port_with(44380, 44382, |p| async move { p == 44380 })
        .await
        .expect("primary in use, fallback free → fallback");
    assert_eq!(port, 44382);
}

#[tokio::test]
async fn errors_when_probe_reports_both_in_use() {
    let result = resolve_port_with(44380, 44382, |_| async { true }).await;
    let err = result.expect_err("both in use → error");
    assert_eq!(err.primary, 44380);
    assert_eq!(err.fallback, 44382);
}

#[tokio::test]
async fn real_probe_detects_a_held_tcp_listener_as_in_use() {
    // Bind a real listener on an OS-assigned port. resolve_port must see it as
    // occupied and pick the fallback (which we leave free).
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let occupied = listener.local_addr().unwrap().port();

    // Bind+drop a second listener purely to discover a port that was free
    // moments ago. The race window is small enough to be acceptable for tests;
    // if it ever flakes we tighten this.
    let probe_listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let probably_free = probe_listener.local_addr().unwrap().port();
    drop(probe_listener);

    let port = resolve_port(occupied, probably_free)
        .await
        .expect("primary occupied, fallback free → fallback");
    assert_eq!(port, probably_free);
}
