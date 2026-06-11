/**
 * @intentive/domain-types — shared domain shapes.
 *
 * For wire-level shapes, see @intentive/protocol (WebSocket) and
 * @intentive/api-contract (HTTP). This package is for in-process
 * domain types shared across deployables.
 *
 * See CONTEXT-MAP.md and packages/CONTEXT.md for the canonical meaning of each term.
 */

// ---------- Identity ----------

export type UserId = string & { readonly __brand: "UserId" };
export type DeviceId = string & { readonly __brand: "DeviceId" };
export type AgentInstanceId = string & { readonly __brand: "AgentInstanceId" };
export type MessageId = string & { readonly __brand: "MessageId" };

// ---------- Devices ----------

/**
 * The canonical set of Client Kinds. This is the single source of truth the
 * wire packages derive from: `@intentive/protocol` and `@intentive/api-contract`
 * build their Zod enums from this tuple so adding a client is one central edit,
 * not three lockstep ones. See packages/CONTEXT.md → "Client Kind".
 */
export const CLIENT_KINDS = ["mobile", "desktop", "android"] as const;

export type ClientKind = (typeof CLIENT_KINDS)[number];

export interface Device {
  device_id: DeviceId;
  user_id: UserId;
  client_kind: ClientKind;
  registered_at: string;
}

// ---------- Agent Instance ----------

export type AgentInstanceStatus = "active" | "paused";

export interface AgentInstance {
  agent_instance_id: AgentInstanceId;
  user_id: UserId;
  status: AgentInstanceStatus;
  created_at: string;
}

// ---------- Conversation ----------

export type MessageRole = "user" | "companion";

export interface ConversationMessage {
  message_id: MessageId;
  user_id: UserId;
  role: MessageRole;
  body: string;
  created_at: string;
  via_post_message_back?: boolean; // companion messages only
}
