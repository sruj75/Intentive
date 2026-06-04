//! Snapshot Store — the local SQLite log of every Context Snapshot produced.
//!
//! This module is the durable record described in ADR-0007. Each row is a
//! sanitized `ContextSnapshot` (`snapshot_id`, captured_at, period_start,
//! period_end, summary) plus a nullable `pushed_at` recording successful
//! delivery to the runtime boundary.
//!
//! Privacy boundary (Issue #6 acceptance criterion): `insert` accepts only
//! `&ContextSnapshot`. No raw ScreenPipe data (OCR, audio, window names) has a
//! representation in this module's API. The structural type contract IS the
//! privacy boundary — there is no `insert_raw`, and adding one would violate
//! ADR-0007. The runtime guardrail lives at the LLM summarization prompt.
//!
//! All `sqlx::Error` values are wrapped at the module boundary into the
//! `SnapshotStoreError` enum so consumers (Context Heartbeat, future
//! transparency UI) never need a dependency on sqlx.

use std::path::Path;
use std::str::FromStr;
use std::time::Duration;

use chrono::{DateTime, Duration as ChronoDuration, Utc};
use sqlx::sqlite::{
    SqliteConnectOptions, SqliteJournalMode, SqlitePool, SqlitePoolOptions, SqliteSynchronous,
};
use sqlx::Row;
use uuid::Uuid;

use crate::domains::snapshots::types::ContextSnapshot;

const INSERT_SQL: &str = "INSERT INTO snapshots (id, captured_at, period_start, period_end, summary, pushed_at) VALUES (?, ?, ?, ?, ?, NULL)";
const MARK_PUSHED_SQL: &str = "UPDATE snapshots SET pushed_at = ? WHERE id = ?";
const LIST_RECENT_SQL: &str = "SELECT id, captured_at, period_start, period_end, summary, pushed_at FROM snapshots ORDER BY captured_at DESC LIMIT ?";
const PURGE_SQL: &str = "DELETE FROM snapshots WHERE captured_at < ?";

/// Retention horizon per ADR-0007. Rows with `captured_at` strictly older than
/// `Utc::now() - RETENTION` are purged at construction.
const RETENTION: ChronoDuration = ChronoDuration::days(7);

#[derive(Debug, thiserror::Error)]
pub enum SnapshotStoreError {
    #[error("failed to open snapshot database: {0}")]
    Open(String),
    #[error("failed to apply migrations: {0}")]
    Migrate(String),
    #[error("snapshot query failed: {0}")]
    Query(String),
    #[error("snapshot {0} not found")]
    NotFound(Uuid),
    #[error("stored snapshot row was corrupt: {0}")]
    Corrupt(String),
}

/// A row read back from the store: the five-field Context Snapshot plus a
/// delivery receipt (`pushed_at`).
///
/// Flat shape (six fields, no nested `ContextSnapshot`) matches ScreenPipe's
/// row-type convention. See CONTEXT.md "Implementation Pattern Rule".
#[derive(Debug, Clone)]
pub struct StoredSnapshot {
    pub snapshot_id: Uuid,
    pub captured_at: DateTime<Utc>,
    pub period_start: DateTime<Utc>,
    pub period_end: DateTime<Utc>,
    pub summary: String,
    pub pushed_at: Option<DateTime<Utc>>,
}

pub struct SnapshotStore {
    pool: SqlitePool,
}

impl SnapshotStore {
    /// Open or create the SQLite file at `db_path`, run pending migrations, and
    /// purge rows older than the 7-day retention horizon. Pass
    /// `Path::new(":memory:")` for an ephemeral in-process store (tests).
    pub async fn new(db_path: &Path) -> Result<Self, SnapshotStoreError> {
        let path_str = db_path
            .to_str()
            .ok_or_else(|| SnapshotStoreError::Open("non-UTF8 database path".to_string()))?;

        // `sqlite::memory:` needs the special form; everything else is a file
        // path that may not exist yet.
        let connection_string = if path_str == ":memory:" {
            "sqlite::memory:".to_string()
        } else {
            format!("sqlite://{}", path_str)
        };

        // WAL + Normal synchronous = safe crash recovery with much better concurrent read
        // throughput than the default DELETE journal.
        let options = SqliteConnectOptions::from_str(&connection_string)
            .map_err(|e| SnapshotStoreError::Open(e.to_string()))?
            .create_if_missing(true)
            .journal_mode(SqliteJournalMode::Wal)
            .synchronous(SqliteSynchronous::Normal)
            .busy_timeout(Duration::from_secs(5));

        // One insert per 10-minute heartbeat — single connection is enough and
        // avoids a class of pool-busy failure modes.
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options)
            .await
            .map_err(|e| SnapshotStoreError::Open(e.to_string()))?;

        // sqlx::migrate! embeds ./migrations at compile time and applies pending
        // migrations in version order on startup.
        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .map_err(|e| SnapshotStoreError::Migrate(e.to_string()))?;

        purge_older_than(&pool, RETENTION).await?;

        Ok(Self { pool })
    }

    /// Persist a new Context Snapshot with `pushed_at = NULL`. Re-inserting the
    /// same `id` returns `SnapshotStoreError::Query` (PRIMARY KEY violation).
    pub async fn insert(&self, snapshot: &ContextSnapshot) -> Result<(), SnapshotStoreError> {
        sqlx::query(INSERT_SQL)
            .bind(snapshot.snapshot_id.to_string())
            .bind(snapshot.captured_at.to_rfc3339())
            .bind(snapshot.period_start.to_rfc3339())
            .bind(snapshot.period_end.to_rfc3339())
            .bind(&snapshot.summary)
            .execute(&self.pool)
            .await
            .map(|_| ())
            .map_err(|e| SnapshotStoreError::Query(e.to_string()))
    }

    /// Stamp `pushed_at = now` for the row with `id`. Idempotent on repeat
    /// calls (subsequent marks may advance the timestamp slightly). Returns
    /// `NotFound` when no row exists — most likely because the snapshot was
    /// purged before delivery completed.
    pub async fn mark_pushed(&self, snapshot_id: Uuid) -> Result<(), SnapshotStoreError> {
        let now = Utc::now().to_rfc3339();
        let result = sqlx::query(MARK_PUSHED_SQL)
            .bind(now)
            .bind(snapshot_id.to_string())
            .execute(&self.pool)
            .await
            .map_err(|e| SnapshotStoreError::Query(e.to_string()))?;

        if result.rows_affected() == 0 {
            return Err(SnapshotStoreError::NotFound(snapshot_id));
        }
        Ok(())
    }

    /// Read up to `limit` most-recent rows, newest `captured_at` first.
    /// The transparency UI will consume this; tests use it as their assertion
    /// window.
    pub async fn list_recent(
        &self,
        limit: u32,
    ) -> Result<Vec<StoredSnapshot>, SnapshotStoreError> {
        let rows = sqlx::query(LIST_RECENT_SQL)
            .bind(limit)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| SnapshotStoreError::Query(e.to_string()))?;

        rows.into_iter().map(decode_row).collect()
    }
}

fn decode_row(row: sqlx::sqlite::SqliteRow) -> Result<StoredSnapshot, SnapshotStoreError> {
    let snapshot_id_str: String = row
        .try_get("id")
        .map_err(|e| SnapshotStoreError::Corrupt(format!("id column: {e}")))?;
    let captured_at_str: String = row
        .try_get("captured_at")
        .map_err(|e| SnapshotStoreError::Corrupt(format!("captured_at column: {e}")))?;
    let period_start_str: String = row
        .try_get("period_start")
        .map_err(|e| SnapshotStoreError::Corrupt(format!("period_start column: {e}")))?;
    let period_end_str: String = row
        .try_get("period_end")
        .map_err(|e| SnapshotStoreError::Corrupt(format!("period_end column: {e}")))?;
    let summary: String = row
        .try_get("summary")
        .map_err(|e| SnapshotStoreError::Corrupt(format!("summary column: {e}")))?;
    let pushed_at_str: Option<String> = row
        .try_get("pushed_at")
        .map_err(|e| SnapshotStoreError::Corrupt(format!("pushed_at column: {e}")))?;

    let snapshot_id = Uuid::parse_str(&snapshot_id_str)
        .map_err(|e| SnapshotStoreError::Corrupt(format!("id parse: {e}")))?;
    let captured_at = parse_rfc3339(&captured_at_str, "captured_at")?;
    let period_start = parse_rfc3339(&period_start_str, "period_start")?;
    let period_end = parse_rfc3339(&period_end_str, "period_end")?;
    let pushed_at = pushed_at_str
        .map(|s| parse_rfc3339(&s, "pushed_at"))
        .transpose()?;

    Ok(StoredSnapshot {
        snapshot_id,
        captured_at,
        period_start,
        period_end,
        summary,
        pushed_at,
    })
}

fn parse_rfc3339(value: &str, field: &str) -> Result<DateTime<Utc>, SnapshotStoreError> {
    DateTime::parse_from_rfc3339(value)
        .map(|dt| dt.with_timezone(&Utc))
        .map_err(|e| SnapshotStoreError::Corrupt(format!("{field} parse: {e}")))
}

async fn purge_older_than(
    pool: &SqlitePool,
    horizon: ChronoDuration,
) -> Result<(), SnapshotStoreError> {
    let cutoff = (Utc::now() - horizon).to_rfc3339();
    sqlx::query(PURGE_SQL)
        .bind(cutoff)
        .execute(pool)
        .await
        .map(|_| ())
        .map_err(|e| SnapshotStoreError::Query(e.to_string()))
}

#[cfg(test)]
mod tests;
