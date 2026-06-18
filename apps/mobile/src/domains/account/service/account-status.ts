import type { ConnectionState } from "../../chat/types/conversation.js";

export type AccountConnectionStatus =
  | "connected"
  | "reconnecting"
  | "connection_issue"
  | "not_configured";

export interface ConnectionStatusInput {
  readonly controlPlaneBaseUrl: string;
  readonly runtimeConnectionState: ConnectionState;
}

export function deriveConnectionStatus(input: ConnectionStatusInput): AccountConnectionStatus {
  if (input.controlPlaneBaseUrl.trim().length === 0) return "not_configured";

  switch (input.runtimeConnectionState) {
    case "connected":
      return "connected";
    case "error":
      return "connection_issue";
    case "idle":
    case "routing":
    case "connecting":
    case "retrying":
      return "reconnecting";
  }
}

export function connectionStatusLabel(status: AccountConnectionStatus): string {
  switch (status) {
    case "connected":
      return "Connected";
    case "reconnecting":
      return "Reconnecting";
    case "connection_issue":
      return "Connection issue";
    case "not_configured":
      return "Not configured";
  }
}
