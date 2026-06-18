import test from "node:test";
import assert from "node:assert/strict";

import * as contract from "../dist/index.js";

test("public and internal schemas are exported from one barrel", () => {
  assert.ok(contract.GetMeResponse);
  assert.ok(contract.GetAgentResponse);
  assert.ok(contract.PostConsentResponse);
  assert.ok(contract.PostDeviceRegisterRequest);
  assert.ok(contract.PostInternalSessionsStartRequest);
  assert.ok(contract.PostInternalNotificationsPushRequest);
});

test("GetMeDeviceSignal coerces header strings into a typed device signal", () => {
  const parsed = contract.GetMeDeviceSignal.parse({
    client_kind: "desktop",
    capture_permission_granted: "true",
  });
  assert.deepEqual(parsed, { client_kind: "desktop", capture_permission_granted: true });

  assert.equal(
    contract.GetMeDeviceSignal.parse({ capture_permission_granted: "false" })
      .capture_permission_granted,
    false,
  );
});

test("GetMeDeviceSignal tolerates an absent signal (unregistered/legacy caller)", () => {
  assert.deepEqual(contract.GetMeDeviceSignal.parse({}), {});
});

test("GetMeDeviceSignal rejects an unknown client_kind", () => {
  assert.equal(contract.GetMeDeviceSignal.safeParse({ client_kind: "watch" }).success, false);
});

test("AccountState reports whether a Desktop Client is registered", () => {
  assert.deepEqual(
    contract.AccountState.parse({
      user_id: "u_1",
      next_gate: null,
      has_agent_instance: true,
      has_desktop_client: false,
    }),
    {
      user_id: "u_1",
      next_gate: null,
      has_agent_instance: true,
      has_desktop_client: false,
    },
  );
});

test("public request schemas reject unknown keys", () => {
  const result = contract.PostDeviceRegisterRequest.safeParse({
    device_fingerprint: "abc",
    client_kind: "desktop",
    apns_token: "token",
    legacy_field: true,
  });

  assert.equal(result.success, false);
});

test("internal request schemas reject unknown keys", () => {
  const result = contract.PostInternalNotificationsPushRequest.safeParse({
    user_id: "u1",
    preview_text: "hello",
    message_id: "m1",
    metadata: { stale: true },
  });

  assert.equal(result.success, false);
});

test("canonical request/response samples still parse", () => {
  assert.equal(
    contract.GetAgentResponse.safeParse({
      agent_instance_id: "agent_1",
      ws_url: "https://runtime.example.com/ws",
      runtime_jwt: "jwt",
    }).success,
    true,
  );

  assert.equal(
    contract.PostInternalSessionsStartRequest.safeParse({
      auth_subject: "sub_1",
      user_id: "user_1",
    }).success,
    true,
  );

  assert.equal(
    contract.PostInternalSessionsStartResponse.safeParse({
      agent_instance_id: "agent_1",
      ws_url: "https://runtime.example.com/ws",
    }).success,
    true,
  );
});
