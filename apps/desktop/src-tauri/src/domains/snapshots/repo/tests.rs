use super::*;
use crate::domains::snapshots::types::ContextSnapshot;
use chrono::{DateTime, Duration as ChronoDuration, Utc};
use std::path::PathBuf;
use tempfile::TempDir;
use uuid::Uuid;

async fn in_memory_store() -> SnapshotStore {
    // sqlite::memory: gives each store its own private DB that vanishes on drop.
    // Tests run in parallel without sharing state.
    SnapshotStore::new(&PathBuf::from(":memory:"))
        .await
        .expect("in-memory store should initialise")
}

fn sample_snapshot() -> ContextSnapshot {
    sample_at(Utc::now())
}

fn sample_at(captured_at: DateTime<Utc>) -> ContextSnapshot {
    ContextSnapshot {
        snapshot_id: Uuid::new_v4(),
        captured_at,
        period_start: captured_at - ChronoDuration::minutes(10),
        period_end: captured_at,
        summary: "user reviewed a PR".to_string(),
    }
}

#[tokio::test]
async fn new_creates_empty_store() {
    let store = in_memory_store().await;
    let rows = store.list_recent(10).await.expect("list should succeed");
    assert!(rows.is_empty(), "fresh store should have no rows");
}

#[tokio::test]
async fn insert_persists_snapshot_with_null_pushed_at() {
    let store = in_memory_store().await;
    let snap = sample_snapshot();
    store.insert(&snap).await.expect("insert should succeed");

    let rows = store.list_recent(10).await.expect("list should succeed");
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].snapshot_id, snap.snapshot_id);
    assert!(
        rows[0].pushed_at.is_none(),
        "freshly inserted row must leave pushed_at null"
    );
}

#[tokio::test]
async fn insert_round_trips_all_five_fields_exactly() {
    let store = in_memory_store().await;
    let snap = sample_snapshot();
    store.insert(&snap).await.expect("insert should succeed");

    let rows = store.list_recent(10).await.expect("list should succeed");
    let row = &rows[0];
    assert_eq!(row.snapshot_id, snap.snapshot_id);
    assert_eq!(row.captured_at, snap.captured_at);
    assert_eq!(row.period_start, snap.period_start);
    assert_eq!(row.period_end, snap.period_end);
    assert_eq!(row.summary, snap.summary);
}

#[tokio::test]
async fn mark_pushed_stamps_timestamp_without_mutating_other_fields() {
    let store = in_memory_store().await;
    let snap = sample_snapshot();
    store.insert(&snap).await.expect("insert should succeed");

    let before = Utc::now();
    store.mark_pushed(snap.snapshot_id).await.expect("mark should succeed");
    let after = Utc::now();

    let rows = store.list_recent(10).await.expect("list should succeed");
    let row = &rows[0];
    let pushed = row.pushed_at.expect("pushed_at should be set after mark");
    assert!(pushed >= before && pushed <= after, "pushed_at should be ~now");

    // The five core fields must be byte-identical to the input.
    assert_eq!(row.snapshot_id, snap.snapshot_id);
    assert_eq!(row.captured_at, snap.captured_at);
    assert_eq!(row.period_start, snap.period_start);
    assert_eq!(row.period_end, snap.period_end);
    assert_eq!(row.summary, snap.summary);
}

#[tokio::test]
async fn mark_pushed_returns_not_found_for_unknown_id() {
    let store = in_memory_store().await;
    let unknown = Uuid::new_v4();
    let err = store
        .mark_pushed(unknown)
        .await
        .expect_err("mark on unknown id should fail");
    assert!(
        matches!(err, SnapshotStoreError::NotFound(id) if id == unknown),
        "got {err:?}"
    );
}

#[tokio::test]
async fn mark_pushed_is_idempotent_for_already_pushed_row() {
    let store = in_memory_store().await;
    let snap = sample_snapshot();
    store.insert(&snap).await.expect("insert should succeed");

    store.mark_pushed(snap.snapshot_id).await.expect("first mark");
    let first_pushed = store.list_recent(10).await.unwrap()[0]
        .pushed_at
        .expect("first mark sets pushed_at");

    // Second mark must succeed (no error), not regress the timestamp.
    store.mark_pushed(snap.snapshot_id).await.expect("second mark");
    let second_pushed = store.list_recent(10).await.unwrap()[0]
        .pushed_at
        .expect("second mark keeps pushed_at set");

    assert!(
        second_pushed >= first_pushed,
        "re-mark must not move pushed_at backwards (first={first_pushed}, second={second_pushed})"
    );
}

#[tokio::test]
async fn insert_rejects_duplicate_id() {
    let store = in_memory_store().await;
    let snap = sample_snapshot();
    store.insert(&snap).await.expect("first insert");
    let err = store
        .insert(&snap)
        .await
        .expect_err("duplicate id should fail");
    assert!(matches!(err, SnapshotStoreError::Query(_)), "got {err:?}");
}

#[tokio::test]
async fn launch_purges_rows_older_than_seven_days() {
    let dir = TempDir::new().expect("tempdir");
    let path = dir.path().join("intentive.db");

    let old = sample_at(Utc::now() - ChronoDuration::days(8));
    let recent = sample_at(Utc::now() - ChronoDuration::days(1));

    {
        let store = SnapshotStore::new(&path).await.expect("open store");
        store.insert(&old).await.expect("insert old");
        store.insert(&recent).await.expect("insert recent");
    }
    // Reopen — purge runs in new()
    let store = SnapshotStore::new(&path).await.expect("reopen store");
    let rows = store.list_recent(10).await.expect("list");

    assert_eq!(rows.len(), 1, "8-day-old row should have been purged");
    assert_eq!(rows[0].snapshot_id, recent.snapshot_id);
}

#[tokio::test]
async fn launch_keeps_rows_exactly_seven_days_old() {
    let dir = TempDir::new().expect("tempdir");
    let path = dir.path().join("intentive.db");

    // Just inside the 7-day window (purge predicate is `<`, so boundary survives).
    let edge = sample_at(Utc::now() - ChronoDuration::days(7) + ChronoDuration::minutes(1));

    {
        let store = SnapshotStore::new(&path).await.expect("open store");
        store.insert(&edge).await.expect("insert edge");
    }
    let store = SnapshotStore::new(&path).await.expect("reopen store");
    let rows = store.list_recent(10).await.expect("list");

    assert_eq!(rows.len(), 1, "row at 7 days minus 1 minute must survive");
    assert_eq!(rows[0].snapshot_id, edge.snapshot_id);
}

#[tokio::test]
async fn list_recent_returns_newest_first_and_respects_limit() {
    let store = in_memory_store().await;
    let now = Utc::now();
    let oldest = sample_at(now - ChronoDuration::minutes(30));
    let middle = sample_at(now - ChronoDuration::minutes(20));
    let newest = sample_at(now - ChronoDuration::minutes(10));

    store.insert(&oldest).await.unwrap();
    store.insert(&middle).await.unwrap();
    store.insert(&newest).await.unwrap();

    let rows = store.list_recent(2).await.expect("list");
    assert_eq!(rows.len(), 2, "limit should cap the result");
    assert_eq!(rows[0].snapshot_id, newest.snapshot_id, "first row should be newest");
    assert_eq!(rows[1].snapshot_id, middle.snapshot_id, "second row should be the next newest");
}
