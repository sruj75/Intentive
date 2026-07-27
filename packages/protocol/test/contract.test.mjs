import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import * as protocol from "../dist/index.js";

const fixturesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

test("connect accepts canonical fields only", () => {
  const result = protocol.connect.safeParse({
    type: "connect",
    auth_token: "jwt",
    client_kind: "desktop",
    client_version: "1.0.0",
  });

  assert.equal(result.success, true);
});

test("connect accepts optional client timezone and keeps strict unknown-key behavior", () => {
  const result = protocol.connect.safeParse({
    type: "connect",
    auth_token: "jwt",
    client_kind: "desktop",
    client_version: "1.0.0",
    client_tz: "Asia/Kolkata",
  });

  assert.equal(result.success, true);
});

test("connect advertises the optional Desktop Coaching capability without breaking legacy clients", () => {
  const legacy = protocol.connect.safeParse({
    type: "connect",
    auth_token: "jwt",
    client_kind: "desktop",
    client_version: "1.0.0",
  });
  assert.equal(legacy.success, true);

  const coachingPreview = protocol.clientToRuntimeEvent.safeParse({
    type: "connect",
    auth_token: "jwt",
    client_kind: "desktop",
    client_version: "1.0.0-preview.1",
    capabilities: ["desktop_coaching_v1"],
  });
  assert.equal(coachingPreview.success, true);
  assert.deepEqual(coachingPreview.data.capabilities, ["desktop_coaching_v1"]);
});

test("connect rejects unrecognized capability names", () => {
  const result = protocol.connect.safeParse({
    type: "connect",
    auth_token: "jwt",
    client_kind: "desktop",
    client_version: "1.0.0",
    capabilities: ["desktop_coaching_v2"],
  });

  assert.equal(result.success, false);
});

test("connect rejects malformed client timezone values", () => {
  const result = protocol.connect.safeParse({
    type: "connect",
    auth_token: "jwt",
    client_kind: "desktop",
    client_version: "1.0.0",
    client_tz: "GMT+05:30",
  });

  assert.equal(result.success, false);
});

test("connect rejects legacy negotiation fields and unknown keys", () => {
  const withLegacy = protocol.connect.safeParse({
    type: "connect",
    auth_token: "jwt",
    client_kind: "desktop",
    client_version: "1.0.0",
    min_protocol: 1,
    max_protocol: 1,
  });
  assert.equal(withLegacy.success, false);

  const withUnknown = protocol.connect.safeParse({
    type: "connect",
    auth_token: "jwt",
    client_kind: "desktop",
    client_version: "1.0.0",
    extra: true,
  });
  assert.equal(withUnknown.success, false);
});

test("hello_ok rejects negotiated_protocol", () => {
  const result = protocol.hello_ok.safeParse({
    type: "hello_ok",
    negotiated_protocol: 1,
    session_snapshot: {},
  });

  assert.equal(result.success, false);
});

test("runtime_error validates canonical envelope and codes", () => {
  const valid = protocol.runtimeToClientEvent.safeParse({
    type: "runtime_error",
    code: "auth_failed",
    message: "Auth failed",
  });
  assert.equal(valid.success, true);

  const serviceUnavailable = protocol.runtimeToClientEvent.safeParse({
    type: "runtime_error",
    code: "service_unavailable",
    message: "Try again later",
  });
  assert.equal(serviceUnavailable.success, true);

  const invalidCode = protocol.runtimeToClientEvent.safeParse({
    type: "runtime_error",
    code: "legacy_code",
    message: "bad",
  });
  assert.equal(invalidCode.success, false);

  const unknownField = protocol.runtimeToClientEvent.safeParse({
    type: "runtime_error",
    code: "invalid_connect",
    message: "bad",
    unknown: true,
  });
  assert.equal(unknownField.success, false);
});

test("history_backfill_request accepts a cursor and optional limit", () => {
  const withLimit = protocol.history_backfill_request.safeParse({
    type: "history_backfill_request",
    before_cursor: "1024",
    limit: 50,
  });
  assert.equal(withLimit.success, true);

  const withoutLimit = protocol.history_backfill_request.safeParse({
    type: "history_backfill_request",
    before_cursor: "1024",
  });
  assert.equal(withoutLimit.success, true);
});

test("history_backfill_request rejects bad limits and unknown keys", () => {
  const negativeLimit = protocol.history_backfill_request.safeParse({
    type: "history_backfill_request",
    before_cursor: "1024",
    limit: -1,
  });
  assert.equal(negativeLimit.success, false);

  const unknownField = protocol.history_backfill_request.safeParse({
    type: "history_backfill_request",
    before_cursor: "1024",
    extra: true,
  });
  assert.equal(unknownField.success, false);
});

test("history_backfill_request rejects malformed cursors at the protocol boundary", () => {
  const valid = protocol.history_backfill_request.safeParse({
    type: "history_backfill_request",
    before_cursor: "1024",
  });
  assert.equal(valid.success, true);

  const malformed = protocol.history_backfill_request.safeParse({
    type: "history_backfill_request",
    before_cursor: "abc",
  });
  assert.equal(malformed.success, false);
});

test("history_backfill_request is a member of clientToRuntimeEvent", () => {
  const result = protocol.clientToRuntimeEvent.safeParse({
    type: "history_backfill_request",
    before_cursor: "1024",
  });
  assert.equal(result.success, true);
});

test("coaching_window_started accepts every approved reason through the inbound boundary", () => {
  const reasons = [
    "app_launch",
    "login_launch",
    "sign_in",
    "onboarding_completed",
    "system_wake",
    "user_resume",
    "permission_restored",
    "crash_recovery",
  ];

  for (const reason of reasons) {
    const result = protocol.clientToRuntimeEvent.safeParse({
      type: "coaching_window_started",
      window_id: "11111111-1111-4111-8111-111111111111",
      started_at: "2026-07-26T08:00:00.000Z",
      reason,
    });
    assert.equal(result.success, true, `start reason ${reason} should be accepted`);
  }
});

test("coaching_window_ended accepts every approved reason through the inbound boundary", () => {
  const reasons = ["pause", "system_sleep", "sign_out", "quit", "crash", "permission_lost"];

  for (const reason of reasons) {
    const result = protocol.clientToRuntimeEvent.safeParse({
      type: "coaching_window_ended",
      window_id: "11111111-1111-4111-8111-111111111111",
      ended_at: "2026-07-26T09:00:00.000Z",
      reason,
    });
    assert.equal(result.success, true, `end reason ${reason} should be accepted`);
  }
});

test("coaching_window_presence attests active and locked state through the inbound boundary", () => {
  for (const state of ["active", "locked"]) {
    const result = protocol.clientToRuntimeEvent.safeParse({
      type: "coaching_window_presence",
      window_id: "11111111-1111-4111-8111-111111111111",
      state,
      changed_at: "2026-07-26T08:30:00.000Z",
    });
    assert.equal(result.success, true, `presence state ${state} should be accepted`);
  }
});

test("committed Coaching Window fixtures validate through the inbound boundary", () => {
  for (const fixtureName of [
    "coaching-window-started.json",
    "coaching-window-ended.json",
    "coaching-window-presence.json",
  ]) {
    const result = protocol.clientToRuntimeEvent.safeParse(readJsonFixture(fixtureName));
    assert.equal(result.success, true, `${fixtureName} should validate`);
  }
});

test("Coaching Window events reject malformed fields, unknown reasons, and extra identity keys", () => {
  const invalidStartReason = protocol.coaching_window_started.safeParse({
    type: "coaching_window_started",
    window_id: "11111111-1111-4111-8111-111111111111",
    started_at: "2026-07-26T08:00:00.000Z",
    reason: "reconnect",
  });
  assert.equal(invalidStartReason.success, false);

  const invalidEndTimestamp = protocol.coaching_window_ended.safeParse({
    type: "coaching_window_ended",
    window_id: "11111111-1111-4111-8111-111111111111",
    ended_at: "yesterday",
    reason: "pause",
  });
  assert.equal(invalidEndTimestamp.success, false);

  const invalidPresenceState = protocol.coaching_window_presence.safeParse({
    type: "coaching_window_presence",
    window_id: "not-a-uuid",
    state: "inactive",
    changed_at: "2026-07-26T08:30:00.000Z",
  });
  assert.equal(invalidPresenceState.success, false);

  const speculativeEventId = protocol.coaching_window_started.safeParse({
    type: "coaching_window_started",
    window_id: "11111111-1111-4111-8111-111111111111",
    event_id: "22222222-2222-4222-8222-222222222222",
    started_at: "2026-07-26T08:00:00.000Z",
    reason: "app_launch",
  });
  assert.equal(speculativeEventId.success, false);
});

test("perception_event validates the committed wire fixture", () => {
  const fixture = readJsonFixture("perception-event.json");
  const result = protocol.clientToRuntimeEvent.safeParse(fixture);

  assert.equal(result.success, true);
  assert.equal(result.data.type, "perception_event");
  assert.equal(result.data.artifact_type, "searchable_screen_record");
});

test("perception_event optionally binds new Desktop evidence to a Coaching Window", () => {
  const result = protocol.clientToRuntimeEvent.safeParse({
    ...readJsonFixture("perception-event.json"),
    window_id: "11111111-1111-4111-8111-111111111111",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.window_id, "11111111-1111-4111-8111-111111111111");
});

test("perception_event accepts ambient audio summaries", () => {
  const result = protocol.clientToRuntimeEvent.safeParse({
    ...readJsonFixture("perception-event.json"),
    event_id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
    artifact_type: "ambient_audio_summary",
    summary: "Recent nearby speech discussed the launch checklist.",
    signals: {
      transcript_word_count: 7,
      audio_source: "microphone",
    },
    local_record_ref: "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.type, "perception_event");
  assert.equal(result.data.artifact_type, "ambient_audio_summary");
});

test("perception_event requires an authoritative expires_at", () => {
  const { expires_at, ...withoutExpiry } = readJsonFixture("perception-event.json");
  const missing = protocol.perception_event.safeParse(withoutExpiry);
  assert.equal(missing.success, false);

  const badFormat = protocol.perception_event.safeParse({
    ...readJsonFixture("perception-event.json"),
    expires_at: "not-a-timestamp",
  });
  assert.equal(badFormat.success, false);
});

test("perception_tombstone validates the committed wire fixture", () => {
  const fixture = readJsonFixture("perception-tombstone.json");
  const result = protocol.clientToRuntimeEvent.safeParse(fixture);

  assert.equal(result.success, true);
  assert.equal(result.data.type, "perception_tombstone");
  assert.equal(result.data.reason, "manual_delete");
  assert.deepEqual(result.data.event_refs, ["0b8c6d2e-1f4a-4c3b-9a7d-2e5f6a7b8c9d"]);
});

test("perception_tombstone accepts a clear_all wipe with no event_refs", () => {
  const result = protocol.clientToRuntimeEvent.safeParse({
    type: "perception_tombstone",
    tombstone_id: "9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
    reason: "clear_all",
    event_refs: [],
    emitted_at: "2026-07-05T11:00:00.000Z",
  });
  assert.equal(result.success, true);
  assert.equal(result.data.reason, "clear_all");
});

test("perception_tombstone rejects unknown reasons and extra keys", () => {
  const badReason = protocol.clientToRuntimeEvent.safeParse({
    ...readJsonFixture("perception-tombstone.json"),
    reason: "purge_everything",
  });
  assert.equal(badReason.success, false);

  const extraKey = protocol.clientToRuntimeEvent.safeParse({
    ...readJsonFixture("perception-tombstone.json"),
    local_record_ref: "screen-memory://records/2026-07-05/001",
  });
  assert.equal(extraKey.success, false);
});

test("perception_event rejects stale context_snapshot fields and bad embedding dimensions", () => {
  const staleSnapshot = protocol.clientToRuntimeEvent.safeParse({
    type: "context_snapshot",
    snapshot_id: "snapshot_1",
    captured_at: "2026-07-05T10:00:00.000Z",
    period_start: "2026-07-05T09:59:00.000Z",
    period_end: "2026-07-05T10:00:00.000Z",
    summary: "old shape",
  });
  assert.equal(staleSnapshot.success, false);

  const badEmbedding = protocol.perception_event.safeParse({
    ...readJsonFixture("perception-event.json"),
    embedding_ref: {
      model_id: "local-test-embedding",
      dim: 4,
      vector: [0.1, 0.2, 0.3],
    },
  });
  assert.equal(badEmbedding.success, false);
});

test("perception_event rejects non-finite embedding vector values at both parse seams", () => {
  for (const value of [Infinity, -Infinity]) {
    const event = {
      ...readJsonFixture("perception-event.json"),
      embedding_ref: {
        model_id: "local-test-embedding",
        dim: 3,
        vector: [0.1, value, 0.3],
      },
    };
    assert.equal(protocol.perception_event.safeParse(event).success, false);
    assert.equal(protocol.clientToRuntimeEvent.safeParse(event).success, false);
  }
});

test("history_backfill_response reuses the session_snapshot shape under a type tag", () => {
  const valid = protocol.runtimeToClientEvent.safeParse({
    type: "history_backfill_response",
    session_snapshot: {
      messages: [
        {
          message_id: "m1",
          author: "user",
          body: "hello",
          at: new Date().toISOString(),
          via_post_message_back: false,
        },
      ],
      before_cursor: "7",
    },
  });
  assert.equal(valid.success, true);

  const missingSnapshot = protocol.runtimeToClientEvent.safeParse({
    type: "history_backfill_response",
  });
  assert.equal(missingSnapshot.success, false);
});

test("runtime->client fixtures validate against the outbound union", () => {
  assert.equal(
    protocol.runtimeToClientEvent.safeParse(readJsonFixture("hello-ok.json")).success,
    true,
  );
  assert.equal(
    protocol.runtimeToClientEvent.safeParse(readJsonFixture("companion-message.json")).success,
    true,
  );
});

test("companion_message optionally binds live coaching delivery to a Coaching Window", () => {
  const result = protocol.runtimeToClientEvent.safeParse({
    ...readJsonFixture("companion-message.json"),
    window_id: "11111111-1111-4111-8111-111111111111",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.window_id, "11111111-1111-4111-8111-111111111111");
});

test("optional Coaching Window bindings still require UUIDs", () => {
  const userMessage = protocol.user_message.safeParse({
    type: "user_message",
    message_id: "m1",
    body: "hello",
    sent_at: new Date().toISOString(),
    window_id: "window-1",
  });
  assert.equal(userMessage.success, false);

  const perception = protocol.perception_event.safeParse({
    ...readJsonFixture("perception-event.json"),
    window_id: "window-1",
  });
  assert.equal(perception.success, false);

  const companion = protocol.companion_message.safeParse({
    ...readJsonFixture("companion-message.json"),
    window_id: "window-1",
  });
  assert.equal(companion.success, false);
});

test("Desktop user_message may bind the active Coaching Window", () => {
  const result = protocol.user_message.safeParse({
    type: "user_message",
    message_id: "m1",
    body: "My important outcome is the release.",
    sent_at: new Date().toISOString(),
    window_id: "11111111-1111-4111-8111-111111111111",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.window_id, "11111111-1111-4111-8111-111111111111");
});

test("wire event objects are strict", () => {
  const result = protocol.user_message.safeParse({
    type: "user_message",
    message_id: "m1",
    body: "hello",
    sent_at: new Date().toISOString(),
    shadow: "legacy",
  });

  assert.equal(result.success, false);
});

test("user_message cannot claim Runtime-owned proactive message identities", () => {
  for (const messageId of [
    "opening:11111111-1111-4111-8111-111111111111",
    "intervention:11111111-1111-4111-8111-111111111111:42",
  ]) {
    const result = protocol.user_message.safeParse({
      type: "user_message",
      message_id: messageId,
      body: "user-authored collision",
      sent_at: new Date().toISOString(),
    });

    assert.equal(result.success, false, `${messageId} must remain Runtime-owned`);
  }

  assert.equal(
    protocol.user_message.safeParse({
      type: "user_message",
      message_id: "user:11111111-1111-4111-8111-111111111111",
      body: "ordinary user message",
      sent_at: new Date().toISOString(),
    }).success,
    true,
  );
});

test("legacy alias exports are removed", () => {
  const removed = [
    "ConnectFrame",
    "HelloOkFrame",
    "UserMessageEvent",
    "PresenceUpdateEvent",
    "DeliveryAckEvent",
    "ContextSnapshotEvent",
    "PerceptionEventEvent",
    "SessionEndMarkerEvent",
    "CompanionMessageEvent",
    "InboundEvent",
    "OutboundEvent",
  ];

  for (const name of removed) {
    assert.equal(name in protocol, false, `${name} should not be exported`);
  }
});

test("perception_event requires UUID identifiers at the boundary", () => {
  const badEventId = protocol.perception_event.safeParse({
    ...readJsonFixture("perception-event.json"),
    event_id: "perception_2026-07-05T10-00-00Z_001",
  });
  assert.equal(badEventId.success, false);

  const badRecordRef = protocol.perception_event.safeParse({
    ...readJsonFixture("perception-event.json"),
    local_record_ref: "screen-memory://records/2026-07-05/001",
  });
  assert.equal(badRecordRef.success, false);
});

test("searchable_screen_record permits the full signal set only in the permitted shape", () => {
  const permitted = protocol.perception_event.safeParse(readJsonFixture("perception-event.json"));
  assert.equal(permitted.success, true);

  // A loose free-form signal payload is no longer accepted for screen records.
  const loose = protocol.perception_event.safeParse({
    ...readJsonFixture("perception-event.json"),
    signals: { app: "Code", ocr_word_count: 184 },
  });
  assert.equal(loose.success, false);

  // Permitted shape may not carry unknown signal keys.
  const extraSignal = protocol.perception_event.safeParse({
    ...readJsonFixture("perception-event.json"),
    signals: {
      content_redacted: false,
      bundle_id: "com.microsoft.VSCode",
      app_name: "Code",
      window_title: "plan.md",
      ocr_text: "text",
      screenshot_path: "/tmp/frame.png",
    },
  });
  assert.equal(extraSignal.success, false);
});

test("secret-detected searchable_screen_record redacts title, OCR, and embedding", () => {
  const redacted = protocol.perception_event.safeParse(
    readJsonFixture("searchable-screen-record-redacted.json"),
  );
  assert.equal(redacted.success, true);

  // A redacted record must be labelled secret_detected.
  const wrongLabel = protocol.perception_event.safeParse({
    ...readJsonFixture("searchable-screen-record-redacted.json"),
    sensitivity_label: "normal",
  });
  assert.equal(wrongLabel.success, false);

  // A redacted record may not carry an embedding_ref.
  const withEmbedding = protocol.perception_event.safeParse({
    ...readJsonFixture("searchable-screen-record-redacted.json"),
    embedding_ref: { model_id: "local-test-embedding", dim: 3, vector: [0.1, 0.2, 0.3] },
  });
  assert.equal(withEmbedding.success, false);

  // A secret_detected label may not appear on a non-redacted permitted payload.
  const secretButPermitted = protocol.perception_event.safeParse({
    ...readJsonFixture("perception-event.json"),
    sensitivity_label: "secret_detected",
  });
  assert.equal(secretButPermitted.success, false);
});

test("session_end_marker validates the committed wire fixture with stable UUIDs", () => {
  const fixture = readJsonFixture("session-end-marker.json");
  const result = protocol.clientToRuntimeEvent.safeParse(fixture);
  assert.equal(result.success, true);
  assert.equal(result.data.type, "session_end_marker");
  assert.equal(result.data.reason, "quit");

  const missingSession = protocol.session_end_marker.safeParse({
    type: "session_end_marker",
    marker_id: "3e2d1c0b-9a8f-4e7d-8c6b-5a4f3e2d1c0b",
    ended_at: "2026-07-05T12:00:00.000Z",
    reason: "quit",
  });
  assert.equal(missingSession.success, false);

  const badReason = protocol.session_end_marker.safeParse({
    ...fixture,
    reason: "logout",
  });
  assert.equal(badReason.success, false);
});

test("runtime_ingress_ack validates the committed fixture and is an outbound event", () => {
  const fixture = readJsonFixture("runtime-ingress-ack.json");
  const result = protocol.runtimeToClientEvent.safeParse(fixture);
  assert.equal(result.success, true);
  assert.equal(result.data.type, "runtime_ingress_ack");
  assert.equal(result.data.ingress_kind, "perception_event");

  for (const kind of [
    "perception_event",
    "perception_tombstone",
    "session_end_marker",
    "coaching_window_started",
    "coaching_window_ended",
  ]) {
    const ack = protocol.runtime_ingress_ack.safeParse({
      type: "runtime_ingress_ack",
      ingress_kind: kind,
      ingress_id: "0b8c6d2e-1f4a-4c3b-9a7d-2e5f6a7b8c9d",
    });
    assert.equal(ack.success, true, `ingress_kind ${kind} should be accepted`);
  }
});

test("runtime_ingress_ack rejects non-UUID ids, unknown kinds, and extra keys", () => {
  const badId = protocol.runtime_ingress_ack.safeParse({
    type: "runtime_ingress_ack",
    ingress_kind: "perception_event",
    ingress_id: "not-a-uuid",
  });
  assert.equal(badId.success, false);

  const badKind = protocol.runtime_ingress_ack.safeParse({
    type: "runtime_ingress_ack",
    ingress_kind: "user_message",
    ingress_id: "0b8c6d2e-1f4a-4c3b-9a7d-2e5f6a7b8c9d",
  });
  assert.equal(badKind.success, false);

  const nonDurablePresence = protocol.runtime_ingress_ack.safeParse({
    type: "runtime_ingress_ack",
    ingress_kind: "coaching_window_presence",
    ingress_id: "0b8c6d2e-1f4a-4c3b-9a7d-2e5f6a7b8c9d",
  });
  assert.equal(nonDurablePresence.success, false);

  const extraKey = protocol.runtime_ingress_ack.safeParse({
    ...readJsonFixture("runtime-ingress-ack.json"),
    turn_completed: true,
  });
  assert.equal(extraKey.success, false);
});

function readJsonFixture(name) {
  return JSON.parse(readFileSync(path.join(fixturesDir, name), "utf8"));
}
