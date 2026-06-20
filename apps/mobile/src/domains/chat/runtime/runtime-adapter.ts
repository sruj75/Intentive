import {
  parseRuntimeToClientEvent,
  type ClientToRuntimeEvent,
  type RuntimeToClientEvent,
} from "@intentive/protocol";

import { createMessageStore } from "../service/message-store.js";
import { getRuntimeRouting, type FetchLike } from "../service/routing-client.js";
import { noopTelemetry, type Telemetry } from "../../../providers/telemetry/types.js";
import type {
  ConnectionState,
  MessageStoreState,
  RuntimeAdapter,
  RuntimeAdapterError,
  RuntimeAdapterState,
} from "../types/conversation.js";

export interface WebSocketLike {
  onopen: (() => void) | null;
  onmessage: ((event: { readonly data: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: (() => void) | null;
  send(data: string): void;
  close(): void;
}

export interface RuntimeAdapterDeps {
  readonly baseUrl: string;
  readonly getUserJwt: () => Promise<string | null>;
  readonly fetch: FetchLike;
  readonly createWebSocket: (url: string) => WebSocketLike;
  readonly clientVersion: string;
  readonly now: () => string;
  readonly id: () => string;
  readonly schedule: (fn: () => void, delayMs: number) => { cancel(): void };
  readonly maxRoutingRetries?: number;
  readonly backoffMs?: readonly number[];
  readonly telemetry?: Telemetry;
  /**
   * Resolves the device IANA timezone for the `connect.client_tz` field. Injected
   * (matching `now`/`id`/`clientVersion`) so tests stay deterministic without
   * monkeypatching `Intl`. Returns `undefined` when the platform cannot resolve a
   * zone — the field is then omitted and the Runtime falls back to UTC.
   */
  readonly resolveTimeZone?: () => string | undefined;
}

const DEFAULT_BACKOFF_MS = [250, 500, 1000, 2000, 5000] as const;
const MAX_BACKOFF_MS = 5000;

export const defaultResolveTimeZone = (): string | undefined => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
};

export function createRuntimeAdapter(deps: RuntimeAdapterDeps): RuntimeAdapter {
  const telemetry = deps.telemetry ?? noopTelemetry;
  const listeners = new Set<() => void>();
  const messageStore = createMessageStore();
  let state: RuntimeAdapterState = {
    ...messageStore.getState(),
    connectionState: "idle",
    error: null,
  };
  let socket: WebSocketLike | null = null;
  let retryCancel: { cancel(): void } | null = null;
  let closed = false;
  let connectionGeneration = 0;
  let routingAttempts = 0;
  let outboundQueue: ClientToRuntimeEvent[] = [];

  const setState = (patch: Partial<RuntimeAdapterState>) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };

  const syncMessages = (next: MessageStoreState) => {
    setState({
      messages: next.messages,
      beforeCursor: next.beforeCursor,
      agentState: next.agentState,
    });
  };

  const connect = async (): Promise<void> => {
    closed = false;
    const generation = ++connectionGeneration;
    cancelRetry();
    closeSocket();
    routingAttempts = 0;
    await routeAndOpen(generation);
  };

  const isCurrentGeneration = (generation: number) =>
    !closed && generation === connectionGeneration;

  const routeAndOpen = async (generation: number): Promise<void> => {
    if (!isCurrentGeneration(generation)) return;
    setConnection("routing");
    let result: Awaited<ReturnType<typeof getRuntimeRouting>>;
    try {
      result = await getRuntimeRouting({
        baseUrl: deps.baseUrl,
        getUserJwt: deps.getUserJwt,
        fetch: deps.fetch,
      });
    } catch {
      if (isCurrentGeneration(generation)) scheduleRoutingRetry(generation);
      return;
    }
    if (!isCurrentGeneration(generation)) return;

    switch (result.status) {
      case "ok":
        routingAttempts = 0;
        openSocket(generation, result.routing.wsUrl, result.routing.runtimeJwt);
        return;
      case "retry":
        scheduleRoutingRetry(generation, result.retryAfterMs);
        return;
      case "reauth":
        failPendingOutboundAndSetError(
          "reauth-required",
          "Sign in again to reconnect Companion Chat.",
        );
        return;
      case "gate":
        failPendingOutboundAndSetError(
          "gate-required",
          "Finish the next Pre-Chat Gate before reconnecting.",
        );
        return;
    }
  };

  const openSocket = (generation: number, url: string, runtimeJwt: string) => {
    if (!isCurrentGeneration(generation)) return;
    closeSocket();
    setConnection("connecting");
    socket = deps.createWebSocket(url);
    socket.onopen = () => {
      if (!isCurrentGeneration(generation)) return;
      const clientTz = (deps.resolveTimeZone ?? defaultResolveTimeZone)();
      sendNow({
        type: "connect",
        auth_token: runtimeJwt,
        client_kind: "mobile",
        client_version: deps.clientVersion,
        // Last-write-wins: resolved per reconnect so travel re-reports the new zone.
        // Omitted when undefined so the Runtime cleanly falls back to UTC.
        ...(clientTz !== undefined ? { client_tz: clientTz } : {}),
      });
    };
    socket.onmessage = (event) => {
      if (!isCurrentGeneration(generation)) return;
      handleRuntimeFrame(generation, event.data);
    };
    socket.onerror = (event) => {
      if (!isCurrentGeneration(generation)) return;
      failPendingOutboundAndSetError(
        "network",
        "Companion Chat connection failed.",
        event instanceof Error ? event : undefined,
      );
    };
    socket.onclose = () => {
      if (!isCurrentGeneration(generation)) return;
      closeSocket();
      markPendingOutboundFailed();
      scheduleRoutingRetry(generation);
    };
  };

  const sendUserMessage = async (body: string): Promise<void> => {
    const trimmed = body.trim();
    if (trimmed.length === 0) return;
    const messageId = deps.id();
    const sentAt = deps.now();
    syncMessages(messageStore.appendPendingUserMessage({ messageId, body: trimmed, sentAt }));
    enqueueOutbound({
      type: "user_message",
      message_id: messageId,
      body: trimmed,
      sent_at: sentAt,
    });
  };

  const retryUserMessage = async (messageId: string): Promise<void> => {
    const message = messageStore
      .getState()
      .messages.find(
        (candidate) =>
          candidate.id === messageId &&
          candidate.author === "user" &&
          candidate.delivery === "failed",
      );
    if (!message) return;

    syncMessages(messageStore.retryFailedUserMessage(messageId));
    enqueueOutbound({
      type: "user_message",
      message_id: message.id,
      body: message.body,
      sent_at: message.at,
    });
  };

  const close = () => {
    connectionGeneration += 1;
    closed = true;
    cancelRetry();
    closeSocket();
    setConnection("idle");
  };

  const handleRuntimeFrame = (generation: number, data: string) => {
    if (!isCurrentGeneration(generation)) return;
    let event: RuntimeToClientEvent;
    try {
      event = parseRuntimeToClientEvent(JSON.parse(data));
    } catch (error) {
      if (!isCurrentGeneration(generation)) return;
      failPendingOutboundAndSetError("protocol", "Received an invalid Protocol frame.", error);
      return;
    }
    if (!isCurrentGeneration(generation)) return;

    switch (event.type) {
      case "hello_ok":
        syncMessages(
          messageStore.replaceServerWindow({
            messages: event.session_snapshot.messages,
            beforeCursor: event.session_snapshot.before_cursor,
          }),
        );
        setConnection("connected");
        flushOutboundQueue();
        return;
      case "history_backfill_response":
        syncMessages(
          messageStore.prependServerPage({
            messages: event.session_snapshot.messages,
            beforeCursor: event.session_snapshot.before_cursor,
          }),
        );
        return;
      case "companion_message":
        syncMessages(
          messageStore.appendCompanionMessage({
            messageId: event.message_id,
            body: event.body,
            emittedAt: event.emitted_at,
            viaPostMessageBack: event.via_post_message_back,
          }),
        );
        enqueueOutbound({ type: "delivery_ack", message_id: event.message_id });
        return;
      case "runtime_error":
        failPendingOutboundAndSetError("protocol", event.message, new Error(event.message));
        return;
    }
  };

  const enqueueOutbound = (event: ClientToRuntimeEvent) => {
    outboundQueue = [...outboundQueue, event];
    flushOutboundQueue();
  };

  const isReadyToSend = () => socket !== null && state.connectionState === "connected";

  const flushOutboundQueue = () => {
    if (!isReadyToSend()) return;
    while (outboundQueue.length > 0) {
      const next = outboundQueue[0];
      if (next === undefined || !sendNow(next)) return;
      outboundQueue = outboundQueue.slice(1);
    }
  };

  const sendNow = (event: ClientToRuntimeEvent) => {
    if (!socket) return false;
    socket.send(JSON.stringify(event));
    return true;
  };

  const scheduleRoutingRetry = (generation: number, retryAfterMs?: number) => {
    if (!isCurrentGeneration(generation)) return;
    routingAttempts += 1;
    const max = deps.maxRoutingRetries ?? DEFAULT_BACKOFF_MS.length;
    if (routingAttempts > max) {
      failPendingOutboundAndSetError(
        "routing-unavailable",
        "Companion Chat routing is unavailable.",
      );
      return;
    }
    setConnection("retrying");
    const delayMs =
      retryAfterMs ??
      deps.backoffMs?.[routingAttempts - 1] ??
      DEFAULT_BACKOFF_MS[routingAttempts - 1] ??
      MAX_BACKOFF_MS;
    retryCancel = deps.schedule(() => {
      if (!isCurrentGeneration(generation)) return;
      retryCancel = null;
      void routeAndOpen(generation);
    }, delayMs);
  };

  const setConnection = (connectionState: ConnectionState) => {
    setState({ connectionState, error: null });
  };

  const setError = (kind: RuntimeAdapterError["kind"], message: string, error?: unknown) => {
    closeSocket();
    telemetry.addBreadcrumb({
      message: "Runtime Adapter entered error state.",
      level: "error",
      data: { error_type: kind },
    });
    telemetry.captureException(error ?? new Error(message), { tags: { error_type: kind } });
    setState({ connectionState: "error", error: { kind, message } });
  };

  const failPendingOutboundAndSetError = (
    kind: RuntimeAdapterError["kind"],
    message: string,
    error?: unknown,
  ) => {
    markPendingOutboundFailed();
    setError(kind, message, error);
  };

  const markPendingOutboundFailed = () => {
    outboundQueue = [];
    syncMessages(messageStore.markPendingFailed());
  };

  const cancelRetry = () => {
    retryCancel?.cancel();
    retryCancel = null;
  };

  const closeSocket = () => {
    const current = socket;
    socket = null;
    if (!current) return;
    current.onopen = null;
    current.onmessage = null;
    current.onerror = null;
    current.onclose = null;
    current.close();
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getState: () => state,
    connect,
    sendUserMessage,
    retryUserMessage,
    close,
  };
}
