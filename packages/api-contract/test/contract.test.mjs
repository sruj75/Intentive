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
    contract.PostInternalSessionsStartResponse.safeParse({
      agent_instance_id: "agent_1",
      ws_url: "https://runtime.example.com/ws",
    }).success,
    true,
  );
});
