export function parsePerceptionLedgerScrubArgs(args) {
  const unknown = args.filter((argument) => argument !== "--apply");
  if (unknown.length > 0) {
    throw new Error(`Unknown argument: ${unknown[0]}`);
  }
  return { apply: args.includes("--apply") };
}

export async function executePerceptionLedgerScrub({ sql, apply, write = () => {} }) {
  const queries = apply
    ? [
        sql`LOCK TABLE agent_runtime.runtime_events IN SHARE ROW EXCLUSIVE MODE`,
        classificationCountsQuery(sql),
        guardedScrubQuery(sql),
      ]
    : [classificationCountsQuery(sql)];

  const results = apply ? await sql.transaction(queries) : [await queries[0]];
  const counts = results[apply ? 1 : 0]?.[0];
  if (!counts) {
    throw new Error("Perception-ledger validation returned no count row");
  }

  const summary = {
    detailed_candidates: Number(counts.detailed_candidates),
    projection_backed: Number(counts.projection_backed),
    expired_exclusions: Number(counts.expired_exclusions),
    tombstone_exclusions: Number(counts.tombstone_exclusions),
    unsafe_missing_projection: Number(counts.unsafe_missing_projection),
  };
  write(JSON.stringify(summary));

  if (summary.unsafe_missing_projection > 0) {
    throw new Error(
      "Refusing to scrub: perception ledger identities without a current projection or explicit expiry/tombstone exclusion were found",
    );
  }

  if (!apply) {
    write("Dry run only. Re-run with --apply after the projection-backed Runtime is healthy.");
    return { summary, scrubbed: 0 };
  }

  const scrubbed = results[2]?.length ?? 0;
  write(JSON.stringify({ scrubbed_perception_payloads: scrubbed }));
  return { summary, scrubbed };
}

export function classificationCountsQuery(db) {
  return db`
    WITH detailed AS (
      SELECT
        event.id,
        event.user_id,
        event.created_at,
        event.payload,
        event.payload->>'event_id' AS event_id,
        EXISTS (
          SELECT 1
          FROM agent_runtime.perception_records AS projection
          WHERE projection.user_id = event.user_id
            AND projection.event_id = event.payload->>'event_id'
        ) AS has_projection,
        (
          event.payload ? 'expires_at'
          AND (event.payload->>'expires_at')::timestamptz <= now()
        ) AS is_expired,
        EXISTS (
          SELECT 1
          FROM agent_runtime.runtime_events AS tombstone
          WHERE tombstone.user_id = event.user_id
            AND tombstone.kind = 'perception_tombstone'
            AND tombstone.ingest_seq > event.ingest_seq
            AND (
              tombstone.payload->>'reason' = 'clear_all'
              OR EXISTS (
                SELECT 1
                FROM jsonb_array_elements_text(
                  coalesce(tombstone.payload->'event_refs', '[]'::jsonb)
                ) AS event_ref(value)
                WHERE event_ref.value = event.payload->>'event_id'
              )
            )
        ) AS is_tombstoned
      FROM agent_runtime.runtime_events AS event
      WHERE event.kind = 'perception_event'
        AND (
          event.payload ? 'summary'
          OR event.payload ? 'signals'
          OR event.payload ? 'embedding_ref'
        )
    )
    SELECT
      count(*) AS detailed_candidates,
      count(*) FILTER (WHERE has_projection) AS projection_backed,
      count(*) FILTER (
        WHERE NOT has_projection AND is_expired
      ) AS expired_exclusions,
      count(*) FILTER (
        WHERE NOT has_projection AND NOT is_expired AND is_tombstoned
      ) AS tombstone_exclusions,
      count(*) FILTER (
        WHERE NOT has_projection AND NOT is_expired AND NOT is_tombstoned
      ) AS unsafe_missing_projection
    FROM detailed
  `;
}

export function guardedScrubQuery(db) {
  return db`
    WITH detailed AS (
      SELECT
        event.id,
        event.user_id,
        event.created_at,
        event.payload,
        EXISTS (
          SELECT 1
          FROM agent_runtime.perception_records AS projection
          WHERE projection.user_id = event.user_id
            AND projection.event_id = event.payload->>'event_id'
        ) AS has_projection,
        (
          event.payload ? 'expires_at'
          AND (event.payload->>'expires_at')::timestamptz <= now()
        ) AS is_expired,
        EXISTS (
          SELECT 1
          FROM agent_runtime.runtime_events AS tombstone
          WHERE tombstone.user_id = event.user_id
            AND tombstone.kind = 'perception_tombstone'
            AND tombstone.ingest_seq > event.ingest_seq
            AND (
              tombstone.payload->>'reason' = 'clear_all'
              OR EXISTS (
                SELECT 1
                FROM jsonb_array_elements_text(
                  coalesce(tombstone.payload->'event_refs', '[]'::jsonb)
                ) AS event_ref(value)
                WHERE event_ref.value = event.payload->>'event_id'
              )
            )
        ) AS is_tombstoned
      FROM agent_runtime.runtime_events AS event
      WHERE event.kind = 'perception_event'
        AND (
          event.payload ? 'summary'
          OR event.payload ? 'signals'
          OR event.payload ? 'embedding_ref'
        )
    ),
    invalid AS (
      SELECT id
      FROM detailed
      WHERE NOT has_projection
        AND NOT is_expired
        AND NOT is_tombstoned
    )
    UPDATE agent_runtime.runtime_events AS event
    SET payload = '{}'::jsonb
    FROM detailed
    WHERE event.id = detailed.id
      AND NOT EXISTS (SELECT 1 FROM invalid)
    RETURNING event.id
  `;
}
