import {
  parseRuntimeToClientEvent,
  type ClientToRuntimeEvent,
  type RuntimeToClientEvent,
} from "@intentive/protocol";

import { EMPTY_MESSAGE_STORE, reduceConversationState } from "../service/conversation-reducer.js";
import { getRuntimeRouting, type FetchLike } from "../service/routing-client.js";
import type {
  ConnectionState,
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
}

const DEFAULT_BACKOFF_MS = [250, 500, 1000, 2000, 5000] as const;
const MAX_BACKOFF_MS = 5000;

export function createRuntimeAdapter(deps: RuntimeAdapterDeps): RuntimeAdapter {
  const listeners = new Set<() => void>();
  let state: RuntimeAdapterState = {
    ...EMPTY_MESSAGE_STORE,
    connectionState: "idle",
    error: null,
  };
  let socket: WebSocketLike | null = null;
  let retryCancel: { cancel(): void } | null = null;
  let closed = false;
  let routingAttempts = 0;

  const setState = (patch: Partial<RuntimeAdapterState>) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };

  const dispatch = (event: Parameters<typeof reduceConversationState>[1]) => {
    const next = reduceConversationState(state, event);
    setState({
      messages: next.messages,
      beforeCursor: next.beforeCursor,
      agentState: next.agentState,
    });
  };

  const connect = async (): Promise<void> => {
    closed = false;
    cancelRetry();
    await routeAndOpen();
  };

  const routeAndOpen = async (): Promise<void> => {
    if (closed) return;
    setConnection("routing");
    const result = await getRuntimeRouting({
      baseUrl: deps.baseUrl,
      getUserJwt: deps.getUserJwt,
      fetch: deps.fetch,
    });

    switch (result.status) {
      case "ok":
        routingAttempts = 0;
        openSocket(result.routing.wsUrl, result.routing.runtimeJwt);
        return;
      case "retry":
        scheduleRoutingRetry(result.retryAfterMs);
        return;
      case "reauth":
        setError("reauth-required", "Sign in again to reconnect Companion Chat.");
        return;
      case "gate":
        setError("gate-required", "Finish the next Pre-Chat Gate before reconnecting.");
        return;
    }
  };

  const openSocket = (url: string, runtimeJwt: string) => {
    if (closed) return;
    closeSocket();
    setConnection("connecting");
    socket = deps.createWebSocket(url);
    socket.onopen = () => {
      sendFrame({
        type: "connect",
        auth_token: runtimeJwt,
        client_kind: "mobile",
        client_version: deps.clientVersion,
      });
    };
    socket.onmessage = (event) => handleRuntimeFrame(event.data);
    socket.onerror = () => setError("network", "Companion Chat connection failed.");
    socket.onclose = () => {
      if (closed) return;
      dispatch({ type: "mark_pending_failed" });
      scheduleRoutingRetry();
    };
  };

  const sendUserMessage = async (body: string): Promise<void> => {
    const trimmed = body.trim();
    if (trimmed.length === 0) return;
    const messageId = deps.id();
    const sentAt = deps.now();
    dispatch({ type: "send_user_message", messageId, body: trimmed, sentAt });
    sendFrame({ type: "user_message", message_id: messageId, body: trimmed, sent_at: sentAt });
  };

  const close = () => {
    closed = true;
    cancelRetry();
    closeSocket();
    setConnection("idle");
  };

  const handleRuntimeFrame = (data: string) => {
    let event: RuntimeToClientEvent;
    try {
      event = parseRuntimeToClientEvent(JSON.parse(data));
    } catch {
      setError("protocol", "Received an invalid Protocol frame.");
      return;
    }

    switch (event.type) {
      case "hello_ok":
        dispatch({
          type: "snapshot",
          messages: event.session_snapshot.messages,
          beforeCursor: event.session_snapshot.before_cursor,
        });
        setConnection("connected");
        return;
      case "history_backfill_response":
        dispatch({
          type: "snapshot",
          messages: event.session_snapshot.messages,
          beforeCursor: event.session_snapshot.before_cursor,
        });
        return;
      case "companion_message":
        dispatch({
          type: "companion_message",
          messageId: event.message_id,
          body: event.body,
          emittedAt: event.emitted_at,
          viaPostMessageBack: event.via_post_message_back,
        });
        sendFrame({ type: "delivery_ack", message_id: event.message_id });
        return;
      case "runtime_error":
        setError("protocol", event.message);
        return;
    }
  };

  const sendFrame = (event: ClientToRuntimeEvent) => {
    socket?.send(JSON.stringify(event));
  };

  const scheduleRoutingRetry = (retryAfterMs?: number) => {
    if (closed) return;
    routingAttempts += 1;
    const max = deps.maxRoutingRetries ?? DEFAULT_BACKOFF_MS.length;
    if (routingAttempts > max) {
      setError("routing-unavailable", "Companion Chat routing is unavailable.");
      return;
    }
    setConnection("retrying");
    const delayMs =
      retryAfterMs ??
      deps.backoffMs?.[routingAttempts - 1] ??
      DEFAULT_BACKOFF_MS[routingAttempts - 1] ??
      MAX_BACKOFF_MS;
    retryCancel = deps.schedule(() => {
      retryCancel = null;
      void routeAndOpen();
    }, delayMs);
  };

  const setConnection = (connectionState: ConnectionState) => {
    setState({ connectionState, error: null });
  };

  const setError = (kind: RuntimeAdapterError["kind"], message: string) => {
    closeSocket();
    setState({ connectionState: "error", error: { kind, message } });
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
    close,
  };
}
