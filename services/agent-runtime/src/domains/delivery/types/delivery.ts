import type { ClientKind, RuntimeToClientEvent } from "@intentive/protocol";

export type DeliveryMode = "reply" | "proactive";
export type DeliveryPath = "stream" | "push";
export type DeliveryStatus = "ok" | "failed";

export interface DeliveryMessage {
  readonly userId: string;
  readonly messageId: string;
  readonly body: string;
}

export interface DeliveryRecord {
  readonly userId: string;
  readonly messageId: string;
  readonly path: DeliveryPath;
  readonly clientKind: ClientKind | null;
  readonly status: DeliveryStatus;
  readonly error: string | null;
  readonly attemptedAt: Date;
}

export interface DeliveriesRepo {
  recordQuery(record: DeliveryRecord): Promise<unknown[]>;
}

export interface RegisteredConnection {
  readonly clientKind: ClientKind;
  foreground: boolean;
}

export interface ConnectionHandle {
  setForeground(foreground: boolean): void;
  unregister(): void;
}

export interface ConnectionRegistry {
  send(
    userId: string,
    predicate: (connection: RegisteredConnection) => boolean,
    event: RuntimeToClientEvent,
  ): ClientKind[];
}

export interface CpPushClient {
  push(input: { userId: string; previewText: string; messageId: string }): Promise<void>;
}

export interface DeliveryPort {
  deliver(message: DeliveryMessage, mode: DeliveryMode): Promise<void>;
}

export type PostMessageBack = (userId: string, body: string) => Promise<{ messageId: string }>;
