/** Companion Chat route — thin shell plus runtime composition for the chat domain. */
import { useMemo, useState, useSyncExternalStore } from "react";

import { createControlPlaneAccountStateSource } from "../../src/providers/account-state";
import { useAuthAdapter } from "../../src/domains/auth/ui/auth-context";
import { AccountSurface } from "../../src/domains/account/ui/account-surface";
import { createDevRuntimeAdapter } from "../../src/domains/chat/runtime/dev-transport";
import {
  createRuntimeAdapter,
  defaultResolveTimeZone,
  type WebSocketLike,
} from "../../src/domains/chat/runtime/runtime-adapter";
import { CompanionChat } from "../../src/domains/chat/ui/companion-chat";

export default function ChatRoute(): React.JSX.Element {
  const authAdapter = useAuthAdapter();
  const [accountVisible, setAccountVisible] = useState(false);
  const baseUrl = process.env.EXPO_PUBLIC_CONTROL_PLANE_BASE_URL ?? "";
  const adapter = useMemo(() => {
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
      resolveTimeZone: defaultResolveTimeZone,
    });
  }, [authAdapter, baseUrl]);

  const accountStateSource = useMemo(
    () =>
      createControlPlaneAccountStateSource({
        baseUrl,
        getUserJwt: () => authAdapter.getUserJwt(),
        fetch: (url, init) => globalThis.fetch(url, init),
      }),
    [authAdapter, baseUrl],
  );
  const runtimeState = useSyncExternalStore(adapter.subscribe, adapter.getState, adapter.getState);

  return (
    <>
      <CompanionChat adapter={adapter} onOpenAccount={() => setAccountVisible(true)} />
      <AccountSurface
        accountStateSource={accountStateSource}
        controlPlaneBaseUrl={baseUrl}
        onSignOut={() => authAdapter.signOut()}
        runtimeConnectionState={runtimeState.connectionState}
        visible={accountVisible}
        onClose={() => setAccountVisible(false)}
      />
    </>
  );
}
