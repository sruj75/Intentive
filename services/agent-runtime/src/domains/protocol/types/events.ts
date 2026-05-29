/**
 * Protocol domain — sample inbound/outbound events typed against the shared
 * wire contract. These stubs anchor the monorepo typecheck to
 * `@intentive/protocol` until the real event handlers land.
 */
import type { ClientToRuntimeEvent, RuntimeToClientEvent } from "@intentive/protocol";

export const runtimeConnectSample: ClientToRuntimeEvent = {
  type: "connect",
  auth_token: "token",
  client_kind: "mobile",
  client_version: "0.0.0",
};

export const companionMessageSample: RuntimeToClientEvent = {
  type: "companion_message",
  message_id: "message_stub",
  body: "hello",
  emitted_at: "2026-05-28T00:00:00.000Z",
  via_post_message_back: false,
};
