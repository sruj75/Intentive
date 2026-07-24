CREATE TABLE IF NOT EXISTS snapshots (
    id           TEXT PRIMARY KEY,
    captured_at  TEXT NOT NULL,
    period_start TEXT NOT NULL,
    period_end   TEXT NOT NULL,
    summary      TEXT NOT NULL,
    pushed_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_snapshots_captured_at ON snapshots(captured_at);
