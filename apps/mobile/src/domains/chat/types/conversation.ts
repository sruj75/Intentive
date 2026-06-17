export type ConversationAuthor = "user" | "companion";

export type DeliveryStatus = "pending" | "confirmed" | "failed";

export type AgentState = "available" | "thinking";

export type ConnectionState =
  | "idle"
  | "routing"
  | "connecting"
  | "connected"
  | "retrying"
  | "error";

export interface ConversationMessage {
  readonly id: string;
  readonly author: ConversationAuthor;
  readonly body: string;
  readonly at: string;
  readonly viaPostMessageBack: boolean;
  readonly delivery?: DeliveryStatus;
}

export interface MessageStoreState {
  readonly messages: readonly ConversationMessage[];
  readonly beforeCursor: string | null;
  readonly agentState: AgentState;
}

export interface RuntimeAdapterState extends MessageStoreState {
  readonly connectionState: ConnectionState;
  readonly error: RuntimeAdapterError | null;
}

export type RuntimeAdapterError =
  | { readonly kind: "routing-unavailable"; readonly message: string }
  | { readonly kind: "reauth-required"; readonly message: string }
  | { readonly kind: "gate-required"; readonly message: string }
  | { readonly kind: "protocol"; readonly message: string }
  | { readonly kind: "network"; readonly message: string };

export interface RuntimeAdapter {
  subscribe(listener: () => void): () => void;
  getState(): RuntimeAdapterState;
  connect(): Promise<void>;
  sendUserMessage(body: string): Promise<void>;
  retryUserMessage(messageId: string): Promise<void>;
  close(): void;
}

export interface Routing {
  readonly agentInstanceId: string;
  readonly wsUrl: string;
  readonly runtimeJwt: string;
}

export type RoutingResult =
  | { readonly status: "ok"; readonly routing: Routing }
  | { readonly status: "retry"; readonly retryAfterMs?: number }
  | { readonly status: "reauth" }
  | { readonly status: "gate" };
