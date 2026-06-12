/** Companion Chat route — thin shell plus runtime composition for the chat domain. */
import { useMemo } from "react";

import { useAuthAdapter } from "../../src/domains/auth/ui/auth-context";
import { createDevRuntimeAdapter } from "../../src/domains/chat/runtime/dev-transport";
import {
  createRuntimeAdapter,
  type WebSocketLike,
} from "../../src/domains/chat/runtime/runtime-adapter";
import { CompanionChat } from "../../src/domains/chat/ui/companion-chat";

export default function ChatRoute(): React.JSX.Element {
  const authAdapter = useAuthAdapter();
  const adapter = useMemo(() => {
    const baseUrl = process.env.EXPO_PUBLIC_CONTROL_PLANE_BASE_URL ?? "";
    if (baseUrl.trim().length === 0) return createDevRuntimeAdapter();

    return createRuntimeAdapter({
      baseUrl,
      getUserJwt: () => authAdapter.getUserJwt(),
      fetch: (url, init) => globalThis.fetch(url, init),
      createWebSocket: (url) => new WebSocket(url) as unknown as WebSocketLike,
      clientVersion: "mobile-v1",
      now: () => new Date().toISOString(),
      id: () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
      schedule: (fn, delayMs) => {
        const timer = setTimeout(fn, delayMs);
        return { cancel: () => clearTimeout(timer) };
      },
    });
  }, [authAdapter]);

  return <CompanionChat adapter={adapter} />;
}
