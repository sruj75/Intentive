# Drop failed snapshot pushes in v1

When snapshot delivery to the Agent Runtime fails (network down, VM unavailable, timeout), Intentive discards the snapshot and continues. No retry, no local queue.

Persist-and-retry (store failed snapshots to disk, replay when connectivity restores) is the correct long-term behavior but adds meaningful complexity for a v1 infrastructure build. Acceptable data loss during outages is a deliberate v1 trade-off.

## Consequences

- No retry logic needed in v1 — fire and forget
- Snapshots produced during internet outages or GCP downtime are permanently lost
- Future upgrade path: persist failed snapshots to a local queue (SQLite table), replay on reconnect
