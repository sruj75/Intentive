use super::*;
use std::sync::Mutex;

#[tokio::test]
async fn forward_progress_emits_each_event_in_order_until_sender_drops() {
    let (tx, rx) = mpsc::channel::<PullProgress>(8);
    let captured = Arc::new(Mutex::new(Vec::<PullProgress>::new()));
    let captured_clone = captured.clone();

    let forwarder = tokio::spawn(async move {
        forward_progress(rx, move |event| {
            captured_clone.lock().unwrap().push(event);
        })
        .await;
    });

    tx.send(PullProgress {
        percent: 25,
        status: "pulling".into(),
    })
    .await
    .unwrap();
    tx.send(PullProgress {
        percent: 100,
        status: "success".into(),
    })
    .await
    .unwrap();
    drop(tx);

    forwarder.await.unwrap();

    let events = captured.lock().unwrap().clone();
    assert_eq!(events.len(), 2);
    assert_eq!(events[0].percent, 25);
    assert_eq!(events[0].status, "pulling");
    assert_eq!(events[1].percent, 100);
    assert_eq!(events[1].status, "success");
}

#[tokio::test]
async fn forward_progress_returns_immediately_when_sender_already_dropped() {
    let (tx, rx) = mpsc::channel::<PullProgress>(8);
    drop(tx);
    forward_progress(rx, |_| panic!("no events expected")).await;
}
