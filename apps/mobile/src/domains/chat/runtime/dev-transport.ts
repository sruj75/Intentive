import { GetAgentResponse } from "@intentive/api-contract";
import { companion_message, hello_ok } from "@intentive/protocol";

import {
  createRuntimeAdapter,
  defaultResolveTimeZone,
  type WebSocketLike,
} from "./runtime-adapter.js";

declare const setTimeout: (fn: () => void, delayMs: number) => TimerHandle;
declare const clearTimeout: (timer: TimerHandle) => void;

type TimerHandle = unknown;

export function createDevRuntimeAdapter() {
  let nextId = 1;
  return createRuntimeAdapter({
    baseUrl: "dev://control-plane",
    getUserJwt: async () => "dev-user-jwt",
    fetch: async () => ({
      ok: true,
      status: 200,
      async json() {
        return GetAgentResponse.parse({
          agent_instance_id: "dev-agent",
          ws_url: "wss://dev-runtime.invalid/session",
          runtime_jwt: "dev-runtime-jwt",
        });
      },
    }),
    createWebSocket: () => new DevRuntimeSocket(),
    clientVersion: "dev",
    now: () => new Date().toISOString(),
    id: () => `dev-user-${nextId++}`,
    schedule: (fn, delayMs) => {
      const timer = setTimeout(fn, delayMs);
      return { cancel: () => clearTimeout(timer) };
    },
    resolveTimeZone: defaultResolveTimeZone,
    backoffMs: [20, 40, 80],
  });
}

class DevRuntimeSocket implements WebSocketLike {
  onopen: (() => void) | null = null;
  onmessage: ((event: { readonly data: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: (() => void) | null = null;

  private replyId = 1;
  private readonly timers = new Set<TimerHandle>();

  constructor() {
    this.defer(() => this.onopen?.(), 0);
  }

  send(data: string): void {
    const event = JSON.parse(data) as { readonly type?: string; readonly body?: string };
    if (event.type === "connect") {
      this.defer(() => {
        this.emit(
          hello_ok.parse({
            type: "hello_ok",
            session_snapshot: {
              messages: [
                {
                  message_id: "dev-opening",
                  author: "companion",
                  body: "Hey, I'm your Intentive companion. This dev runtime is ready.",
                  at: new Date().toISOString(),
                  via_post_message_back: false,
                },
              ],
              before_cursor: null,
            },
          }),
        );
      }, 0);
      return;
    }

    if (event.type === "user_message") {
      this.defer(() => {
        this.emit(
          companion_message.parse({
            type: "companion_message",
            message_id: `dev-companion-${this.replyId++}`,
            body: `I heard: ${event.body ?? ""}`,
            emitted_at: new Date().toISOString(),
            via_post_message_back: false,
          }),
        );
      }, 40);
    }
  }

  close(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }

  private emit(frame: unknown) {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }

  private defer(fn: () => void, delayMs: number) {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      fn();
    }, delayMs);
    this.timers.add(timer);
  }
}
